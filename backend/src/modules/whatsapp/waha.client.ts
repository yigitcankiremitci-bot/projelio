import { Injectable, Logger } from "@nestjs/common";

/**
 * WAHA (WhatsApp HTTP API) istemcisi — modülün TEK dış çıkış noktası.
 *
 * Neden ayrı sınıf: WAHA'nın uç adları ve gövde biçimleri motor/sürüm
 * değiştikçe oynuyor. Değişiklik yalnızca burayı ilgilendirsin; servis ve
 * webhook katmanı "oturum başlat / QR al / metin gönder" düzeyinde konuşsun.
 * Testte bu sınıf taklit edilir (WahaClient arayüzü üzerinden).
 *
 * Kimlik: her istekte X-Api-Key. Adres compose ağından (http://waha:3000);
 * WAHA internete açık değil.
 */

export type WahaSessionStatus =
  | "STOPPED"
  | "STARTING"
  | "SCAN_QR_CODE"
  | "PASSKEY_REQUIRED"
  | "PASSKEY_CONFIRMATION_REQUIRED"
  | "WORKING"
  | "FAILED";

export interface WahaSessionInfo {
  name: string;
  status: WahaSessionStatus;
  /**
   * Bağlıyken: id = "905321234567@c.us", pushName = telefondaki profil adı.
   * reachoutTimelock / messageCapping: WhatsApp'ın 463/475 kısıt durumu —
   * uzlaştırma turu bunları okuyup bağlantıyı duraklatır.
   */
  me?: {
    id?: string;
    pushName?: string;
    reachoutTimelock?: { isActive?: boolean; timeEnforcementEnds?: number } | null;
    messageCapping?: { cappingStatus?: string; cycleEnd?: number } | null;
  } | null;
  engine?: { engine?: string } | null;
}

export interface WahaWebhookConfig {
  url: string;
  events: string[];
  hmacKey: string;
}

export interface WahaSendResult {
  /** WAHA'nın mesaj kimliği; ack olayları bununla eşlenir. */
  id: string | null;
}

export class WahaError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string
  ) {
    super(message);
  }
}

export interface WahaClient {
  isConfigured(): boolean;
  ensureSessionStarted(name: string, webhook: WahaWebhookConfig): Promise<void>;
  getSession(name: string): Promise<WahaSessionInfo | null>;
  stopSession(name: string): Promise<void>;
  logoutSession(name: string): Promise<void>;
  /** QR görselini data-URL olarak döner (data:image/png;base64,...). */
  getQrDataUrl(name: string): Promise<string | null>;
  requestPairingCode(name: string, phoneDigits: string): Promise<string>;
  sendText(name: string, chatId: string, text: string): Promise<WahaSendResult>;
  startTyping(name: string, chatId: string): Promise<void>;
  stopTyping(name: string, chatId: string): Promise<void>;
  sendSeen(name: string, chatId: string, messageIds?: string[]): Promise<void>;
  /** LID (@lid) adresini telefon JID'ine (@c.us) çevirir; bilinmiyorsa null. */
  resolveLid(name: string, lid: string): Promise<string | null>;
}

const REQUEST_TIMEOUT_MS = 15_000;

@Injectable()
export class WahaHttpClient implements WahaClient {
  private readonly logger = new Logger(WahaHttpClient.name);
  private readonly baseUrl: string | null;
  private readonly apiKey: string | null;

  constructor() {
    this.baseUrl = process.env.WAHA_URL?.trim().replace(/\/+$/, "") || null;
    this.apiKey = process.env.WAHA_API_KEY?.trim() || null;
    if (!this.isConfigured()) {
      this.logger.warn("WAHA_URL / WAHA_API_KEY tanımlı değil; WhatsApp köprüsü devre dışı.");
    }
  }

  isConfigured(): boolean {
    return Boolean(this.baseUrl && this.apiKey);
  }

  // ------------------------------------------------------------------ oturum

  async ensureSessionStarted(name: string, webhook: WahaWebhookConfig): Promise<void> {
    const config = {
      webhooks: [
        {
          url: webhook.url,
          events: webhook.events,
          hmac: { key: webhook.hmacKey },
          // WAHA tekrar dener; bizim tarafta event_id unique olduğu için çift
          // teslim zararsız.
          retries: { delaySeconds: 2, attempts: 5 },
        },
      ],
    };

    const existing = await this.getSession(name);
    if (!existing) {
      await this.request("POST", "/api/sessions", { name, start: true, config });
      return;
    }
    // Var olan oturumun webhook ayarı güncel kalsın (adres/anahtar değişmiş
    // olabilir), sonra başlat. Zaten çalışıyorsa start çağrısı zararsız.
    await this.request("PUT", `/api/sessions/${encodeURIComponent(name)}`, { config });
    if (existing.status === "STOPPED" || existing.status === "FAILED") {
      await this.request("POST", `/api/sessions/${encodeURIComponent(name)}/start`, {});
    }
  }

