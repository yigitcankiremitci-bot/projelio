import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { SupabaseService } from "../../database/supabase.service";
import { LISTE_TAVANI } from "../../common/liste-tavani";
import {
  indirimliTutar,
  kodBicimiGecerli,
  kodNormallestir,
  kodUygunlugu,
  type Indirim,
  type IndirimKapsami,
  type IndirimKodu,
  type IndirimSuresi,
  type IndirimTuru,
  type UygunlukSebebi,
} from "./indirim";

/** Uygunluk sebebinin kullanıcıya görünen metni. */
const SEBEP_METNI: Record<UygunlukSebebi, string> = {
  yok: "Bu indirim kodu bulunamadı.", // dil:anahtar
  kapali: "Bu indirim kodu artık geçerli değil.", // dil:anahtar
  suresi_doldu: "Bu indirim kodunun süresi dolmuş.", // dil:anahtar
  tukendi: "Bu indirim kodunun kullanım hakkı dolmuş.", // dil:anahtar
  kullanildi: "Bu indirim kodunu daha önce kullandın.", // dil:anahtar
  kapsam_disi: "Bu indirim kodu bu satın almada geçerli değil.", // dil:anahtar
  paket_disi: "Bu indirim kodu bu paket için geçerli değil.", // dil:anahtar
};

export interface IndirimSonucu {
  kod: IndirimKodu;
  listeTutari: number;
  tutar: number;
}

/** Önizleme yanıtı: arayüz tutarı ve indirimin süresini gösterir. */
export function indirimOzeti(s: IndirimSonucu) {
  return {
    kod: s.kod.kod,
    tur: s.kod.tur,
    deger: s.kod.deger,
    sure: s.kod.sure,
    donemSayisi: s.kod.donemSayisi,
    listeTutari: s.listeTutari,
    tutar: s.tutar,
  };
}

function mapKod(row: any): IndirimKodu {
  return {
    id: row.id,
    kod: row.kod,
    tur: row.tur,
    deger: Number(row.deger),
    kapsam: row.kapsam,
    planKeys: row.plan_keys ?? null,
    periods: row.periods ?? null,
    sure: row.sure,
    donemSayisi: row.donem_sayisi ?? null,
    sonTarih: row.son_tarih ?? null,
    kullanimSiniri: row.kullanim_siniri ?? null,
    aktif: Boolean(row.aktif),
  };
}

/**
 * İndirim kodları: yönetici oluşturur, müşteri ödeme formunda girer.
 *
 * AYRI YAPRAK MODÜLDE (IndirimModule): hem abonelik (BillingModule) hem Lio
 * Bakiyesi siparişi (AiAssistantModule) kullanıyor ve BillingModule zaten
 * AiAssistantModule'ü içe aktarıyor — PayTRModule'deki döngü gerekçesinin aynısı.
 *
 * KULLANIM ÖDEME ALININCA YAZILIR (kullanimYaz), form açılınca değil. Toplam
 * sınır form açılırken kontrol ediliyor; iki kişi son hakkı aynı anda
 * kullanırsa sınır bir aşılabilir — parası alınmış bir ödemeyi indirim
 * yüzünden reddetmek bundan daha kötü.
 */
@Injectable()
export class IndirimService {
  private readonly logger = new Logger(IndirimService.name);

  constructor(private supabase: SupabaseService) {}

  /**
   * Kodu doğrular ve indirimli tutarı hesaplar; geçersizse kullanıcıya
   * gösterilecek sebeple 400 fırlatır.
   */
  async uygula(
    userId: string,
    kodMetni: string,
    baglam: { kapsam: "abonelik" | "lio"; planKey?: string; period?: string },
    listeTutari: number
  ): Promise<IndirimSonucu> {
    const kod = await this.kodBul(kodMetni);
    const [kullanimSayisi, buKullaniciKullandi] = kod
      ? await Promise.all([this.kullanimSayisi(kod.id), this.kullandiMi(kod.id, userId)])
      : [0, false];
    const karar = kodUygunlugu(kod, { simdi: new Date(), ...baglam, kullanimSayisi, buKullaniciKullandi });
    // "in" ile daraltma: projede strictNullChecks kapalı, boolean ayraç daraltmıyor.
    if ("sebep" in karar) throw new BadRequestException(SEBEP_METNI[karar.sebep]);
    return { kod: kod!, listeTutari, tutar: indirimliTutar(listeTutari, kod!) };
  }

  /** Ödeme alındı: kullanımı yazar. Aynı kişinin ikinci kaydı sessizce atlanır. */
  async kullanimYaz(kodId: string, userId: string, bag: { subscriptionId?: string; orderId?: string }): Promise<void> {
    const { error } = await this.supabase.client.from("indirim_kullanimlari").insert({
      kod_id: kodId,
      user_id: userId,
      subscription_id: bag.subscriptionId ?? null,
      ai_credit_order_id: bag.orderId ?? null,
    });
    if (error && (error as any).code !== "23505") throw error;
  }

  /** Kodun tamamı (süre bilgisi dahil); yoksa null. */
  async kod(kodId: string): Promise<IndirimKodu | null> {
    const { data, error } = await this.supabase.client.from("indirim_kodlari").select("*").eq("id", kodId).maybeSingle();
    if (error) throw error;
    return data ? mapKod(data) : null;
  }

