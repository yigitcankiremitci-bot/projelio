import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseService } from "../../database/supabase.service";
import { kesimTarihiIso, SAKLAMA_GUN, type SaklamaAlani } from "./retention.rules";

/** `from(x).delete()` zincirinin tipi — filtreler bunu alıp aynısını döner. */
type SilmeSorgusu = ReturnType<ReturnType<SupabaseClient["from"]>["delete"]>;

/**
 * Saklama süresi dolmuş kayıtları siler.
 *
 * NEDEN VAR: gizlilik politikası §12 "Lio sohbet geçmişi düzenli olarak
 * temizlenir", "WhatsApp konuşma kayıtları en fazla 90 gün saklanır" diyordu
 * ama kodda bunu yapan hiçbir şey yoktu — kayıtlar sonsuza kadar birikiyordu.
 * Yayımlanmış bir metinde tutulmayan söz, hiç söz vermemekten kötüdür; iş
 * bunun için yazıldı. Süreler retention.rules.ts'te, politikayla birlikte.
 *
 * NEDEN account-purge.processor.ts'ten AYRI: o, kullanıcının TALEBİYLE başlayan
 * ve bekleme süresi dolunca tamamlanan bir silme. Bu ise kimsenin talebi
 * olmadan, sürenin dolması nedeniyle işleyen bir silme. İkisinin arızası da
 * ayrı görünsün.
 *
 * ACİL DURUM: `VERI_SAKLAMA_KAPALI=1` iş tamamen durur. Silme geri alınamaz;
 * beklenmedik bir davranış görülürse dağıtım beklemeden kapatılabilsin diye
 * var. Kapalıyken her koşuda log'a uyarı düşer, unutulmasın.
 */
@Injectable()
export class DataRetentionProcessor {
  private readonly logger = new Logger(DataRetentionProcessor.name);

  constructor(private supabase: SupabaseService) {}

  // Her gün 03:45 — hesap silme (03:30) bittikten sonra, diğer gece işlerinden
  // (04:00, 04:15, 04:30) önce. Silinen bir hesabın kayıtları buraya hiç
  // gelmesin diye sıra bilerek böyle.
  @Cron("45 3 * * *")
  async purge(): Promise<void> {
    if (process.env.VERI_SAKLAMA_KAPALI === "1") {
      this.logger.warn("VERI_SAKLAMA_KAPALI=1 — saklama süresi temizliği atlandı. Gizlilik politikası §12 bu süreleri taahhüt ediyor; kapalı kalmamalı.");
      return;
    }

    const simdi = new Date();

    // Sıra önemli: ham webhook olayı, doğurduğu mesajdan önce gitsin. Ters
    // sırada bir arıza, mesajı silip tam metnini içeren ham kopyayı bırakırdı.
    await this.sil("whatsappWebhookOlayi", "whatsapp_webhook_events", (sorgu) =>
      sorgu.lt("received_at", kesimTarihiIso("whatsappWebhookOlayi", simdi)).not("processed_at", "is", null)
    );

    await this.sil("whatsappMesaj", "whatsapp_messages", (sorgu) =>
      // Kuyrukta bekleyeni ellemiyoruz: 90 günden eski ama hâlâ 'queued' bir
      // satır varsa orada bir arıza vardır, silmek onu görünmez kılardı.
      sorgu.lt("created_at", kesimTarihiIso("whatsappMesaj", simdi)).neq("status", "queued")
    );

    // Mesajlar konuşmaya bağlı (on delete cascade) — konuşmayı silmek yeter.
    // Sayaç son mesajdan işliyor: aylardır sürdürülen bir sohbet silinmez.
    await this.sil("aiSohbet", "ai_conversations", (sorgu) =>
      sorgu.lt("updated_at", kesimTarihiIso("aiSohbet", simdi))
    );

    // Süresi dolmuş tek kullanımlık jetonlar. Üçü de aynı süreye tabi.
    for (const tablo of ["password_reset_tokens", "email_verification_tokens", "whatsapp_link_codes"]) {
      await this.sil("suresiDolmusJeton", tablo, (sorgu) =>
        sorgu.lt("expires_at", kesimTarihiIso("suresiDolmusJeton", simdi))
      );
    }
  }

  /**
   * Tek tablo için silme. Hata YUTULUR (loglanır): bir tablonun arızası
   * diğerlerinin temizlenmesini engellememeli, yoksa tek bir şema değişikliği
   * bütün saklama taahhüdünü sessizce durdurur.
   */
  private async sil(alan: SaklamaAlani, tablo: string, filtrele: (sorgu: SilmeSorgusu) => SilmeSorgusu): Promise<void> {
    try {
      const sorgu = this.supabase.client.from(tablo).delete({ count: "exact" });
      const { count, error } = await filtrele(sorgu);
      if (error) throw error;
      // Sıfırsa log'u kirletme; silindiyse iz kalsın — geri alınamaz bir işlem,
      // ne zaman ve ne kadar olduğu görülebilmeli.
      if (count) {
        this.logger.log(`${tablo}: ${SAKLAMA_GUN[alan]} günü aşan ${count} kayıt silindi.`);
      }
    } catch (error) {
      this.logger.error(`Saklama temizliği başarısız — ${tablo}: ${(error as Error).message}`);
    }
  }
}
