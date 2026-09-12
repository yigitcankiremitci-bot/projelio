import type { AdminKullaniciDetayi, AdminKullaniciSatiri, UserRole } from "@projelio/shared";
import { api } from "./client";

type KrediBakiyesi = { balance: number; lifetimePurchased: number; lifetimeSpent: number };

/** Admin > kullanıcı yönetimi. Uçlar yalnızca role === "admin" ile açılır. */
export const adminKullanicilar = {
  liste: () => api.get<{ kullanicilar: AdminKullaniciSatiri[]; migrationEksik: boolean }>("/admin/kullanicilar"),
  detay: (id: string, signal?: AbortSignal) => api.get<AdminKullaniciDetayi>(`/admin/kullanicilar/${id}`, signal),

  askiyaAl: (id: string, sebep?: string) => api.post<{ ok: true }>(`/admin/kullanicilar/${id}/askiya-al`, { sebep }),
  askiyiKaldir: (id: string) => api.post<{ ok: true }>(`/admin/kullanicilar/${id}/askiyi-kaldir`, {}),
  oturumlariKapat: (id: string) => api.post<{ ok: true }>(`/admin/kullanicilar/${id}/oturumlari-kapat`, {}),
  rolDegistir: (id: string, rol: UserRole) => api.post<{ ok: true }>(`/admin/kullanicilar/${id}/rol`, { rol }),
  epostayiDogrula: (id: string) => api.post<{ ok: true }>(`/admin/kullanicilar/${id}/eposta-dogrula`, {}),

  krediYukle: (id: string, miktar: number, aciklama?: string) =>
    api.post<KrediBakiyesi>(`/admin/kullanicilar/${id}/kredi/yukle`, { miktar, aciklama }),
  krediDus: (id: string, miktar: number, aciklama?: string) =>
    api.post<KrediBakiyesi>(`/admin/kullanicilar/${id}/kredi/dus`, { miktar, aciklama }),
  krediGeriAl: (id: string, hareketId: string, aciklama?: string) =>
    api.post<KrediBakiyesi>(`/admin/kullanicilar/${id}/kredi/${hareketId}/geri-al`, { aciklama }),

  silmePlanla: (id: string) => api.post<{ purgeAt: string }>(`/admin/kullanicilar/${id}/silme-planla`, {}),
  silmeyiIptalEt: (id: string) => api.post<{ ok: true }>(`/admin/kullanicilar/${id}/silmeyi-iptal-et`, {}),
  /** GERİ ALINAMAZ. */
  hemenSil: (id: string, onayEposta: string) =>
    api.post<{ ok: true }>(`/admin/kullanicilar/${id}/hemen-sil`, { onayEposta }),
};
