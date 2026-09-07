import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { createSign } from "node:crypto";
import { fetchWithTimeout } from "../../common/http/fetch-with-timeout";

/**
 * Google Play Developer API istemcisi (abonelik doğrulaması).
 *
 * Apple tarafındaki kararla aynı: istemciden gelen `purchaseToken` bir KİMLİKTİR,
 * kanıt değil. Hak veren cevap her zaman Google'a sorularak alınır
 * (purchases.subscriptionsv2.get). Pub/Sub bildirimi de yalnızca "şu jetona bak"
 * demektir; durumu yine API'den okuyoruz.
 *
 * Kimlik doğrulama servis hesabıyla: JWT üretilip OAuth2 jetonuna çevriliyor.
 * googleapis paketi bilerek eklenmedi — tek uç için koca bir SDK, üstelik kendi
 * HTTP katmanıyla (zaman aşımı kuralımızın dışında kalırdı).
 */

const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const KAPSAM = "https://www.googleapis.com/auth/androidpublisher";

export interface PlayAbonelikDurumu {
  purchaseToken: string;
  productId: string;
  /** SUBSCRIPTION_STATE_ACTIVE, _IN_GRACE_PERIOD, _CANCELED, _EXPIRED ... */
  state: string;
  expiryTime?: Date;
  /** Kullanıcının satın almayı hangi hesapla yaptığı (Google'ın verdiği kimlik). */
  linkedPurchaseToken?: string;
}

@Injectable()
export class GooglePlayClient {
  private readonly logger = new Logger(GooglePlayClient.name);
  private jeton: { value: string; expiresAt: number } | null = null;

  isConfigured(): boolean {
    return Boolean(
      process.env.PLAY_SERVICE_ACCOUNT_EMAIL?.trim() &&
        process.env.PLAY_SERVICE_ACCOUNT_KEY?.trim() &&
        process.env.PLAY_PACKAGE_NAME?.trim()
    );
  }

  async abonelikDurumu(purchaseToken: string): Promise<PlayAbonelikDurumu | null> {
    if (!this.isConfigured()) throw new ServiceUnavailableException("Google Play doğrulaması yapılandırılmamış.");

    const paket = process.env.PLAY_PACKAGE_NAME!.trim();
    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(
      paket
    )}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;

    let response: Response;
    try {
      response = await fetchWithTimeout(url, {
        headers: { Authorization: `Bearer ${await this.erisimJetonu()}`, Accept: "application/json" },
      });
    } catch (error) {
      this.logger.error(`Google Play çağrısı başarısız: ${(error as Error).message}`);
      throw new ServiceUnavailableException("Google Play'e ulaşılamadı.");
    }

    if (response.status === 404 || response.status === 410) return null;
    if (!response.ok) {
      this.logger.warn(`Google Play yanıtı HTTP ${response.status}.`);
      return null;
    }

    const veri: any = await response.json().catch(() => null);
    if (!veri) return null;

    // subscriptionsv2 birden çok kalem dönebiliyor (çoklu abonelik ürünü);
    // bizim planlarımızda tek kalem var, ilkini alıyoruz.
    const kalem = veri.lineItems?.[0] ?? {};
    return {
      purchaseToken,
      productId: String(kalem.productId ?? ""),
      state: String(veri.subscriptionState ?? ""),
      expiryTime: kalem.expiryTime ? new Date(kalem.expiryTime) : undefined,
      linkedPurchaseToken: veri.linkedPurchaseToken ? String(veri.linkedPurchaseToken) : undefined,
    };
  }

  /** Pub/Sub bildiriminin gövdesinden purchaseToken'ı çıkarır (yalnızca ipucu). */
  bildirimdenJeton(mesajVerisi: string): { purchaseToken?: string; productId?: string; notificationType?: number } | null {
    try {
      const cozulmus = JSON.parse(Buffer.from(mesajVerisi, "base64").toString("utf8"));
      const abonelik = cozulmus?.subscriptionNotification;
      if (!abonelik) return null;
      return {
        purchaseToken: abonelik.purchaseToken,
        productId: abonelik.subscriptionId,
        notificationType: abonelik.notificationType,
      };
    } catch {
      return null;
    }
  }

  /** Servis hesabı JWT'sini OAuth2 erişim jetonuna çevirir; jeton kısa süre saklanır. */
  private async erisimJetonu(): Promise<string> {
    if (this.jeton && this.jeton.expiresAt > Date.now() + 60_000) return this.jeton.value;

    const email = process.env.PLAY_SERVICE_ACCOUNT_EMAIL!.trim();
    const pem = process.env.PLAY_SERVICE_ACCOUNT_KEY!.replace(/\\n/g, "\n");
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
      this.logger.error(`Google servis hesabı jetonu alınamadı (HTTP ${response.status}).`);
      throw new ServiceUnavailableException("Google Play kimlik doğrulaması başarısız.");
    }

    this.jeton = { value: veri.access_token, expiresAt: Date.now() + Number(veri.expires_in ?? 3600) * 1000 };
    return this.jeton.value;
  }
}

function b64url(metin: string): string {
  return Buffer.from(metin, "utf8").toString("base64url");
}
