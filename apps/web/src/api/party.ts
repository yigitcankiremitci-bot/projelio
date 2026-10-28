import type {
  BaglantiListeKaydi,
  BaglantiListesi,
  MusteriListesi,
  MusteriSiparisi,
  MusteriSiparisListesi,
  OdemeYontemi,
  Party,
  PartyAktarimHedefi,
  PartyAktarimSecenegi,
  PartyDosyaRolu,
  PartyGorevi,
  PartyListeModulu,
  ProjectFile,
  SatisKanali,
  SatisKanaliTuru,
  SiparisAktarimDuzeltmeleri,
  SiparisAktarimSonucu,
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

  /** Bağlantı listeleri (migration 163): oynatma listesi gibi, kart birden çok listede olabilir. */
  listeAc: (kapsamYolu: string, ad: string, partyIdler: string[] = [], modul?: PartyListeModulu) =>
    api.post<BaglantiListeKaydi>(`${kapsamYolu}/baglanti-listeleri`, { ad, partyIdler, modul }),
  listeler: (kapsamYolu: string, modul?: PartyListeModulu) =>
    api.get<BaglantiListeKaydi[]>(`${kapsamYolu}/baglanti-listeleri${modul ? `?modul=${modul}` : ""}`),
  listeAdlandir: (listeId: string, ad: string) => api.patch(`/baglanti-listeleri/${listeId}`, { ad }),
  listeSil: (listeId: string) => api.delete(`/baglanti-listeleri/${listeId}`),
  listeyeEkle: (listeId: string, partyIdler: string[]) =>
    api.post<{ eklenen: number }>(`/baglanti-listeleri/${listeId}/uyeler`, { partyIdler }),
  listedenCikar: (listeId: string, partyIdler: string[]) =>
    api.post(`/baglanti-listeleri/${listeId}/uyeler/cikar`, { partyIdler }),
  /** Sürükle-bırakla verilen özel sıra (migration 170); anahtar bkz. shared ozelSiraAnahtari. */
  siraKaydet: (kapsamYolu: string, modul: PartyListeModulu, anahtar: string, sira: string[]) =>
    api.patch(`${kapsamYolu}/party-siralari`, { modul, anahtar, sira }),

  /** "Müşteri yap" / "Bağlantılara ekle": kart bir deftere daha girer. */
  deftereEkle: (partyId: string, modul: string) => api.post<Party>(`/party/${partyId}/defter`, { modul }),

  /** Kartın dosyaları: kartvizitler ve ek dosyalar (departmanın klasöründe, karta bağlı). */
  dosyalar: (partyId: string) => api.get<{ rol: PartyDosyaRolu; dosya: ProjectFile }[]>(`/party/${partyId}/dosyalar`),
  dosyaEkle: (partyId: string, dosya: File, departmentId?: string, rol: PartyDosyaRolu = "kartvizit") => {
    const fd = new FormData();
    fd.append("file", dosya);
    const q = new URLSearchParams({ rol });
    if (departmentId) q.set("departmentId", departmentId);
    return api.uploadFile<ProjectFile>(`/party/${partyId}/dosyalar?${q}`, fd);
  },
  dosyaKaldir: (partyId: string, fileId: string) => api.delete(`/party/${partyId}/dosyalar/${fileId}`),
  /** "Projelio'dan seç": kaynak yoksa kök (şirket + departmanlar; iş kartında işin ağacı). */
  dosyaGez: (partyId: string, kaynak?: string, folderId?: string) => {
    const q = new URLSearchParams();
    if (kaynak) q.set("kaynak", kaynak);
    if (folderId) q.set("folderId", folderId);
    return api.get<{
      kaynaklar: { anahtar: string; ad: string }[];
      folders: { id: string; name: string }[];
      files: ProjectFile[];
      breadcrumb: { id: string; name: string }[];
    }>(`/party/${partyId}/dosya-gez${q.toString() ? `?${q}` : ""}`);
  },
  dosyalariBagla: (partyId: string, fileIds: string[]) =>
    api.post<{ baglanan: number }>(`/party/${partyId}/dosyalar/bagla`, { fileIds }),

  /** Rol aktarımı: seçenekler ve aktarım (müşteri, tedarikçi, rakip analizi, ortaklık). */
  aktarimSecenekleri: (partyId: string) => api.get<PartyAktarimSecenegi[]>(`/party/${partyId}/aktarim`),
  aktar: (partyId: string, hedef: PartyAktarimHedefi) =>
    api.post<{ party: Party; kayitId?: string }>(`/party/${partyId}/aktar`, { hedef }),
  /** Defter aktarımını geri alır (müşteri, potansiyel, tedarikçi); kart Bağlantılar'da kalır. */
  aktarimiGeriAl: (partyId: string, hedef: PartyAktarimHedefi) => api.post<Party>(`/party/${partyId}/aktar/geri-al`, { hedef }),

  /** Potansiyel müşteri → müşteri (anlaşma yapıldı). */
  musteriyeDonustur: (partyId: string) => api.post<Party>(`/party/${partyId}/musteriye-donustur`, {}),

  /** Karttan açılmış takip görevleri. */
  gorevler: (partyId: string) => api.get<PartyGorevi[]>(`/party/${partyId}/gorevler`),

  /** Bağlantı ve İlişkiler ekranı: modülü okuyan herkes hepsini, bağlantı alanlarıyla alır. */
  baglantilarim: (kapsamYolu: string, departmentId?: string) =>
    api.get<BaglantiListesi>(
      `${kapsamYolu}/baglantilar${departmentId ? `?departmentId=${encodeURIComponent(departmentId)}` : ""}`
    ),
};

