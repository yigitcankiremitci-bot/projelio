import { Injectable, Logger } from "@nestjs/common";
import { SupabaseService } from "../../database/supabase.service";
import { DemoAnlikGoruntuService, DemoTablo } from "./demo-anlik-goruntu.service";
import { KapsamAdi, KapsamIdleri, SILME_DALGALARI, ZIYARETCI_SATIRI } from "./demo-kapsam";

/** PostgREST tek istekte sınırsız satır kabul etmiyor; parça parça yazıyoruz. */
const YAZMA_PARCASI = 250;

/** Silme kurallarının okuduğu id listeleri, anlık görüntüdeki tablolardan çıkarılır. */
const KAPSAM_KAYNAKLARI: Record<KapsamAdi, string> = {
  kullanicilar: "users",
  organizasyon: "organizations",
  departmanlar: "departments",
  isler: "jobs",
  projeler: "projects",
  operasyonlar: "operations",
  rutinler: "operation_routines",
  cariler: "party",
  modulKayitlari: "module_records",
  gorevler: "tasks",
};

/**
 * Sıfırlamayı acil durumda tamamen durdurur. Normal yol admin panelindeki
 * "düzenleme kipi"; bu değişken, panele erişilemediğinde kullanılacak fren.
 * Her çağrıda okunuyor ki yeniden derleme gerekmesin.
 */
function sifirlamaKapaliMi(): boolean {
  const deger = (process.env.DEMO_SIFIRLAMA_KAPALI ?? "").trim().toLowerCase();
  return deger === "1" || deger === "true" || deger === "evet";
}

/**
 * DEMO VERİSİNİ HER GİRİŞTE İLK HALİNE DÖNDÜRÜR.
 *
 * Demo hesabı herkese açık (bkz. common/demo-hesap.ts): giren kişi görevi
 * siler, bütçeyi değiştirir, "test test" diye kayıt açar. Bunları engellemek
 * demoyu işe yaramaz hale getirirdi — o yüzden engellemiyoruz, geri alıyoruz.
 *
 * İki adım:
 *  1. SİL — demo kapsamındaki, id'si demo aralığının dışında kalan satırlar,
 *     yani ziyaretçinin EKLEDİKLERİ (bkz. demo-kapsam.ts).
 *  2. YAZ — anlık görüntüdeki satırlar upsert edilir; bu hem DEĞİŞTİRİLEN
 *     satırları eski değerlerine döndürür hem de SİLİNENLERİ geri getirir.
 *
 * Sahibi demoyu düzenlerken (admin panelinden düzenleme kipi) hiç çalışmaz.
 *
 * Bilerek yapılmayanlar: yüklenen dosyalar (storage), harcanan yapay zekâ
 * kredisi ve ziyaretçinin davet ettiği kullanıcı kayıtları geri alınmıyor.
 */
@Injectable()
export class DemoSifirlamaService {
  private readonly logger = new Logger(DemoSifirlamaService.name);
  /** Aynı anda iki ziyaretçi giriş yaparsa tek sıfırlama koşsun. */
  private calisan: Promise<void> | null = null;

  constructor(
    private supabase: SupabaseService,
    private anlikGoruntu: DemoAnlikGoruntuService
  ) {}

  /**
   * Sıfırlamayı çalıştırır. ASLA HATA FIRLATMAZ: sıfırlama başarısız diye
   * ziyaretçinin girişi engellenmemeli — bozuk ama açık bir demo, hiç
   * açılmayan demodan iyidir. Hata loglanır, bir sonraki giriş yeniden dener.
   */
  async sifirla(): Promise<void> {
    if (sifirlamaKapaliMi()) {
      this.logger.warn(
        "Demo sıfırlama KAPALI (DEMO_SIFIRLAMA_KAPALI): veri olduğu gibi bırakıldı."
      );
      return;
    }

    // DÜZENLEME KİPİ: sahibi demoyu elle güzelleştiriyor. Sıfırlarsak emeğini
    // siler; kipi kapattığında o hâl zaten yeni "ilk hâl" olarak kaydedilecek
    // (bkz. DemoAnlikGoruntuService.yakala).
    try {
      const kip = await this.anlikGoruntu.duzenlemeKipi();
      if (kip.aktif) {
        this.logger.log("Demo düzenleme kipi açık: veri sıfırlanmadı.");
        return;
      }
    } catch (error) {
      // Durum okunamıyorsa sıfırlamaya devam: demo bozuk kalmasın.
      this.logger.warn(
        `Düzenleme kipi okunamadı, sıfırlamaya devam ediliyor: ${error instanceof Error ? error.message : error}`
      );
    }

    if (this.calisan) return this.calisan;
    this.calisan = this.calistir().finally(() => {
      this.calisan = null;
    });
    return this.calisan;
  }

