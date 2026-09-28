import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type Anthropic from "@anthropic-ai/sdk";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import type { SocialCaptionSuggestion } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { AiCreditsService } from "../ai-assistant/ai-credits.service";
import { estimateTranscriptionCredits } from "../ai-assistant/ai-credits.config";
import { AiTranscriptionService, MAX_AUDIO_BYTES } from "../ai-assistant/ai-transcription.service";
import { LlmProviderRegistry } from "../ai-assistant/providers/provider-registry";
import { FilesService } from "../files/files.service";
import {
  kareSayisi,
  MAX_KARE,
  oneriCevabiniCoz,
  oneriIstemi,
  OneriOkunamadi,
  oneriSistemi,
  type OneriBaglami,
} from "./lio-oneri";
import { mediaFileIds } from "./publish-format";
import { isMissingRelation, SocialMediaService } from "./social-media.service";
import {
  calismaKlasoru,
  diskeYaz,
  ffmpegVarMi,
  gorseliKucult,
  kareleriCikar,
  sesiCikar,
  temizle,
  VideoIslenemedi,
  videoSuresi,
} from "./video-kareleri";

// SDK bu tipi dışa açmıyor (faturalar/lio-yardimi.service.ts'teki aynı satır).
type ContentBlockParam = Extract<Anthropic.MessageParam["content"], any[]>[number];

/**
 * Bir öneri için ayrılan bakiye tavanı (yalnızca BAŞLAMADAN önceki kontrol;
 * gerçek bedel kullanımdan sonra kesiliyor). 12 kare + kısa JSON en pahalı
 * görsel modelde bile bunun altında kalıyor.
 */
const ONERI_KREDI_TAHMINI = 80;

/** Yanıt tek bir JSON: açıklama + etiketler. */
const MAX_YANIT_TOKEN = 1500;

/** ffmpeg yokken görsel olduğu gibi gönderilir; Anthropic'in 5 MB sınırının altında kalmalı. */
const HAM_GORSEL_TAVANI = 4 * 1024 * 1024;
const MODELIN_OKUDUGU_GORSEL = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/**
 * "Lio'ya yazdır": gönderinin medyasına bakıp açıklama ve etiket önerir.
 *
 * Video için: ffmpeg eşit aralıklarla kare alır, ses varsa ve çözümleme
 * tanımlıysa konuşma yazıya dökülür; ikisi birlikte görsel okuyabilen modele
 * gider. Öneri YAZILMAZ, döner — kullanıcı forma alıp alamayacağına kendisi
 * karar veriyor. Aksi hâlde yayına hazır bir metnin üstüne sessizce yazılırdı.
 *
 * Bedel iki kalemdir ve ikisi de gerçekleştiği kadar kesilir: modelin kullanımı
 * ve (varsa) ses çözümlemesi. Model yanıtı okunamasa da kullanım kesilir —
 * sağlayıcı isteği işledi (fatura okumadaki kuralın aynısı).
 */
@Injectable()
export class LioOneriService {
  private readonly logger = new Logger(LioOneriService.name);

  constructor(
    private supabase: SupabaseService,
    private social: SocialMediaService,
    private files: FilesService,
    private credits: AiCreditsService,
    private providers: LlmProviderRegistry,
    private transcription: AiTranscriptionService
  ) {}

