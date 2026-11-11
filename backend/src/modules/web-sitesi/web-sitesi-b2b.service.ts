import { BadRequestException, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { iskontoluFiyat, kalemTutariKurus, MUSTERI_MODUL_KEY } from "@projelio/shared";
import type { MusteriPortalOzeti, Party, PortalKullanicisi } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { ModuleMembersService } from "../module-members/module-members.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PartyService } from "../party/party.service";
import { SiparisService, type KalemSatiri } from "../party/siparis.service";
import {
  epostaCoz,
  portalYetkileriCoz,
  siparisDisKimligi,
  siparisIstegiCoz,
  siteMusterisi,
  sitePortalKullanicisi,
  siteSiparisi,
  sitedeGorunur,
  uuidMi,
} from "./web-sitesi-esleme";
import { WebSitesiProcessor } from "./web-sitesi.processor";
import { WebSitesiService, type SiteKimligi } from "./web-sitesi.service";

// dil:anahtar-baslangic — istisna mesajları (sözlük: common/i18n/en/hatalar.ts)
const HATA_PORTAL_BAGLANTI = "Bu müşterinin şirketinde etkin bir web sitesi bağlantısı yok";
const HATA_PORTAL_EPOSTA = "Geçerli bir e-posta adresi girin";
const HATA_PORTAL_YETKI = "Portal yetkileri geçersiz";
const HATA_PORTAL_AD = "Ad en çok 120 karakter olabilir";
const HATA_PORTAL_CIFT = "Bu e-posta bu portalda zaten açık bir hesaba bağlı";
const HATA_PORTAL_YOK = "Portal kullanıcısı bulunamadı";
const HATA_PORTAL_DURUM = "Portal kullanıcısının durumu geçersiz";
// dil:anahtar-bitis

// Sitenin geliştiricisine giden İngilizce API metinleri (bkz. web-sitesi.service.ts).
// dil:atla-baslangic
const API_HATA_MUSTERI_YOK = "Customer not found.";
const API_HATA_MUSTERI_PASIF = "This customer is not active; orders are not accepted.";
const API_HATA_PORTAL = "`portal_user_id` is not an active portal user of this customer with the `siparis_ver` permission.";
const API_HATA_URUN = (ref: string) => `Product not found or not for sale: ${ref}`;
const API_HATA_FIYAT = (ref: string) => `Product has no price: ${ref}`;
const API_HATA_PARA = "All items must be in the same currency.";
// dil:atla-bitis

const PORTAL_SUTUNLARI = "id, baglanti_id, organization_id, party_id, eposta, ad, yetkiler, durum, created_at, kapatildi_at";

/** Türkiye takvim günü (sipariş tarihi). Sunucu UTC'de; gece 00-03 arası dünü yazmasın. */
function bugunTr(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
}

/**
 * B2B sipariş portalı (migration 187 + 188). Web sitesi bağlantısının üstüne:
 *
 *   · GET  /v1/site/customers/:id           müşterinin portala giden hâli (beyaz liste)
 *   · GET  /v1/site/customers/:id/orders    sipariş geçmişi (tahsilat YOK)
 *   · POST /v1/site/orders                  sipariş — fiyat SUNUCUDA hesaplanır
 *   · GET  /v1/site/portal-users            portalın kullanıcı listesini eşitlemesi için
 *   · müşteri kartında portal kullanıcısı aç / düzenle / kapat (JWT)
 *
 * Sipariş geldiğinde stok DÜŞMEZ: "alındı" aşamasında açılır, Projelio'da
 * onaylanınca düşer (siparis_asama_uygula, 187). Projelio şifre tutmaz;
 * portal kullanıcısının açılışı portala imzalı webhook'la gider.
 */
@Injectable()
export class WebSitesiB2bService {
  constructor(
    private supabase: SupabaseService,
    private site: WebSitesiService,
    private partyService: PartyService,
    private siparisler: SiparisService,
    private processor: WebSitesiProcessor,
    private moduleMembers: ModuleMembersService,
    private notifications: NotificationsService
  ) {}

  private get db() {
    return this.supabase.client;
  }

  // ============================================================ Site API

  async musteri(s: SiteKimligi, id: string) {
    return siteMusterisi(await this.site.siteMusterisiniBul(s, id));
  }

  async musterininSiparisleri(s: SiteKimligi, id: string) {
    const m = await this.site.siteMusterisiniBul(s, id);
    const liste = await this.siparisler.musterininSiparisleriIc(m.id);
    const skular = await this.site.skulariOku(...liste);
    return { data: liste.map((x) => siteSiparisi(x, skular)) };
  }

  async portalKullanicilari(s: SiteKimligi, musteriId?: string) {
    let q = this.db.from("web_sitesi_portal_kullanicilari").select(PORTAL_SUTUNLARI).eq("baglanti_id", s.baglantiId);
    if (musteriId !== undefined && musteriId !== "") {
      if (!uuidMi(musteriId)) throw new NotFoundException(API_HATA_MUSTERI_YOK);
      q = q.eq("party_id", musteriId);
    }
    const { data, error } = await q.order("created_at", { ascending: true }).limit(2000);
    if (error) throw error;
    return { data: (data ?? []).map(sitePortalKullanicisi) };
  }

  /**
   * Sipariş. Kural sırası önemli: önce HER şey doğrulanır, sonra yazılır —
   * bir kalem bile geçersizse hiçbir şey yazılmaz. Aynı referans ikinci kez
   * gelirse mevcut sipariş döner (ağ kopup site yeniden denerse çift sipariş olmasın).
   */
  async siparisVer(s: SiteKimligi, govde: unknown): Promise<{ created: boolean; order: ReturnType<typeof siteSiparisi> }> {
    const c = siparisIstegiCoz(govde);
    if ("hata" in c) throw new BadRequestException(c.hata);
    const istek = c.istek;
    const disKimlik = siparisDisKimligi(s.baglantiId, istek.referans);

    // Tekrar: doğrulamadan ÖNCE — müşteri sonradan pasife alınmış olsa da
    // ilk istekte açılan sipariş geri dönmeli.
    const mevcut = await this.mevcutSiparis(s, disKimlik);
    if (mevcut) return { created: false, order: mevcut };

    const musteriRow = await this.site.siteMusterisiniBul(s, istek.musteriId);
    if ((musteriRow.status ?? "active") !== "active") throw new UnprocessableEntityException(API_HATA_MUSTERI_PASIF);
    if (istek.portalKullaniciId) await this.portalKullanicisiDogrula(s, istek.portalKullaniciId, musteriRow.id);

    const urunler = await this.urunleriCoz(s, istek.kalemler);
    const iskonto = musteriRow.iskonto_orani === null ? null : Number(musteriRow.iskonto_orani);
    const paralar = new Set(urunler.map((u) => (u.row.currency as string | null) ?? "TRY"));
    if (paralar.size > 1) throw new UnprocessableEntityException(API_HATA_PARA);

    const kalemler: KalemSatiri[] = urunler.map((u, i) => {
      const f = iskontoluFiyat(u.row.price === null ? null : Number(u.row.price), iskonto, u.row.tax_rate === null ? null : Number(u.row.tax_rate));
      if (!f) throw new UnprocessableEntityException(API_HATA_FIYAT(u.ref));
      return {
        product_id: u.row.id,
        aciklama: null,
        miktar: u.miktar,
        birim: u.row.unit ?? null,
        // Sipariş kalemleri KDV DAHİL (168): tahsilat gelen parayla eşleşsin.
        birim_fiyat: f.kdvDahil,
        liste_birim_fiyat: f.listeKdvDahil,
        tutar: kalemTutariKurus(f.kdvDahil, u.miktar),
        sira: i,
      };
    });

    const kanal = await this.kanaliHazirla(s);
    const party = await this.partyService.findOne(musteriRow.id);
    const { siparis, yeni } = await this.siparisler.webSiparisiYaz({
      party,
      disKimlik,
      baglantiId: s.baglantiId,
      kanalId: kanal.id,
      portalKullaniciId: istek.portalKullaniciId,
      alanlar: {
        siparis_no: istek.referans,
        notlar: istek.not,
        siparis_tarihi: bugunTr(),
        para_birimi: [...paralar][0] ?? "TRY",
        vade_gun: kanal.vadeGun,
        odeme_yontemi: kanal.odemeYontemi,
      },
      kalemler,
      aktorId: null,
    });
    if (yeni) void this.siparisiHaberVer(party, siparis).catch(() => undefined);
    return { created: yeni, order: siteSiparisi(siparis, await this.site.skulariOku(siparis)) };
  }

  /**
   * Portaldan gelen siparişi şirkette haber ver: müşterinin sorumlusu + müşteri
   * defterini yönetebilenler (sahip, departman/modül yöneticileri). Sipariş
   * "alındı" aşamasında bekliyor ve stok ancak onayda düşüyor — kimse fark
   * etmezse sipariş orada unutulur. Bildirim siparişi BEKLETMEZ: portal
   * yanıtını almadan önce bir bildirim hatası siparişi düşürmemeli.
   */
  private async siparisiHaberVer(party: Party, siparis: { id: string; siparisNo?: string; tutar: number; paraBirimi: string }): Promise<void> {
    if (!party.organizationId) return;
    const { kisiler, departmentId } = await this.moduleMembers.organizasyonYoneticileri(party.organizationId, MUSTERI_MODUL_KEY);
    const alicilar = new Set(kisiler);
    if (party.ownerUserId) alicilar.add(party.ownerUserId);
    // Bildirime basınca modülün Tahsilat sekmesi o sipariş açık gelir; önceden
    // modülün açılış sekmesine (çoğu zaman Müşteriler) düşüp siparişi
    // aratıyordu (kullanıcı isteği, 2026-11-11). Parametreler: CustomersPanel.
    const link = departmentId ? siparisBildirimBaglantisi(departmentId, siparis.id) : undefined;
    const tutar = `${siparis.tutar.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${siparis.paraBirimi}`;
    for (const userId of alicilar) {
      this.notifications.notifyUserSafe(
        userId,
        "web_order_received",
        { metin: "{musteri} portaldan sipariş verdi", params: { musteri: party.displayName } },
        siparis.siparisNo
          ? { metin: "{no} · {tutar} — onay bekliyor", params: { no: siparis.siparisNo, tutar } }
          : { metin: "{tutar} — onay bekliyor", params: { tutar } },
        link
      );
    }
  }

  private async mevcutSiparis(s: SiteKimligi, disKimlik: string) {
    const { data, error } = await this.db
      .from("musteri_siparisleri")
      .select("id")
      .eq("kaynak", "web_sitesi")
      .eq("dis_kimlik", disKimlik)
      .eq("organization_id", s.organizationId)
      .maybeSingle<{ id: string }>();
    if (error) throw error;
    if (!data) return null;
    const siparis = await this.siparisler.tekilIc(data.id);
    return siparis ? siteSiparisi(siparis, await this.site.skulariOku(siparis)) : null;
  }

  private async portalKullanicisiDogrula(s: SiteKimligi, id: string, partyId: string): Promise<void> {
    const { data } = await this.db
      .from("web_sitesi_portal_kullanicilari")
      .select("party_id, durum, yetkiler")
      .eq("id", id)
      .eq("baglanti_id", s.baglantiId)
      .maybeSingle<any>();
    if (!data || data.party_id !== partyId || data.durum !== "aktif" || !(data.yetkiler ?? []).includes("siparis_ver")) {
      throw new UnprocessableEntityException(API_HATA_PORTAL);
    }
  }

  /** Kalemlerin ürünleri: şirketin, satışta (arşivde değil, aktif). Sırası istekteki gibi. */
  private async urunleriCoz(
    s: SiteKimligi,
    kalemler: { sku?: string; productId?: string; miktar: number }[]
  ): Promise<{ row: any; miktar: number; ref: string }[]> {
    const idler = kalemler.map((k) => k.productId).filter((x): x is string => !!x);
    const skular = kalemler.map((k) => k.sku).filter((x): x is string => !!x);
    const satirlar: any[] = [];
    const secim = "id, sku, name, price, currency, tax_rate, unit, status, archived_at";
    if (idler.length) {
      const { data, error } = await this.db.from("products").select(secim).eq("organization_id", s.organizationId).in("id", idler);
      if (error) throw error;
      satirlar.push(...(data ?? []));
    }
    if (skular.length) {
      const { data, error } = await this.db
        .from("products")
        .select(secim)
        .eq("organization_id", s.organizationId)
        .is("archived_at", null)
        .in("sku", skular);
      if (error) throw error;
      satirlar.push(...(data ?? []));
    }
    const idIle = new Map(satirlar.map((r) => [r.id, r]));
    const skuIle = new Map<string, any>();
    for (const r of satirlar) if (r.sku && !r.archived_at && !skuIle.has(r.sku)) skuIle.set(r.sku, r);

    // Aynı ürün hem kimlikle hem stok koduyla gelirse tek kaleme toplanır
    // (stok bildiriminde de böyle; stoğa düşen miktar siparişle ayrışmasın).
    const sonuc = new Map<string, { row: any; miktar: number; ref: string }>();
    for (const k of kalemler) {
      const ref = k.productId ?? k.sku ?? "";
      const row = k.productId ? idIle.get(k.productId) : skuIle.get(k.sku!);
      if (!row || !sitedeGorunur(row)) throw new UnprocessableEntityException(API_HATA_URUN(ref));
      const onceki = sonuc.get(row.id);
      if (onceki) onceki.miktar = Math.round((onceki.miktar + k.miktar) * 100) / 100;
      else sonuc.set(row.id, { row, miktar: k.miktar, ref });
    }
    return [...sonuc.values()];
  }

  /**
   * Bağlantının satış kanalı ("Web sitesi: <ad>"). İlk siparişte açılır;
   * kullanıcı kanalın vadesini/ödeme yöntemini Müşteriler'den değiştirebilir,
   * sonraki siparişler onu kullanır.
   */
  private async kanaliHazirla(s: SiteKimligi): Promise<{ id: string; vadeGun: number; odemeYontemi: string }> {
    const { data: b, error } = await this.db
      .from("web_sitesi_baglantilari")
      .select("ad, kanal_id")
      .eq("id", s.baglantiId)
      .single<{ ad: string; kanal_id: string | null }>();
    if (error) throw error;
    const oku = async (q: any) => {
      const { data } = await q.maybeSingle();
      return data as { id: string; varsayilan_vade_gun: number; varsayilan_odeme_yontemi: string } | null;
    };
    const secim = "id, varsayilan_vade_gun, varsayilan_odeme_yontemi";
    let k = b.kanal_id
      ? await oku(this.db.from("satis_kanallari").select(secim).eq("id", b.kanal_id).eq("organization_id", s.organizationId))
      : null;
    if (!k) {
      const ad = `Web sitesi: ${b.ad}`.slice(0, 120);
      const { data: yeni, error: e2 } = await this.db
        .from("satis_kanallari")
        .insert({ organization_id: s.organizationId, ad, tur: "web" })
        .select(secim)
        .single();
      if (e2 && (e2 as any).code !== "23505") throw e2;
      // Aynı adlı kanal zaten var (elle açılmış ya da eşzamanlı ilk sipariş): onu kullan.
      k = (yeni as any) ?? (await oku(this.db.from("satis_kanallari").select(secim).eq("organization_id", s.organizationId).ilike("ad", ad)));
      if (!k) throw e2 ?? new Error("Kanal açılamadı");
      await this.db.from("web_sitesi_baglantilari").update({ kanal_id: k.id }).eq("id", s.baglantiId);
    }
    return { id: k.id, vadeGun: k.varsayilan_vade_gun ?? 0, odemeYontemi: k.varsayilan_odeme_yontemi ?? "havale" };
  }

  // ============================================================ Müşteri kartı (JWT)

  /** Kartın "Web portalı" bölümü. Şirkette etkin bağlantı yoksa bölüm görünmez. */
  async ozet(partyId: string, userId: string): Promise<MusteriPortalOzeti> {
    const party = await this.partyService.kayitYetkisi(partyId, userId, false);
    const baglantilar = await this.etkinBaglantilar(party);
    if (!baglantilar.length) return { baglantilar: [], kullanicilar: [], yazabilir: false };
    const yazabilir = await this.partyService
      .kayitYetkisi(partyId, userId, true)
      .then(() => true)
      .catch(() => false);
    const { data, error } = await this.db
      .from("web_sitesi_portal_kullanicilari")
      .select(PORTAL_SUTUNLARI)
      .eq("party_id", partyId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    const adlar = new Map(baglantilar.map((b) => [b.id, b.ad]));
    return {
      baglantilar,
      kullanicilar: (data ?? []).filter((r: any) => adlar.has(r.baglanti_id)).map((r: any) => this.map(r, adlar)),
      yazabilir,
    };
  }

  async kullaniciAc(
    partyId: string,
    userId: string,
    body: { baglantiId?: string; eposta?: unknown; ad?: unknown; yetkiler?: unknown }
  ): Promise<PortalKullanicisi> {
    const party = await this.partyService.kayitYetkisi(partyId, userId, true);
    const baglantilar = await this.etkinBaglantilar(party);
    const baglanti = body.baglantiId ? baglantilar.find((b) => b.id === body.baglantiId) : baglantilar[0];
    if (!baglanti) throw new BadRequestException(HATA_PORTAL_BAGLANTI);
    const eposta = epostaCoz(body.eposta);
    if (!eposta) throw new BadRequestException(HATA_PORTAL_EPOSTA);
    const yetkiler = body.yetkiler === undefined ? undefined : portalYetkileriCoz(body.yetkiler);
    if (yetkiler === null) throw new BadRequestException(HATA_PORTAL_YETKI);
    const { data, error } = await this.db
      .from("web_sitesi_portal_kullanicilari")
      .insert({
        baglanti_id: baglanti.id,
        organization_id: party.organizationId,
        party_id: party.id,
        eposta,
        ad: this.adCoz(body.ad) ?? null,
        ...(yetkiler ? { yetkiler } : {}),
        olusturan: userId,
      })
      .select(PORTAL_SUTUNLARI)
      .single();
    if (error) {
      if ((error as any).code === "23505") throw new BadRequestException(HATA_PORTAL_CIFT);
      throw error;
    }
    await this.partyService.logActivity(party.id, "sistem", `Portal hesabı açıldı: ${eposta}`, userId).catch(() => undefined);
    this.processor.tetikle();
    return this.map(data, new Map(baglantilar.map((b) => [b.id, b.ad])));
  }

  /** Ad, yetkiler ya da durum (aktif/kapali). E-posta değişmez: portalda hesabın kimliği o. */
  async kullaniciGuncelle(
    id: string,
    userId: string,
    body: { ad?: unknown; yetkiler?: unknown; durum?: unknown }
  ): Promise<PortalKullanicisi> {
    if (!uuidMi(id)) throw new NotFoundException(HATA_PORTAL_YOK);
    const { data: mevcut } = await this.db.from("web_sitesi_portal_kullanicilari").select(PORTAL_SUTUNLARI).eq("id", id).maybeSingle<any>();
    if (!mevcut) throw new NotFoundException(HATA_PORTAL_YOK);
    const party = await this.partyService.kayitYetkisi(mevcut.party_id, userId, true);
    const baglantilar = await this.etkinBaglantilar(party);

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.ad !== undefined) patch.ad = this.adCoz(body.ad) ?? null;
    if (body.yetkiler !== undefined) {
      const y = portalYetkileriCoz(body.yetkiler);
      if (y === null) throw new BadRequestException(HATA_PORTAL_YETKI);
      patch.yetkiler = y;
    }
    if (body.durum !== undefined) {
      if (body.durum !== "aktif" && body.durum !== "kapali") throw new BadRequestException(HATA_PORTAL_DURUM);
      patch.durum = body.durum;
      patch.kapatildi_at = body.durum === "kapali" ? (mevcut.kapatildi_at ?? new Date().toISOString()) : null;
    }
    const { data, error } = await this.db.from("web_sitesi_portal_kullanicilari").update(patch).eq("id", id).select(PORTAL_SUTUNLARI).single();
    if (error) {
      if ((error as any).code === "23505") throw new BadRequestException(HATA_PORTAL_CIFT);
      throw error;
    }
    if (patch.durum && patch.durum !== mevcut.durum) {
      const metin = patch.durum === "kapali" ? `Portal hesabı kapatıldı: ${mevcut.eposta}` : `Portal hesabı yeniden açıldı: ${mevcut.eposta}`;
      await this.partyService.logActivity(party.id, "sistem", metin, userId).catch(() => undefined);
    }
    this.processor.tetikle();
    return this.map(data, new Map(baglantilar.map((b) => [b.id, b.ad])));
  }

  private adCoz(x: unknown): string | null | undefined {
    if (x === undefined) return undefined;
    if (x === null) return null;
    if (typeof x !== "string") throw new BadRequestException(HATA_PORTAL_AD);
    const t = x.trim();
    if (t.length > 120) throw new BadRequestException(HATA_PORTAL_AD);
    return t || null;
  }

  /** Müşterinin şirketindeki etkin bağlantılar. İşe bağlı (şirketsiz) müşteride portal yok. */
  private async etkinBaglantilar(party: Party): Promise<{ id: string; ad: string }[]> {
    if (!party.organizationId) return [];
    const { data, error } = await this.db
      .from("web_sitesi_baglantilari")
      .select("id, ad")
      .eq("organization_id", party.organizationId)
      .eq("durum", "aktif")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as { id: string; ad: string }[];
  }

  private map(r: any, adlar: Map<string, string>): PortalKullanicisi {
    return {
      id: r.id,
      baglantiId: r.baglanti_id,
      baglantiAdi: adlar.get(r.baglanti_id) ?? "",
      partyId: r.party_id,
      eposta: r.eposta,
      ad: r.ad ?? null,
      yetkiler: r.yetkiler ?? [],
      durum: r.durum,
      createdAt: r.created_at,
      kapatildiAt: r.kapatildi_at ?? null,
    };
  }
}

/** Sipariş bildiriminin bağlantısı: müşteri modülü, Tahsilat sekmesi, sipariş açık. */
export function siparisBildirimBaglantisi(departmentId: string, siparisId: string): string {
  return `/departments/${departmentId}/modules/${MUSTERI_MODUL_KEY}?sekme=tahsilat&siparis=${encodeURIComponent(siparisId)}`;
}
