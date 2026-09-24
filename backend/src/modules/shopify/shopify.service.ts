import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { tahsilEdilen, type Party, type ShopifyMagazaOzeti, type ShopifyOzeti } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { AccessService } from "../../common/access/access.service";
import { createTokenCrypto } from "../../common/crypto/token-crypto";
import { getApiPublicUrl, getWebAppUrl } from "../../common/config/env";
import { fetchWithTimeout } from "../../common/http/fetch-with-timeout";
import { PartyService } from "../party/party.service";
import { SiparisService } from "../party/siparis.service";
import {
  SHOPIFY_API_VERSION,
  SHOPIFY_SCOPES,
  SHOPIFY_WEBHOOK_KONULARI,
  eksikTahsilat,
  magazaAdresiCoz,
  musteriKimligi,
  shopifyTahsilEdilen,
  siparisAlanlari,
  sorguImzasiGecerli,
  yerelGun,
  type ShopifySiparisi,
} from "./shopify-esleme";

/**
 * Shopify entegrasyonu — Faz 1: Shopify → Projelio, tek yön.
 *
 * AKIŞ
 *   1. Şirket sahibi mağaza adını yazar → Shopify'ın yetki ekranına gider
 *      (OAuth, `state` imzalı JWT — Instagram akışıyla aynı desen).
 *   2. Geri dönüşte jeton alınır, ŞİFRELENİP saklanır, webhook'lar kaydedilir.
 *   3. Shopify her sipariş olayında /shopify/webhook'a gelir; olay imzası
 *      doğrulanıp shopify_olaylari'na yazılır ve hemen 200 dönülür.
 *   4. ShopifyProcessor kuyruğu işler: müşteri kartı bulunur/açılır, sipariş
 *      yazılır/güncellenir, ödenen kısım tahsilat olarak kasaya düşer.
 *
 * NEDEN KUYRUK: Shopify yanıtı 5 saniyede bekliyor; aşılırsa yeniden deniyor
 * ve 48 saat boyunca başarısız olursa aboneliği SİLİYOR. Müşteri eşleştirme
 * + sipariş + tahsilat + kasa satırı birkaç veritabanı turu; bunu isteğin
 * içinde yapmak yavaş bir anda mağazanın sessizce kopması demekti.
 *
 * Yazma yetkisi sorulmaz: çağıran imzası doğrulanmış bir webhook ve yazılacak
 * şirket bağlantı kurulurken (sahibin onayıyla) belirlendi.
 */

const tokenCrypto = createTokenCrypto("SHOPIFY_TOKEN_ENC_KEY");

/** Bir turda işlenecek en fazla olay; kalanı bir sonraki tura. */
const TUR_BASINA_OLAY = 50;
/** Bu kadar denemeden sonra olay "hata"da bırakılır, kuyruğu tıkamasın. */
const EN_FAZLA_DENEME = 5;
/** İşlenmiş olay gövdeleri müşteri kişisel verisi taşır; bu kadar gün sonra silinir. */
const OLAY_SAKLAMA_GUN = 30;
/** Erişim jetonu bitmeden bu kadar önce yenilenir: istek yoldayken ölmesin. */
const JETON_PAYI_MS = 5 * 60_000;
/** Yenileme jetonu bitmesine bu kadar gün kalınca gece işi yeniler (bkz. 132). */
const YENILEME_ESIGI_GUN = 30;

/** Shopify'ın jeton yanıtı (kod takası ve yenileme aynı biçimde döner). */
interface JetonYaniti {
  access_token?: string;
  scope?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
}

/**
 * Jeton yanıtını sütunlara çevirir. `expires_in` yoksa jeton süresiz sayılır
 * (eski tip uygulama); o zaman yenileme hiç denenmez — yenileme jetonu
 * olmayan bir jetonu yenilemeye kalkmak kalıcı 401 demekti.
 */
function jetonSutunlari(j: JetonYaniti): Record<string, string | null> {
  const simdi = Date.now();
  const saniye = (n: unknown) => (Number(n) > 0 ? new Date(simdi + Number(n) * 1000).toISOString() : null);
  return {
    access_token_enc: tokenCrypto.encrypt(j.access_token!),
    refresh_token_enc: j.refresh_token ? tokenCrypto.encrypt(j.refresh_token) : null,
    access_token_expires_at: saniye(j.expires_in),
    refresh_token_expires_at: saniye(j.refresh_token_expires_in),
  };
}

const SAAT_DILIMI = process.env.TZ?.trim() || "Europe/Istanbul";
function bugun(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: SAAT_DILIMI }).format(new Date());
}

