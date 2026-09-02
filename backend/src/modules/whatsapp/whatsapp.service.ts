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
  WhatsappContact,
  WhatsappLinkCode,
  WhatsappMessage,
  WhatsappOverview,
  WhatsappStatusEvent,
  WhatsappThread,
} from "@projelio/shared";
import { AccessService } from "../../common/access/access.service";
import { SupabaseService } from "../../database/supabase.service";
import { NotificationsGateway } from "../notifications/notifications.gateway";
import { WahaHttpClient, type WahaSessionStatus } from "./waha.client";
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
  label: string | null;
  session_name: string;
  status: WhatsappConnectionSummary["status"];
  engine: string | null;
  phone_e164: string | null;
  push_name: string | null;
  linked_by_user_id: string | null;
  created_by_user_id: string | null;
  last_connected_at: string | null;
  warmup_started_at: string | null;
  paused_until: string | null;
  pause_reason: string | null;
  is_active: boolean;
  created_at: string;
};

export type ContactRow = {
  id: string;
  connection_id: string;
  kind: "user" | "customer";
  phone_e164: string;
  wa_jid: string;
  display_name: string | null;
  user_id: string | null;
  party_id: string | null;
  opt_in_state: "unknown" | "opted_in" | "opted_out";
  last_inbound_at: string | null;
  created_at: string;
};

export type ThreadRow = {
  id: string;
  connection_id: string;
  contact_id: string;
  kind: "notification" | "customer";
  owner_user_id: string | null;
  organization_id: string | null;
  lio_auto_reply: boolean;
  title: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  last_message_at: string | null;
};

