import { Injectable, Logger } from "@nestjs/common";
import { SupabaseService } from "../../database/supabase.service";
import { fetchWithTimeout } from "../../common/http/fetch-with-timeout";
import { IG_API_VERSION, IG_GRAPH_HOST, IG_INSIGHTS_SCOPE, instagramInsightsAcik } from "./instagram-oauth.service";
import { SocialTokensService } from "./social-tokens.service";
import {
  insightsYanitiniOku,
  medyaSayfasiniOku,
  metaHataTuru,
  metrikListeleri,
  type IgMedya,
  type OkunanMetrikler,
} from "./icerik-analizi";
import { extractMetaError } from "./publish-format";

/**
 * İlk senkronda (ve her senkronda) okunacak en fazla gönderi.
 *
 * 150: haftada 3-4 paylaşan bir hesabın yaklaşık bir yılı. Daha eskisi hem
 * bugünkü algoritmada hem kitlede başka bir dönem; kıyasa katmak normali
 * bulandırır. Sayfa başına 50, yani en fazla 3 istek.
 */
const MAX_MEDYA = 150;
const SAYFA_BOYU = 50;

/**
 * Bir senkron turunda en fazla kaç gönderinin metriği istenir.
 *
 * Her gönderi ayrı bir Insights isteği. Instagram Login yolunda hesap başına
 * saatlik bir çağrı bütçesi var; ilk senkronda 150 gönderiyi birden sormak
 * bütçeyi bitirip aynı saatteki yayınları da düşürebilirdi. Kalanlar sonraki
 * turlarda tamamlanır (en eski senkronlanan önce).
 */
const MAX_INSIGHTS_CAGRISI = 60;

/**
 * Metrikler ne sıklıkla tazelenir: son 30 gündeki gönderiler her turda,
 * daha eskiler haftada bir. Eski bir gönderinin sayısı nadiren değişir.
 */
const TAZE_GUN = 30;
const ESKI_TAZELEME_GUN = 7;

/** Elle "şimdi güncelle" en fazla bu sıklıkta: çağrı bütçesi yayınla ortak. */
export const ELLE_SENKRON_ARALIGI_DK = 10;

export const YENIDEN_BAGLAN_MESAJI =
  "Metrikleri okumak için Instagram bağlantısının yenilenmesi gerekiyor (yeni izin: içerik istatistikleri)."; // dil:anahtar

/** Bayrak kapalıyken: yeniden bağlanmak işe yaramaz, kullanıcıya bunu söylemeyelim. */
export const INSIGHTS_KAPALI_MESAJI =
  "İzlenme ve erişim verileri bu kurulumda henüz açılmadı; şimdilik beğeni ve yorum sayıları gösteriliyor."; // dil:anahtar

const MEDYA_ALANLARI =
  "id,caption,media_type,media_product_type,timestamp,permalink,thumbnail_url,media_url,like_count,comments_count";

export interface SenkronSonucu {
  medya: number;
  metrik: number;
  hata?: string;
}

/**
 * Bağlı Instagram hesabının kendi gönderilerini ve metriklerini çeker.
 *
 * Yalnızca KULLANICININ KENDİ, bağladığı hesabı okunur — başka hesapların
 * verisi bu yoldan gelmez (bkz. 145_icerik_analizi.sql "neden ilham elle").
 *
 * İki katman ayrı:
 *   1. Gönderi listesi (`instagram_business_basic` yeter): açıklama, tür,
 *      tarih, beğeni, yorum. Insights izni olmayan eski bağlantılarda da çalışır.
 *   2. Metrikler (`instagram_business_manage_insights`): izlenme, erişim,
 *      kaydetme, paylaşım, izlenme süresi. İzin yoksa hesap "yeniden bağlan"
 *      işaretlenir, liste yine görünür.
 */
@Injectable()
export class InstagramInsightsService {
  private readonly logger = new Logger(InstagramInsightsService.name);
  /** Aynı hesap için iki senkron üst üste binmesin (gece işi + elle düğme). */
  private calisan = new Set<string>();

  constructor(
    private supabase: SupabaseService,
    private tokens: SocialTokensService
  ) {}

