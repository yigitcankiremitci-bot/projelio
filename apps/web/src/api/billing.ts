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

  /** İndirim kodu önizlemesi; kullanımı YAZMAZ, tutar ödemede sunucuda yeniden hesaplanır. */
  indirimOnizle: (body: { kod: string; kapsam: "abonelik" | "lio"; planKey?: string; period?: string; packageKey?: string }) =>
    api.post<IndirimOzeti>("/billing/indirim-kodu/onizle", body),

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
    indirimKodlari: () => api.get<AdminIndirimKodu[]>("/billing/admin/indirim-kodlari"),
    indirimKoduOlustur: (body: YeniIndirimKodu) => api.post<AdminIndirimKodu>("/billing/admin/indirim-kodlari", body),
    indirimKoduAktiflik: (id: string, aktif: boolean) =>
      api.patch<{ ok: boolean }>(`/billing/admin/indirim-kodlari/${id}`, { aktif }),
  },
  /**
   * Lio Bakiyesi siparişi için PayTR ödeme formunu açar.
   * Tutar gönderilmez — sunucu siparişin kendi tutarını kullanır.
   */
  paytr: {
    /**
     * Abonelik formları: yalnızca gizli alanlar döner, kart tarayıcıda girilir
     * ve form doğrudan PayTR'ye gider (bkz. components/PayTRKartFormu).
     */
    abonelik: (body: {
      planKey: string;
      period: string;
      scope?: string;
      organizationId?: string;
      onay: boolean;
      indirimKodu?: string;
    }) =>
      api.post<PayTRForm>("/billing/paytr/abonelik", body),
    gecikmisOdeme: (subscriptionId: string, onay: boolean) =>
      api.post<PayTRForm>(`/billing/paytr/abonelik/${subscriptionId}/odeme`, { onay }),
    kartDegisim: (subscriptionId: string, onay: boolean) =>
      api.post<PayTRForm>(`/billing/paytr/abonelik/${subscriptionId}/kart`, { onay }),
    bakiyeOdemesiBaslat: (orderId: string) =>
      api.post<{ token: string; iframeUrl: string; testMode: boolean }>(
        `/billing/paytr/lio-bakiyesi/${orderId}`,
        {}
      ),
  },
};

export type IndirimSuresi = "ilk" | "donem" | "surekli";

export interface IndirimOzeti {
  kod: string;
  tur: "yuzde" | "tutar";
  deger: number;
  sure: IndirimSuresi;
  donemSayisi: number | null;
  listeTutari: number;
  tutar: number;
}

export interface YeniIndirimKodu {
  kod: string;
  aciklama?: string;
  tur: "yuzde" | "tutar";
  deger: number;
  kapsam: "abonelik" | "lio" | "hepsi";
  planKeys?: string[] | null;
  periods?: string[] | null;
  sure: IndirimSuresi;
  donemSayisi?: number | null;
  sonTarih?: string | null;
  kullanimSiniri?: number | null;
}

export interface AdminIndirimKodu extends YeniIndirimKodu {
  id: string;
  aktif: boolean;
  kullanimSayisi: number;
  createdAt: string;
}

/** PayTR Direkt API formu: action + gizli alanlar (kart alanları YOK). */
export interface PayTRForm {
  action: string;
  alanlar: Record<string, string>;
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
