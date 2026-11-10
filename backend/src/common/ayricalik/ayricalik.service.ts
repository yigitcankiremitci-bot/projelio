import { Global, Injectable, Logger, Module } from "@nestjs/common";
import { ayricalikSatiriniCevir, BOS_AYRICALIK, type KullaniciAyricaliklari } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";

/**
 * Yöneticinin kullanıcıya verdiği ek haklar (kurallar: shared ayricalik.ts).
 *
 * Global: modül hakkı, kişi hakkı ve departman kuralı ayrı modüllerde karar
 * veriyor; üçü de buradan okusun, ayrıcalık tablosu tek yerden sorgulansın.
 *
 * Tablo okunamazsa (migration 192 uygulanmadan) ayrıcalık YOK sayılır:
 * paket kuralının çalışması ayrıcalıktan önemli, bir eksik migration modül
 * açmayı ya da kişi eklemeyi kilitlememeli.
 */
@Injectable()
export class AyricalikService {
  private readonly logger = new Logger(AyricalikService.name);

  constructor(private supabase: SupabaseService) {}

  async kullanicinin(userId: string | null | undefined): Promise<KullaniciAyricaliklari> {
    if (!userId) return { ...BOS_AYRICALIK };
    const { data, error } = await this.supabase.client
      .from("kullanici_ayricaliklari")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      this.logger.warn(`Ayrıcalık okunamadı (${userId}), yok sayılıyor: ${error.message}`);
      return { ...BOS_AYRICALIK };
    }
    return ayricalikSatiriniCevir(data);
  }

  /** Şirketin ayrıcalığı = sahibinin ayrıcalığı. */
  async sirketin(organizationId: string): Promise<KullaniciAyricaliklari> {
    const { data, error } = await this.supabase.client
      .from("organizations")
      .select("owner_id")
      .eq("id", organizationId)
      .maybeSingle();
    if (error) throw error;
    return this.kullanicinin(data?.owner_id);
  }
}

@Global()
@Module({ providers: [AyricalikService], exports: [AyricalikService] })
export class AyricalikModule {}
