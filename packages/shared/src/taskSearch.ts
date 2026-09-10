/**
 * Görev araması — "birebir yazamayabilirim" sorunu.
 *
 * SORUN: veritabanı tarafındaki `ilike '%metin%'` TEK ve BİTİŞİK bir alt dize
 * arıyor. Kullanıcı görevin adını harfi harfine hatırlamadığı sürece hiçbir şey
 * bulamıyor:
 *
 *   "sunum hazırla"  ✗  "Müşteri sunumu hazırlandı"   (araya kelime giriyor)
 *   "test protokol"  ✗  "-40°C test protokolü yazımı" (Türkçe eki)
 *   "gorev"          ✗  "Görev listesi"               (şapkasız yazım)
 *   "raopr"          ✗  "Rapor"                       (parmak kayması)
 *
 * ÇÖZÜM: sorgu KELİMELERE bölünüyor ve her kelimenin görevin herhangi bir
 * yerinde (başlığında, projesinde, departmanında) karşılığı aranıyor. Sıra
 * önemli değil, arada kaç kelime olduğu önemli değil.
 *
 * NEDEN İSTEMCİDE: kullanıcının açık görevleri zaten tek bir istekle
 * geliyor (bkz. useTaskSearch) ve sayıları yüzler mertebesinde. Her tuş
 * vuruşunda sunucuya gitmemek hem anında sonuç veriyor hem de bu esnekliği
 * SQL'de ifade etme derdini ortadan kaldırıyor: PostgREST üzerinden
 * "kelimelerin hepsi geçsin, sırası önemsiz, ekleri affet" yazılamıyor.
 *
 * ESNEKLİĞİN SINIRI VAR ve bilinçli: eşleşme için sorgudaki HER kelimenin
 * karşılığı bulunmak zorunda. Tek kelimesi tutan kaydı da getirseydik liste
 * alakasız işlerle dolar, kullanıcı doğru olanı yine gözle arardı.
 */

/** Sonuçta bir görevin neye göre eşleştiği; arayüz istersen gösterir. */
export interface GorevEslesmesi<T> {
  kayit: T;
  puan: number;
}

/** Bir görevin aranabilir metinleri; başlık en ağırlıklı olan. */
export interface AranabilirGorev {
  baslik: string;
  /** Proje / departman / program / iş adı gibi bağlam metinleri. */
  baglam?: (string | undefined)[];
}

const BASLIK_AGIRLIGI = 3;
const BAGLAM_AGIRLIGI = 1;

/** Kelime bir kökten kısa olamaz; aşırı budama alakasız eşleşme üretir. */
const EN_KISA_KOK = 3;
/** Yazım hatası toleransı yalnızca bu uzunluktan itibaren; kısa kelimede her şey birbirine benzer. */
const HATA_TOLERANSI_ESIGI = 5;

/**
 * Türkçe yaygın ekler, UZUNDAN KISAYA. Sıra önemli: "leri" önce denenmezse
 * "i" soyulup "testler" kalır ve "test" araması tutmaz.
 *
 * Liste bilerek kısa tutuldu — tam bir biçimbilim çözümleyicisi değil, arama
 * kutusunu kullanılabilir kılacak kadarı. Fazla ek eklemek, kökü kısaltıp
 * alakasız eşleşme üretiyor.
 */
const EKLER = [
  "lerinde", "larında", "lerini", "larını", "lerine", "larına",
  "lerin", "ların", "leri", "ları", "ler", "lar",
  "sinde", "sında", "siyle", "sıyla",
  "inde", "ında", "unda", "ünde",
  "ini", "ını", "unu", "ünü", "ine", "ına", "una", "üne",
  "nin", "nın", "nun", "nün",
  "den", "dan", "ten", "tan",
  "lik", "lık", "luk", "lük",
  "mek", "mak",
  "de", "da", "te", "ta",
  "si", "sı", "su", "sü",
  "dı", "di", "du", "dü", "tı", "ti", "tu", "tü",
  "ye", "ya", "yi", "yı",
  "in", "ın", "un", "ün",
  "e", "a", "i", "ı", "u", "ü",
];

/** Türkçe harfleri şapkasız karşılıklarına indirger: "görev" ve "gorev" aynı şey. */
const HARF_ESLERI: Record<string, string> = {
  ç: "c", ğ: "g", ı: "i", İ: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u",
};

/**
 * Metni karşılaştırılabilir hâle getirir: küçük harf, şapkasız, noktalama
 * boşluğa dönüşmüş. "-40°C test protokolü" -> "40 c test protokolu".
 */