  async getSession(name: string): Promise<WahaSessionInfo | null> {
    try {
      return await this.request<WahaSessionInfo>("GET", `/api/sessions/${encodeURIComponent(name)}`);
    } catch (e) {
      if (e instanceof WahaError && e.status === 404) return null;
      throw e;
    }
  }

  async stopSession(name: string): Promise<void> {
    await this.request("POST", `/api/sessions/${encodeURIComponent(name)}/stop`, {});
  }

  async logoutSession(name: string): Promise<void> {
    await this.request("POST", `/api/sessions/${encodeURIComponent(name)}/logout`, {});
  }

  // ------------------------------------------------------------------ bağlama

  async getQrDataUrl(name: string): Promise<string | null> {
    const res = await this.raw("GET", `/api/${encodeURIComponent(name)}/auth/qr?format=image`, undefined, "image/png");
    if (res.status === 404 || res.status === 422) return null;
    if (!res.ok) throw new WahaError(`WAHA QR ${res.status}`, res.status, await res.text());
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:image/png;base64,${buf.toString("base64")}`;
  }

  async requestPairingCode(name: string, phoneDigits: string): Promise<string> {
    const out = await this.request<{ code?: string }>("POST", `/api/${encodeURIComponent(name)}/auth/request-code`, {
      phoneNumber: phoneDigits,
    });
    if (!out?.code) throw new WahaError("WAHA eşleştirme kodu dönmedi", 502, JSON.stringify(out));
    return out.code;
  }

  // ------------------------------------------------------------------ mesaj

  async sendText(name: string, chatId: string, text: string): Promise<WahaSendResult> {
    const out = await this.request<any>("POST", "/api/sendText", { session: name, chatId, text });
    return { id: extractMessageId(out) };
  }

  async startTyping(name: string, chatId: string): Promise<void> {
    await this.request("POST", "/api/startTyping", { session: name, chatId });
  }

  async stopTyping(name: string, chatId: string): Promise<void> {
    await this.request("POST", "/api/stopTyping", { session: name, chatId });
  }

  async sendSeen(name: string, chatId: string, messageIds?: string[]): Promise<void> {
    await this.request("POST", "/api/sendSeen", { session: name, chatId, ...(messageIds?.length ? { messageIds } : {}) });
  }

  async resolveLid(name: string, lid: string): Promise<string | null> {
    try {
      const out = await this.request<{ pn?: string | null }>(
        "GET",
        `/api/${encodeURIComponent(name)}/lids/${encodeURIComponent(lid)}`
      );
      return out?.pn ?? null;
    } catch (e) {
      this.logger.warn(`LID çözülemedi (${lid}): ${e instanceof Error ? e.message : e}`);
      return null;
    }
  }

  // ------------------------------------------------------------------ HTTP

  private async request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.raw(method, path, body);
    const text = await res.text();
    if (!res.ok) throw new WahaError(`WAHA ${method} ${path} → ${res.status}`, res.status, text);
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  }

  private async raw(method: string, path: string, body?: unknown, accept = "application/json"): Promise<Response> {
    if (!this.baseUrl || !this.apiKey) throw new WahaError("WAHA yapılandırılmamış", 503, "");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(this.baseUrl + path, {
        method,
        headers: {
          "X-Api-Key": this.apiKey,
          Accept: accept,
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }
}

/** WAHA sürümüne göre id düz string ya da { _serialized } nesnesi olabiliyor. */
export function extractMessageId(out: any): string | null {
  const id = out?.id ?? out?.key?.id;
  if (!id) return null;
  if (typeof id === "string") return id;
  if (typeof id === "object" && typeof id._serialized === "string") return id._serialized;
  if (typeof id === "object" && typeof id.id === "string") return id.id;
  return null;
}

/**
 * WhatsApp'ın 2026'da eklediği sunucu tarafı kısıtlar: 463 (yeni kişiye yazma
 * kilidi) ve 475 (mesaj kapasitesi). Oturum sağlıklı görünür ama gönderim
 * reddedilir. Bunlarda tekrar denemek ve oturumu yeniden başlatmak yanlış:
 * bağlantı bir süre duraklatılır (bkz. whatsapp-send.processor.ts).
 */
export function isThrottleError(e: unknown): { throttled: true; reason: string } | { throttled: false } {
  if (!(e instanceof WahaError)) return { throttled: false };
  const haystack = `${e.status} ${e.body}`.toLowerCase();
  if (/\b463\b|timelock|reachout/.test(haystack)) return { throttled: true, reason: "463 reachout timelock" };
  if (/\b475\b|capping/.test(haystack)) return { throttled: true, reason: "475 message capping" };
  return { throttled: false };
}
