import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type {
  SocialCompetitor,
  SocialCompetitorOverview,
  SocialFbConnection,
  SocialHashtagTrack,
  SocialMetaUsage,
} from "@projelio/shared";
import { normalizeSocialHandle } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { fetchWithTimeout } from "../../common/http/fetch-with-timeout";
import { getWebAppUrl } from "../../common/config/env";
import { socialTokenCrypto } from "./instagram-oauth.service";
import { metaHataTuru } from "./icerik-analizi";
import {
  discoveryAlani,
  discoveryHatasi,
  discoveryOku,
  FB_API_VERSION,
  FB_GRAPH_HOST,
  FB_SCOPES,
  hashtagButcesi,
  HashtagGecersiz,
  hashtagiTemizle,
  hashtagMedyaAlanlari,
  HASHTAG_HAFTALIK_SINIR,
  kullanimOku,
  medyaListesiOku,
} from "./rakip-takibi";
import { SocialMediaService, type SocialScope } from "./social-media.service";

/** Rakip takibine alınabilecek en fazla hesap (kapsam başına) — çağrı bütçesi. */
const MAX_RAKIP = 40;
/** Elle "şimdi güncelle" en sık bu aralıkta. */
const ELLE_ARALIK_DK = 10;
/** Gece işi, bundan yakın zamanda güncellenmiş rakibi/etiketi atlar. */
const GECE_ATLAMA_SAAT = 20;
const TAKIPCI_GECMISI_GUN = 120;
const HASHTAG_GOSTERILEN = 18;
/**
 * Meta veri çağrılarının zaman aşımı. Varsayılan 20 sn hashtag uçlarına
 * yetmedi (top_media canlıda 20 sn'yi aştı, 2026-10-06); Business Discovery de
 * 30 gönderiyle ağır.
 */
const META_ZAMAN_ASIMI_MS = 60_000;

interface FbState {
  typ: "facebook_oauth";
  userId: string;
  organizationId?: string;
  departmentId?: string;
  jobId?: string;
  next?: string;
}

/**
 * Rakip ve hashtag takibi — "Facebook Login" yolu (bkz. 148_rakip_ve_hashtag_takibi.sql).
 *
 * ŞİMDİLİK YALNIZCA İZİNLİ KULLANICILARA AÇIK: `RAKIP_TAKIP_EPOSTALARI`
 * (virgülle ayrılmış e-postalar). Meta uygulaması geliştirme modunda ve bu
 * izinler App Review'dan geçmedi; başka bir kullanıcı bağlanmaya kalksa Meta
 * ekranında hata görürdü. Liste boşsa özellik HERKESE kapalı.
 *
 * Jeton: uzun ömürlü kullanıcı jetonundan türetilen SAYFA jetonu saklanır —
 * süresi dolmuyor; kullanıcı Sayfa yöneticiliğini bırakırsa ya da izni geri
 * alırsa geçersizleşir (hata panelde görünür, "yeniden bağlan").
 */
@Injectable()
export class RakipTakibiService {
  private readonly logger = new Logger(RakipTakibiService.name);
  private calisan = new Set<string>();

  constructor(
    private supabase: SupabaseService,
    private social: SocialMediaService,
    private jwt: JwtService
  ) {}

  // ============================================================ Ayar ve erişim

  private get appId() {
    return process.env.FACEBOOK_APP_ID?.trim();
  }
  private get appSecret() {
    return process.env.FACEBOOK_APP_SECRET?.trim();
  }
  private get configId() {
    return process.env.FACEBOOK_LOGIN_CONFIG_ID?.trim();
  }
  get redirectUri(): string {
    return (
      process.env.FACEBOOK_REDIRECT_URI?.trim() ||
      `${process.env.BACKEND_URL?.trim() || "http://localhost:3000"}/social/facebook/callback`
    );
  }

  ayarli(): boolean {
    return Boolean(this.appId && this.appSecret && socialTokenCrypto.isConfigured());
  }