  /**
   * Hesabın senkronu. Hata fırlatmaz: sonucu hesap satırına (`insights_error`)
   * yazar ve döner — gece işi tek bir kopuk hesap yüzünden diğerlerini atlamasın.
   */
  async senkronEt(accountId: string): Promise<SenkronSonucu> {
    if (this.calisan.has(accountId)) return { medya: 0, metrik: 0 };
    this.calisan.add(accountId);
    try {
      return await this.senkronIc(accountId);
    } catch (err) {
      const mesaj = (err as Error).message;
      this.logger.warn(`İçerik senkronu düştü (${accountId}): ${mesaj}`);
      await this.hesabiGuncelle(accountId, { insights_error: "Instagram verileri okunamadı, daha sonra tekrar denenecek." }); // dil:anahtar
      return { medya: 0, metrik: 0, hata: mesaj };
    } finally {
      this.calisan.delete(accountId);
    }
  }

  /** Gece işi: bağlı bütün Instagram hesapları, sırayla. */
  async hepsiniSenkronEt(): Promise<{ hesap: number; hata: number }> {
    const { data, error } = await this.supabase.client
      .from("social_accounts")
      .select("id")
      .eq("provider", "instagram_login")
      .eq("connection_status", "connected")
      .is("archived_at", null);
    if (error) throw error;
    let hata = 0;
    for (const row of data ?? []) {
      const sonuc = await this.senkronEt(row.id);
      if (sonuc.hata) hata++;
    }
    return { hesap: (data ?? []).length, hata };
  }

  /**
   * Gönderinin modele gösterilecek medyası — taze adreslerle.
   *
   * CDN adresleri birkaç gün içinde geçersizleştiği için saklanmıyor; analiz
   * anında Meta'ya yeniden sorulur. Karuselde çocuklar (en fazla 5) ayrı ayrı.
   * Telifli müzikli reels'te `media_url` hiç gelmeyebilir: o zaman kapak.
   */
  async medyaAdresleri(
    accountId: string,
    externalMediaId: string
  ): Promise<{ tur: "video" | "gorsel"; url: string; sira: number }[]> {
    const token = await this.tokens.read(accountId);
    if (!token) return [];
    const ana = await this.getJson(
      `${externalMediaId}?${new URLSearchParams({ fields: "media_type,media_url,thumbnail_url", access_token: token.accessToken })}`
    );
    if (!ana.ok) return [];
    const m = ana.json as { media_type?: string; media_url?: string; thumbnail_url?: string };

    if (m.media_type === "CAROUSEL_ALBUM") {
      const cocuk = await this.getJson(
        `${externalMediaId}/children?${new URLSearchParams({ fields: "media_type,media_url,thumbnail_url", access_token: token.accessToken })}`
      );
      const liste = cocuk.ok && Array.isArray((cocuk.json as any)?.data) ? ((cocuk.json as any).data as any[]) : [];
      return liste
        .slice(0, 5)
        .map((c, i) =>
          c.media_type === "VIDEO"
            ? c.media_url
              ? { tur: "video" as const, url: c.media_url as string, sira: i + 1 }
              : c.thumbnail_url
                ? { tur: "gorsel" as const, url: c.thumbnail_url as string, sira: i + 1 }
                : null
            : c.media_url
              ? { tur: "gorsel" as const, url: c.media_url as string, sira: i + 1 }
              : null
        )
        .filter((x): x is { tur: "video" | "gorsel"; url: string; sira: number } => x !== null);
    }
    if (m.media_type === "VIDEO") {
      if (m.media_url) return [{ tur: "video", url: m.media_url, sira: 1 }];
      return m.thumbnail_url ? [{ tur: "gorsel", url: m.thumbnail_url, sira: 1 }] : [];
    }
    return m.media_url ? [{ tur: "gorsel", url: m.media_url, sira: 1 }] : [];
  }

  // ============================================================ İç akış

