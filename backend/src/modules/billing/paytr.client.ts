import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { fetchWithTimeout } from "../../common/http/fetch-with-timeout";
import { bildirimGecerliMi, durumSorguTokeni, iframeTokeni, kurusaCevir } from "./paytr-imza";

/**
 * PayTR iFrame API'sinin ince istemcisi.
 *
 * KAPSAM: yalnızca tek seferlik ödeme (Lio Bakiyesi paketleri). Abonelik için
 * gereken Direkt API + Kart Saklama servisleri BURADA YOK — o yetkiler mağazaya
 * henüz tanımlı değil ve tanımlanmadan yazılacak kod test edilemez. Geldiğinde
 * bu sınıfın üstüne eklenir; imza üretimi (paytr-imza.ts) ikisinde de aynıdır.
 *
 * NEDEN iFRAME: kart bilgisi PayTR'nin gömülü formuna girilir, bizim sunucumuza
 * hiç uğramaz. Direkt API'de form bizim sayfamızda olurdu (yine doğrudan PayTR'ye
 * POST edilerek) ve o sayfanın güvenliği tamamen bize ait olurdu.
 *
 * ANAHTAR YOKSA SESSİZCE ÇALIŞMAZ (isConfigured false). "Yapılandırılmamışsa
 * başarılı say" gibi bir kısayol yok: öyle bir kısayol bedava bakiye dağıtmak
 * demektir.
 */

const TOKEN_UCU = "https://www.paytr.com/odeme/api/get-token";
const DURUM_UCU = "https://www.paytr.com/odeme/durum-sorgu";
const IFRAME_TABANI = "https://www.paytr.com/odeme/guvenli";

export interface OdemeBaslatParametreleri {
  merchantOid: string;
  email: string;
  /** TL cinsinden, ondalıklı (ör. 249). Kuruşa çevirme burada yapılır. */
  tutar: number;
  /** Müşterinin gerçek IP'si — PayTR sahtecilik kontrolünde kullanıyor. */
  userIp: string;
  userName: string;
  userPhone: string;
  userAddress: string;
  /** [ürün adı, birim fiyat (metin), adet] üçlüleri. */
  sepet: Array<[string, string, number]>;
  basariliUrl: string;
  basarisizUrl: string;
  dil?: "tr" | "en";
}

export interface OdemeBaslatSonucu {
  token: string;
  /** Arayüzün iframe'e vereceği tam adres. */
  iframeUrl: string;
}

export class PayTRHatasi extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayTRHatasi";
  }
}

@Injectable()
export class PayTRClient {
  private readonly logger = new Logger(PayTRClient.name);

  private get merchantId(): string {
    return process.env.PAYTR_MERCHANT_ID?.trim() ?? "";
  }

  private get merchantKey(): string {
    return process.env.PAYTR_MERCHANT_KEY?.trim() ?? "";
  }

  private get merchantSalt(): string {
    return process.env.PAYTR_MERCHANT_SALT?.trim() ?? "";
  }

  isConfigured(): boolean {
    return Boolean(this.merchantId && this.merchantKey && this.merchantSalt);
  }

  /**
   * Test modu VARSAYILAN olarak AÇIK.
   *
   * iyzico'da `IYZICO_BASE_URL` tanımsızken üretime düşmek, yarım kalmış bir
   * kurulumda gerçek kartlardan para çekmek demekti; oradaki karar burada da
   * geçerli. Canlıya geçerken PAYTR_TEST_MODE=0 yazılır.
   */
  isTestMode(): boolean {
    return (process.env.PAYTR_TEST_MODE ?? "1").trim() !== "0";
  }

