import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  ODEME_YONTEMLERI,
  evrakliMi,
  kalanTutar,
  kalemleriOrantila,
  kalemToplami,
  kalemTutari,
  kdvDahilFiyat,
  tahsilatTutariHatasi,
  tahsilEdilen,
  type MusteriSiparisi,
  type MusteriSiparisListesi,
  type MusteriTahsilati,
  type OdemeYontemi,
  type Party,
  type SatisKanali,
  type SiparisKalemi,
  MUSTERI_MODUL_KEY,
} from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { paraBirimiDogrula, requireAmount, requireOneOf } from "../../common/validation/input";
import { tumSayfalar } from "../../common/liste-tavani";
import { hataMetni } from "../../common/i18n/index";
import { PartyService, type PartyScope } from "./party.service";
import { musteriYetkisi } from "./siparis-erisim";
import { SatisKanallariService } from "./satis-kanallari.service";

/**
 * Müşteri siparişleri ve tahsilatları.
 *
 * Yetki müşteri kartından gelir: yönetici hepsini, çalışan kendisine atanan
 * müşterinin siparişlerini görür ve tahsilatını girer (bkz. siparis-erisim.ts).
 * Siparişin kendi sorumlusu YOK — müşteri devredilince açık alacak da gider.
 *
 * Her tahsilat şirketin defterine TEK bir gelir satırı yazar
 * (source='tahsilat', bkz. migration 128). Tahsilat silinince satır
 * veritabanında cascade ile gider; defterden elle silinemez.
 */

/** Saat dilimi: gün sınırı İstanbul'a göre (bkz. worklog.service.ts'teki aynı gerekçe). */
const SAAT_DILIMI = process.env.TZ?.trim() || "Europe/Istanbul";

function bugun(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: SAAT_DILIMI }).format(new Date());
}

/**
 * Mesaj alan adıyla birlikte TAM cümle olarak veriliyor: "{alan} geçerli bir
 * tarih olmalı" kalıbında alan adı parametre olarak çevrilmeden gidiyor ve
 * İngilizce kullanıcı "Tahsilat tarihi must be a valid date" görürdü.
 */
// dil:anahtar-baslangic — istisna mesajları (sözlük: common/i18n/en/hatalar.ts)
const HATA_SIPARIS_TARIHI = "Sipariş tarihi geçerli bir tarih olmalı";
const HATA_TAHSILAT_TARIHI = "Tahsilat tarihi geçerli bir tarih olmalı";
const HATA_EVRAK_VADESI = "Evrak vadesi geçerli bir tarih olmalı";
// dil:anahtar-bitis

function tarihDogrula(value: unknown, hata: string): string {
  const s = typeof value === "string" ? value.slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) {
    throw new BadRequestException(hata);
  }
  return s;
}

