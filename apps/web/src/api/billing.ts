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
  },
};

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
}
