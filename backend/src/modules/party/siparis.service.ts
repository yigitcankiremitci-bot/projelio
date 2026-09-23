import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  ODEME_YONTEMLERI,
  evrakliMi,
  tahsilatTutariHatasi,
  tahsilEdilen,
  type MusteriSiparisi,
  type MusteriSiparisListesi,
  type MusteriTahsilati,
  type OdemeYontemi,
  type Party,
} from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { paraBirimiDogrula, requireAmount, requireOneOf } from "../../common/validation/input";
import { tumSayfalar } from "../../common/liste-tavani";
import { PartyService, type PartyScope } from "./party.service";
import { musteriYetkisi } from "./siparis-erisim";

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

const SIPARIS_SECIM = "*, tahsilatlar:musteri_tahsilatlari(*), party:party(display_name, owner_user_id)";

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
  const sorumluId = row.party?.owner_user_id ?? undefined;
  return {
    id: row.id,
    partyId: row.party_id,
    partyName: row.party?.display_name ?? undefined,
    organizationId: row.organization_id ?? undefined,
    jobId: row.job_id ?? undefined,
    siparisNo: row.siparis_no ?? undefined,
    aciklama: row.aciklama ?? undefined,
    miktar: row.miktar === null || row.miktar === undefined ? undefined : Number(row.miktar),
    birim: row.birim ?? undefined,
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

export interface SiparisGirdisi {
  siparisNo?: string;
  aciklama?: string;
  miktar?: number | string | null;
  birim?: string;
  tutar?: number | string;
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

@Injectable()
export class SiparisService {
  constructor(
    private supabase: SupabaseService,
    private partyService: PartyService
  ) {}

  // ============================================================ Okuma

  /**
   * Kapsamdaki siparişler — Müşteriler ekranının "Tahsilat" görünümü ve
   * yönetici raporu. Çalışana yalnızca kendi müşterilerininki döner.
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
      : satirlar.filter((r) => musteriYetkisi(a, r.party?.owner_user_id, userId).okur);
    return { yonetici: a.canManageTeam, siparisler: await this.eslestir(gorunen) };
  }

  /** Müşteri kartındaki "Siparişler" sekmesi. */
  async musterininkiler(partyId: string, userId: string): Promise<MusteriSiparisi[]> {
    const party = await this.partyService.findOne(partyId);
    await this.yetkiIste(party, userId, "okur");
    const { data, error } = await this.supabase.client
      .from("musteri_siparisleri")
      .select(SIPARIS_SECIM)
      .eq("party_id", partyId)
      .order("siparis_tarihi", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return this.eslestir(data ?? []);
  }

  // ============================================================ Sipariş yazma

  async olustur(partyId: string, girdi: SiparisGirdisi, userId: string): Promise<MusteriSiparisi> {
    const party = await this.partyService.findOne(partyId);
    if (party.archivedAt) throw new BadRequestException("Arşivdeki müşteriye sipariş eklenemez");
    await this.yetkiIste(party, userId, "yazar");

    const alanlar = this.siparisAlanlari(girdi, true);
    const { data: row, error } = await this.supabase.client
      .from("musteri_siparisleri")
      .insert({
        ...alanlar,
        party_id: party.id,
        organization_id: party.organizationId ?? null,
        job_id: party.jobId ?? null,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw error;

    // Sipariş veren aday artık müşteridir. Rol eklenir, silinmez (bkz. PartyRole).
    if (!party.roles.includes("customer")) {
      await this.partyService.addRoleTo(party.id, "customer", userId).catch(() => undefined);
    }
    await this.partyService.logActivity(party.id, "sistem", this.siparisOzeti(alanlar), userId);
    return this.tekil(row.id);
  }

  async guncelle(id: string, girdi: SiparisGirdisi, userId: string): Promise<MusteriSiparisi> {
    const mevcut = await this.tekil(id);
    const party = await this.partyService.findOne(mevcut.partyId);
    await this.yetkiIste(party, userId, "yazar");

    const alanlar = this.siparisAlanlari(girdi, false);
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
    const party = await this.partyService.findOne(mevcut.partyId);
    await this.yetkiIste(party, userId, "yazar");
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
    const party = await this.partyService.findOne(siparis.partyId);
    await this.yetkiIste(party, userId, "yazar");

    const tutar = requireAmount(girdi.tutar);
    const hata = tahsilatTutariHatasi(siparis, tutar);
    if (hata) throw new BadRequestException(hata);
    const tarih = girdi.tarih ? tarihDogrula(girdi.tarih, HATA_TAHSILAT_TARIHI) : bugun();
    const yontem = girdi.odemeYontemi
      ? requireOneOf(girdi.odemeYontemi, ODEME_YONTEMLERI, "Ödeme yöntemi")
      : siparis.odemeYontemi;
    const evrakli = evrakliMi(yontem);

    const { data: t, error } = await this.supabase.client
      .from("musteri_tahsilatlari")
      .insert({
        siparis_id: siparis.id,
        tutar,
        tarih,
        odeme_yontemi: yontem,
        evrak_no: evrakli ? metin(girdi.evrakNo) : null,
        evrak_vadesi: evrakli && girdi.evrakVadesi ? tarihDogrula(girdi.evrakVadesi, HATA_EVRAK_VADESI) : null,
        notlar: metin(girdi.notlar),
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw error;

    try {
      await this.deftereIsle(siparis, t.id, tutar, tarih, userId);
    } catch (err) {
      // Defter yazılamadıysa tahsilat da kalmasın: kasada olmayan bir
      // "tahsil edildi" raporla kasayı ayrıştırırdı — tam da bu bağın
      // önlemek için var olduğu şey.
      await this.supabase.client.from("musteri_tahsilatlari").delete().eq("id", t.id);
      throw err;
    }

    await this.partyService.logActivity(
      party.id,
      "sistem",
      `Tahsilat: ${tutar} ${siparis.paraBirimi}`,
      userId
    );
    return this.tekil(siparis.id);
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
    const party = await this.partyService.findOne(siparis.partyId);
    await this.yetkiIste(party, userId, "yazar");

    const { error } = await this.supabase.client.from("musteri_tahsilatlari").delete().eq("id", tahsilatId);
    if (error) throw error;
    return this.tekil(siparis.id);
  }

  // ============================================================ Yardımcılar

  private async yetkiIste(party: Party, userId: string, ne: "okur" | "yazar"): Promise<void> {
    const a = await this.partyService.access(this.partyService.scopeOf(party), userId);
    const y = musteriYetkisi(a, party.ownerUserId, userId);
    if (ne === "okur" ? !y.okur : !y.siparisYazar) {
      throw new ForbiddenException("Bu müşteri sana atanmamış");
    }
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
      if (r.party?.owner_user_id) ids.add(r.party.owner_user_id);
      for (const t of r.tahsilatlar ?? []) if (t.created_by) ids.add(t.created_by);
    }
    const adlar = new Map<string, string>();
    if (ids.size > 0) {
      const { data } = await this.supabase.client.from("users").select("id, full_name, email").in("id", Array.from(ids));
      for (const u of data ?? []) adlar.set(u.id, u.full_name || u.email);
    }
    return satirlar.map((r) => mapSiparis(r, adlar));
  }

  /**
   * Gövdeyi sütunlara çevirir. `tam` = oluşturma: zorunlu alanlar şart,
   * eksikler varsayılana düşer. Güncellemede yalnızca gönderilen alanlar.
   */
  private siparisAlanlari(g: SiparisGirdisi, tam: boolean): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (tam || g.tutar !== undefined) {
      const tutar = requireAmount(g.tutar);
      if (tutar <= 0) throw new BadRequestException("Tutar sıfırdan büyük olmalı");
      out.tutar = tutar;
    }
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
    if (g.miktar !== undefined) {
      if (g.miktar === null || g.miktar === "") out.miktar = null;
      else out.miktar = requireAmount(g.miktar, "Miktar");
    }
    if (g.siparisNo !== undefined) out.siparis_no = metin(g.siparisNo);
    if (g.aciklama !== undefined) out.aciklama = metin(g.aciklama);
    if (g.birim !== undefined) out.birim = metin(g.birim);
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
   * migration 104'te şirket satırları için kurulan desen.
   */
  private async deftereIsle(
    siparis: MusteriSiparisi,
    tahsilatId: string,
    tutar: number,
    tarih: string,
    userId: string
  ): Promise<void> {
    const kademe = siparis.jobId
      ? { sutun: "job_id", tablo: "jobs", id: siparis.jobId }
      : { sutun: "organization_id", tablo: "organizations", id: siparis.organizationId! };
    const { data: sahip } = await this.supabase.client
      .from(kademe.tablo)
      .select("owner_id")
      .eq("id", kademe.id)
      .maybeSingle();

    const aciklama = [siparis.partyName, siparis.siparisNo ? `#${siparis.siparisNo}` : siparis.aciklama]
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
      counterparty_id: siparis.partyId,
      occurred_at: tarih,
      source: "tahsilat",
      tahsilat_id: tahsilatId,
    });
    if (error) throw error;
  }
}