function metin(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// Siparişte products'a giden İKİ yol var (eski product_id sütunu ve kalemler);
// kalem gömmesi kendi tablosundan gittiği için belirsizlik yok.
const SIPARIS_SECIM =
  "*, tahsilatlar:musteri_tahsilatlari(*), party:party(display_name, owner_user_id), " +
  "kanal:satis_kanallari(ad, sorumlu_user_id), " +
  "kalemler:musteri_siparis_kalemleri(*, urun:products(name)), " +
  "fatura:module_records!invoice_record_id(id, data)";

function mapKalem(row: any): SiparisKalemi {
  return {
    id: row.id,
    productId: row.product_id ?? undefined,
    productName: row.urun?.name ?? undefined,
    aciklama: row.aciklama ?? undefined,
    miktar: Number(row.miktar),
    birim: row.birim ?? undefined,
    birimFiyat: Number(row.birim_fiyat),
    listeBirimFiyat:
      row.liste_birim_fiyat === null || row.liste_birim_fiyat === undefined ? undefined : Number(row.liste_birim_fiyat),
    tutar: Number(row.tutar),
  };
}

function mapTahsilat(row: any, adlar: Map<string, string>): MusteriTahsilati {
  return {
    id: row.id,
    siparisId: row.siparis_id,
    tutar: Number(row.tutar),
    tarih: row.tarih,
    odemeYontemi: row.odeme_yontemi,
    evrakNo: row.evrak_no ?? undefined,
    evrakVadesi: row.evrak_vadesi ?? undefined,
    notlar: row.notlar ?? undefined,
    createdBy: row.created_by ?? undefined,
    createdByName: row.created_by ? adlar.get(row.created_by) : undefined,
    createdAt: row.created_at,
  };
}

function mapSiparis(row: any, adlar: Map<string, string>): MusteriSiparisi {
  const sorumluId = siparisSorumlusu(row);
  const alici =
    row.alici_adi || row.alici_il || row.alici_ilce
      ? { ad: row.alici_adi ?? undefined, il: row.alici_il ?? undefined, ilce: row.alici_ilce ?? undefined }
      : undefined;
  return {
    id: row.id,
    partyId: row.party_id ?? undefined,
    partyName: row.party?.display_name ?? undefined,
    kanalId: row.kanal_id ?? undefined,
    kanalAdi: row.kanal?.ad ?? undefined,
    alici,
    organizationId: row.organization_id ?? undefined,
    jobId: row.job_id ?? undefined,
    siparisNo: row.siparis_no ?? undefined,
    aciklama: row.aciklama ?? undefined,
    kalemler: ((row.kalemler ?? []) as any[])
      .slice()
      .sort((a, b) => (a.sira ?? 0) - (b.sira ?? 0))
      .map(mapKalem),
    kaynak: row.kaynak ?? undefined,
    fatura: row.fatura
      ? {
          id: row.fatura.id,
          faturaNo: row.fatura.data?.invoiceNo || undefined,
          tarih: row.fatura.data?.issueDate || undefined,
        }
      : undefined,
    tutar: Number(row.tutar),
    paraBirimi: row.para_birimi,
    siparisTarihi: row.siparis_tarihi,
    vadeGun: row.vade_gun,
    vadeTarihi: row.vade_tarihi,
    odemeYontemi: row.odeme_yontemi,
    evrakNo: row.evrak_no ?? undefined,
    evrakVadesi: row.evrak_vadesi ?? undefined,
    notlar: row.notlar ?? undefined,
    sorumluId,
    sorumluAdi: sorumluId ? adlar.get(sorumluId) : undefined,
    tahsilatlar: ((row.tahsilatlar ?? []) as any[])
      .map((t) => mapTahsilat(t, adlar))
      .sort((a, b) => a.tarih.localeCompare(b.tarih) || a.createdAt.localeCompare(b.createdAt)),
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
  };
}

/**
 * Siparişin sorumlusu: müşteri kartının sahibi, müşterisiz siparişte
 * kanalın sorumlusu. Yetki ve rapor kırılımı bu tek kaynaktan.
 */
function siparisSorumlusu(row: any): string | undefined {
  if (row.party_id) return row.party?.owner_user_id ?? undefined;
  return row.kanal?.sorumlu_user_id ?? undefined;
}

export interface KalemGirdisi {
  productId?: string | null;
  aciklama?: string;
  miktar?: number | string;
  birim?: string;
  /** Verilmezse ürünün KDV dahil katalog fiyatı. */
  birimFiyat?: number | string;
}

export interface SiparisGirdisi {
  siparisNo?: string;
  aciklama?: string;
  /**
   * Siparişin satırları. Gönderilirse mevcut kalemlerin YERİNE geçer.
   * `tutar` da verilmişse kalemlere katalog fiyatı oranında dağıtılır
   * (pazarlıklı satış: toplam belli, kalem fiyatı katalogdan sapmış);
   * verilmemişse tutar kalem toplamıdır.
   */
  kalemler?: KalemGirdisi[];
  /**
   * ESKİ biçim (tek ürünlü sipariş, migration 165). Kalem gönderilmediyse
   * tek kaleme çevrilir — eski istemciler ve Lio bozulmasın.
   */
  productId?: string | null;
  miktar?: number | string | null;
  birim?: string;
  tutar?: number | string;
  /** Müşterisiz siparişin kanalı; müşterili siparişte isteğe bağlı etiket. */
  kanalId?: string | null;
  alici?: { ad?: string; il?: string; ilce?: string };
  paraBirimi?: string;
  siparisTarihi?: string;
  vadeGun?: number | string;
  odemeYontemi?: OdemeYontemi;
  evrakNo?: string;
  evrakVadesi?: string;
  notlar?: string;
}

export interface TahsilatGirdisi {
  tutar?: number | string;
  tarih?: string;
  odemeYontemi?: OdemeYontemi;
  evrakNo?: string;
  evrakVadesi?: string;
  notlar?: string;
}

/**
 * Siparişin sahibi: müşteri kartı ya da (tek seferlik alıcıda) satış kanalı.
 * Yetki, kapsam ve kasa satırının karşı tarafı buradan çıkar.
 */
type SiparisSahibi = { tur: "musteri"; party: Party } | { tur: "kanal"; kanal: SatisKanali };

/** Yazılmaya hazır kalem satırı (sütun adlarıyla). */
export interface KalemSatiri {
  product_id: string | null;
  aciklama: string | null;
  miktar: number;
  birim: string | null;
  birim_fiyat: number;
  liste_birim_fiyat: number | null;
  tutar: number;
  sira: number;
}

/** Toplu tahsilatta tek seferde işlenen en çok sipariş. */
const TOPLU_TAHSILAT_TAVANI = 500;

@Injectable()
export class SiparisService {
  constructor(
    private supabase: SupabaseService,
    private partyService: PartyService,
    private kanallar: SatisKanallariService
  ) {}

  // ============================================================ Okuma

  /**
   * Kapsamdaki siparişler — Müşteriler ekranının "Tahsilat" görünümü ve
   * yönetici raporu. Çalışana yalnızca kendi müşterilerininki (ve sorumlusu
   * olduğu kanalların siparişleri) döner.
   */
  async kapsamdakiler(scope: PartyScope, userId: string): Promise<MusteriSiparisListesi> {
    const a = await this.partyService.access(scope, userId);
    if (!a.canRead) throw new ForbiddenException("Bu kaydı görme yetkin yok");

    // Rapor TÜM siparişleri toplar; tavanla kesilen bir liste yöneticiye
    // eksik tahsilat gösterirdi (bkz. liste-tavani.ts tumSayfalar gerekçesi).
    const satirlar = await tumSayfalar<any>((bas, bit) => {
      let q = this.supabase.client.from("musteri_siparisleri").select(SIPARIS_SECIM);
      q = scope.jobId ? q.eq("job_id", scope.jobId) : q.eq("organization_id", scope.organizationId);
      return q.order("vade_tarihi", { ascending: true }).order("id", { ascending: true }).range(bas, bit);
    });

    const gorunen = a.canManageTeam
      ? satirlar
      : satirlar.filter((r) => musteriYetkisi(a, siparisSorumlusu(r), userId).okur);
    return { yonetici: a.canManageTeam, siparisler: await this.eslestir(gorunen) };
  }

  /** Müşteri kartındaki "Siparişler" sekmesi. */
  async musterininkiler(partyId: string, userId: string): Promise<MusteriSiparisi[]> {
    const party = await this.partyService.findOne(partyId);
    await this.yetkiIste({ tur: "musteri", party }, userId, "okur");
    const { data, error } = await this.supabase.client
      .from("musteri_siparisleri")
      .select(SIPARIS_SECIM)
      .eq("party_id", partyId)
      .order("siparis_tarihi", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return this.eslestir(data ?? []);
  }

  /**
   * Ürün kartının "Satışlar" sekmesi: bu ürünün geçtiği siparişler (kalemler
   * üzerinden — çok ürünlü siparişin her ürünü kendi kartında görünür).
   *
   * Yetki ürünün değil MÜŞTERİ defterinin: ürünü görebilen ama Müşteriler'e
   * erişimi olmayan biri satış rakamlarını görmemeli, çalışan da yalnızca
   * kendi müşterilerine yapılan satışı görür — Tahsilat görünümüyle aynı kural.
   */
  async urununkiler(productId: string, userId: string): Promise<MusteriSiparisListesi> {
    const { data: urun, error: urunHatasi } = await this.supabase.client
      .from("products")
      .select("id, organization_id")
      .eq("id", productId)
      .maybeSingle();
    if (urunHatasi) throw urunHatasi;
    if (!urun) throw new NotFoundException("Ürün bulunamadı");

    const a = await this.partyService.access({ organizationId: urun.organization_id }, userId);
    if (!a.canRead) throw new ForbiddenException("Bu kaydı görme yetkin yok");

    const idler = await tumSayfalar<any>((bas, bit) =>
      this.supabase.client
        .from("musteri_siparis_kalemleri")
        .select("siparis_id")
        .eq("product_id", productId)
        .order("siparis_id", { ascending: true })
        .range(bas, bit)
    );
    const tekil = Array.from(new Set(idler.map((r) => r.siparis_id as string)));
    const satirlar: any[] = [];
    // PostgREST'te `in` listesi URL'ye yazılıyor; uzun liste isteği kırar.
    for (let i = 0; i < tekil.length; i += 200) {
      const { data, error } = await this.supabase.client
        .from("musteri_siparisleri")
        .select(SIPARIS_SECIM)
        .in("id", tekil.slice(i, i + 200))
        .eq("organization_id", urun.organization_id);
      if (error) throw error;
      satirlar.push(...(data ?? []));
    }
    satirlar.sort((x, y) => String(y.siparis_tarihi).localeCompare(String(x.siparis_tarihi)) || String(x.id).localeCompare(String(y.id)));
    const gorunen = a.canManageTeam
      ? satirlar
      : satirlar.filter((r) => musteriYetkisi(a, siparisSorumlusu(r), userId).okur);
    return { yonetici: a.canManageTeam, siparisler: await this.eslestir(gorunen) };
  }

  // ============================================================ Sipariş yazma

  /** Müşteri kartından sipariş. */
  async olustur(partyId: string, girdi: SiparisGirdisi, userId: string): Promise<MusteriSiparisi> {
    const party = await this.partyService.findOne(partyId);
    if (party.archivedAt) throw new BadRequestException("Arşivdeki müşteriye sipariş eklenemez");
    return this.yeniSiparis({ tur: "musteri", party }, girdi, userId);
  }

  /**
   * Kapsamdan sipariş: müşteri kartı seçildiyse ona, seçilmediyse kanala
   * (tek seferlik alıcı). Tahsilat ekranındaki "Sipariş ekle" buradan gelir.
   */
  async kapsamdaOlustur(
    scope: PartyScope,
    girdi: SiparisGirdisi & { partyId?: string },
    userId: string
  ): Promise<MusteriSiparisi> {
    if (girdi.partyId) {
      const party = await this.partyService.findOne(girdi.partyId);
      const ps = this.partyService.scopeOf(party);
      if ((ps.jobId ?? null) !== (scope.jobId ?? null) || (!scope.jobId && ps.organizationId !== scope.organizationId)) {
        throw new BadRequestException("Müşteri bu kapsamda değil");
      }
      return this.olustur(party.id, girdi, userId);
    }
    if (!girdi.kanalId) throw new BadRequestException("Müşteri ya da satış kanalı seçilmeli");
    const kanal = await this.kanalCoz(scope, girdi.kanalId);
    return this.yeniSiparis({ tur: "kanal", kanal }, girdi, userId);
  }

  private async yeniSiparis(sahip: SiparisSahibi, girdi: SiparisGirdisi, userId: string): Promise<MusteriSiparisi> {
    await this.yetkiIste(sahip, userId, "yazar");
    const scope = this.sahipKapsami(sahip);

    // Kanal siparişinde vade ve yöntem verilmediyse kanaldan gelir.
    let kanal: SatisKanali | null = sahip.tur === "kanal" ? sahip.kanal : null;
    if (!kanal && girdi.kanalId) kanal = await this.kanalCoz(scope, girdi.kanalId);
    const g: SiparisGirdisi = {
      ...girdi,
      vadeGun: girdi.vadeGun ?? kanal?.varsayilanVadeGun,
      odemeYontemi: girdi.odemeYontemi ?? kanal?.varsayilanOdemeYontemi,
    };

    const alanlar = this.siparisAlanlari(g, true);
    const kalemler = await this.kalemleriHazirla(scope, g, true);
    alanlar.tutar = kalemToplamiSatir(kalemler);
    if (!(Number(alanlar.tutar) > 0)) throw new BadRequestException("Tutar sıfırdan büyük olmalı");

    const { data: row, error } = await this.supabase.client
      .from("musteri_siparisleri")
      .insert({
        ...alanlar,
        ...this.aliciAlanlari(g.alici),
        party_id: sahip.tur === "musteri" ? sahip.party.id : null,
        kanal_id: kanal?.id ?? null,
        organization_id: scope.jobId ? null : scope.organizationId ?? null,
        job_id: scope.jobId ?? null,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw error;

    try {
      await this.kalemleriYaz(row.id, kalemler);
    } catch (err) {
      // Kalemsiz sipariş tutarı açıklanamayan bir alacak olurdu.
      await this.supabase.client.from("musteri_siparisleri").delete().eq("id", row.id);
      throw err;
    }

    if (sahip.tur === "musteri") {
      // Sipariş veren aday artık müşteridir. Rol eklenir, silinmez (bkz. PartyRole).
      if (!sahip.party.roles.includes("customer")) {
        await this.partyService.addRoleTo(sahip.party.id, "customer", userId).catch(() => undefined);
      }
      await this.partyService.logActivity(sahip.party.id, "sistem", this.siparisOzeti(alanlar), userId);
    }
    return this.tekil(row.id);
  }

  async guncelle(id: string, girdi: SiparisGirdisi, userId: string): Promise<MusteriSiparisi> {
    const mevcut = await this.tekil(id);
    const sahip = await this.sahibi(mevcut);
    await this.yetkiIste(sahip, userId, "yazar");
    const scope = this.sahipKapsami(sahip);

    const alanlar = this.siparisAlanlari(girdi, false);
    let kalemler: KalemSatiri[] | null = null;
    if (girdi.kalemler !== undefined || girdi.productId !== undefined || girdi.tutar !== undefined) {
      kalemler = await this.kalemleriHazirla(scope, girdi, false, mevcut);
      alanlar.tutar = kalemToplamiSatir(kalemler);
      if (!(Number(alanlar.tutar) > 0)) throw new BadRequestException("Tutar sıfırdan büyük olmalı");
    }
    if (girdi.alici !== undefined) Object.assign(alanlar, this.aliciAlanlari(girdi.alici));
    if (girdi.kanalId !== undefined) {
      if (!girdi.kanalId && !mevcut.partyId) throw new BadRequestException("Müşterisiz siparişin kanalı kaldırılamaz");
      alanlar.kanal_id = girdi.kanalId ? (await this.kanalCoz(scope, girdi.kanalId)).id : null;
    }

    const odenen = tahsilEdilen(mevcut);
    if (odenen > 0) {
      // Tahsilat defterde siparişin para biriminde duruyor; birimi değiştirmek
      // "4.000 TRY geldi"yi sessizce "4.000 USD"ye çevirirdi.
      if (alanlar.para_birimi !== undefined && alanlar.para_birimi !== mevcut.paraBirimi) {
        throw new BadRequestException("Tahsilatı olan siparişin para birimi değiştirilemez");
      }
      if (alanlar.tutar !== undefined && Number(alanlar.tutar) < odenen) {
        throw new BadRequestException("Tutar, şimdiye kadar tahsil edilenden az olamaz");
      }
    }

    // Önce yeni kalemler, sonra sipariş: kalem yazımı düşerse sipariş eski
    // hâliyle (eski kalemleri ve tutarıyla) kalır.
    if (kalemler) await this.kalemleriDegistir(id, kalemler);
    const { error } = await this.supabase.client
      .from("musteri_siparisleri")
      .update({ ...alanlar, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    return this.tekil(id);
  }

  /**
   * Siparişi siler — yalnızca TAHSİLATI YOKSA. Silinseydi tahsilatlar ve
   * kasadaki gelir satırları da cascade ile giderdi: yanlış girilmiş bir
   * siparişi kaldırırken gerçekten gelmiş parayı defterden silmek olurdu.
   * Önce tahsilatlar tek tek geri alınır, bu bilinçli bir adım olsun.
   */
  async sil(id: string, userId: string): Promise<{ success: true }> {
    const mevcut = await this.tekil(id);
    await this.yetkiIste(await this.sahibi(mevcut), userId, "yazar");
    if (mevcut.tahsilatlar.length > 0) {
      throw new BadRequestException("Tahsilatı olan sipariş silinemez; önce tahsilatları geri al");
    }
    const { error } = await this.supabase.client.from("musteri_siparisleri").delete().eq("id", id);
    if (error) throw error;
    return { success: true };
  }

  // ============================================================ Tahsilat

  async tahsilEt(siparisId: string, girdi: TahsilatGirdisi, userId: string): Promise<MusteriSiparisi> {
    const siparis = await this.tekil(siparisId);
    await this.yetkiIste(await this.sahibi(siparis), userId, "yazar");

    const tutar = requireAmount(girdi.tutar);
    const hata = tahsilatTutariHatasi(siparis, tutar);
    if (hata) throw new BadRequestException(hata);
    const tarih = girdi.tarih ? tarihDogrula(girdi.tarih, HATA_TAHSILAT_TARIHI) : bugun();
    const yontem = girdi.odemeYontemi
      ? requireOneOf(girdi.odemeYontemi, ODEME_YONTEMLERI, "Ödeme yöntemi")
      : siparis.odemeYontemi;
    const evrakli = evrakliMi(yontem);

    await this.tahsilatYaz(siparis, {
      tutar,
      tarih,
      odemeYontemi: yontem,
      evrakNo: evrakli ? metin(girdi.evrakNo) : null,
      evrakVadesi: evrakli && girdi.evrakVadesi ? tarihDogrula(girdi.evrakVadesi, HATA_EVRAK_VADESI) : null,
      notlar: metin(girdi.notlar),
      aktorId: userId,
    });

    if (siparis.partyId) {
      await this.partyService.logActivity(siparis.partyId, "sistem", `Tahsilat: ${tutar} ${siparis.paraBirimi}`, userId);
    }
    await this.faturaDurumunuEsitle(siparis.id);
    return this.tekil(siparis.id);
  }

  /**
   * Toplu "tahsil edildi": her siparişin KALANI tek tahsilat olarak yazılır
   * (muhasebe Trendyol'un aylık ödemesini görünce o ayın siparişlerini
   * kapatır). Her biri tek tahsilattaki aynı yoldan geçer: kasa satırı,
   * yetki, geri alma güvencesi. Biri düşerse diğerleri durmaz — hangileri
   * yazılamadığı nedeniyle döner, kullanıcı yalnızca onlara bakar.
   */
  async topluTahsilEt(
    ids: unknown,
    girdi: { tarih?: string; odemeYontemi?: OdemeYontemi; notlar?: string },
    userId: string
  ): Promise<{ islenen: number; atlanan: { id: string; neden: string }[] }> {
    if (!Array.isArray(ids) || ids.length === 0) throw new BadRequestException("Sipariş seçilmedi");
    if (ids.length > TOPLU_TAHSILAT_TAVANI) {
      throw new BadRequestException(hataMetni("Tek seferde en çok {n} sipariş işaretlenebilir", { n: TOPLU_TAHSILAT_TAVANI }));
    }
    const tarih = girdi.tarih ? tarihDogrula(girdi.tarih, HATA_TAHSILAT_TARIHI) : bugun();
    const yontem = girdi.odemeYontemi ? requireOneOf(girdi.odemeYontemi, ODEME_YONTEMLERI, "Ödeme yöntemi") : undefined;

    let islenen = 0;
    const atlanan: { id: string; neden: string }[] = [];
    for (const id of new Set(ids.map(String))) {
      try {
        const siparis = await this.tekil(id);
        const kalan = kalanTutar(siparis);
        if (kalan <= 0) {
          atlanan.push({ id, neden: "Zaten tahsil edilmiş" });
          continue;
        }
        await this.tahsilEt(id, { tutar: kalan, tarih, odemeYontemi: yontem, notlar: girdi.notlar }, userId);
        islenen += 1;
      } catch (err: any) {
        atlanan.push({ id, neden: err?.message || "Yazılamadı" });
      }
    }
    return { islenen, atlanan };
  }

  /** Tahsilatı geri alır; kasadaki gelir satırı cascade ile silinir. */
  async tahsilatiGeriAl(tahsilatId: string, userId: string): Promise<MusteriSiparisi> {
    const { data: t } = await this.supabase.client
      .from("musteri_tahsilatlari")
      .select("id, siparis_id")
      .eq("id", tahsilatId)
      .maybeSingle();
    if (!t) throw new NotFoundException("Tahsilat bulunamadı");
    const siparis = await this.tekil(t.siparis_id);
    await this.yetkiIste(await this.sahibi(siparis), userId, "yazar");

    const { error } = await this.supabase.client.from("musteri_tahsilatlari").delete().eq("id", tahsilatId);
    if (error) throw error;
    await this.faturaDurumunuEsitle(siparis.id);
    return this.tekil(siparis.id);
  }

  /**
   * Tahsilatı ve kasa satırını yazar. Defter yazılamadıysa tahsilat da
   * kalmaz: kasada olmayan bir "tahsil edildi" raporla kasayı ayrıştırırdı —
   * tam da bu bağın önlemek için var olduğu şey.
   */
  private async tahsilatYaz(
    siparis: MusteriSiparisi,
    p: {
      tutar: number;
      tarih: string;
      odemeYontemi: OdemeYontemi;
      evrakNo?: string | null;
      evrakVadesi?: string | null;
      notlar?: string | null;
      aktorId: string | null;
    }
  ): Promise<void> {
    const { data: t, error } = await this.supabase.client
      .from("musteri_tahsilatlari")
      .insert({
        siparis_id: siparis.id,
        tutar: p.tutar,
        tarih: p.tarih,
        odeme_yontemi: p.odemeYontemi,
        evrak_no: p.evrakNo ?? null,
        evrak_vadesi: p.evrakVadesi ?? null,
        notlar: p.notlar ?? null,
        created_by: p.aktorId,
      })
      .select("id")
      .single();
    if (error) throw error;

    try {
      await this.deftereIsle(siparis, t.id, p.tutar, p.tarih, p.aktorId);
    } catch (err) {
      await this.supabase.client.from("musteri_tahsilatlari").delete().eq("id", t.id);
      throw err;
    }
  }

  // ============================================================ Entegrasyon kapısı

  /**
   * Dış sistemden (Shopify) gelen siparişi yazar ya da günceller.
   *
   * YETKİ SORULMAZ: çağıran bir kullanıcı değil, imzası doğrulanmış bir
   * webhook. Kapsam müşteri kartından gelir, kart da mağazanın bağlı olduğu
   * şirketten — yani yazılabilecek yer zaten bağlantı kurulurken belirlendi.
   * `aktorId` yalnızca "kim yazdı" izi (mağazayı bağlayan kişi).
   *
   * Aynı dış kimlik ikinci kez gelirse mevcut satır güncellenir
   * (musteri_siparisleri_dis_kimlik_uniq). Tahsilatı olan siparişin tutarı
   * tahsil edilenin altına ÇEKİLMEZ — elle düzenlemedeki kuralın aynısı.
   */
  async entegrasyonSiparisiYaz(p: {
    party: Party;
    kaynak: "shopify";
    disKimlik: string;
    shopifyMagazaId: string;
    alanlar: Record<string, unknown>;
    /**
     * Mağazanın kalemleri (stok kodundan bulunan katalog ürünüyle). Güncellemede
     * YALNIZCA siparişin hiçbir kalemi ürüne bağlı değilse yeniden yazılır:
     * kullanıcının elle bağladığı ürünü mağazadan gelen her güncelleme ezmesin.
     */
    kalemler: KalemSatiri[];
    aktorId: string | null;
  }): Promise<{ siparis: MusteriSiparisi; yeni: boolean }> {
    const mevcutId = await this.disKimliktenBul(p.kaynak, p.disKimlik);
    if (mevcutId) {
      const mevcut = await this.tekil(mevcutId);
      const alanlar: Record<string, unknown> = { ...p.alanlar };
      const odenen = tahsilEdilen(mevcut);
      let tutarKorundu = false;
      if (odenen > 0) {
        delete alanlar.para_birimi;
        if (Number(alanlar.tutar) < odenen) {
          delete alanlar.tutar;
          tutarKorundu = true;
        }
      }
      // Tutar korunduysa kalemler de dokunulmaz: kalem toplamı = sipariş tutarı.
      if (!tutarKorundu && p.kalemler.length > 0 && !mevcut.kalemler.some((k) => k.productId)) {
        await this.kalemleriDegistir(mevcutId, p.kalemler);
      } else if (!tutarKorundu) {
        delete alanlar.tutar;
      }
      const { error } = await this.supabase.client
        .from("musteri_siparisleri")
        .update({ ...alanlar, updated_at: new Date().toISOString() })
        .eq("id", mevcutId);
      if (error) throw error;
      return { siparis: await this.tekil(mevcutId), yeni: false };
    }

    const { data: row, error } = await this.supabase.client
      .from("musteri_siparisleri")
      .insert({
        ...p.alanlar,
        party_id: p.party.id,
        organization_id: p.party.organizationId ?? null,
        job_id: p.party.jobId ?? null,
        kaynak: p.kaynak,
        dis_kimlik: p.disKimlik,
        shopify_magaza_id: p.shopifyMagazaId,
        created_by: p.aktorId,
      })
      .select("id")
      .single();
    if (error) {
      // İki olay aynı anda işlendiyse ikincisi tekil indekse takılır; o
      // zaman kaydı açan diğeri, biz yalnızca onu okuruz.
      if ((error as any).code === "23505") {
        const id = await this.disKimliktenBul(p.kaynak, p.disKimlik);
        if (id) return { siparis: await this.tekil(id), yeni: false };
      }
      throw error;
    }
    try {
      await this.kalemleriYaz(row.id, p.kalemler);
    } catch (err) {
      await this.supabase.client.from("musteri_siparisleri").delete().eq("id", row.id);
      throw err;
    }

    if (!p.party.roles.includes("customer")) {
      await this.partyService.addRoleTo(p.party.id, "customer").catch(() => undefined);
    }
    await this.partyService
      .logActivity(p.party.id, "sistem", `Shopify siparişi: ${p.alanlar.siparis_no ?? p.disKimlik}`, p.aktorId ?? undefined)
      .catch(() => undefined);
    return { siparis: await this.tekil(row.id), yeni: true };
  }

  /**
   * Dış sistemin bildirdiği ödemeyi tahsilat olarak yazar; kasa satırı
   * elle tahsilattaki aynı yoldan (deftereIsle) ve aynı geri alma
   * güvencesiyle açılır. Tutarın kalan alacağı aşmaması burada da şart.
   */
  async entegrasyonTahsilatiYaz(p: {
    siparis: MusteriSiparisi;
    tutar: number;
    tarih: string;
    odemeYontemi: OdemeYontemi;
    notlar: string;
    aktorId: string | null;
  }): Promise<MusteriSiparisi> {
    const hata = tahsilatTutariHatasi(p.siparis, p.tutar);
    if (hata) throw new BadRequestException(hata);
    await this.tahsilatYaz(p.siparis, {
      tutar: p.tutar,
      tarih: p.tarih,
      odemeYontemi: p.odemeYontemi,
      notlar: p.notlar,
      aktorId: p.aktorId,
    });
    await this.faturaDurumunuEsitle(p.siparis.id);
    return this.tekil(p.siparis.id);
  }

  /**
   * Toplu içe aktarmanın yazım kapısı (SiparisAktarimService). Yetkiyi
   * çağıran doğrular (yönetici); burada yalnızca sipariş + kalemler, tek
   * tek değil parti parti. Aynı dış kimlik zaten varsa satır ATLANIR —
   * yarıda kalan bir yükleme dosya yeniden yüklenince kaldığı yerden sürer.
   */
  async topluYaz(
    satirlar: Array<{ siparis: Record<string, unknown>; kalemler: KalemSatiri[] }>,
    aktorId: string
  ): Promise<{ yazilan: number; zatenVar: number }> {
    let yazilan = 0;
    let zatenVar = 0;
    for (let i = 0; i < satirlar.length; i += 100) {
      const parti = satirlar.slice(i, i + 100);
      const kimlikler = parti.map((s) => String(s.siparis.dis_kimlik));
      const { data: var_, error: varHatasi } = await this.supabase.client
        .from("musteri_siparisleri")
        .select("dis_kimlik")
        .eq("kaynak", "excel")
        .in("dis_kimlik", kimlikler);
      if (varHatasi) throw varHatasi;
      const mevcut = new Set((var_ ?? []).map((r: any) => r.dis_kimlik));
      const yeniler = parti.filter((s) => !mevcut.has(String(s.siparis.dis_kimlik)));
      zatenVar += parti.length - yeniler.length;
      if (yeniler.length === 0) continue;

      const { data: rows, error } = await this.supabase.client
        .from("musteri_siparisleri")
        .insert(yeniler.map((s) => ({ ...s.siparis, kaynak: "excel", created_by: aktorId })))
        .select("id, dis_kimlik");
      if (error) throw error;
      const idOf = new Map((rows ?? []).map((r: any) => [r.dis_kimlik, r.id]));
      const kalemler = yeniler.flatMap((s) =>
        s.kalemler.map((k) => ({ ...k, siparis_id: idOf.get(String(s.siparis.dis_kimlik)) }))
      );
      const { error: kalemHatasi } = await this.supabase.client.from("musteri_siparis_kalemleri").insert(kalemler);
      if (kalemHatasi) {
        // Kalemsiz sipariş kalmasın; parti geri alınır, yeniden yükleme onu yeniden dener.
        await this.supabase.client.from("musteri_siparisleri").delete().in("id", Array.from(idOf.values()));
        throw kalemHatasi;
      }
      yazilan += yeniler.length;
    }
    return { yazilan, zatenVar };
  }

  private async disKimliktenBul(kaynak: string, disKimlik: string): Promise<string | null> {
    const { data, error } = await this.supabase.client
      .from("musteri_siparisleri")
      .select("id")
      .eq("kaynak", kaynak)
      .eq("dis_kimlik", disKimlik)
      .maybeSingle();
    if (error) throw error;
    return data?.id ?? null;
  }

  // ============================================================ Fatura bağı
  //
  // Faturanın KAYDI ve BELGESİ Faturalar modülünde (FaturalarService). Burada
  // yalnızca siparişin yetkisi ve bağın kendisi var — faturalar modülü
  // siparişi bilir, sipariş faturalar modülünü bilmez (bağımlılık tek yönlü).

  /** Faturası değiştirilecek sipariş; siparişe yazma yetkisi şart. */
  async faturaIcinSiparis(id: string, userId: string): Promise<MusteriSiparisi> {
    const siparis = await this.tekil(id);
    await this.yetkiIste(await this.sahibi(siparis), userId, "yazar");
    return siparis;
  }

  /** Bağı kurar ya da (null) koparır. Yetki çağıranda doğrulanmış olmalı. */
  async faturaBagla(id: string, recordId: string | null): Promise<MusteriSiparisi> {
    const { error } = await this.supabase.client
      .from("musteri_siparisleri")
      .update({ invoice_record_id: recordId, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      if ((error as any).code === "23505") throw new BadRequestException("Bu fatura başka bir siparişe bağlı");
      throw error;
    }
    if (recordId) await this.faturaDurumunuEsitle(id);
    return this.tekil(id);
  }

  /**
   * Faturanın "Ödendi / Bekliyor" durumu tahsilattan gelir.
   *
   * Elle tutulsaydı tahsilat girildiği hâlde fatura listesinde "Bekliyor"
   * kalırdı ve ödenmemiş faturalar sayacı yalan söylerdi. Hata işi DÜŞÜRMEZ:
   * tahsilat kasaya gerçekten yazıldı, bir etiketin güncellenememesi onu geri
   * almanın sebebi değil.
   */
  private async faturaDurumunuEsitle(siparisId: string): Promise<void> {
    try {
      const siparis = await this.tekil(siparisId);
      if (!siparis.fatura) return;
      const { data: kayit } = await this.supabase.client
        .from("module_records")
        .select("data")
        .eq("id", siparis.fatura.id)
        .maybeSingle();
      if (!kayit) return;
      const durum = kalanTutar(siparis) <= 0 ? "paid" : "pending";
      if ((kayit.data as any)?.status === durum) return;
      await this.supabase.client
        .from("module_records")
        .update({ data: { ...(kayit.data as object), status: durum }, updated_at: new Date().toISOString() })
        .eq("id", siparis.fatura.id);
    } catch {
      // Bkz. yukarıdaki gerekçe.
    }
  }

  // ============================================================ Yardımcılar

  private async sahibi(s: MusteriSiparisi): Promise<SiparisSahibi> {
    if (s.partyId) return { tur: "musteri", party: await this.partyService.findOne(s.partyId) };
    if (!s.kanalId) throw new NotFoundException("Siparişin sahibi bulunamadı");
    return { tur: "kanal", kanal: await this.kanallar.bul(s.kanalId) };
  }

  private sahipKapsami(sahip: SiparisSahibi): PartyScope {
    return sahip.tur === "musteri" ? this.partyService.scopeOf(sahip.party) : this.kanallar.scopeOf(sahip.kanal);
  }

  private async yetkiIste(sahip: SiparisSahibi, userId: string, ne: "okur" | "yazar"): Promise<void> {
    // Sipariş müşteri defterinin işi. Yalnızca Bağlantılar'da duran karta
    // sipariş açılırsa kart satış ekibinin raporuna sessizce girerdi; önce
    // "Müşteri yap" ile defterine alınmalı.
    if (sahip.tur === "musteri" && !sahip.party.modules.includes(MUSTERI_MODUL_KEY)) {
      throw new ForbiddenException("Bu kart Müşteriler'de değil");
    }
    const a = await this.partyService.access(this.sahipKapsami(sahip), userId);
    const sorumlu = sahip.tur === "musteri" ? sahip.party.ownerUserId : sahip.kanal.sorumluUserId;
    const y = musteriYetkisi(a, sorumlu, userId);
    if (ne === "okur" ? !y.okur : !y.siparisYazar) {
      throw new ForbiddenException(sahip.tur === "musteri" ? "Bu müşteri sana atanmamış" : "Bu satış kanalı sana atanmamış");
    }
  }

  /** Kanal bu kapsamın mı — başka şirketin kanal kimliği gövdeye yazılmasın. */
  private async kanalCoz(scope: PartyScope, kanalId: string): Promise<SatisKanali> {
    const kanal = await this.kanallar.bul(kanalId);
    const ayni = scope.jobId ? kanal.jobId === scope.jobId : kanal.organizationId === scope.organizationId;
    if (!ayni) throw new BadRequestException("Satış kanalı bu kapsamda değil");
    return kanal;
  }

  /**
   * Girdiyi kalem satırlarına çevirir ve doğrular.
   *
   * Fiyat kuralı:
   *   · Kalemin fiyatı verilmişse o (pazarlık edilmiş fiyat);
   *   · verilmemişse ürünün KDV dahil katalog fiyatı;
   *   · sipariş `tutar`ı da verilmişse fiyatı verilmemiş kalemler, tutardan
   *     fiyatlı kalemler düşüldükten sonra KALANI katalog oranında paylaşır
   *     ("toplam 2.427,30 TL, ürünler şunlar").
   * Katalog fiyatı her kaleme ayrıca yazılır: satıştaki sapma oranı buradan.
   *
   * Güncellemede yalnızca `tutar` geldiyse mevcut kalemler yeni tutara
   * orantılanır — eski istemci yalnızca tutarı düzeltebilsin.
   */
  private async kalemleriHazirla(
    scope: PartyScope,
    g: SiparisGirdisi,
    tam: boolean,
    mevcut?: MusteriSiparisi
  ): Promise<KalemSatiri[]> {
    let girdiler: KalemGirdisi[];
    if (g.kalemler !== undefined) {
      if (!Array.isArray(g.kalemler)) throw new BadRequestException("Kalemler liste olmalı");
      girdiler = g.kalemler;
    } else if (g.productId !== undefined || tam) {
      // ESKİ biçim: tek ürünlü sipariş. Mevcut tek kalemin fiyat bilgisi
      // yok sayılır, tutar zaten gövdede ya da siparişte.
      girdiler = [
        {
          productId: g.productId !== undefined ? g.productId : mevcut?.kalemler[0]?.productId,
          aciklama: g.aciklama ?? mevcut?.aciklama ?? (g.productId ? undefined : "Sipariş"),
          miktar: g.miktar ?? undefined,
          birim: g.birim,
        },
      ];
    } else {
      // Yalnızca tutar değişti: mevcut kalemler yeni tutara orantılanır.
      girdiler = (mevcut?.kalemler ?? []).map((k) => ({
        productId: k.productId,
        aciklama: k.aciklama,
        miktar: k.miktar,
        birim: k.birim,
      }));
    }
    if (girdiler.length === 0) throw new BadRequestException("Siparişte en az bir kalem olmalı");
    if (girdiler.length > 200) throw new BadRequestException("Bir siparişte en çok 200 kalem olabilir");

    const urunIdleri = Array.from(new Set(girdiler.map((k) => k.productId).filter(Boolean) as string[]));
    const urunler = await this.urunleriCoz(scope, urunIdleri, mevcut);

    const hazir = girdiler.map((k, i) => {
      const urun = k.productId ? urunler.get(k.productId) : undefined;
      const aciklama = metin(k.aciklama);
      if (!urun && !aciklama) throw new BadRequestException("Ürünü seçilmeyen kalemin açıklaması olmalı");
      const miktar = k.miktar === undefined || k.miktar === null || k.miktar === "" ? 1 : requireAmount(k.miktar, "Miktar");
      if (miktar <= 0) throw new BadRequestException("Miktar sıfırdan büyük olmalı");
      const fiyat =
        k.birimFiyat === undefined || k.birimFiyat === null || k.birimFiyat === ""
          ? undefined
          : requireAmount(k.birimFiyat, "Birim fiyat");
      return {
        product_id: urun?.id ?? null,
        aciklama,
        miktar,
        birim: metin(k.birim) ?? urun?.birim ?? null,
        fiyat,
        liste: urun?.liste ?? null,
        sira: i,
      };
    });

    const toplam = g.tutar !== undefined && g.tutar !== "" ? requireAmount(g.tutar) : undefined;
    const fiyatli = hazir.filter((k) => k.fiyat !== undefined);
    const fiyatsiz = hazir.filter((k) => k.fiyat === undefined);
    const dagitilacak = new Map<number, { birimFiyat: number; tutar: number }>();

    if (fiyatsiz.length > 0) {
      if (toplam !== undefined) {
        const sabit = kalemToplami(fiyatli.map((k) => ({ tutar: kalemTutari({ miktar: k.miktar, birimFiyat: k.fiyat! }) })));
        const kalan = Math.round((toplam - sabit) * 100) / 100;
        if (kalan < 0) throw new BadRequestException("Kalem fiyatlarının toplamı sipariş tutarını aşıyor");
        const pay = kalemleriOrantila(
          fiyatsiz.map((k) => ({ miktar: k.miktar, listeBirimFiyat: k.liste ?? undefined, sira: k.sira })),
          kalan
        );
        for (const p of pay) dagitilacak.set(p.sira, { birimFiyat: p.birimFiyat, tutar: p.tutar });
      } else {
        for (const k of fiyatsiz) {
          if (k.liste === null) throw new BadRequestException("Fiyatı katalogda olmayan kalemin birim fiyatı girilmeli");
          dagitilacak.set(k.sira, { birimFiyat: k.liste, tutar: kalemTutari({ miktar: k.miktar, birimFiyat: k.liste }) });
        }
      }
    }

    return hazir.map((k) => {
      const d = dagitilacak.get(k.sira) ?? { birimFiyat: k.fiyat!, tutar: kalemTutari({ miktar: k.miktar, birimFiyat: k.fiyat! }) };
      return {
        product_id: k.product_id,
        aciklama: k.aciklama,
        miktar: k.miktar,
        birim: k.birim,
        birim_fiyat: d.birimFiyat,
        liste_birim_fiyat: k.liste,
        tutar: d.tutar,
        sira: k.sira,
      };
    });
  }

  /**
   * Kalemlere bağlanacak ürünleri doğrular. Katalog şirketindir: başka
   * şirketin ürün kimliği gövdeye yazılırsa o şirketin ürün adı bu siparişte
   * (ve gömme yoluyla bu müşterinin ekranında) görünürdü. Arşivdeki ürün
   * yeni kaleme bağlanamaz; siparişte zaten bağlı olan kalır (başka bir alanı
   * düzeltilirken reddedilmesin).
   */
  private async urunleriCoz(
    scope: PartyScope,
    ids: string[],
    mevcut?: MusteriSiparisi
  ): Promise<Map<string, { id: string; liste: number | null; birim: string | null }>> {
    const out = new Map<string, { id: string; liste: number | null; birim: string | null }>();
    if (ids.length === 0) return out;
    if (!scope.organizationId || scope.jobId) {
      throw new BadRequestException("Ürün yalnızca şirket müşterilerinin siparişine bağlanabilir");
    }
    const { data, error } = await this.supabase.client
      .from("products")
      .select("id, organization_id, archived_at, price, tax_rate, unit")
      .in("id", ids);
    if (error) throw error;
    const zatenBagli = new Set((mevcut?.kalemler ?? []).map((k) => k.productId).filter(Boolean));
    for (const id of ids) {
      const u = (data ?? []).find((x: any) => x.id === id);
      if (!u) throw new NotFoundException("Ürün bulunamadı");
      if (u.organization_id !== scope.organizationId) throw new BadRequestException("Ürün bu müşterinin şirketine ait değil");
      if (u.archived_at && !zatenBagli.has(id)) throw new BadRequestException("Arşivdeki ürün siparişe bağlanamaz");
      out.set(id, { id, liste: kdvDahilFiyat(u.price, u.tax_rate) ?? null, birim: u.unit ?? null });
    }
    return out;
  }

  private async kalemleriYaz(siparisId: string, kalemler: KalemSatiri[]): Promise<void> {
    if (kalemler.length === 0) return;
    const { error } = await this.supabase.client
      .from("musteri_siparis_kalemleri")
      .insert(kalemler.map((k) => ({ ...k, siparis_id: siparisId })));
    if (error) throw error;
  }

  /** Yeni kalemleri yazar, sonra eskileri siler — arada düşerse sipariş kalemsiz kalmaz. */
  private async kalemleriDegistir(siparisId: string, kalemler: KalemSatiri[]): Promise<void> {
    const { data: eski, error: okuma } = await this.supabase.client
      .from("musteri_siparis_kalemleri")
      .select("id")
      .eq("siparis_id", siparisId);
    if (okuma) throw okuma;
    await this.kalemleriYaz(siparisId, kalemler);
    const eskiIdler = (eski ?? []).map((r: any) => r.id);
    if (eskiIdler.length > 0) {
      const { error } = await this.supabase.client.from("musteri_siparis_kalemleri").delete().in("id", eskiIdler);
      if (error) throw error;
    }
  }

  private aliciAlanlari(a: SiparisGirdisi["alici"]): Record<string, unknown> {
    if (a === undefined) return {};
    return { alici_adi: metin(a?.ad), alici_il: metin(a?.il), alici_ilce: metin(a?.ilce) };
  }

  private async tekil(id: string): Promise<MusteriSiparisi> {
    const { data, error } = await this.supabase.client
      .from("musteri_siparisleri")
      .select(SIPARIS_SECIM)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Sipariş bulunamadı");
    return (await this.eslestir([data]))[0];
  }

  /** Sorumlu ve tahsil eden adlarını tek sorguda çözer. */
  private async eslestir(satirlar: any[]): Promise<MusteriSiparisi[]> {
    const ids = new Set<string>();
    for (const r of satirlar) {
      const sorumlu = siparisSorumlusu(r);
      if (sorumlu) ids.add(sorumlu);
      for (const t of r.tahsilatlar ?? []) if (t.created_by) ids.add(t.created_by);
    }
    const adlar = new Map<string, string>();
    const liste = Array.from(ids);
    for (let i = 0; i < liste.length; i += 200) {
      const { data } = await this.supabase.client.from("users").select("id, full_name, email").in("id", liste.slice(i, i + 200));
      for (const u of data ?? []) adlar.set(u.id, u.full_name || u.email);
    }
    return satirlar.map((r) => mapSiparis(r, adlar));
  }

  /**
   * Gövdeyi sütunlara çevirir. `tam` = oluşturma: zorunlu alanlar şart,
   * eksikler varsayılana düşer. Güncellemede yalnızca gönderilen alanlar.
   * Tutar burada DEĞİL: kalem toplamından gelir (kalemleriHazirla).
   */
  private siparisAlanlari(g: SiparisGirdisi, tam: boolean): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (tam || g.paraBirimi !== undefined) out.para_birimi = paraBirimiDogrula(g.paraBirimi);
    if (tam || g.siparisTarihi !== undefined) {
      out.siparis_tarihi = g.siparisTarihi ? tarihDogrula(g.siparisTarihi, HATA_SIPARIS_TARIHI) : bugun();
    }
    if (tam || g.vadeGun !== undefined) {
      const gun = g.vadeGun === undefined || g.vadeGun === "" ? 0 : Number(g.vadeGun);
      if (!Number.isInteger(gun) || gun < 0 || gun > 3650) {
        throw new BadRequestException("Vade 0 ile 3650 gün arasında bir tam sayı olmalı");
      }
      out.vade_gun = gun;
    }
    if (tam || g.odemeYontemi !== undefined) {
      out.odeme_yontemi = g.odemeYontemi ? requireOneOf(g.odemeYontemi, ODEME_YONTEMLERI, "Ödeme yöntemi") : "havale";
    }
    if (g.siparisNo !== undefined) out.siparis_no = metin(g.siparisNo);
    if (g.aciklama !== undefined) out.aciklama = metin(g.aciklama);
    if (g.notlar !== undefined) out.notlar = metin(g.notlar);

    // Evrak alanları yalnızca çek/senette anlamlı; yöntem değişince eskisi
    // (ör. havaleye çevrilen çekin numarası) kayıtta asılı kalmasın.
    if (out.odeme_yontemi !== undefined && !evrakliMi(out.odeme_yontemi as string)) {
      out.evrak_no = null;
      out.evrak_vadesi = null;
    } else {
      if (g.evrakNo !== undefined) out.evrak_no = metin(g.evrakNo);
      if (g.evrakVadesi !== undefined) {
        out.evrak_vadesi = g.evrakVadesi ? tarihDogrula(g.evrakVadesi, HATA_EVRAK_VADESI) : null;
      }
    }
    return out;
  }

  private siparisOzeti(alanlar: Record<string, unknown>): string {
    // Geçmiş akışındaki diğer sistem satırları gibi düz metin ("Kayıt oluşturuldu").
    return `Sipariş eklendi: ${alanlar.tutar} ${alanlar.para_birimi}`;
  }

  /**
   * Tahsilatı kapsamın defterine gelir olarak yazar.
   *
   * Satır şirketin (ya da işin) kendi kademesine gider, satış departmanına
   * DEĞİL: müşteri şirketindir. Defterin sahibi (owner_id) kademenin sahibi —
   * migration 104'te şirket satırları için kurulan desen. Müşterisiz
   * siparişte karşı taraf yok; açıklama kanalı ve alıcıyı söyler.
   */
  private async deftereIsle(
    siparis: MusteriSiparisi,
    tahsilatId: string,
    tutar: number,
    tarih: string,
    userId: string | null
  ): Promise<void> {
    const kademe = siparis.jobId
      ? { sutun: "job_id", tablo: "jobs", id: siparis.jobId }
      : { sutun: "organization_id", tablo: "organizations", id: siparis.organizationId! };
    const { data: sahip } = await this.supabase.client
      .from(kademe.tablo)
      .select("owner_id")
      .eq("id", kademe.id)
      .maybeSingle();

    const kim = siparis.partyName ?? [siparis.kanalAdi, siparis.alici?.ad].filter(Boolean).join(" · ");
    const aciklama = [kim, siparis.siparisNo ? `#${siparis.siparisNo}` : siparis.aciklama]
      .filter(Boolean)
      .join(" · ");
    const { error } = await this.supabase.client.from("budget_transactions").insert({
      [kademe.sutun]: kademe.id,
      owner_id: (sahip as any)?.owner_id ?? null,
      created_by: userId,
      type: "income",
      amount: tutar,
      currency: siparis.paraBirimi,
      category: "Tahsilat",
      description: aciklama || null,
      counterparty_id: siparis.partyId ?? null,
      occurred_at: tarih,
      source: "tahsilat",
      tahsilat_id: tahsilatId,
    });
    if (error) throw error;
  }
}

function kalemToplamiSatir(kalemler: KalemSatiri[]): number {
  return kalemToplami(kalemler.map((k) => ({ tutar: k.tutar })));
}
