import { Logger } from "@nestjs/common";
import { createSign } from "node:crypto";
import type { NotificationPayload } from "@projelio/shared";
import { fetchWithTimeout } from "../../common/http/fetch-with-timeout";

/**
 * Firebase Cloud Messaging (HTTP v1) — mobil uygulamaya bildirim gönderimi.
 *
 * NEDEN VAR: Android kabuğu bir WebView ve WebView'de web push (VAPID) yok.
 * 1.1.0'da uygulama bu yüzden HİÇ sistem bildirimi alamıyordu; kullanıcılar
 * "bildirimler çalışmıyor" dedi. Telefona bildirim götürmenin tek yolu FCM.
 *
 * firebase-admin bilerek eklenmedi — tek bir uç için koca bir SDK, üstelik
 * kendi HTTP katmanıyla (zaman aşımı kuralımızın dışında kalırdı). Kimlik
 * doğrulama google-play.client.ts ile aynı desen: servis hesabı JWT'si →
 * OAuth2 erişim jetonu.
 *
 * Ortam: FCM_PROJECT_ID + FCM_CLIENT_EMAIL + FCM_PRIVATE_KEY (Firebase konsolu >
 * Proje ayarları > Hizmet hesapları > yeni özel anahtar; JSON'daki project_id,
 * client_email, private_key). Tanımsızsa sessizce kapalı — web push etkilenmez.
 */

const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const KAPSAM = "https://www.googleapis.com/auth/firebase.messaging";

/**
 * Android bildirim kanalı. Uygulamadaki kimlikle BİREBİR aynı olmalı
 * (apps/mobile/android/.../strings.xml bildirim_kanali_kimligi); farklı olursa
 * Android bildirimi "Diğer" adlı sessiz bir kanala düşürür.
 */
export const BILDIRIM_KANALI = "projelio_bildirimler";

/** Bildirim ikonu (res/drawable-*), yalnızca alfa kanalı kullanılan beyaz logo. */
const BILDIRIM_IKONU = "ic_stat_projelio";
/** packages/shared/src/theme.ts → accent. */
const VURGU_RENGI = "#C0813F";

/**
 * FCM mesaj gövdesi. Saf fonksiyon — test edilebilsin diye ayrı.
 *
 * `notification` bloğu ŞART: uygulama kapalıyken bildirimi Android'in kendisi
 * çizer ve yalnızca bu bloğu okur. Salt `data` mesajı kapalı uygulamada
 * görünmez (JavaScript çalışmıyor).
 *
 * `priority: HIGH`: normal öncelikli mesajlar Doze modunda telefon uyanana kadar
 * bekletiliyor — "bildirim yarım saat sonra geldi" şikâyetinin sebebi. Görev
 * atama, yorum, son tarih kullanıcıya görünen, zamanı önemli bildirimler; FCM'nin
 * HIGH için koyduğu şart (kullanıcıya görünür bildirim üretmek) sağlanıyor.
 *
 * `data` değerleri STRING olmak zorunda (FCM sayı/null reddeder).
 */
export function fcmMesaji(token: string, bildirim: Pick<NotificationPayload, "id" | "type" | "title" | "body" | "link">) {
  return {
    message: {
      token,
      notification: { title: bildirim.title, body: bildirim.body },
      data: {
        link: bildirim.link ?? "/",
        type: String(bildirim.type),
        id: String(bildirim.id),
      },
      android: {
        priority: "HIGH",
        // Uygulama bir gün kapalı kalan telefona eski hatırlatmaları topluca
        // yağdırmasın: 24 saatten eski bildirim artık bilgi değil gürültü.
        ttl: "86400s",
        notification: {
          channel_id: BILDIRIM_KANALI,
          icon: BILDIRIM_IKONU,
          color: VURGU_RENGI,
          default_sound: true,
          default_vibrate_timings: true,
          notification_priority: "PRIORITY_HIGH",
        },
      },
    },
  };
}