  private async calistir(): Promise<void> {
    const baslangic = Date.now();
    try {
      const veri = await this.anlikGoruntu.oku();
      const kapsam = this.kapsamIdleriniCikar(veri);
      const silinen = await this.ziyaretciSatirlariniSil(kapsam);
      const yazilan = await this.demoVerisiniGeriYaz(veri, kapsam);
      this.logger.log(
        `Demo verisi sıfırlandı: ${silinen} satır silindi, ${yazilan} satır yazıldı (${Date.now() - baslangic} ms).`
      );
    } catch (error) {
      this.logger.error(
        `Demo verisi sıfırlanamadı: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /** Silme kurallarının ihtiyaç duyduğu id listelerini anlık görüntüden çıkarır. */
  private kapsamIdleriniCikar(veri: DemoTablo[]): KapsamIdleri {
    const kapsam = {} as KapsamIdleri;
    for (const [ad, tablo] of Object.entries(KAPSAM_KAYNAKLARI) as [KapsamAdi, string][]) {
      kapsam[ad] = veri
        .filter((t) => t.table === tablo)
        .flatMap((t) => t.rows.map((r) => String(r.id)))
        .filter(Boolean);
    }
    return kapsam;
  }

  /** @returns silinen toplam satır sayısı (yalnızca loglamak için). */
  private async ziyaretciSatirlariniSil(kapsam: KapsamIdleri): Promise<number> {
    let silinen = 0;
    for (const dalga of SILME_DALGALARI) {
      const sonuclar = await Promise.all(
        dalga.map(async ({ tablo, sutun, kapsam: kapsamAdi }) => {
          const idler = kapsam[kapsamAdi];
          if (!idler || idler.length === 0) return 0;
          const { count, error } = await this.supabase.client
            .from(tablo)
            .delete({ count: "exact" })
            .in(sutun, idler)
            .or(ZIYARETCI_SATIRI);
          // Tablo yoksa ya da sütun adı değiştiyse demo yine de açılsın:
          // uyarı yazıp devam ediyoruz.
          if (error) {
            this.logger.warn(`Demo temizliği — ${tablo}.${sutun}: ${error.message}`);
            return 0;
          }
          if (count) this.logger.debug(`Demo temizliği — ${tablo}.${sutun}: ${count} satır silindi.`);
          return count ?? 0;
        })
      );
      silinen += sonuclar.reduce((a, b) => a + b, 0);
    }
    return silinen;
  }

  /**
   * Sıra ÖNEMLİ: anlık görüntüdeki tablo sırası bağımlılık sırası (önce
   * kullanıcılar ve şirket, sonra onlara bağlı kayıtlar). Paralelleştirmiyoruz,
   * yoksa çocuk satır ebeveyni yazılmadan gidip yabancı anahtar hatası alır.
   */
  private async demoVerisiniGeriYaz(veri: DemoTablo[], kapsam: KapsamIdleri): Promise<number> {
    let yazilan = 0;
    for (const { table, rows } of veri) {
      for (let i = 0; i < rows.length; i += YAZMA_PARCASI) {
        const parca = rows.slice(i, i + YAZMA_PARCASI);
        const { error } = await this.supabase.client.from(table).upsert(parca, { onConflict: "id" });
        if (!error) {
          yazilan += parca.length;
          continue;
        }
        if (await this.rutinCakismasiniCoz(table, error.message, kapsam)) {
          const { error: ikinciHata } = await this.supabase.client
            .from(table)
            .upsert(parca, { onConflict: "id" });
          if (!ikinciHata) {
            yazilan += parca.length;
            continue;
          }
          throw new Error(`${table} yazılamadı (ikinci deneme): ${ikinciHata.message}`);
        }
        throw new Error(`${table} yazılamadı: ${error.message}`);
      }
    }
    return yazilan;
  }

  /**
   * TEK ÖZEL DURUM: yinelenen görev çakışması.
   *
   * `operation_routines` yazıldığı anda veritabanındaki `operation_routines_resync`
   * tetikleyicisi (021_operations.sql) o rutinin gelecek tekrarlarını yeniden
   * üretiyor — rastgele id'lerle. Normalde sorun değil: ürettiği tarihler
   * bugünden ileri, anlık görüntüdeki tarihler ise geçmişte, çakışmıyorlar.
   * Ama ziyaretçi GELECEK tarihli hazır bir tekrarı silmişse tetikleyici onu
   * yeni bir id ile geri koyuyor ve anlık görüntüdeki satır artık
   * (routine_id, occurrence_on) tekil kısıtına takılıyor — id'ler farklı
   * olduğu için upsert bunu çakışma olarak göremiyor, bütün geri yükleme
   * orada duruyordu.
   *
   * Çözüm: tetikleyicinin ürettiği (demo aralığı dışındaki) tekrarları silip
   * bir kez daha denemek.
   *
   * @returns temizlik yapıldıysa true (çağıran yeniden denemeli)
   */
  private async rutinCakismasiniCoz(
    tablo: string,
    hataMesaji: string,
    kapsam: KapsamIdleri
  ): Promise<boolean> {
    if (tablo !== "tasks" || !hataMesaji.includes("tasks_routine_occurrence_unique")) return false;
    if (!kapsam.rutinler || kapsam.rutinler.length === 0) return false;

    const { count, error } = await this.supabase.client
      .from("tasks")
      .delete({ count: "exact" })
      .in("routine_id", kapsam.rutinler)
      .or(ZIYARETCI_SATIRI);
    if (error) {
      this.logger.warn(`Rutin çakışması temizlenemedi: ${error.message}`);
      return false;
    }
    this.logger.warn(`Rutin tekrar çakışması: ${count ?? 0} üretilmiş satır silinip yeniden denendi.`);
    return true;
  }
}
