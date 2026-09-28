import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { kareZamanlari } from "./lio-oneri";

/**
 * Videodan kare ve ses çıkarma — ffmpeg ile.
 *
 * NEDEN SUNUCUDA: Lio'nun modelleri video kabul etmiyor, yalnızca görsel. Kare
 * tarayıcıda da (<video> + canvas) alınabilirdi ama video Drive/OneDrive'da
 * duruyor; yüzlerce MB'lık dosyayı telefondaki WebView'e indirip çözdürmek hem
 * yavaş hem de codec'e bağlı (iPhone'un HEVC .mov'u Android'de açılmıyor).
 * ffmpeg her biçimi okur ve dosya zaten sunucudan geçiyor.
 *
 * ffmpeg bir npm bağımlılığı değil, imajdaki sistem paketi (Dockerfile.backend).
 * Kurulu değilse (ör. yerel geliştirme) özellik kapanır, hata kullanıcıya
 * açıkça söylenir — `ffmpegVarMi`.
 */

/** Tek ffmpeg çağrısı için tavan: asılı kalan süreç isteği sonsuza kadar tutmasın. */
const KOMUT_ZAMAN_ASIMI_MS = 60_000;

/**
 * İndirilecek video tavanı. Reels en fazla 15 dk ve Instagram 1 GB'ı kabul
 * ediyor; daha büyüğü zaten yayımlanamaz, diski boşuna doldurmayalım.
 */
export const MAX_VIDEO_BAYT = 1024 * 1024 * 1024;

/** Kareler uzun kenarı 768 px olacak biçimde küçültülür (~450 token/kare). */
const KARE_KENAR = 768;

export class VideoIslenemedi extends Error {}

let ffmpegDurumu: Promise<boolean> | null = null;

/** Sunucuda ffmpeg var mı? Süreç ömründe bir kez sorulur. */
export function ffmpegVarMi(): Promise<boolean> {
  ffmpegDurumu ??= calistir("ffmpeg", ["-version"], 10_000).then(
    () => true,
    () => false
  );
  return ffmpegDurumu;
}

/** Geçici çalışma klasörü; iş bitince `temizle` ile silinir. */
export async function calismaKlasoru(): Promise<string> {
  return mkdtemp(join(tmpdir(), "projelio-lio-"));
}

export async function temizle(klasor: string): Promise<void> {
  await rm(klasor, { recursive: true, force: true }).catch(() => undefined);
}

/**
 * Bulut dosyasının yanıtını diske akıtır.
 *
 * Belleğe (arrayBuffer) almıyoruz: 500 MB'lık bir video sunucunun belleğini
 * tek istekte doldurur. Tavan akış sırasında da sayılıyor — content-length
 * her sağlayıcıda gelmiyor.
 */
export async function diskeYaz(response: Response, hedef: string): Promise<void> {
  const uzunluk = Number(response.headers.get("content-length") ?? 0);
  if (uzunluk > MAX_VIDEO_BAYT) throw new VideoIslenemedi("Video çok büyük (en fazla 1 GB)."); // dil:anahtar
  if (!response.body) throw new VideoIslenemedi("Video dosyası okunamadı."); // dil:anahtar

  let toplam = 0;
  const sayac = new Transform({
    transform(parca: Buffer, _enc, cb) {
      toplam += parca.length;
      if (toplam > MAX_VIDEO_BAYT) return cb(new VideoIslenemedi("Video çok büyük (en fazla 1 GB).")); // dil:anahtar
      cb(null, parca);
    },
  });
  await pipeline(Readable.fromWeb(response.body as any), sayac, createWriteStream(hedef));
}

/** Videonun süresi (sn). Okunamazsa NaN — kare seçimi o durumda da çalışır. */
export async function videoSuresi(dosya: string): Promise<number> {
  try {
    const cikti = await calistir(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", dosya],
      KOMUT_ZAMAN_ASIMI_MS
    );
    return Number.parseFloat(cikti.trim());
  } catch {
    return NaN;
  }
}

/**
 * Verilen saniyelerden birer JPEG kare çıkarır.
 *
 * `-ss` girdiden ÖNCE: ffmpeg anahtar kareye atlar, videonun tamamını çözmez —
 * 3 dakikalık videoda bile her kare yarım saniyenin altında çıkıyor. Bir kare
 * alınamazsa (ör. süre yanlış okundu, son saniyenin ötesi) o kare atlanır.
 */
export async function kareleriCikar(dosya: string, klasor: string, sureSn: number, adet: number): Promise<Buffer[]> {
  const kareler: Buffer[] = [];
  const zamanlar = kareZamanlari(sureSn, adet);
  for (let i = 0; i < zamanlar.length; i++) {
    const cikti = join(klasor, `kare-${i}.jpg`);
    try {
      await calistir(
        "ffmpeg",
        ["-v", "error", "-y", "-ss", String(zamanlar[i]), "-i", dosya, "-frames:v", "1", "-vf", olcek(), "-q:v", "5", cikti],
        KOMUT_ZAMAN_ASIMI_MS
      );
      kareler.push(await readFile(cikti));
    } catch {
      // tek kare kaybı öneriyi durdurmaz
    }
  }
  if (kareler.length === 0) throw new VideoIslenemedi("Videodan kare alınamadı; dosya bozuk ya da desteklenmeyen biçimde olabilir."); // dil:anahtar
  return kareler;
}

/**
 * Görseli modele uygun boyuta indirir (JPEG). Anthropic 5 MB'ın üstündeki
 * görseli reddediyor; telefon fotoğrafları sık sık bunu aşıyor.
 */
export async function gorseliKucult(dosya: string, klasor: string): Promise<Buffer> {
  const cikti = join(klasor, `gorsel-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`);
  await calistir("ffmpeg", ["-v", "error", "-y", "-i", dosya, "-frames:v", "1", "-vf", olcek(), "-q:v", "4", cikti], KOMUT_ZAMAN_ASIMI_MS);
  return readFile(cikti);
}

/**
 * Videonun sesini yazıya çevrilecek küçük bir MP3'e çıkarır: tek kanal, 16 kHz,
 * 32 kbps — konuşma için yeterli ve 25 MB'lık çözümleme sınırına ~100 dakika
 * sığar. İlk 10 dakika yeter; reels'in çoğu 90 saniyenin altında.
 *
 * Videoda ses yoksa (ya da yalnızca sessizlik varsa) null döner: sessiz video
 * hata değil, sık görülen bir durum (yalnızca müzikli ya da altyazılı reels).
 */
export async function sesiCikar(dosya: string, klasor: string): Promise<Buffer | null> {
  const cikti = join(klasor, "ses.mp3");
  try {
    await calistir(
      "ffmpeg",
      ["-v", "error", "-y", "-i", dosya, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "32k", "-t", "600", cikti],
      KOMUT_ZAMAN_ASIMI_MS
    );
    const bilgi = await stat(cikti);
    // 1 KB'ın altı başlıktan ibaret: ses izi yok ya da birkaç milisaniye.
    return bilgi.size > 1024 ? readFile(cikti) : null;
  } catch {
    return null;
  }
}

/** Uzun kenarı KARE_KENAR'a indirir; küçük görseli büyütmez. */
function olcek(): string {
  return `scale='if(gt(iw,ih),min(${KARE_KENAR},iw),-2)':'if(gt(iw,ih),-2,min(${KARE_KENAR},ih))'`;
}

function calistir(komut: string, argumanlar: string[], zamanAsimiMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(komut, argumanlar, { timeout: zamanAsimiMs, maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}
