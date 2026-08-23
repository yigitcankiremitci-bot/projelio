import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { SupabaseService } from "../../database/supabase.service";
import { NotificationsService } from "../notifications/notifications.service";
import { AiCreditsService } from "./ai-credits.service";
import {
  BALANCE_CRITICAL_USD,
  BALANCE_WARNING_USD,
  SPEND_SPIKE_FLOOR_USD,
  SPEND_SPIKE_MULTIPLIER,
} from "./ai-credits.config";
import {
  bakiyeUyarisi,
  gunAnahtari,
  gunlukPencere,
  sicramaUyarisi,
  sonGunlerinOrtalamasi,
  type SpendAlert,
} from "./ai-spend-alert";

/**
 * Anthropic harcamasını izler ve yöneticileri önceden uyarır.
 *
 * NEDEN GEREKTİ: bakiye bilgisi zaten vardı (yönetici panelindeki "Anthropic
 * bakiyesi" kartı, bkz. AiCreditsService.getProviderBalanceStatus) ama BAKMAK
 * gerekiyordu. Bakiye bittiğinde Lio tüm kullanıcılar için durur ve bunu ilk
 * öğrenen kişi, hata mesajı alan kullanıcı olur.
 *
 * İki ayrı kontrol, iki ayrı arıza biçimi için:
 *   * Bakiye eşiği — para yavaş yavaş bitiyor. Günlük kontrol yeterli.
 *   * Sıçrama — kaçak bir döngü ya da kötüye kullanım bakiyeyi saatler içinde
 *     bitirebilir; bunu yalnızca bakiye eşiğiyle yakalamak 24 saat geç kalmak olur.
 *
 * TEKRAR UYARI DAVRANIŞI: bilerek "durum tutulmuyor". Eşiğin altında kalındığı
 * SÜRECE her gün bir hatırlatma gider. Bir kez uyarıp susmak, tam da unutulması
 * en pahalı olan durumda sessiz kalmak demekti. Ayrıca durum tutmamak, deploy
 * sonrası "uyarı zaten gönderilmişti" sanıp susma riskini de ortadan kaldırıyor.
 */
@Injectable()
export class AiSpendAlertProcessor {
  private readonly logger = new Logger(AiSpendAlertProcessor.name);

  constructor(
    private supabase: SupabaseService,
    private notificationsService: NotificationsService,
    private credits: AiCreditsService
  ) {}

  // Her gün 09:05 — günlük özet işiyle (09:00) çakışmasın diye beş dakika sonra.
  @Cron("5 9 * * *")
  async checkSpend(): Promise<void> {
    try {
      const uyarilar = await this.uyarilariHesapla();
      if (uyarilar.length === 0) return;

      const adminIds = await this.adminKullanicilar();
      if (adminIds.length === 0) {
        // Uyarı üretildi ama gidecek kimse yok — sessiz kalmak yerine log'a yaz.
        this.logger.warn(
          `Harcama uyarısı var ama admin rolünde kullanıcı bulunamadı: ${uyarilar.map((u) => u.baslik).join(", ")}`
        );
        return;
      }

      for (const uyari of uyarilar) {
        this.logger.warn(`[${uyari.seviye}] ${uyari.baslik} — ${uyari.govde}`);
        for (const userId of adminIds) {
          await this.notificationsService.notifyUser(userId, "ai_spend_alert", uyari.baslik, uyari.govde, "/admin");
        }
      }
    } catch (error) {
      // Uyarı mekanizmasının kendi arızası uygulamayı etkilememeli; ama sessizce
      // ölürse "uyarı gelmiyor demek ki sorun yok" yanılgısı doğar — o yüzden log.
      this.logger.error(`Harcama uyarısı kontrolü başarısız: ${(error as Error).message}`);
    }
  }

  private async uyarilariHesapla(): Promise<SpendAlert[]> {
    const [durum, gunlukToplam] = await Promise.all([
      this.credits.getProviderBalanceStatus(),
      this.sonGunlerinHarcamasi(),
    ]);

    const { duneUsd, oncekiOrtalamaUsd } = gunlukPencere(gunlukToplam, new Date());

    // Bakiye uyarısındaki "kaç gün yeter" hesabı için son 7 günün ortalaması —
    // dün dahil, çünkü burada amaç trendi değil MEVCUT hızı ölçmek. (Sıçrama
    // kontrolündeki pencere farklı: orada dün, kendisinden önceki 7 güne karşı
    // karşılaştırılıyor.)
    const sonYediGunOrtalamasi = sonGunlerinOrtalamasi(gunlukToplam, new Date(), 7);

    const uyarilar: SpendAlert[] = [];

    const bakiye = bakiyeUyarisi({
      remainingUsd: durum.remainingUsd,
      gunlukOrtalamaUsd: Math.max(sonYediGunOrtalamasi, 0),
      criticalUsd: BALANCE_CRITICAL_USD,
      warningUsd: BALANCE_WARNING_USD,
    });
    if (bakiye) uyarilar.push(bakiye);

    const sicrama = sicramaUyarisi({
      duneUsd,
      oncekiOrtalamaUsd,
      katsayi: SPEND_SPIKE_MULTIPLIER,
      tabanUsd: SPEND_SPIKE_FLOOR_USD,
    });
    if (sicrama) uyarilar.push(sicrama);

    return uyarilar;
  }

  /** Son 10 günün kullanım maliyetini gün bazında toplar. */
  private async sonGunlerinHarcamasi(): Promise<Map<string, number>> {
    const since = new Date();
    since.setDate(since.getDate() - 10);

    const { data, error } = await this.supabase.client
      .from("ai_credit_transactions")
      .select("cost_usd, created_at")
      .eq("type", "usage")
      .gte("created_at", since.toISOString());
    if (error) throw error;

    const toplam = new Map<string, number>();
    for (const row of data ?? []) {
      const anahtar = gunAnahtari(new Date((row as any).created_at));
      toplam.set(anahtar, (toplam.get(anahtar) ?? 0) + Number((row as any).cost_usd ?? 0));
    }
    return toplam;
  }

  private async adminKullanicilar(): Promise<string[]> {
    const { data, error } = await this.supabase.client.from("users").select("id").eq("role", "admin");
    if (error) throw error;
    return (data ?? []).map((r: any) => r.id);
  }
}
