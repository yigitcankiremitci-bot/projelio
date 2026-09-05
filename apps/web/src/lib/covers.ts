/**
 * Kapak görselleri — tek kaynak.
 *
 * Üç durum var ve önceden her sayfa bunu kendi başına, farklı şekilde çözüyordu:
 *
 *  1. Kullanıcının yüklediği fotoğraf (coverImageUrl bir URL)
 *  2. Hazır kapak kütüphanesinden bir seçim (coverImageUrl "preset:<key>")
 *  3. Hiçbiri (coverImageUrl boş) — bu durumda kaydın KİMLİĞİNDEN türetilen bir
 *     hazır kapak gösterilir (bkz. presetForSeed). Boş gri bir dikdörtgen,
 *     rastgele bir gradyandan her zaman daha kötü duruyordu.
 *
 * Ayıklanan hata: 3. durumda arka plan koyu lacivert bir gradyandı ama başlık ve
 * açıklama koyu renkte (textPrimary/textSecondary) yazılıyordu — yani kapağı
 * olmayan her iş/şirket/grup sayfasında yazılar okunmuyordu. 1. durumda ise
 * fotoğrafın üstüne beyaz bir perde biniyor ve koyu yazı okunuyordu; iki dal
 * birbirinden habersizdi.
 *
 * Çözüm: arka plan ne olursa olsun yazının oturduğu bant beyaz bir perdeyle
 * açılır (COVER_TEXT_VEIL). Böylece tek bir yazı rengi kuralı yeter ve yeni bir
 * kapak eklendiğinde kontrast bozulmaz. Perdenin yeterliliği covers.test.ts'te
 * ölçülüyor.
 */

export interface CoverPreset {
  key: string;
  name: string;
  /** Kapağın kendi arka planı (perde uygulanmadan). */
  background: string;
  /**
   * Kapağın en koyu rengi. Kontrast testi bunu kullanır: perde bu rengin
   * üstüne bindiğinde bile yazı okunabilir kalmalı.
   */
  darkest: string;
}

const PRESET_PREFIX = "preset:";

/**
 * Hazır kapaklar. Dosya değil CSS oldukları için depolama gerektirmezler,
 * her ekran çözünürlüğünde net görünürler ve anında yüklenirler.
 * coverImageUrl alanına "preset:<key>" olarak yazılırlar.
 */
export const COVER_PRESETS: CoverPreset[] = [
  {
    key: "arduvaz",
    name: "Arduvaz", // dil:anahtar
    background: "linear-gradient(135deg, #4A5567 0%, #1C222C 100%)",
    darkest: "#1C222C",
  },
  {
    key: "bronz",
    name: "Bronz", // dil:anahtar
    background: "linear-gradient(135deg, #D2A063 0%, #8C5A28 100%)",
    darkest: "#8C5A28",
  },
  {
    key: "safak",
    name: "Şafak", // dil:anahtar
    background: "linear-gradient(135deg, #F6E0BC 0%, #C0813F 100%)",
    darkest: "#C0813F",
  },
  {
    key: "sis",
    name: "Sis", // dil:anahtar
    background: "linear-gradient(135deg, #EEF1F6 0%, #B9C4D3 100%)",
    darkest: "#B9C4D3",
  },
  {
    key: "okyanus",
    name: "Okyanus", // dil:anahtar
    background: "linear-gradient(135deg, #3C6D88 0%, #16323F 100%)",
    darkest: "#16323F",
  },
  {
    key: "orman",
    name: "Orman", // dil:anahtar
    background: "linear-gradient(135deg, #4B8163 0%, #1E3A2C 100%)",
    darkest: "#1E3A2C",
  },
  {
    key: "kiremit",
    name: "Kiremit", // dil:anahtar
    background: "linear-gradient(135deg, #B06A55 0%, #5B2C24 100%)",
    darkest: "#5B2C24",
  },
  {
    key: "mor",
    name: "Mor", // dil:anahtar
    background: "linear-gradient(135deg, #6F5D93 0%, #2C2440 100%)",
    darkest: "#2C2440",
  },
  {
    key: "kum",
    name: "Kum", // dil:anahtar
    background: "linear-gradient(135deg, #F4EADA 0%, #C9B189 100%)",
    darkest: "#C9B189",
  },
  {
    key: "dalga",
    name: "Dalga", // dil:anahtar
    background:
      "radial-gradient(120% 85% at 8% 100%, rgba(192,129,63,0.60) 0%, rgba(192,129,63,0) 62%), " +
      "radial-gradient(100% 70% at 92% 0%, rgba(133,147,168,0.55) 0%, rgba(133,147,168,0) 58%), " +
      "linear-gradient(135deg, #3E4858 0%, #1C222C 100%)",
    darkest: "#1C222C",
  },
  {
    key: "izgara",
    name: "Izgara", // dil:anahtar
    background:
      "repeating-linear-gradient(0deg, rgba(255,255,255,0.22) 0 1px, rgba(255,255,255,0) 1px 26px), " +
      "repeating-linear-gradient(90deg, rgba(255,255,255,0.22) 0 1px, rgba(255,255,255,0) 1px 26px), " +
      "linear-gradient(135deg, #4A5567 0%, #262E3B 100%)",
    darkest: "#262E3B",
  },
  {
    key: "benek",
    name: "Benek", // dil:anahtar
    background:
      "radial-gradient(rgba(255,255,255,0.26) 1.5px, rgba(255,255,255,0) 1.6px) 0 0/18px 18px, " +
      "linear-gradient(135deg, #55617A 0%, #2A3241 100%)",
    darkest: "#2A3241",
  },
];

