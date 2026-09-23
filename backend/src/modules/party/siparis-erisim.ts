import type { ModuleAccess } from "@projelio/shared";

/**
 * Müşteri kartı ve siparişleri üzerindeki yetki — saf karar.
 *
 * Kural tek cümle: YÖNETİCİ HEPSİNİ, ÇALIŞAN KENDİ MÜŞTERİSİNİ görür.
 * Yönetici = crm_musteri modülünde ekip yönetebilen (şirket sahibi, departman
 * yöneticisi, modülün yöneticisi) — `canManageTeam`. Müşteriyi çalışana
 * atamak ve raporu görmek yöneticinin işidir.
 *
 * Sipariş/tahsilat yazma hakkı müşterinin SORUMLUSU olmaktan gelir, modüle
 * yazar olarak atanmış olmaktan değil: departman üyesi modülde salt okurdur
 * ama yönetici ona bir müşteri atadıysa o müşterinin tahsilatını girmek
 * zaten onun görevidir. Aksi hâlde yöneticinin atadığı kişi atandığı işi
 * yapamaz, tahsilatı yine yönetici girerdi.
 */
export interface MusteriYetkisi {
  okur: boolean;
  /** Sipariş ve tahsilat girebilir / geri alabilir. */
  siparisYazar: boolean;
  yonetici: boolean;
}

export function musteriYetkisi(
  access: Pick<ModuleAccess, "canRead" | "canWrite" | "canManageTeam">,
  sorumluId: string | null | undefined,
  userId: string | undefined
): MusteriYetkisi {
  if (!userId || !access.canRead) return { okur: false, siparisYazar: false, yonetici: false };
  if (access.canManageTeam) return { okur: true, siparisYazar: true, yonetici: true };
  const kendi = !!sorumluId && sorumluId === userId;
  return { okur: kendi, siparisYazar: kendi, yonetici: false };
}

/**
 * Kart bilgisini (ad, iletişim, rol) düzenleme ve sorumluyu değiştirme.
 *
 * Çalışan yalnızca KENDİ müşterisini düzenler ve onu başkasına devredemez —
 * devretmek, kendi alacağını başkasının raporuna yazmak ya da işini başkasına
 * yıkmak demek; bu karar yöneticinin. Mevcut modül yazma yetkisi (canWrite)
 * yine şart: salt okur departman üyesi kartın kendisini değiştiremez.
 */
// dil:anahtar-baslangic — dönen metin istisna mesajı olarak çevriliyor
export function kartDuzenlemeHatasi(
  access: Pick<ModuleAccess, "canWrite" | "canManageTeam">,
  mevcutSorumlu: string | null | undefined,
  yeniSorumlu: string | null | undefined,
  userId: string | undefined
): string | null {
  if (!access.canWrite) return "Müşteri kaydını yalnızca organizasyon sahibi, departman yöneticisi veya modüle atanmış kişiler değiştirebilir";
  if (access.canManageTeam) return null;
  if (mevcutSorumlu !== userId) return "Yalnızca sana atanmış müşterileri düzenleyebilirsin";
  if (yeniSorumlu !== undefined && yeniSorumlu !== userId) return "Müşteriyi başka bir çalışana yalnızca yönetici atayabilir";
  return null;
}
// dil:anahtar-bitis
