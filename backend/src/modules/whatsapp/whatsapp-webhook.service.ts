import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { SupabaseService } from "../../database/supabase.service";
import { NotificationsService } from "../notifications/notifications.service";
import { WahaHttpClient } from "./waha.client";
import { WhatsappLioService } from "./whatsapp-lio.service";
import { AUTO_REPLIES, confirmPrompt, parseInboundCommand } from "./whatsapp-optin";
import { isGroupJid, isLidJid, jidToE164, maskPhone } from "./whatsapp-phone";
import { WhatsappService, type ConnectionRow, type ContactRow, type ThreadRow } from "./whatsapp.service";

/** WAHA webhook zarfı — yalnızca kullandığımız alanlar. */
export interface WahaWebhookEnvelope {
  id?: string;
  event?: string;
  session?: string;
  timestamp?: number;
  me?: { id?: string; pushName?: string } | null;
  engine?: string;
  payload?: any;
}

/** Ack adı → mesaj durumu. Sıra önemli: geri gidiş yok (read → delivered olmaz). */
const ACK_RANK: Record<string, number> = { queued: 0, sending: 1, sent: 2, delivered: 3, read: 4 };
const ACK_NAME_TO_STATUS: Record<string, "sent" | "delivered" | "read" | "failed"> = {
  SERVER: "sent",
  DEVICE: "delivered",
  READ: "read",
  PLAYED: "read",
  ERROR: "failed",
};

/**
 * WAHA'dan gelen olayların işlenmesi.
 *
 * İki aşama: controller ham olayı `whatsapp_webhook_events`'e yazıp hemen 200
 * döner; işleme burada, ayrı adımda. event_id unique olduğu için aynı olay
 * iki kez gelse de bir kez işlenir.
 *
 * Gelen mesajın yönlendirmesi (havuz modeli):
 *   - Gönderen, bir Projelio kullanıcısının telefonu (kind=user) → bildirim
 *     akışı: yalnız komutlar tanınır (kod / DUR / BAŞLAT), otomatik yanıt.
 *   - Aksi hâlde müşteri (kind=customer): konuşma sahibine uygulama içi
 *     bildirim; Lio otomatik yanıt açıksa Lio cevaplar. Sahipsizse (müşteri
 *     ilk kez, kimse başlatmamış) yöneticilere bildirim.
 */
@Injectable()
export class WhatsappWebhookService {
  private readonly logger = new Logger(WhatsappWebhookService.name);
  private processing = false;

  constructor(
    private supabase: SupabaseService,
    private waha: WahaHttpClient,
    private whatsapp: WhatsappService,
    private lio: WhatsappLioService,
    @Inject(forwardRef(() => NotificationsService)) private notifications: NotificationsService
  ) {}

  /** Ham olayı saklar. Zaten varsa false döner (tekrar teslim). */
  async store(envelope: WahaWebhookEnvelope): Promise<boolean> {
    const eventId = envelope.id ?? `${envelope.session}:${envelope.event}:${envelope.timestamp ?? Date.now()}`;
    const { error } = await this.supabase.client.from("whatsapp_webhook_events").insert({
      event_id: eventId,
      session_name: envelope.session ?? "",
      event: envelope.event ?? "",
      payload: envelope,
    });
    if (error) {
      if (error.code === "23505") return false;
      throw error;
    }
    return true;
  }

