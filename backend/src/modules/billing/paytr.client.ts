import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { fetchWithTimeout } from "../../common/http/fetch-with-timeout";
import {
  bildirimGecerliMi,
  direktOdemeTokeni,
  durumSorguTokeni,
  iframeTokeni,
  kartListesiTokeni,
  kartSilmeTokeni,
  kurusaCevir,
  ondalikTutar,
} from "./paytr-imza";

/**
 * PayTR iFrame API'sinin ince istemcisi.
 *
 * KAPSAM: tek seferlik ödeme (Lio Bakiyesi, iFrame API) + Direkt API ile kart
 * saklama, saklı kart listesi/silme ve saklı karttan Non3D tekrarlayan çekim.
 * Direkt API + Kart Saklama + Non3D yetkileri mağazaya 2026-09-24'te tanımlandı.
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
/** Direkt API ödeme ucu — hem tarayıcıdaki kart formu hem tekrarlayan çekim buraya gider. */
export const DIREKT_ODEME_UCU = "https://www.paytr.com/odeme";
const KART_LISTESI_UCU = "https://www.paytr.com/odeme/capi/list";
const KART_SILME_UCU = "https://www.paytr.com/odeme/capi/delete";

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

/** Direkt API'de müşterinin tarayıcısından PayTR'ye gönderilecek kart formu. */
export interface DirektFormParametreleri {
  merchantOid: string;
  email: string;
  /** TL cinsinden, ondalıklı. Ondalık metne çevirme burada yapılır (kuruş DEĞİL). */
  tutar: number;
  userIp: string;
  userName: string;
  userPhone: string;
  userAddress: string;
  sepet: Array<[string, string, number]>;
  basariliUrl: string;
  basarisizUrl: string;
  /** Kartı PayTR'de sakla. */
  kartSakla: boolean;
  /** Kullanıcının mevcut utoken'ı — varsa MUTLAKA gönderilir, yoksa kartları iki gruba bölünür. */
  utoken?: string | null;
  dil?: "tr" | "en";
}

export interface DirektFormu {
  /** Formun action'ı. */
  action: string;
  /**
   * Gizli alanlar. Kart alanları (cc_owner, card_number, expiry_month,
   * expiry_year, cvv) BURADA YOK: onları müşteri tarayıcıda girer ve form
   * doğrudan PayTR'ye gider — sunucumuza hiç uğramaz.
   */
  alanlar: Record<string, string>;
}

/** CAPI LIST'in döndürdüğü bir saklı kart. */
export interface SakliKart {
  ctoken: string;
  last4: string;
  /** 1 ise PayTR bu kartla her çekimde CVV istiyor — gözetimsiz yenileme YAPILAMAZ. */
  requireCvv: boolean;
  ay: string;
  yil: string;
  banka: string;
  tur: string;
  sema: string;
}

/** Saklı karttan tekrarlayan çekimin eşzamanlı yanıtı. */
export interface TekrarlayanCekimSonucu {
  /** "success" | "failed" | "wait_callback" — kesin sonuç her durumda bildirimle gelir. */
  status: string;
  msg?: string;
  /** PayTR'nin "yeniden denenebilir" işareti (ör. yetersiz bakiye değil, geçici banka hatası). */
  tryAgain?: boolean;
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
      throw new PayTRHatasi("Ödeme formu açılamadı."); // dil:anahtar
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

  /**
   * Direkt API kart formunun gizli alanlarını üretir. 3D ile (non_3d=0) —
   * kart saklanan ilk ödeme HER ZAMAN 3D'li: PayTR'ye "ilk ödeme 3D, Non3D
   * yalnızca otomatik yenilemede" diye söz verdik (2026-09-23 destek talebi).
   *
   * Sepet Direkt API'de İMZAYA GİRMİYOR ve base64 DEĞİL, düz JSON gidiyor —
   * iFrame'in tam tersi.
   */
  direktForm(params: DirektFormParametreleri): DirektFormu {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException("Ödeme sağlayıcısı yapılandırılmamış.");
    }

    const paymentAmount = ondalikTutar(params.tutar);
    const testMode = this.isTestMode() ? "1" : "0";
    const non3d = "0";
    const installmentCount = "0";

    const paytrToken = direktOdemeTokeni(
      {
        merchantId: this.merchantId,
        userIp: params.userIp,
        merchantOid: params.merchantOid,
        email: params.email,
        paymentAmount,
        paymentType: "card",
        installmentCount,
        currency: "TL",
        testMode,
        non3d,
      },
      this.merchantKey,
      this.merchantSalt
    );

    const alanlar: Record<string, string> = {
      merchant_id: this.merchantId,
      paytr_token: paytrToken,
      user_ip: params.userIp,
      merchant_oid: params.merchantOid,
      email: params.email,
      payment_type: "card",
      payment_amount: paymentAmount,
      installment_count: installmentCount,
      currency: "TL",
      test_mode: testMode,
      non_3d: non3d,
      merchant_ok_url: params.basariliUrl,
      merchant_fail_url: params.basarisizUrl,
      user_name: params.userName,
      user_address: params.userAddress,
      user_phone: params.userPhone,
      user_basket: JSON.stringify(params.sepet),
      client_lang: params.dil ?? "tr",
      debug_on: "1",
    };
    if (params.kartSakla) alanlar.store_card = "1";
    if (params.utoken) alanlar.utoken = params.utoken;