export function metniNormallestir(metin: string): string {
  return metin
    .toLocaleLowerCase("tr")
    .split("")
    .map((h) => HARF_ESLERI[h] ?? h)
    .join("")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Metni aranabilir kelimelere böler. */
export function kelimelereBol(metin: string): string[] {
  const normal = metniNormallestir(metin);
  return normal ? normal.split(" ").filter(Boolean) : [];
}

/**
 * Kelimenin kökü. Ekleri uzundan kısaya, kök EN_KISA_KOK'un altına düşmeyecek
 * şekilde tek turda soyar.
 *
 * Tek tur bilinçli: "testlerinde" -> "test" tek adımda çıkıyor ve arka arkaya
 * soymak "kalemlik" gibi kelimelerde kökü aşındırıp alakasız eşleşme üretiyor.
 */
export function kokBul(kelime: string): string {
  for (const ek of EKLER) {
    if (kelime.length - ek.length >= EN_KISA_KOK && kelime.endsWith(ek)) {
      return kelime.slice(0, kelime.length - ek.length);
    }
  }
  return kelime;
}

/**
 * İki kelimenin "aynı sayılacak kadar yakın" olup olmadığı — tek harflik
 * yazım hatası ya da komşu harflerin yer değiştirmesi (Damerau-Levenshtein 1).
 *
 * Yalnızca uzun kelimelerde açık: kısa kelimelerde bir harf fark, kelimenin
 * kendisi kadar bilgi demek ("ara" ile "arı" farklı işler).
 */
export function yazimYakini(a: string, b: string): boolean {
  if (a.length < HATA_TOLERANSI_ESIGI || b.length < HATA_TOLERANSI_ESIGI) return false;
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a === b) return true;

  // Aynı uzunlukta: ya tek harf farklı ya da komşu iki harf yer değiştirmiş.
  if (a.length === b.length) {
    const farklar: number[] = [];
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) farklar.push(i);
      if (farklar.length > 2) return false;
    }
    if (farklar.length <= 1) return true;
    const [i, j] = farklar;
    return j === i + 1 && a[i] === b[j] && a[j] === b[i];
  }

  // Uzunluk bir fark: biri diğerinden tek harf eksik/fazla mı.
  const uzun = a.length > b.length ? a : b;
  const kisa = a.length > b.length ? b : a;
  let ui = 0;
  let ki = 0;
  let atlandi = false;
  while (ui < uzun.length && ki < kisa.length) {
    if (uzun[ui] === kisa[ki]) {
      ui++;
      ki++;
      continue;
    }
    if (atlandi) return false;
    atlandi = true;
    ui++;
  }
  return true;
}

/**
 * Tek bir sorgu kelimesinin, aday kelimeler arasındaki en iyi karşılığı.
 * Bulunamazsa 0 döner.
 */
function kelimePuani(sorguKelimesi: string, adayKelimeler: string[]): number {
  const kok = kokBul(sorguKelimesi);
  let enIyi = 0;

  for (const aday of adayKelimeler) {
    if (aday === sorguKelimesi) return 100;
    if (aday.startsWith(sorguKelimesi)) {
      enIyi = Math.max(enIyi, 80);
      continue;
    }
    // Kök eşleşmesi: "hazırla" ile "hazırlandı" buradan tutuyor
    // (kökler "hazırl" ve "hazırlan", biri diğerinin başlangıcı).
    const adayKok = kokBul(aday);
    if (adayKok.startsWith(kok) || kok.startsWith(adayKok)) {
      enIyi = Math.max(enIyi, 60);
      continue;
    }
    if (aday.includes(sorguKelimesi)) {
      enIyi = Math.max(enIyi, 50);
      continue;
    }
    if (yazimYakini(sorguKelimesi, aday) || yazimYakini(kok, adayKok)) {
      enIyi = Math.max(enIyi, 40);
    }
  }
  return enIyi;
}

/**
 * Görevin sorguya uygunluk puanı. Sorgudaki kelimelerden BİRİ bile hiçbir
 * yerde karşılık bulmuyorsa `null` — yani "hepsi geçmeli" kuralı.
 */
export function gorevPuani(sorgu: string, gorev: AranabilirGorev): number | null {
  const sorguKelimeleri = kelimelereBol(sorgu);
  if (!sorguKelimeleri.length) return null;

  const baslikKelimeleri = kelimelereBol(gorev.baslik);
  const baglamKelimeleri = (gorev.baglam ?? [])
    .filter((m): m is string => Boolean(m))
    .flatMap(kelimelereBol);

  let toplam = 0;
  for (const kelime of sorguKelimeleri) {
    const baslikta = kelimePuani(kelime, baslikKelimeleri) * BASLIK_AGIRLIGI;
    const baglamda = kelimePuani(kelime, baglamKelimeleri) * BAGLAM_AGIRLIGI;
    const enIyi = Math.max(baslikta, baglamda);
    // Tek bir kelimenin karşılığı yoksa görev eşleşmiyor demektir.
    if (enIyi === 0) return null;
    toplam += enIyi;
  }

  // Sorgunun tamamı başlıkta bitişik geçiyorsa öne çıksın: kullanıcı adını
  // doğru hatırladıysa o kayıt listenin başında olmalı.
  const normalBaslik = metniNormallestir(gorev.baslik);
  if (normalBaslik.includes(metniNormallestir(sorgu))) toplam += 150;
  // Eşitlikte kısa başlık kazanır: "Rapor" ile "Rapor revizyon toplantısı"
  // arasında, "rapor" arayan büyük ihtimalle ilkini kastediyor.
  toplam -= Math.min(normalBaslik.length / 20, 5);

  return toplam;
}

/** Görevleri sorguya göre süzer ve en iyiden kötüye sıralar. */
export function gorevleriAra<T>(
  sorgu: string,
  kayitlar: T[],
  cikar: (kayit: T) => AranabilirGorev,
  tavan = 8
): T[] {
  const eslesenler: GorevEslesmesi<T>[] = [];
  for (const kayit of kayitlar) {
    const puan = gorevPuani(sorgu, cikar(kayit));
    if (puan != null) eslesenler.push({ kayit, puan });
  }
  return eslesenler
    .sort((a, b) => b.puan - a.puan)
    .slice(0, tavan)
    .map((e) => e.kayit);
}
