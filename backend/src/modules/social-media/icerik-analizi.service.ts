import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type {
  SocialAccountMediaItem,
  SocialAnalyticsAccount,
  SocialAnalyticsOverview,
  SocialDiscovery,
  SocialIdeaReport,
  SocialInspiration,
  SocialInspirationAnalysis,
  SocialInspirationInput,
  SocialMediaAnalysis,
} from "@projelio/shared";
import { hesapMedyanlari, normalizeSocialHandle, performanslar } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { requireSafeUrl } from "../../common/safe-url";
import { fetchWithTimeout } from "../../common/http/fetch-with-timeout";
import { AiCreditsService } from "../ai-assistant/ai-credits.service";
import { estimateTranscriptionCredits } from "../ai-assistant/ai-credits.config";
import { AiTranscriptionService, MAX_AUDIO_BYTES } from "../ai-assistant/ai-transcription.service";
import type { LlmResponse } from "../ai-assistant/providers/llm-provider";
import { LlmProviderRegistry, type ProviderChoice } from "../ai-assistant/providers/provider-registry";
import { FilesService } from "../files/files.service";
import { analizMedyaNotu, analizMedyasiniHazirla, type AnalizKaynagi, type HazirMedya } from "./analiz-medyasi";
import {
  AnalizOkunamadi,
  fikirRaporuIstemi,
  fikirRaporuSistemi,
  fikirRaporunuCoz,
  gonderiAnaliziIstemi,
  gonderiAnaliziniCoz,
  gonderiAnaliziSistemi,
  ilhamAnaliziIstemi,
  ilhamAnaliziniCoz,
  ilhamAnaliziSistemi,
} from "./icerik-analizi";
import { IG_INSIGHTS_SCOPE, instagramInsightsAcik, InstagramOAuthService } from "./instagram-oauth.service";
import { ELLE_SENKRON_ARALIGI_DK, InstagramInsightsService } from "./instagram-insights.service";
import { SocialMediaService, type SocialScope } from "./social-media.service";
import { SocialTokensService } from "./social-tokens.service";
import { calismaKlasoru, ffmpegVarMi, temizle, VideoIslenemedi } from "./video-kareleri";

/**
 * Analiz sekmesinde gösterilen en fazla gönderi (bütün bağlı hesaplar). Senkron
 * hesap başına 150 ile sınırlı; bu tavan çok hesaplı şirketler için.
 */
const MEDYA_TAVANI = 450;
const ILHAM_TAVANI = 200;
const RAPOR_SAYISI = 5;

/** Görsel analiz (kareler + JSON) için başlamadan önceki bakiye kontrolü. */
const GORSEL_ANALIZ_TAHMINI = 80;
/** Metin raporu: birkaç bin token girdi + ~2 bin çıktı. */
const RAPOR_TAHMINI = 40;

const ANALIZ_YANIT_TOKEN = 1500;
const RAPOR_YANIT_TOKEN = 3500;

/** Instagram CDN'inden indirilen medya için üst sınır: büyük reels ~100 MB. */
const CDN_ZAMAN_ASIMI_MS = 120_000;

const KIND = new Set(["account", "post"]);

type Kaynak = { kind: "medya"; satir: any; hesap: any } | { kind: "ilham"; satir: any };

/**
 * İçerik analizi: kendi gönderilerinin metrikleri + ilham panosu + Lio.
 *
 * Yetki kurgusu modülün geri kalanıyla aynı (SocialMediaService'in kapıları):
 * görmek için okuma, bakiye harcayan her şey (Lio analizi, rapor) ve ilham
 * eklemek için yazma yetkisi. Bakiye, gönderi önerisindeki gibi isteği yapan
 * kişiden kesilir.
 */
@Injectable()
export class IcerikAnaliziService {
  private readonly logger = new Logger(IcerikAnaliziService.name);

