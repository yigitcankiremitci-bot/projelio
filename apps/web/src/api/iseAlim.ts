import type { IseAlimDaveti, IseAlimGirdisi, SirketEkibi } from "@projelio/shared";
import { api } from "./client";

/**
 * İşe alım daveti uçları (bkz. backend modules/ise-alim, migration 143).
 * Form seçenekleri Ekip Hesapları'yla ortak: ekipHesaplariApi.secenekler.
 */
export const iseAlimApi = {
  ekip: (organizationId: string) => api.get<SirketEkibi>(`/organizations/${organizationId}/ekip`),
  davetEt: (organizationId: string, girdi: IseAlimGirdisi) =>
    api.post<IseAlimDaveti>(`/organizations/${organizationId}/ise-alim`, girdi),
  davetlerim: () => api.get<IseAlimDaveti[]>(`/ise-alim/davetlerim`),
  detay: (id: string) => api.get<IseAlimDaveti>(`/ise-alim/${id}`),
  yanitla: (id: string, kabul: boolean) => api.post<IseAlimDaveti>(`/ise-alim/${id}/yanit`, { kabul }),
  iptal: (id: string) => api.post<{ success: true }>(`/ise-alim/${id}/iptal`, {}),
};
