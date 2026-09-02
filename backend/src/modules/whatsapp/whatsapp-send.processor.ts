import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { SupabaseService } from "../../database/supabase.service";
import { isThrottleError, WahaHttpClient } from "./waha.client";
import { decideSend, jitterMs, nextRetryAt, rateLimitFromEnv, type RateLimitConfig } from "./whatsapp-rate-limit";
import { WhatsappWebhookService } from "./whatsapp-webhook.service";
import { WhatsappService, type ConnectionRow } from "./whatsapp.service";

/** Kuyrukta bundan eski bekleyen mesaj artık gönderilmez (deadline-reminder ile aynı gerekçe). */
const MAX_QUEUE_AGE_MS = 6 * 60 * 60 * 1000;
/** 463/475 görülünce bağlantının ne kadar duraklatılacağı. */
const THROTTLE_PAUSE_MS = 6 * 60 * 60 * 1000;
/** Bir turda bağlantı başına en fazla bu kadar mesaj ele alınır. */
const BATCH_SIZE = 20;
const TIMEZONE = process.env.TZ?.trim() || "Europe/Istanbul";

/**
 * Giden WhatsApp mesajlarının kuyruk işleyicisi.
 *
 * Repoda kuyruk altyapısı yok (BullMQ bağımlılığı var ama kullanılmıyor,
 * Redis yok); deadline-reminder.processor.ts gibi dakikalık @Cron ile
 * veritabanı tablosu taranıyor. Dakikada en fazla 8 mesaj (bkz.
 * whatsapp-rate-limit.ts) olduğu için dakikalık tarama yeterli.
 *
 * Neden burada, bildirim anında değil: gönderimler arası jitter, tavanlar ve
 * sessiz saat tek bir yerden uygulanmalı; bildirim üreten 40 modülün her biri
 * bunu bilmek zorunda kalmamalı.
 */
@Injectable()
export class WhatsappSendProcessor {
  private readonly logger = new Logger(WhatsappSendProcessor.name);
  private readonly config: RateLimitConfig = rateLimitFromEnv();
  private running = false;

  constructor(
    private supabase: SupabaseService,
    private waha: WahaHttpClient,
    private whatsapp: WhatsappService,
    private webhook: WhatsappWebhookService
  ) {}