/**
 * Hiç kapak seçilmemişken kullanılan arka plan. Marka renginin çok açık bir
 * tonu: yazı bandı perdeyle zaten açılıyor, üst kısım da boş bir gri değil.
 */
export const DEFAULT_COVER: CoverPreset = {
  key: "__default",
  name: "Varsayılan", // dil:anahtar
  background: "linear-gradient(135deg, #E7EBF1 0%, #C6CFDC 55%, #AEB9CA 100%)",
  darkest: "#AEB9CA",
};

/**
 * Yazının oturduğu bandı açan perde. Kapağın alt kısmına, yazının ALTINA
 * serilir; üst tarafta kapak olduğu gibi görünür.
 *
 * Değerler keyfi değil: yazı bandı perdenin %0–40 aralığına denk gelir ve orada
 * beyazlık en az 0.90'dır — en koyu kapakta bile textSecondary okunur kalır
 * (bkz. covers.test.ts).
 */
export const COVER_TEXT_VEIL =
  "linear-gradient(to top, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.90) 28%, " +
  "rgba(255,255,255,0.86) 45%, rgba(255,255,255,0.55) 65%, rgba(255,255,255,0.20) 84%, rgba(255,255,255,0) 100%)";

/**
 * Karanlık moddaki perde — aynı alfa kademeleri, beyaz yerine temanın koyu
 * zemin rengi (colors.dark.background). Aydınlık moddaki perde hep beyaza
 * açıldığı için karanlık modda sayfanın geri kalanıyla çarpışan parlak bir
 * leke gibi duruyordu.
 */
export const COVER_TEXT_VEIL_DARK =
  "linear-gradient(to top, rgba(18,21,27,0.95) 0%, rgba(18,21,27,0.90) 28%, " +
  "rgba(18,21,27,0.86) 45%, rgba(18,21,27,0.55) 65%, rgba(18,21,27,0.20) 84%, rgba(18,21,27,0) 100%)";

/** Perdenin kapladığı yükseklik oranı (kapağın alt %72'si). */
export const COVER_VEIL_HEIGHT = "72%";

/** Yazı bandının başladığı yerdeki en düşük beyazlık — kontrast testinin girdisi. */
export const COVER_VEIL_MIN_ALPHA = 0.86;