  async oner(
    postId: string,
    userId: string,
    secenek: { istek?: string; dil: "tr" | "en" }
  ): Promise<SocialCaptionSuggestion> {
    const post = await this.gonderiyiYukle(postId);
    // Öneri yalnızca içeriği düzenleyebilen kişiye: bakiye harcıyor ve
    // sonuç o kişinin forma yazacağı metin.
    await this.social.assertWritable(this.social.scopeOfRow(post), userId);

    const dosyalar = mediaFileIds(post).slice(0, 10);
    if (dosyalar.length === 0) {
      throw new BadRequestException("Lio'nun bakabilmesi için önce bir görsel ya da video ekle.");
    }

    const choice = this.providers.visionChoice("smart");
    if (!choice) throw new BadRequestException("Sunucuda görsel okuyabilen bir AI sağlayıcısı tanımlı değil.");

    const bakiye = await this.credits.assertCanStart(userId);
    this.credits.assertBalanceCovers(bakiye, ONERI_KREDI_TAHMINI);

    const ffmpeg = await ffmpegVarMi();
    const klasor = await calismaKlasoru();
    try {
      const { bloklar, videoKaresi, gorselSayisi, ses } = await this.medyayiHazirla(dosyalar, userId, klasor, ffmpeg);

      let sesDokumu: string | null = null;
      let sesKredisi = 0;
      if (ses && this.transcription.configured && ses.length <= MAX_AUDIO_BYTES) {
        // Ses kısmı kendi tahminini ayrıca karşılamalı; karşılamıyorsa öneri
        // sessiz sürer — kareler yine de çoğu zaman yeterli.
        const kalan = bakiye - ONERI_KREDI_TAHMINI;
        if (kalan >= estimateTranscriptionCredits(ses.length)) {
          try {
            const sonuc = await this.transcription.transcribe(ses, "video-sesi.mp3", "audio/mpeg");
            sesDokumu = sonuc.text;
            const { credits } = await this.credits.chargeTranscription({
              userId,
              durationSeconds: sonuc.durationSeconds,
              fileName: "sosyal medya videosu",
            });
            sesKredisi = credits;
          } catch (err) {
            // Sessiz/çok kısa kayıt çözümlemede hata veriyor; öneriyi durdurmaz.
            this.logger.warn(`Video sesi çözümlenemedi: ${(err as Error).message}`);
          }
        }
      }

      const hesaplar = await this.hesaplariOku(post);
      const baglam: OneriBaglami = {
        dil: secenek.dil,
        baslik: post.title,
        icerikTuru: post.content_type ?? "image",
        kampanya: post.campaign,
        mevcutMetin: post.caption,
        mevcutEtiketler: post.hashtags,
        istek: secenek.istek,
        hesaplar,
        sesDokumu,
        medyaNotu: medyaNotu(videoKaresi > 0, sesDokumu ? "dokum" : ses ? "cozulemedi" : "yok"),
      };

      const response = await choice.provider.send({
        model: choice.model,
        max_tokens: MAX_YANIT_TOKEN,
        system: oneriSistemi(secenek.dil),
        messages: [{ role: "user", content: [...bloklar, { type: "text", text: oneriIstemi(baglam) }] }],
      });

      const { credits } = await this.credits.chargeUsage({
        userId,
        model: choice.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheWriteTokens: response.usage.cache_creation_input_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens,
      });

      const metin = response.content
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("\n");

      try {
        const oneri = oneriCevabiniCoz(metin);
        return {
          ...oneri,
          kareSayisi: videoKaresi + gorselSayisi,
          sesVar: !!sesDokumu,
          kredi: credits + sesKredisi,
        };
      } catch (err) {
        if (err instanceof OneriOkunamadi) {
          this.logger.warn(`Lio önerisi okunamadı (model=${choice.model}, kredi=${credits}): ${metin.slice(0, 300)}`);
          throw new BadRequestException(err.message);
        }
        throw err;
      }
    } catch (err) {
      // Mesaj olduğu gibi geçer: sözlükte anahtar olarak duruyor (bkz. // dil:anahtar).
      if (err instanceof VideoIslenemedi) throw new BadRequestException(err.message);
      throw err;
    } finally {
      await temizle(klasor);
    }
  }

