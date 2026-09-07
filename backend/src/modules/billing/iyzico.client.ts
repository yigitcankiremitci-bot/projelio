import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { fetchWithTimeout } from "../../common/http/fetch-with-timeout";
import { authorizationHeader } from "./iyzico-imza";

/**
 * iyzico Abonelik API'sinin ince istemcisi.
 *
 * ÖLÇEK BİLİNÇLİ OLARAK DAR: yalnızca abonelik akışının gerçekten kullandığı
 * uçlar var. Ürün/ödeme planı oluşturma uçları YOK — planlar iyzico panelinden
 * açılıyor ve referans kodları billing_plan_refs'e yazılıyor. Nedeni, planın
 * tutarının sağlayıcıda sabitlenmesi: kod planı kendi oluştursaydı fiyat iki
 * yerde tanımlı olurdu ve ayrışması kaçınılmazdı.
 *
 * ANAHTAR YOKSA SESSİZCE ÇALIŞMAZ (isConfigured false) — "yapılandırılmamışsa
 * başarılı say" gibi bir kısayol yok; öyle bir kısayol bedava abonelik dağıtmak
 * demektir (bkz. ai-payment.provider.ts'teki aynı uyarı).
 */

const URETIM_TABANI = "https://api.iyzipay.com";
const KUM_HAVUZU_TABANI = "https://sandbox-api.iyzipay.com";

export interface IyzicoMusteri {
  name: string;
  surname: string;
  email: string;
  gsmNumber?: string;
  identityNumber?: string;
  billingAddress: {
    contactName: string;
    city: string;
    country: string;
    address: string;
    zipCode?: string;
  };
}

export interface CheckoutFormBaslatSonucu {
  token: string;
  checkoutFormContent: string;
  tokenExpireTime: number;
}

export interface AbonelikSonucu {
  referenceCode?: string;
  parentReferenceCode?: string;
  customerReferenceCode?: string;
  pricingPlanReferenceCode?: string;
  subscriptionStatus?: string;
  startDate?: string | number;
  endDate?: string | number;
  trialEndDate?: string | number;
  [key: string]: unknown;
}

export class IyzicoHatasi extends Error {
  readonly errorCode?: string;

  constructor(message: string, errorCode?: string) {
    super(message);
    this.name = "IyzicoHatasi";
    this.errorCode = errorCode;
  }
}

@Injectable()
export class IyzicoClient {
  private readonly logger = new Logger(IyzicoClient.name);

  private get apiKey(): string {
    return process.env.IYZICO_API_KEY?.trim() ?? "";
  }

  private get secretKey(): string {
    return process.env.IYZICO_SECRET_KEY?.trim() ?? "";
  }