  constructor(
    private supabase: SupabaseService,
    private social: SocialMediaService,
    private insights: InstagramInsightsService,
    private oauth: InstagramOAuthService,
    private tokens: SocialTokensService,
    private files: FilesService,
    private credits: AiCreditsService,
    private providers: LlmProviderRegistry,
    private transcription: AiTranscriptionService
  ) {}

  // ============================================================ Okuma

  async overview(scope: SocialScope, userId: string): Promise<SocialAnalyticsOverview> {
    await this.social.assertReadable(scope, userId);

    const hesapSatirlari = await this.bagliHesaplar(scope);
    const ids = hesapSatirlari.map((h) => h.id);
    const [izinler, medya, ilhamlar, raporlar, kesifler] = await Promise.all([
      this.tokens.izinVarMi(ids, IG_INSIGHTS_SCOPE),
      this.medyaListesi(ids),
      this.ilhamListesi(scope),
      this.raporListesi(scope),
      this.kesifListesi(scope),
    ]);

    const hesaplar: SocialAnalyticsAccount[] = hesapSatirlari.map((h) => ({
      accountId: h.id,
      handle: h.handle,
      displayName: h.display_name ?? undefined,
      avatarUrl: h.avatar_url ?? undefined,
      followerCount: h.follower_count ?? undefined,
      connectionStatus: h.connection_status,
      insightsSyncedAt: h.insights_synced_at ?? undefined,
      insightsError: h.insights_error ?? undefined,
      // Bayrak kapalıyken izin zaten istenmiyor: yeniden bağlamak bir şey değiştirmez.
      yenidenBaglanmali: instagramInsightsAcik() && izinler.get(h.id) === false,
    }));

    return {
      ayarli: this.oauth.isConfigured(),
      hesaplar,
      medya,
      ilhamlar,
      raporlar,
      kesifler,
      kesifAcik: this.providers.webSearchChoice("smart") !== null,
    };
  }

  /** "Şimdi güncelle". Kısa aralıkla tekrarlanırsa Meta'ya gitmeden mevcut durumu döner. */
  async senkronla(accountId: string, userId: string): Promise<{ medya: number; metrik: number; atlandi?: true }> {
    const hesap = await this.hesap(accountId);
    await this.social.assertReadable(this.social.scopeOfRow(hesap), userId);
    if (hesap.provider !== "instagram_login") {
      throw new BadRequestException("Bu hesap Instagram'a bağlı değil.");
    }
    const son = utcOku(hesap.insights_synced_at);
    if (Number.isFinite(son) && Date.now() - son < ELLE_SENKRON_ARALIGI_DK * 60_000) {
      return { medya: 0, metrik: 0, atlandi: true };
    }
    const sonuc = await this.insights.senkronEt(accountId);
    return { medya: sonuc.medya, metrik: sonuc.metrik };
  }

  // ============================================================ İlham panosu

  async ilhamEkle(scope: SocialScope, input: SocialInspirationInput, userId: string): Promise<SocialInspiration> {
    await this.social.assertWritable(scope, userId);
    const alanlar = ilhamAlanlari(input, true);
    const { data, error } = await this.supabase.client
      .from("social_inspirations")
      .insert({ ...kapsamSutunlari(scope), ...alanlar, created_by: userId })
      .select(ILHAM_SELECT)
      .single();
    if (error) throw error;
    return ilhamaCevir(data);
  }

