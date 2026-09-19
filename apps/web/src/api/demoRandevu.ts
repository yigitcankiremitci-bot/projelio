import type {
  DemoAyarlari,
  DemoMeetDurumu,
  DemoMusaitlik,
  DemoRandevuDurumu,
  DemoRandevuGirdisi,
  DemoRandevuGorunumu,
  DemoRandevuYonetici,
  DemoSunucu,
} from "@projelio/shared";
import { API_URL, api } from "./client";

/**
 * Canlı demo randevuları (bkz. backend modules/demo-randevu, migration 120).
 *
 * `public*` uçları KİMLİK DOĞRULAMASIZ: /demo-randevu sayfasını açan kişinin
 * hesabı yok. İptal ve taşıma üye için de yönetim token'ıyla yapılıyor —
 * e-postadaki bağlantı ile Ayarlar kartı aynı yoldan geçsin.
 */
export const demoRandevuApi = {
  musaitlik: () => api.get<DemoMusaitlik>("/public/demo/musaitlik"),
  al: (girdi: DemoRandevuGirdisi) => api.post<DemoRandevuGorunumu | { ok: true }>("/public/demo/randevu", girdi),

  gorunum: (token: string) => api.get<DemoRandevuGorunumu>(`/public/demo/${token}`),
  tasimaMusaitligi: (token: string) => api.get<DemoMusaitlik>(`/public/demo/${token}/musaitlik`),
  iptal: (token: string, neden?: string) => api.post<DemoRandevuGorunumu>(`/public/demo/${token}/iptal`, { neden }),
  tasi: (token: string, baslangic: string) => api.post<DemoRandevuGorunumu>(`/public/demo/${token}/tasi`, { baslangic }),
  /** Apple Takvim / Outlook: sunucunun ürettiği .ics — iki hatırlatmalı. */
  icsUrl: (token: string) => `${API_URL}/public/demo/${token}/takvim.ics`,

  // Üye
  benim: () => api.get<{ randevu: DemoRandevuGorunumu | null; sunucu: boolean }>("/demo-randevu/benim"),
  uyeAl: (girdi: DemoRandevuGirdisi) => api.post<DemoRandevuGorunumu>("/demo-randevu", girdi),
  gorevlerim: () => api.get<DemoRandevuYonetici[]>("/demo-randevu/gorevlerim"),
  gorevGuncelle: (id: string, yama: { durum?: DemoRandevuDurumu; icNot?: string }) =>
    api.patch<DemoRandevuYonetici>(`/demo-randevu/gorevlerim/${id}`, yama),

  // Sunucunun otomatik Google Meet bağlantısı (bkz. backend demo-meet.service.ts)
  meetDurum: () => api.get<DemoMeetDurumu>("/demo-randevu/google"),
  /** `donus`: Google'dan sonra dönülecek uygulama içi sayfa (varsayılan Ayarlar). */
  meetBaglantiAdresi: (donus?: string) =>
    api.get<{ url: string }>(`/demo-randevu/google/baglan${donus ? `?donus=${encodeURIComponent(donus)}` : ""}`),
  meetKes: () => api.delete<DemoMeetDurumu>("/demo-randevu/google"),
};

export const demoRandevuAdminApi = {
  ayarlar: () => api.get<DemoAyarlari>("/admin/demo-randevu/ayarlar"),
  ayarlariKaydet: (yama: Partial<DemoAyarlari>) => api.patch<DemoAyarlari>("/admin/demo-randevu/ayarlar", yama),
  liste: (kapsam: "yaklasan" | "gecmis") => api.get<DemoRandevuYonetici[]>(`/admin/demo-randevu/randevular?kapsam=${kapsam}`),
  musaitlik: (haric?: string) =>
    api.get<DemoMusaitlik>(`/admin/demo-randevu/musaitlik${haric ? `?haric=${encodeURIComponent(haric)}` : ""}`),
  guncelle: (
    id: string,
    yama: { sunucuId?: string | null; toplantiLinki?: string | null; icNot?: string | null; durum?: DemoRandevuDurumu }
  ) => api.patch<DemoRandevuYonetici>(`/admin/demo-randevu/randevular/${id}`, yama),
  iptal: (id: string, neden?: string) => api.post<DemoRandevuGorunumu>(`/admin/demo-randevu/randevular/${id}/iptal`, { neden }),
  /** Atanmış sunucunun Google takviminde Meet açar; onay e-postası buradan gider. */
  meetOlustur: (id: string) => api.post<DemoRandevuYonetici>(`/admin/demo-randevu/randevular/${id}/meet`, {}),
  tasi: (id: string, baslangic: string) =>
    api.post<DemoRandevuGorunumu>(`/admin/demo-randevu/randevular/${id}/tasi`, { baslangic }),
  sunucular: () => api.get<DemoSunucu[]>("/admin/demo-randevu/sunucular"),
  sunucuEkle: (eposta: string, toplantiLinki?: string) =>
    api.post<DemoSunucu[]>("/admin/demo-randevu/sunucular", { eposta, toplantiLinki }),
  sunucuGuncelle: (userId: string, toplantiLinki: string | null) =>
    api.patch<DemoSunucu[]>(`/admin/demo-randevu/sunucular/${userId}`, { toplantiLinki }),
  sunucuSil: (userId: string) => api.delete<DemoSunucu[]>(`/admin/demo-randevu/sunucular/${userId}`),
};