/** Siparişin bir kalemi — sunucu tarafı: party/siparis.service.ts KalemGirdisi. */
export interface KalemGovdesi {
  productId?: string | null;
  aciklama?: string;
  miktar: number;
  birim?: string;
  /** Boşsa katalog fiyatı; sipariş tutarı da verilmişse kalana orantılanır. */
  birimFiyat?: number;
}

/** Sipariş formunun gövdesi — sunucu tarafı: party/siparis.service.ts SiparisGirdisi. */
export interface SiparisGovdesi {
  siparisNo?: string;
  aciklama?: string;
  kalemler: KalemGovdesi[];
  /** Verilirse kalemlere orantılanır (pazarlıklı toplam); verilmezse kalem toplamı. */
  tutar?: number;
  paraBirimi: string;
  siparisTarihi: string;
  vadeGun: number;
  odemeYontemi: OdemeYontemi;
  evrakNo?: string;
  evrakVadesi?: string;
  notlar?: string;
  kanalId?: string | null;
  alici?: { ad?: string; il?: string; ilce?: string };
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
  /** Ürün kartının "Satışlar" sekmesi. */
  urununkiler: (productId: string) => api.get<MusteriSiparisListesi>(`/products/${productId}/siparisler`),
  musterininkiler: (partyId: string) => api.get<MusteriSiparisi[]>(`/party/${partyId}/siparisler`),
  ekle: (partyId: string, govde: SiparisGovdesi) => api.post<MusteriSiparisi>(`/party/${partyId}/siparisler`, govde),
  guncelle: (id: string, govde: Partial<SiparisGovdesi>) => api.patch<MusteriSiparisi>(`/siparisler/${id}`, govde),
  sil: (id: string) => api.delete(`/siparisler/${id}`),
  tahsilEt: (siparisId: string, govde: TahsilatGovdesi) =>
    api.post<MusteriSiparisi>(`/siparisler/${siparisId}/tahsilatlar`, govde),
  tahsilatiGeriAl: (tahsilatId: string) => api.delete<MusteriSiparisi>(`/tahsilatlar/${tahsilatId}`),
  /** Tahsilat ekranından: müşteri seçilmediyse kanala (tek seferlik alıcı). */
  kapsamdaEkle: (kapsamYolu: string, govde: SiparisGovdesi & { partyId?: string }) =>
    api.post<MusteriSiparisi>(`${kapsamYolu}/siparisler`, govde),
  /** Seçilen siparişlerin kalanını tek seferde "tahsil edildi" yapar. */
  topluTahsilEt: (ids: string[], govde: { tarih: string; odemeYontemi?: OdemeYontemi; notlar?: string }) =>
    api.post<{ islenen: number; atlanan: { id: string; neden: string }[] }>(`/siparisler/toplu-tahsilat`, { ids, ...govde }),
  /** Sipariş listesi içe aktarma; onizleme=true iken sunucu hiçbir şey yazmaz. */
  iceAktar: (organizationId: string, dosya: File, duzeltmeler: SiparisAktarimDuzeltmeleri, onizleme: boolean) => {
    const fd = new FormData();
    fd.append("file", dosya);
    fd.append("duzeltmeler", JSON.stringify(duzeltmeler));
    return api.uploadFile<SiparisAktarimSonucu>(
      `/organizations/${organizationId}/siparisler/import?onizleme=${onizleme ? "1" : "0"}`,
      fd
    );
  },
};

export interface SatisKanaliGovdesi {
  ad?: string;
  tur?: SatisKanaliTuru;
  varsayilanVadeGun?: number;
  varsayilanOdemeYontemi?: OdemeYontemi;
  sorumluUserId?: string | null;
  aktif?: boolean;
}

/** Modülün kişisel açılış sekmesi (migration 169). `kapsamYolu` = /organizations/:id ya da /jobs/:id */
export const acilisApi = {
  oku: (kapsamYolu: string, modul: string) =>
    api.get<{ sekme?: string; kayitli: boolean }>(`${kapsamYolu}/modul-acilis/${encodeURIComponent(modul)}`),
  kaydet: (kapsamYolu: string, modul: string, sekme: string) =>
    api.patch<{ sekme: string; kayitli: true }>(`${kapsamYolu}/modul-acilis/${encodeURIComponent(modul)}`, { sekme }),
};

export const kanalApi = {
  /** `kapsamYolu` = /organizations/:id ya da /jobs/:id */
  liste: (kapsamYolu: string) => api.get<SatisKanali[]>(`${kapsamYolu}/satis-kanallari`),
  ekle: (kapsamYolu: string, govde: SatisKanaliGovdesi) => api.post<SatisKanali>(`${kapsamYolu}/satis-kanallari`, govde),
  guncelle: (id: string, govde: SatisKanaliGovdesi) => api.patch<SatisKanali>(`/satis-kanallari/${id}`, govde),
};
