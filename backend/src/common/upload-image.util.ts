import { BadRequestException } from "@nestjs/common";

/**
 * Yüklenen bir görselin GERÇEKTEN görsel olduğunu doğrular.
 *
 * SORUN. Kapak/avatar yükleyen sekiz uç nokta da dosyayı şöyle kaydediyordu:
 *
 *     const ext = (file.originalname.split(".").pop() || "jpg").toLowerCase();
 *     ...upload(path, file.buffer, { contentType: file.mimetype })
 *
 * Buradaki iki değerin ikisi de İSTEMCİDEN gelir ve ikisi de serbestçe
 * uydurulabilir: `file.mimetype` multipart parçasının Content-Type başlığıdır,
 * `originalname` ise sadece bir metin. Yani içeriği HTML olan bir dosya
 * `text/html` tipiyle ve `.html` uzantısıyla "kapak görseli" diye
 * yüklenebiliyordu.
 *
 * NEDEN ÖNEMLİ. Kapak kovalarının hepsi PUBLIC. Supabase public bir nesneyi
 * kayıtlı content-type'ıyla ve satır içi (inline) servis eder. Sonuç: giriş
 * yapmış herhangi bir kullanıcı, kendi alan adınızın altında kalıcı bir URL'e
 * sahip, istediği HTML/JavaScript'i barındırabilirdi — oltalama sayfası için
 * hazır zemin.
 *
 * ÇÖZÜM. İstemcinin söylediğine hiç bakılmaz. Dosyanın ilk baytlarındaki
 * imzaya (magic bytes) bakılarak tür TESPİT EDİLİR; content-type ve uzantı
 * tespit edilen türden türetilir. İmza tanınmıyorsa dosya reddedilir.
 *
 * SVG BİLEREK KABUL EDİLMİYOR. SVG bir XML belgesidir; içine <script> gömülür
 * ve tarayıcıda doğrudan açıldığında çalışır. İmza tabanlı tespit de SVG'de
 * işe yaramaz (sabit bir baytı yoktur, düz metindir). Kapak görseli için
 * ihtiyaç da yok.
 */

export interface DetectedImage {
  /** Tespit edilen gerçek MIME türü — istemcinin iddiası değil. */
  contentType: string;
  /** Tespit edilen türe karşılık gelen uzantı (noktasız, küçük harf). */
  ext: string;
}

/** Multer'daki sınırla aynı; burada da kontrol edilir (savunma katmanı). */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

interface Signature {
  contentType: string;
  ext: string;
  matches(buffer: Buffer): boolean;
}

const SIGNATURES: Signature[] = [
  {
    contentType: "image/png",
    ext: "png",
    // 89 'P' 'N' 'G' CR LF SUB LF
    matches: (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    contentType: "image/jpeg",
    ext: "jpg",
    // Tüm JPEG çeşitleri (JFIF, Exif, ...) FF D8 FF ile başlar.
    matches: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    contentType: "image/gif",
    ext: "gif",
    matches: (b) => b.length >= 6 && (b.subarray(0, 6).toString("ascii") === "GIF87a" || b.subarray(0, 6).toString("ascii") === "GIF89a"),
  },
  {
    contentType: "image/webp",
    ext: "webp",
    // RIFF konteyneri: "RIFF" + 4 bayt uzunluk + "WEBP"
    matches: (b) =>
      b.length >= 12 && b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP",
  },
];

/** Kullanıcıya gösterilecek kabul edilen türler listesi. */
const ACCEPTED_LABEL = "JPEG, PNG, GIF veya WebP";

/**
 * Dosyayı doğrular ve güvenli { contentType, ext } döndürür.
 *
 * @throws BadRequestException — dosya boşsa, çok büyükse veya tanınan bir
 *         görsel imzasıyla başlamıyorsa.
 */
export function detectImageUpload(file: { buffer?: Buffer; size?: number; originalname?: string }): DetectedImage {
  const buffer = file?.buffer;

  if (!buffer || buffer.length === 0) {
    throw new BadRequestException("Dosya boş.");
  }

  // Multer sınırı zaten var; bu, sınırı olmayan bir çağrı yolu eklenirse diye.
  const size = file.size ?? buffer.length;
  if (size > MAX_IMAGE_BYTES) {
    throw new BadRequestException(
      `Görsel en fazla ${Math.floor(MAX_IMAGE_BYTES / (1024 * 1024))} MB olabilir.`
    );
  }

  const match = SIGNATURES.find((signature) => signature.matches(buffer));

  if (!match) {
    // Sık yapılan hatayı ayırt edip anlaşılır bir mesaj verelim: SVG yükleyen
    // kullanıcı "dosyam bozuk mu?" diye düşünmesin.
    const basi = buffer.subarray(0, 512).toString("utf8").trimStart().toLowerCase();
    if (basi.startsWith("<svg") || basi.startsWith("<?xml")) {
      throw new BadRequestException(
        `SVG kabul edilmiyor (içine çalıştırılabilir kod gömülebildiği için). ${ACCEPTED_LABEL} yükleyin.`
      );
    }
    throw new BadRequestException(`Dosya bir görsel değil. ${ACCEPTED_LABEL} yükleyin.`);
  }

  return { contentType: match.contentType, ext: match.ext };
}