    return { action: DIREKT_ODEME_UCU, alanlar };
  }

  /**
   * Kullanıcının PayTR'de saklı kartlarını SORAR (CAPI LIST).
   * Kart bilgisinin kopyası bizde tutulmuyor; her seferinde buradan gelir.
   */
  async kartListesi(utoken: string): Promise<SakliKart[]> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException("Ödeme sağlayıcısı yapılandırılmamış.");
    }
    const govde = new URLSearchParams({
      merchant_id: this.merchantId,
      utoken,
      paytr_token: kartListesiTokeni(utoken, this.merchantKey, this.merchantSalt),
    });
    const yanit = await fetchWithTimeout(
      KART_LISTESI_UCU,
      { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: govde.toString() },
      15_000
    );
    if (!yanit.ok) throw new PayTRHatasi(`PayTR kart listesi alınamadı: HTTP ${yanit.status}`);

    const sonuc = (await yanit.json()) as unknown;
    // Başarıda kart DİZİSİ, hatada { status: "error", err_msg } dönüyor.
    if (!Array.isArray(sonuc)) {
      const hata = sonuc as { err_msg?: string; reason?: string } | null;
      this.logger.error(`PayTR kart listesi reddedildi: ${hata?.err_msg ?? hata?.reason ?? JSON.stringify(sonuc)}`);
      throw new PayTRHatasi("Kayıtlı kartlar alınamadı."); // dil:anahtar
    }
    return sonuc.map((k: Record<string, unknown>) => ({
      ctoken: String(k.ctoken ?? ""),
      last4: String(k.last_4 ?? ""),
      requireCvv: String(k.require_cvv ?? "") === "1",
      ay: String(k.month ?? ""),
      yil: String(k.year ?? ""),
      banka: String(k.c_bank ?? ""),
      tur: String(k.c_type ?? ""),
      sema: String(k.schema ?? ""),
    }));
  }

  /**
   * Saklı karttan Non3D tekrarlayan çekim — müşteri ekran başında DEĞİL.
   *
   * Yanıt eşzamanlı JSON; "success" dönse bile ödemenin kesin kanıtı yine
   * imzalı bildirimdir (repo kuralı). Bu yanıt yalnızca "denemenin ne olduğunu
   * hemen bil" için.
   */
  async tekrarlayanCekim(params: {
    merchantOid: string;
    email: string;
    tutar: number;
    userIp: string;
    userName: string;
    userPhone: string;
    userAddress: string;
    sepet: Array<[string, string, number]>;
    utoken: string;
    ctoken: string;
    basariliUrl: string;
    basarisizUrl: string;
  }): Promise<TekrarlayanCekimSonucu> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException("Ödeme sağlayıcısı yapılandırılmamış.");
    }

    const paymentAmount = ondalikTutar(params.tutar);
    const testMode = this.isTestMode() ? "1" : "0";
    const non3d = "1";
    const installmentCount = "0";

    const paytrToken = direktOdemeTokeni(
      {
        merchantId: this.merchantId,
        userIp: params.userIp,
        merchantOid: params.merchantOid,
        email: params.email,
        paymentAmount,
        paymentType: "card",
        installmentCount,
        currency: "TL",
        testMode,
        non3d,
      },
      this.merchantKey,
      this.merchantSalt
    );

    const govde = new URLSearchParams({
      merchant_id: this.merchantId,
      paytr_token: paytrToken,
      user_ip: params.userIp,
      merchant_oid: params.merchantOid,
      email: params.email,
      payment_type: "card",
      payment_amount: paymentAmount,
      installment_count: installmentCount,
      currency: "TL",
      test_mode: testMode,
      non_3d: non3d,
      recurring_payment: "1",
      utoken: params.utoken,
      ctoken: params.ctoken,
      merchant_ok_url: params.basariliUrl,
      merchant_fail_url: params.basarisizUrl,
      user_name: params.userName,
      user_address: params.userAddress,
      user_phone: params.userPhone,
      user_basket: JSON.stringify(params.sepet),
      debug_on: "1",
    });

    const yanit = await fetchWithTimeout(
      DIREKT_ODEME_UCU,
      { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: govde.toString() },
      30_000
    );
    if (!yanit.ok) throw new PayTRHatasi(`PayTR tekrarlayan çekim isteği başarısız: HTTP ${yanit.status}`);

    // Yanıtın JSON olmaması (ör. HTML hata sayfası) mümkün; ham metni de
    // gösterelim ki sebep log'da görünsün.
    const metin = await yanit.text();
    try {
      const sonuc = JSON.parse(metin) as { status?: string; msg?: string; try_again?: unknown };
      return {
        status: String(sonuc.status ?? "bilinmiyor"),
        msg: sonuc.msg,
        tryAgain: sonuc.try_again === true || String(sonuc.try_again) === "1",
      };
    } catch {
      this.logger.error(`PayTR tekrarlayan çekim yanıtı JSON değil: ${metin.slice(0, 300)}`);
      return { status: "bilinmiyor", msg: metin.slice(0, 300) };
    }
  }

  /** Saklı bir kartı PayTR'den siler (CAPI DELETE). */
  async kartSil(utoken: string, ctoken: string): Promise<void> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException("Ödeme sağlayıcısı yapılandırılmamış.");
    }
    const govde = new URLSearchParams({
      merchant_id: this.merchantId,
      utoken,
      ctoken,
      paytr_token: kartSilmeTokeni({ utoken, ctoken }, this.merchantKey, this.merchantSalt),
    });
    const yanit = await fetchWithTimeout(
      KART_SILME_UCU,
      { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: govde.toString() },
      15_000
    );
    if (!yanit.ok) throw new PayTRHatasi(`PayTR kart silme başarısız: HTTP ${yanit.status}`);
    const sonuc = (await yanit.json()) as { status?: string; err_msg?: string };
    if (sonuc?.status !== "success") {
      this.logger.error(`PayTR kart silme reddedildi: ${sonuc?.err_msg ?? "sebep bildirilmedi"}`);
      throw new PayTRHatasi("Kart silinemedi."); // dil:anahtar
    }
  }
}
