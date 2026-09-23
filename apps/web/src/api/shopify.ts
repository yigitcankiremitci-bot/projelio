import type { ShopifyMagazaOzeti, ShopifyOzeti } from "@projelio/shared";
import { api } from "./client";

/** Şirket ayarlarındaki Shopify kartının uçları (bkz. backend/src/modules/shopify). */
export const shopifyApi = {
  ozet: (organizationId: string) => api.get<ShopifyOzeti>(`/organizations/${organizationId}/shopify`),

  /** Shopify'ın yetki ekranının adresi; tarayıcı oraya götürülür, dönüş bu şirketin sayfası. */
  baglan: (organizationId: string, magaza: string) =>
    api.post<{ url: string }>(`/organizations/${organizationId}/shopify/baglan`, { magaza }),

  sorumluAta: (magazaId: string, varsayilanSorumluId: string | null) =>
    api.patch<ShopifyMagazaOzeti>(`/shopify/magazalar/${magazaId}`, { varsayilanSorumluId }),

  kaldir: (magazaId: string) => api.delete<{ success: true }>(`/shopify/magazalar/${magazaId}`),
};
