import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import {
  MUSTERI_MODUL_KEY,
  ODEME_YONTEMLERI,
  kdvDahilFiyat,
  type AliciKarari,
  type SiparisAktarimDuzeltmeleri,
  type SiparisAktarimSonucu,
} from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { hataMetni } from "../../common/i18n/index";
import { tabloyuOku } from "./musteri-sablonu";
import { PartyService, type PartyScope } from "./party.service";
import { SatisKanallariService, SATIS_KANALI_TURLERI } from "./satis-kanallari.service";
import { baslikHarfi, siparisPlaniCikar, yeniKartKisisi, type SiparisAktarimPlani } from "./siparis-aktarim";
import { SiparisService } from "./siparis.service";

/**
 * Sipariş listesini (Excel / CSV) içe aktarır — veritabanı tarafı.
 *
 * Planı saf planlayıcı çıkarır (siparis-aktarim.ts); burada yalnızca
 * bağlam (katalog, müşteriler, kanallar) okunur ve onaylanan plan yazılır.
 *
 * YALNIZCA YÖNETİCİ (canManageTeam): yükleme yüzlerce müşteriye sipariş
 * yazar, yeni kart ve kanal açar — tek bir çalışanın kendi müşterisi
 * sınırının çok ötesinde.
 *
 * TAHSİLAT YAZILMAZ (kullanıcı kararı, 2026-10-20): siparişler "bekliyor"
 * girer; muhasebe kasayı görünce tek tek ya da toplu "tahsil edildi" der.
 * Dosyadaki her satırı tahsil edilmiş saymak kasaya, gerçekte gelip
 * gelmediği bilinmeyen yüzlerce gelir satırı yazardı.
 */
@Injectable()
export class SiparisAktarimService {
  constructor(
    private supabase: SupabaseService,
    private partyService: PartyService,
    private kanallar: SatisKanallariService,
    private siparisler: SiparisService
  ) {}

  async iceAktar(
    scope: PartyScope,
    dosya: { ad: string; tampon: Buffer },
    duzeltmelerHam: unknown,
    onizleme: boolean,
    userId: string
  ): Promise<SiparisAktarimSonucu> {
    if (scope.jobId || !scope.organizationId) {
      throw new BadRequestException("Sipariş içe aktarma şimdilik yalnızca şirket kapsamında");
    }
    const a = await this.partyService.access(scope, userId);
    if (!a.canManageTeam) throw new ForbiddenException("Sipariş listesini yalnızca yönetici içe aktarabilir");

    const sayfalar = await tabloyuOku(dosya.tampon, dosya.ad);
    if (sayfalar.length === 0) throw new BadRequestException("Dosyada dolu bir satır bulunamadı.");

    const [katalog, musteriler, kanallar] = await Promise.all([
      this.katalog(scope.organizationId),
      this.partyService.findAll(scope, { moduller: [MUSTERI_MODUL_KEY] }),
      this.kanallar.kapsamdakiler(scope),
    ]);
    const urunIdleri = new Set(katalog.map((u) => u.id));
    const musteriIdleri = new Set(musteriler.map((m) => m.id));
    const d = duzeltmeleriDogrula(duzeltmelerHam, urunIdleri, musteriIdleri);

    const ctx = {
      organizationId: scope.organizationId,
      katalog,
      musteriler: musteriler.map((m) => ({ id: m.id, displayName: m.displayName, city: m.address?.city })),
      kanallar: kanallar.map((k) => ({
        id: k.id,
        ad: k.ad,
        tur: k.tur,
        varsayilanVadeGun: k.varsayilanVadeGun,
        varsayilanOdemeYontemi: k.varsayilanOdemeYontemi,
      })),
      dosyaAdi: dosya.ad,
    };

    // Çok sayfalı Excel'de başlığı tanınan ilk sayfa.
    let plan: SiparisAktarimPlani | null = null;
    let ilkHata: string | null = null;
    for (const sayfa of sayfalar) {
      try {
        plan = siparisPlaniCikar(sayfa, ctx, d);
        break;
      } catch (err: any) {
        ilkHata ??= err?.message ?? String(err);
      }
    }
    if (!plan) throw new BadRequestException(ilkHata ?? "Dosya okunamadı");

    const sonuc = this.ozet(plan, onizleme);
    if (onizleme) return sonuc;
    if (plan.siparisler.length === 0) throw new BadRequestException("Yazılacak sipariş yok");

    // 1. Yeni kanallar.
    const kanalId = new Map<string, string>();
    let acilanKanal = 0;
    for (const k of plan.kanallar) {
      if (k.kanalId) {
        kanalId.set(k.ad, k.kanalId);
        continue;
      }
      if (k.siparisSayisi === 0) continue;
      const yeni = await this.kanallar.olustur(
        scope,
        { ad: k.ad, tur: k.tur, varsayilanVadeGun: k.vadeGun, varsayilanOdemeYontemi: k.odemeYontemi },
        userId
      );
      kanalId.set(k.ad, yeni.id);
      acilanKanal += 1;
    }
    const kanalOf = (ad?: string) => (ad ? kanalId.get(ad) ?? null : null);

    // 2. Yeni müşteri kartları.
    const partyOf = new Map<string, string>();
    let acilanKart = 0;
    const kullanilanAlicilar = new Set(plan.siparisler.map((s) => s.anahtar));
    for (const al of plan.alicilar) {
      if (!kullanilanAlicilar.has(al.anahtar)) continue;
      if (al.karar === "mevcut" && al.partyId) partyOf.set(al.anahtar, al.partyId);
      if (al.karar !== "yeni") continue;
      const ad = al.yeniKartAdi || al.ad;
      const eczane = /eczanesi$/i.test(ad);
      const kisi = eczane ? yeniKartKisisi(al.ad) : undefined;
      const kart = await this.partyService.create(
        scope,
        {
          displayName: ad,
          partyType: eczane ? "company" : "person",
          roles: ["customer"],
          // Kargo dökümünde il büyük harfle ("İSTANBUL"); kartta "İstanbul".
          address: al.il ? { city: baslikHarfi(al.il) } : undefined,
          source: "Sipariş içe aktarma",
          notes: kisi ? `İlgili kişi: ${kisi}` : undefined,
        } as any,
        userId,
        MUSTERI_MODUL_KEY
      );
      partyOf.set(al.anahtar, kart.id);
      acilanKart += 1;
    }

    // 3. Siparişler.
    const kararOf = new Map(plan.alicilar.map((x) => [x.anahtar, x.karar as AliciKarari]));
    const satirlar = plan.siparisler.map((s) => {
      const karar = kararOf.get(s.anahtar);
      const partyId = karar === "mevcut" || karar === "yeni" ? partyOf.get(s.anahtar) ?? null : null;
      const kanal = kanalOf(s.kanalAdi);
      if (!partyId && !kanal) {
        throw new BadRequestException(hataMetni("Satır {n}: siparişin müşterisi de kanalı da yok", { n: s.satir }));
      }
      return { siparis: { ...s.siparis, party_id: partyId, kanal_id: kanal, job_id: null }, kalemler: s.kalemler };
    });
    const { yazilan, zatenVar } = await this.siparisler.topluYaz(satirlar, userId);

    return { ...sonuc, onizleme: false, yazilan, zatenVar, acilanKart, acilanKanal };
  }