  private async senkronIc(accountId: string): Promise<SenkronSonucu> {
    const token = await this.tokens.read(accountId);
    if (!token) {
      await this.hesabiGuncelle(accountId, { insights_error: "Instagram bağlantısı bulunamadı." }); // dil:anahtar
      return { medya: 0, metrik: 0, hata: "jeton yok" };
    }

    // 1) Gönderi listesi
    const liste = await this.medyalariListele(token.accessToken);
    if ("hata" in liste) {
      const tur = metaHataTuru(liste.hata);
      await this.hesabiGuncelle(accountId, {
        insights_error:
          tur === "jeton"
            ? "Instagram bağlantısının süresi dolmuş; hesabı yeniden bağlayın." // dil:anahtar
            : extractMetaError(liste.hata),
      });
      return { medya: 0, metrik: 0, hata: liste.hata };
    }
    await this.medyalariYaz(accountId, liste.medya);

    // 2) Metrikler — izin yoksa hiç denenmez. Bayrak kapalıysa izin
    // istenmemiştir; bilinmeyen (null) izin listesinde de denemek boşuna.
    const izin = token.scopes?.length ? token.scopes.includes(IG_INSIGHTS_SCOPE) : null;
    if (!instagramInsightsAcik() || izin === false) {
      await this.hesabiGuncelle(accountId, {
        insights_synced_at: new Date().toISOString(),
        insights_error: instagramInsightsAcik() ? YENIDEN_BAGLAN_MESAJI : INSIGHTS_KAPALI_MESAJI,
      });
      return { medya: liste.medya.length, metrik: 0 };
    }

    const sirada = await this.metrikSirasi(accountId);
    let metrik = 0;
    let hesapHatasi: string | null = null;
    for (const satir of sirada) {
      const sonuc = await this.metrikleriOku(token.accessToken, satir.external_media_id, satir.media_product_type);
      if ("metrikler" in sonuc) {
        metrik++;
        await this.medyaSatiriniGuncelle(satir.id, {
          reach: sonuc.metrikler.reach ?? null,
          views: sonuc.metrikler.views ?? null,
          saved: sonuc.metrikler.saved ?? null,
          shares: sonuc.metrikler.shares ?? null,
          total_interactions: sonuc.metrikler.totalInteractions ?? null,
          avg_watch_time_ms: sonuc.metrikler.avgWatchTimeMs ?? null,
          total_watch_time_ms: sonuc.metrikler.totalWatchTimeMs ?? null,
          metrics_synced_at: new Date().toISOString(),
          metrics_error: null,
        });
        continue;
      }
      const tur = metaHataTuru(sonuc.hata);
      // Hesap düzeyindeki hata (izin yok, jeton geçersiz) bütün gönderilerde
      // aynı cevabı verir: kalanları denemek çağrı bütçesini boşuna yakar.
      if (tur === "izin") {
        hesapHatasi = YENIDEN_BAGLAN_MESAJI;
        break;
      }
      if (tur === "jeton") {
        hesapHatasi = "Instagram bağlantısının süresi dolmuş; hesabı yeniden bağlayın."; // dil:anahtar
        break;
      }
      // Tek gönderiye özgü (ör. hesap profesyonele geçmeden atılmış): not
      // düşülür, senkron sürer. Zaman da yazılır ki bir sonraki turda sıranın
      // başını işgal etmesin.
      await this.medyaSatiriniGuncelle(satir.id, {
        metrics_error: extractMetaError(sonuc.hata).slice(0, 300),
        metrics_synced_at: new Date().toISOString(),
      });
    }

    await this.hesabiGuncelle(accountId, {
      insights_synced_at: new Date().toISOString(),
      insights_error: hesapHatasi,
    });
    return { medya: liste.medya.length, metrik };
  }

  private async medyalariListele(accessToken: string): Promise<{ medya: IgMedya[] } | { hata: string }> {
    const medya: IgMedya[] = [];
    let yol: string | null =
      `me/media?${new URLSearchParams({ fields: MEDYA_ALANLARI, limit: String(SAYFA_BOYU), access_token: accessToken })}`;
    while (yol && medya.length < MAX_MEDYA) {
      const yanit = await this.getJson(yol);
      if (!yanit.ok) return { hata: yanit.govde };
      const sayfa = medyaSayfasiniOku(yanit.json);
      medya.push(...sayfa.medya);
      // Meta'nın "next" adresi tam adres; aynı sürüm ve jetonla gelir.
      yol = sayfa.sonraki;
    }
    return { medya: medya.slice(0, MAX_MEDYA) };
  }

