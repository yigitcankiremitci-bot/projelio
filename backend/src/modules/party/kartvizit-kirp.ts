import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { calismaKlasoru, ffmpegVarMi, temizle } from "../social-media/video-kareleri";
import { kirpmaHesabi, type Koseler } from "./kartvizit-plani";

/**
 * Kartvizit fotoğrafını köşelerinden düzleştirip kırpar — ffmpeg ile.
 *
 * Masada çekilmiş, eğik bir kartvizit fotoğrafı karta olduğu gibi eklenince
 * listede küçük önizlemede okunmuyordu. Lio dört köşeyi verir; ffmpeg'in
 * perspective filtresi o dörtgeni dikdörtgene açar.
 *
 * ffmpeg imajdaki sistem paketi (Dockerfile.backend, video önerisi için
 * kuruldu). Yoksa ya da herhangi bir adım başarısız olursa ÖZGÜN fotoğraf
 * döner: kırpılamadı diye kartvizit karta eklenmeden kalmamalı.
 */

const ZAMAN_ASIMI_MS = 30_000;

function calistir(komut: string, argumanlar: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(komut, argumanlar, { timeout: ZAMAN_ASIMI_MS, maxBuffer: 1024 * 1024 }, (err, stdout) =>
      err ? reject(err) : resolve(stdout)
    );
  });
}

export interface KirpilmisGorsel {
  buffer: Buffer;
  mimeType: string;
  kirpildi: boolean;
}

export async function kartviziKirp(buffer: Buffer, mimeType: string, koseler?: Koseler): Promise<KirpilmisGorsel> {
  const ozgun = { buffer, mimeType, kirpildi: false };
  if (!koseler || !mimeType.startsWith("image/") || !(await ffmpegVarMi())) return ozgun;

  const klasor = await calismaKlasoru();
  try {
    const giris = join(klasor, "giris");
    const cikis = join(klasor, "kartvizit.jpg");
    await writeFile(giris, buffer);
    const boyut = (
      await calistir("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", giris])
    )
      .trim()
      .split(",")
      .map(Number);
    const [w, h] = boyut;
    if (!w || !h) return ozgun;
    const k = kirpmaHesabi(koseler, w, h);
    if (!k) return ozgun;
    const noktalar = k.noktalar.flat().join(":");
    await calistir("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-i",
      giris,
      "-frames:v",
      "1",
      "-vf",
      `perspective=${noktalar}:interpolation=cubic,scale=${k.genislik}:${k.yukseklik}`,
      "-q:v",
      "3",
      cikis,
    ]);
    return { buffer: await readFile(cikis), mimeType: "image/jpeg", kirpildi: true };
  } catch {
    return ozgun;
  } finally {
    await temizle(klasor);
  }
}