// dil:anahtar-baslangic — istisna mesajları (sözlük: common/i18n/en/hatalar.ts)
const HATA_YAPILANDIRMA = "Shopify entegrasyonu bu sunucuda henüz açılmadı";
const HATA_MAGAZA_ADI = "Mağaza adresi geçersiz. Örnek: magazam.myshopify.com";
const HATA_YETKI = "Shopify mağazasını yalnızca şirketin kurucusu bağlayabilir";
const HATA_BASKA_SIRKET = "Bu mağaza başka bir şirkete bağlı. Önce oradaki bağlantıyı kaldırın.";
const HATA_IZIN = "Shopify gerekli izinleri vermedi; bağlantıyı yeniden deneyin";
const HATA_GECERSIZ_ISTEK = "Shopify bağlantı isteği geçersiz veya süresi dolmuş";
const HATA_SORUMLU = "Seçilen kişi bu şirketin ekibinde değil";
const HATA_MAGAZA_YOK = "Mağaza bulunamadı";
const HATA_ERISIM_BITTI = "Shopify erişimi sona erdi; mağazayı yeniden bağlayın";
// dil:anahtar-bitis

interface ShopifyState {
  typ: "shopify_oauth";
  userId: string;
  organizationId: string;
  shop: string;
}

interface MagazaSatiri {
  id: string;
  organization_id: string;
  shop_domain: string;
  magaza_adi: string | null;
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  access_token_expires_at: string | null;
  refresh_token_expires_at: string | null;
  durum: string;
  varsayilan_sorumlu_id: string | null;
  baglayan_id: string | null;
}

@Injectable()
export class ShopifyService {
  private readonly logger = new Logger(ShopifyService.name);

  constructor(
    private supabase: SupabaseService,
    private access: AccessService,
    private jwt: JwtService,
    private partyService: PartyService,
    private siparisService: SiparisService
  ) {}

  // ============================================================ Yapılandırma

  get istemciKimligi(): string | undefined {
    return process.env.SHOPIFY_API_KEY?.trim() || undefined;
  }

  /** Uygulama sırrı: OAuth kod takası VE webhook/sorgu imzası bununla. */
  get sir(): string | undefined {
    return process.env.SHOPIFY_API_SECRET?.trim() || undefined;
  }

  /**
   * Üçü de şart. Şifreleme anahtarı olmadan jeton saklanamaz ve "bağlandı
   * ama hiçbir sipariş gelmiyor" gibi yarım bir durum doğardı; arayüz bu
   * bayrağa bakıp düğmeyi hiç göstermiyor.
   */
  yapilandirildi(): boolean {
    return Boolean(this.istemciKimligi && this.sir && tokenCrypto.isConfigured());
  }

  private get geriDonusAdresi(): string {
    return `${getApiPublicUrl()}/shopify/callback`;
  }

  private get webhookAdresi(): string {
    return `${getApiPublicUrl()}/shopify/webhook`;
  }

  // ============================================================ Yetki

  /**
   * Mağaza bağlamak şirketin parasını ilgilendiren bir karar: siparişler
   * kasaya gelir olarak düşecek. Bu yüzden yalnızca kurucu (organizasyon
   * sahibi) — departman yöneticisi değil.
   */
  private async sahipOlmali(organizationId: string, userId: string): Promise<void> {
    const a = await this.access.organizationAccess(organizationId, userId);
    if (!a.canManage) throw new ForbiddenException(HATA_YETKI);
  }

  // ============================================================ Okuma

  async ozet(organizationId: string, userId: string): Promise<ShopifyOzeti> {
    await this.sahipOlmali(organizationId, userId);
    const { data, error } = await this.supabase.client
      .from("shopify_magazalari")
      .select("id, shop_domain, magaza_adi, para_birimi, durum, varsayilan_sorumlu_id, baglandi_at, son_olay_at, son_hata")
      .eq("organization_id", organizationId)
      .eq("durum", "aktif")
      .order("baglandi_at", { ascending: true });
    if (error) throw error;
    return {
      yapilandirildi: this.yapilandirildi(),
      magazalar: (data ?? []).map((r: any) => ({
        id: r.id,
        shopDomain: r.shop_domain,
        magazaAdi: r.magaza_adi,
        paraBirimi: r.para_birimi,
        durum: r.durum,
        varsayilanSorumluId: r.varsayilan_sorumlu_id,
        baglandiAt: r.baglandi_at,
        sonOlayAt: r.son_olay_at,
        sonHata: r.son_hata,
      })),
    };
  }

  // ============================================================ Bağlantı