/**
 * WhatsApp köprüsünün iş mantığı — havuz modeli.
 *
 *  - Numaralar platformun: yönetici ekler (adminNumbers/addNumber...).
 *  - Her kullanıcıya ilk ihtiyaçta havuzdan bir numara KALICI atanır
 *    (assignNumber). Müşteri hep aynı numarayı görür; kullanıcı için o
 *    numara "Projelio numaran"dır.
 *  - Bildirim kanalı: kullanıcının kendi telefonu, atanmış numaraya kod
 *    gönderip bağlanır (link code) — ilk mesajı biz atmayız.
 *  - Müşteri konuşması: kullanıcı ya da Lio başlatır (openCustomerThread +
 *    enqueue). Bkz. whatsapp-lio.service.ts.
 *
 * WAHA ile konuşma WahaHttpClient'ta, gelen olaylar WhatsappWebhookService'te,
 * gönderim WhatsappSendProcessor'da.
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

  private webhookConfig() {
    return {
      url: process.env.WHATSAPP_WEBHOOK_URL!.trim(),
      events: WEBHOOK_EVENTS,
      hmacKey: process.env.WAHA_WEBHOOK_HMAC!.trim(),
    };
  }

  // ================================================================ havuz (yönetici)

  async listNumbers(): Promise<WhatsappConnectionSummary[]> {
    const [{ data: rows }, { data: assignments }] = await Promise.all([
      this.supabase.client.from("whatsapp_connections").select("*").eq("is_active", true).order("created_at"),
      this.supabase.client.from("whatsapp_user_numbers").select("connection_id"),
    ]);
    const counts = new Map<string, number>();
    for (const a of (assignments ?? []) as any[]) counts.set(a.connection_id, (counts.get(a.connection_id) ?? 0) + 1);
    return ((rows ?? []) as ConnectionRow[]).map((r) => this.mapConnection(r, counts.get(r.id) ?? 0));
  }

  /** Havuza yeni numara: satır açılır, WAHA oturumu başlatılır (QR beklenir). */
  async addNumber(label: string, adminUserId: string): Promise<WhatsappConnectionSummary> {
    this.assertConfigured();
    const name = label?.trim();
    if (!name) throw new BadRequestException("Numara için bir etiket girin");
    const { data, error } = await this.supabase.client
      .from("whatsapp_connections")
      .insert({ label: name, session_name: "pending", status: "starting", linked_by_user_id: adminUserId, created_by_user_id: adminUserId })
      .select()
      .single();
    if (error) throw error;
    // Oturum adı satır kimliğinden türetilir; önce satır lazım.
    let row = await this.updateConnection((data as ConnectionRow).id, { session_name: `num_${(data as ConnectionRow).id}` });
    row = await this.startSession(row, adminUserId);
    return this.mapConnection(row);
  }

  /** Durmuş/kopmuş numarayı yeniden bağlamaya aç (QR yeniden okutulur). */
  async restartNumber(connectionId: string, adminUserId: string): Promise<WhatsappConnectionSummary> {
    this.assertConfigured();
    const row = await this.requireConnection(connectionId);
    if (row.status === "working") return this.mapConnection(row);
    return this.mapConnection(await this.startSession(row, adminUserId));
  }

  private async startSession(row: ConnectionRow, userId: string): Promise<ConnectionRow> {
    let updated = await this.updateConnection(row.id, {
      status: "starting",
      linked_by_user_id: userId,
      last_status_at: new Date().toISOString(),
    });
    try {
      await this.waha.ensureSessionStarted(row.session_name, this.webhookConfig());
    } catch (e) {
      this.logger.error(`WAHA oturumu başlatılamadı (${row.session_name}): ${e instanceof Error ? e.message : e}`);
      updated = await this.updateConnection(row.id, { status: "failed", last_status_at: new Date().toISOString() });
      throw new ServiceUnavailableException("WhatsApp köprüsüne ulaşılamadı");
    }
    return updated;
  }

  async getQr(connectionId: string): Promise<{ qr: string | null }> {
    this.assertConfigured();
    const row = await this.requireConnection(connectionId);
    if (row.status === "working") throw new ConflictException("Numara zaten bağlı");
    return { qr: await this.waha.getQrDataUrl(row.session_name) };
  }

  async requestPairingCode(connectionId: string, phone: string): Promise<{ code: string }> {
    this.assertConfigured();
    const e164 = normalizePhoneE164(phone);
    if (!e164) throw new BadRequestException("Telefon numarası anlaşılamadı");
    const row = await this.requireConnection(connectionId);
    if (row.status !== "scan_qr") throw new ConflictException("Eşleştirme kodu yalnızca QR beklenirken istenebilir");
    return { code: await this.waha.requestPairingCode(row.session_name, e164.replace(/^\+/, "")) };
  }

  /** Numarayı WhatsApp'tan ayırır; satır ve atamalar kalır (yeniden bağlanabilir). */
  async logoutNumber(connectionId: string): Promise<{ ok: true }> {
    this.assertConfigured();
    const row = await this.requireConnection(connectionId);
    await this.waha.logoutSession(row.session_name).catch((e) => this.logger.warn(`WAHA logout: ${e?.message ?? e}`));
    await this.waha.stopSession(row.session_name).catch(() => {});
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

  /**
   * Numarayı havuzdan çıkarır. Atanmış kullanıcılar başka bir çalışan numaraya
   * taşınır (müşteri açısından numara değişir — bu yüzden yalnız yönetici ve
   * bilinçli). Çalışan başka numara yoksa reddedilir.
   */
  async removeNumber(connectionId: string): Promise<{ ok: true; movedUsers: number }> {
    const row = await this.requireConnection(connectionId);
    const { data: assigned } = await this.supabase.client.from("whatsapp_user_numbers").select("user_id").eq("connection_id", row.id);
    let moved = 0;
    if (assigned?.length) {
      const target = await this.pickLeastLoadedConnection(row.id);
      if (!target) throw new ConflictException("Kullanıcıları taşıyacak başka çalışan numara yok; önce yeni numara bağlayın");
      const { error } = await this.supabase.client.from("whatsapp_user_numbers").update({ connection_id: target.id }).eq("connection_id", row.id);
      if (error) throw error;
      moved = assigned.length;
    }
    await this.waha.logoutSession(row.session_name).catch(() => {});
    await this.waha.stopSession(row.session_name).catch(() => {});
    await this.updateConnection(row.id, { is_active: false, status: "stopped", last_status_at: new Date().toISOString() });
    return { ok: true, movedUsers: moved };
  }

  // ================================================================ atama

  /** Kullanıcının numarası; yoksa null (atama ilk ihtiyaçta yapılır). */
  async myConnection(userId: string): Promise<ConnectionRow | null> {
    const { data } = await this.supabase.client
      .from("whatsapp_user_numbers")
      .select("connection_id, whatsapp_connections(*)")
      .eq("user_id", userId)
      .maybeSingle();
    const row = (data as any)?.whatsapp_connections as ConnectionRow | undefined;
    return row && row.is_active ? row : null;
  }

  /**
   * Kalıcı atama: varsa döner, yoksa çalışan numaralar arasından en az yüklü
   * olanı seçip yazar. Havuz boşsa hata.
   */
  async assignNumber(userId: string): Promise<ConnectionRow> {
    const existing = await this.myConnection(userId);
    if (existing) return existing;
    const target = await this.pickLeastLoadedConnection();
    if (!target) throw new ConflictException("Havuzda bağlı bir WhatsApp numarası yok; yöneticiye başvurun");
    const { error } = await this.supabase.client.from("whatsapp_user_numbers").insert({ user_id: userId, connection_id: target.id });
    // Yarış: aynı anda iki istek — ilk kazanır, ikincisi onu okur.
    if (error && error.code !== "23505") throw error;
    return (await this.myConnection(userId)) ?? target;
  }

  private async pickLeastLoadedConnection(excludeId?: string): Promise<ConnectionRow | null> {
    const [{ data: rows }, { data: assignments }] = await Promise.all([
      this.supabase.client.from("whatsapp_connections").select("*").eq("is_active", true).eq("status", "working"),
      this.supabase.client.from("whatsapp_user_numbers").select("connection_id"),
    ]);
    const candidates = ((rows ?? []) as ConnectionRow[]).filter((r) => r.id !== excludeId);
    if (candidates.length === 0) return null;
    const counts = new Map<string, number>();
    for (const a of (assignments ?? []) as any[]) counts.set(a.connection_id, (counts.get(a.connection_id) ?? 0) + 1);
    candidates.sort((a, b) => (counts.get(a.id) ?? 0) - (counts.get(b.id) ?? 0) || a.created_at.localeCompare(b.created_at));
    return candidates[0];
  }

  // ================================================================ görünüm (Ayarlar)

  async overviewForUser(userId: string): Promise<WhatsappOverview> {
    const configured = this.isConfigured();
    if (!configured) return { configured, poolReady: false, myNumber: null, me: { optInState: "not_linked" } };

    const [mine, { count }] = await Promise.all([
      this.myConnection(userId),
      this.supabase.client.from("whatsapp_connections").select("id", { count: "exact", head: true }).eq("is_active", true).eq("status", "working"),
    ]);
    const { data: contact } = await this.supabase.client
      .from("whatsapp_contacts")
      .select("phone_e164, opt_in_state")
      .eq("user_id", userId)
      .eq("kind", "user")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      configured,
      poolReady: (count ?? 0) > 0,
      myNumber: mine ? this.mapConnection(mine) : null,
      me: contact
        ? { optInState: (contact as any).opt_in_state, phoneMasked: maskPhone((contact as any).phone_e164) }
        : { optInState: "not_linked" },
    };
  }

  mapConnection(row: ConnectionRow, assignedUsers?: number): WhatsappConnectionSummary {
    return {
      id: row.id,
      label: row.label ?? "Numara",
      status: row.status,
      engine: row.engine ?? undefined,
      phoneMasked: row.phone_e164 ? maskPhone(row.phone_e164) : undefined,
      pushName: row.push_name ?? undefined,
      lastConnectedAt: row.last_connected_at ?? undefined,
      pausedUntil: row.paused_until ?? undefined,
      pauseReason: row.pause_reason ?? undefined,
      assignedUsers,
      createdAt: row.created_at,
    };
  }

  // ================================================================ bağlantı satırı

  async requireConnection(id: string): Promise<ConnectionRow> {
    const { data } = await this.supabase.client.from("whatsapp_connections").select("*").eq("id", id).eq("is_active", true).maybeSingle();
    if (!data) throw new NotFoundException("Numara bulunamadı");
    return data as ConnectionRow;
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

  /** Numara durumunu bağlayan yöneticiye (+ isteğe bağlı bir kullanıcıya) iletir. */
  pushStatus(row: ConnectionRow, extraUserId?: string): void {
    const event: WhatsappStatusEvent = {
      connectionId: row.id,
      status: row.status,
      phoneMasked: row.phone_e164 ? maskPhone(row.phone_e164) : undefined,
    };
    const targets = new Set<string>();
    if (row.linked_by_user_id) targets.add(row.linked_by_user_id);
    if (extraUserId) targets.add(extraUserId);
    for (const userId of targets) this.gateway.sendWhatsappStatus(userId, event);
  }

  // ================================================================ eşleştirme / opt-in

  async createLinkCode(userId: string): Promise<WhatsappLinkCode> {
    this.assertConfigured();
    const conn = await this.assignNumber(userId);
    if (conn.status !== "working" || !conn.phone_e164) {
      throw new ConflictException("Size atanan numara şu an bağlı değil; yöneticiye başvurun");
    }

    // Eski, kullanılmamış kodlar geçersizleşsin: aynı anda tek geçerli kod.
    await this.supabase.client
      .from("whatsapp_link_codes")
      .update({ expires_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("used_at", null);

    const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS).toISOString();
    // Çakışma olasılığı düşük (32^4) ama sıfır değil; birkaç kez denenir.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateLinkCode((max) => randomInt(max));
      const { error } = await this.supabase.client
        .from("whatsapp_link_codes")
        .insert({ code, user_id: userId, connection_id: conn.id, expires_at: expiresAt });
      if (!error) return { code, url: buildLinkUrl(conn.phone_e164, code), expiresAt, numberMasked: maskPhone(conn.phone_e164) };
      if (error.code !== "23505") throw error;
    }
    throw new ConflictException("Kod üretilemedi, tekrar deneyin");
  }

  async optOutMe(userId: string): Promise<{ ok: true }> {
    const { error } = await this.supabase.client
      .from("whatsapp_contacts")
      .update({ opt_in_state: "opted_out", opt_out_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("kind", "user");
    if (error) throw error;
    return { ok: true };
  }

  // ================================================================ müşteri konuşmaları

  /**
   * Kullanıcının (ya da onun adına Lio'nun) bir müşteriyle konuşmasını açar.
   * Numara: kullanıcıya atanmış olan. Kişi: (numara, telefon) ile tekil;
   * party bağı verildiyse yazılır. Konuşma sahibi = çağıran kullanıcı;
   * erişim kapsamı party'nin organizasyonu (varsa).
   */
  async openCustomerThread(
    userId: string,
    target: { phone?: string; partyId?: string },
    displayName?: string
  ): Promise<{ thread: ThreadRow; contact: ContactRow; connection: ConnectionRow }> {
    this.assertConfigured();
    const connection = await this.assignNumber(userId);
    if (connection.status !== "working") throw new ConflictException("Size atanan numara şu an bağlı değil");

    let phone = normalizePhoneE164(target.phone);
    let partyId = target.partyId ?? null;
    let organizationId: string | null = null;
    let name = displayName?.trim() || null;

    if (partyId) {
      const { data: party } = await this.supabase.client
        .from("party")
        .select("id, display_name, phone, organization_id, job_id, party_contact(phone, is_primary, archived_at)")
        .eq("id", partyId)
        .maybeSingle();
      if (!party) throw new NotFoundException("Müşteri kaydı bulunamadı");
      const p = party as any;
      if (p.organization_id) await this.access.assertCanViewOrganization(p.organization_id, userId);
      else if (p.job_id) await this.access.assertCanViewJob(p.job_id, userId);
      organizationId = p.organization_id ?? null;
      name = name ?? p.display_name ?? null;
      if (!phone) {
        const contacts = ((p.party_contact ?? []) as any[]).filter((c) => !c.archived_at);
        const primary = contacts.find((c) => c.is_primary && c.phone) ?? contacts.find((c) => c.phone);
        phone = normalizePhoneE164(p.phone) ?? normalizePhoneE164(primary?.phone);
      }
    }
    if (!phone) throw new BadRequestException("Müşterinin telefon numarası yok ya da anlaşılamadı");
    if (connection.phone_e164 === phone) throw new BadRequestException("Numara kendi kendine yazamaz");

    const contact = await this.upsertContact(connection.id, phone, { kind: "customer", party_id: partyId, display_name: name });
    if (contact.user_id) {
      // Bu telefon bir Projelio kullanıcısına ait: müşteri konuşması değil,
      // bildirim akışı. Karışmasın.
      throw new ConflictException("Bu numara bir Projelio kullanıcısına kayıtlı; müşteri konuşması açılamaz");
    }
    const thread = await this.ensureThread(connection.id, contact.id, {
      kind: "customer",
      owner_user_id: userId,
      organization_id: organizationId,
      title: name,
    });
    return { thread, contact, connection };
  }

  async listMyCustomerThreads(userId: string, limit = 50): Promise<WhatsappThread[]> {
    const { data, error } = await this.supabase.client
      .from("whatsapp_threads")
      .select("*, whatsapp_contacts(phone_e164, display_name, party_id)")
      .eq("kind", "customer")
      .eq("owner_user_id", userId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map(mapThread);
  }

  /** Konuşmayı görebilir mi: sahibi, ya da konuşmanın organizasyonunu görebilen. */
  async assertCanViewThread(threadId: string, userId: string): Promise<ThreadRow> {
    const { data } = await this.supabase.client.from("whatsapp_threads").select("*").eq("id", threadId).maybeSingle();
    if (!data) throw new NotFoundException("Konuşma bulunamadı");
    const thread = data as ThreadRow;
    if (thread.owner_user_id === userId) return thread;
    if (thread.organization_id && (await this.access.canViewOrganization(thread.organization_id, userId))) return thread;
    if (await this.isAdmin(userId)) return thread;
    throw new ForbiddenException("Bu konuşmayı görüntüleme yetkiniz yok");
  }

  async listThreadMessages(threadId: string, userId: string, limit = 50): Promise<WhatsappMessage[]> {
    await this.assertCanViewThread(threadId, userId);
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
  async queueThreadMessage(threadId: string, userId: string, body: string, sentBy: "user" | "lio" = "user"): Promise<WhatsappMessage> {
    const text = body?.trim();
    if (!text) throw new BadRequestException("Mesaj boş");
    await this.assertCanViewThread(threadId, userId);
    return this.enqueue(threadId, text, { sentBy, sentByUserId: userId });
  }

  async setAutoReply(threadId: string, userId: string, enabled: boolean): Promise<WhatsappThread> {
    await this.assertCanViewThread(threadId, userId);
    const { data, error } = await this.supabase.client
      .from("whatsapp_threads")
      .update({ lio_auto_reply: enabled, updated_at: new Date().toISOString() })
      .eq("id", threadId)
      .select("*, whatsapp_contacts(phone_e164, display_name, party_id)")
      .single();
    if (error) throw error;
    return mapThread(data);
  }

  private async isAdmin(userId: string): Promise<boolean> {
    const { data } = await this.supabase.client.from("users").select("role").eq("id", userId).maybeSingle();
    return (data as any)?.role === "admin";
  }

  // ================================================================ kişi / konuşma / kuyruk (ortak)

  async upsertContact(
    connectionId: string,
    phone: string,
    patch: { kind?: "user" | "customer"; party_id?: string | null; display_name?: string | null; last_inbound_at?: string }
  ): Promise<ContactRow> {
    const now = new Date().toISOString();
    const { data: existing } = await this.supabase.client
      .from("whatsapp_contacts")
      .select("*")
      .eq("connection_id", connectionId)
      .eq("phone_e164", phone)
      .maybeSingle();

    if (existing) {
      const row = existing as ContactRow;
      const update: Record<string, unknown> = { updated_at: now };
      if (patch.last_inbound_at) update.last_inbound_at = patch.last_inbound_at;
      if (patch.display_name && !row.display_name) update.display_name = patch.display_name;
      if (patch.party_id && !row.party_id) update.party_id = patch.party_id;
      const { data } = await this.supabase.client.from("whatsapp_contacts").update(update).eq("id", row.id).select().single();
      return data as ContactRow;
    }
    const { data, error } = await this.supabase.client
      .from("whatsapp_contacts")
      .insert({
        connection_id: connectionId,
        phone_e164: phone,
        wa_jid: e164ToJid(phone),
        kind: patch.kind ?? "customer",
        party_id: patch.party_id ?? null,
        display_name: patch.display_name ?? null,
        last_inbound_at: patch.last_inbound_at ?? null,
      })
      .select()
      .single();
    if (error) {
      if (error.code === "23505") return this.upsertContact(connectionId, phone, patch);
      throw error;
    }
    return data as ContactRow;
  }

  async ensureThread(
    connectionId: string,
    contactId: string,
    init: { kind: "notification" | "customer"; owner_user_id?: string | null; organization_id?: string | null; title?: string | null }
  ): Promise<ThreadRow> {
    const { data: existing } = await this.supabase.client
      .from("whatsapp_threads")
      .select("*")
      .eq("connection_id", connectionId)
      .eq("contact_id", contactId)
      .maybeSingle();
    if (existing) {
      const row = existing as ThreadRow;
      // Sahipsiz açılmış (müşteri önce yazmış) konuşmayı ilk yazan sahiplenir.
      if (!row.owner_user_id && init.owner_user_id) {
        const { data } = await this.supabase.client
          .from("whatsapp_threads")
          .update({ owner_user_id: init.owner_user_id, organization_id: row.organization_id ?? init.organization_id ?? null, title: row.title ?? init.title ?? null })
          .eq("id", row.id)
          .select()
          .single();
        return data as ThreadRow;
      }
      return row;
    }
    const { data, error } = await this.supabase.client
      .from("whatsapp_threads")
      .insert({
        connection_id: connectionId,
        contact_id: contactId,
        kind: init.kind,
        owner_user_id: init.owner_user_id ?? null,
        organization_id: init.organization_id ?? null,
        title: init.title ?? null,
      })
      .select()
      .single();
    if (error) {
      // Yarış: aynı anda iki olay aynı thread'i açmaya çalıştı.
      if (error.code === "23505") return this.ensureThread(connectionId, contactId, init);
      throw error;
    }
    return data as ThreadRow;
  }

  async enqueue(
    threadId: string,
    body: string,
    meta: { sentBy: "system" | "user" | "lio"; sentByUserId?: string | null; notificationId?: string | null; dedupeKey?: string }
  ): Promise<WhatsappMessage> {
    const { data, error } = await this.supabase.client
      .from("whatsapp_messages")
      .insert({
        thread_id: threadId,
        direction: "outbound",
        body,
        status: "queued",
        sent_by: meta.sentBy,
        sent_by_user_id: meta.sentByUserId ?? null,
        notification_id: meta.notificationId ?? null,
        dedupe_key: meta.dedupeKey ?? null,
      })
      .select()
      .single();
    if (error) {
      if (error.code === "23505" && meta.dedupeKey) {
        // Aynı olay ikinci kez geldi; mevcut satırı döndürmek yeterli.
        const { data: existing } = await this.supabase.client.from("whatsapp_messages").select("*").eq("dedupe_key", meta.dedupeKey).single();
        return mapMessage(existing);
      }
      throw error;
    }
    return mapMessage(data);
  }

  // ================================================================ bildirim kanalı

  /**
   * NotificationsService.notifyUser'ın dördüncü kanalı. Kullanıcının kendi
   * telefonu (kind=user, opted_in) atanmış numaraya bağlıysa mesaj kuyruğa
   * girer. Hata fırlatmaz: bildirimin kendisi zaten yazıldı.
   */
  async notifyUser(userId: string, notification: NotificationPayload): Promise<void> {
    if (!this.isConfigured()) return;
    if (!shouldSendOverWhatsapp(notification.type)) return;
    try {
      const { data: contacts } = await this.supabase.client
        .from("whatsapp_contacts")
        .select("*, whatsapp_connections(*)")
        .eq("user_id", userId)
        .eq("kind", "user")
        .eq("opt_in_state", "opted_in");
      if (!contacts?.length) return;

      const text = formatNotificationText(notification, getWebAppUrl());
      for (const contact of contacts as any[]) {
        // Kişi bize hiç yazmadıysa gönderim yok (yeni kişiye ilk mesajı biz atmayız).
        if (!contact.last_inbound_at) continue;
        const conn = contact.whatsapp_connections as ConnectionRow | null;
        if (!conn || !conn.is_active || conn.status !== "working") continue;
        const thread = await this.ensureThread(conn.id, contact.id, { kind: "notification", owner_user_id: userId });
        await this.enqueue(thread.id, text, {
          sentBy: "system",
          notificationId: notification.id,
          dedupeKey: `notification:${notification.id}:${contact.id}`,
        });
      }
    } catch (e) {
      this.logger.warn(`WhatsApp bildirimi kuyruğa alınamadı: ${e instanceof Error ? e.message : e}`);
    }
  }
}

export function mapMessage(row: any): WhatsappMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    direction: row.direction,
    sentBy: row.sent_by ?? undefined,
    body: row.body ?? undefined,
    status: row.status,
    errorDetail: row.error_detail ?? undefined,
    createdAt: row.created_at,
    sentAt: row.sent_at ?? undefined,
    deliveredAt: row.delivered_at ?? undefined,
    readAt: row.read_at ?? undefined,
  };
}

export function mapThread(row: any): WhatsappThread {
  const c = row.whatsapp_contacts ?? {};
  return {
    id: row.id,
    connectionId: row.connection_id,
    kind: row.kind,
    ownerUserId: row.owner_user_id ?? undefined,
    organizationId: row.organization_id ?? undefined,
    title: row.title ?? c.display_name ?? undefined,
    contact: { phoneMasked: maskPhone(c.phone_e164), displayName: c.display_name ?? undefined, partyId: c.party_id ?? undefined },
    lioAutoReply: Boolean(row.lio_auto_reply),
    lastMessageAt: row.last_message_at ?? undefined,
    lastInboundAt: row.last_inbound_at ?? undefined,
  };
}

export function mapContact(row: any): WhatsappContact {
  return {
    id: row.id,
    connectionId: row.connection_id,
    kind: row.kind,
    phoneMasked: maskPhone(row.phone_e164),
    displayName: row.display_name ?? undefined,
    userId: row.user_id ?? undefined,
    partyId: row.party_id ?? undefined,
    optInState: row.opt_in_state,
    lastInboundAt: row.last_inbound_at ?? undefined,
    createdAt: row.created_at,
  };
}
