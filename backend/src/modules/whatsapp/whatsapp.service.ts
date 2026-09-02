import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomInt } from "node:crypto";
import type {
  NotificationPayload,
  WhatsappConnectionSummary,
  WhatsappLinkCode,
  WhatsappMessage,
  WhatsappOrganizationView,
  WhatsappOverview,
  WhatsappStatusEvent,
} from "@projelio/shared";
import { AccessService } from "../../common/access/access.service";
import { SupabaseService } from "../../database/supabase.service";
import { NotificationsGateway } from "../notifications/notifications.gateway";
import { WahaHttpClient, type WahaSessionStatus } from "./waha.client";
import { decideConnectionAccess } from "./whatsapp-access";
import { formatNotificationText, shouldSendOverWhatsapp } from "./whatsapp-notification-types";
import { buildLinkUrl, generateLinkCode } from "./whatsapp-optin";
import { e164ToJid, maskPhone, normalizePhoneE164 } from "./whatsapp-phone";
import { getWebAppUrl } from "../../common/config/env";

/** Eşleştirme kodu geçerlilik süresi. */
const LINK_CODE_TTL_MS = 24 * 60 * 60 * 1000;

/** WAHA'ya abone olduğumuz olaylar; başka olay gelirse webhook onu yok sayar. */
export const WEBHOOK_EVENTS = ["session.status", "message", "message.ack"];

export type ConnectionRow = {
  id: string;
  organization_id: string;
  session_name: string;
  status: WhatsappConnectionSummary["status"];
  engine: string | null;
  phone_e164: string | null;
  push_name: string | null;
  linked_by_user_id: string | null;
  last_connected_at: string | null;
  warmup_started_at: string | null;
  paused_until: string | null;
  pause_reason: string | null;
  is_active: boolean;
};

