import { BadRequestException } from "@nestjs/common";

/**
 * Adres güvenlik kuralının SUNUCU tarafındaki kopyası.
 *
 * NEDEN KOPYA:
 *
 * `packages/shared/src/safeUrl` dosyasını GÖRELİ yolla almak olmuyor: import
 * `backend/src` dışına çıkınca tsc'nin çıkarımsal rootDir'i depo köküne kayıyor
 * ve `nest build` çıktıyı `dist/backend/src/main.js` altına taşıyor.
 * `render.yaml` ise `node backend/dist/main` çalıştırıyor — yani üretim kırılır.
 *
 * KURAL BU YÜZDEN İKİ YERDE: burada (sunucu) ve `packages/shared/src/safeUrl.ts`
 * (web). İkisinin ayrışmaması `safe-url.test.ts` ile sabitleniyor — o test iki
 * uygulamayı aynı girdilerle karşılaştırıyor ve biri değişirse kırılır.
 *
 * ESKİMİŞ NOT (2026-08-29'da düzeltildi): burada eskiden "`@projelio/shared`'dan
 * DEĞER import edilemez, hepsi `import type` olmalı" yazıyordu. Sebebi paketin
 * derlenmeden ham `.ts` olarak yayınlanmasıydı; `node dist/main` içindeki
 * `require("@projelio/shared")` çağrısını Node çözemiyor, `ERR_MODULE_NOT_FOUND:
 * .../packages/shared/src/types` ile backend açılışta çöküyordu. Yazılı olmayan
 * bu kural zamanla üç yerde sessizce kırıldı (kurulum sihirbazı, Lio'nun modül
 * tanımları, proje takip linki). Artık paketin bir derleme adımı var
 * (`packages/shared/tsconfig.build.json` + `package.json` içindeki "exports":
 * Node CommonJS `dist`i, paketleyiciler kaynağı okuyor) ve backend değer de
 * import edebiliyor. Buradaki kopya yine de duruyor — sebebi yukarıdaki rootDir
 * meselesi, o değişmedi.
 *
 * ---
 *
 * Kuralın kendisi: React JSX içindeki METNİ kaçırır ama ADRESLERİ kaçırmaz.
 * `<a href={url}>` içindeki url `javascript:...` ise tıklandığında kod sayfanın
 * kendi kökeninde çalışır. Görev bağlantı ekleri ve sosyal hesap adresleri
 * kullanıcı tarafından yazıldığı için bu somut bir yol.
 */

const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/**
 * @returns Açılması güvenli, normalleştirilmiş adres; güvenli değilse null.
 */
export function safeExternalUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;

  // Boşluk ve kontrol karakterleri temizlenir: bunlar şema kontrolünü atlatmak
  // için kullanılıyor — araya sekme sıkıştırılmış "java<TAB>script:alert(1)"
  // bazı tarayıcılarda javascript: olarak yorumlanır.
  const cleaned = raw.replace(/[\u0000-\u0020]/g, "");
  if (!cleaned) return null;

  // Şemasız girdi ("ornek.com") kullanıcı için normal; https varsayıyoruz.
  // AMA host'ta nokta ŞART: "denemebir" gibi bir yazı `https://denemebir/` diye
  // kaydedilirse kullanıcı bağlantı eklediğini sanır, tıklayınca hiçbir yere
  // gitmez. Şemayı BİZ uydurduğumuz için doğrulama yükü de bizde. Kullanıcı
  // şemayı kendisi yazdıysa (ör. `http://wiki`) karışmıyoruz — bilerek yazmıştır.
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(cleaned);
  const candidate = hasScheme ? cleaned : `https://${cleaned.replace(/^\/+/, "")}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol.toLowerCase())) return null;
  // Şemayı biz eklediysek host gerçek bir alan adına benzemeli.
  if (!hasScheme && !parsed.hostname.includes(".")) return null;
  if (parsed.protocol !== "mailto:" && !parsed.hostname) return null;

  return parsed.toString();
}

/**
 * Adresi doğrular ve normalleştirilmiş hâlini döndürür; güvenli değilse 400 atar.
 * Servislerde tekrar eden "null geldiyse hata fırlat" kalıbını tek yere alıyor.
 */
export function requireSafeUrl(raw: string | null | undefined, field: string): string {
  const safe = safeExternalUrl(raw);
  if (!safe) {
    throw new BadRequestException(`${field} geçersiz. http:// veya https:// ile başlayan bir adres girin.`);
  }
  return safe;
}
