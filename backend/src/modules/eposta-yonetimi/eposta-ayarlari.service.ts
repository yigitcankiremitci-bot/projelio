import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { SupabaseService } from "../../database/supabase.service";

/**
 * E-posta sisteminin genel ayarları (tek satır, bkz. migration 119).
 * Okunamazsa varsayılan döner: ipucu turu bir ayar okunamadı diye durmamalı.
 */

export interface EpostaAyarlari {
  ipuclariAcik: boolean;
  /** Otomatik ipuçlarında Lio'nun günlük harcama tavanı (birim); null = sınırsız. */
  lioGunlukTavanBirim: number | null;
}

export const VARSAYILAN_EPOSTA_AYARLARI: EpostaAyarlari = { ipuclariAcik: true, lioGunlukTavanBirim: 5000 };

@Injectable()
export class EpostaAyarlariService {
  private readonly logger = new Logger(EpostaAyarlariService.name);

  constructor(private supabase: SupabaseService) {}

  async oku(): Promise<EpostaAyarlari> {
    const { data, error } = await this.supabase.client
      .from("eposta_ayarlari")
      .select("ipuclari_acik, lio_gunluk_tavan_birim")
      .eq("id", 1)
      .maybeSingle();
    if (error || !data) {
      if (error) this.logger.warn(`E-posta ayarları okunamadı, varsayılan kullanılıyor: ${error.message}`);
      return { ...VARSAYILAN_EPOSTA_AYARLARI };
    }
    return {
      ipuclariAcik: data.ipuclari_acik !== false,
      lioGunlukTavanBirim: data.lio_gunluk_tavan_birim == null ? null : Number(data.lio_gunluk_tavan_birim),
    };
  }

  async kaydet(girdi: Partial<EpostaAyarlari>, adminId: string): Promise<EpostaAyarlari> {
    const alanlar: Record<string, unknown> = { id: 1, updated_by: adminId, updated_at: new Date().toISOString() };
    if (girdi.ipuclariAcik !== undefined) {
      if (typeof girdi.ipuclariAcik !== "boolean") throw new BadRequestException("Geçersiz ayar.");
      alanlar.ipuclari_acik = girdi.ipuclariAcik;
    }
    if (girdi.lioGunlukTavanBirim !== undefined) {
      const t = girdi.lioGunlukTavanBirim;
      if (t !== null && (typeof t !== "number" || !Number.isFinite(t) || t < 0)) {
        throw new BadRequestException("Günlük tavan sıfır ya da pozitif bir sayı olmalı.");
      }
      alanlar.lio_gunluk_tavan_birim = t;
    }
    const { error } = await this.supabase.client.from("eposta_ayarlari").upsert(alanlar, { onConflict: "id" });
    if (error) throw error;
    return this.oku();
  }
}
