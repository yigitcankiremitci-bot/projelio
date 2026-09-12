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
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency,
      ...(kisa ? { notation: "compact" as const, maximumFractionDigits: 1 } : { maximumFractionDigits: 2 }),
    }).format(amount);
  } catch {
    // Tanınmayan kod (kullanıcı elle girdiyse) Intl'i patlatır; rakamı yine de göster.
    return `${amount.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} ${currency}`;
  }
}

export function fmtTarih(value: string): string {
  return new Date(value).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });
}

/** "2026-09" → "Eyl 26". Grafik ekseni dar; yıl iki hane. */
export function fmtDonem(donem: string): string {
  const [y, m] = donem.split("-");
  const aylar = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
  return `${aylar[Number(m) - 1] ?? m} ${y.slice(2)}`;
}
