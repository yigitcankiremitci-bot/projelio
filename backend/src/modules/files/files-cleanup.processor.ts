import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { SupabaseService } from "../../database/supabase.service";
import { FilesService } from "./files.service";

/**
 * Yarım kalan parçalı yükleme oturumlarını temizler.
 *
 * NEDEN GEREKTİ: 8 MB üstü dosyalar tarayıcıdan doğrudan Drive/OneDrive'a
 * yükleniyor; bizim tarafta önce bir `file_upload_sessions` satırı açılıyor ve
 * yükleme bitince "tamamlandı" diye işaretleniyor. Yükleme yarıda kalırsa
 * (sekme kapandı, bağlantı koptu, kullanıcı VAZGEÇTİ) o satır açık kalıyor.
 *
 * Temizleyen SQL fonksiyonu (`purge_stale_upload_sessions`, bkz. migration 022/023)
 * yazılmış ama HİÇBİR YERDEN ÇAĞRILMIYORDU — yani süresi dolmuş oturumlar
 * tabloda sonsuza kadar birikiyordu. Yüklemeyi iptal etme özelliği eklendikten
 * sonra bu daha sık olacağı için zamanlanmış çağrı buraya kondu.
 *
 * Fonksiyon yalnızca `completed_at is null` VE `expires_at` geçmiş satırları
 * siliyor; süren bir yüklemeye dokunma ihtimali yok.
 */
@Injectable()
export class FilesCleanupProcessor {
  private readonly logger = new Logger(FilesCleanupProcessor.name);

  constructor(
    private supabase: SupabaseService,
    private filesService: FilesService
  ) {}

  /**
   * Tek koşuda en fazla kaç oturum mutabakata sokulur.
   *
   * Her biri sağlayıcıya en az bir istek demek; gece işi diye sınırsız
   * bırakmak, birikmiş bir kuyrukta Drive kotasını yemek olurdu. Kalanlar
   * ertesi gece ele alınır.
   */
  private static readonly RECONCILE_BATCH = 50;

  /**
   * Sahipsiz kalmış yüklemeleri sağlayıcıyla karşılaştırır.
   *
   * NEDEN GEREKLİ: dosya, son parça Drive/OneDrive'a ulaştığı anda ORADA
   * oluşuyor; Projelio ise ancak tarayıcı tamamlama isteğini yapabilirse
   * haberdar oluyor. Tarayıcı bunu yapamadan sekme kapanırsa (kullanıcının
   * yaşadığı durum tam buydu) dosya Drive'da kalıyor, Projelio'da hiç
   * görünmüyor ve kullanıcının elinde düzeltecek bir şey olmuyor.
   *
   * reconcileUploadSession dosyayı bulursa kaydı yaratıyor, bulamazsa oturumu
   * sağlayıcı tarafında iptal ediyor. İkisi de eski davranıştan (satırı sessizce
   * silmek) iyi: o, Drive'daki dosyayı sonsuza kadar yetim bırakıyordu.
   */
  private async reconcileAbandonedSessions(): Promise<void> {
    const { data, error } = await this.supabase.client
      .from("file_upload_sessions")
      .select("id, user_id")
      .is("completed_at", null)
      .lt("expires_at", new Date().toISOString())
      .limit(FilesCleanupProcessor.RECONCILE_BATCH);
    if (error) throw error;

    let kazanilan = 0;
    for (const session of data ?? []) {
      try {
        const sonuc = await this.filesService.reconcileUploadSession(session.id, session.user_id);
        if (sonuc.status === "completed") kazanilan += 1;
      } catch (err) {
        // Tek bir oturumun çuvallaması diğerlerini durdurmasın; satır yerinde
        // kalır ve ertesi gece yeniden denenir.
        this.logger.warn(`Yükleme oturumu (${session.id}) mutabakatı başarısız: ${(err as Error).message}`);
      }
    }

    if (kazanilan > 0) {
      this.logger.log(`${kazanilan} yarım kalmış yükleme tamamlanıp dosya listesine eklendi.`);
    }
  }

  // Her gün 04:15 — diğer gece işlerinin (04:00, 04:30) arasına denk gelmesin diye.
  @Cron("15 4 * * *")
  async purgeStaleUploadSessions(): Promise<void> {
    try {
      // ÖNCE mutabakat, SONRA silme: sıra tersine dönerse satır silinir ve
      // Drive'daki dosyayı bir daha kimse bulamaz.
      await this.reconcileAbandonedSessions();

      const { data, error } = await this.supabase.client.rpc("purge_stale_upload_sessions");
      if (error) throw error;

      const silinen = Number(data ?? 0);
      // Sıfırsa log'u kirletme; bir şey silindiyse görünür olsun.
      if (silinen > 0) this.logger.log(`Süresi dolmuş ${silinen} yükleme oturumu temizlendi.`);
    } catch (error) {
      // Temizlik arızası uygulamayı etkilemez, ama sessizce ölürse tablo yine
      // büyümeye devam eder ve kimse fark etmez.
      this.logger.error(`Yükleme oturumu temizliği başarısız: ${(error as Error).message}`);
    }
  }
}