  async baglantiAdresi(organizationId: string, magaza: unknown, userId: string): Promise<{ url: string }> {
    if (!this.yapilandirildi()) throw new BadRequestException(HATA_YAPILANDIRMA);
    await this.sahipOlmali(organizationId, userId);
    const shop = magazaAdresiCoz(magaza);
    if (!shop) throw new BadRequestException(HATA_MAGAZA_ADI);
    await this.baskaSirketeBagliMi(shop, organizationId);

    const state = this.jwt.sign(
      { typ: "shopify_oauth", userId, organizationId, shop } satisfies ShopifyState,
      { expiresIn: "10m" }
    );
    const params = new URLSearchParams({
      client_id: this.istemciKimligi!,
      scope: SHOPIFY_SCOPES.join(","),
      redirect_uri: this.geriDonusAdresi,
      state,
    });
    // Çevrimdışı (offline) jeton: `grant_options[]=per-user` YOK. Webhook'lar
    // kullanıcı oturumu olmadan işleniyor; kişiye bağlı jeton o kişi Shopify
    // oturumunu kapatınca ölürdü.
    return { url: `https://${shop}/admin/oauth/authorize?${params.toString()}` };
  }

  private async baskaSirketeBagliMi(shop: string, organizationId: string): Promise<void> {
    const { data } = await this.supabase.client
      .from("shopify_magazalari")
      .select("organization_id")
      .eq("shop_domain", shop)
      .eq("durum", "aktif")
      .maybeSingle();
    if (data && data.organization_id !== organizationId) throw new BadRequestException(HATA_BASKA_SIRKET);
  }

  stateCoz(state: unknown): ShopifyState | null {
    if (typeof state !== "string" || !state) return null;
    try {
      const s = this.jwt.verify<ShopifyState>(state);
      return s?.typ === "shopify_oauth" ? s : null;
    } catch {
      return null;
    }
  }

  /** Geri dönüşten sonra kullanıcının gideceği ön yüz adresi. */
  donusAdresi(organizationId: string | undefined, sonuc: { baglandi?: string; hata?: string }): string {
    const url = new URL(`${getWebAppUrl()}${organizationId ? `/organizations/${organizationId}` : "/"}`);
    if (sonuc.baglandi) url.searchParams.set("shopify", `connected:${sonuc.baglandi}`);
    if (sonuc.hata) url.searchParams.set("shopify", `error:${sonuc.hata}`);
    return url.toString();
  }

