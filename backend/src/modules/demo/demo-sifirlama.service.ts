import { Injectable, Logger } from "@nestjs/common";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SupabaseService } from "../../database/supabase.service";
import { DEMO_HESAP } from "../../common/demo-hesap";

/** database/demo/celikhan-demo.json biçimi: tablo adı + o tablonun satırları. */
type DemoTablo = { table: string; rows: Record<string, unknown>[] };

/**
 * Demo satırlarının id aralığı.
 *
 * Bütün demo verisi `ce11...` ile başlayan uuid'lerle yüklendi; ziyaretçinin
 * oluşturduğu her satır ise rastgele bir uuid alır. uuid sütununda `like`
 * kullanamıyoruz (PostgREST filtrede `id::text` cast'i yapamaz, Postgres de
 * uuid ~~ text karşılaştırmasını reddeder), ama uuid sıralanabilir bir tip:
 * bu iki sınırın DIŞINDA kalan her satır ziyaretçi eseridir.
 */
const DEMO_ID_ALT = "ce110000-0000-0000-0000-000000000000";
const DEMO_ID_UST = "ce11ffff-ffff-ffff-ffff-ffffffffffff";
const ZIYARETCI_SATIRI = `id.lt.${DEMO_ID_ALT},id.gt.${DEMO_ID_UST}`;

/** Tek bir silme kuralı: "şu tabloda, şu sütunu şu id'lere bakan satırlar". */
type SilmeKurali = { tablo: string; sutun: string; kapsam: keyof KapsamIdleri };

type KapsamIdleri = {
  kullanicilar: string[];
  organizasyon: string[];
  departmanlar: string[];
  isler: string[];
  projeler: string[];
  operasyonlar: string[];
  rutinler: string[];
  cariler: string[];
};

/**
 * Silme dalgaları. Aynı dalgadaki istekler paralel gider; dalgalar sırayla
 * çalışır ki çocuk satırlar ebeveynlerinden önce silinsin. (Şemadaki yabancı
 * anahtarların çoğu zaten `on delete cascade`, bu sıralama emniyet payı.)
 */
const SILME_DALGALARI: SilmeKurali[][] = [
  [
    // Ziyaretçi her şeyi demo kullanıcısı olarak yazar; yorum/bildirim gibi
    // "kime ait" bilgisi net olan tablolarda kapsam doğrudan kullanıcıdır.
    { tablo: "task_comments", sutun: "user_id", kapsam: "kullanicilar" },
    { tablo: "post_comments", sutun: "user_id", kapsam: "kullanicilar" },
    { tablo: "module_record_versions", sutun: "approved_by", kapsam: "kullanicilar" },
    { tablo: "notifications", sutun: "user_id", kapsam: "kullanicilar" },
    { tablo: "personal_todos", sutun: "user_id", kapsam: "kullanicilar" },
  ],
  [
    { tablo: "tasks", sutun: "project_id", kapsam: "projeler" },
    { tablo: "tasks", sutun: "operation_id", kapsam: "operasyonlar" },
    { tablo: "tasks", sutun: "department_id", kapsam: "departmanlar" },
    // Rutin motorunun ürettiği yinelenen görevler. AYRI BİR KURAL OLMAK ZORUNDA:
    // tasks üzerinde (routine_id, occurrence_on) tekil kısıtı var, aynı rutin+tarih
    // ikinci kez yazılamıyor. Motorun ürettiği satır dururken anlık görüntüdeki
    // eşdeğerini yazmaya kalkarsak upsert `id` üzerinden çakışmayı göremez ve
    // bütün geri yükleme o noktada patlar.
    { tablo: "tasks", sutun: "routine_id", kapsam: "rutinler" },
    { tablo: "outputs", sutun: "project_id", kapsam: "projeler" },
    { tablo: "project_members", sutun: "project_id", kapsam: "projeler" },
    { tablo: "project_posts", sutun: "project_id", kapsam: "projeler" },
    { tablo: "budget_transactions", sutun: "project_id", kapsam: "projeler" },
    { tablo: "budget_transactions", sutun: "operation_id", kapsam: "operasyonlar" },
    { tablo: "budget_transactions", sutun: "department_id", kapsam: "departmanlar" },
    { tablo: "operation_routines", sutun: "operation_id", kapsam: "operasyonlar" },
    { tablo: "party_contact", sutun: "party_id", kapsam: "cariler" },
    { tablo: "department_members", sutun: "department_id", kapsam: "departmanlar" },
  ],
  [
    { tablo: "projects", sutun: "job_id", kapsam: "isler" },
    { tablo: "operations", sutun: "job_id", kapsam: "isler" },
    { tablo: "job_members", sutun: "job_id", kapsam: "isler" },
  ],
  [
    { tablo: "jobs", sutun: "organization_id", kapsam: "organizasyon" },
    { tablo: "module_records", sutun: "organization_id", kapsam: "organizasyon" },
    { tablo: "module_members", sutun: "organization_id", kapsam: "organizasyon" },
    { tablo: "organization_modules", sutun: "organization_id", kapsam: "organizasyon" },
    { tablo: "party", sutun: "organization_id", kapsam: "organizasyon" },
    { tablo: "products", sutun: "organization_id", kapsam: "organizasyon" },
    { tablo: "departments", sutun: "organization_id", kapsam: "organizasyon" },
  ],
  [
    // Ziyaretçi kendine yeni bir şirket açtıysa o da gitsin.
    { tablo: "organizations", sutun: "owner_id", kapsam: "kullanicilar" },
  ],
];

const DOSYA_ADI = "celikhan-demo.json";

