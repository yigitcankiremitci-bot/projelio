import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { SupabaseService } from "../../database/supabase.service";
import {
  IPUCLARI,
  ipuclariniBirlestir,
  KOD_SIRA_ADIMI,
  type EtkinIpucu,
  type IpucuAyari,
} from "../notifications/ipucu.icerik";

/**
 * İpuçlarının tek kaynağı: koddaki varsayılanlar + yöneticinin kayıtları
 * (bkz. migration 119, ipucu.icerik.ts > ipuclariniBirlestir).
 *
 * Tablo okunamazsa (migration uygulanmadan) koddaki liste döner: ipucu turu
 * yöneticinin ayarı yüzünden durmamalı, en kötü ihtimalle varsayılanlarla
 * sürer.
 */

export interface IpucuYamasi {
  aktif?: boolean;
  lioIle?: boolean;
  baslik?: string | null;
  govde?: string | null;
  link?: string | null;
  dugme?: string | null;
}

const SINIR = { baslik: 120, govde: 3000, link: 300, dugme: 40 } as const;

@Injectable()
export class IpucuDeposuService {
  private readonly logger = new Logger(IpucuDeposuService.name);

  constructor(private supabase: SupabaseService) {}

  async liste(): Promise<EtkinIpucu[]> {
    return ipuclariniBirlestir(IPUCLARI, await this.ayarlar());
  }

  async bul(anahtar: string): Promise<EtkinIpucu> {
    const ipucu = (await this.liste()).find((i) => i.anahtar === anahtar);
    if (!ipucu) throw new NotFoundException("İpucu bulunamadı");
    return ipucu;
  }

  /** Yöneticinin yeni ipucu. Listenin sonuna eklenir. */
  async ekle(girdi: IpucuYamasi, adminId: string): Promise<EtkinIpucu> {
    const temiz = this.dogrula(girdi, true);
    const liste = await this.liste();
    const sonSira = liste.length ? Math.max(...liste.map((i) => i.sira)) : 0;
    const { data, error } = await this.supabase.client
      .from("eposta_ipuclari")
      .insert({
        kod: null,
        sira: sonSira + KOD_SIRA_ADIMI,
        aktif: girdi.aktif ?? true,
        lio_ile: girdi.lioIle ?? false,
        ...temiz,
        updated_by: adminId,
      })
      .select("id")
      .single();
    if (error) throw error;
    return this.bul(data.id);
  }

  /**
   * Bir ipucunu günceller. Koddaki ipucu için satır YOKSA açılır (kod ile);
   * metin alanlarına null yazmak "koddakine dön" demektir.
   */
  async guncelle(anahtar: string, girdi: IpucuYamasi, adminId: string): Promise<EtkinIpucu> {
    const mevcut = await this.bul(anahtar);
    const temiz = this.dogrula(girdi, false);
    const alanlar: Record<string, unknown> = { ...temiz, updated_by: adminId };
    if (girdi.aktif !== undefined) alanlar.aktif = girdi.aktif;
    if (girdi.lioIle !== undefined) alanlar.lio_ile = girdi.lioIle;

    if (mevcut.ayarId) {
      // Yöneticinin kendi ipucunda başlık ve gövde boşaltılamaz — koddaki bir
      // karşılığı yok, boşalırsa ipucu listeden sessizce düşerdi.
      if (mevcut.kaynak === "ozel" && (alanlar.baslik === null || alanlar.govde === null)) {
        throw new BadRequestException("Başlık ve gövde boş bırakılamaz.");
      }
      const { error } = await this.supabase.client.from("eposta_ipuclari").update(alanlar).eq("id", mevcut.ayarId);
      if (error) throw error;
    } else {
      const { error } = await this.supabase.client
        .from("eposta_ipuclari")
        .insert({ kod: anahtar, sira: mevcut.sira, aktif: mevcut.aktif, lio_ile: mevcut.lioIle, ...alanlar });
      if (error) throw error;
    }
    return this.bul(anahtar);
  }

