/**
 * Belgenin ineceği klasör yolu.
 *
 * Saf fonksiyon ve ayrı dosya: kural ("hangi ayın klasörü") hem yükleme hem ay
 * sonu arşivi tarafından kullanılıyor ve ikisinin farklı hesaplaması, arşivin
 * yüklenen dosyayı bulamaması demekti.
 */

/**
 * Ay klasörü adında ayın Türkçe adı da yazıyor.
 *
 * Yalnızca "2026-09" olsaydı klasör Drive'da doğru sıralanırdı ama insan
 * okuyamazdı; yalnızca "Eylül" olsaydı okunurdu ama yıllar karışır ve
 * alfabetik sıralanırdı. İkisi birlikte hem sıralanıyor hem okunuyor.
 */
const AY_ADLARI = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];

/** "2026-09-14" ya da tam ISO damgası → "2026-09". Tanınmayan her şey undefined. */
export function ayAnahtari(tarih: unknown): string | undefined {
  if (typeof tarih !== "string") return undefined;
  const m = /^(\d{4})-(\d{2})/.exec(tarih.trim());
  if (!m) return undefined;
  const ay = Number(m[2]);
  if (ay < 1 || ay > 12) return undefined;
  return `${m[1]}-${m[2]}`;
}

/** Bugünün ay anahtarı. Yerel takvime göre — bkz. todayISO'daki UTC notu. */
export function buAy(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** "2026-09" → "2026-09 Eylül". */
export function ayKlasorAdi(ayAnahtar: string): string {
  const [yil, ay] = ayAnahtar.split("-");
  return `${yil}-${ay} ${AY_ADLARI[Number(ay) - 1]}`;
}

/**
 * Yükleme yolu: "Faturalar/2026/2026-09 Eylül/<dosya adı>".
 *
 * FilesService.resolvePlacement yolun SON parçasını dosya adı sayıp atıyor;
 * bu yüzden dosya adı yolun sonuna ekleniyor (bkz. relativePath).
 *
 * Tarih okunamazsa bugünün ayına düşer: belgeyi kapsam dışı bırakmaktansa
 * bugüne yazmak, kullanıcının görüp düzeltebileceği tek hata.
 */
export function ekYolu(rootFolder: string, tarih: unknown, dosyaAdi: string): string {
  const ay = ayAnahtari(tarih) ?? buAy();
  return `${rootFolder}/${ay.slice(0, 4)}/${ayKlasorAdi(ay)}/${dosyaAdi}`;
}

/** Arşivin aradığı klasör zinciri (dosya adı YOK). */
export function ayKlasorYolu(rootFolder: string, ayAnahtar: string): string[] {
  return [rootFolder, ayAnahtar.slice(0, 4), ayKlasorAdi(ayAnahtar)];
}
