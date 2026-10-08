import {
  BAGLANTI_MODUL_KEY,
  MUSTERI_MODUL_KEY,
  type ModuleAccess,
  type PartyModulKey,
} from "@projelio/shared";
import { kartDuzenlemeHatasi } from "./siparis-erisim";

/**
 * Bir party kaydı üzerindeki yetki — kaydın DURDUĞU defterlere göre, saf karar.
 *
 * Kayıt birden fazla modülün defterinde durabilir (`party.modules`, migration
 * 153): Bağlantılar'da açılan kart Müşteriler'de görünmez, müşteriye dönüşünce
 * ikisinde birden görünür. Yetki de buna göre KAYITTAN okunur, kapsamdan
 * değil: eskiden tek modül vardı ve "organizasyonda crm_musteri okuyabiliyor
 * mu" sorusu yetiyordu. Şimdi o soru, yalnızca Bağlantılar'da duran bir
 * rakibin kartını (ve kişilerini, geçmişini) satış ekibine `/party/:id`
 * ucundan açardı.
 *
 * Kural: kaydın durduğu modüllerden HERHANGİ BİRİNDEKİ yetki yeter.
 */
export type ModulErisimi = Pick<ModuleAccess, "canRead" | "canWrite" | "canManageTeam">;
export type Erisimler = Partial<Record<PartyModulKey, ModulErisimi>>;

function herhangi(modules: readonly string[], e: Erisimler, ne: keyof ModulErisimi): boolean {
  return modules.some((m) => !!e[m as PartyModulKey]?.[ne]);
}

/** Kart, kişileri ve temas geçmişi okunur mu. */
export function kayitOkunur(modules: readonly string[], e: Erisimler): boolean {
  return herhangi(modules, e, "canRead");
}

/** Arşivleme, kişi ve temas ekleme, rol ekleme: modülde yazar olmak yeter (bugünkü kural). */
export function kayitYazilir(modules: readonly string[], e: Erisimler): boolean {
  return herhangi(modules, e, "canWrite");
}

/** Yinelenen kayıtları birleştirmek modül yöneticisinin işi. */
export function kayitYonetilir(modules: readonly string[], e: Erisimler): boolean {
  return herhangi(modules, e, "canManageTeam");
}

/**
 * Bağlantılar'a özgü alanlar (önem, tanışma yeri, ilişki notu). Kart iki
 * defterde dursa bile bu alanlar yalnızca Bağlantılar'ın yetkisiyle görülür:
 * müşteriye dönüşen rakibin "fiyatları bizden düşük" notu satışçıya açılmasın.
 */
export function baglantiAlaniOkunur(modules: readonly string[], e: Erisimler): boolean {
  return modules.includes(BAGLANTI_MODUL_KEY) && !!e[BAGLANTI_MODUL_KEY]?.canRead;
}

export function baglantiAlaniYazilir(modules: readonly string[], e: Erisimler): boolean {
  return modules.includes(BAGLANTI_MODUL_KEY) && !!e[BAGLANTI_MODUL_KEY]?.canWrite;
}

/**
 * Kart bilgisini (ad, iletişim, rol, sorumlu) düzenleme. Hata metni ya da null.
 *
 * Bağlantılar bir yönetim defteri: orada "çalışan yalnızca kendisine
 * atananı düzenler" kuralı YOK, yazar olan her kartı düzenler. Sorumluyu
 * başkasına vermek yine yöneticinin kararı.
 *
 * Bağlantılar'da yazar değilse Müşteriler'in kuralı (kartDuzenlemeHatasi)
 * aynen geçerli — iki defterde duran kartı satışçı yalnızca kendi müşterisiyse
 * düzenler.
 */
// dil:anahtar-baslangic — dönen metin istisna mesajı olarak çevriliyor
export function kartDuzenlemeKarari(
  modules: readonly string[],
  e: Erisimler,
  mevcutSorumlu: string | null | undefined,
  yeniSorumlu: string | null | undefined,
  userId: string | undefined
): string | null {
  const baglanti = e[BAGLANTI_MODUL_KEY];
  if (modules.includes(BAGLANTI_MODUL_KEY) && baglanti?.canWrite) {
    const devir = yeniSorumlu !== undefined && yeniSorumlu !== mevcutSorumlu && yeniSorumlu !== userId;
    if (devir && !baglanti.canManageTeam) return "Kaydı başka birine yalnızca yönetici atayabilir";
    return null;
  }
  const musteri = e[MUSTERI_MODUL_KEY];
  if (modules.includes(MUSTERI_MODUL_KEY) && musteri) {
    return kartDuzenlemeHatasi(musteri, mevcutSorumlu, yeniSorumlu, userId);
  }
  return "Bu kaydı değiştirme yetkin yok";
}

/**
 * Kartı başka bir deftere de almak ("Müşteri yap" / "Bağlantılara ekle").
 * Hata metni ya da null.
 *
 * İki modülde birden yazma yetkisi şart: kartın bugünkü defterinde (kartı
 * değiştirebiliyor mu) VE hedefte (oraya kayıt açabiliyor mu). Satış ekibine
 * kart vermek yönetimin kararı; satışçı da kendi müşterisini yönetimin
 * defterine itemez.
 *
 * Hedef modül şirkette hiç açık değilse kart görünmeyen bir deftere düşerdi —
 * şirket sahibi her modülde yetkili sayıldığı için ayrıca bakılıyor.
 */
export function deftereEklemeHatasi(
  modules: readonly string[],
  e: Erisimler,
  hedef: PartyModulKey,
  hedefErisim: ModulErisimi | undefined,
  hedefAcik: boolean
): string | null {
  if (modules.includes(hedef)) return null;
  if (!kayitYazilir(modules, e)) return "Bu kaydı değiştirme yetkin yok";
  if (!hedefAcik) {
    return hedef === MUSTERI_MODUL_KEY
      ? "Müşteriler modülü burada açık değil"
      : "Bağlantı ve İlişkiler modülü burada açık değil";
  }
  if (!hedefErisim?.canWrite) return "Kartı bu deftere eklemek için orada da yazma yetkin olmalı";
  return null;
}
// dil:anahtar-bitis