  private async katalog(organizationId: string) {
    const { data, error } = await this.supabase.client
      .from("products")
      .select("id, name, sku, price, tax_rate, unit")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((u: any) => ({
      id: u.id,
      name: u.name,
      sku: u.sku,
      unit: u.unit,
      liste: kdvDahilFiyat(u.price, u.tax_rate) ?? null,
    }));
  }

  private ozet(plan: SiparisAktarimPlani, onizleme: boolean): SiparisAktarimSonucu {
    const tarihler = plan.siparisler.map((s) => String(s.siparis.siparis_tarihi)).sort();
    return {
      onizleme,
      dosyaSatiri: plan.dosyaSatiri,
      siparisSayisi: plan.siparisler.length,
      kalemSayisi: plan.siparisler.reduce((t, s) => t + s.kalemler.length, 0),
      toplamTutar: Math.round(plan.siparisler.reduce((t, s) => t + Number(s.siparis.tutar), 0) * 100) / 100,
      ilkTarih: tarihler[0],
      sonTarih: tarihler[tarihler.length - 1],
      urunSutunlari: plan.urunSutunlari,
      kanallar: plan.kanallar,
      alicilar: plan.alicilar,
      atlanan: plan.atlanan,
      oncekiSatir: plan.oncekiSatir,
    };
  }
}

/**
 * İstemciden gelen düzeltmeleri doğrular. Katalogda olmayan ürün ya da bu
 * şirkette olmayan müşteri kimliği sessizce DÜŞER (planlayıcı varsayılana
 * döner): önizlemede seçilip sonra silinen bir kart yüzünden tüm yükleme
 * reddedilmesin, ama başka şirketin kimliği de asla yazılmasın.
 */
export function duzeltmeleriDogrula(
  ham: unknown,
  urunIdleri: Set<string>,
  musteriIdleri: Set<string>
): SiparisAktarimDuzeltmeleri {
  const d = (ham && typeof ham === "object" ? ham : {}) as Record<string, any>;
  const out: SiparisAktarimDuzeltmeleri = {};
  if (typeof d.baslangic === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.baslangic)) out.baslangic = d.baslangic;

  if (d.urunSutunlari && typeof d.urunSutunlari === "object") {
    out.urunSutunlari = {};
    for (const [k, v] of Object.entries(d.urunSutunlari)) {
      if (v === null) out.urunSutunlari[k] = null;
      else if (typeof v === "string" && urunIdleri.has(v)) out.urunSutunlari[k] = v;
    }
  }

  if (d.alicilar && typeof d.alicilar === "object") {
    out.alicilar = {};
    for (const [k, v] of Object.entries<any>(d.alicilar)) {
      if (!v || !["mevcut", "yeni", "kanal", "atla"].includes(v.karar)) continue;
      if (v.karar === "mevcut" && !(typeof v.partyId === "string" && musteriIdleri.has(v.partyId))) continue;
      out.alicilar[k] = {
        karar: v.karar,
        partyId: v.karar === "mevcut" ? v.partyId : undefined,
        ad: typeof v.ad === "string" ? v.ad : undefined,
      };
    }
  }

  if (d.kanallar && typeof d.kanallar === "object") {
    out.kanallar = {};
    for (const [k, v] of Object.entries<any>(d.kanallar)) {
      if (!v || typeof v !== "object") continue;
      const gun = Number(v.vadeGun);
      out.kanallar[k] = {
        tur: SATIS_KANALI_TURLERI.includes(v.tur) ? v.tur : undefined,
        vadeGun: Number.isInteger(gun) && gun >= 0 && gun <= 3650 ? gun : undefined,
        odemeYontemi: ODEME_YONTEMLERI.includes(v.odemeYontemi) ? v.odemeYontemi : undefined,
      };
    }
  }
  return out;
}