  @Cron("* * * * *")
  async tick(): Promise<void> {
    if (!this.whatsapp.isConfigured()) return;
    // Jitter'lı gönderimler bir dakikayı aşabilir; üst üste binen turlar
    // aynı satırı iki kez ele almasın.
    if (this.running) return;
    this.running = true;
    try {
      await this.webhook.processPending();
      await this.processQueue();
    } catch (e) {
      this.logger.error(`WhatsApp kuyruğu: ${e instanceof Error ? e.message : e}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * Durum uzlaştırma: webhook kaçtıysa (backend kapalıyken kopan oturum)
   * WAHA'ya sorulur. Otomatik yeniden başlatma YOK — yalnızca durum yazılır.
   */
  @Cron("*/5 * * * *")
  async reconcile(): Promise<void> {
    if (!this.whatsapp.isConfigured()) return;
    const { data: rows } = await this.supabase.client
      .from("whatsapp_connections")
      .select("*")
      .eq("is_active", true)
      .neq("status", "stopped");
    for (const row of (rows ?? []) as ConnectionRow[]) {
      try {
        const info = await this.waha.getSession(row.session_name);
        const status = info ? WhatsappService.mapWahaStatus(info.status) : "stopped";
        const patch: Record<string, unknown> = {};
        if (status !== row.status) patch.status = status;

        // WAHA oturum bilgisinde WhatsApp'ın kısıt durumunu da veriyor; gönderim
        // hatası beklemeden duraklatılır (bitiş anı WhatsApp'tan, tahmin değil).
        const throttle = throttleFromSession(info);
        if (throttle && (!row.paused_until || new Date(row.paused_until).getTime() < throttle.until.getTime())) {
          patch.paused_until = throttle.until.toISOString();
          patch.pause_reason = throttle.reason;
        }

        if (Object.keys(patch).length > 0) {
          patch.last_status_at = new Date().toISOString();
          const updated = await this.whatsapp.updateConnection(row.id, patch);
          this.whatsapp.pushStatus(updated);
          this.logger.warn(`Bağlantı uzlaştırıldı: ${row.session_name} ${JSON.stringify(patch)}`);
        }
      } catch (e) {
        this.logger.warn(`Durum sorgusu başarısız (${row.session_name}): ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  private async processQueue(): Promise<void> {
    const { data: connections } = await this.supabase.client
      .from("whatsapp_connections")
      .select("*")
      .eq("is_active", true)
      .eq("status", "working");
    for (const conn of (connections ?? []) as ConnectionRow[]) {
      await this.processConnection(conn);
    }
  }

  private async processConnection(conn: ConnectionRow): Promise<void> {
    const now = new Date();
    const { data: queued } = await this.supabase.client
      .from("whatsapp_messages")
      .select("id, thread_id, body, attempt_count, created_at, whatsapp_threads!inner(connection_id, contact_id, whatsapp_contacts(wa_jid, opt_in_state, last_inbound_at))")
      .eq("status", "queued")
      .eq("whatsapp_threads.connection_id", conn.id)
      .or(`next_attempt_at.is.null,next_attempt_at.lte.${now.toISOString()}`)
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);
    if (!queued?.length) return;

    const counters = await this.loadCounters(conn.id, now);
    let sentThisRun = 0;

    for (const row of queued as any[]) {
      const thread = row.whatsapp_threads;
      const contact = thread?.whatsapp_contacts;

      if (now.getTime() - new Date(row.created_at).getTime() > MAX_QUEUE_AGE_MS) {
        await this.markFailed(row.id, "stale", "Kuyrukta 6 saatten uzun bekledi");
        continue;
      }
      if (!contact || contact.opt_in_state !== "opted_in" || !contact.last_inbound_at) {
        await this.markFailed(row.id, "not_opted_in", "Kişi bildirim almıyor");
        continue;
      }

      const decision = decideSend(this.config, {
        sentLastMinute: counters.lastMinute + sentThisRun,
        sentLastHour: counters.lastHour + sentThisRun,
        sentToday: counters.lastDay + sentThisRun,
        sentToContactToday: counters.perContact.get(thread.contact_id) ?? 0,
        warmupStartedAt: conn.warmup_started_at ? new Date(conn.warmup_started_at) : null,
        pausedUntil: conn.paused_until ? new Date(conn.paused_until) : null,
        localHour: localHour(TIMEZONE, now),
        now,
      });
      if (decision.allowed === false) {
        const reason = decision.reason;
        if (reason === "per_contact") continue; // yalnızca bu kişi doldu, diğerleri gidebilir
        this.logger.debug(`Gönderim bekletildi (${conn.session_name}): ${reason}`);
        return; // bağlantı geneli sınır: bu tur bitti
      }

      // Satırı sahiplen: iki tur aynı mesajı almasın.
      const { data: claimed } = await this.supabase.client
        .from("whatsapp_messages")
        .update({ status: "sending" })
        .eq("id", row.id)
        .eq("status", "queued")
        .select("id")
        .maybeSingle();
      if (!claimed) continue;

      const chatId: string = contact.wa_jid;
      await sleep(jitterMs(this.config));
      try {
        await this.waha.startTyping(conn.session_name, chatId).catch(() => {});
        await sleep(Math.min(1500, Math.max(400, (row.body?.length ?? 0) * 25)));
        const result = await this.waha.sendText(conn.session_name, chatId, row.body);
        await this.waha.stopTyping(conn.session_name, chatId).catch(() => {});
        const sentAt = new Date().toISOString();
        await this.supabase.client
          .from("whatsapp_messages")
          .update({ status: "sent", wa_message_id: result.id, sent_at: sentAt, attempt_count: row.attempt_count + 1, error_code: null, error_detail: null })
          .eq("id", row.id);
        await this.supabase.client
          .from("whatsapp_threads")
          .update({ last_outbound_at: sentAt, last_message_at: sentAt, updated_at: sentAt })
          .eq("id", row.thread_id);
        sentThisRun++;
        counters.perContact.set(thread.contact_id, (counters.perContact.get(thread.contact_id) ?? 0) + 1);
      } catch (e) {
        const throttle = isThrottleError(e);
        if (throttle.throttled) {
          // Oturum sağlıklı ama WhatsApp gönderimi kısıtladı: mesaj kuyrukta
          // kalır, bağlantı duraklatılır, oturuma DOKUNULMAZ.
          const pausedUntil = new Date(Date.now() + THROTTLE_PAUSE_MS).toISOString();
          await this.supabase.client.from("whatsapp_messages").update({ status: "queued" }).eq("id", row.id);
          const updated = await this.whatsapp.updateConnection(conn.id, { paused_until: pausedUntil, pause_reason: throttle.reason });
          this.whatsapp.pushStatus(updated);
          this.logger.warn(`WhatsApp kısıtı (${conn.session_name}): ${throttle.reason}; ${pausedUntil}'e kadar duraklatıldı`);
          return;
        }
        const attempts = row.attempt_count + 1;
        const retryAt = nextRetryAt(attempts, new Date());
        const detail = (e instanceof Error ? e.message : String(e)).slice(0, 500);
        if (retryAt) {
          await this.supabase.client
            .from("whatsapp_messages")
            .update({ status: "queued", attempt_count: attempts, next_attempt_at: retryAt.toISOString(), error_detail: detail })
            .eq("id", row.id);
        } else {
          await this.markFailed(row.id, "send_error", detail, attempts);
        }
        this.logger.warn(`WhatsApp gönderimi başarısız (${conn.session_name}, deneme ${attempts}): ${detail}`);
      }
    }
  }

  private async markFailed(id: string, code: string, detail: string, attemptCount?: number): Promise<void> {
    const patch: Record<string, unknown> = { status: "failed", error_code: code, error_detail: detail };
    if (attemptCount !== undefined) patch.attempt_count = attemptCount;
    await this.supabase.client.from("whatsapp_messages").update(patch).eq("id", id);
  }

  /** Son 24 saatte bu bağlantıdan giden mesajlar; dakika/saat/gün/kişi sayaçları. */
  private async loadCounters(connectionId: string, now: Date) {
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const { data } = await this.supabase.client
      .from("whatsapp_messages")
      .select("sent_at, whatsapp_threads!inner(connection_id, contact_id)")
      .eq("direction", "outbound")
      .eq("whatsapp_threads.connection_id", connectionId)
      .gte("sent_at", since);
    const minuteAgo = now.getTime() - 60_000;
    const hourAgo = now.getTime() - 3_600_000;
    const counters = { lastMinute: 0, lastHour: 0, lastDay: 0, perContact: new Map<string, number>() };
    for (const row of (data ?? []) as any[]) {
      const t = new Date(row.sent_at).getTime();
      counters.lastDay++;
      if (t >= hourAgo) counters.lastHour++;
      if (t >= minuteAgo) counters.lastMinute++;
      const contactId = row.whatsapp_threads?.contact_id;
      if (contactId) counters.perContact.set(contactId, (counters.perContact.get(contactId) ?? 0) + 1);
    }
    return counters;
  }
}

/** GET /api/sessions/{name} yanıtındaki me.reachoutTimelock / me.messageCapping → duraklatma. */
export function throttleFromSession(info: { me?: any } | null): { until: Date; reason: string } | null {
  const me = info?.me;
  if (!me) return null;
  const lock = me.reachoutTimelock;
  if (lock?.isActive && typeof lock.timeEnforcementEnds === "number") {
    return { until: new Date(lock.timeEnforcementEnds * 1000), reason: "463 reachout timelock" };
  }
  const cap = me.messageCapping;
  if (cap?.cappingStatus === "CAPPED" && typeof cap.cycleEnd === "number") {
    return { until: new Date(cap.cycleEnd * 1000), reason: "475 message capping" };
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Verilen zaman diliminde saat (0–23). Sessiz saat kararı için. */
export function localHour(timeZone: string, now: Date): number {
  try {
    const text = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(now);
    const n = Number(text);
    return Number.isFinite(n) ? n % 24 : now.getHours();
  } catch {
    return now.getHours();
  }
}