/**
 * Yanıt, bu anahtarın artık GEÇERSİZ olduğunu mu söylüyor?
 *
 * Evet ise kayıt silinmeli — uygulama kaldırılmış, veri temizlenmiş ya da
 * anahtar yenilenmiş. Silinmezse her bildirimde boşuna istek atılır.
 * 429/5xx gibi geçici hatalarda SİLİNMEZ: bir sonraki bildirimde çalışır.
 */
export function anahtarGecersizMi(status: number, govde: any): boolean {
  const hata = govde?.error;
  const kodlar: string[] = (hata?.details ?? []).map((d: any) => d?.errorCode).filter(Boolean);
  if (kodlar.includes("UNREGISTERED") || kodlar.includes("SENDER_ID_MISMATCH")) return true;
  if (status === 404) return true;
  // Bozuk anahtar 400 INVALID_ARGUMENT döner; ama mesajın kendisindeki bir
  // hata da aynı kodla döner — yalnızca anahtardan söz ediyorsa sil.
  if (status === 400 && /registration token/i.test(String(hata?.message ?? ""))) return true;
  return false;
}

export type FcmSonucu = "gonderildi" | "gecersiz" | "hata";

export class FcmGonderici {
  private readonly logger = new Logger("FcmGonderici");
  private jeton: { value: string; expiresAt: number } | null = null;

  isConfigured(): boolean {
    return Boolean(
      process.env.FCM_PROJECT_ID?.trim() && process.env.FCM_CLIENT_EMAIL?.trim() && process.env.FCM_PRIVATE_KEY?.trim()
    );
  }

  async gonder(token: string, bildirim: NotificationPayload): Promise<FcmSonucu> {
    try {
      const erisim = await this.erisimJetonu();
      const proje = process.env.FCM_PROJECT_ID!.trim();
      const response = await fetchWithTimeout(`https://fcm.googleapis.com/v1/projects/${proje}/messages:send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${erisim}`, "Content-Type": "application/json" },
        body: JSON.stringify(fcmMesaji(token, bildirim)),
      }, 10_000);
      if (response.ok) return "gonderildi";

      const govde: any = await response.json().catch(() => null);
      if (anahtarGecersizMi(response.status, govde)) return "gecersiz";
      // 401: jeton süresinden önce geçersizleşmiş olabilir; bir sonrakinde tazelensin.
      if (response.status === 401) this.jeton = null;
      this.logger.warn(`FCM gönderimi başarısız (HTTP ${response.status}): ${govde?.error?.message ?? ""}`);
      return "hata";
    } catch (err) {
      this.logger.warn(`FCM gönderimi başarısız: ${err instanceof Error ? err.message : err}`);
      return "hata";
    }
  }

  /** Servis hesabı JWT'sini OAuth2 erişim jetonuna çevirir; jeton ~1 saat saklanır. */
  private async erisimJetonu(): Promise<string> {
    if (this.jeton && this.jeton.expiresAt > Date.now() + 60_000) return this.jeton.value;

    const email = process.env.FCM_CLIENT_EMAIL!.trim();
    // .env'de tek satıra sığsın diye satır sonları "\n" olarak yazılıyor.
    const pem = process.env.FCM_PRIVATE_KEY!.replace(/\\n/g, "\n");
    const simdi = Math.floor(Date.now() / 1000);

    const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const payload = b64url(
      JSON.stringify({ iss: email, scope: KAPSAM, aud: OAUTH_TOKEN_URL, iat: simdi, exp: simdi + 3600 })
    );
    const imzalayici = createSign("RSA-SHA256");
    imzalayici.update(`${header}.${payload}`);
    const assertion = `${header}.${payload}.${imzalayici.sign(pem).toString("base64url")}`;

    const response = await fetchWithTimeout(OAUTH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
    });

    const veri: any = await response.json().catch(() => null);
    if (!response.ok || !veri?.access_token) {
      throw new Error(`Firebase servis hesabı jetonu alınamadı (HTTP ${response.status}).`);
    }

    this.jeton = { value: veri.access_token, expiresAt: Date.now() + Number(veri.expires_in ?? 3600) * 1000 };
    return this.jeton.value;
  }
}

function b64url(metin: string): string {
  return Buffer.from(metin, "utf8").toString("base64url");
}
