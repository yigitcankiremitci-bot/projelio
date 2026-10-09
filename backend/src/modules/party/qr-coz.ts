import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import jsQR from "jsqr";
import { calismaKlasoru, ffmpegVarMi, temizle } from "../social-media/video-kareleri";

/**
 * Görseldeki QR kodu çözer (dijital kartvizit QR'ı, ekran görüntüsü).
 *
 * Model QR'ı güvenilir okuyamıyor — modüller yerine kare desenini "görüyor"
 * ama içeriği tahmin ediyor. Çözme sunucuda: ffmpeg görseli ham RGBA
 * piksellere açar (her biçimi okur: HEIC, WebP, PNG), jsQR çözer.
 *
 * İki ölçekte denenir: büyük fotoğrafta QR küçük kalabiliyor (1600 px'te
 * bulunur), ekran görüntüsünde ise fazla büyük ve gürültülü (800 px'te
 * bulunur). Bulunamazsa null — çağıran Lio'ya "QR çözülemedi" der.
 */

const ZAMAN_ASIMI_MS = 20_000;

function rgba(giris: string, uzunKenar: number): Promise<{ veri: Buffer; w: number; h: number }> {
  return new Promise((resolve, reject) => {
    // Önce boyutu öğren, sonra aynı oranda ölçekleyip ham piksel al.
    execFile(
      "ffprobe",
      ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", giris],
      { timeout: ZAMAN_ASIMI_MS },
      (err, out) => {
        if (err) return reject(err);
        const [w0, h0] = String(out).trim().split(",").map(Number);
        if (!w0 || !h0) return reject(new Error("boyut okunamadı"));
        const olcek = Math.min(1, uzunKenar / Math.max(w0, h0));
        const w = Math.max(2, Math.round(w0 * olcek));
        const h = Math.max(2, Math.round(h0 * olcek));
        execFile(
          "ffmpeg",
          ["-v", "error", "-i", giris, "-frames:v", "1", "-vf", `scale=${w}:${h}`, "-f", "rawvideo", "-pix_fmt", "rgba", "-"],
          { timeout: ZAMAN_ASIMI_MS, encoding: "buffer", maxBuffer: w * h * 4 + 1024 },
          (err2, veri) => (err2 ? reject(err2) : resolve({ veri: veri as Buffer, w, h }))
        );
      }
    );
  });
}

/** Ham RGBA piksellerden QR içeriği (ffmpeg'siz sınanabilsin diye ayrı). */
export function piksellerdenQr(veri: Buffer | Uint8ClampedArray, w: number, h: number): string | null {
  const dizi = veri instanceof Uint8ClampedArray ? veri : new Uint8ClampedArray(veri.buffer, veri.byteOffset, w * h * 4);
  const kod = jsQR(dizi, w, h, { inversionAttempts: "attemptBoth" });
  if (!kod) return null;
  // Telefonlar QR'a metni UTF-8 bayt olarak yazar; jsQR'ın kendi metin çözümü
  // bunu her zaman tutturmuyor ("Ayşe" → "AyÅe"). Baytlar geçerli UTF-8 ise
  // o kullanılır, değilse jsQR'ın okuduğu.
  const utf8 = Buffer.from(kod.binaryData).toString("utf8");
  return (utf8.includes("\uFFFD") ? kod.data : utf8) || null;
}

export async function qrCoz(buffer: Buffer): Promise<string | null> {
  if (!(await ffmpegVarMi())) return null;
  const klasor = await calismaKlasoru();
  try {
    const giris = join(klasor, "qr");
    await writeFile(giris, buffer);
    for (const kenar of [1600, 800]) {
      try {
        const { veri, w, h } = await rgba(giris, kenar);
        const kod = piksellerdenQr(veri, w, h);
        if (kod) return kod;
      } catch {
        // Bu ölçekte açılamadı; diğerini dene.
      }
    }
    return null;
  } finally {
    await temizle(klasor);
  }
}
