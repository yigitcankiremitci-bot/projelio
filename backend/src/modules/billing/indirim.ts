/**
 * İndirim kodu kararları (saf fonksiyonlar, ağ/veritabanı yok).
 *
 * Kurallar migration 140'ın başlığında. Buradaki her karar hem ödeme
 * öncesi önizlemede hem ödeme formunda aynı fonksiyondan geçer; ekranda
 * görülen tutarla çekilen tutar ayrışmasın.
 */

export type IndirimTuru = "yuzde" | "tutar";
export type IndirimKapsami = "abonelik" | "lio" | "hepsi";
export type IndirimSuresi = "ilk" | "donem" | "surekli";

export interface Indirim {
  tur: IndirimTuru;
  deger: number;
}

export interface IndirimKodu extends Indirim {
  id: string;
  kod: string;
  kapsam: IndirimKapsami;
  planKeys: string[] | null;
  periods: string[] | null;
  sure: IndirimSuresi;
  donemSayisi: number | null;
  sonTarih: string | null;
  kullanimSiniri: number | null;
  aktif: boolean;
}

/**
 * İndirimli tutarın alt sınırı. PayTR 0 ₺ ödeme almıyor ve kart ancak bir
 * ödemeyle saklanabiliyor; %100 indirimli abonelikte kart saklanmaz ve ilk
 * yenileme çekilemezdi.
 */
export const EN_AZ_ODEME = 1;

/**
 * Kodun saklanan biçimi: boşluksuz, büyük harf; i/ı/İ hepsi "I".
 *
 * Türkçe büyük harf kuralı (i → İ) BİLEREK kullanılmıyor: yönetici "ILKAY50"
 * oluşturup müşteri "ilkay50" yazınca "İLKAY50" ile eşleşmezdi. Hangi
 * klavyeyle yazılırsa yazılsın aynı kod aynı biçime inmeli.
 */
export function kodNormallestir(kod: string): string {
  return String(kod ?? "")
    .trim()
    .toUpperCase()
    .replace(/İ/g, "I")
    .replace(/\s+/g, "");
}

/** Oluşturulurken kabul edilen kod biçimi: harf, rakam, tire; 3–40 karakter. */
export function kodBicimiGecerli(kod: string): boolean {
  return /^[A-ZÇĞÖŞÜ0-9-]{3,40}$/.test(kod);
}

/** Kuruş hassasiyetinde, alt sınırın altına inmeyen indirimli tutar. */
export function indirimliTutar(liste: number, indirim: Indirim | null): number {
  if (!indirim) return liste;
  const ham = indirim.tur === "yuzde" ? liste * (1 - indirim.deger / 100) : liste - indirim.deger;
  const yuvarli = Math.round(ham * 100) / 100;
  // Liste tutarı zaten alt sınırın altındaysa indirim onu YÜKSELTMEMELİ.
  return Math.min(liste, Math.max(yuvarli, EN_AZ_ODEME));
}

export type UygunlukSebebi =
  | "yok"
  | "kapali"
  | "suresi_doldu"
  | "tukendi"
  | "kullanildi"
  | "kapsam_disi"
  | "paket_disi";

/** Kodun bu satın almada kullanılıp kullanılamayacağı. */
export function kodUygunlugu(
  kod: IndirimKodu | null,
  baglam: {
    simdi: Date;
    kapsam: "abonelik" | "lio";
    planKey?: string;
    period?: string;
    kullanimSayisi: number;
    buKullaniciKullandi: boolean;
  }
): { uygun: true } | { uygun: false; sebep: UygunlukSebebi } {
  if (!kod) return { uygun: false, sebep: "yok" };
  if (!kod.aktif) return { uygun: false, sebep: "kapali" };
  if (kod.sonTarih && new Date(kod.sonTarih).getTime() <= baglam.simdi.getTime()) {
    return { uygun: false, sebep: "suresi_doldu" };
  }
  if (kod.kullanimSiniri !== null && baglam.kullanimSayisi >= kod.kullanimSiniri) {
    return { uygun: false, sebep: "tukendi" };
  }
  if (baglam.buKullaniciKullandi) return { uygun: false, sebep: "kullanildi" };
  if (kod.kapsam !== "hepsi" && kod.kapsam !== baglam.kapsam) return { uygun: false, sebep: "kapsam_disi" };
  if (baglam.kapsam === "abonelik") {
    if (kod.planKeys?.length && !kod.planKeys.includes(baglam.planKey ?? "")) return { uygun: false, sebep: "paket_disi" };
    if (kod.periods?.length && !kod.periods.includes(baglam.period ?? "")) return { uygun: false, sebep: "paket_disi" };
  }
  return { uygun: true };
}

/**
 * İlk ödemeden SONRA kaç ödemede daha indirim uygulanacağı.
 * null = süresiz. ilk → 0, ilk N ödeme → N-1.
 */
export function ilkOdemedenSonraKalan(kod: Pick<IndirimKodu, "sure" | "donemSayisi">): number | null {
  if (kod.sure === "surekli") return null;
  if (kod.sure === "ilk") return 0;
  return Math.max((kod.donemSayisi ?? 1) - 1, 0);
}

/** Aboneliğin bir sonraki ödemesinde indirim uygulanır mı. */
export function sonrakiOdemedeIndirim(kalan: number | null, kodVar: boolean): boolean {
  return kodVar && (kalan === null || kalan > 0);
}

/** Bir indirimli ödemeden sonra kalan sayı (süresizde null kalır). */
export function kalaniAzalt(kalan: number | null): number | null {
  return kalan === null ? null : Math.max(kalan - 1, 0);
}
