import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import type { WebSitesiBaglantisi, WebSitesiOzeti, WebSitesiSirlari, WebSitesiStokHareketi } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { AccessService } from "../../common/access/access.service";
import { createTokenCrypto } from "../../common/crypto/token-crypto";
import { getApiPublicUrl } from "../../common/config/env";
import { fetchWithTimeout } from "../../common/http/fetch-with-timeout";
import {
  ANAHTAR_ONEKI,
  AZAMI_DENEME,
  SIR_ONEKI,
  anahtarOzeti,
  anahtariAyikla,
  bildirimImzasi,
  ipOzelMi,
  siteAdresiCoz,
  siteUrunu,
  sitedeGorunur,
  sonrakiDenemeGecikmesiMs,
  stokIstegiCoz,
  uuidMi,
  webhookAdresiCoz,
  type SiteUrunu,
} from "./web-sitesi-esleme";

const sirCrypto = createTokenCrypto("WEB_SITESI_SIR_ENC_KEY");

// dil:anahtar-baslangic — istisna mesajları (sözlük: common/i18n/en/hatalar.ts)
const HATA_IZIN = "Web sitesi eklentisi şimdilik yalnızca izinli hesaplara açık";
const HATA_YETKI = "Web sitesi bağlantısını yalnızca şirketin kurucusu yönetebilir";
const HATA_YAPILANDIRMA = "Web sitesi eklentisi bu sunucuda henüz açılmadı";
const HATA_AD = "Bağlantı adı 1-80 karakter olmalı";
const HATA_WEBHOOK = "Bildirim adresi https:// ile başlayan, herkese açık bir adres olmalı";
const HATA_SITE = "Site adresi geçerli bir web adresi değil";
const HATA_YOK = "Web sitesi bağlantısı bulunamadı";
const HATA_WEBHOOK_YOK = "Önce bir bildirim adresi girin";
// dil:anahtar-bitis

/** Site başına dakikalık istek tavanı — yanlış yazılmış bir döngü sunucuyu yormasın. */
const DAKIKALIK_TAVAN = 300;
const SAYFA_VARSAYILAN = 50;
const SAYFA_AZAMI = 200;
const KUYRUK_TURU = 50;
const BILDIRIM_ZAMAN_ASIMI_MS = 10_000;

const BAGLANTI_SUTUNLARI =
  "id, organization_id, ad, site_adresi, webhook_adresi, anahtar_on_eki, durum, created_at, son_istek_at, son_bildirim_at, son_hata, son_hata_at";

interface BaglantiSatiri {
  id: string;
  organization_id: string;
  ad: string;
  site_adresi: string | null;
  webhook_adresi: string | null;
  anahtar_on_eki: string;
  durum: string;
  created_at: string;
  son_istek_at: string | null;
  son_bildirim_at: string | null;
  son_hata: string | null;
  son_hata_at: string | null;
}

/** Sitenin anahtarıyla gelen isteğin kimliği. */
export interface SiteKimligi {
  baglantiId: string;
  organizationId: string;
}

/**
 * Web sitesi eklentisi (migration 186). Şirketin özel kodlu sitesi:
 *
 *   · ürünleri anahtarla OKUR          GET  /v1/site/products
 *   · satış/iadeyi BİLDİRİR            POST /v1/site/stock-movements
 *   · ürün değişince bildirim ALIR     Projelio → webhook adresi (imzalı)
 *
 * İki istemci türü var: şirket kurucusu (JWT, kartı yönetir) ve site (anahtar,
 * yalnızca /v1/site uçları). Anahtar şirkete bağlı, kişiye değil: kurucu
 * ayrılsa da site çalışmaya devam eder.
 *
 * ŞİMDİLİK İZİN LİSTESİYLE AÇIK: `WEB_SITESI_EPOSTALARI` (virgülle e-postalar).
 * Liste yalnızca kartı GÖRMEYİ ve bağlantı AÇMAYI kısıtlar; açılmış bir
 * bağlantının anahtarı listeden bağımsız çalışır — liste daraltılınca canlı
 * bir site sessizce kopmasın.
 */
@Injectable()
export class WebSitesiService {
  private readonly logger = new Logger(WebSitesiService.name);
  private sayac = new Map<string, { dakika: number; adet: number }>();
  private sonIstekYazildi = new Map<string, number>();

  constructor(
    private supabase: SupabaseService,
    private access: AccessService
  ) {}