  /** Bu kullanıcıya açık mı — Analiz sekmesi "Rakipler"i göstermek için de soruyor. */
  async izinli(userId: string): Promise<boolean> {
    const liste = (process.env.RAKIP_TAKIP_EPOSTALARI ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (liste.length === 0) return false;
    const { data } = await this.supabase.client.from("users").select("email").eq("id", userId).maybeSingle<any>();
    return !!data?.email && liste.includes(String(data.email).toLowerCase());
  }

  private async assertIzinli(userId: string): Promise<void> {
    if (!this.ayarli()) throw new BadRequestException("Rakip takibi bu sunucuda yapılandırılmamış.");
    if (!(await this.izinli(userId))) throw new ForbiddenException("Rakip takibi şimdilik yalnızca izinli hesaplara açık.");
  }

  // ============================================================ Bağlantı (OAuth)

  async connectUrl(scope: SocialScope, userId: string, next?: string): Promise<{ url: string }> {
    await this.social.assertWritable(scope, userId);
    await this.assertIzinli(userId);
    const state = this.jwt.sign(
      {
        typ: "facebook_oauth",
        userId,
        organizationId: "organizationId" in scope ? scope.organizationId : undefined,
        departmentId: "organizationId" in scope ? scope.departmentId : undefined,
        jobId: "jobId" in scope ? scope.jobId : undefined,
        next,
      } satisfies FbState,
      { expiresIn: "10m" }
    );
    const q = new URLSearchParams({
      client_id: this.appId!,
      redirect_uri: this.redirectUri,
      state,
      response_type: "code",
      // Facebook Login for Business: izinler panelde tanımlı yapılandırmadan
      // gelir (config_id); yoksa klasik scope listesi.
      ...(this.configId ? { config_id: this.configId } : { scope: FB_SCOPES.join(",") }),
    });
    return { url: `https://www.facebook.com/${FB_API_VERSION}/dialog/oauth?${q.toString()}` };
  }

  stateCoz(state: string): FbState {
    try {
      const d = this.jwt.verify<FbState>(state);
      if (d?.typ !== "facebook_oauth") throw new Error();
      return d;
    } catch {
      throw new UnauthorizedException("Facebook bağlantı isteği geçersiz veya süresi dolmuş.");
    }
  }

  webAppUrl(): string {
    return getWebAppUrl();
  }

  /**
   * Meta'dan dönüş: kod → kısa jeton → uzun ömürlü jeton → Sayfalar →
   * Sayfaya bağlı Instagram hesabı. Kapsamda zaten bağlı (Instagram Login)
   * bir hesapla aynı kullanıcı adındaki seçilir; yoksa ilki.
   */
  async baglantiyiTamamla(state: string, code: string): Promise<{ next?: string; igUsername?: string }> {
    const s = this.stateCoz(state);
    const scope: SocialScope = s.jobId
      ? { jobId: s.jobId }
      : { organizationId: s.organizationId!, departmentId: s.departmentId };
    await this.social.assertWritable(scope, s.userId);
    await this.assertIzinli(s.userId);

    const kisa = await this.graph<{ access_token: string }>(
      `oauth/access_token?${new URLSearchParams({
        client_id: this.appId!,
        client_secret: this.appSecret!,
        redirect_uri: this.redirectUri,
        code,
      })}`
    );
    const uzun = await this.graph<{ access_token: string }>(
      `oauth/access_token?${new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: this.appId!,
        client_secret: this.appSecret!,
        fb_exchange_token: kisa.access_token,
      })}`
    );
    const sayfalar = await this.graph<{ data?: any[] }>(
      `me/accounts?${new URLSearchParams({
        fields: "id,name,access_token,instagram_business_account{id,username}",
        limit: "100",
        access_token: uzun.access_token,
      })}`
    );
    let tumSayfalar = sayfalar.data ?? [];
    const izinler = await this.graph<{ data?: { permission: string; status: string }[] }>(
      `me/permissions?${new URLSearchParams({ access_token: uzun.access_token })}`
    ).catch(() => ({ data: [] as { permission: string; status: string }[] }));
    const verilen = (izinler.data ?? []).filter((p) => p.status === "granted").map((p) => p.permission);

    // İşletme portföyüne ait Sayfalar `me/accounts`'ta görünmüyor (kullanıcının
    // Sayfada doğrudan rolü yok, portföy üzerinden erişiyor) — 2026-10-06'da
    // tam olarak bu oldu: Sayfa seçildiği hâlde 0 Sayfa geldi. Portföyün kendi
    // ve müşteri Sayfaları ayrıca sorulur (business_management izni gerekir).
    if (tumSayfalar.length === 0) {
      const alan = "id,name,access_token,instagram_business_account{id,username}";
      const isletmeler = await this.graph<{ data?: any[] }>(
        `me/businesses?${new URLSearchParams({
          fields: `id,name,owned_pages.limit(100){${alan}},client_pages.limit(100){${alan}}`,
          access_token: uzun.access_token,
        })}`
      ).catch((err) => {
        this.logger.warn(`İşletme portföyü okunamadı: ${(err as Error).message}`);
        return { data: [] as any[] };
      });
      tumSayfalar = (isletmeler.data ?? []).flatMap((b: any) => [
        ...(b.owned_pages?.data ?? []),
        ...(b.client_pages?.data ?? []),
      ]);
    }
    const adaylar = tumSayfalar.filter((p) => p?.instagram_business_account?.id && p.access_token);
    // İki ayrı durum, iki ayrı çözüm — tek mesaj kullanıcıyı yanlış yere
    // gönderiyordu (2026-10-06):
    //   · hiç Sayfa gelmedi → izin ekranında Sayfa seçilmedi
    //   · Sayfa geldi ama Instagram'sız → hesap Sayfaya Sayfa ayarlarından
    //     bağlı değil (yalnızca Hesap Merkezi bağlantısı API'ye görünmüyor)
    this.logger.log(
      `Facebook bağlantısı: izinler [${verilen.join(",")}], ${tumSayfalar.length} Sayfa, ${adaylar.length} tanesinde Instagram hesabı (${tumSayfalar
        .map((p) => `${p.name ?? p.id}${p.instagram_business_account?.id ? "+ig" : ""}`)
        .join(", ")})`
    );
    if (tumSayfalar.length === 0) {
      throw new BadRequestException(
        "Facebook hiçbir Sayfaya erişim vermedi. Tekrar bağlan ve izin ekranında Instagram'a bağlı Sayfanı seç (\"Tüm Sayfalar\" ya da Sayfanın kutusu)."
      );
    }
    if (adaylar.length === 0) {
      throw new BadRequestException(
        `Erişim verilen Sayfalarda (${tumSayfalar.map((p) => p.name ?? p.id).join(", ")}) bağlı bir Instagram profesyonel hesabı görünmüyor. Instagram hesabını Sayfanın ayarlarından (Meta Business Suite → Ayarlar → Instagram hesapları) bağlayıp tekrar dene.`
      );
    }
    const kendi = await this.kapsamHandlelari(scope);
    const secilen =
      adaylar.find((p) => kendi.has(normalizeSocialHandle(p.instagram_business_account.username))) ?? adaylar[0];

    // Kapsam başına tek bağlantı: yeniden bağlanınca eskisi değişir. Hashtag
    // takipleri bağlantıya bağlı — eski bağlantının etiketleri yenisine taşınır.
    const eski = await this.baglanti(scope);
    const satir = {
      ...kapsam(scope),
      ig_user_id: secilen.instagram_business_account.id,
      ig_username: secilen.instagram_business_account.username ?? null,
      page_id: secilen.id,
      page_name: secilen.name ?? null,
      token_enc: socialTokenCrypto.encrypt(secilen.access_token),
      scopes: verilen,
      hata: null,
      created_by: s.userId,
      updated_at: new Date().toISOString(),
    };
    if (eski) {
      const { error } = await this.supabase.client.from("social_fb_connections").update(satir).eq("id", eski.id);
      if (error) throw error;
    } else {
      const { error } = await this.supabase.client.from("social_fb_connections").insert(satir);
      if (error) throw error;
    }
    return { next: s.next, igUsername: satir.ig_username ?? undefined };
  }

  async baglantiyiKaldir(scope: SocialScope, userId: string): Promise<{ ok: true }> {
    await this.social.assertWritable(scope, userId);
    const b = await this.baglanti(scope);
    if (b) {
      const { error } = await this.supabase.client.from("social_fb_connections").delete().eq("id", b.id);
      if (error) throw error;
    }
    return { ok: true };
  }

  // ============================================================ Okuma

  async overview(scope: SocialScope, userId: string): Promise<SocialCompetitorOverview> {
    await this.social.assertReadable(scope, userId);
    const bos: SocialCompetitorOverview = {
      acik: false,
      ayarli: this.ayarli(),
      rakipler: [],
      hashtagler: [],
      hashtagKullanimi: { kullanilan: 0, sinir: HASHTAG_HAFTALIK_SINIR },
    };
    if (!(await this.izinli(userId))) return bos;

    let b: any;
    try {
      b = await this.baglanti(scope);
    } catch (err: any) {
      // Migration 148 öncesi: sekme düşmesin.
      if (err?.code === "42P01" || err?.code === "PGRST205") return { ...bos, acik: true };
      throw err;
    }

    const [rakipler, hashtag] = await Promise.all([this.rakipListesi(scope), b ? this.hashtagListesi(b.id) : null]);
    return {
      acik: true,
      ayarli: this.ayarli(),
      baglanti: b ? baglantiyaCevir(b) : undefined,
      rakipler,
      hashtagler: hashtag?.liste ?? [],
      hashtagKullanimi: hashtag?.butce ?? { kullanilan: 0, sinir: HASHTAG_HAFTALIK_SINIR },
    };
  }

  private async rakipListesi(scope: SocialScope): Promise<SocialCompetitor[]> {
    const sorgu = this.supabase.client
      .from("social_inspirations")
      .select("id, handle, title, rakip_takip, rakip_profil, rakip_synced_at, rakip_hata")
      .eq("kind", "account")
      .not("handle", "is", null);
    const { data, error } = await ("jobId" in scope
      ? sorgu.eq("job_id", scope.jobId)
      : sorgu.eq("organization_id", scope.organizationId)
    ).order("created_at", { ascending: true });
    if (error) throw error;
    const satirlar = data ?? [];
    const takipteki = satirlar.filter((r: any) => r.rakip_takip).map((r: any) => r.id);

    const sinir = new Date(Date.now() - TAKIPCI_GECMISI_GUN * 86_400_000).toISOString().slice(0, 10);
    const [goruntu, medya] = await Promise.all([
      takipteki.length
        ? this.supabase.client
            .from("social_competitor_snapshots")
            .select("inspiration_id, captured_on, followers_count")
            .in("inspiration_id", takipteki)
            .gte("captured_on", sinir)
            .order("captured_on", { ascending: true })
        : Promise.resolve({ data: [], error: null } as any),
      takipteki.length
        ? this.supabase.client
            .from("social_competitor_media")
            .select("*")
            .in("inspiration_id", takipteki)
            .order("posted_at", { ascending: false })
            .limit(takipteki.length * 30)
        : Promise.resolve({ data: [], error: null } as any),
    ]);
    if (goruntu.error) throw goruntu.error;
    if (medya.error) throw medya.error;

    return satirlar.map((r: any) => ({
      inspirationId: r.id,
      handle: r.handle,
      title: r.title,
      takip: !!r.rakip_takip,
      profil: r.rakip_profil ?? undefined,
      syncedAt: r.rakip_synced_at ?? undefined,
      hata: r.rakip_hata ?? undefined,
      takipciGecmisi: (goruntu.data ?? [])
        .filter((g: any) => g.inspiration_id === r.id && typeof g.followers_count === "number")
        .map((g: any) => ({ gun: g.captured_on, deger: g.followers_count })),
      gonderiler: (medya.data ?? [])
        .filter((m: any) => m.inspiration_id === r.id)
        .map((m: any) => ({
          externalMediaId: m.external_media_id,
          caption: m.caption ?? undefined,
          mediaType: m.media_type ?? undefined,
          mediaProductType: m.media_product_type ?? undefined,
          permalink: m.permalink ?? undefined,
          postedAt: m.posted_at ? utc(m.posted_at) : undefined,
          likeCount: m.like_count ?? undefined,
          commentsCount: m.comments_count ?? undefined,
        })),
    }));
  }

  private async hashtagListesi(
    connectionId: string
  ): Promise<{ liste: SocialHashtagTrack[]; butce: SocialCompetitorOverview["hashtagKullanimi"] }> {
    const { data, error } = await this.supabase.client
      .from("social_hashtag_takipleri")
      .select("*")
      .eq("connection_id", connectionId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    const takipler = data ?? [];
    const ids = takipler.map((t: any) => t.id);
    const { data: medya, error: medyaHatasi } = ids.length
      ? await this.supabase.client
          .from("social_hashtag_media")
          .select("*")
          .in("takip_id", ids)
          .order("like_count", { ascending: false, nullsFirst: false })
          .limit(ids.length * 60)
      : { data: [], error: null };
    if (medyaHatasi) throw medyaHatasi;

    return {
      butce: hashtagButcesi(takipler, new Date()),
      liste: takipler.map((t: any) => ({
        id: t.id,
        hashtag: t.hashtag,
        aktif: t.aktif,
        sonSorgu: t.son_sorgu ? utc(t.son_sorgu) : undefined,
        hata: t.hata ?? undefined,
        gonderiler: (medya ?? [])
          .filter((m: any) => m.takip_id === t.id)
          .slice(0, HASHTAG_GOSTERILEN)
          .map((m: any) => ({
            externalMediaId: m.external_media_id,
            tur: m.tur,
            caption: m.caption ?? undefined,
            mediaType: m.media_type ?? undefined,
            permalink: m.permalink ?? undefined,
            postedAt: m.posted_at ? utc(m.posted_at) : undefined,
            likeCount: m.like_count ?? undefined,
            commentsCount: m.comments_count ?? undefined,
          })),
      })),
    };
  }

  // ============================================================ Rakip takibi

  /** İlham kaydını takibe al / çıkar. Takibe alınınca hemen bir kez okunur. */
  async takipAyarla(inspirationId: string, takip: boolean, userId: string): Promise<SocialCompetitor[]> {
    const ilham = await this.ilham(inspirationId);
    const scope = this.social.scopeOfRow(ilham);
    await this.social.assertWritable(scope, userId);
    await this.assertIzinli(userId);
    if (ilham.kind !== "account" || !ilham.handle) {
      throw new BadRequestException("Yalnızca kullanıcı adı olan 'hesap' türündeki ilham kaynakları takip edilebilir.");
    }
    if (takip) {
      const { count } = await this.supabase.client
        .from("social_inspirations")
        .select("id", { count: "exact", head: true })
        .eq("rakip_takip", true)
        .eq("jobId" in scope ? "job_id" : "organization_id", "jobId" in scope ? scope.jobId : scope.organizationId);
      if ((count ?? 0) >= MAX_RAKIP) {
        throw new BadRequestException(`En fazla ${MAX_RAKIP} hesap takip edilebilir.`);
      }
    }
    const { error } = await this.supabase.client
      .from("social_inspirations")
      .update({ rakip_takip: takip })
      .eq("id", inspirationId);
    if (error) throw error;

    if (takip) {
      const b = await this.baglanti(scope);
      if (b) {
        await this.rakibiOku(b, { id: inspirationId, handle: ilham.handle }).catch(async (err) => {
          this.logger.warn(`Rakip okunamadı (@${ilham.handle}): ${(err as Error).message}`);
          await this.supabase.client
            .from("social_inspirations")
            .update({ rakip_hata: "Meta şu an yanıt vermedi; gece yeniden denenecek." }) // dil:anahtar
            .eq("id", inspirationId);
        });
      }
    }
    return this.rakipListesi(scope);
  }

  /**
   * "Şimdi güncelle": takipteki rakipler + etkin hashtag'ler (kısa aralıkla
   * tekrarlanırsa atlar). Hashtag'i yeniden sorgulamak yeni hak harcamaz.
   */
  async rakipleriGuncelle(scope: SocialScope, userId: string): Promise<{ okunan: number; atlanan: number }> {
    await this.social.assertWritable(scope, userId);
    await this.assertIzinli(userId);
    const b = await this.baglanti(scope);
    if (!b) throw new BadRequestException("Önce Facebook ile bağlan.");
    const rakip = await this.kapsamiOku(b, ELLE_ARALIK_DK * 60_000);
    const etiket = await this.hashtagleriOku(b, ELLE_ARALIK_DK * 60_000).catch((err) => {
      this.logger.warn(`Hashtag güncellemesi düştü: ${(err as Error).message}`);
      return 0;
    });
    return { okunan: rakip.okunan + etiket, atlanan: rakip.atlanan };
  }

  /** Gece işi: bütün bağlantılar. */
  async geceTuru(): Promise<{ rakip: number; hashtag: number }> {
    if (!this.ayarli()) return { rakip: 0, hashtag: 0 };
    const { data, error } = await this.supabase.client.from("social_fb_connections").select("*");
    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205") return { rakip: 0, hashtag: 0 };
      throw error;
    }
    let rakip = 0;
    let hashtag = 0;
    for (const b of data ?? []) {
      try {
        rakip += (await this.kapsamiOku(b, GECE_ATLAMA_SAAT * 3_600_000)).okunan;
        hashtag += await this.hashtagleriOku(b, GECE_ATLAMA_SAAT * 3_600_000);
      } catch (err) {
        this.logger.warn(`Rakip gece turu düştü (${b.id}): ${(err as Error).message}`);
      }
    }
    return { rakip, hashtag };
  }

  private async kapsamiOku(b: any, atlamaMs: number): Promise<{ okunan: number; atlanan: number }> {
    if (this.calisan.has(b.id)) return { okunan: 0, atlanan: 0 };
    this.calisan.add(b.id);
    try {
      const sorgu = this.supabase.client
        .from("social_inspirations")
        .select("id, handle, rakip_synced_at")
        .eq("rakip_takip", true)
        .not("handle", "is", null);
      const { data, error } = await (b.job_id ? sorgu.eq("job_id", b.job_id) : sorgu.eq("organization_id", b.organization_id))
        .order("rakip_synced_at", { ascending: true, nullsFirst: true })
        .limit(MAX_RAKIP);
      if (error) throw error;
      let okunan = 0;
      let atlanan = 0;
      for (const r of data ?? []) {
        const son = r.rakip_synced_at ? Date.parse(utc(r.rakip_synced_at)) : 0;
        if (Date.now() - son < atlamaMs) {
          atlanan++;
          continue;
        }
        const sonuc = await this.rakibiOku(b, r);
        if (sonuc === "jeton") break; // bağlantı kopuk: kalanları denemek boşuna
        if (sonuc === "ok") okunan++;
      }
      return { okunan, atlanan };
    } finally {
      this.calisan.delete(b.id);
    }
  }

  /** Tek rakip: profil + son gönderiler + günlük takipçi. */
  private async rakibiOku(b: any, r: { id: string; handle: string }): Promise<"ok" | "hata" | "jeton"> {
    const token = this.jeton(b);
    const yanit = await this.graphHam(
      b,
      `${b.ig_user_id}?${new URLSearchParams({ fields: discoveryAlani(r.handle), access_token: token })}`
    );
    const simdi = new Date().toISOString();
    if (!yanit.ok) {
      const tur = metaHataTuru(yanit.govde);
      await this.supabase.client
        .from("social_inspirations")
        .update({ rakip_hata: discoveryHatasi(yanit.govde), rakip_synced_at: simdi })
        .eq("id", r.id);
      if (tur === "jeton" || tur === "izin") {
        await this.supabase.client
          .from("social_fb_connections")
          .update({ hata: discoveryHatasi(yanit.govde), updated_at: simdi })
          .eq("id", b.id);
        return "jeton";
      }
      return "hata";
    }

    const okunan = discoveryOku(yanit.json);
    await this.supabase.client
      .from("social_inspirations")
      .update({ rakip_profil: okunan.profil, rakip_hata: null, rakip_synced_at: simdi })
      .eq("id", r.id);
    await this.supabase.client.from("social_competitor_snapshots").upsert(
      {
        inspiration_id: r.id,
        captured_on: simdi.slice(0, 10),
        followers_count: okunan.profil.takipci ?? null,
        media_count: okunan.profil.gonderi ?? null,
      },
      { onConflict: "inspiration_id,captured_on" }
    );
    if (okunan.gonderiler.length) {
      const { error } = await this.supabase.client.from("social_competitor_media").upsert(
        okunan.gonderiler.map((g) => ({
          inspiration_id: r.id,
          external_media_id: g.externalMediaId,
          caption: g.caption ?? null,
          media_type: g.mediaType ?? null,
          media_product_type: g.mediaProductType ?? null,
          permalink: g.permalink ?? null,
          posted_at: g.postedAt ?? null,
          like_count: g.likeCount ?? null,
          comments_count: g.commentsCount ?? null,
          updated_at: simdi,
        })),
        { onConflict: "inspiration_id,external_media_id" }
      );
      if (error) throw error;
    }
    if (b.hata) {
      await this.supabase.client.from("social_fb_connections").update({ hata: null }).eq("id", b.id);
      b.hata = null;
    }
    return "ok";
  }

  // ============================================================ Hashtag takibi

  async hashtagEkle(scope: SocialScope, ham: string, userId: string): Promise<SocialHashtagTrack> {
    await this.social.assertWritable(scope, userId);
    await this.assertIzinli(userId);
    const b = await this.baglanti(scope);
    if (!b) throw new BadRequestException("Önce Facebook ile bağlan.");

    let hashtag: string;
    try {
      hashtag = hashtagiTemizle(ham);
    } catch (err) {
      if (err instanceof HashtagGecersiz) throw new BadRequestException(err.message);
      throw err;
    }

    const { data: mevcut } = await this.supabase.client
      .from("social_hashtag_takipleri")
      .select("hashtag, son_sorgu")
      .eq("connection_id", b.id);
    if ((mevcut ?? []).some((m: any) => m.hashtag === hashtag)) {
      throw new BadRequestException("Bu hashtag zaten takipte.");
    }
    // Yeni bir etiket haftalık hakkı bir azaltır; dolmuşsa Meta isteği zaten
    // reddeder — önceden söylemek daha iyi.
    const butce = hashtagButcesi(mevcut ?? [], new Date());
    if (butce.kullanilan >= butce.sinir) {
      throw new BadRequestException(
        `Bu hafta ${butce.sinir} farklı hashtag sınırı doldu. Bir etiketi durdurursan hakkı 7 gün içinde boşalır.`
      );
    }

    const arama = await this.graphHam(
      b,
      `ig_hashtag_search?${new URLSearchParams({ user_id: b.ig_user_id, q: hashtag, access_token: this.jeton(b) })}`
    );
    if (!arama.ok) throw new BadRequestException(discoveryHatasi(arama.govde));
    const igId = (arama.json as any)?.data?.[0]?.id;
    if (!igId) throw new BadRequestException("Instagram bu hashtag'i bulamadı.");

    // Arama hakkı bu anda harcandı: haftalık bütçe bu zamandan sayılır, gönderi
    // çekme düşse bile.
    const simdi = new Date().toISOString();
    const { data, error } = await this.supabase.client
      .from("social_hashtag_takipleri")
      .insert({ connection_id: b.id, hashtag, ig_hashtag_id: igId, created_by: userId, ilk_sorgu: simdi, son_sorgu: simdi })
      .select("*")
      .single();
    if (error) throw error;
    // Gönderi çekme yavaş/kırılgan (Meta): düşerse etiket yine eklenmiş sayılır,
    // hata satıra yazılır, gece işi tamamlar.
    await this.hashtagiOku(b, data).catch(async (err) => {
      this.logger.warn(`Hashtag gönderileri çekilemedi (#${hashtag}): ${(err as Error).message}`);
      await this.supabase.client
        .from("social_hashtag_takipleri")
        .update({ hata: "Gönderiler şu an çekilemedi; gece yeniden denenecek." }) // dil:anahtar
        .eq("id", data.id);
    });
    const liste = await this.hashtagListesi(b.id);
    return liste.liste.find((t) => t.id === data.id)!;
  }

  /** Durdur / sürdür. Durdurulan etiket sorgulanmaz; hakkı 7 gün içinde boşalır. */
  async hashtagAyarla(id: string, aktif: boolean, userId: string): Promise<{ ok: true }> {
    const t = await this.hashtagTakibi(id, userId);
    const { error } = await this.supabase.client.from("social_hashtag_takipleri").update({ aktif }).eq("id", t.id);
    if (error) throw error;
    return { ok: true };
  }

  async hashtagSil(id: string, userId: string): Promise<{ ok: true }> {
    const t = await this.hashtagTakibi(id, userId);
    const { error } = await this.supabase.client.from("social_hashtag_takipleri").delete().eq("id", t.id);
    if (error) throw error;
    return { ok: true };
  }

  private async hashtagleriOku(b: any, atlamaMs: number): Promise<number> {
    const { data, error } = await this.supabase.client
      .from("social_hashtag_takipleri")
      .select("*")
      .eq("connection_id", b.id)
      .eq("aktif", true);
    if (error) throw error;
    let okunan = 0;
    for (const t of data ?? []) {
      const son = t.son_sorgu ? Date.parse(utc(t.son_sorgu)) : 0;
      if (Date.now() - son < atlamaMs) continue;
      if (await this.hashtagiOku(b, t)) okunan++;
    }
    return okunan;
  }

  /** Etiketin en popüler + son 24 saat gönderileri (iki istek, aynı hak). */
  private async hashtagiOku(b: any, t: any): Promise<boolean> {
    const simdi = new Date().toISOString();
    const satirlar: any[] = [];
    let hata: string | null = null;
    for (const tur of ["top", "recent"] as const) {
      const yanit = await this.graphHam(
        b,
        `${t.ig_hashtag_id}/${tur}_media?${new URLSearchParams({
          user_id: b.ig_user_id,
          fields: hashtagMedyaAlanlari(),
          limit: "30",
          access_token: this.jeton(b),
        })}`
      );
      if (!yanit.ok) {
        hata = discoveryHatasi(yanit.govde);
        continue;
      }
      for (const g of medyaListesiOku((yanit.json as any)?.data)) {
        satirlar.push({
          takip_id: t.id,
          external_media_id: g.externalMediaId,
          tur,
          caption: g.caption ?? null,
          media_type: g.mediaType ?? null,
          permalink: g.permalink ?? null,
          posted_at: g.postedAt ?? null,
          like_count: g.likeCount ?? null,
          comments_count: g.commentsCount ?? null,
          captured_at: simdi,
        });
      }
    }
    // Aynı gönderi hem "top" hem "recent"te olabilir: tek satır, ilk tür kalır.
    const tekil = Array.from(new Map(satirlar.map((s) => [s.external_media_id, s])).values());
    if (tekil.length) {
      const { error } = await this.supabase.client
        .from("social_hashtag_media")
        .upsert(tekil, { onConflict: "takip_id,external_media_id" });
      if (error) throw error;
    }
    await this.supabase.client
      .from("social_hashtag_takipleri")
      .update({ son_sorgu: simdi, ilk_sorgu: t.ilk_sorgu ?? simdi, hata })
      .eq("id", t.id);
    return !hata || tekil.length > 0;
  }

  // ============================================================ Yardımcılar

  private async baglanti(scope: SocialScope): Promise<any | null> {
    const sorgu = this.supabase.client.from("social_fb_connections").select("*");
    const { data, error } = await ("jobId" in scope
      ? sorgu.eq("job_id", scope.jobId)
      : sorgu.eq("organization_id", scope.organizationId)
    ).maybeSingle();
    if (error) throw error;
    return data;
  }

  private async kapsamHandlelari(scope: SocialScope): Promise<Set<string>> {
    const sorgu = this.supabase.client.from("social_accounts").select("handle").eq("platform", "instagram").is("archived_at", null);
    const { data } = await ("jobId" in scope ? sorgu.eq("job_id", scope.jobId) : sorgu.eq("organization_id", scope.organizationId));
    return new Set((data ?? []).map((r: any) => normalizeSocialHandle(r.handle)));
  }

  private async ilham(id: string): Promise<any> {
    const { data, error } = await this.supabase.client.from("social_inspirations").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("İlham kaydı bulunamadı");
    return data;
  }

  private async hashtagTakibi(id: string, userId: string): Promise<any> {
    const { data, error } = await this.supabase.client
      .from("social_hashtag_takipleri")
      .select("*, social_fb_connections(organization_id, job_id, department_id)")
      .eq("id", id)
      .maybeSingle<any>();
    if (error) throw error;
    if (!data) throw new NotFoundException("Hashtag takibi bulunamadı");
    await this.social.assertWritable(this.social.scopeOfRow(data.social_fb_connections), userId);
    return data;
  }

  private jeton(b: any): string {
    return socialTokenCrypto.decrypt(b.token_enc);
  }

  /** Kurulum çağrıları (OAuth): hata kullanıcıya anlaşılır cümle olarak döner. */
  private async graph<T>(yol: string): Promise<T> {
    const res = await fetchWithTimeout(`${FB_GRAPH_HOST}/${FB_API_VERSION}/${yol}`);
    const govde = await res.text();
    if (!res.ok) {
      this.logger.warn(`Facebook isteği başarısız (${res.status}): ${govde.slice(0, 300)}`);
      throw new BadRequestException(discoveryHatasi(govde));
    }
    return JSON.parse(govde) as T;
  }

  /**
   * Veri çağrıları: kullanım başlıkları bağlantıya yazılır (paneldeki sınır
   * göstergesi). Jeton adreste olduğu için adres LOG'A YAZILMAZ.
   */
  private async graphHam(b: any, yol: string): Promise<{ ok: boolean; json?: unknown; govde: string }> {
    const res = await fetchWithTimeout(`${FB_GRAPH_HOST}/${FB_API_VERSION}/${yol}`, {}, META_ZAMAN_ASIMI_MS);
    const kullanim = kullanimOku(res.headers);
    if (kullanim) await this.kullanimiYaz(b.id, kullanim);
    const govde = await res.text();
    if (!res.ok) return { ok: false, govde };
    try {
      return { ok: true, json: JSON.parse(govde), govde: "" };
    } catch {
      return { ok: false, govde };
    }
  }

  private async kullanimiYaz(id: string, kullanim: SocialMetaUsage): Promise<void> {
    await this.supabase.client
      .from("social_fb_connections")
      .update({ kullanim, kullanim_at: new Date().toISOString() })
      .eq("id", id);
  }
}

function kapsam(scope: SocialScope): Record<string, unknown> {
  return "jobId" in scope
    ? { job_id: scope.jobId, organization_id: null, department_id: null }
    : { organization_id: scope.organizationId, job_id: null, department_id: scope.departmentId ?? null };
}

function utc(v: string): string {
  return /[zZ]|[+-]\d{2}:?\d{2}$/.test(v) ? v : `${v}Z`;
}

function baglantiyaCevir(b: any): SocialFbConnection {
  return {
    id: b.id,
    igUsername: b.ig_username ?? undefined,
    pageName: b.page_name ?? undefined,
    kullanim: b.kullanim ?? undefined,
    kullanimAt: b.kullanim_at ? utc(b.kullanim_at) : undefined,
    hata: b.hata ?? undefined,
    createdAt: utc(b.created_at),
  };
}
