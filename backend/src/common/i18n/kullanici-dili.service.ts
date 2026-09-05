import { Global, Injectable, Module } from "@nestjs/common";
import { defaultLocale, isLocale } from "@projelio/shared";
import type { Locale } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";

/**
 * Bir kullanıcının arayüz dilini bulur.
 *
 * NEDEN ÖNBELLEK: bildirim gönderilen her yerde bu sorulacak (görev atama,
 * yorum, dosya yükleme, günlük özet…) ve dil neredeyse hiç değişmiyor. Her
 * bildirimde bir SELECT atmak, bildirimi ana işlemden bağımsız tutma çabasını
 * (bkz. notifyUserSafe) boşa çıkarırdı.
 *
 * Önbellek ÖMÜRLÜ: kullanıcı Ayarlar'dan dilini değiştirdiğinde sunucu bunu
 * ancak süre dolunca görür. Beş dakikalık gecikme, "dili değiştirdim ama
 * e-posta hâlâ eski dilde" şikâyetini doğurmayacak kadar kısa; sorguyu anlamlı
 * ölçüde azaltacak kadar uzun.
 *
 * Hata hâlinde varsayılana düşülür ve YUTULUR: dil bilinmiyor diye bildirim
 * gönderilmemesi, yanlış dilde gönderilmesinden çok daha kötü.
 */

const OMUR_MS = 5 * 60 * 1000;

@Injectable()
export class KullaniciDiliService {
  private readonly onbellek = new Map<string, { locale: Locale; zaman: number }>();

  constructor(private readonly supabase: SupabaseService) {}

  async diliniBul(userId: string): Promise<Locale> {
    const kayit = this.onbellek.get(userId);
    if (kayit && Date.now() - kayit.zaman < OMUR_MS) return kayit.locale;

    let locale: Locale = defaultLocale;
    try {
      const { data } = await this.supabase.client
        .from("users")
        .select("locale")
        .eq("id", userId)
        .maybeSingle();
      // NULL = kullanıcı seçim yapmadı. Sunucunun elinde tarayıcı ipucu yok
      // (bildirim arka planda üretiliyor), o yüzden varsayılan geçerli.
      if (isLocale(data?.locale)) locale = data.locale;
    } catch {
      // Bkz. başlıktaki gerekçe: dil sorgusu bildirimin önüne geçmemeli.
    }

    this.onbellek.set(userId, { locale, zaman: Date.now() });
    return locale;
  }

  /** Kullanıcı dilini değiştirdiğinde çağrılır; bir sonraki okuma tazelenir. */
  unut(userId: string): void {
    this.onbellek.delete(userId);
  }
}

/**
 * Global: dil neredeyse her modülden soruluyor (bildirim, e-posta, Lio,
 * WhatsApp). 46 modülün imports'una tek tek eklemek yerine SupabaseService
 * ile aynı deseni izliyor.
 */
@Global()
@Module({
  providers: [KullaniciDiliService],
  exports: [KullaniciDiliService],
})
export class KullaniciDiliModule {}