/** PostgREST tek istekte sınırsız satır kabul etmiyor; parça parça yazıyoruz. */
const YAZMA_PARCASI = 250;

/**
 * DEMO VERİSİNİ HER GİRİŞTE İLK HALİNE DÖNDÜRÜR.
 *
 * Demo hesabı herkese açık (bkz. common/demo-hesap.ts): giren kişi görevi
 * siler, bütçeyi değiştirir, "test test" diye kayıt açar. Bunları engellemek
 * demoyu işe yaramaz hale getirirdi — o yüzden engellemiyoruz, geri alıyoruz.
 *
 * İki adım:
 *  1. SİL — demo kapsamındaki, id'si demo aralığının dışında kalan satırlar,
 *     yani ziyaretçinin EKLEDİKLERİ.
 *  2. YAZ — `database/demo/celikhan-demo.json` içindeki 1249 satır upsert
 *     edilir; bu hem DEĞİŞTİRİLEN satırları eski değerlerine döndürür hem de
 *     SİLİNEN satırları geri getirir.
 *
 * Bilerek yapılmayanlar: yüklenen dosyalar (storage), harcanan yapay zekâ
 * kredisi ve ziyaretçinin davet ettiği kullanıcı kayıtları geri alınmıyor.
 */
@Injectable()
export class DemoSifirlamaService {
  private readonly logger = new Logger(DemoSifirlamaService.name);
  private veriKumesi: DemoTablo[] | null = null;
  /** Aynı anda iki ziyaretçi giriş yaparsa tek sıfırlama koşsun. */
  private calisan: Promise<void> | null = null;

  constructor(private supabase: SupabaseService) {}

  /**
   * Sıfırlamayı çalıştırır. ASLA HATA FIRLATMAZ: sıfırlama başarısız diye
   * ziyaretçinin girişi engellenmemeli — bozuk ama açık bir demo, hiç
   * açılmayan demodan iyidir. Hata loglanır, bir sonraki giriş yeniden dener.
   */
  async sifirla(): Promise<void> {
    if (this.calisan) return this.calisan;
    this.calisan = this.calistir().finally(() => {
      this.calisan = null;
    });
    return this.calisan;
  }

  private async calistir(): Promise<void> {
    const baslangic = Date.now();
    try {
      const veri = this.veriyiOku();
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

  /**
   * Anlık görüntü dosyası. Bir kez okunup bellekte tutulur (~600 KB).
   *
   * Yol neden aday listesi: çalışma dizini duruma göre değişiyor. Render'da
   * `node backend/dist/main` DEPO KÖKÜNDEN, yerelde `nest start --watch` ise
   * `backend/` içinden koşuyor. __dirname'e göre çıkmak ikisinde de aynı
   * derinlik (dist|src /modules/demo -> dört üst = kök), o da yedek.
   */
  private veriyiOku(): DemoTablo[] {
    if (this.veriKumesi) return this.veriKumesi;
    const adaylar = [
      join(process.cwd(), "database", "demo", DOSYA_ADI),
      join(process.cwd(), "..", "database", "demo", DOSYA_ADI),
      join(__dirname, "..", "..", "..", "..", "database", "demo", DOSYA_ADI),
    ];
    const yol = adaylar.find((aday) => existsSync(aday));
    if (!yol) throw new Error(`Demo anlık görüntüsü bulunamadı. Bakılan yollar: ${adaylar.join(", ")}`);
    this.veriKumesi = JSON.parse(readFileSync(yol, "utf8")) as DemoTablo[];
    return this.veriKumesi;
  }

  /** Silme kurallarının ihtiyaç duyduğu id listelerini veri kümesinden çıkarır. */
  private kapsamIdleriniCikar(veri: DemoTablo[]): KapsamIdleri {
    const idler = (tablo: string): string[] =>
      veri
        .filter((t) => t.table === tablo)
        .flatMap((t) => t.rows.map((r) => String(r.id)))
        .filter(Boolean);

    return {
      kullanicilar: idler("users"),
      organizasyon: idler("organizations"),
      departmanlar: idler("departments"),
      isler: idler("jobs"),
      projeler: idler("projects"),
      operasyonlar: idler("operations"),
      rutinler: idler("operation_routines"),
      cariler: idler("party"),
    };
  }

  /** @returns silinen toplam satır sayısı (yalnızca loglamak için). */
  private async ziyaretciSatirlariniSil(kapsam: KapsamIdleri): Promise<number> {
    let silinen = 0;
    for (const dalga of SILME_DALGALARI) {
      const sonuclar = await Promise.all(
        dalga.map(async ({ tablo, sutun, kapsam: kapsamAdi }) => {
          const idler = kapsam[kapsamAdi];
          if (idler.length === 0) return 0;
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
   * Sıra ÖNEMLİ: dosyadaki tablo sırası bağımlılık sırası (önce kullanıcılar ve
   * şirket, sonra onlara bağlı kayıtlar). Paralelleştirmiyoruz, yoksa çocuk
   * satır ebeveyni yazılmadan gidip yabancı anahtar hatası alır.
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
   * bir kez daha denemek. Sonrasında tetikleyici bir dahaki rutin
   * değişikliğinde eksikleri yine tamamlar.
   *
   * @returns temizlik yapıldıysa true (çağıran yeniden denemeli)
   */
  private async rutinCakismasiniCoz(
    tablo: string,
    hataMesaji: string,
    kapsam: KapsamIdleri
  ): Promise<boolean> {
    if (tablo !== "tasks" || !hataMesaji.includes("tasks_routine_occurrence_unique")) return false;
    if (kapsam.rutinler.length === 0) return false;

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
