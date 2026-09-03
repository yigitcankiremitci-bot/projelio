import { randomUUID } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { SupabaseService } from "../../database/supabase.service";
import { FilesService } from "../files/files.service";
import { IG_API_VERSION, IG_GRAPH_HOST } from "./instagram-oauth.service";
import { extractMetaError } from "./publish-format";
import { SocialTokensService } from "./social-tokens.service";
import { fetchWithTimeout } from "../../common/http/fetch-with-timeout";

/**
 * Instagram'a yayın.
 *
 * Meta'nın akışı iki adımlı ve bizim tarafımızda bir adım daha var:
 *
 *   0. Medyayı PUBLIC bir adrese taşı   ← bize özel
 *   1. Konteyner oluştur   POST /<IG_ID>/media
 *   2. Yayımla             POST /<IG_ID>/media_publish
 *
 * Sıfırıncı adımın sebebi Meta'nın kuralı: "we cURL media used in publishing
 * attempts, so the media must be hosted on a publicly accessible server at the
 * time of the attempt". Bizim medyamız Drive/OneDrive'da ve oraya imzasız
 * erişim yok. Yayın anında dosya geçici public kovaya kopyalanır, yayın bitince
 * (başarılı ya da başarısız) silinir — kalıcı ikinci arşiv değil, taşıma bandı.
 *
 * Sıra önemli: konteyner oluşturulduktan sonra Meta medyayı kendi tarafına
 * çeker; bu yüzden kopyayı `media_publish` bitmeden silmiyoruz.
 */

/** Geçici public kova (bkz. 058_social_publishing.sql). */
const PUBLISH_BUCKET = "social-publish";

/** Instagram tek gönderide en fazla 10 medya kabul ediyor. */
const MAX_CAROUSEL_ITEMS = 10;

/** Metin sınırı; aşan gönderi Meta tarafında sessizce kırpılır. */
const MAX_CAPTION = 2200;

/**
 * Video konteyneri hazır olana kadar yoklama.
 *
 * Meta "dakikada bir, en fazla 5 dakika" öneriyor; biz 5 saniyede bir, en fazla
 * 2 dakika yokluyoruz — kullanıcı "Şimdi paylaş" dedikten sonra ekranda
 * bekliyor, dakikalık aralık orada çok uzun. Süre dolarsa hata değil "devam
 * ediyor" deriz: konteyner 24 saat yaşıyor, kuyruk bir sonraki turda aynı
 * konteynerle devam eder.
 */
const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 120_000;

export class PublishError extends Error {
  constructor(
    message: string,
    /**
     * Kalıcı hata tekrar denenmez (izin yok, jeton geçersiz, medya biçimi
     * uygunsuz). Geçici hata (ağ, Meta 5xx, kota) yeniden denenir — ayrım
     * olmasaydı ya kullanıcıyı bekletirdik ya da düzelebilecek bir hatayı
     * kalıcı sayardık.
     */
    public readonly permanent: boolean,
    /** Geçici hatalarda önerilen bekleme (ms). */
    public readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = "PublishError";
  }
}

interface StagedMedia {
  publicUrl: string;
  storagePath: string;
  mimeType: string;
  isVideo: boolean;
}

export interface PublishResult {
  externalPostId: string;
  externalUrl?: string;
}

@Injectable()
export class InstagramPublishService {
  private readonly logger = new Logger(InstagramPublishService.name);

  constructor(
    private supabase: SupabaseService,
    private tokens: SocialTokensService,
    private files: FilesService
  ) {}

  /**
   * Bir hedefi (gönderi × hesap) yayımlar.
   *
   * `actingUserId` dosyaların okunması için gerekli: dosya erişimi kullanıcı
   * yetkisine bağlı ve sistem adına arka kapı açmıyoruz. Zamanlanmış yayında
   * gönderiyi oluşturan kişi adına hareket edilir.
   */
  async publish(params: {
    accountId: string;
    externalAccountId: string;
    caption: string;
    mediaFileIds: string[];
    actingUserId: string;
    /** Yarım kalmış denemeden gelen konteyner — medya yeniden yüklenmesin. */
    existingContainerId?: string | null;
    /** Konteyner oluşturulduğunda haber verir; kuyruk bunu saklayıp tekrarı ucuzlatır. */
    onContainer?: (containerId: string) => Promise<void> | void;
  }): Promise<PublishResult> {
    const token = await this.tokens.read(params.accountId);
    if (!token) {
      throw new PublishError("Instagram bağlantısı yok ya da jeton okunamadı. Hesabı yeniden bağlayın.", true);
    }

    const caption = params.caption.slice(0, MAX_CAPTION);
    let containerId = params.existingContainerId ?? null;
    const staged: StagedMedia[] = [];

    try {
      if (!containerId) {
        if (params.mediaFileIds.length === 0) {
          // Instagram'da yalnızca metin içeren gönderi yok; bu kontrol olmasa
          // hata Meta'dan anlaşılmaz bir kodla dönerdi.
          throw new PublishError("Instagram gönderisi en az bir görsel ya da video ister.", true);
        }
        if (params.mediaFileIds.length > MAX_CAROUSEL_ITEMS) {
          throw new PublishError(`Instagram tek gönderide en fazla ${MAX_CAROUSEL_ITEMS} medya kabul ediyor.`, true);
        }

        await this.assertWithinRateLimit(params.externalAccountId, token.accessToken);

        for (const fileId of params.mediaFileIds) {
          staged.push(await this.stageMedia(fileId, params.actingUserId));
        }

        containerId =
          staged.length === 1
            ? await this.createContainer(params.externalAccountId, token.accessToken, staged[0], caption)
            : await this.createCarousel(params.externalAccountId, token.accessToken, staged, caption);

        await params.onContainer?.(containerId);
      }

      await this.waitUntilReady(containerId, token.accessToken);
      const mediaId = await this.publishContainer(params.externalAccountId, token.accessToken, containerId);
      const permalink = await this.fetchPermalink(mediaId, token.accessToken);

      return { externalPostId: mediaId, externalUrl: permalink };
    } finally {
      // Kopyalar her hâlükârda silinir: başarısız denemenin artığı public bir
      // kovada kalmamalı.
      await this.cleanup(staged.map((s) => s.storagePath));
    }
  }

