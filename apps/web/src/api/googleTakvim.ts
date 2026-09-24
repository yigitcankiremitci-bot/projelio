import type {
  GoogleTakvimDurumu,
  GoogleTakvimEtkinligi,
  GoogleTakvimEtkinlikGirdisi,
  TakvimIsleme,
} from "@projelio/shared";
import { api } from "./client";

/** Google Takvim entegrasyonu (bkz. backend modules/google-takvim, migration 133). */
export const googleTakvimApi = {
  durum: () => api.get<GoogleTakvimDurumu>("/google-takvim"),
  /** `donus`: Google'dan sonra dönülecek uygulama içi sayfa (varsayılan takvim). */
  baglantiAdresi: (donus?: string) =>
    api.get<{ url: string }>(`/google-takvim/baglan${donus ? `?donus=${encodeURIComponent(donus)}` : ""}`),
  kes: () => api.delete<GoogleTakvimDurumu>("/google-takvim"),
  ayarlar: (yama: { seciliTakvimler?: string[]; hedefTakvimId?: string }) =>
    api.patch<GoogleTakvimDurumu>("/google-takvim/ayarlar", yama),
  takvimleriYenile: () => api.post<GoogleTakvimDurumu>("/google-takvim/takvimler/yenile", {}),

  etkinlikler: (from: string, to: string) =>
    api.get<GoogleTakvimEtkinligi[]>(`/google-takvim/etkinlikler?from=${from}&to=${to}`),
  esitle: (from: string, to: string, zorla = false) =>
    api.post<{ sonEsitleme: string | null; hata?: string }>("/google-takvim/esitle", { from, to, zorla }),
  ekle: (girdi: GoogleTakvimEtkinlikGirdisi) => api.post<GoogleTakvimEtkinligi>("/google-takvim/etkinlikler", girdi),
  duzenle: (id: string, girdi: GoogleTakvimEtkinlikGirdisi) =>
    api.patch<GoogleTakvimEtkinligi>(`/google-takvim/etkinlikler/${id}`, girdi),
  sil: (id: string) => api.delete<{ ok: true }>(`/google-takvim/etkinlikler/${id}`),
  isleme: (id: string, isleme: TakvimIsleme, gorevId?: string | null) =>
    api.patch<GoogleTakvimEtkinligi>(`/google-takvim/etkinlikler/${id}/isleme`, { isleme, gorevId }),

  blokuGonder: (blokId: string) => api.post<GoogleTakvimEtkinligi>(`/google-takvim/bloklar/${blokId}`, {}),
  blokBaginiKaldir: (blokId: string) => api.delete<{ ok: true }>(`/google-takvim/bloklar/${blokId}`),
};