  async ilhamGuncelle(id: string, input: SocialInspirationInput, userId: string): Promise<SocialInspiration> {
    const satir = await this.ilham(id);
    await this.social.assertWritable(this.social.scopeOfRow(satir), userId);
    const alanlar = ilhamAlanlari(input, false);
    // Referans dosyası değiştiyse eski analiz artık o dosyayı anlatmıyor.
    if ("file_id" in alanlar && alanlar.file_id !== satir.file_id) {
      Object.assign(alanlar, { lio_analiz: null, lio_analiz_at: null });
    }
    const { data, error } = await this.supabase.client
      .from("social_inspirations")
      .update({ ...alanlar, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(ILHAM_SELECT)
      .single();
    if (error) throw error;
    return ilhamaCevir(data);
  }

  /**
   * İlham kaydı SİLİNİR (arşivlenmez): bir not ve bağlantıdan ibaret, geçmiş
   * gönderiler gibi başka kayıtların ona dayandığı bir şey yok. Yüklenen
   * referans dosyası dosyalar bölümünde kalır — kullanıcının dosyası.
   */
  async ilhamSil(id: string, userId: string): Promise<{ ok: true }> {
    const satir = await this.ilham(id);
    await this.social.assertWritable(this.social.scopeOfRow(satir), userId);
    const { error } = await this.supabase.client.from("social_inspirations").delete().eq("id", id);
    if (error) throw error;
    return { ok: true };
  }

  // ============================================================ Lio

  /** "Bu gönderi neden böyle gitti?" — kendi gönderin, kareler + metrikler. */
  async gonderiyiAnalizEt(mediaId: string, userId: string, dil: "tr" | "en"): Promise<SocialAccountMediaItem> {
    const { data: satir, error } = await this.supabase.client
      .from("social_account_media")
      .select("*")
      .eq("id", mediaId)
      .maybeSingle<any>();
    if (error) throw error;
    if (!satir) throw new NotFoundException("Gönderi bulunamadı");
    const hesap = await this.hesap(satir.account_id);
    await this.social.assertWritable(this.social.scopeOfRow(hesap), userId);

    const sonuc = await this.lioIleAnalizEt({ kind: "medya", satir, hesap }, userId, dil, gonderiAnaliziniCoz);
    const analiz: SocialMediaAnalysis = { ...sonuc.okunan, kredi: sonuc.kredi };

    const { data: guncel, error: yazmaHatasi } = await this.supabase.client
      .from("social_account_media")
      .update({ lio_analiz: analiz, lio_analiz_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", mediaId)
      .select("*")
      .single();
    if (yazmaHatasi) throw yazmaHatasi;
    return medyayaCevir(guncel);
  }

  /** İlham kaynağının analizi: neden işliyor, senin hesabına nasıl uyar. */
  async ilhamiAnalizEt(id: string, userId: string, dil: "tr" | "en"): Promise<SocialInspiration> {
    const satir = await this.ilham(id);
    await this.social.assertWritable(this.social.scopeOfRow(satir), userId);
    if (!satir.file_id && !satir.note?.trim()) {
      throw new BadRequestException("Lio'nun inceleyebilmesi için bir not yaz ya da referans videosu/görseli ekle.");
    }

    const sonuc = await this.lioIleAnalizEt({ kind: "ilham", satir }, userId, dil, ilhamAnaliziniCoz);
    const analiz: SocialInspirationAnalysis = { ...sonuc.okunan, kredi: sonuc.kredi };

    const { data, error } = await this.supabase.client
      .from("social_inspirations")
      .update({ lio_analiz: analiz, lio_analiz_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(ILHAM_SELECT)
      .single();
    if (error) throw error;
    return ilhamaCevir(data);
  }

  /** Veriden kalıplar + yeni içerik fikirleri. Metin modeliyle, görsel yok. */
  async fikirUret(
    scope: SocialScope,
    userId: string,
    secenek: { accountId?: string; istek?: string; dil: "tr" | "en" }
  ): Promise<SocialIdeaReport> {
    await this.social.assertWritable(scope, userId);

    let hesaplar = await this.bagliHesaplar(scope);
    if (secenek.accountId) hesaplar = hesaplar.filter((h) => h.id === secenek.accountId);
    const [medya, ilhamlar] = await Promise.all([
      this.medyaListesi(hesaplar.map((h) => h.id)),
      this.ilhamListesi(scope),
    ]);
    if (medya.length === 0 && ilhamlar.length === 0) {
      throw new BadRequestException(
        "Fikir üretmek için önce Instagram hesabını bağlayıp verileri çek ya da ilham panosuna birkaç kaynak ekle."
      );
    }

    const bakiye = await this.credits.assertCanStart(userId);
    this.credits.assertBalanceCovers(bakiye, RAPOR_TAHMINI);

    const istek = secenek.istek?.trim().slice(0, 500) || null;
    const { response, choice } = await this.providers.send("smart", (secim) => ({
      model: secim.model,
      max_tokens: RAPOR_YANIT_TOKEN,
      system: fikirRaporuSistemi(secenek.dil),
      messages: [
        {
          role: "user",
          content: fikirRaporuIstemi({
            dil: secenek.dil,
            hesaplar: hesaplar.map((h) => ({
              accountId: h.id,
              handle: h.handle,
              tonNotu: h.tone_note,
              kitleNotu: h.audience_note,
              takipci: h.follower_count,
            })),
            medya,
            ilhamlar,
            istek,
            simdi: new Date(),
          }),
        },
      ],
    }));
    const kredi = await this.kullanimiKes(userId, choice, response);
    const icerik = this.coz(() => fikirRaporunuCoz(metniAl(response)), choice, kredi);

    const { data, error } = await this.supabase.client
      .from("social_idea_reports")
      .insert({
        ...kapsamSutunlari(scope),
        account_id: secenek.accountId ?? null,
        istek,
        icerik,
        kredi,
        created_by: userId,
      })
      .select("*")
      .single();
    if (error) throw error;
    return raporaCevir(data);
  }

  // ============================================================ Lio ortak akış

  /**
   * Görsel analiz (gönderi ya da ilham): medyayı hazırla, sesi çöz, modele
   * sor, bedeli kes, yanıtı `oku` ile okuyup döndür.
   *
   * Medya hiç okunamazsa (ffmpeg yok, adres geçersiz, dosya silinmiş) analiz
   * DURMAZ, metne ve metriklere dayanarak metin modeliyle sürer — kullanıcıya
   * "olmadı" demekten iyidir; model bunu `medyaNotu`'ndan biliyor.
   */
  private async lioIleAnalizEt<T>(
    kaynak: Kaynak,
    userId: string,
    dil: "tr" | "en",
    oku: (metin: string) => T
  ): Promise<{ okunan: T; kredi: number }> {
    const bakiye = await this.credits.assertCanStart(userId);
    this.credits.assertBalanceCovers(bakiye, GORSEL_ANALIZ_TAHMINI);

    const gorsel = this.providers.visionChoice("smart");
    const ffmpeg = await ffmpegVarMi();
    const klasor = await calismaKlasoru();
    try {
      let medya: HazirMedya = { bloklar: [], kare: 0, videoVar: false, ses: null };
      if (gorsel) {
        const kaynaklar = await this.analizKaynaklari(kaynak, userId);
        if (kaynaklar.length) medya = await analizMedyasiniHazirla(kaynaklar, klasor, ffmpeg);
      }

      const { metin: sesDokumu, kredi: sesKredisi } = await this.sesiCoz(medya.ses, bakiye, userId);
      const medyaNotu = analizMedyaNotu(medya, !!sesDokumu);
      const sistem = kaynak.kind === "medya" ? gonderiAnaliziSistemi(dil) : ilhamAnaliziSistemi(dil);
      const istem =
        kaynak.kind === "medya"
          ? await this.gonderiIstemi(kaynak, dil, sesDokumu, medyaNotu)
          : await this.ilhamIstemi(kaynak.satir, dil, sesDokumu, medyaNotu);

      let response: LlmResponse;
      let choice: ProviderChoice;
      if (gorsel && medya.kare > 0) {
        choice = gorsel;
        response = await gorsel.provider.send({
          model: gorsel.model,
          max_tokens: ANALIZ_YANIT_TOKEN,
          system: sistem,
          messages: [{ role: "user", content: [...medya.bloklar, { type: "text", text: istem }] }],
        });
      } else {
        ({ response, choice } = await this.providers.send("smart", (secim) => ({
          model: secim.model,
          max_tokens: ANALIZ_YANIT_TOKEN,
          system: sistem,
          messages: [{ role: "user", content: istem }],
        })));
      }

      const kredi = (await this.kullanimiKes(userId, choice, response)) + sesKredisi;
      return { okunan: this.coz(() => oku(metniAl(response)), choice, kredi), kredi };
    } catch (err) {
      if (err instanceof VideoIslenemedi) throw new BadRequestException(err.message);
      throw err;
    } finally {
      await temizle(klasor);
    }
  }

  private async analizKaynaklari(kaynak: Kaynak, userId: string): Promise<AnalizKaynagi[]> {
    if (kaynak.kind === "ilham") {
      const fileId = kaynak.satir.file_id as string | null;
      if (!fileId) return [];
      return [
        {
          etiket: "Referans içerik",
          ac: async () => {
            const { response, mimeType } = await this.files.openDownload(fileId, userId);
            return { response, mimeType };
          },
        },
      ];
    }

    const adresler = await this.insights.medyaAdresleri(kaynak.hesap.id, kaynak.satir.external_media_id);
    const coklu = adresler.length > 1;
    return adresler.map((a) => ({
      etiket: coklu ? `Karusel ${a.sira}. öğe` : a.tur === "video" ? "Video" : "Görsel",
      ac: async () => {
        const res = await fetchWithTimeout(a.url, {}, CDN_ZAMAN_ASIMI_MS);
        if (!res.ok) throw new Error(`CDN ${res.status}`);
        const tip = res.headers.get("content-type")?.split(";")[0]?.trim();
        return { response: res, mimeType: tip || (a.tur === "video" ? "video/mp4" : "image/jpeg") };
      },
    }));
  }

  private async gonderiIstemi(
    kaynak: Extract<Kaynak, { kind: "medya" }>,
    dil: "tr" | "en",
    sesDokumu: string | null,
    medyaNotu: string
  ): Promise<string> {
    // Kıyas için hesabın bütün gönderileri: normal (medyan) onlardan.
    const tumu = await this.medyaListesi([kaynak.hesap.id]);
    const simdi = new Date();
    const gonderi = medyayaCevir(kaynak.satir);
    return gonderiAnaliziIstemi({
      dil,
      handle: kaynak.hesap.handle,
      tonNotu: kaynak.hesap.tone_note,
      kitleNotu: kaynak.hesap.audience_note,
      gonderi,
      kat: performanslar(tumu, simdi).get(gonderi.id)?.kat ?? null,
      hesapMedyani: hesapMedyanlari(tumu, simdi).get(kaynak.hesap.id) ?? null,
      sesDokumu,
      medyaNotu,
    });
  }

  private async ilhamIstemi(satir: any, dil: "tr" | "en", sesDokumu: string | null, medyaNotu: string): Promise<string> {
    const hesaplar = await this.bagliHesaplar(this.social.scopeOfRow(satir));
    const ilham = ilhamaCevir(satir);
    return ilhamAnaliziIstemi({
      dil,
      ilham,
      hesaplar: hesaplar.map((h) => ({ handle: h.handle, tonNotu: h.tone_note, kitleNotu: h.audience_note })),
      sesDokumu,
      medyaNotu: satir.file_id ? medyaNotu : "Referans dosyası yok; yalnızca kullanıcının notuna dayan.",
    });
  }

  /**
   * Videonun sesini yazıya döker (gönderi önerisindeki kuralın aynısı): ses
   * kendi tahminini ayrıca karşılamalı, karşılamıyorsa analiz sessiz sürer.
   */
  private async sesiCoz(ses: Buffer | null, bakiye: number, userId: string): Promise<{ metin: string | null; kredi: number }> {
    if (!ses || !this.transcription.configured || ses.length > MAX_AUDIO_BYTES) return { metin: null, kredi: 0 };
    if (bakiye - GORSEL_ANALIZ_TAHMINI < estimateTranscriptionCredits(ses.length)) return { metin: null, kredi: 0 };
    try {
      const sonuc = await this.transcription.transcribe(ses, "video-sesi.mp3", "audio/mpeg");
      const { credits } = await this.credits.chargeTranscription({
        userId,
        durationSeconds: sonuc.durationSeconds,
        fileName: "sosyal medya analizi",
      });
      return { metin: sonuc.text, kredi: credits };
    } catch (err) {
      this.logger.warn(`Analiz videosunun sesi çözümlenemedi: ${(err as Error).message}`);
      return { metin: null, kredi: 0 };
    }
  }

  /** Sağlayıcı isteği işledi: yanıt okunamasa da kullanım kesilir (fatura okumadaki kural). */
  private async kullanimiKes(userId: string, choice: ProviderChoice, response: LlmResponse): Promise<number> {
    const { credits } = await this.credits.chargeUsage({
      userId,
      model: choice.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheWriteTokens: response.usage.cache_creation_input_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens,
    });
    return credits;
  }

  private coz<T>(oku: () => T, choice: ProviderChoice, kredi: number): T {
    try {
      return oku();
    } catch (err) {
      if (err instanceof AnalizOkunamadi) {
        this.logger.warn(`Lio analizi okunamadı (model=${choice.model}, kredi=${kredi})`);
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  // ============================================================ Veri

  /** Kapsamdaki bağlı Instagram hesapları (ham satır) — keşif servisi de kullanıyor. */
  async bagliHesaplar(scope: SocialScope): Promise<any[]> {
    const sorgu = this.supabase.client
      .from("social_accounts")
      .select(
        "id, handle, display_name, avatar_url, follower_count, connection_status, insights_synced_at, insights_error, tone_note, audience_note, organization_id, job_id, department_id"
      )
      .eq("platform", "instagram")
      .eq("provider", "instagram_login")
      .is("archived_at", null);
    const { data, error } = await ("jobId" in scope
      ? sorgu.eq("job_id", scope.jobId)
      : sorgu.eq("organization_id", scope.organizationId)
    ).order("created_at", { ascending: true });
    if (error) throw tabloHatasi(error);
    return data ?? [];
  }

  async medyaListesi(accountIds: string[]): Promise<SocialAccountMediaItem[]> {
    if (accountIds.length === 0) return [];
    const { data, error } = await this.supabase.client
      .from("social_account_media")
      .select("*")
      .in("account_id", accountIds)
      .order("posted_at", { ascending: false, nullsFirst: false })
      .limit(MEDYA_TAVANI);
    if (error) throw tabloHatasi(error);
    return (data ?? []).map(medyayaCevir);
  }

  async ilhamListesi(scope: SocialScope): Promise<SocialInspiration[]> {
    const sorgu = this.supabase.client.from("social_inspirations").select(ILHAM_SELECT);
    const { data, error } = await ("jobId" in scope
      ? sorgu.eq("job_id", scope.jobId)
      : sorgu.eq("organization_id", scope.organizationId)
    )
      .order("created_at", { ascending: false })
      .limit(ILHAM_TAVANI);
    if (error) throw tabloHatasi(error);
    return (data ?? []).map(ilhamaCevir);
  }

  private async raporListesi(scope: SocialScope): Promise<SocialIdeaReport[]> {
    const sorgu = this.supabase.client.from("social_idea_reports").select("*, users!created_by(full_name)");
    const { data, error } = await ("jobId" in scope
      ? sorgu.eq("job_id", scope.jobId)
      : sorgu.eq("organization_id", scope.organizationId)
    )
      .order("created_at", { ascending: false })
      .limit(RAPOR_SAYISI);
    if (error) throw tabloHatasi(error);
    return (data ?? []).map(raporaCevir);
  }

  /**
   * Son keşifler. Migration 146 uygulanmadan tablo yok: sekme düşmesin diye
   * boş liste döner (keşif düğmesi o durumda anlaşılır bir hata verir).
   */
  private async kesifListesi(scope: SocialScope): Promise<SocialDiscovery[]> {
    const sorgu = this.supabase.client.from("social_discoveries").select("*, users!created_by(full_name)");
    const { data, error } = await ("jobId" in scope
      ? sorgu.eq("job_id", scope.jobId)
      : sorgu.eq("organization_id", scope.organizationId)
    )
      .order("created_at", { ascending: false })
      .limit(RAPOR_SAYISI);
    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205") return [];
      throw error;
    }
    return (data ?? []).map(kesfeCevir);
  }

  private async hesap(accountId: string): Promise<any> {
    const { data, error } = await this.supabase.client
      .from("social_accounts")
      .select("*")
      .eq("id", accountId)
      .is("archived_at", null)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Hesap bulunamadı");
    return data;
  }

  private async ilham(id: string): Promise<any> {
    const { data, error } = await this.supabase.client
      .from("social_inspirations")
      .select(ILHAM_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (error) throw tabloHatasi(error);
    if (!data) throw new NotFoundException("İlham kaydı bulunamadı");
    return data;
  }
}

// ============================================================ Eşlemeler

const ILHAM_SELECT = "*, files(name, mime_type)";

/** Veritabanı zamanı (UTC, ofsetsiz) — istemci parseServerDate ile okur. */
const zaman = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
const sayi = (v: unknown): number | undefined => (typeof v === "number" ? v : typeof v === "string" && v !== "" ? Number(v) : undefined);

function medyayaCevir(r: any): SocialAccountMediaItem {
  return {
    id: r.id,
    accountId: r.account_id,
    externalMediaId: r.external_media_id,
    postId: r.post_id ?? undefined,
    mediaType: r.media_type ?? undefined,
    mediaProductType: r.media_product_type ?? undefined,
    caption: r.caption ?? undefined,
    permalink: r.permalink ?? undefined,
    thumbnailUrl: r.thumbnail_url ?? undefined,
    postedAt: zaman(r.posted_at),
    likeCount: sayi(r.like_count),
    commentsCount: sayi(r.comments_count),
    reach: sayi(r.reach),
    views: sayi(r.views),
    saved: sayi(r.saved),
    shares: sayi(r.shares),
    totalInteractions: sayi(r.total_interactions),
    avgWatchTimeMs: sayi(r.avg_watch_time_ms),
    totalWatchTimeMs: sayi(r.total_watch_time_ms),
    metricsSyncedAt: zaman(r.metrics_synced_at),
    metricsError: r.metrics_error ?? undefined,
    lioAnaliz: r.lio_analiz ?? undefined,
    lioAnalizAt: zaman(r.lio_analiz_at),
  };
}

function ilhamaCevir(r: any): SocialInspiration {
  return {
    id: r.id,
    kind: r.kind,
    platform: r.platform,
    url: r.url ?? undefined,
    handle: r.handle ?? undefined,
    title: r.title,
    note: r.note ?? undefined,
    tags: r.tags ?? undefined,
    fileId: r.file_id ?? undefined,
    fileName: r.files?.name ?? undefined,
    fileMimeType: r.files?.mime_type ?? undefined,
    lioAnaliz: r.lio_analiz ?? undefined,
    lioAnalizAt: zaman(r.lio_analiz_at),
    createdBy: r.created_by ?? undefined,
    createdAt: r.created_at,
    updatedAt: zaman(r.updated_at),
  };
}

function raporaCevir(r: any): SocialIdeaReport {
  const icerik = r.icerik ?? {};
  return {
    id: r.id,
    accountId: r.account_id ?? undefined,
    istek: r.istek ?? undefined,
    kredi: r.kredi ?? 0,
    createdAt: r.created_at,
    createdByName: r.users?.full_name ?? undefined,
    ozet: icerik.ozet ?? "",
    kaliplar: Array.isArray(icerik.kaliplar) ? icerik.kaliplar : [],
    fikirler: Array.isArray(icerik.fikirler) ? icerik.fikirler : [],
  };
}

export function kesfeCevir(r: any): SocialDiscovery {
  const icerik = r.icerik ?? {};
  return {
    id: r.id,
    accountId: r.account_id ?? undefined,
    istek: r.istek ?? undefined,
    nis: icerik.nis ?? "",
    hashtagler: Array.isArray(icerik.hashtagler) ? icerik.hashtagler : [],
    aramalar: Array.isArray(icerik.aramalar) ? icerik.aramalar : [],
    adaylar: Array.isArray(icerik.adaylar) ? icerik.adaylar : [],
    aramaSayisi: r.arama_sayisi ?? 0,
    kredi: r.kredi ?? 0,
    createdAt: r.created_at,
    createdByName: r.users?.full_name ?? undefined,
  };
}

export function kapsamSutunlari(scope: SocialScope): Record<string, unknown> {
  return "jobId" in scope
    ? { job_id: scope.jobId, organization_id: null, department_id: null }
    : { organization_id: scope.organizationId, job_id: null, department_id: scope.departmentId ?? null };
}

/**
 * Formdan gelen alanları sütunlara çevirir. `zorunlu` yeni kayıtta: başlık
 * yoksa bağlantıdan ya da kullanıcı adından türetilir, o da yoksa ret.
 */
function ilhamAlanlari(input: SocialInspirationInput, zorunlu: boolean): Record<string, unknown> {
  const alanlar: Record<string, unknown> = {};
  if (input.kind !== undefined) {
    if (!KIND.has(input.kind)) throw new BadRequestException("Geçersiz ilham türü");
    alanlar.kind = input.kind;
  }
  if (input.platform !== undefined) alanlar.platform = (input.platform || "instagram").slice(0, 40);
  if (input.url !== undefined) {
    const url = input.url?.trim();
    alanlar.url = url ? requireSafeUrl(url, "Bağlantı") : null;
  }
  if (input.handle !== undefined) alanlar.handle = normalizeSocialHandle(input.handle) || null;
  if (input.note !== undefined) alanlar.note = input.note?.trim().slice(0, 4000) || null;
  if (input.tags !== undefined) alanlar.tags = input.tags?.trim().slice(0, 300) || null;
  if (input.fileId !== undefined) alanlar.file_id = input.fileId || null;
  if (input.title !== undefined) alanlar.title = input.title?.trim().slice(0, 200) || null;

  if (zorunlu && !alanlar.title) {
    alanlar.title = alanlar.handle ? `@${alanlar.handle}` : (alanlar.url as string | undefined)?.slice(0, 200) || null;
  }
  if ((zorunlu || "title" in alanlar) && !alanlar.title) {
    throw new BadRequestException("İlham kaynağına bir başlık, bağlantı ya da kullanıcı adı ver.");
  }
  return alanlar;
}

/**
 * Migration 145 uygulanmadan önce tablolar yok: kullanıcıya PostgREST'in ham
 * hatası yerine ne olduğunu söyleyen bir cümle.
 */
function tabloHatasi(error: { code?: string; message?: string }): Error {
  if (error.code === "42P01" || error.code === "PGRST205" || error.code === "42703") {
    return new BadRequestException("İçerik analizi bu sunucuda henüz etkin değil (veritabanı güncellemesi bekleniyor).");
  }
  return error as Error;
}

/** Ofsetsiz veritabanı zamanını UTC olarak okur (bkz. migration 127). */
function utcOku(v: unknown): number {
  if (typeof v !== "string" || !v) return NaN;
  return Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(v) ? v : `${v}Z`);
}

function metniAl(response: LlmResponse): string {
  return ((response.content ?? []) as any[])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n");
}