  /** Bekleyen olayları sırayla işler; aynı anda tek çalıştırıcı. */
  async processPending(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      const { data: events, error } = await this.supabase.client
        .from("whatsapp_webhook_events")
        .select("id, event_id, session_name, event, payload")
        .is("processed_at", null)
        .order("received_at", { ascending: true })
        .limit(100);
      if (error) {
        this.logger.error(`Webhook kuyruğu okunamadı: ${error.message}`);
        return;
      }
      for (const row of events ?? []) {
        try {
          await this.handle(row.payload as WahaWebhookEnvelope);
          await this.supabase.client
            .from("whatsapp_webhook_events")
            .update({ processed_at: new Date().toISOString(), error: null })
            .eq("id", row.id);
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          this.logger.warn(`Webhook olayı işlenemedi (${row.event}): ${message}`);
          // İşlendi sayılır ama hata yazılır: aynı olayda sürekli patlayıp
          // arkadakileri tıkamasın. Olayın kendisi tabloda duruyor.
          await this.supabase.client
            .from("whatsapp_webhook_events")
            .update({ processed_at: new Date().toISOString(), error: message.slice(0, 500) })
            .eq("id", row.id);
        }
      }
    } finally {
      this.processing = false;
    }
  }

  private async handle(envelope: WahaWebhookEnvelope): Promise<void> {
    if (!envelope.session) return;
    const conn = await this.whatsapp.findConnectionBySession(envelope.session);
    if (!conn) {
      this.logger.warn(`Bilinmeyen oturumdan olay: ${envelope.session}`);
      return;
    }
    switch (envelope.event) {
      case "session.status":
        return this.onSessionStatus(conn, envelope);
      case "message":
        return this.onMessage(conn, envelope.payload ?? {});
      case "message.ack":
        return this.onAck(envelope.payload ?? {});
      default:
        return;
    }
  }

  // ---------------------------------------------------------------- oturum durumu

  private async onSessionStatus(conn: ConnectionRow, envelope: WahaWebhookEnvelope): Promise<void> {
    const status = WhatsappService.mapWahaStatus(envelope.payload?.status);
    const patch: Record<string, unknown> = { status, last_status_at: new Date().toISOString() };
    if (envelope.engine) patch.engine = envelope.engine;

    if (status === "working") {
      let me = envelope.me ?? null;
      if (!me?.id) me = (await this.waha.getSession(conn.session_name))?.me ?? null;
      const phone = jidToE164(me?.id);
      if (phone) patch.phone_e164 = phone;
      if (me?.pushName) patch.push_name = me.pushName;
      patch.last_connected_at = new Date().toISOString();
      if (!conn.warmup_started_at) patch.warmup_started_at = new Date().toISOString();
      this.logger.log(`WhatsApp bağlandı: ${conn.session_name} ${maskPhone(phone)}`);
    }

    const updated = await this.whatsapp.updateConnection(conn.id, patch);
    this.whatsapp.pushStatus(updated);
  }

  // ---------------------------------------------------------------- gelen mesaj

  private async onMessage(conn: ConnectionRow, payload: any): Promise<void> {
    if (payload.fromMe) return;
    const from: string | undefined = payload.from;
    if (!from || isGroupJid(from)) return;

    let phone = jidToE164(from);
    if (!phone && isLidJid(from)) {
      // GOWS 2026.8+ gizli kimliğin (LID) telefon adresini yükün içinde de
      // veriyor; önce oraya bakılır, yoksa WAHA'ya sorulur.
      const senderAlt: unknown = payload?._data?.Info?.SenderAlt;
      phone = jidToE164(typeof senderAlt === "string" ? senderAlt : null);
      if (!phone) phone = jidToE164(await this.waha.resolveLid(conn.session_name, from));
    }
    if (!phone) {
      this.logger.warn(`Gönderen numarası çözülemedi: ${from}`);
      return;
    }

    const now = new Date().toISOString();
    const displayName: string | null = payload?._data?.pushName ?? payload?._data?.notifyName ?? payload?.notifyName ?? null;
    const body: string = typeof payload.body === "string" ? payload.body : "";
    const command = parseInboundCommand(body);

    // Kişi: kayıtlıysa türü korunur; ilk kez yazan biri eşleştirme kodu
    // gönderiyorsa kullanıcıdır, yoksa müşteri.
    const contact = await this.whatsapp.upsertContact(conn.id, phone, {
      kind: command.kind === "link" ? "user" : "customer",
      display_name: displayName,
      last_inbound_at: now,
    });
    // Bekleyen aday varken gelen EVET, kullanıcı akışına girer (bkz. 082).
    const isConfirmingPending = command.kind === "confirm" && Boolean(contact.pending_user_id);
    const isUserPhone = contact.kind === "user" || Boolean(contact.user_id) || command.kind === "link" || isConfirmingPending;
    const thread = await this.whatsapp.ensureThread(conn.id, contact.id, {
      kind: isUserPhone ? "notification" : "customer",
      owner_user_id: contact.user_id ?? null,
      title: displayName,
    });

    const { error: insertError } = await this.supabase.client.from("whatsapp_messages").insert({
      thread_id: thread.id,
      direction: "inbound",
      wa_message_id: payload.id ?? null,
      body: body || (payload.hasMedia ? "[medya]" : null),
      status: "received",
    });
    // Aynı mesaj ikinci kez geldiyse komutu da ikinci kez işlemeyelim.
    if (insertError) {
      if (insertError.code === "23505") return;
      throw insertError;
    }
    await this.supabase.client
      .from("whatsapp_threads")
      .update({ last_inbound_at: now, last_message_at: now, updated_at: now })
      .eq("id", thread.id);

    if (isUserPhone) return this.onUserMessage(conn, contact, thread, payload, command);

    // Kodsuz eşleşme: tanımadığımız bir telefon, tam bir kullanıcının profil
    // telefonuyla eşleşiyorsa önce "EVET yazın" denir; müşteri akışı bu
    // mesajda çalışmaz (kullanıcı kendi bildirim numarasını bağlıyor olabilir).
    if (!contact.user_id && !contact.pending_user_id) {
      const owner = await this.whatsapp.findProfilePhoneOwner(contact.phone_e164);
      if (owner) {
        await this.updateContact(contact.id, { pending_user_id: owner.id, pending_since: now });
        await this.waha.sendSeen(conn.session_name, contact.wa_jid, payload.id ? [payload.id] : undefined).catch(() => {});
        await this.sendImmediate(conn, thread.id, contact.wa_jid, confirmPrompt(owner.full_name));
        return;
      }
    }
    return this.onCustomerMessage(conn, contact, thread, body || "[medya]");
  }

  /** Projelio kullanıcısının kendi telefonundan gelen mesaj: yalnız komutlar. */
  private async onUserMessage(
    conn: ConnectionRow,
    contact: ContactRow,
    thread: ThreadRow,
    payload: any,
    command: ReturnType<typeof parseInboundCommand>
  ): Promise<void> {
    if (command.kind === "none") return;
    const now = new Date().toISOString();
    const chatId = contact.wa_jid;
    await this.waha.sendSeen(conn.session_name, chatId, payload.id ? [payload.id] : undefined).catch(() => {});

    let reply: string;
    let linkedUserId: string | undefined;
    switch (command.kind) {
      case "link": {
        const userId = await this.consumeLinkCode(command.code, conn.id);
        if (!userId) {
          reply = AUTO_REPLIES.linkCodeInvalid;
          break;
        }
        await this.updateContact(contact.id, {
          kind: "user",
          user_id: userId,
          opt_in_state: "opted_in",
          opt_in_source: "link_code",
          opt_in_at: now,
          opt_out_at: null,
        });
        await this.supabase.client.from("whatsapp_threads").update({ owner_user_id: userId, kind: "notification" }).eq("id", thread.id);
        linkedUserId = userId;
        reply = AUTO_REPLIES.linked;
        break;
      }
      case "confirm": {
        const userId = contact.pending_user_id;
        if (!userId) return; // bekleyen aday yok: sıradan mesaj, yanıt verme
        await this.updateContact(contact.id, {
          kind: "user",
          user_id: userId,
          pending_user_id: null,
          pending_since: null,
          opt_in_state: "opted_in",
          opt_in_source: "profile_phone",
          opt_in_at: now,
          opt_out_at: null,
        });
        await this.supabase.client.from("whatsapp_threads").update({ owner_user_id: userId, kind: "notification" }).eq("id", thread.id);
        linkedUserId = userId;
        reply = AUTO_REPLIES.linked;
        break;
      }
      case "opt_out":
        await this.updateContact(contact.id, { opt_in_state: "opted_out", opt_out_at: now });
        linkedUserId = contact.user_id ?? undefined;
        reply = AUTO_REPLIES.optedOut;
        break;
      case "opt_in":
        if (!contact.user_id) {
          reply = AUTO_REPLIES.optInUnknown;
          break;
        }
        await this.updateContact(contact.id, { opt_in_state: "opted_in", opt_in_source: "keyword", opt_in_at: now, opt_out_at: null });
        linkedUserId = contact.user_id;
        reply = AUTO_REPLIES.optedIn;
        break;
    }

    await this.sendImmediate(conn, thread.id, chatId, reply);
    // Kullanıcının Ayarlar sayfası açıksa "bağlandı"yı anında görsün.
    if (linkedUserId) this.whatsapp.pushStatus(conn, linkedUserId);
  }

  /**
   * Müşteriden gelen mesaj: sahibine bildirim; Lio otomatik yanıt açıksa Lio
   * cevaplar. Sahipsiz konuşma (kimse başlatmamış, müşteri ilk yazan) → tüm
   * yöneticilere bildirim; ilk yanıtlayan sahiplenir.
   */
  private async onCustomerMessage(conn: ConnectionRow, contact: ContactRow, thread: ThreadRow, body: string): Promise<void> {
    const who = contact.display_name ?? maskPhone(contact.phone_e164);
    const preview = body.length > 140 ? body.slice(0, 137) + "…" : body;
    const recipients = thread.owner_user_id ? [thread.owner_user_id] : await this.adminUserIds();
    for (const userId of recipients) {
      void this.notifications.notifyUser(
        userId,
        "whatsapp_inbound",
        `WhatsApp · ${who}`,
        thread.owner_user_id ? preview : `Sahipsiz konuşma (${conn.label ?? "havuz"}): ${preview}`,
        "/settings?tab=baglantilar"
      );
    }
    if (thread.lio_auto_reply && thread.owner_user_id) {
      await this.lio.replyToInbound(thread, contact, conn, body).catch((e) => {
        this.logger.warn(`Lio otomatik yanıt başarısız (${thread.id}): ${e instanceof Error ? e.message : e}`);
      });
    }
  }

  private async adminUserIds(): Promise<string[]> {
    const { data } = await this.supabase.client.from("users").select("id").eq("role", "admin");
    return ((data ?? []) as any[]).map((u) => u.id);
  }

  private async updateContact(id: string, patch: Record<string, unknown>): Promise<void> {
    const { error } = await this.supabase.client
      .from("whatsapp_contacts")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  }

  /** Kodu tüketir; geçerliyse kullanıcı kimliğini döner. Kod bu numaraya ait olmalı. */
  private async consumeLinkCode(code: string, connectionId: string): Promise<string | null> {
    const { data } = await this.supabase.client
      .from("whatsapp_link_codes")
      .select("code, user_id, expires_at, used_at, connection_id")
      .eq("code", code)
      .maybeSingle();
    if (!data) return null;
    const row = data as any;
    if (row.used_at || new Date(row.expires_at).getTime() < Date.now()) return null;
    if (row.connection_id && row.connection_id !== connectionId) return null;
    const { data: claimed } = await this.supabase.client
      .from("whatsapp_link_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("code", code)
      .is("used_at", null)
      .select("user_id")
      .maybeSingle();
    return claimed ? (claimed as any).user_id : null;
  }

  /** Otomatik yanıt: doğrudan gönderilir ve giden mesaj olarak kaydedilir. */
  private async sendImmediate(conn: ConnectionRow, threadId: string, chatId: string, text: string): Promise<void> {
    const now = new Date().toISOString();
    try {
      const result = await this.waha.sendText(conn.session_name, chatId, text);
      await this.supabase.client.from("whatsapp_messages").insert({
        thread_id: threadId,
        direction: "outbound",
        wa_message_id: result.id,
        body: text,
        status: "sent",
        sent_by: "system",
        attempt_count: 1,
        sent_at: now,
      });
      await this.supabase.client.from("whatsapp_threads").update({ last_outbound_at: now, last_message_at: now, updated_at: now }).eq("id", threadId);
    } catch (e) {
      this.logger.warn(`Otomatik yanıt gönderilemedi: ${e instanceof Error ? e.message : e}`);
    }
  }

  // ---------------------------------------------------------------- teslimat

  private async onAck(payload: any): Promise<void> {
    const id: string | undefined = typeof payload.id === "string" ? payload.id : payload.id?._serialized;
    const ackName: string | undefined = payload.ackName;
    if (!id || !ackName) return;
    const status = ACK_NAME_TO_STATUS[ackName];
    if (!status) return;

    const { data: existing } = await this.supabase.client
      .from("whatsapp_messages")
      .select("id, status")
      .eq("wa_message_id", id)
      .maybeSingle();
    if (!existing) return;
    const current = (existing as any).status as string;
    if (status !== "failed" && (ACK_RANK[status] ?? 0) <= (ACK_RANK[current] ?? 0)) return;

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { status };
    if (status === "delivered") patch.delivered_at = now;
    if (status === "read") {
      patch.read_at = now;
      if (current !== "delivered") patch.delivered_at = now;
    }
    if (status === "failed") patch.error_code = "ack_error";
    await this.supabase.client.from("whatsapp_messages").update(patch).eq("id", (existing as any).id);
  }
}