  /**
   * Gönderinin medyasını modelin okuyacağı görsel bloklarına çevirir.
   *
   * Kare bütçesi bütün medya için ortak (MAX_KARE): 10 görsellik bir karusel
   * ile 3 dakikalık bir video aynı tavana tabi. Ses yalnızca İLK videodan
   * alınıyor — karuselde birden çok videonun konuşması nadir ve her biri ayrı
   * bir çözümleme bedeli demek.
   */
  private async medyayiHazirla(
    dosyalar: string[],
    userId: string,
    klasor: string,
    ffmpeg: boolean
  ): Promise<{ bloklar: ContentBlockParam[]; videoKaresi: number; gorselSayisi: number; ses: Buffer | null }> {
    const bloklar: ContentBlockParam[] = [];
    let videoKaresi = 0;
    let gorselSayisi = 0;
    let ses: Buffer | null = null;

    // Her medyanın kareleri önüne kısa bir etiket konuyor: model hangi karenin
    // hangi videodan geldiğini bilmezse karuselin iki videosunu tek sahne sanıyor.
    const kareSayisiToplam = () => videoKaresi + gorselSayisi;
    for (let i = 0; i < dosyalar.length && kareSayisiToplam() < MAX_KARE; i++) {
      const { response, mimeType } = await this.files.openDownload(dosyalar[i], userId);
      const kalan = MAX_KARE - kareSayisiToplam();

      if (mimeType.startsWith("video/")) {
        if (!ffmpeg) {
          throw new BadRequestException(
            "Bu sunucuda video işleme (ffmpeg) kurulu değil; Lio videoyu izleyemiyor. Görsel içeriklerde öneri çalışır."
          );
        }
        const yol = join(klasor, `video-${i}`);
        await diskeYaz(response, yol);
        const sure = await videoSuresi(yol);
        // Birden çok medya varsa her videonun payı küçülür; tek videoda tamamı.
        const pay = Math.min(kalan, dosyalar.length === 1 ? 10 : Math.max(2, Math.floor(MAX_KARE / dosyalar.length)));
        const kareler = await kareleriCikar(yol, klasor, sure, kareSayisi(sure, pay));
        bloklar.push({
          type: "text",
          text: `Medya ${i + 1}: ${Number.isFinite(sure) ? `${Math.round(sure)} saniyelik ` : ""}video, eşit aralıklarla alınmış ${kareler.length} kare (sırayla):`,
        });
        for (const kare of kareler) bloklar.push(gorselBlogu(kare, "image/jpeg"));
        videoKaresi += kareler.length;
        if (!ses) ses = await sesiCikar(yol, klasor);
        continue;
      }

      if (!mimeType.startsWith("image/")) {
        // Belge vb. yayına da gitmez; sessizce atlanır.
        await response.body?.cancel().catch(() => undefined);
        continue;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      if (ffmpeg) {
        const yol = join(klasor, `gorsel-${i}`);
        await writeFile(yol, buffer);
        try {
          const kucuk = await gorseliKucult(yol, klasor);
          bloklar.push({ type: "text", text: `Medya ${i + 1}: görsel` });
          bloklar.push(gorselBlogu(kucuk, "image/jpeg"));
          gorselSayisi++;
          continue;
        } catch {
          // ffmpeg bu görseli açamadıysa ham hâliyle denenir.
        }
      }
      if (MODELIN_OKUDUGU_GORSEL.has(mimeType) && buffer.length <= HAM_GORSEL_TAVANI) {
        bloklar.push({ type: "text", text: `Medya ${i + 1}: görsel` });
        bloklar.push(gorselBlogu(buffer, mimeType));
        gorselSayisi++;
      }
    }

    if (kareSayisiToplam() === 0) {
      throw new BadRequestException("Lio bu gönderinin medyasını okuyamadı. JPEG/PNG görsel ya da video ekleyin.");
    }
    return { bloklar, videoKaresi, gorselSayisi, ses };
  }

  /** Gönderinin gideceği hesaplar ve ton/kitle notları — öneri o sese uysun. */
  private async hesaplariOku(post: any): Promise<OneriBaglami["hesaplar"]> {
    const ids = (post.social_post_targets ?? []).map((t: any) => t.account_id).filter(Boolean);
    if (ids.length === 0) return [];
    const { data } = await this.supabase.client
      .from("social_accounts")
      .select("platform, handle, tone_note, audience_note")
      .in("id", ids);
    return (data ?? []).map((h: any) => ({
      platform: h.platform,
      handle: h.handle,
      tonNotu: h.tone_note,
      kitleNotu: h.audience_note,
    }));
  }

  private async gonderiyiYukle(postId: string): Promise<any> {
    const { data, error } = await this.supabase.client
      .from("social_posts")
      .select("*, social_post_targets(account_id), social_post_media(*)")
      .eq("id", postId)
      .maybeSingle<any>();
    if (error && !isMissingRelation(error)) throw error;
    if (!data) throw new NotFoundException("Gönderi bulunamadı");
    return data;
  }
}

function gorselBlogu(buffer: Buffer, mimeType: string): ContentBlockParam {
  return {
    type: "image",
    source: { type: "base64", media_type: mimeType as any, data: buffer.toString("base64") },
  } as ContentBlockParam;
}

/** Modele sesin durumu: döküm yoksa neden yok. Karelerin kaynağı zaten her medyanın etiketinde. */
function medyaNotu(videoVar: boolean, ses: "dokum" | "cozulemedi" | "yok"): string {
  if (!videoVar) return "Gönderi yalnızca görsellerden oluşuyor.";
  if (ses === "dokum") return "Videonun konuşma dökümü aşağıda.";
  if (ses === "cozulemedi") return "Videonun sesi yazıya dökülemedi; yalnızca karelere dayan.";
  return "Videoda ses izi yok; yalnızca karelere dayan.";
}
