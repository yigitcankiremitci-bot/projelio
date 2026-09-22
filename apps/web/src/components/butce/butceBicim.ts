import { bicimDili } from "../../lib/i18n/depo";
/**
 * Bütçe ekranlarının ortak biçimlendirmesi.
 *
 * Defter artık ÇOK PARA BİRİMLİ (migration 104): tutarın yanında hangi birim
 * olduğu her zaman görünmeli. "1.000" yazan bir satırın TRY mi USD mi olduğu
 * anlaşılmıyorsa rakam hiçbir işe yaramaz.
 */

/** Ekranda en sık görülecek birimler önce; listede olmayan kod da yazılabilir. */
export const PARA_BIRIMLERI = ["TRY", "USD", "EUR", "GBP", "CHF", "SAR", "AED", "RUB", "CNY", "JPY"];

/**
 * Tutarı para birimiyle yazar.
 *
 * `kisa` grafiklerin dar tavan etiketi için: "₺15,2 B". Tam rakam oraya sığmıyor
 * ve taşınca çubukların üstünde üst üste biniyor.
 */
export function fmtPara(amount: number, currency = "TRY", kisa = false): string {
  try {
    return new Intl.NumberFormat(bicimDili(), {
      style: "currency",
      currency,
      ...(kisa ? { notation: "compact" as const, maximumFractionDigits: 1 } : { maximumFractionDigits: 2 }),
    }).format(amount);
  } catch {
    // Tanınmayan kod (kullanıcı elle girdiyse) Intl'i patlatır; rakamı yine de göster.
    return `${amount.toLocaleString(bicimDili(), { maximumFractionDigits: 2 })} ${currency}`;
  }
}

export function fmtTarih(value: string): string {
  return new Date(value).toLocaleDateString(bicimDili(), { day: "numeric", month: "short", year: "numeric" });
}

/** "2026-09" → "Eyl 26". Grafik ekseni dar; yıl iki hane. */
export function fmtDonem(donem: string): string {
  const [y, m] = donem.split("-");
  // Kısa ay adı arayüz diliyle ("Eyl" / "Sep").
  const ay = new Intl.DateTimeFormat(bicimDili(), { month: "short", timeZone: "UTC" })
    .format(new Date(Date.UTC(Number(y), Number(m) - 1, 1)))
    .replace(".", "");
  return `${ay} ${y.slice(2)}`;
}