  /**
   * Listeyi yazar. Yalnızca LİSTEDEN gelen alanlar gönderilir: upsert, metrik
   * ve Lio analizi sütunlarına dokunmaz (PostgREST yalnızca verilen sütunları
   * günceller).
   */
  private async medyalariYaz(accountId: string, medya: IgMedya[]): Promise<void> {
    if (medya.length === 0) return;

    // Projelio'dan yayımlanmış olanlar içeriğine bağlanır: Analiz sekmesinden
    // "bu videonun taslağı" açılabilsin.
    const { data: hedefler } = await this.supabase.client
      .from("social_post_targets")
      .select("post_id, external_post_id")
      .eq("account_id", accountId)
      .in(
        "external_post_id",
        medya.map((m) => m.id)
      );
    const icerik = new Map((hedefler ?? []).map((h: any) => [h.external_post_id as string, h.post_id as string]));

    const simdi = new Date().toISOString();
    const satirlar = medya.map((m) => ({
      account_id: accountId,
      external_media_id: m.id,
      ...(icerik.has(m.id) ? { post_id: icerik.get(m.id) } : {}),
      media_type: m.mediaType ?? null,
      media_product_type: m.mediaProductType ?? null,
      caption: m.caption ?? null,
      permalink: m.permalink ?? null,
      thumbnail_url: m.thumbnailUrl ?? null,
      posted_at: m.timestamp ?? null,
      like_count: m.likeCount ?? null,
      comments_count: m.commentsCount ?? null,
      updated_at: simdi,
    }));
    // post_id bazı satırlarda var bazılarında yok; PostgREST toplu upsert'te
    // bütün satırların aynı sütunları taşımasını istiyor. İki gruba ayrılır.
    const bagli = satirlar.filter((s) => "post_id" in s);
    const bagsiz = satirlar.filter((s) => !("post_id" in s));
    for (const grup of [bagli, bagsiz]) {
      if (grup.length === 0) continue;
      const { error } = await this.supabase.client
        .from("social_account_media")
        .upsert(grup, { onConflict: "account_id,external_media_id" });
      if (error) throw error;
    }
  }

  /** Metriği istenecek gönderiler: taze olanlar + bir haftadır bakılmamış eskiler. */
  private async metrikSirasi(
    accountId: string
  ): Promise<{ id: string; external_media_id: string; media_product_type: string | null }[]> {
    const tazeSinir = new Date(Date.now() - TAZE_GUN * 86_400_000).toISOString();
    const eskiSinir = new Date(Date.now() - ESKI_TAZELEME_GUN * 86_400_000).toISOString();
    const { data, error } = await this.supabase.client
      .from("social_account_media")
      .select("id, external_media_id, media_product_type, posted_at, metrics_synced_at")
      .eq("account_id", accountId)
      .or(`metrics_synced_at.is.null,posted_at.gte."${tazeSinir}",metrics_synced_at.lt."${eskiSinir}"`)
      // Hiç bakılmamış olanlar önce, sonra en eski bakılan: ilk senkronda
      // kalanlar bir sonraki turda sıranın başına gelir.
      .order("metrics_synced_at", { ascending: true, nullsFirst: true })
      .limit(MAX_INSIGHTS_CAGRISI);
    if (error) throw error;
    return (data ?? []) as any[];
  }

  /** Tek gönderinin metrikleri — desteklenmeyen metrikte daha temel listeye düşerek. */
  private async metrikleriOku(
    accessToken: string,
    mediaId: string,
    mediaProductType: string | null
  ): Promise<{ metrikler: OkunanMetrikler } | { hata: string }> {
    let sonHata = "";
    for (const liste of metrikListeleri(mediaProductType)) {
      const yanit = await this.getJson(
        `${mediaId}/insights?${new URLSearchParams({ metric: liste.join(","), access_token: accessToken })}`
      );
      if (yanit.ok) return { metrikler: insightsYanitiniOku(yanit.json) };
      sonHata = yanit.govde;
      // İzin/jeton hatası listeyi değiştirmekle düzelmez.
      if (metaHataTuru(yanit.govde) !== "diger") break;
    }
    return { hata: sonHata };
  }

  /**
   * Graph'a GET. `yol` ya göreli ("me/media?...") ya da Meta'nın verdiği tam
   * sayfalama adresi. Jeton adreste olduğu için adres LOG'A YAZILMAZ.
   */
  private async getJson(yol: string): Promise<{ ok: boolean; json?: unknown; govde: string }> {
    const adres = yol.startsWith("https://") ? yol : `${IG_GRAPH_HOST}/${IG_API_VERSION}/${yol}`;
    if (!adres.startsWith(`${IG_GRAPH_HOST}/`)) return { ok: false, govde: "" };
    const res = await fetchWithTimeout(adres);
    if (!res.ok) return { ok: false, govde: await res.text() };
    return { ok: true, json: await res.json(), govde: "" };
  }

  private async hesabiGuncelle(accountId: string, patch: Record<string, unknown>): Promise<void> {
    const { error } = await this.supabase.client.from("social_accounts").update(patch).eq("id", accountId);
    if (error) this.logger.warn(`Hesap senkron durumu yazılamadı (${accountId}): ${error.message}`);
  }

  private async medyaSatiriniGuncelle(id: string, patch: Record<string, unknown>): Promise<void> {
    const { error } = await this.supabase.client
      .from("social_account_media")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  }
}