  /**
   * OAuth geri dönüşü. Üç ayrı kanıt aranır:
   *   · sorgu imzası — `shop` ve `code` gerçekten Shopify'dan;
   *   · state — isteği BİZİM kullanıcımız, bu şirket için başlattı;
   *   · state'teki mağaza = dönen mağaza — başka mağazanın kodu araya sokulmasın.
   */
  async baglantiyiTamamla(sorgu: Record<string, unknown>): Promise<{ organizationId: string; shop: string }> {
    if (!this.yapilandirildi()) throw new BadRequestException(HATA_YAPILANDIRMA);
    const state = this.stateCoz(sorgu.state);
    const shop = magazaAdresiCoz(sorgu.shop);
    const code = typeof sorgu.code === "string" ? sorgu.code : "";
    if (!state || !shop || !code || state.shop !== shop || !sorguImzasiGecerli(sorgu, this.sir!)) {
      throw new UnauthorizedException(HATA_GECERSIZ_ISTEK);
    }
    // Aradaki on dakikada yetki düşmüş olabilir (kurucu devredildi).
    await this.sahipOlmali(state.organizationId, state.userId);
    await this.baskaSirketeBagliMi(shop, state.organizationId);

    // expiring=1: Shopify yeni public uygulamalarda süresiz jetonu kabul
    // etmiyor. Erişim jetonu 1 saat, yenileme jetonu 90 gün (bkz. 132).
    const res = await fetchWithTimeout(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ client_id: this.istemciKimligi!, client_secret: this.sir!, code, expiring: "1" }),
    });
    if (!res.ok) {
      this.logger.error(`Shopify kod takası başarısız (${shop}, ${res.status}): ${await res.text()}`);
      throw new UnauthorizedException(HATA_GECERSIZ_ISTEK);
    }
    const json = (await res.json()) as JetonYaniti;
    const verilen = new Set((json.scope ?? "").split(",").map((s) => s.trim()));
    if (!json.access_token || !SHOPIFY_SCOPES.every((s) => verilen.has(s))) {
      throw new UnauthorizedException(HATA_IZIN);
    }

    const bilgi = await this.graphql<{ shop: { name: string; currencyCode: string } }>(
      shop,
      json.access_token,
      "{ shop { name currencyCode } }"
    ).catch(() => null);

    // Aynı şirket aynı mağazayı yeniden bağlıyorsa (jeton yenilemek için)
    // mevcut satır güncellenir; sorumlu seçimi korunur.
    const { data: mevcut } = await this.supabase.client
      .from("shopify_magazalari")
      .select("id")
      .eq("shop_domain", shop)
      .eq("organization_id", state.organizationId)
      .eq("durum", "aktif")
      .maybeSingle();
    const satir = {
      organization_id: state.organizationId,
      shop_domain: shop,
      magaza_adi: bilgi?.shop.name ?? null,
      para_birimi: bilgi?.shop.currencyCode ?? null,
      ...jetonSutunlari(json),
      scopes: json.scope ?? null,
      durum: "aktif",
      baglayan_id: state.userId,
      son_hata: null,
    };
    const { error } = mevcut
      ? await this.supabase.client.from("shopify_magazalari").update(satir).eq("id", mevcut.id)
      : await this.supabase.client.from("shopify_magazalari").insert(satir);
    if (error) {
      if ((error as any).code === "23505") throw new BadRequestException(HATA_BASKA_SIRKET);
      throw error;
    }

    await this.webhooklariKaydet(shop, json.access_token);
    return { organizationId: state.organizationId, shop };
  }

  /**
   * Webhook aboneliklerini açar. Aynı adres zaten kayıtlıysa Shopify
   * "already been taken" der — yeniden bağlanmada beklenen durum, hata değil.
   * Diğer hatalar loglanır ama bağlantıyı düşürmez: son_hata'ya yazılır ve
   * kartta görünür.
   */
  private async webhooklariKaydet(shop: string, jeton: string): Promise<void> {
    const hatalar: string[] = [];
    for (const konu of SHOPIFY_WEBHOOK_KONULARI) {
      try {
        const r = await this.graphql<{ webhookSubscriptionCreate: { userErrors: Array<{ message: string }> } }>(
          shop,
          jeton,
          `mutation($topic: WebhookSubscriptionTopic!, $uri: String!) {
             webhookSubscriptionCreate(topic: $topic, webhookSubscription: { uri: $uri, format: JSON }) {
               userErrors { message }
             }
           }`,
          { topic: konu, uri: this.webhookAdresi }
        );
        const e = r.webhookSubscriptionCreate.userErrors.filter((u) => !/already been taken/i.test(u.message));
        if (e.length) hatalar.push(`${konu}: ${e.map((u) => u.message).join("; ")}`);
      } catch (err) {
        hatalar.push(`${konu}: ${(err as Error).message}`);
      }
    }
    if (hatalar.length) {
      this.logger.error(`Shopify webhook kaydı eksik (${shop}): ${hatalar.join(" | ")}`);
      await this.supabase.client
        .from("shopify_magazalari")
        .update({ son_hata: `Webhook kaydı: ${hatalar.join(" | ").slice(0, 500)}` })
        .eq("shop_domain", shop)
        .eq("durum", "aktif");
    }
  }

  async sorumluAta(magazaId: string, sorumluId: string | null, userId: string): Promise<ShopifyMagazaOzeti> {
    const m = await this.magaza(magazaId);
    await this.sahipOlmali(m.organization_id, userId);
    if (sorumluId && !(await this.access.canViewOrganization(m.organization_id, sorumluId))) {
      throw new BadRequestException(HATA_SORUMLU);
    }
    const { error } = await this.supabase.client
      .from("shopify_magazalari")
      .update({ varsayilan_sorumlu_id: sorumluId })
      .eq("id", magazaId);
    if (error) throw error;
    const { magazalar } = await this.ozet(m.organization_id, userId);
    return magazalar.find((x) => x.id === magazaId)!;
  }

  /**
   * Bağlantıyı kaldırır. Shopify tarafında uygulama da kaldırılır (jeton
   * iptali = uygulamanın mağazadan silinmesi); o çağrı düşse bile bizdeki
   * jeton silinir — kullanılmayacak bir jetonu saklamanın tek sonucu risk.
   * Gelmiş siparişler ve tahsilatlar YERİNDE KALIR: o para gerçekten geldi.
   */
  async kaldir(magazaId: string, userId: string): Promise<{ success: true }> {
    const m = await this.magaza(magazaId);
    await this.sahipOlmali(m.organization_id, userId);
    if (m.access_token_enc) {
      try {
        const res = await fetchWithTimeout(`https://${m.shop_domain}/admin/api_permissions/current.json`, {
          method: "DELETE",
          headers: { "X-Shopify-Access-Token": await this.gecerliJeton(m) },
        });
        if (!res.ok && res.status !== 401) this.logger.warn(`Shopify jeton iptali ${res.status} döndü (${m.shop_domain})`);
      } catch (err) {
        this.logger.warn(`Shopify jeton iptali yapılamadı (${m.shop_domain}): ${(err as Error).message}`);
      }
    }
    await this.pasiflestir(m.id);
    return { success: true };
  }

  private async pasiflestir(magazaId: string): Promise<void> {
    const { error } = await this.supabase.client
      .from("shopify_magazalari")
      .update({
        durum: "kaldirildi",
        access_token_enc: null,
        refresh_token_enc: null,
        access_token_expires_at: null,
        refresh_token_expires_at: null,
        kaldirildi_at: new Date().toISOString(),
      })
      .eq("id", magazaId);
    if (error) throw error;
  }

  private async magaza(id: string): Promise<MagazaSatiri> {
    const { data } = await this.supabase.client.from("shopify_magazalari").select("*").eq("id", id).maybeSingle();
    if (!data || data.durum !== "aktif") throw new NotFoundException(HATA_MAGAZA_YOK);
    return data as MagazaSatiri;
  }

  // ============================================================ Jeton yenileme

  /**
   * Kullanılabilir erişim jetonu. Süresi bitmek üzereyse önce yenilenir.
   * API çağıran her yer bundan geçmeli; şifreli sütunu doğrudan çözmek
   * bir saat sonra 401 almak demek.
   */
  private async gecerliJeton(m: MagazaSatiri): Promise<string> {
    if (!m.access_token_enc) throw new Error(HATA_ERISIM_BITTI);
    const bitis = m.access_token_expires_at ? Date.parse(m.access_token_expires_at) : null;
    if (bitis === null || bitis - JETON_PAYI_MS > Date.now()) return tokenCrypto.decrypt(m.access_token_enc);
    return this.jetonuYenile(m);
  }

  /**
   * Yenileme jetonuyla yeni çift alır ve İKİSİNİ de saklar. Shopify her
   * yenilemede yeni bir yenileme jetonu verir ve eskisini emekliye ayırır;
   * yenisini yazmamak bir sonraki yenilemede kalıcı 401 demek.
   *
   * Geçici hata (zaman aşımı, 5xx) güvenli: sunduğumuz jeton, Shopify'ın
   * verdiği yenisi kullanılana kadar geçerli kalır — aynı jetonla yeniden
   * denenebilir. 401 ise gerçekten bitmiş demek: kartta "yeniden bağlayın"
   * görünür; siparişler (webhook) jetona bağlı olmadığı için gelmeye devam eder.
   */
  private async jetonuYenile(m: MagazaSatiri): Promise<string> {
    if (!m.refresh_token_enc) throw new Error(HATA_ERISIM_BITTI);
    const res = await fetchWithTimeout(`https://${m.shop_domain}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        client_id: this.istemciKimligi!,
        client_secret: this.sir!,
        grant_type: "refresh_token",
        refresh_token: tokenCrypto.decrypt(m.refresh_token_enc),
      }),
    });
    if (res.status === 401 || res.status === 400) {
      await this.supabase.client.from("shopify_magazalari").update({ son_hata: HATA_ERISIM_BITTI }).eq("id", m.id);
      throw new Error(HATA_ERISIM_BITTI);
    }
    if (!res.ok) throw new Error(`Shopify jeton yenileme ${res.status}`);
    const json = (await res.json()) as JetonYaniti;
    if (!json.access_token) throw new Error("Shopify jeton yenileme yanıtı boş");

    const sutunlar = jetonSutunlari(json);
    // Yanıtta yeni yenileme jetonu yoksa eldekini koru — silmek bağlantıyı öldürürdü.
    if (!sutunlar.refresh_token_enc) {
      delete sutunlar.refresh_token_enc;
      delete sutunlar.refresh_token_expires_at;
    }
    const { error } = await this.supabase.client.from("shopify_magazalari").update(sutunlar).eq("id", m.id);
    if (error) throw error;
    Object.assign(m, sutunlar);
    return json.access_token;
  }

  /**
   * Gece işi: yenileme jetonu 90 gün KULLANILMAZSA ölür. Faz 1'de API'ye
   * neredeyse hiç gidilmediği (siparişler webhook'la geliyor) için, bu iş
   * olmasa her mağaza üç ayda bir sessizce "yeniden bağlayın" durumuna düşerdi.
   */
  async suresiYaklasanJetonlariYenile(): Promise<{ yenilendi: number; dustu: number }> {
    const sinir = new Date(Date.now() + YENILEME_ESIGI_GUN * 86_400_000).toISOString();
    const { data, error } = await this.supabase.client
      .from("shopify_magazalari")
      .select("*")
      .eq("durum", "aktif")
      .not("refresh_token_enc", "is", null)
      .lt("refresh_token_expires_at", sinir);
    if (error) throw error;
    const sonuc = { yenilendi: 0, dustu: 0 };
    for (const m of (data ?? []) as MagazaSatiri[]) {
      try {
        await this.jetonuYenile(m);
        sonuc.yenilendi++;
      } catch (err) {
        this.logger.warn(`Shopify jetonu yenilenemedi (${m.shop_domain}): ${(err as Error).message}`);
        sonuc.dustu++;
      }
    }
    return sonuc;
  }

  private async graphql<T>(shop: string, jeton: string, sorgu: string, degiskenler?: Record<string, unknown>): Promise<T> {
    const res = await fetchWithTimeout(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": jeton },
      body: JSON.stringify({ query: sorgu, variables: degiskenler ?? {} }),
    });
    if (!res.ok) throw new Error(`Shopify GraphQL ${res.status}`);
    const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
    if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join("; "));
    return json.data as T;
  }

  // ============================================================ Webhook kuyruğu

  /**
   * Olayı kuyruğa yazar. Aynı webhook kimliği ikinci kez gelirse tekil
   * indekse takılır ve sessizce yok sayılır — Shopify'ın yeniden denemesi
   * normal bir durum.
   */
  async olayiSakla(p: { shopDomain: string; konu: string; webhookId: string; govde: unknown }): Promise<boolean> {
    const { data: m } = await this.supabase.client
      .from("shopify_magazalari")
      .select("id")
      .eq("shop_domain", p.shopDomain)
      .eq("durum", "aktif")
      .maybeSingle();
    const { error } = await this.supabase.client.from("shopify_olaylari").insert({
      magaza_id: m?.id ?? null,
      shop_domain: p.shopDomain,
      konu: p.konu,
      webhook_id: p.webhookId,
      govde: p.govde ?? {},
    });
    if (error) {
      if ((error as any).code === "23505") return false;
      throw error;
    }
    return true;
  }

  /** Bekleyen olayları sırayla işler. Aynı anda iki tur ShopifyProcessor'da engelleniyor. */
  async kuyruguIsle(): Promise<{ islendi: number; atlandi: number; hata: number }> {
    const sonuc = { islendi: 0, atlandi: 0, hata: 0 };
    const { data: olaylar, error } = await this.supabase.client
      .from("shopify_olaylari")
      .select("id, shop_domain, konu, govde, deneme")
      .eq("durum", "bekliyor")
      .order("alindi_at", { ascending: true })
      .limit(TUR_BASINA_OLAY);
    if (error) throw error;

    for (const o of olaylar ?? []) {
      try {
        const atla = await this.olayiIsle(o.shop_domain, o.konu, o.govde);
        await this.supabase.client
          .from("shopify_olaylari")
          .update({ durum: atla ? "atlandi" : "islendi", hata: atla ?? null, islendi_at: new Date().toISOString() })
          .eq("id", o.id);
        if (atla) sonuc.atlandi++;
        else sonuc.islendi++;
      } catch (err) {
        const mesaj = (err as Error).message?.slice(0, 500) ?? "Bilinmeyen hata";
        const deneme = (o.deneme ?? 0) + 1;
        const son = deneme >= EN_FAZLA_DENEME;
        this.logger.warn(`Shopify olayı işlenemedi (${o.konu}, ${o.shop_domain}, deneme ${deneme}): ${mesaj}`);
        await this.supabase.client
          .from("shopify_olaylari")
          .update({ deneme, hata: mesaj, durum: son ? "hata" : "bekliyor" })
          .eq("id", o.id);
        if (son) {
          await this.supabase.client
            .from("shopify_magazalari")
            .update({ son_hata: mesaj })
            .eq("shop_domain", o.shop_domain)
            .eq("durum", "aktif");
        }
        sonuc.hata++;
      }
    }
    return sonuc;
  }

  /** İşlenmiş olay gövdeleri müşteri kişisel verisi taşıyor; süresiz saklanmaz. */
  async eskiOlaylariSil(): Promise<number> {
    const sinir = new Date(Date.now() - OLAY_SAKLAMA_GUN * 86_400_000).toISOString();
    const { data, error } = await this.supabase.client
      .from("shopify_olaylari")
      .delete()
      .neq("durum", "bekliyor")
      .lt("alindi_at", sinir)
      .select("id");
    if (error) throw error;
    return data?.length ?? 0;
  }

  /** Olayı işler. Atlandıysa nedenini döner, işlendiyse null. */
  private async olayiIsle(shopDomain: string, konu: string, govde: any): Promise<string | null> {
    // Gizlilik olayları mağaza kaldırıldıktan SONRA da gelir (shop/redact
    // kaldırmadan 48 saat sonra) — bu yüzden aktif mağaza aranmadan önce.
    if (konu === "customers/redact") return this.musteriVerisiniSil(shopDomain, govde);
    if (konu === "customers/data_request") return this.veriTalebiniKaydet(shopDomain, govde);
    if (konu === "shop/redact") return this.magazaVerisiniSil(shopDomain);

    const { data: m } = await this.supabase.client
      .from("shopify_magazalari")
      .select("*")
      .eq("shop_domain", shopDomain)
      .eq("durum", "aktif")
      .maybeSingle();
    if (!m) return "Mağaza bağlı değil";
    const magaza = m as MagazaSatiri;

    if (konu === "app/uninstalled") {
      await this.pasiflestir(magaza.id);
      return null;
    }
    if (!konu.startsWith("orders/")) return `Dinlenmeyen konu: ${konu}`;

    const atla = await this.siparisiIsle(magaza, govde as ShopifySiparisi);
    await this.supabase.client
      .from("shopify_magazalari")
      .update({ son_olay_at: new Date().toISOString(), son_hata: null })
      .eq("id", magaza.id);
    return atla;
  }

  // ============================================================ Sipariş

  private async siparisiIsle(magaza: MagazaSatiri, o: ShopifySiparisi): Promise<string | null> {
    if (o?.id === undefined || o?.id === null) return "Sipariş kimliği yok";
    const r = siparisAlanlari(o, bugun());
    if ("atla" in r) return r.atla;

    const aktorId = magaza.baglayan_id;
    if (o.cancelled_at) {
      const { data: var_ } = await this.supabase.client
        .from("musteri_siparisleri")
        .select("id")
        .eq("kaynak", "shopify")
        .eq("dis_kimlik", String(o.id))
        .maybeSingle();
      if (!var_) return "İptal edilmiş sipariş";
    }

    const party = await this.musteriKarti(magaza, o);
    const { siparis } = await this.siparisService.entegrasyonSiparisiYaz({
      party,
      kaynak: "shopify",
      disKimlik: String(o.id),
      shopifyMagazaId: magaza.id,
      alanlar: { ...r.alanlar, notlar: `Shopify · ${magaza.magaza_adi || magaza.shop_domain}` },
      aktorId,
    });

    // Tahsilat: Shopify'ın "şu kadarı ödendi" dediği ile bizdeki kayıtların
    // farkı. Elle girilmiş tahsilatlar da sayılır — kullanıcı kapıda ödemeyi
    // kendisi işaretlediyse aynı para ikinci kez yazılmasın.
    const eksik = eksikTahsilat(shopifyTahsilEdilen(o, siparis.tutar), tahsilEdilen(siparis));
    const kalan = Math.round((siparis.tutar - tahsilEdilen(siparis)) * 100) / 100;
    const tutar = Math.min(eksik, kalan);
    if (tutar > 0) {
      await this.siparisService.entegrasyonTahsilatiYaz({
        siparis,
        tutar,
        // Ödemenin günü: olayın geldiği andaki sipariş damgası (orders/paid'de
        // ödeme anı). Mağazanın yerel günü, UTC'ye çevrilmeden.
        tarih: yerelGun(o.updated_at) ?? yerelGun(o.processed_at) ?? bugun(),
        odemeYontemi: r.alanlar.odeme_yontemi,
        notlar: "Shopify ödemesi",
        aktorId,
      });
    }
    return null;
  }

  /**
   * Siparişin müşteri kartı. Sıra:
   *   1. Shopify müşteri kimliği daha önce bir karta bağlandıysa o kart;
   *   2. aynı e-postalı kart varsa o — ve Shopify kimliği ona bağlanır.
   *      Satış ekibinin elle açtığı müşteri Shopify'dan da alışveriş
   *      yapınca ikinci bir kart açılmasın (party'nin varlık sebebi);
   *   3. yoksa yeni kart, mağazanın varsayılan sorumlusuna atanmış.
   * Kimlik hiç yoksa (misafir sipariş ya da korumalı veri onayı yok)
   * mağazanın tek misafir kartı.
   */
  private async musteriKarti(magaza: MagazaSatiri, o: ShopifySiparisi): Promise<Party> {
    const k = musteriKimligi(o);
    const scope = { organizationId: magaza.organization_id };
    const sorumlu = magaza.varsayilan_sorumlu_id ?? magaza.baglayan_id ?? undefined;

    if (!k.ad) {
      const id = await this.kartBul(magaza.organization_id, "data->>shopify_misafir", magaza.shop_domain);
      if (id) return this.partyService.findOne(id);
      return this.partyService.create(scope, {
        displayName: `${magaza.magaza_adi || magaza.shop_domain} — Shopify misafir`,
        partyType: "person",
        roles: ["customer"],
        source: "shopify",
        ownerUserId: sorumlu,
        data: { shopify_misafir: magaza.shop_domain },
        notes: "Müşteri bilgisi gelmeyen Shopify siparişleri bu kartta toplanır.",
      });
    }

    if (k.shopifyId) {
      const id = await this.kartBul(magaza.organization_id, "data->>shopify_musteri_id", k.shopifyId);
      if (id) return this.partyService.findOne(id);
    }

    if (k.email) {
      const { data } = await this.supabase.client
        .from("party")
        .select("id, data")
        .eq("organization_id", magaza.organization_id)
        .is("merged_into_id", null)
        // ilike joker karakterleri kaçırılıyor: e-postadaki "_" tek karakter
        // eşleşmesine dönüp başka birinin kartını bulmasın.
        .ilike("email", k.email.replace(/[\\%_]/g, (c) => `\\${c}`))
        .limit(1);
      const bulunan = data?.[0];
      if (bulunan) {
        if (k.shopifyId) {
          await this.supabase.client
            .from("party")
            .update({ data: { ...(bulunan.data ?? {}), shopify_musteri_id: k.shopifyId } })
            .eq("id", bulunan.id);
        }
        return this.partyService.findOne(bulunan.id);
      }
    }

    return this.partyService.create(scope, {
      displayName: k.ad,
      partyType: k.tur,
      email: k.email ?? undefined,
      phone: k.telefon ?? undefined,
      address: k.adres ?? undefined,
      roles: ["customer"],
      source: "shopify",
      ownerUserId: sorumlu,
      data: k.shopifyId ? { shopify_musteri_id: k.shopifyId } : {},
    });
  }

  private async kartBul(organizationId: string, alan: string, deger: string): Promise<string | null> {
    const { data, error } = await this.supabase.client
      .from("party")
      .select("id")
      .eq("organization_id", organizationId)
      .is("merged_into_id", null)
      .eq(alan, deger)
      .limit(1);
    if (error) throw error;
    return data?.[0]?.id ?? null;
  }

  // ============================================================ Gizlilik (Shopify zorunlu webhook'ları)

  private async sonMagaza(shopDomain: string): Promise<{ id: string; organization_id: string } | null> {
    const { data } = await this.supabase.client
      .from("shopify_magazalari")
      .select("id, organization_id")
      .eq("shop_domain", shopDomain)
      .order("baglandi_at", { ascending: false })
      .limit(1);
    return data?.[0] ?? null;
  }

  /**
   * customers/redact: mağaza sahibi bir müşterinin verisinin silinmesini
   * istedi.
   *
   * YALNIZCA Shopify'dan açılmış kartın kişisel bilgisi silinir (ad, e-posta,
   * telefon, adres). Satış ekibinin elle açıp sonradan Shopify'a bağlanan
   * kartta yalnızca bağ koparılır: o kayıt Shopify'dan gelmedi, şirketin
   * kendi müşteri ilişkisi.
   *
   * Siparişler ve tahsilatlar SİLİNMEZ: kasadaki gelirin dayanağı, yasal
   * saklama yükümlülüğü var. Kartın adı silindiği için artık kişiye bağlanmıyorlar.
   */
  private async musteriVerisiniSil(shopDomain: string, govde: any): Promise<string | null> {
    const m = await this.sonMagaza(shopDomain);
    const shopifyId = govde?.customer?.id !== undefined ? String(govde.customer.id) : null;
    if (!m || !shopifyId) return "Eşleşen müşteri yok";

    const { data } = await this.supabase.client
      .from("party")
      .select("id, source, data")
      .eq("organization_id", m.organization_id)
      .eq("data->>shopify_musteri_id", shopifyId);
    if (!data?.length) return "Eşleşen müşteri yok";

    for (const p of data as any[]) {
      const { shopify_musteri_id: _sil, ...kalanVeri } = p.data ?? {};
      const guncelleme =
        p.source === "shopify"
          ? {
              display_name: "Silinmiş Shopify müşterisi",
              legal_name: null,
              email: null,
              phone: null,
              address: null,
              notes: null,
              data: kalanVeri,
            }
          : { data: kalanVeri };
      const { error } = await this.supabase.client.from("party").update(guncelleme).eq("id", p.id);
      if (error) throw error;
      // Kişi bağlantıları (party_contact) Shopify'dan hiç açılmıyor; silinecek
      // başka kişisel veri yok. Olay gövdeleri 30 günde süpürülüyor.
    }
    return null;
  }

  /**
   * customers/data_request: mağaza sahibi müşteri adına verilerinin bir
   * kopyasını istedi. Yanıtı mağaza sahibi verir (veri onun); biz kartın
   * geçmişine not düşeriz ki Müşteriler ekranında görünsün.
   */
  private async veriTalebiniKaydet(shopDomain: string, govde: any): Promise<string | null> {
    const m = await this.sonMagaza(shopDomain);
    const shopifyId = govde?.customer?.id !== undefined ? String(govde.customer.id) : null;
    if (!m || !shopifyId) return "Eşleşen müşteri yok";
    const id = await this.kartBul(m.organization_id, "data->>shopify_musteri_id", shopifyId);
    if (!id) return "Eşleşen müşteri yok";
    await this.partyService.logActivity(
      id,
      "sistem",
      "Shopify: müşteri, kayıtlı verilerinin bir kopyasını istedi. Müşteri kartındaki bilgileri 30 gün içinde iletin."
    );
    return null;
  }

  /**
   * shop/redact: mağaza uygulamayı kaldırdı, Shopify mağazaya ait verinin
   * silinmesini istiyor. Bağlantı satırları ve olay kuyruğu silinir.
   * Siparişler, tahsilatlar ve müşteri kartları KALIR: onlar Projelio
   * müşterimizin (şirketin) kendi kayıtları, Shopify'ın değil.
   */
  private async magazaVerisiniSil(shopDomain: string): Promise<string | null> {
    await this.supabase.client.from("shopify_olaylari").delete().eq("shop_domain", shopDomain).neq("konu", "shop/redact");
    await this.supabase.client.from("shopify_magazalari").delete().eq("shop_domain", shopDomain).eq("durum", "kaldirildi");
    return null;
  }
}