  // ============================================================ Medya

  /**
   * Dosyayı geçici public kovaya kopyalar.
   *
   * Yol tahmin edilemez (uuid) çünkü kova public: adresi bilmeyen kimse
   * okuyamasın. Meta imzalı adres kullanamadığı için "public ama gizli adres"
   * elimizdeki en iyi denge.
   */
  private async stageMedia(fileId: string, actingUserId: string): Promise<StagedMedia> {
    const { response, fileName, mimeType } = await this.files.openDownload(fileId, actingUserId);
    const isVideo = mimeType.startsWith("video/");

    if (!isVideo && mimeType !== "image/jpeg") {
      // Meta'nın kuralı: "JPEG is the only image format supported". PNG'yi
      // burada çevirmiyoruz — dönüştürme için yeni bir yerel bağımlılık
      // (sharp) gerekir ve sessiz kalite kaybı olur. Kullanıcıya söylüyoruz.
      throw new PublishError(
        `Instagram yalnızca JPEG görsel kabul ediyor; "${fileName}" ${mimeType} biçiminde. Dosyayı JPEG olarak yükleyin.`,
        true
      );
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const extension = isVideo ? (mimeType.split("/")[1] || "mp4") : "jpg";
    const storagePath = `${randomUUID()}.${extension}`;

    const { error } = await this.supabase.client.storage
      .from(PUBLISH_BUCKET)
      .upload(storagePath, buffer, { contentType: mimeType, upsert: false });
    if (error) {
      throw new PublishError(`Medya yayına hazırlanamadı: ${error.message}`, false, 60_000);
    }

    const publicUrl = this.supabase.publicStorageUrl(PUBLISH_BUCKET, storagePath);
    return { publicUrl, storagePath, mimeType, isVideo };
  }

  private async cleanup(paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    const { error } = await this.supabase.client.storage.from(PUBLISH_BUCKET).remove(paths);
    // Temizlik başarısızlığı yayını geçersiz kılmaz; artığı gece işi toplar.
    if (error) this.logger.warn(`Geçici medya silinemedi: ${error.message}`);
  }

  /** 24 saatten eski artıkları toplar (yarıda kalan yayın denemeleri). */
  async sweepStagedMedia(): Promise<number> {
    const { data, error } = await this.supabase.client.storage.from(PUBLISH_BUCKET).list("", { limit: 1000 });
    if (error || !data) return 0;

    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const stale = data
      .filter((f) => new Date(f.created_at ?? f.updated_at ?? Date.now()).getTime() < cutoff)
      .map((f) => f.name);
    if (stale.length === 0) return 0;

    await this.supabase.client.storage.from(PUBLISH_BUCKET).remove(stale);
    return stale.length;
  }

  // ============================================================ Meta çağrıları

  private async createContainer(
    igId: string,
    accessToken: string,
    media: StagedMedia,
    caption: string
  ): Promise<string> {
    const body: Record<string, string> = { caption, access_token: accessToken };
    if (media.isVideo) {
      body.video_url = media.publicUrl;
      // REELS: Meta 2024'ten beri tekil videoları reel olarak yayımlıyor;
      // media_type=VIDEO artık yalnızca carousel öğesi için geçerli.
      body.media_type = "REELS";
    } else {
      body.image_url = media.publicUrl;
    }
    const json = await this.post<{ id: string }>(`${igId}/media`, body);
    return json.id;
  }

  private async createCarousel(
    igId: string,
    accessToken: string,
    items: StagedMedia[],
    caption: string
  ): Promise<string> {
    const children: string[] = [];
    for (const item of items) {
      const body: Record<string, string> = { is_carousel_item: "true", access_token: accessToken };
      if (item.isVideo) {
        body.video_url = item.publicUrl;
        body.media_type = "VIDEO";
      } else {
        body.image_url = item.publicUrl;
      }
      const child = await this.post<{ id: string }>(`${igId}/media`, body);
      children.push(child.id);
    }

    const json = await this.post<{ id: string }>(`${igId}/media`, {
      media_type: "CAROUSEL",
      children: children.join(","),
      caption,
      access_token: accessToken,
    });
    return json.id;
  }

  /**
   * Konteynerin yayına hazır olmasını bekler.
   *
   * Görsellerde konteyner genelde anında FINISHED olur; video/reels'te Meta
   * kodlama yapıyor ve bu dakikalar sürebiliyor.
   */
  private async waitUntilReady(containerId: string, accessToken: string): Promise<void> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
      const status = await this.get<{ status_code?: string; status?: string }>(containerId, {
        fields: "status_code,status",
        access_token: accessToken,
      });

      switch (status.status_code) {
        case "FINISHED":
        case "PUBLISHED":
          return;
        case "ERROR":
          throw new PublishError(
            `Instagram medyayı işleyemedi: ${status.status ?? "bilinmeyen hata"}`,
            true
          );
        case "EXPIRED":
          throw new PublishError("Yayın konteyneri 24 saat içinde yayımlanmadığı için düştü.", true);
        default:
          await delay(POLL_INTERVAL_MS);
      }
    }

