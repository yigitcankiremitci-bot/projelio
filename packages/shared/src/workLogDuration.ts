/**
 * Yaptım kayıtlarındaki sürenin tek yorumcusu.
 *
 * NEDEN ORTAK PAKETTE: aynı metni üç yer okuyor — web'deki hızlı giriş kutusu,
 * Lio'nun araç girdisi ("bir buçuk saat sürdü") ve backend'in doğrulaması.
 * Üçü ayrı ayrı yazılsaydı "1s30" web'de 90 dakika, Lio'da 1 dakika olurdu ve
 * kullanıcı hangisinin doğru olduğunu asla anlayamazdı.
 *
 * TASARIM KARARI — çıplak sayı ne demek:
 *   "45"  -> 45 dakika   (tam sayı: insanlar dakikayı böyle yazıyor)
 *   "1.5" -> 90 dakika   (ondalıklı: "bir buçuk" her zaman SAAT demek)
 * Ondalıklıyı da dakika saysaydık "1.5" bir buçuk dakika olurdu; kimse süreyi
 * böyle yazmıyor. Belirsizliği kullanıcıya sormak yerine, iki yazım biçimini
 * ayırmak daha az sürpriz üretiyor.
 */

/** Tek bir kaydın üst sınırı; veritabanındaki CHECK ile aynı (bkz. migration 097). */
export const MAX_WORK_LOG_MINUTES = 1440;

const SAAT_BIRIMLERI = ["saat", "saatte", "sa", "s", "h", "hr", "hour", "hours"];
const DAKIKA_BIRIMLERI = ["dakika", "dakka", "dak", "dk", "d", "m", "min", "mins", "minute", "minutes"];

/**
 * Serbest yazılmış süreyi dakikaya çevirir. Anlaşılmayan girdide `null` döner —
 * `0` DEĞİL: "anlamadım" ile "sıfır dakika" farklı şeyler ve sıfır süre zaten
 * geçersiz (veritabanı da reddediyor).
 *
 * Kabul ettikleri: "90", "90dk", "1s", "1 saat", "1s30", "1s 30dk", "1.5 saat",
 * "1,5 saat", "1:30", "2 saat 15 dakika".
 */
export function sureyiDakikayaCevir(input: string | number | null | undefined): number | null {
  if (input == null) return null;
  if (typeof input === "number") return dakikayiSinirla(input);

  // Ondalık ayırıcı olarak virgül Türkçede yaygın; noktaya çeviriyoruz.
  const metin = input.trim().toLocaleLowerCase("tr").replace(",", ".");
  if (!metin) return null;

  // "1:30" — saat:dakika. Ayrı ele alınıyor çünkü aşağıdaki tarayıcı iki
  // parçayı da birimsiz sayı sanıp toplardı (1 + 30 = 31 dakika).
  const ikiNokta = metin.match(/^(\d{1,2}):([0-5]?\d)$/);
  if (ikiNokta) {
    return dakikayiSinirla(Number(ikiNokta[1]) * 60 + Number(ikiNokta[2]));
  }

  // Sayı + (varsa) birim çiftlerini sırayla topla. "1s 30dk" iki çift,
  // "1s30" de iki çift (ikincisi birimsiz — saatin peşine gelen sayı dakikadır).
  const parcalar = [...metin.matchAll(/(\d+(?:\.\d+)?)\s*([a-zçğıöşü]*)/g)];
  if (!parcalar.length) return null;

  let toplam = 0;
  let birimliParcaVar = false;
  let saatGorulduBirimsizDakikaOlsun = false;

  for (const [, sayiMetni, birim] of parcalar) {
    const sayi = Number(sayiMetni);
    if (!Number.isFinite(sayi)) return null;

    if (SAAT_BIRIMLERI.includes(birim)) {
      toplam += sayi * 60;
      birimliParcaVar = true;
      saatGorulduBirimsizDakikaOlsun = true;
      continue;
    }
    if (DAKIKA_BIRIMLERI.includes(birim)) {
      toplam += sayi;
      birimliParcaVar = true;
      continue;
    }
    // Tanınmayan bir birim ("1 elma") kaydı sessizce yanlış süreyle
    // yazmaktansa anlaşılmamış sayılmalı.
    if (birim) return null;

    // Birimsiz sayı: saatin ardından geldiyse dakikadır ("1s30"), tek başına
    // ise yukarıdaki tasarım kararı geçerli.
    if (saatGorulduBirimsizDakikaOlsun) toplam += sayi;
    else if (Number.isInteger(sayi)) toplam += sayi;
    else toplam += sayi * 60;
  }

  // "1 elma" gibi bir şey birimliParcaVar'ı false bırakıp yukarıda zaten
  // null dönmüş olur; buradaki değişken yalnızca okunurluk için duruyor.
  void birimliParcaVar;

  return dakikayiSinirla(toplam);
}

/** Dakikayı kullanıcıya gösterilecek kısa metne çevirir: "1s 30dk", "45dk", "2s". */
export function dakikayiMetneCevir(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return "";
  const toplam = Math.round(minutes);
  const saat = Math.floor(toplam / 60);
  const dakika = toplam % 60;
  if (!saat) return `${dakika}dk`;
  if (!dakika) return `${saat}s`;
  return `${saat}s ${dakika}dk`;
}

/**
 * Aralık dışını kırpmaz, REDDEDER (null). Kırpsaydık "600 saat" sessizce
 * 24 saat olarak kaydedilir, kullanıcı yanlış yazdığını hiç fark etmezdi.
 */
function dakikayiSinirla(dakika: number): number | null {
  const yuvarlanmis = Math.round(dakika);
  if (!Number.isFinite(yuvarlanmis) || yuvarlanmis <= 0) return null;
  if (yuvarlanmis > MAX_WORK_LOG_MINUTES) return null;
  return yuvarlanmis;
}
