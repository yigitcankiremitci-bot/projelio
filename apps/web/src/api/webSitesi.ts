import type { WebSitesiBaglantisi, WebSitesiOzeti, WebSitesiSirlari } from "@projelio/shared";
import { api } from "./client";

/** Şirket ayarlarındaki "Web sitesi" kartının uçları (bkz. backend/src/modules/web-sitesi). */
export interface WebSitesiGirdisi {
  ad?: string;
  siteAdresi?: string | null;
  webhookAdresi?: string | null;
}

export const webSitesiApi = {
  ozet: (organizationId: string) => api.get<WebSitesiOzeti>(`/organizations/${organizationId}/web-sitesi`),
  olustur: (organizationId: string, girdi: WebSitesiGirdisi) =>
    api.post<WebSitesiSirlari>(`/organizations/${organizationId}/web-sitesi`, girdi),
  guncelle: (id: string, girdi: WebSitesiGirdisi) => api.patch<WebSitesiBaglantisi>(`/web-sitesi/baglantilar/${id}`, girdi),
  anahtarYenile: (id: string) => api.post<WebSitesiSirlari>(`/web-sitesi/baglantilar/${id}/anahtar`, {}),
  sirGoster: (id: string) => api.get<{ webhookSiri: string }>(`/web-sitesi/baglantilar/${id}/sir`),
  dene: (id: string) => api.post<{ ok: boolean; durum?: number; hata?: string }>(`/web-sitesi/baglantilar/${id}/dene`, {}),
  yenidenGonder: (id: string) => api.post<WebSitesiBaglantisi>(`/web-sitesi/baglantilar/${id}/yeniden-gonder`, {}),
  kaldir: (id: string) => api.delete<{ success: true }>(`/web-sitesi/baglantilar/${id}`),
};