/**
 * Kapak üstündeki yazı renkleri (aydınlık mod / beyaz perde).
 *
 * Tema paletindeki textSecondary (#66707F) düz beyaz zeminde yeterli ama perdeli
 * bir kapağın üstünde 4.5:1'i tutturamıyor (koyu kapaklarda 4.1'e düşüyordu).
 * Perdeyi büsbütün opak yapmak yerine — o zaman kapak görünmez olurdu — kapağa
 * özel, bir tık daha koyu bir ikincil renk kullanıyoruz.
 */
export const COVER_TEXT_PRIMARY = "#1A1F29";
export const COVER_TEXT_SECONDARY = "#566070";

/**
 * Karanlık moddaki (koyu perde) karşılıkları — aynı mantıkla, normal karanlık
 * mod textSecondary'sinden (#9AA2B0) bir tık daha açık.
 */
export const COVER_TEXT_PRIMARY_DARK = "#F5F6F8";
export const COVER_TEXT_SECONDARY_DARK = "#B7BEC9";

/**
 * Kapağı olmayan bir kayda hazır kapaklardan birini seçer.
 *
 * Neden kayda YAZILMIYOR da kimlikten türetiliyor:
 *  - Mevcut binlerce kayıt için migration ve toplu güncelleme gerekmiyor;
 *    kural konduğu an her yerde geçerli oluyor.
 *  - Seçim her yüzeyde AYNI çıkıyor: kart, sayfa başlığı ve düzenleme
 *    önizlemesi aynı kapağı gösterir.
 *  - Her çizimde gerçekten rastgele seçilseydi kapak sayfa yenilendikçe
 *    değişirdi; kullanıcı bir kaydı rengiyle tanıyamaz, üstelik listede
 *    kaydırdıkça renkler oynardı.
 *
 * Kullanıcı bir kapak seçtiği anda coverImageUrl dolar ve buranın hükmü kalkar.
 */
export function presetForSeed(seed: string): CoverPreset {
  // FNV-1a: bağımlılıksız, kısa ve aynı girdi için her yerde aynı sonucu verir.
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return COVER_PRESETS[(hash >>> 0) % COVER_PRESETS.length];
}

export function isCoverPreset(value?: string | null): boolean {
  return typeof value === "string" && value.startsWith(PRESET_PREFIX);
}

export function coverPresetValue(key: string): string {
  return `${PRESET_PREFIX}${key}`;
}

export function findCoverPreset(value?: string | null): CoverPreset | undefined {
  if (!isCoverPreset(value)) return undefined;
  const key = value!.slice(PRESET_PREFIX.length);
  return COVER_PRESETS.find((p) => p.key === key);
}

/**
 * Bir kapak değerinin CSS arka planı. Fotoğraf, hazır kapak ve "hiç kapak yok"
 * durumlarının tamamı buradan geçer — kart, sayfa başlığı, önizleme hepsi aynı
 * görünsün diye.
 *
 * Silinmiş/bozuk bir preset anahtarı gelirse varsayılana düşer; kırık bir
 * arka plan yerine düzgün bir kapak görünür.
 */
export function coverBackground(coverImageUrl?: string | null, seed?: string): string {
  const preset = findCoverPreset(coverImageUrl);
  if (preset) return preset.background;
  if (coverImageUrl && !isCoverPreset(coverImageUrl)) return `center/cover no-repeat url(${coverImageUrl})`;
  // Kapak seçilmemiş: kaydın kimliğinden türetilmiş bir hazır kapak. Tohum
  // verilmediyse (henüz kimliği olmayan bir önizleme) düz varsayılana düşülür.
  return seed ? presetForSeed(seed).background : DEFAULT_COVER.background;
}

/**
 * Kullanıcının gerçekten bir kapak SEÇİP seçmediği.
 *
 * Türetilmiş kapak (presetForSeed) bunu doldurmaz — bu ayrım "kapak ekle"
 * düğmesinin görünüp görünmeyeceğine karar verirken gerekiyor: kayıt renkli
 * görünüyor olsa da kullanıcı henüz kendi kapağını koymamış olabilir.
 */
export function hasCover(coverImageUrl?: string | null): boolean {
  return Boolean(coverImageUrl);
}
