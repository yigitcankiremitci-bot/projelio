/**
 * Uygulamanın dil çekirdeği — web, backend ve mobil aynı tipleri kullanır.
 *
 * ## Neden anahtar olarak TÜRKÇE metnin kendisi kullanılıyor
 *
 * Kod tabanında 20 binden fazla satırda gömülü Türkçe metin var. Her birine
 * `tasks.add.button` gibi bir anahtar uydurmak yalnızca çok uzun sürmezdi;
 * her dokunulan satır Türkçe tarafta da bir gerileme riski olurdu — yanlış
 * anahtar yazılan yerde kullanıcı boş dize görürdü.
 *
 * Kaynak metin anahtar olunca Türkçe render'ı KİMLİK fonksiyonudur: sözlükte
 * karşılığı bulunmayan metin olduğu gibi görünür. Yani eksik çeviri "boş ekran"
 * değil "Türkçe metin" demektir. Bu sayede çeviri dosya dosya ilerleyebilir ve
 * yarım kaldığı her an canlıya çıkabilir; Türkçe kullanan müşteri hiçbir
 * aşamada etkilenmez.
 *
 * Bedeli: Türkçe metin değişince sözlükteki karşılığı da güncellenmeli, yoksa
 * o satır sessizce Türkçeye düşer. Bunu `scripts/dil-denetimi.mjs` yakalıyor.
 */

export const locales = ["tr", "en"] as const;
export type Locale = (typeof locales)[number];

/** Türkçe hem varsayılan hem de sözlüklerin KAYNAK dili. */
export const defaultLocale: Locale = "tr";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

/**
 * "en-US", "EN", "en_GB" gibi etiketleri desteklenen bir dile indirger.
 * Tanımadığı etikette null döner — çağıran sırayla başka bir aday deneyebilir.
 */
export function normalizeLocale(tag: string | null | undefined): Locale | null {
  if (!tag) return null;
  const base = tag.trim().toLowerCase().split(/[-_]/)[0];
  return isLocale(base) ? base : null;
}

/**
 * Adaylar arasından ilk tanınan dili seçer; hiçbiri tanınmazsa varsayılana düşer.
 * Aday sırası çağıranın önceliğidir (ör. hesap tercihi > tarayıcı dili).
 */
export function resolveLocale(candidates: readonly (string | null | undefined)[]): Locale {
  for (const candidate of candidates) {
    const locale = normalizeLocale(candidate);
    if (locale) return locale;
  }
  return defaultLocale;
}

/**
 * HTTP Accept-Language başlığını q-değerine göre sıralı etiket listesine çevirir.
 * Backend'in tek dil ipucu bu başlık: kullanıcı henüz dil seçmediyse (locale null)
 * e-posta ve bildirimin hangi dilde gideceğine buradan karar veriliyor.
 */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith("q="));
      // Ağırlığı olmayan etiketin varsayılan önceliği 1'dir (RFC 9110).
      const weight = q ? Number.parseFloat(q.slice(2)) : 1;
      return { tag: tag.trim(), weight: Number.isFinite(weight) ? weight : 0 };
    })
    .filter((entry) => entry.tag.length > 0 && entry.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .map((entry) => entry.tag);
}

/**
 * Sözlük değeri: düz metin ya da çoğul biçimli.
 *
 * Türkçede sayıdan sonra çoğul eki gelmez ("3 görev"), İngilizcede gelir
 * ("3 tasks"). Bu yüzden çoğulluk yalnızca hedef dilin sorunu; kaynak metin
 * tek biçimde yazılır ve karşılığı gerekiyorsa iki biçimli olur.
 */
export type TranslationEntry = string | { one: string; other: string };
export type TranslationDict = Record<string, TranslationEntry>;

export interface TranslateOptions {
  /**
   * Eşsesli metinleri ayırmak için. "Kapat" düğmesi ile "Kapat" anahtarı aynı
   * Türkçe metni paylaşır ama İngilizcede "Close" ve "Off" olur. Sözlükte
   * anahtar `"Kapat ##anahtar"` biçiminde yazılır.
   */
  ctx?: string;
  /** `{ad}` gibi yer tutucuların yerine konacak değerler. */
  [param: string]: string | number | undefined;
}

/** Sözlükte aranacak anahtarı üretir. Bağlam varsa metnin sonuna eklenir. */
export function dictKey(text: string, ctx?: string): string {
  return ctx ? `${text} ##${ctx}` : text;
}

const PLACEHOLDER = /\{(\w+)\}/g;

function interpolate(text: string, params: TranslateOptions | undefined): string {
  if (!params) return text;
  return text.replace(PLACEHOLDER, (match, name: string) => {
    const value = params[name];
    // Tanımsız yer tutucu OLDUĞU GİBİ bırakılıyor: boş dizeye çevirmek
    // "Görev  silindi" gibi sessiz bozukluklar üretir, kaldı ki yer tutucunun
    // adı ekranda görünürse hata gözle yakalanır.
    return value === undefined ? match : String(value);
  });
}

/**
 * Bir dil için çevirmen üretir.
 *
 * Türkçede sözlük hiç okunmaz — kaynak metin doğrudan döner. Bu bilinçli:
 * mevcut davranışın değişme ihtimalini sıfırlar ve Türkçe tarafta arama
 * maliyeti bırakmaz.
 */
export function createTranslator(locale: Locale, dict: TranslationDict) {
  return function translate(text: string, options?: TranslateOptions): string {
    if (locale === defaultLocale) return interpolate(text, options);

    const entry = dict[dictKey(text, options?.ctx)] ?? dict[text];
    if (entry === undefined) {
      // Çevirisi olmayan metin Türkçe görünür. Sessizce boş bırakmaktan iyidir.
      return interpolate(text, options);
    }

    if (typeof entry === "string") return interpolate(entry, options);

    const count = Number(options?.n ?? options?.count);
    const form = count === 1 ? entry.one : entry.other;
    return interpolate(form, options);
  };
}

export type Translate = ReturnType<typeof createTranslator>;
