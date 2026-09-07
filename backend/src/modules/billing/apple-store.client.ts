import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { createPrivateKey, createSign } from "node:crypto";
import { fetchWithTimeout } from "../../common/http/fetch-with-timeout";

/**
 * App Store Server API istemcisi (abonelik doğrulaması).
 *
 * TASARIM KARARI — İSTEMCİDEN GELEN FİŞE GÜVENİLMEZ. StoreKit'in verdiği imzalı
 * makbuz (JWS) yerel olarak da doğrulanabilir ama bu, Apple'ın sertifika zincirini
 * elde doğrulamayı gerektirir ve orada yapılan tek bir hata sahte satın almayı
 * geçerli sayar. Bunun yerine istemciden yalnızca originalTransactionId alınıyor
 * ve gerçeğin kaynağı olarak APPLE'IN KENDİSİ sorgulanıyor. Sahte bir kimlik
 * göndermenin faydası yok: Apple o kimliği tanımaz ya da başka bir hesabın
 * aboneliğini döner ve biz onu kendi kaydımızla eşleyemeyiz.
 *
 * Bildirimler (App Store Server Notifications V2) de aynı mantıkla ele alınır:
 * bildirim bir İPUCUDUR, kanıt değil — içinden kimlik okunur, durum API'den sorulur.
 *
 * ANAHTAR YOKSA KAPALIDIR. Yapılandırılmamış bir kurulumda "doğrulandı" dönmek,
 * bedava abonelik dağıtmaktır.
 */

const URETIM = "https://api.storekit.itunes.apple.com";
const KUM_HAVUZU = "https://api.storekit-sandbox.itunes.apple.com";

export interface AppleAbonelikDurumu {
  originalTransactionId: string;
  productId: string;
  /** Apple'ın durum kodu: 1=aktif, 2=süresi doldu, 3=tahsilat sorunu, 4=iptal edildi (dönem sürüyor), 5=iade/geri çekilmiş. */
  status: number;
  expiresDate?: Date;
  autoRenewStatus?: number;
}

@Injectable()
export class AppleStoreClient {
  private readonly logger = new Logger(AppleStoreClient.name);

  isConfigured(): boolean {
    return Boolean(
      process.env.APPSTORE_ISSUER_ID?.trim() &&
        process.env.APPSTORE_KEY_ID?.trim() &&
        process.env.APPSTORE_PRIVATE_KEY?.trim() &&
        process.env.APPSTORE_BUNDLE_ID?.trim()
    );
  }

  /**
   * Aboneliğin Apple'daki güncel durumu.
   *
   * Üretim ve kum havuzu AYRI adresler ve bir kimlik yalnızca birinde geçerli.
   * Apple'ın önerdiği sıra: önce üretim, 404 alınırsa kum havuzu. Ters sıra,
   * üretimdeki gerçek bir aboneliği "yok" saymaya yol açar.
   */
  async abonelikDurumu(originalTransactionId: string): Promise<AppleAbonelikDurumu | null> {
    if (!this.isConfigured()) throw new ServiceUnavailableException("App Store doğrulaması yapılandırılmamış.");

    for (const taban of [URETIM, KUM_HAVUZU]) {
      const sonuc = await this.sorgula(taban, originalTransactionId);
      if (sonuc) return sonuc;
    }
    return null;
  }

  private async sorgula(taban: string, originalTransactionId: string): Promise<AppleAbonelikDurumu | null> {
    const yol = `/inApps/v1/subscriptions/${encodeURIComponent(originalTransactionId)}`;
    let response: Response;
    try {
      response = await fetchWithTimeout(`${taban}${yol}`, {
        headers: { Authorization: `Bearer ${this.jwtUret()}`, Accept: "application/json" },
      });
    } catch (error) {
      this.logger.error(`App Store çağrısı başarısız: ${(error as Error).message}`);
      throw new ServiceUnavailableException("App Store'a ulaşılamadı.");
    }

    if (response.status === 404) return null;
    if (!response.ok) {
      this.logger.warn(`App Store ${yol} yanıtı HTTP ${response.status}.`);
      return null;
    }

    const veri: any = await response.json().catch(() => null);
    const kalem = veri?.data?.[0]?.lastTransactions?.[0];
    if (!kalem) return null;

    // İmzalı yükün GÖVDESİ okunuyor, imzası değil: bu yanıt zaten Apple'ın
    // kimliği doğrulanmış TLS bağlantısından geldi, ikinci bir imza doğrulaması
    // güven eklemez (istemciden gelen JWS'te ise durum tam tersi olurdu).
    const bilgi = this.jwsGovdesiniOku(kalem.signedTransactionInfo) ?? {};
    const yenileme = this.jwsGovdesiniOku(kalem.signedRenewalInfo) ?? {};

    return {
      originalTransactionId: String(kalem.originalTransactionId ?? bilgi.originalTransactionId ?? originalTransactionId),
      productId: String(bilgi.productId ?? ""),
      status: Number(kalem.status ?? 0),
      expiresDate: bilgi.expiresDate ? new Date(Number(bilgi.expiresDate)) : undefined,
      autoRenewStatus: yenileme.autoRenewStatus === undefined ? undefined : Number(yenileme.autoRenewStatus),
    };
  }

  /**
   * Bildirimin (ya da Apple yanıtının) imzalı yükünden gövdeyi okur.
   *
   * İMZAYI DOĞRULAMAZ — bilerek. Buradan çıkan tek şey originalTransactionId
   * gibi bir KİMLİKTİR; hak veren karar her zaman abonelikDurumu() ile Apple'a
   * sorularak verilir.
   */
  jwsGovdesiniOku(jws: unknown): any | null {
    if (typeof jws !== "string") return null;
    const parcalar = jws.split(".");
    if (parcalar.length !== 3) return null;
    try {
      return JSON.parse(Buffer.from(parcalar[1], "base64url").toString("utf8"));
    } catch {
      return null;
    }
  }

  /** App Store Connect API jetonu (ES256, 20 dk ömürlü). */
  private jwtUret(): string {
    const issuer = process.env.APPSTORE_ISSUER_ID!.trim();
    const keyId = process.env.APPSTORE_KEY_ID!.trim();
    const bundleId = process.env.APPSTORE_BUNDLE_ID!.trim();
    // Ortam değişkenine tek satırda yazılabilsin diye \n kaçışları geri çevriliyor.
    const pem = process.env.APPSTORE_PRIVATE_KEY!.replace(/\\n/g, "\n");

    const simdi = Math.floor(Date.now() / 1000);
    const header = { alg: "ES256", kid: keyId, typ: "JWT" };
    const payload = { iss: issuer, iat: simdi, exp: simdi + 20 * 60, aud: "appstoreconnect-v1", bid: bundleId };

    const govde = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
    const imzalayici = createSign("SHA256");
    imzalayici.update(govde);
    // JOSE ham r||s bekler; Node varsayılan olarak DER üretir ve Apple onu reddeder.
    const imza = imzalayici.sign({ key: createPrivateKey(pem), dsaEncoding: "ieee-p1363" });
    return `${govde}.${imza.toString("base64url")}`;
  }
}

function b64url(metin: string): string {
  return Buffer.from(metin, "utf8").toString("base64url");
}
