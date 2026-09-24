import type { BillingOverview, Subscription } from "@projelio/shared";
import { api } from "./client";

/**
 * Abonelik uçları.
 *
 * ÖDEME FORMU HTML OLARAK GELİR: iyzico'nun checkout formu, kendi <script>'ini
 * içeren bir HTML parçası. React içine "güvenli" biçimde basmanın yolu yok;
 * ayrı bir kapsayıcıya yazılıp script'leri elle çalıştırılıyor
 * (bkz. pages/Billing.tsx odemeFormunuAc). Kaynağı sunucumuzdan geçen iyzico
 * yanıtı olduğu için bu kabul edilebilir; BAŞKA hiçbir yerde bu deseni kullanma.
 */
export const billingApi = {
  overview: (signal?: AbortSignal) => api.get<BillingOverview>("/billing/plans", signal),

  checkout: (body: { planKey: string; period: string; scope?: string; organizationId?: string }) =>
    api.post<{ token: string; checkoutFormContent: string }>("/billing/checkout", body),

  /** Ödeme dönüşünde sonucu doğrular; iki kez çağrılması güvenli. */
  confirm: (token: string) => api.post<Subscription | null>("/billing/checkout/confirm", { token }),

  cancel: (id: string) => api.post<Subscription>(`/billing/subscription/${id}/cancel`, {}),

  cardUpdate: (id: string) => api.post<{ checkoutFormContent: string }>(`/billing/subscription/${id}/card-update`, {}),

  admin: {
    settings: () => api.get<BillingAdminSettings>("/billing/admin/settings"),
    savePlanRef: (body: {
      provider: string;
      planKey: string;
      period: string;
      referenceCode: string | null;
      priceAmount: number | null;
      currency: string;
    }) => api.patch<{ ok: boolean; error?: string }>("/billing/admin/settings/plan-ref", body),
    saveUsdTry: (rate: number | null) => api.patch<{ ok: boolean; error?: string }>("/billing/admin/settings/usd-try", { rate }),
    subscriptions: (status?: string) =>
      api.get<Subscription[]>(`/billing/admin/subscriptions${status ? `?status=${status}` : ""}`),
    runRenewals: () => api.post<{ krediYuklenen: number; suresiDolan: number }>("/billing/admin/run-renewals", {}),
    /**
     * PayTR kart saklama denemesi (bkz. backend PayTRKartService). Kart verisi
     * bu uçlara GİTMEZ: form alanları alınır, kart tarayıcıda girilir ve form
     * doğrudan PayTR'ye POST edilir.
     */
    paytrKart: {
      durum: () => api.get<PayTRKartDurumu>("/billing/admin/paytr-kart"),
      form: (tutar: number) =>
        api.post<{ action: string; alanlar: Record<string, string>; testMode: boolean }>("/billing/admin/paytr-kart/form", { tutar }),
      tekrarlayan: (ctoken: string, tutar: number) =>
        api.post<{ status: string; msg?: string; tryAgain?: boolean }>("/billing/admin/paytr-kart/tekrarlayan", { ctoken, tutar }),
      sil: (ctoken: string) => api.post<{ ok: boolean }>("/billing/admin/paytr-kart/sil", { ctoken }),
    },
  },
  /**
   * Lio Bakiyesi siparişi için PayTR ödeme formunu açar.
   * Tutar gönderilmez — sunucu siparişin kendi tutarını kullanır.
   */
  paytr: {
    bakiyeOdemesiBaslat: (orderId: string) =>
      api.post<{ token: string; iframeUrl: string; testMode: boolean }>(
        `/billing/paytr/lio-bakiyesi/${orderId}`,
        {}
      ),
  },
};

export interface PayTRSakliKart {
  ctoken: string;
  last4: string;
  requireCvv: boolean;
  ay: string;
  yil: string;
  banka: string;
  tur: string;
  sema: string;
}

export interface PayTRKartDurumu {
  testMode: boolean;
  utokenVar: boolean;
  sonBildirim: {
    onek: string;
    merchantOid: string;
    status: string;
    totalAmount: string;
    failedReason: string | null;
    alanlar: string[];
    utokenGeldi: boolean;
    zaman: string;
  } | null;
  kartlar: PayTRSakliKart[];
  kartHatasi?: string;
}

export interface BillingAdminPlanRef {
  provider: string;
  planKey: string;
  period: "monthly" | "yearly";
  referenceCode: string | null;
  priceAmount: number | null;
  currency: string;
  updatedAt: string | null;
}

export interface BillingAdminSettings {
  plans: Array<{
    key: string;
    name: string;
    priceUsd: { monthly: number; yearly: number };
    monthlyCredits: number;
  }>;
  providers: string[];
  refs: BillingAdminPlanRef[];
  usdTryRate: number | null;
  /**
   * TCMB günlük kuru — yalnızca bilgi amaçlı. Tahsilat tutarı bu kurla
   * hesaplanmaz; bülten alınamazsa null gelir.
   */
  tcmb: {
    tarih: string;
    forexSelling: number;
    banknoteSelling: number;
    /** Elle girilen kur efektif satışın ne kadar gerisinde (0.08 = %8). */
    sapma: number | null;
  } | null;
}