  /**
   * Taban adres AÇIKÇA seçilir; tanımsızsa KUM HAVUZU kullanılır.
   *
   * Varsayılanı üretim yapmak, yapılandırmayı yarım bırakılmış bir kurulumda
   * gerçek kartlardan para çekmek demekti. Ters yön (kum havuzunda kalıp para
   * alamamak) fark edilir ve düzeltilir; bu yön edilmez.
   */
  private get baseUrl(): string {
    const secilen = process.env.IYZICO_BASE_URL?.trim();
    if (!secilen) return KUM_HAVUZU_TABANI;
    return secilen.replace(/\/+$/, "");
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.secretKey);
  }

  /** Üretim ortamına mı bağlıyız — arayüzde "test modu" uyarısı için. */
  isLive(): boolean {
    return this.baseUrl === URETIM_TABANI;
  }

  /** Abonelik ödeme formunu başlatır; dönen token callback'te sonucu çekmeye yarar. */
  async checkoutFormBaslat(params: {
    pricingPlanReferenceCode: string;
    callbackUrl: string;
    customer: IyzicoMusteri;
    conversationId: string;
    locale?: "tr" | "en";
  }): Promise<CheckoutFormBaslatSonucu> {
    return this.istek<CheckoutFormBaslatSonucu>("POST", "/v2/subscription/checkoutform/initialize", {
      callbackUrl: params.callbackUrl,
      pricingPlanReferenceCode: params.pricingPlanReferenceCode,
      subscriptionInitialStatus: "ACTIVE",
      conversationId: params.conversationId,
      locale: params.locale ?? "tr",
      customer: params.customer,
    });
  }

  /**
   * Ödeme formunun sonucunu token ile çeker.
   *
   * KRİTİK: aboneliğin gerçekten açıldığının kanıtı BURASIDIR, tarayıcının
   * callback'e dönmesi değil. Callback adresi kullanıcının tarayıcısından
   * çağrılır; oraya elle de gidilebilir.
   */
  async checkoutSonucu(token: string): Promise<AbonelikSonucu> {
    return this.istek<AbonelikSonucu>("GET", `/v2/subscription/checkoutform/${encodeURIComponent(token)}`);
  }

  async aboneligiGetir(referenceCode: string): Promise<AbonelikSonucu> {
    return this.istek<AbonelikSonucu>("GET", `/v2/subscription/subscriptions/${encodeURIComponent(referenceCode)}`);
  }

  async iptalEt(referenceCode: string): Promise<AbonelikSonucu> {
    return this.istek<AbonelikSonucu>(
      "POST",
      `/v2/subscription/subscriptions/${encodeURIComponent(referenceCode)}/cancel`
    );
  }

  /** Kartı değişen abonenin yeni kartını almak için ödeme formu açar. */
  async kartGuncellemeFormu(params: {
    customerReferenceCode: string;
    subscriptionReferenceCode?: string;
    callbackUrl: string;
    locale?: "tr" | "en";
  }): Promise<CheckoutFormBaslatSonucu> {
    return this.istek<CheckoutFormBaslatSonucu>("POST", "/v2/subscription/card-update/checkoutform/initialize", {
      callbackUrl: params.callbackUrl,
      customerReferenceCode: params.customerReferenceCode,
      subscriptionReferenceCode: params.subscriptionReferenceCode,
      locale: params.locale ?? "tr",
    });
  }

  private async istek<T>(method: "GET" | "POST", uriPath: string, govde?: unknown): Promise<T> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException("Ödeme sağlayıcısı yapılandırılmamış.");
    }

    // Gövde metni BİR KEZ üretilip hem imzada hem istekte kullanılıyor: yeniden
    // JSON.stringify etmek alan sırasını değiştirip imzayı geçersiz kılabilir.
    const body = govde === undefined ? undefined : JSON.stringify(govde);
    const { authorization, randomKey } = authorizationHeader({
      apiKey: this.apiKey,
      secretKey: this.secretKey,
      uriPath,
      body,
    });

    let response: Response;
    try {
      response = await fetchWithTimeout(`${this.baseUrl}${uriPath}`, {
        method,
        headers: {
          Authorization: authorization,
          "x-iyzi-rnd": randomKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body,
      });
    } catch (error) {
      // Ağ hatası ile "iyzico reddetti" birbirinden ayrı: ilki tekrar denenebilir,
      // ikincisi denenmemeli. Çağıran taraf bu ayrımı istisna tipinden görüyor.
      this.logger.error(`iyzico ${uriPath} çağrısı ağ hatası: ${(error as Error).message}`);
      throw new ServiceUnavailableException("Ödeme sağlayıcısına ulaşılamadı, biraz sonra tekrar dene.");
    }

    const metin = await response.text();
    let veri: any;
    try {
      veri = metin ? JSON.parse(metin) : {};
    } catch {
      this.logger.error(`iyzico ${uriPath} yanıtı JSON değil (HTTP ${response.status}).`);
      throw new ServiceUnavailableException("Ödeme sağlayıcısından beklenmeyen yanıt.");
    }

    // iyzico hatayı HTTP 200 içinde de dönebiliyor: status alanına bakmadan
    // "200 aldık, oldu" demek, başarısız bir ödemeyi başarılı saymak olurdu.
    if (!response.ok || veri?.status === "failure") {
      const kod = veri?.errorCode ? String(veri.errorCode) : undefined;
      const mesaj = veri?.errorMessage ?? `iyzico çağrısı başarısız (HTTP ${response.status})`;
      this.logger.warn(`iyzico ${uriPath} reddetti: ${kod ?? "-"} ${mesaj}`);
      throw new IyzicoHatasi(String(mesaj), kod);
    }

    // Sarmalayıcı alan (data) varsa onu, yoksa gövdenin kendisini döndür:
    // abonelik uçları ikisini karışık kullanıyor.
    return (veri?.data ?? veri) as T;
  }
}
