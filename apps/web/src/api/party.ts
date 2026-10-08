import type {
  BaglantiListesi,
  MusteriListesi,
  MusteriSiparisi,
  MusteriSiparisListesi,
  OdemeYontemi,
  Party,
  PartyGorevi,
  ProjectFile,
} from "@projelio/shared";
import { api, API_URL } from "./client";
import { TOKEN_KEY } from "../lib/session";
import { etkinDil } from "../lib/i18n/depo";

export const partyApi = {
  /**
   * Boş müşteri Excel şablonu (bkz. backend party/musteri-sablonu.ts).
   *
   * `window.location` ile açılamıyor: uç oturum başlığı istiyor ve tarayıcı
   * adres çubuğundan açılan isteğe o başlığı koymaz — faturalar.ts'teki arşiv
   * indirmesiyle aynı yol. Şablonun İÇİ de arayüzün dilinde üretiliyor; bu
   * istek client.ts'ten geçmediği için dil başlığı yok, ?dil= ile gidiyor.
   */
  sablonuIndir: async (dosyaAdi: string, modul?: string): Promise<void> => {
    const token = localStorage.getItem(TOKEN_KEY);
    const q = new URLSearchParams({ dil: etkinDil() });
    if (modul) q.set("modul", modul);
    const res = await fetch(`${API_URL}/party-template?${q}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error("Şablon indirilemedi.");
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = dosyaAdi;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Hemen değil: Safari bağlantıya tıklandıktan sonra adresi bir an daha okuyor.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  /** Müşteriler ekranı: yönetici hepsini, çalışan kendisine atananları alır. */
  musterilerim: (scopePath: string, departmentId?: string) =>
    api.get<MusteriListesi>(
      `${scopePath}/musterilerim${departmentId ? `?departmentId=${encodeURIComponent(departmentId)}` : ""}`
    ),

  /** "Müşteri yap" / "Bağlantılara ekle": kart bir deftere daha girer. */
  deftereEkle: (partyId: string, modul: string) => api.post<Party>(`/party/${partyId}/defter`, { modul }),

  /** Kartvizit dosyaları (departmanın "Kartvizitler" klasöründe, karta bağlı). */
  dosyalar: (partyId: string) => api.get<ProjectFile[]>(`/party/${partyId}/dosyalar`),
  dosyaEkle: (partyId: string, dosya: File, departmentId?: string) => {
    const fd = new FormData();
    fd.append("file", dosya);
    const q = departmentId ? `?departmentId=${encodeURIComponent(departmentId)}` : "";
    return api.uploadFile<ProjectFile>(`/party/${partyId}/dosyalar${q}`, fd);
  },
  dosyaKaldir: (partyId: string, fileId: string) => api.delete(`/party/${partyId}/dosyalar/${fileId}`),

  /** Karttan açılmış takip görevleri. */
  gorevler: (partyId: string) => api.get<PartyGorevi[]>(`/party/${partyId}/gorevler`),

  /** Bağlantı ve İlişkiler ekranı: modülü okuyan herkes hepsini, bağlantı alanlarıyla alır. */
  baglantilarim: (kapsamYolu: string, departmentId?: string) =>
    api.get<BaglantiListesi>(
      `${kapsamYolu}/baglantilar${departmentId ? `?departmentId=${encodeURIComponent(departmentId)}` : ""}`
    ),
};

/** Sipariş formunun gövdesi — sunucu tarafı: party/siparis.service.ts SiparisGirdisi. */
export interface SiparisGovdesi {
  siparisNo?: string;
  aciklama?: string;
  miktar?: number | null;
  birim?: string;
  tutar: number;
  paraBirimi: string;
  siparisTarihi: string;
  vadeGun: number;
  odemeYontemi: OdemeYontemi;
  evrakNo?: string;
  evrakVadesi?: string;
  notlar?: string;
}

export interface TahsilatGovdesi {
  tutar: number;
  tarih: string;
  odemeYontemi: OdemeYontemi;
  evrakNo?: string;
  evrakVadesi?: string;
  notlar?: string;
}

export const siparisApi = {
  /** `kapsamYolu` = /organizations/:id ya da /jobs/:id */
  kapsamdakiler: (kapsamYolu: string, departmentId?: string) =>
    api.get<MusteriSiparisListesi>(
      `${kapsamYolu}/siparisler${departmentId ? `?departmentId=${encodeURIComponent(departmentId)}` : ""}`
    ),
  musterininkiler: (partyId: string) => api.get<MusteriSiparisi[]>(`/party/${partyId}/siparisler`),
  ekle: (partyId: string, govde: SiparisGovdesi) => api.post<MusteriSiparisi>(`/party/${partyId}/siparisler`, govde),
  guncelle: (id: string, govde: Partial<SiparisGovdesi>) => api.patch<MusteriSiparisi>(`/siparisler/${id}`, govde),
  sil: (id: string) => api.delete(`/siparisler/${id}`),
  tahsilEt: (siparisId: string, govde: TahsilatGovdesi) =>
    api.post<MusteriSiparisi>(`/siparisler/${siparisId}/tahsilatlar`, govde),
  tahsilatiGeriAl: (tahsilatId: string) => api.delete<MusteriSiparisi>(`/tahsilatlar/${tahsilatId}`),
};