  /** Yenilemede uygulanacak indirimin değeri; kod silinmişse null. */
  async indirim(kodId: string | null): Promise<Indirim | null> {
    if (!kodId) return null;
    const { data, error } = await this.supabase.client.from("indirim_kodlari").select("tur, deger").eq("id", kodId).maybeSingle();
    if (error) throw error;
    return data ? { tur: data.tur, deger: Number(data.deger) } : null;
  }

  // ================================================================ Yönetici

  async listele(): Promise<Array<IndirimKodu & { aciklama: string | null; kullanimSayisi: number; createdAt: string }>> {
    const { data, error } = await this.supabase.client
      .from("indirim_kodlari")
      .select("*, indirim_kullanimlari(count)")
      .order("created_at", { ascending: false })
      .limit(LISTE_TAVANI);
    if (error) throw error;
    return (data ?? []).map((row: any) => ({
      ...mapKod(row),
      aciklama: row.aciklama ?? null,
      kullanimSayisi: Number(row.indirim_kullanimlari?.[0]?.count ?? 0),
      createdAt: row.created_at,
    }));
  }

  async olustur(
    govde: {
      kod?: string;
      aciklama?: string;
      tur?: string;
      deger?: number;
      kapsam?: string;
      planKeys?: string[] | null;
      periods?: string[] | null;
      sure?: string;
      donemSayisi?: number | null;
      sonTarih?: string | null;
      kullanimSiniri?: number | null;
    },
    adminId: string
  ): Promise<IndirimKodu> {
    const kod = kodNormallestir(govde.kod ?? "");
    if (!kodBicimiGecerli(kod)) {
      throw new BadRequestException("Kod 3–40 karakter olmalı; yalnızca harf, rakam ve tire kullanılabilir.");
    }
    const tur = govde.tur as IndirimTuru;
    if (tur !== "yuzde" && tur !== "tutar") throw new BadRequestException("İndirim türü geçersiz.");
    const deger = Number(govde.deger);
    if (!Number.isFinite(deger) || deger <= 0 || (tur === "yuzde" && deger > 100)) {
      throw new BadRequestException("İndirim değeri geçersiz.");
    }
    const kapsam = govde.kapsam as IndirimKapsami;
    if (!["abonelik", "lio", "hepsi"].includes(kapsam)) throw new BadRequestException("Kapsam geçersiz.");
    const sure = govde.sure as IndirimSuresi;
    if (!["ilk", "donem", "surekli"].includes(sure)) throw new BadRequestException("Süre geçersiz.");
    const donemSayisi = sure === "donem" ? Number(govde.donemSayisi) : null;
    if (sure === "donem" && (!Number.isInteger(donemSayisi) || donemSayisi! < 1)) {
      throw new BadRequestException("Ödeme sayısı en az 1 olmalı.");
    }
    const kullanimSiniri =
      govde.kullanimSiniri === null || govde.kullanimSiniri === undefined ? null : Number(govde.kullanimSiniri);
    if (kullanimSiniri !== null && (!Number.isInteger(kullanimSiniri) || kullanimSiniri < 1)) {
      throw new BadRequestException("Kullanım sınırı en az 1 olmalı.");
    }
    const sonTarih = govde.sonTarih ? new Date(govde.sonTarih) : null;
    if (sonTarih && Number.isNaN(sonTarih.getTime())) throw new BadRequestException("Son tarih geçersiz.");

    const { data, error } = await this.supabase.client
      .from("indirim_kodlari")
      .insert({
        kod,
        aciklama: govde.aciklama?.trim() || null,
        tur,
        deger,
        kapsam,
        plan_keys: govde.planKeys?.length ? govde.planKeys : null,
        periods: govde.periods?.length ? govde.periods : null,
        sure,
        donem_sayisi: donemSayisi,
        son_tarih: sonTarih?.toISOString() ?? null,
        kullanim_siniri: kullanimSiniri,
        created_by: adminId,
      })
      .select()
      .single();
    if (error) {
      if ((error as any).code === "23505") throw new BadRequestException("Bu kod zaten var.");
      throw error;
    }
    this.logger.log(`İndirim kodu oluşturuldu: ${kod} (${tur} ${deger}, ${kapsam}, ${sure}).`);
    return mapKod(data);
  }

  /** Kod kapatılır/açılır; değeri DEĞİŞTİRİLEMEZ (bkz. migration 140). */
  async aktiflikDegistir(id: string, aktif: boolean): Promise<void> {
    const { data, error } = await this.supabase.client
      .from("indirim_kodlari")
      .update({ aktif })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("İndirim kodu bulunamadı.");
  }

  // ============================================================ Yardımcılar

  private async kodBul(kodMetni: string): Promise<IndirimKodu | null> {
    const kod = kodNormallestir(kodMetni);
    if (!kod) return null;
    const { data, error } = await this.supabase.client.from("indirim_kodlari").select("*").eq("kod", kod).maybeSingle();
    if (error) throw error;
    return data ? mapKod(data) : null;
  }

  private async kullanimSayisi(kodId: string): Promise<number> {
    const { count, error } = await this.supabase.client
      .from("indirim_kullanimlari")
      .select("id", { count: "exact", head: true })
      .eq("kod_id", kodId);
    if (error) throw error;
    return count ?? 0;
  }

  private async kullandiMi(kodId: string, userId: string): Promise<boolean> {
    const { data, error } = await this.supabase.client
      .from("indirim_kullanimlari")
      .select("id")
      .eq("kod_id", kodId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return Boolean(data);
  }
}