  /**
   * Ödeme formunu açacak iframe token'ını alır.
   *
   * Kart bilgisi bu isteğe DAHİL DEĞİL: token yalnızca siparişi tanımlar, kartı
   * müşteri PayTR'nin formuna girer.
   */
  async odemeBaslat(params: OdemeBaslatParametreleri): Promise<OdemeBaslatSonucu> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException("Ödeme sağlayıcısı yapılandırılmamış.");
    }

    // Tutar TEK BİR YERDE metne çevriliyor: imzaya giren metinle gövdeye giden
    // metin ayrışırsa PayTR isteği reddeder ve sebebini söylemez.
    const paymentAmount = kurusaCevir(params.tutar);
    const testMode = this.isTestMode() ? "1" : "0";

    // Sepet İMZAYA GİRİYOR (iFrame API'nin farkı bu). Base64 metni tek yerde
    // üretiliyor: imzaya giren metinle gövdeye giden metin ayrışırsa PayTR
    // "paytr_token gecersiz" der ve hangi alanın sorun olduğunu SÖYLEMEZ.
    const userBasketB64 = Buffer.from(JSON.stringify(params.sepet), "utf8").toString("base64");
    // Taksit kapalı: Lio Bakiyesi küçük tutarlı ve tek çekim.
    const noInstallment = "1";
    const maxInstallment = "0";

    const paytrToken = iframeTokeni(
      {
        merchantId: this.merchantId,
        userIp: params.userIp,
        merchantOid: params.merchantOid,
        email: params.email,
        paymentAmount,
        userBasketB64,
        noInstallment,
        maxInstallment,
        currency: "TL",
        testMode,
      },
      this.merchantKey,
      this.merchantSalt
    );

    const govde = new URLSearchParams({
      merchant_id: this.merchantId,
      user_ip: params.userIp,
      merchant_oid: params.merchantOid,
      email: params.email,
      payment_amount: paymentAmount,
      paytr_token: paytrToken,
      user_basket: userBasketB64,
      debug_on: "1",
      no_installment: noInstallment,
      max_installment: maxInstallment,
      user_name: params.userName,
      user_address: params.userAddress,
      user_phone: params.userPhone,
      merchant_ok_url: params.basariliUrl,
      merchant_fail_url: params.basarisizUrl,
      timeout_limit: "30",
      currency: "TL",
      test_mode: testMode,
      lang: params.dil ?? "tr",
    });

    const yanit = await fetchWithTimeout(
      TOKEN_UCU,
      { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: govde.toString() },
      15_000
    );

    if (!yanit.ok) {
      throw new PayTRHatasi(`PayTR token isteği başarısız: HTTP ${yanit.status}`);
    }

    const sonuc = (await yanit.json()) as { status?: string; token?: string; reason?: string };
    if (sonuc?.status !== "success" || !sonuc.token) {
      // `reason` kullanıcıya gösterilmiyor: PayTR burada entegrasyon hatasını
      // (eksik alan, geçersiz token) anlatıyor, müşterinin işine yaramaz.
      this.logger.error(`PayTR token reddedildi: ${sonuc?.reason ?? "sebep bildirilmedi"}`);
      throw new PayTRHatasi("Ödeme formu açılamadı.");
    }

    return { token: sonuc.token, iframeUrl: `${IFRAME_TABANI}/${sonuc.token}` };
  }

  /** Gelen bildirimin imzasını doğrular. */
  bildirimDogrula(govde: Record<string, unknown>): boolean {
    if (!this.isConfigured()) return false;
    return bildirimGecerliMi(govde as never, this.merchantKey, this.merchantSalt);
  }

  /**
   * Bir siparişin durumunu PayTR'ye SORAR.
   *
   * Bildirim zaten imzalı geldiği için olağan akışta gerekmiyor; mutabakat ve
   * "bildirim hiç ulaşmadı mı, yoksa biz mi kaçırdık" sorusu için var.
   * Ulaşılamazsa null döner — çağıran bunu "ödenmedi" saymamalı.
   */
  async durumSorgu(merchantOid: string): Promise<{ status: string; totalAmount?: string } | null> {
    if (!this.isConfigured()) return null;

    const hash = durumSorguTokeni(
      { merchantId: this.merchantId, merchantOid },
      this.merchantKey,
      this.merchantSalt
    );
    const govde = new URLSearchParams({ merchant_id: this.merchantId, merchant_oid: merchantOid, paytr_token: hash });

    try {
      const yanit = await fetchWithTimeout(
        DURUM_UCU,
        { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: govde.toString() },
        15_000
      );
      if (!yanit.ok) return null;
      const sonuc = (await yanit.json()) as { status?: string; payment_amount?: string };
      return sonuc?.status ? { status: sonuc.status, totalAmount: sonuc.payment_amount } : null;
    } catch (hata) {
      this.logger.warn(`PayTR durum sorgusu başarısız (${merchantOid}): ${hata instanceof Error ? hata.message : hata}`);
      return null;
    }
  }
}