    // Zaman aşımı kalıcı hata değil: konteyner hâlâ işleniyor olabilir, kuyruk
    // aynı konteynerle devam eder (bkz. social_post_targets.container_id).
    throw new PublishError("Video hâlâ işleniyor; yayın birazdan tekrar denenecek.", false, 60_000);
  }

  private async publishContainer(igId: string, accessToken: string, containerId: string): Promise<string> {
    const json = await this.post<{ id: string }>(`${igId}/media_publish`, {
      creation_id: containerId,
      access_token: accessToken,
    });
    return json.id;
  }

  private async fetchPermalink(mediaId: string, accessToken: string): Promise<string | undefined> {
    try {
      const json = await this.get<{ permalink?: string }>(mediaId, {
        fields: "permalink",
        access_token: accessToken,
      });
      return json.permalink;
    } catch {
      // Adres kozmetik: yayın başarılı sayılır, bağlantı bir sonraki senkronda
      // gelir.
      return undefined;
    }
  }

  /**
   * Günlük yayın kotası.
   *
   * Meta 24 saatlik pencerede 100 yayınla sınırlıyor ve "uygulamanız da bu
   * sınırı uygulasın, özellikle zamanlanmış yayın varsa" diyor. Kota dolduysa
   * kalıcı hata değil: pencere kayınca yayın kendiliğinden çıkar.
   */
  private async assertWithinRateLimit(igId: string, accessToken: string): Promise<void> {
    try {
      const json = await this.get<{ data?: { quota_usage?: number; config?: { quota_total?: number } }[] }>(
        `${igId}/content_publishing_limit`,
        { fields: "config,quota_usage", access_token: accessToken }
      );
      const row = json.data?.[0];
      const used = row?.quota_usage ?? 0;
      const total = row?.config?.quota_total ?? 100;
      if (used >= total) {
        throw new PublishError(
          `Instagram günlük yayın sınırına ulaşıldı (${used}/${total}). Yayın pencere açılınca denenecek.`,
          false,
          60 * 60 * 1000
        );
      }
    } catch (err) {
      // Kota sorgusu başarısızsa yayını engellemiyoruz: asıl sınırı zaten Meta
      // uygular, bizimki erken uyarı.
      if (err instanceof PublishError) throw err;
      this.logger.warn(`Yayın kotası okunamadı: ${(err as Error).message}`);
    }
  }

  // ============================================================ HTTP

  private async post<T>(path: string, body: Record<string, string>): Promise<T> {
    const res = await fetchWithTimeout(`${IG_GRAPH_HOST}/${IG_API_VERSION}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body),
    });
    return this.parse<T>(res, path);
  }

  private async get<T>(path: string, query: Record<string, string>): Promise<T> {
    const res = await fetchWithTimeout(`${IG_GRAPH_HOST}/${IG_API_VERSION}/${path}?${new URLSearchParams(query)}`);
    return this.parse<T>(res, path);
  }

  private async parse<T>(res: Response, path: string): Promise<T> {
    if (res.ok) return (await res.json()) as T;

    const raw = await res.text();
    const message = extractMetaError(raw);
    this.logger.error(`Instagram ${path} başarısız (${res.status}): ${raw}`);

    // 4xx kullanıcı/uygulama hatası (izin, biçim, jeton) — tekrar denemek
    // aynı sonucu verir. 429 ve 5xx geçicidir.
    const permanent = res.status >= 400 && res.status < 500 && res.status !== 429;
    throw new PublishError(message, permanent, permanent ? undefined : 60_000);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