/**
 * WhatsApp köprüsünün iş mantığı: bağlantı yaşam döngüsü, kişi/eşleştirme,
 * bildirimi kuyruğa alma. WAHA ile konuşma WahaHttpClient'ta, gelen olaylar
 * WhatsappWebhookService'te, gönderim WhatsappSendProcessor'da.
 */
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    private supabase: SupabaseService,
    private waha: WahaHttpClient,
    private access: AccessService,
    @Inject(forwardRef(() => NotificationsGateway)) private gateway: NotificationsGateway
  ) {}

  // ================================================================ yapılandırma

  isConfigured(): boolean {
    return this.waha.isConfigured() && Boolean(process.env.WAHA_WEBHOOK_HMAC) && Boolean(process.env.WHATSAPP_WEBHOOK_URL);
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) throw new ServiceUnavailableException("WhatsApp köprüsü sunucuda yapılandırılmamış");
  }

  sessionName(organizationId: string): string {
    return `org_${organizationId}`;
  }

  // ================================================================ görünüm

  async overviewForUser(userId: string): Promise<WhatsappOverview> {
    const configured = this.isConfigured();
    if (!configured) return { configured, organizations: [] };

    const orgs = await this.organizationsForUser(userId);
    if (orgs.length === 0) return { configured, organizations: [] };

    const orgIds = orgs.map((o) => o.id);
    const [{ data: connections }, { data: contacts }] = await Promise.all([
      this.supabase.client.from("whatsapp_connections").select("*").in("organization_id", orgIds).eq("is_active", true),
      this.supabase.client
        .from("whatsapp_contacts")
        .select("organization_id, phone_e164, opt_in_state")
        .in("organization_id", orgIds)
        .eq("user_id", userId),
    ]);

    const organizations: WhatsappOrganizationView[] = orgs.map((org) => {
      const conn = (connections ?? []).find((c: any) => c.organization_id === org.id) as ConnectionRow | undefined;
      const contact = (contacts ?? []).find((c: any) => c.organization_id === org.id) as any;
      return {
        organizationId: org.id,
        organizationName: org.name,
        canManage: org.owner_id === userId,
        connection: conn ? this.mapConnection(conn) : null,
        me: contact
          ? { optInState: contact.opt_in_state, phoneMasked: maskPhone(contact.phone_e164) }
          : { optInState: "not_linked" },
      };
    });

    return { configured, organizations };
  }

  /**
   * Kullanıcının görebildiği organizasyonlar: sahibi olduğu + üyesi olduğu +
   * bir departmanında olduğu. OrganizationsService.findAllForUser ile aynı
   * küme; oradan almıyoruz çünkü o modül Notifications'ı, o da bizi içe
   * aktarıyor — üçlü döngüyü forwardRef'le taşımak yerine üç sorgu yazıldı.
   */
  private async organizationsForUser(userId: string): Promise<{ id: string; name: string; owner_id: string }[]> {
    const client = this.supabase.client;
    const [{ data: members }, { data: deptMembers }] = await Promise.all([
      client.from("organization_members").select("organization_id").eq("user_id", userId).eq("status", "approved"),
      client.from("department_members").select("departments(organization_id)").eq("user_id", userId).eq("status", "approved"),
    ]);
    const ids = new Set<string>();
    for (const m of members ?? []) ids.add((m as any).organization_id);
    for (const d of deptMembers ?? []) {
      const orgId = (d as any).departments?.organization_id;
      if (orgId) ids.add(orgId);
    }

    const { data: owned } = await client.from("organizations").select("id, name, owner_id").eq("owner_id", userId).is("archived_at", null);
    const result = new Map<string, { id: string; name: string; owner_id: string }>();
    for (const o of owned ?? []) result.set((o as any).id, o as any);

    const remaining = [...ids].filter((id) => !result.has(id));
    if (remaining.length > 0) {
      const { data: others } = await client.from("organizations").select("id, name, owner_id").in("id", remaining).is("archived_at", null);
      for (const o of others ?? []) result.set((o as any).id, o as any);
    }
    return [...result.values()].sort((a, b) => a.name.localeCompare(b.name, "tr"));
  }

  mapConnection(row: ConnectionRow): WhatsappConnectionSummary {
    return {
      id: row.id,
      organizationId: row.organization_id,
      status: row.status,
      engine: row.engine ?? undefined,
      phoneMasked: row.phone_e164 ? maskPhone(row.phone_e164) : undefined,
      pushName: row.push_name ?? undefined,
      lastConnectedAt: row.last_connected_at ?? undefined,
      pausedUntil: row.paused_until ?? undefined,
      pauseReason: row.pause_reason ?? undefined,
      linkedByUserId: row.linked_by_user_id ?? undefined,
    };
  }

  // ================================================================ bağlantı

  async findConnection(organizationId: string): Promise<ConnectionRow | null> {
    const { data } = await this.supabase.client
      .from("whatsapp_connections")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .maybeSingle();
    return (data as ConnectionRow | null) ?? null;
  }

  async findConnectionBySession(sessionName: string): Promise<ConnectionRow | null> {
    const { data } = await this.supabase.client.from("whatsapp_connections").select("*").eq("session_name", sessionName).maybeSingle();
    return (data as ConnectionRow | null) ?? null;
  }

  async updateConnection(id: string, patch: Record<string, unknown>): Promise<ConnectionRow> {
    const { data, error } = await this.supabase.client
      .from("whatsapp_connections")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data as ConnectionRow;
  }

  private async assertCanManage(organizationId: string, userId: string): Promise<void> {
    const access = await this.access.organizationAccess(organizationId, userId);
    if (!decideConnectionAccess(access).canManage) {
      throw new ForbiddenException("WhatsApp numarasını yalnızca organizasyon sahibi bağlayabilir");
    }
  }

  private webhookConfig() {
    return {
      url: process.env.WHATSAPP_WEBHOOK_URL!.trim(),
      events: WEBHOOK_EVENTS,
      hmacKey: process.env.WAHA_WEBHOOK_HMAC!.trim(),
    };
  }

  async startConnection(organizationId: string, userId: string): Promise<WhatsappConnectionSummary> {
    this.assertConfigured();
    await this.assertCanManage(organizationId, userId);

    const sessionName = this.sessionName(organizationId);
    let row = await this.findConnection(organizationId);
    if (!row) {
      const { data, error } = await this.supabase.client
        .from("whatsapp_connections")
        .insert({ organization_id: organizationId, session_name: sessionName, status: "starting", linked_by_user_id: userId })
        .select()
        .single();
      if (error) throw error;
      row = data as ConnectionRow;
    } else if (row.status === "working") {
      return this.mapConnection(row);
    } else {
      row = await this.updateConnection(row.id, {
        status: "starting",
        linked_by_user_id: userId,
        last_status_at: new Date().toISOString(),
      });
    }

    try {
      await this.waha.ensureSessionStarted(sessionName, this.webhookConfig());
    } catch (e) {
      this.logger.error(`WAHA oturumu başlatılamadı (${sessionName}): ${e instanceof Error ? e.message : e}`);
      row = await this.updateConnection(row.id, { status: "failed", last_status_at: new Date().toISOString() });
      throw new ServiceUnavailableException("WhatsApp köprüsüne ulaşılamadı");
    }
    return this.mapConnection(row);
  }

  async getQr(organizationId: string, userId: string): Promise<{ qr: string | null }> {
    this.assertConfigured();
    await this.assertCanManage(organizationId, userId);
    const row = await this.findConnection(organizationId);
    if (!row) throw new NotFoundException("Bağlantı yok");
    if (row.status === "working") throw new ConflictException("Numara zaten bağlı");
    return { qr: await this.waha.getQrDataUrl(row.session_name) };
  }

  async requestPairingCode(organizationId: string, userId: string, phone: string): Promise<{ code: string }> {
    this.assertConfigured();
    await this.assertCanManage(organizationId, userId);
    const e164 = normalizePhoneE164(phone);
    if (!e164) throw new BadRequestException("Telefon numarası anlaşılamadı");
    const row = await this.findConnection(organizationId);
    if (!row) throw new NotFoundException("Bağlantı yok");
    if (row.status !== "scan_qr") throw new ConflictException("Eşleştirme kodu yalnızca QR beklenirken istenebilir");
    const code = await this.waha.requestPairingCode(row.session_name, e164.replace(/^\+/, ""));
    return { code };
  }

  /**
   * Numarayı Projelio'dan ayırır. Satır silinmez (mesaj geçmişi FK ile
   * bağlı); durum stopped olur, numara alanı temizlenir. Kişilerin opt-in
   * durumu korunur: aynı numara yeniden bağlanırsa kimse yeniden kod almaz.
   */
  async logout(organizationId: string, userId: string): Promise<{ ok: true }> {
    this.assertConfigured();
    await this.assertCanManage(organizationId, userId);
    const row = await this.findConnection(organizationId);
    if (!row) return { ok: true };
    try {
      await this.waha.logoutSession(row.session_name);
    } catch (e) {
      this.logger.warn(`WAHA logout başarısız (${row.session_name}): ${e instanceof Error ? e.message : e}`);
    }
    try {
      await this.waha.stopSession(row.session_name);
    } catch {
      /* oturum zaten yoksa sorun değil */
    }
    const updated = await this.updateConnection(row.id, {
      status: "stopped",
      phone_e164: null,
      push_name: null,
      paused_until: null,
      pause_reason: null,
      last_status_at: new Date().toISOString(),
    });
    this.pushStatus(updated);
    return { ok: true };
  }

  /** WAHA durum enum'u → bizim durum. */
  static mapWahaStatus(status: WahaSessionStatus | string | undefined): ConnectionRow["status"] {
    switch (status) {
      case "WORKING":
        return "working";
      case "SCAN_QR_CODE":
        return "scan_qr";
      case "STARTING":
      // Telefon passkey onayı bekliyor: geçiş durumu, QR yok; arayüz
      // "hazırlanıyor" gösterir.
      case "PASSKEY_REQUIRED":
      case "PASSKEY_CONFIRMATION_REQUIRED":
        return "starting";
      case "FAILED":
        return "failed";
      default:
        return "stopped";
    }
  }

  /** Bağlantı durumunu bağlayan kişiye (yoksa organizasyon sahibine) iletir. */
  pushStatus(row: ConnectionRow, extraUserId?: string): void {
    const event: WhatsappStatusEvent = {
      organizationId: row.organization_id,
      status: row.status,
      phoneMasked: row.phone_e164 ? maskPhone(row.phone_e164) : undefined,
    };
    const targets = new Set<string>();
    if (row.linked_by_user_id) targets.add(row.linked_by_user_id);
    if (extraUserId) targets.add(extraUserId);
    for (const userId of targets) this.gateway.sendWhatsappStatus(userId, event);
  }

  // ================================================================ eşleştirme / opt-in

  async createLinkCode(organizationId: string, userId: string): Promise<WhatsappLinkCode> {
    this.assertConfigured();
    await this.access.assertCanViewOrganization(organizationId, userId);
    const row = await this.findConnection(organizationId);
    if (!row || row.status !== "working" || !row.phone_e164) {
      throw new ConflictException("Bu organizasyonda bağlı bir WhatsApp numarası yok");
    }

    // Eski, kullanılmamış kodlar geçersizleşsin: aynı anda tek geçerli kod.
    await this.supabase.client
      .from("whatsapp_link_codes")
      .update({ expires_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("organization_id", organizationId)
      .is("used_at", null);

    const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS).toISOString();
    // Çakışma olasılığı düşük (32^4) ama sıfır değil; birkaç kez denenir.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateLinkCode((max) => randomInt(max));
      const { error } = await this.supabase.client
        .from("whatsapp_link_codes")
        .insert({ code, organization_id: organizationId, user_id: userId, expires_at: expiresAt });
      if (!error) return { code, url: buildLinkUrl(row.phone_e164, code), expiresAt };
      if (error.code !== "23505") throw error;
    }
    throw new ConflictException("Kod üretilemedi, tekrar deneyin");
  }

  async optOutMe(organizationId: string, userId: string): Promise<{ ok: true }> {
    const { error } = await this.supabase.client
      .from("whatsapp_contacts")
      .update({ opt_in_state: "opted_out", opt_out_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("organization_id", organizationId)
      .eq("user_id", userId);
    if (error) throw error;
    return { ok: true };
  }

  // ================================================================ kişiler / mesajlar (yönetici)

  async listContacts(organizationId: string, userId: string) {
    await this.assertCanManage(organizationId, userId);
    const { data, error } = await this.supabase.client
      .from("whatsapp_contacts")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((c: any) => ({
      id: c.id,
      organizationId: c.organization_id,
      phoneMasked: maskPhone(c.phone_e164),
      displayName: c.display_name ?? undefined,
      userId: c.user_id ?? undefined,
      optInState: c.opt_in_state,
      lastInboundAt: c.last_inbound_at ?? undefined,
      createdAt: c.created_at,
    }));
  }

  async listThreadMessages(threadId: string, userId: string, limit = 50): Promise<WhatsappMessage[]> {
    const thread = await this.threadWithOrg(threadId);
    await this.assertCanManage(thread.organization_id, userId);
    const { data, error } = await this.supabase.client
      .from("whatsapp_messages")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map(mapMessage);
  }

  /** Serbest metin kuyruğa alınır; gönderim işleyicide (hız sınırı orada). */
  async queueThreadMessage(threadId: string, userId: string, body: string): Promise<WhatsappMessage> {
    const text = body?.trim();
    if (!text) throw new BadRequestException("Mesaj boş");
    const thread = await this.threadWithOrg(threadId);
    await this.assertCanManage(thread.organization_id, userId);
    return this.enqueue(threadId, text, null);
  }

  private async threadWithOrg(threadId: string): Promise<{ id: string; organization_id: string; contact_id: string }> {
    const { data } = await this.supabase.client
      .from("whatsapp_threads")
      .select("id, contact_id, whatsapp_connections!inner(organization_id)")
      .eq("id", threadId)
      .maybeSingle();
    if (!data) throw new NotFoundException("Konuşma bulunamadı");
    return { id: (data as any).id, contact_id: (data as any).contact_id, organization_id: (data as any).whatsapp_connections.organization_id };
  }

  // ================================================================ bildirim kanalı

  /**
   * NotificationsService.notifyUser'ın dördüncü kanalı. Kullanıcı hangi
   * organizasyonlarda opted_in ise ve o organizasyonun numarası bağlıysa
   * mesaj kuyruğa girer. Hata fırlatmaz: bildirimin kendisi zaten yazıldı,
   * WhatsApp'ın aksaması onu geri almamalı.
   */
  async notifyUser(userId: string, notification: NotificationPayload): Promise<void> {
    if (!this.isConfigured()) return;
    if (!shouldSendOverWhatsapp(notification.type)) return;
    try {
      const { data: contacts } = await this.supabase.client
        .from("whatsapp_contacts")
        .select("id, organization_id, last_inbound_at")
        .eq("user_id", userId)
        .eq("opt_in_state", "opted_in");
      if (!contacts?.length) return;

      const text = formatNotificationText(notification, getWebAppUrl());
      for (const contact of contacts as any[]) {
        // Kişi bize hiç yazmadıysa gönderim yok (yeni kişiye ilk mesajı biz atmayız).
        if (!contact.last_inbound_at) continue;
        const conn = await this.findConnection(contact.organization_id);
        if (!conn || conn.status !== "working") continue;
        const threadId = await this.ensureThread(conn.id, contact.id);
        await this.enqueue(threadId, text, notification.id, `notification:${notification.id}:${contact.id}`);
      }
    } catch (e) {
      this.logger.warn(`WhatsApp bildirimi kuyruğa alınamadı: ${e instanceof Error ? e.message : e}`);
    }
  }

  async ensureThread(connectionId: string, contactId: string): Promise<string> {
    const { data: existing } = await this.supabase.client
      .from("whatsapp_threads")
      .select("id")
      .eq("connection_id", connectionId)
      .eq("contact_id", contactId)
      .maybeSingle();
    if (existing) return (existing as any).id;
    const { data, error } = await this.supabase.client
      .from("whatsapp_threads")
      .insert({ connection_id: connectionId, contact_id: contactId })
      .select("id")
      .single();
    if (error) {
      // Yarış: aynı anda iki olay aynı thread'i açmaya çalıştı.
      if (error.code === "23505") return this.ensureThread(connectionId, contactId);
      throw error;
    }
    return (data as any).id;
  }

  async enqueue(threadId: string, body: string, notificationId: string | null, dedupeKey?: string): Promise<WhatsappMessage> {
    const { data, error } = await this.supabase.client
      .from("whatsapp_messages")
      .insert({
        thread_id: threadId,
        direction: "outbound",
        body,
        status: "queued",
        notification_id: notificationId,
        dedupe_key: dedupeKey ?? null,
      })
      .select()
      .single();
    if (error) {
      if (error.code === "23505") {
        // Aynı olay ikinci kez geldi; mevcut satırı döndürmek yeterli.
        const { data: existing } = await this.supabase.client.from("whatsapp_messages").select("*").eq("dedupe_key", dedupeKey!).single();
        return mapMessage(existing);
      }
      throw error;
    }
    return mapMessage(data);
  }
}

export function mapMessage(row: any): WhatsappMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    direction: row.direction,
    body: row.body ?? undefined,
    status: row.status,
    errorDetail: row.error_detail ?? undefined,
    createdAt: row.created_at,
    sentAt: row.sent_at ?? undefined,
    deliveredAt: row.delivered_at ?? undefined,
    readAt: row.read_at ?? undefined,
  };
}

/** Kişi JID'i — servis dışında da lazım (webhook, işleyici). */
export function contactChatId(phoneE164: string): string {
  return e164ToJid(phoneE164);
}
