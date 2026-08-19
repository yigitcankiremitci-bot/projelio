/**
 * Yüklenen dosyanın adını onarır.
 *
 * SORUN. multipart isteğindeki dosya adı `Content-Disposition` başlığında
 * gelir ve busboy bu başlığı varsayılan olarak **latin1** kabul ederek çözer
 * (`defParamCharset: "latin1"`). Tarayıcı ise adı UTF-8 baytları olarak
 * gönderir. Sonuç, her baytın ayrı bir latin1 harfine dönüşmesi:
 *
 *     "Özet.pdf"  ->  UTF-8: C3 96 7A ...  ->  latin1 okuması: "Ã–zet.pdf"
 *
 * Türkçenin neredeyse tüm özel harfleri (ç ğ ı İ ö ş ü ve büyükleri) iki baytla
 * kodlandığı için pratikte Türkçe adlı her dosya bozuluyordu — hem Drive'da
 * hem de bizim listemizde.
 *
 * NEDEN BUSBOY'A AYAR GEÇMİYORUZ. Doğrusu `defParamCharset: "utf8"` olurdu ama
 * multer (2.0.2) busboy'a yalnızca `limits` ve `preservePath` seçeneklerini
 * aktarıyor (bkz. node_modules/multer/lib/make-middleware.js) — araya girmenin
 * yolu yok. Bu yüzden onarımı adı okuduğumuz yerde yapıyoruz.
 *
 * NEDEN KOŞULSUZ ÇEVİRMİYORUZ. Zaten doğru gelmiş bir adı latin1 sanıp yeniden
 * çözmek onu bozar. O yüzden önce "bu dizi latin1'e sıkışmış bir UTF-8 mi"
 * diye bakılır; değilse ada dokunulmaz. Aynı sebeple bu yardımcı YALNIZCA
 * multipart'tan gelen adlara uygulanır — Picker'dan ya da JSON gövdesinden
 * gelen adlar zaten doğru UTF-8'dir.
 */

/**
 * latin1'e sıkışmış bir UTF-8 dizisinin imzası: 2–4 baytlık bir UTF-8
 * başlangıç baytını (C2–F4) hemen bir devam baytı (80–BF) izler. Düz latin1
 * metinde bu ikili neredeyse hiç görülmez.
 */
const MOJIBAKE = /[Â-ô][-¿]/;

export function decodeUploadFileName(raw: string | undefined | null): string {
  if (!raw) return "";
  if (!MOJIBAKE.test(raw)) return raw;

  const repaired = Buffer.from(raw, "latin1").toString("utf8");
  // Çözüm başarısızsa (gerçekten latin1 bir adla karşılaştıysak) U+FFFD çıkar;
  // o durumda orijinali korumak, adı çöpe çevirmekten iyidir.
  return repaired.includes("�") ? raw : repaired;
}