  /**
   * Yöneticinin ipucunu siler; koddaki ipucunda ise yalnızca ayarları sıfırlar
   * (varsayılan metin, sıra, açık). Koddaki ipucunu tamamen kaldırmak
   * isteyen onu KAPATIR — silinse bir sonraki okumada varsayılanıyla geri gelirdi.
   */
  async sil(anahtar: string): Promise<void> {
    const mevcut = await this.bul(anahtar);
    if (!mevcut.ayarId) return;
    const { error } = await this.supabase.client.from("eposta_ipuclari").delete().eq("id", mevcut.ayarId);
    if (error) throw error;
  }

  /** Verilen sıraya göre yeniden numaralar; listede olmayanlar sona kalır. */
  async sirala(anahtarlar: unknown, adminId: string): Promise<EtkinIpucu[]> {
    if (!Array.isArray(anahtarlar) || anahtarlar.some((a) => typeof a !== "string")) {
      throw new BadRequestException("Sıralama listesi bekleniyor");
    }
    const liste = await this.liste();
    const siraliAnahtarlar = [
      ...(anahtarlar as string[]).filter((a) => liste.some((i) => i.anahtar === a)),
      ...liste.map((i) => i.anahtar).filter((a) => !(anahtarlar as string[]).includes(a)),
    ];
    for (const [i, anahtar] of siraliAnahtarlar.entries()) {
      const ipucu = liste.find((x) => x.anahtar === anahtar)!;
      const sira = i * KOD_SIRA_ADIMI;
      if (ipucu.sira === sira) continue;
      if (ipucu.ayarId) {
        const { error } = await this.supabase.client
          .from("eposta_ipuclari")
          .update({ sira, updated_by: adminId })
          .eq("id", ipucu.ayarId);
        if (error) throw error;
      } else {
        const { error } = await this.supabase.client
          .from("eposta_ipuclari")
          .insert({ kod: anahtar, sira, aktif: ipucu.aktif, lio_ile: ipucu.lioIle, updated_by: adminId });
        if (error) throw error;
      }
    }
    return this.liste();
  }

  private dogrula(girdi: IpucuYamasi, yeni: boolean): Record<string, string | null> {
    const sonuc: Record<string, string | null> = {};
    for (const alan of ["baslik", "govde", "link", "dugme"] as const) {
      const deger = girdi[alan];
      if (deger === undefined) continue;
      if (deger === null || (typeof deger === "string" && deger.trim() === "")) {
        sonuc[alan] = null;
        continue;
      }
      if (typeof deger !== "string") throw new BadRequestException("Geçersiz ipucu alanı.");
      const temiz = deger.trim();
      if (temiz.length > SINIR[alan]) throw new BadRequestException("İpucu metni çok uzun.");
      if (alan === "link" && !(temiz.startsWith("/") && !temiz.startsWith("//")) && !/^https:\/\//i.test(temiz)) {
        throw new BadRequestException("Bağlantı / ile başlayan bir uygulama yolu ya da https:// adresi olmalı.");
      }
      sonuc[alan] = temiz;
    }
    if (yeni && (!sonuc.baslik || !sonuc.govde)) throw new BadRequestException("Başlık ve gövde zorunlu.");
    return sonuc;
  }

  private async ayarlar(): Promise<IpucuAyari[]> {
    const { data, error } = await this.supabase.client
      .from("eposta_ipuclari")
      .select("id, kod, sira, aktif, lio_ile, baslik, govde, link, dugme")
      .limit(500);
    if (error) {
      this.logger.warn(`İpucu ayarları okunamadı, koddaki liste kullanılıyor: ${error.message}`);
      return [];
    }
    return (data ?? []).map((r: any) => ({
      id: r.id,
      kod: r.kod,
      sira: Number(r.sira) || 0,
      aktif: r.aktif !== false,
      lioIle: r.lio_ile === true,
      baslik: r.baslik,
      govde: r.govde,
      link: r.link,
      dugme: r.dugme,
    }));
  }
}
