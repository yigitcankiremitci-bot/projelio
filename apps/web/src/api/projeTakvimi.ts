import type { ProjeEtkinligi, ProjeEtkinlikGirdisi, ProjeTakvimGorunumu } from "@projelio/shared";
import { api } from "./client";

/** Proje takvimi (bkz. backend modules/calendar, migration 152). */
export const projeTakvimiApi = {
  gorunum: (projectId: string, from: string, to: string) =>
    api.get<ProjeTakvimGorunumu>(`/calendar/projects/${projectId}?from=${from}&to=${to}`),
  /** Kişisel Takvim'e düşen proje etkinlikleri. */
  benim: (from: string, to: string) => api.get<ProjeEtkinligi[]>(`/calendar/mine?from=${from}&to=${to}`),
  ekle: (projectId: string, girdi: ProjeEtkinlikGirdisi) =>
    api.post<ProjeEtkinligi>(`/calendar/projects/${projectId}/events`, girdi),
  duzenle: (id: string, girdi: ProjeEtkinlikGirdisi) => api.patch<ProjeEtkinligi>(`/calendar/events/${id}`, girdi),
  sil: (id: string) => api.delete<{ ok: true }>(`/calendar/events/${id}`),
};
