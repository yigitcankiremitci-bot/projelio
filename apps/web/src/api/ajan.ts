import type { AjanBilgi, AjanDurumu, AjanIs, AjanKonu, AjanKonuDurumu, AjanMesaj, AjanOneri, AjanOtomasyon, AjanOtomasyonSikligi, AjanRapor, AjanRaporOzeti } from "@projelio/shared";
import { api } from "./client";

/** Ajan MVP (migration 177). Uçlar yalnızca AJAN_EPOSTALARI'ndaki hesaplara açık. */
export const ajanApi = {
  durum: (signal?: AbortSignal) => api.get<AjanDurumu>("/ajan/durum", signal),
  ayarlar: (g: { ad?: string; ogrenmeAcik?: boolean }) => api.patch<AjanDurumu>("/ajan/ayarlar", g),
  anahtarUret: () => api.post<{ anahtar: string }>("/ajan/anahtar", {}),

  mesajlar: (signal?: AbortSignal) => api.get<AjanMesaj[]>("/ajan/mesajlar", signal),
  mesajGonder: (metin: string) => api.post<AjanMesaj>("/ajan/mesajlar", { metin }),

  arastir: (konu: string) => api.post<AjanIs>("/ajan/arastir", { konu }),
  isler: (signal?: AbortSignal) => api.get<AjanIs[]>("/ajan/isler", signal),
  isIptal: (id: string) => api.delete<{ ok: true }>(`/ajan/isler/${id}`),

  raporlar: (signal?: AbortSignal) => api.get<AjanRaporOzeti[]>("/ajan/raporlar", signal),
  rapor: (id: string) => api.get<AjanRapor>(`/ajan/raporlar/${id}`),
  raporSil: (id: string) => api.delete<{ ok: true }>(`/ajan/raporlar/${id}`),

  bilgiler: (signal?: AbortSignal) => api.get<AjanBilgi[]>("/ajan/bilgiler", signal),
  ogret: (g: { baslik?: string; icerik: string }) => api.post<AjanBilgi>("/ajan/bilgiler", g),
  bilgiSil: (id: string) => api.delete<{ ok: true }>(`/ajan/bilgiler/${id}`),

  konular: (signal?: AbortSignal) => api.get<AjanKonu[]>("/ajan/konular", signal),
  konuEkle: (g: { konu: string; neden?: string }) => api.post<AjanKonu>("/ajan/konular", g),
  konuGuncelle: (id: string, g: { durum?: AjanKonuDurumu; oncelik?: number }) => api.patch<AjanKonu>(`/ajan/konular/${id}`, g),
  konuSil: (id: string) => api.delete<{ ok: true }>(`/ajan/konular/${id}`),

  oneriler: (signal?: AbortSignal) => api.get<AjanOneri[]>("/ajan/oneriler", signal),
  onayla: (id: string) => api.post<{ ok: true }>(`/ajan/oneriler/${id}/onayla`, {}),
  reddet: (id: string, not?: string) => api.post<{ ok: true }>(`/ajan/oneriler/${id}/reddet`, { not }),

  sirket: (signal?: AbortSignal) => api.get<{ metin: string; tarih: string | null }>("/ajan/sirket", signal),
  sirketTazele: () => api.post<{ metin: string; tarih: string | null }>("/ajan/sirket/tazele", {}),

  fikirler: (signal?: AbortSignal) => api.get<AjanOneri[]>("/ajan/fikirler", signal),
  fikriArastir: (id: string) => api.post<AjanIs>(`/ajan/fikirler/${id}/arastir`, {}),

  otomasyonlar: (signal?: AbortSignal) => api.get<AjanOtomasyon[]>("/ajan/otomasyonlar", signal),
  otomasyonEkle: (g: OtomasyonGirdisi) => api.post<AjanOtomasyon>("/ajan/otomasyonlar", g),
  otomasyonGuncelle: (id: string, g: Partial<OtomasyonGirdisi> & { acik?: boolean }) => api.patch<AjanOtomasyon>(`/ajan/otomasyonlar/${id}`, g),
  otomasyonSil: (id: string) => api.delete<{ ok: true }>(`/ajan/otomasyonlar/${id}`),
  otomasyonCalistir: (id: string) => api.post<AjanIs>(`/ajan/otomasyonlar/${id}/calistir`, {}),
};

export interface OtomasyonGirdisi {
  ad: string;
  talimat: string;
  siklik: AjanOtomasyonSikligi;
  saat: number;
  gun: number;
}
