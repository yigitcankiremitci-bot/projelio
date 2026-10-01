/**
 * Modele verilen tarih ↔ gün adı tablosu.
 *
 * NEDEN: modele yalnızca bugünün tarihi veriliyordu; "cuma", "haftaya salı"
 * gibi ifadeleri tarihe (ya da tarihi gün adına) model KENDİSİ çeviriyordu ve
 * bir gün kaydırıyordu — 2026-10-01'de "2 Ekim Cuma" yerine "3 Ekim Cuma"
 * dedi (3 Ekim cumartesi). Takvim aritmetiği dil modelinin güvenilir yaptığı
 * bir iş değil; tabloyu sunucu hesaplar, model okur.
 *
 * Saf dosya: testte sabit bir "şimdi" ile doğrulanabilsin.
 */

const GUNLER = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

/** Saat dilimindeki takvim günü: { y, m, d } (yerel duvar saati). */
function yerelGun(an: Date, saatDilimi: string): { y: number; m: number; d: number } {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: saatDilimi }).format(an).split("-").map(Number);
  return { y, m, d };
}

/**
 * `geri` gün öncesinden `ileri` gün sonrasına, her satırda "YYYY-MM-DD Gün"
 * ve göreli etiket (dün/bugün/yarın). Gün hesabı UTC öğlende yapılır: yaz
 * saati geçişi bir günü iki kez saydıramaz.
 */
export function takvimSeridi(simdi: Date, saatDilimi: string, geri = 7, ileri = 21): string[] {
  const { y, m, d } = yerelGun(simdi, saatDilimi);
  const bugun = Date.UTC(y, m - 1, d, 12);
  const satirlar: string[] = [];
  for (let i = -geri; i <= ileri; i++) {
    const g = new Date(bugun + i * 86_400_000);
    const tarih = g.toISOString().slice(0, 10);
    const etiket = i === -1 ? " (dün)" : i === 0 ? " (BUGÜN)" : i === 1 ? " (yarın)" : "";
    satirlar.push(`${tarih} ${GUNLER[g.getUTCDay()]}${etiket}`);
  }
  return satirlar;
}