  private get db() {
    return this.supabase.client;
  }

  // ============================================================ Yetki

  async izinli(userId: string): Promise<boolean> {
    const liste = (process.env.WEB_SITESI_EPOSTALARI ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (liste.length === 0) return false;
    const { data } = await this.db.from("users").select("email").eq("id", userId).maybeSingle<any>();
    return !!data?.email && liste.includes(String(data.email).toLowerCase());
  }

  private async yonetebilmeli(organizationId: string, userId: string): Promise<void> {
    if (!(await this.izinli(userId))) throw new ForbiddenException(HATA_IZIN);
    const a = await this.access.organizationAccess(organizationId, userId);
    if (!a.canManage) throw new ForbiddenException(HATA_YETKI);
  }

  private async baglantiyiAl(id: string, userId: string): Promise<BaglantiSatiri> {
    if (!uuidMi(id)) throw new NotFoundException(HATA_YOK);
    const { data, error } = await this.db
      .from("web_sitesi_baglantilari")
      .select(BAGLANTI_SUTUNLARI)
      .eq("id", id)
      .eq("durum", "aktif")
      .maybeSingle<BaglantiSatiri>();
    if (error) throw error;
    if (!data) throw new NotFoundException(HATA_YOK);
    await this.yonetebilmeli(data.organization_id, userId);
    return data;
  }

  // ============================================================ Kart (JWT)

  async ozet(organizationId: string, userId: string): Promise<WebSitesiOzeti> {
    const izinli = await this.izinli(userId);
    const bos: WebSitesiOzeti = { izinli, yapilandirildi: sirCrypto.isConfigured(), apiKoku: this.apiKoku(), baglantilar: [] };
    if (!izinli) return bos;
    const a = await this.access.organizationAccess(organizationId, userId);
    if (!a.canManage) return { ...bos, izinli: false };

    const { data, error } = await this.db
      .from("web_sitesi_baglantilari")
      .select(BAGLANTI_SUTUNLARI)
      .eq("organization_id", organizationId)
      .eq("durum", "aktif")
      .order("created_at", { ascending: true });
    if (error) throw error;
    const baglantilar = await Promise.all((data ?? []).map((r: any) => this.disaVer(r)));
    return { ...bos, baglantilar };
  }

  private apiKoku(): string {
    return `${getApiPublicUrl()}/v1/site`;
  }

  private async disaVer(r: BaglantiSatiri): Promise<WebSitesiBaglantisi> {
    const [{ count }, { data: hareketler }] = await Promise.all([
      this.db.from("web_sitesi_kuyrugu").select("product_id", { count: "exact", head: true }).eq("baglanti_id", r.id),
      this.db
        .from("web_sitesi_stok_hareketleri")
        .select("referans, tur, miktar, sonraki_stok, created_at, products(name)")
        .eq("baglanti_id", r.id)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    return {
      id: r.id,
      ad: r.ad,
      siteAdresi: r.site_adresi,
      webhookAdresi: r.webhook_adresi,
      anahtarOnEki: r.anahtar_on_eki,
      createdAt: r.created_at,
      sonIstekAt: r.son_istek_at,
      sonBildirimAt: r.son_bildirim_at,
      sonHata: r.son_hata,
      sonHataAt: r.son_hata_at,
      bekleyenBildirim: count ?? 0,
      sonHareketler: (hareketler ?? []).map(
        (h: any): WebSitesiStokHareketi => ({
          referans: h.referans,
          tur: h.tur,
          urunAdi: h.products?.name ?? "",
          miktar: Number(h.miktar),
          sonrakiStok: h.sonraki_stok === null ? null : Number(h.sonraki_stok),
          createdAt: h.created_at,
        })
      ),
    };
  }

  private alanlariCoz(govde: any, kismi: boolean): Record<string, unknown> {
    const p: Record<string, unknown> = {};
    if (!kismi || govde.ad !== undefined) {
      const ad = typeof govde.ad === "string" ? govde.ad.trim() : "";
      if (!ad || ad.length > 80) throw new BadRequestException(HATA_AD);
      p.ad = ad;
    }
    if (!kismi || govde.siteAdresi !== undefined) {
      if (govde.siteAdresi === null || govde.siteAdresi === "" || govde.siteAdresi === undefined) p.site_adresi = null;
      else {
        const s = siteAdresiCoz(govde.siteAdresi);
        if (!s) throw new BadRequestException(HATA_SITE);
        p.site_adresi = s;
      }
    }
    if (!kismi || govde.webhookAdresi !== undefined) {
      if (govde.webhookAdresi === null || govde.webhookAdresi === "" || govde.webhookAdresi === undefined) p.webhook_adresi = null;
      else {
        const w = webhookAdresiCoz(govde.webhookAdresi);
        if (!w) throw new BadRequestException(HATA_WEBHOOK);
        p.webhook_adresi = w;
      }
    }
    return p;
  }

  private yeniAnahtar(): { anahtar: string; ozet: string; onEk: string } {
    const anahtar = ANAHTAR_ONEKI + randomBytes(24).toString("base64url");
    return { anahtar, ozet: anahtarOzeti(anahtar), onEk: anahtar.slice(0, ANAHTAR_ONEKI.length + 4) };
  }

  async olustur(organizationId: string, userId: string, govde: any): Promise<WebSitesiSirlari> {
    await this.yonetebilmeli(organizationId, userId);
    if (!sirCrypto.isConfigured()) throw new BadRequestException(HATA_YAPILANDIRMA);
    const alanlar = this.alanlariCoz(govde ?? {}, false);
    const k = this.yeniAnahtar();
    const sir = SIR_ONEKI + randomBytes(24).toString("base64url");
    const { data, error } = await this.db
      .from("web_sitesi_baglantilari")
      .insert({
        organization_id: organizationId,
        ...alanlar,
        anahtar_ozeti: k.ozet,
        anahtar_on_eki: k.onEk,
        webhook_sir_sifreli: sirCrypto.encrypt(sir),
        olusturan: userId,
      })
      .select(BAGLANTI_SUTUNLARI)
      .single<BaglantiSatiri>();
    if (error) throw error;
    // İlk eşitleme: bildirim adresi varsa bütün ürünler bir kez gönderilir.
    if (data.webhook_adresi) await this.hepsiniKuyrugaAl(data);
    return { baglanti: await this.disaVer(data), anahtar: k.anahtar, webhookSiri: sir };
  }

  async guncelle(id: string, userId: string, govde: any): Promise<WebSitesiBaglantisi> {
    const onceki = await this.baglantiyiAl(id, userId);
    const alanlar = this.alanlariCoz(govde ?? {}, true);
    if (Object.keys(alanlar).length === 0) return this.disaVer(onceki);
    const { data, error } = await this.db
      .from("web_sitesi_baglantilari")
      .update(alanlar)
      .eq("id", id)
      .select(BAGLANTI_SUTUNLARI)
      .single<BaglantiSatiri>();
    if (error) throw error;
    if (data.webhook_adresi && data.webhook_adresi !== onceki.webhook_adresi) await this.hepsiniKuyrugaAl(data);
    if (!data.webhook_adresi) await this.db.from("web_sitesi_kuyrugu").delete().eq("baglanti_id", id);
    return this.disaVer(data);
  }

  /** Yeni anahtar; eskisi ANINDA geçersiz. Düz hâli yalnızca bu yanıtta görünür. */
  async anahtarYenile(id: string, userId: string): Promise<WebSitesiSirlari> {
    await this.baglantiyiAl(id, userId);
    const k = this.yeniAnahtar();
    const { data, error } = await this.db
      .from("web_sitesi_baglantilari")
      .update({ anahtar_ozeti: k.ozet, anahtar_on_eki: k.onEk })
      .eq("id", id)
      .select(BAGLANTI_SUTUNLARI)
      .single<BaglantiSatiri>();
    if (error) throw error;
    return { baglanti: await this.disaVer(data), anahtar: k.anahtar };
  }

  /**
   * İmza sırrını yeniden gösterir. Anahtarın aksine sır geri okunabiliyor
   * (her gönderimde imzalamak için şifreli saklanıyor), o yüzden sitenin
   * geliştiricisi kaybettiyse yenilemeye gerek yok — kurucu yeniden bakar.
   */
  async sirGoster(id: string, userId: string): Promise<{ webhookSiri: string }> {
    await this.baglantiyiAl(id, userId);
    return { webhookSiri: await this.sirOku(id) };
  }

  async kaldir(id: string, userId: string): Promise<{ success: true }> {
    await this.baglantiyiAl(id, userId);
    // Satır silinmez: stok hareketlerinin kaynağı olarak kalır. Anahtar özeti
    // rastgele bir değere çevrilir ki eski anahtar hiçbir koşulda geri gelmesin.
    const { error } = await this.db
      .from("web_sitesi_baglantilari")
      .update({ durum: "kaldirildi", webhook_adresi: null, anahtar_ozeti: anahtarOzeti(randomBytes(32).toString("hex")) })
      .eq("id", id);
    if (error) throw error;
    await this.db.from("web_sitesi_kuyrugu").delete().eq("baglanti_id", id);
    return { success: true };
  }

  /** "Tüm ürünleri yeniden gönder" — site veritabanını sıfırladıysa. */
  async yenidenGonder(id: string, userId: string): Promise<WebSitesiBaglantisi> {
    const b = await this.baglantiyiAl(id, userId);
    if (!b.webhook_adresi) throw new BadRequestException(HATA_WEBHOOK_YOK);
    await this.hepsiniKuyrugaAl(b);
    return this.disaVer(b);
  }

  /** Bağlantıyı denemek için tek bir `ping` bildirimi; sonucu hemen döner. */
  async dene(id: string, userId: string): Promise<{ ok: boolean; durum?: number; hata?: string }> {
    const b = await this.baglantiyiAl(id, userId);
    if (!b.webhook_adresi) throw new BadRequestException(HATA_WEBHOOK_YOK);
    const sonuc = await this.gonder(b.webhook_adresi, await this.sirOku(b.id), "ping", { message: "Projelio bağlantı denemesi" });
    await this.sonucuYaz(b.id, sonuc);
    return sonuc;
  }

  private async sirOku(baglantiId: string): Promise<string> {
    const { data, error } = await this.db.from("web_sitesi_baglantilari").select("webhook_sir_sifreli").eq("id", baglantiId).single<any>();
    if (error) throw error;
    return sirCrypto.decrypt(data.webhook_sir_sifreli);
  }

  private async hepsiniKuyrugaAl(b: Pick<BaglantiSatiri, "id" | "organization_id">): Promise<void> {
    // Arşivdekiler de alınır: site onları daha önce almış olabilir, silindiğini öğrenmeli.
    const { data, error } = await this.db.from("products").select("id").eq("organization_id", b.organization_id).limit(10_000);
    if (error) throw error;
    const simdi = new Date().toISOString();
    const satirlar = (data ?? []).map((p: any) => ({
      baglanti_id: b.id,
      product_id: p.id,
      organization_id: b.organization_id,
      eklendi_at: simdi,
      deneme: 0,
      sonraki_deneme_at: simdi,
      son_hata: null,
    }));
    for (let i = 0; i < satirlar.length; i += 500) {
      const { error: e } = await this.db.from("web_sitesi_kuyrugu").upsert(satirlar.slice(i, i + 500), { onConflict: "baglanti_id,product_id" });
      if (e) throw e;
    }
  }

  // ============================================================ Site API (anahtar)

  /** Anahtarı bağlantıya çevirir; dakikalık tavanı uygular. */
  async siteyiBul(yetki: string | undefined): Promise<SiteKimligi> {
    const anahtar = anahtariAyikla(yetki);
    if (!anahtar) throw new UnauthorizedException("Missing or invalid API key. Use `Authorization: Bearer psite_...`.");
    const { data, error } = await this.db
      .from("web_sitesi_baglantilari")
      .select("id, organization_id")
      .eq("anahtar_ozeti", anahtarOzeti(anahtar))
      .eq("durum", "aktif")
      .maybeSingle<any>();
    if (error) throw error;
    if (!data) throw new UnauthorizedException("Missing or invalid API key. Use `Authorization: Bearer psite_...`.");

    const dakika = Math.floor(Date.now() / 60_000);
    const s = this.sayac.get(data.id);
    if (!s || s.dakika !== dakika) this.sayac.set(data.id, { dakika, adet: 1 });
    else if (++s.adet > DAKIKALIK_TAVAN) {
      throw new HttpException(`Rate limit: at most ${DAKIKALIK_TAVAN} requests per minute.`, HttpStatus.TOO_MANY_REQUESTS);
    }
    // Son istek zamanı dakikada bir yazılır; her istekte yazmak gereksiz yük.
    if ((this.sonIstekYazildi.get(data.id) ?? 0) !== dakika) {
      this.sonIstekYazildi.set(data.id, dakika);
      void this.db.from("web_sitesi_baglantilari").update({ son_istek_at: new Date().toISOString() }).eq("id", data.id).then(
        () => undefined,
        () => undefined
      );
    }
    return { baglantiId: data.id, organizationId: data.organization_id };
  }

  private async gorselleriOku(urunIdleri: string[]): Promise<Map<string, { url: string; sort_order: number }[]>> {
    const m = new Map<string, { url: string; sort_order: number }[]>();
    if (urunIdleri.length === 0) return m;
    const { data, error } = await this.db.from("product_images").select("product_id, url, sort_order").in("product_id", urunIdleri);
    if (error) throw error;
    for (const g of data ?? []) {
      const liste = m.get((g as any).product_id) ?? [];
      liste.push(g as any);
      m.set((g as any).product_id, liste);
    }
    return m;
  }

  async urunler(
    site: SiteKimligi,
    sorgu: { page?: string; per_page?: string; sku?: string; category?: string }
  ): Promise<{ data: SiteUrunu[]; page: number; per_page: number; has_more: boolean }> {
    const sayfa = Math.max(1, Math.floor(Number(sorgu.page) || 1));
    const adet = Math.min(SAYFA_AZAMI, Math.max(1, Math.floor(Number(sorgu.per_page) || SAYFA_VARSAYILAN)));
    let q = this.db
      .from("products")
      .select("*")
      .eq("organization_id", site.organizationId)
      .is("archived_at", null)
      .eq("status", "active")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      // Bir fazlası: sonraki sayfa var mı, ayrı sayım sorgusu atmadan.
      .range((sayfa - 1) * adet, sayfa * adet);
    if (typeof sorgu.sku === "string" && sorgu.sku.trim()) q = q.eq("sku", sorgu.sku.trim());
    if (typeof sorgu.category === "string" && sorgu.category.trim()) q = q.eq("category", sorgu.category.trim());
    const { data, error } = await q;
    if (error) throw error;
    const satirlar = (data ?? []).slice(0, adet);
    const gorseller = await this.gorselleriOku(satirlar.map((r: any) => r.id));
    return {
      data: satirlar.map((r: any) => siteUrunu(r, gorseller.get(r.id))),
      page: sayfa,
      per_page: adet,
      has_more: (data ?? []).length > adet,
    };
  }

  /** `ref` ürün kimliği ya da stok kodu (SKU). */
  async urun(site: SiteKimligi, ref: string): Promise<SiteUrunu> {
    let q = this.db.from("products").select("*").eq("organization_id", site.organizationId);
    q = uuidMi(ref) ? q.eq("id", ref) : q.eq("sku", ref);
    const { data, error } = await q.is("archived_at", null).limit(1).maybeSingle<any>();
    if (error) throw error;
    if (!data || !sitedeGorunur(data)) throw new NotFoundException("Product not found.");
    const gorseller = await this.gorselleriOku([data.id]);
    return siteUrunu(data, gorseller.get(data.id));
  }

  /**
   * Satış ya da iade. Tek işlemde (veritabanı fonksiyonu): ya bütün kalemler
   * işlenir ya hiçbiri. Aynı `reference` + `type` ikinci kez gelirse stok
   * yeniden düşmez, `applied: false` döner — site ağ hatasında güvenle
   * yeniden deneyebilsin.
   */
  async stokHareketi(site: SiteKimligi, govde: unknown) {
    const cozum = stokIstegiCoz(govde);
    if ("hata" in cozum) throw new BadRequestException(cozum.hata);
    const { istek } = cozum;

    const skular = istek.kalemler.filter((k) => k.sku).map((k) => k.sku!);
    const idler = istek.kalemler.filter((k) => k.productId).map((k) => k.productId!);
    const bulunan = new Map<string, { id: string; sku: string | null }>();
    if (skular.length) {
      // Arşivdeki ürün de bulunur: sitede satılmış bir ürün sonradan
      // arşivlendiyse iadesi yine de stoğa dönmeli.
      const { data, error } = await this.db.from("products").select("id, sku").eq("organization_id", site.organizationId).in("sku", skular);
      if (error) throw error;
      for (const p of data ?? []) bulunan.set("sku:" + (p as any).sku, p as any);
    }
    if (idler.length) {
      const { data, error } = await this.db.from("products").select("id, sku").eq("organization_id", site.organizationId).in("id", idler);
      if (error) throw error;
      for (const p of data ?? []) bulunan.set("id:" + (p as any).id, p as any);
    }

    const eksik: string[] = [];
    const urunBazinda = new Map<string, { id: string; sku: string | null; miktar: number }>();
    for (const k of istek.kalemler) {
      const p = bulunan.get(k.sku ? "sku:" + k.sku : "id:" + k.productId);
      if (!p) {
        eksik.push(k.sku ?? k.productId!);
        continue;
      }
      // Aynı ürün bir satırda SKU, diğerinde kimlikle gelmiş olabilir.
      const o = urunBazinda.get(p.id);
      if (o) o.miktar = Math.round((o.miktar + k.miktar) * 100) / 100;
      else urunBazinda.set(p.id, { ...p, miktar: k.miktar });
    }
    if (eksik.length) {
      throw new UnprocessableEntityException({ message: "Some products were not found.", not_found: eksik });
    }

    const kalemler = [...urunBazinda.values()];
    const { data, error } = await this.db.rpc("web_sitesi_stok_isle", {
      p_baglanti: site.baglantiId,
      p_referans: istek.referans,
      p_tur: istek.tur,
      p_kalemler: kalemler.map((k) => ({ product_id: k.id, miktar: k.miktar })),
    });
    if (error) {
      this.logger.error(`Web sitesi stok hareketi düştü (${site.baglantiId}): ${error.message}`);
      throw error;
    }
    const sonuc = new Map<string, any>((Array.isArray(data) ? data : []).map((r: any) => [r.product_id, r]));
    return {
      reference: istek.referans,
      type: istek.tur === "iade" ? "return" : "sale",
      items: kalemler.map((k) => {
        const r = sonuc.get(k.id);
        return {
          product_id: k.id,
          sku: k.sku,
          quantity: k.miktar,
          stock: r?.stok === null || r?.stok === undefined ? null : Number(r.stok),
          applied: r?.yeni === true,
        };
      }),
    };
  }

  // ============================================================ Giden bildirimler

  /**
   * Kuyruktan bir tur. Ürünün SON hâli okunur (kuyruk yalnızca "bu ürün
   * değişti" der); görünürse product.updated, değilse product.deleted.
   */
  async kuyruguIsle(): Promise<{ gonderildi: number; hata: number; birakildi: number }> {
    const sonuc = { gonderildi: 0, hata: 0, birakildi: 0 };
    const { data: satirlar, error } = await this.db
      .from("web_sitesi_kuyrugu")
      .select("baglanti_id, product_id, eklendi_at, deneme")
      .lte("sonraki_deneme_at", new Date().toISOString())
      .order("sonraki_deneme_at", { ascending: true })
      .limit(KUYRUK_TURU);
    if (error) throw error;
    if (!satirlar?.length) return sonuc;

    const baglantiIdleri = [...new Set(satirlar.map((s: any) => s.baglanti_id))];
    const { data: baglantilar } = await this.db
      .from("web_sitesi_baglantilari")
      .select("id, webhook_adresi, webhook_sir_sifreli, durum")
      .in("id", baglantiIdleri);
    const bMap = new Map((baglantilar ?? []).map((b: any) => [b.id, b]));

    const urunIdleri = [...new Set(satirlar.map((s: any) => s.product_id))];
    const { data: urunler } = await this.db.from("products").select("*").in("id", urunIdleri);
    const uMap = new Map((urunler ?? []).map((u: any) => [u.id, u]));
    const gorseller = await this.gorselleriOku(urunIdleri);

    // Bir sitenin adresi ölüyse aynı turda ona 50 kez çarpmayalım.
    const dusenSiteler = new Map<string, string>();
    const ulasilanSiteler = new Set<string>();

    for (const s of satirlar as any[]) {
      const b = bMap.get(s.baglanti_id);
      if (!b || b.durum !== "aktif" || !b.webhook_adresi) {
        await this.kuyruktanSil(s);
        continue;
      }
      if (dusenSiteler.has(b.id)) continue;
      const u = uMap.get(s.product_id);
      const olay = sitedeGorunur(u) ? "product.updated" : "product.deleted";
      const veri = olay === "product.updated" ? { product: siteUrunu(u, gorseller.get(u.id)) } : { product: { id: s.product_id, sku: u?.sku ?? null } };

      let gonderim: { ok: boolean; durum?: number; hata?: string };
      try {
        gonderim = await this.gonder(b.webhook_adresi, sirCrypto.decrypt(b.webhook_sir_sifreli), olay, veri);
      } catch (err) {
        gonderim = { ok: false, hata: (err as Error).message };
      }

      if (gonderim.ok) {
        await this.kuyruktanSil(s);
        ulasilanSiteler.add(b.id);
        sonuc.gonderildi++;
        continue;
      }
      dusenSiteler.set(b.id, gonderim.hata ?? "Bilinmeyen hata");
      const deneme = (s.deneme ?? 0) + 1;
      if (deneme >= AZAMI_DENEME) {
        await this.kuyruktanSil(s);
        sonuc.birakildi++;
      } else {
        await this.db
          .from("web_sitesi_kuyrugu")
          .update({ deneme, sonraki_deneme_at: new Date(Date.now() + sonrakiDenemeGecikmesiMs(deneme)).toISOString(), son_hata: gonderim.hata ?? null })
          .eq("baglanti_id", s.baglanti_id)
          .eq("product_id", s.product_id)
          .eq("eklendi_at", s.eklendi_at);
        sonuc.hata++;
      }
    }

    // Kartta "son bildirim" ve "son hata" doğru görünsün.
    for (const id of baglantiIdleri) {
      if (!bMap.get(id)) continue;
      const hata = dusenSiteler.get(id);
      if (hata) await this.sonucuYaz(id, { ok: false, hata });
      else if (ulasilanSiteler.has(id)) await this.sonucuYaz(id, { ok: true });
    }
    return sonuc;
  }

  /**
   * Gönderim sürerken ürün yeniden değiştiyse tetikleyici `eklendi_at`'i
   * tazelemiştir; o satır SİLİNMEZ ki yeni hâl de gönderilsin.
   */
  private async kuyruktanSil(s: { baglanti_id: string; product_id: string; eklendi_at: string }): Promise<void> {
    await this.db
      .from("web_sitesi_kuyrugu")
      .delete()
      .eq("baglanti_id", s.baglanti_id)
      .eq("product_id", s.product_id)
      .eq("eklendi_at", s.eklendi_at);
  }

  private async sonucuYaz(baglantiId: string, r: { ok: boolean; hata?: string }): Promise<void> {
    const simdi = new Date().toISOString();
    await this.db
      .from("web_sitesi_baglantilari")
      .update(r.ok ? { son_bildirim_at: simdi, son_hata: null, son_hata_at: null } : { son_hata: (r.hata ?? "").slice(0, 300), son_hata_at: simdi })
      .eq("id", baglantiId);
  }

  /**
   * İmzalı POST. Ad çözülür ve özel ağa düşüyorsa GÖNDERİLMEZ (SSRF, bkz.
   * webhookAdresiCoz). Yönlendirme izlenmez: genel bir adres 302 ile iç ağa
   * yönlendirebilirdi.
   */
  private async gonder(adres: string, sir: string, olay: string, veri: unknown): Promise<{ ok: boolean; durum?: number; hata?: string }> {
    const u = new URL(adres);
    const host = u.hostname.replace(/^\[|\]$/g, "");
    let ipler: { address: string }[];
    try {
      ipler = await lookup(host, { all: true });
    } catch {
      return { ok: false, hata: `Adres çözülemedi: ${host}` };
    }
    if (!ipler.length || ipler.some((i) => ipOzelMi(i.address))) {
      return { ok: false, hata: "Bildirim adresi özel bir ağa çıkıyor; gönderilmedi" };
    }

    const zaman = Math.floor(Date.now() / 1000);
    const govde = JSON.stringify({ event: olay, sent_at: new Date(zaman * 1000).toISOString(), data: veri });
    try {
      const res = await fetchWithTimeout(
        adres,
        {
          method: "POST",
          redirect: "manual",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "Projelio-Webhook/1",
            "X-Projelio-Event": olay,
            "X-Projelio-Timestamp": String(zaman),
            "X-Projelio-Signature": bildirimImzasi(sir, zaman, govde),
          },
          body: govde,
        },
        BILDIRIM_ZAMAN_ASIMI_MS
      );
      // Gövde okunmaz ama akış kapatılmalı, yoksa bağlantı havuzda asılı kalır.
      await res.body?.cancel().catch(() => undefined);
      if (res.status >= 200 && res.status < 300) return { ok: true, durum: res.status };
      return { ok: false, durum: res.status, hata: `Site ${res.status} yanıtı verdi` };
    } catch (err) {
      return { ok: false, hata: (err as Error).message.slice(0, 200) };
    }
  }
}
