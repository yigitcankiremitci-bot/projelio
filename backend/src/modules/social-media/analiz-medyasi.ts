import type Anthropic from "@anthropic-ai/sdk";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { kareSayisi } from "./lio-oneri";
import { diskeYaz, gorseliKucult, kareleriCikar, sesiCikar, videoSuresi } from "./video-kareleri";

// SDK bu tipi dışa açmıyor (lio-oneri.service.ts'teki aynı satır).
type ContentBlockParam = Extract<Anthropic.MessageParam["content"], any[]>[number];

/** ffmpeg yokken görsel olduğu gibi gönderilir; Anthropic'in 5 MB sınırının altında kalmalı. */
const HAM_GORSEL_TAVANI = 4 * 1024 * 1024;
const MODELIN_OKUDUGU_GORSEL = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/** Analizde modele gösterilen kare tavanı (bütün medya birlikte). */
export const ANALIZ_KARE_TAVANI = 10;

export interface AnalizKaynagi {
  /** Modele kareden önce verilen etiket: "Video", "Kapak görseli", "Karusel 2. görsel". */
  etiket: string;
  ac: () => Promise<{ response: Response; mimeType: string }>;
}

export interface HazirMedya {
  bloklar: ContentBlockParam[];
  /** Modele giden toplam kare/görsel. */
  kare: number;
  videoVar: boolean;
  /** İlk videonun sesi (mp3) — yoksa null. */
  ses: Buffer | null;
}

/**
 * Analiz edilecek medyayı (videonun kareleri + görseller) modelin okuyacağı
 * bloklara çevirir.
 *
 * Gönderi önerisindeki (LioOneriService.medyayiHazirla) akışın kaynaktan
 * bağımsız hali: orada dosya hep Drive/OneDrive'dan geliyor, analizde ise
 * Instagram'ın CDN'inden (kendi gönderin) ya da Drive'dan (ilham referansı).
 *
 * Okunamayan kaynak analizi DURDURMAZ, atlanır: telifli müzikli bir reels'in
 * video adresi Meta'dan hiç gelmeyebilir, kapağı ve açıklaması yine de bir
 * şey söyler. Hiç kare çıkmazsa `kare: 0` döner; metne dayalı analize düşmek
 * çağıranın kararı.
 */
export async function analizMedyasiniHazirla(
  kaynaklar: AnalizKaynagi[],
  klasor: string,
  ffmpeg: boolean
): Promise<HazirMedya> {
  const bloklar: ContentBlockParam[] = [];
  let kare = 0;
  let videoVar = false;
  let ses: Buffer | null = null;

  for (let i = 0; i < kaynaklar.length && kare < ANALIZ_KARE_TAVANI; i++) {
    const kaynak = kaynaklar[i];
    let acik: { response: Response; mimeType: string };
    try {
      acik = await kaynak.ac();
    } catch {
      continue;
    }
    const { response, mimeType } = acik;
    const kalan = ANALIZ_KARE_TAVANI - kare;

    try {
      if (mimeType.startsWith("video/")) {
        if (!ffmpeg) {
          await response.body?.cancel().catch(() => undefined);
          continue;
        }
        const yol = join(klasor, `analiz-video-${i}`);
        await diskeYaz(response, yol);
        const sure = await videoSuresi(yol);
        const kareler = await kareleriCikar(yol, klasor, sure, kareSayisi(sure, kalan));
        bloklar.push({
          type: "text",
          text: `${kaynak.etiket}: ${Number.isFinite(sure) ? `${Math.round(sure)} saniyelik ` : ""}video, eşit aralıklarla alınmış ${kareler.length} kare (sırayla):`,
        });
        for (const k of kareler) bloklar.push(gorselBlogu(k, "image/jpeg"));
        kare += kareler.length;
        videoVar = videoVar || kareler.length > 0;
        if (!ses) ses = await sesiCikar(yol, klasor);
        continue;
      }

      if (!mimeType.startsWith("image/")) {
        await response.body?.cancel().catch(() => undefined);
        continue;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      if (ffmpeg) {
        const yol = join(klasor, `analiz-gorsel-${i}`);
        await writeFile(yol, buffer);
        try {
          const kucuk = await gorseliKucult(yol, klasor);
          bloklar.push({ type: "text", text: kaynak.etiket });
          bloklar.push(gorselBlogu(kucuk, "image/jpeg"));
          kare++;
          continue;
        } catch {
          // ffmpeg bu görseli açamadıysa ham hâliyle denenir.
        }
      }
      if (MODELIN_OKUDUGU_GORSEL.has(mimeType) && buffer.length <= HAM_GORSEL_TAVANI) {
        bloklar.push({ type: "text", text: kaynak.etiket });
        bloklar.push(gorselBlogu(buffer, mimeType));
        kare++;
      }
    } catch {
      // Tek kaynağın bozukluğu (yarım video, okunamayan kare) diğerlerini
      // düşürmesin; çağıran hiç kare çıkmazsa metne düşer.
      continue;
    }
  }

  return { bloklar, kare, videoVar, ses };
}

function gorselBlogu(buffer: Buffer, mimeType: string): ContentBlockParam {
  return {
    type: "image",
    source: { type: "base64", media_type: mimeType as any, data: buffer.toString("base64") },
  } as ContentBlockParam;
}

/** Modele medyanın durumu: neye bakıyor, ses var mı. */
export function analizMedyaNotu(m: HazirMedya, sesDokumuVar: boolean): string {
  if (m.kare === 0) return "Medya okunamadı; yalnızca metne ve metriklere dayan.";
  if (!m.videoVar) return "Yukarıda gönderinin görsel(ler)i var.";
  if (sesDokumuVar) return "Yukarıda videonun kareleri, aşağıda konuşma dökümü var.";
  return "Yukarıda videonun kareleri var; ses yazıya dökülemedi ya da konuşma yok — yalnızca karelere dayan.";
}
