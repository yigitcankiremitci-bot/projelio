import { Injectable, Logger } from "@nestjs/common";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SupabaseService } from "../../database/supabase.service";
import {
  DEMO_EPOSTA_SONU,
  DEMO_ID_ALT,
  DEMO_ID_UST,
  KapsamIdleri,
  YAKALAMA_KURALLARI,
  ebeveynOnce,
} from "./demo-kapsam";

/** Anlık görüntü biçimi: tablo adı + o tablonun satırları, geri yükleme sırasında. */
export type DemoTablo = { table: string; rows: Record<string, unknown>[] };

export type DuzenlemeKipi = { aktif: boolean; acan?: string; acildi?: string };

export type AnlikGoruntuOzeti = { tabloSayisi: number; satirSayisi: number; alindi: string | null; kaynak: "veritabani" | "dosya" | "yok" };

const DOSYA_ADI = "celikhan-demo.json";
const DURUM_ANAHTARI = "duzenleme_kipi";
/** PostgREST `in.()` listesi URL'e sığmalı; id'ler parça parça sorgulanıyor. */
const SORGU_PARCASI = 80;

/**
 * DEMONUN "İLK HÂLİ"Nİ SAKLAR VE YENİLER.
 *
 * İlk hâl veritabanındaki `demo_anlik_goruntu` tablosunda duruyor (migration
 * 075). Depodaki `database/demo/celikhan-demo.json` ise FABRİKA AYARI: tablo
 * henüz doldurulmadıysa ondan okunuyor, böylece migration uygulanmadan da
 * sistem çalışmaya devam ediyor.
 *
 * NEDEN VERİTABANINDA: sahibi demoyu panelden düzenleyip "kaydet" diyebilsin.
 * Dosyaya yazsaydık her kaydetme commit + yeniden dağıtım isterdi, üstelik
 * Render'ın dosya sistemi kalıcı değil.
 */
@Injectable()
export class DemoAnlikGoruntuService {
  private readonly logger = new Logger(DemoAnlikGoruntuService.name);
  private dosyaOnbellegi: DemoTablo[] | null = null;

  constructor(private supabase: SupabaseService) {}

  // ------------------------------------------------------------------ okuma

  /** Geri yüklenecek veri. Önce veritabanı, yoksa fabrika ayarı. */
  async oku(): Promise<DemoTablo[]> {
    const { data, error } = await this.supabase.client
      .from("demo_anlik_goruntu")
      .select("tablo, sira, satirlar")
      .order("sira", { ascending: true });

    if (error) {
      // Migration henüz uygulanmadıysa buraya düşülür: demo yine de çalışsın.
      this.logger.warn(`Anlık görüntü tablosu okunamadı, fabrika ayarına düşülüyor: ${error.message}`);
      return this.fabrikaAyari();
    }
    if (!data || data.length === 0) return this.fabrikaAyari();

    return data.map((satir) => ({
      table: String(satir.tablo),
      rows: (satir.satirlar ?? []) as Record<string, unknown>[],
    }));
  }

  async ozet(): Promise<AnlikGoruntuOzeti> {
    const { data, error } = await this.supabase.client
      .from("demo_anlik_goruntu")
      .select("tablo, satirlar, alindi_at");
    if (error || !data || data.length === 0) {
      const dosya = this.fabrikaAyariSessiz();
      if (!dosya) return { tabloSayisi: 0, satirSayisi: 0, alindi: null, kaynak: "yok" };
      return {
        tabloSayisi: dosya.length,
        satirSayisi: dosya.reduce((t, x) => t + x.rows.length, 0),
        alindi: null,
        kaynak: "dosya",
      };
    }
    return {
      tabloSayisi: data.length,
      satirSayisi: data.reduce((t: number, x: any) => t + (x.satirlar?.length ?? 0), 0),
      alindi: data.map((x: any) => x.alindi_at).sort().pop() ?? null,
      kaynak: "veritabani",
    };
  }

  /**
   * Fabrika ayarı dosyası. Çalışma dizini duruma göre değişiyor: Render'da
   * `node backend/dist/main` DEPO KÖKÜNDEN, yerelde `nest start` `backend/`
   * içinden koşuyor; __dirname'e göre çıkmak ikisinde de aynı derinlik.
   */
  private fabrikaAyari(): DemoTablo[] {
    const veri = this.fabrikaAyariSessiz();
    if (!veri) throw new Error("Demo anlık görüntüsü yok: ne veritabanında kayıt var ne de fabrika ayarı dosyası.");
    return veri;
  }

  private fabrikaAyariSessiz(): DemoTablo[] | null {
    if (this.dosyaOnbellegi) return this.dosyaOnbellegi;
    const adaylar = [
      join(process.cwd(), "database", "demo", DOSYA_ADI),
      join(process.cwd(), "..", "database", "demo", DOSYA_ADI),
      join(__dirname, "..", "..", "..", "..", "database", "demo", DOSYA_ADI),
    ];
    const yol = adaylar.find((aday) => existsSync(aday));
    if (!yol) return null;
    this.dosyaOnbellegi = JSON.parse(readFileSync(yol, "utf8")) as DemoTablo[];
    return this.dosyaOnbellegi;
  }

  // --------------------------------------------------------------- yakalama

  /**
   * O ANKİ demo verisini yeni "ilk hâl" yapar.
   *
   * Yalnızca id'si demo aralığında olan satırlar alınır: uygulamanın kendi
   * ürettiği kayıtlar (rutin motorunun açtığı görevler, bildirimler) rastgele
   * id aldığı için bilerek dışarıda kalır — onlar her sıfırlamada zaten
   * siliniyor ve motor tarafından yeniden üretiliyor.
   */
  async yakala(): Promise<AnlikGoruntuOzeti> {
    const idler = {} as KapsamIdleri;
    const cikti: { tablo: string; sira: number; satirlar: Record<string, unknown>[] }[] = [];

    for (const [sira, kural] of YAKALAMA_KURALLARI.entries()) {
      let satirlar: Record<string, unknown>[] = [];

      const araliktaSinirli = kural.yalnizcaDemoAraligi === true;

      if (kural.tip === "eposta") {
        const { data, error } = await this.supabase.client
          .from(kural.tablo)
          .select("*")
          .like("email", `%${DEMO_EPOSTA_SONU}`);
        if (error) throw new Error(`${kural.tablo}: ${error.message}`);
        satirlar = data ?? [];
      } else if (kural.tip === "aralik") {
        satirlar = await this.kapsamSorgusu(kural.tablo, true);
      } else if (kural.tip === "coklu") {
        const parcalar = await Promise.all(
          (kural.coklu ?? []).map((c) =>
            this.kapsamSorgusu(kural.tablo, araliktaSinirli, c.sutun, idler[c.kaynak] ?? [])
          )
        );
        const teklestir = new Map<unknown, Record<string, unknown>>();
        for (const p of parcalar) for (const r of p) teklestir.set(r.id, r);
        satirlar = [...teklestir.values()];
      } else {
        satirlar = await this.kapsamSorgusu(
          kural.tablo,
          araliktaSinirli,
          kural.sutun,
          idler[kural.kaynak!] ?? []
        );
      }

      if (kural.tablo === "tasks") satirlar = satirlar.filter((r) => this.kalitiliGorev(r));

      if (kural.kendine) satirlar = ebeveynOnce(satirlar, kural.kendine);
      if (kural.kapsamAdi) idler[kural.kapsamAdi] = satirlar.map((r) => String(r.id));
      cikti.push({ tablo: kural.tablo, sira, satirlar });
    }

    // Boş kalan tabloların satırı hiç yazılmıyor ki geri yüklemede gereksiz
    // istek atılmasın.
    const dolu = cikti.filter((t) => t.satirlar.length > 0);
    const alindi = new Date().toISOString();

    // ÖNCE YAZ, SONRA ARTIĞI SİL. Tersi (önce tabloyu boşalt, sonra doldur)
    // daha okunaklı ama ortada bir hata olursa demonun "ilk hâli" boş kalır ve
    // bir sonraki giriş demoyu siler. Bu sırada en kötü ihtimalle eski ve yeni
    // hâl bir süre birlikte durur; ikisi de kendi başına tutarlıdır.
    for (const t of dolu) {
      const { error } = await this.supabase.client
        .from("demo_anlik_goruntu")
        .upsert(
          { tablo: t.tablo, sira: t.sira, satirlar: t.satirlar, alindi_at: alindi },
          { onConflict: "tablo" }
        );
      if (error) throw new Error(`${t.tablo} anlık görüntüye yazılamadı: ${error.message}`);
    }

    // Bu sefer hiç satırı olmayan tablolar anlık görüntüde kalmasın.
    const { error: artikHatasi } = await this.supabase.client
      .from("demo_anlik_goruntu")
      .delete()
      .not("tablo", "in", `(${dolu.map((t) => t.tablo).join(",")})`);
    if (artikHatasi) this.logger.warn(`Anlık görüntüdeki artık satırlar silinemedi: ${artikHatasi.message}`);

    const satirSayisi = dolu.reduce((toplam, t) => toplam + t.satirlar.length, 0);
    this.logger.log(`Demo anlık görüntüsü alındı: ${dolu.length} tablo, ${satirSayisi} satır.`);
    return { tabloSayisi: dolu.length, satirSayisi, alindi, kaynak: "veritabani" };
  }

  /**
   * Rutin motorunun ürettiği yinelenen görevler anlık görüntüye ALINMAZ.
   *
   * Onları dondurmak iki sebeple yanlış: (1) motor zaten her rutin
   * değişikliğinde eksikleri tamamlıyor, (2) `(routine_id, occurrence_on)`
   * tekil kısıtı yüzünden dondurulmuş satırla motorun yeni ürettiği satır
   * çakışıyor ve geri yükleme her seferinde yeniden denemeye düşüyordu
   * (bkz. demo-sifirlama.service.ts rutinCakismasiniCoz).
   *
   * Sahibin elle açtığı görevler `routine_id` taşımaz; onlar alınır.
   */
  private kalitiliGorev(satir: Record<string, unknown>): boolean {
    if (!satir.routine_id) return true;
    const id = String(satir.id ?? "");
    return id >= DEMO_ID_ALT && id <= DEMO_ID_UST;
  }

  /**
   * Kapsamdaki satırları getirir; `in` listesi parça parça sorgulanır.
   *
   * `araliktaSinirli` yalnızca gürültülü tablolarda açılır — normalde sahibin
   * eklediği (rastgele id'li) satırlar da alınmalı, yoksa "ilk hâl" sahibin
   * eklediklerini içermez.
   */
  private async kapsamSorgusu(
    tablo: string,
    araliktaSinirli: boolean,
    sutun?: string,
    degerler?: string[]
  ): Promise<Record<string, unknown>[]> {
    const hepsi: Record<string, unknown>[] = [];
    const parcalar: (string[] | null)[] = [];
    if (sutun) {
      if (!degerler || degerler.length === 0) return [];
      for (let i = 0; i < degerler.length; i += SORGU_PARCASI) {
        parcalar.push(degerler.slice(i, i + SORGU_PARCASI));
      }
    } else {
      parcalar.push(null);
    }

    for (const parca of parcalar) {
      let sorgu = this.supabase.client.from(tablo).select("*");
      if (araliktaSinirli) sorgu = sorgu.gte("id", DEMO_ID_ALT).lte("id", DEMO_ID_UST);
      if (parca && sutun) sorgu = sorgu.in(sutun, parca);
      const { data, error } = await sorgu.limit(5000);
      if (error) throw new Error(`${tablo}: ${error.message}`);
      hepsi.push(...(data ?? []));
    }
    return hepsi;
  }

  // ----------------------------------------------------------- düzenleme kipi

  /**
   * Sahibi demoyu elle düzenlerken sıfırlama durur. Bayrak veritabanında:
   * sunucu yeniden başlarsa ya da birden çok kopya çalışıyorsa da geçerli
   * olmalı, yoksa düzenleme ortasında bir giriş her şeyi silerdi.
   */
  async duzenlemeKipi(): Promise<DuzenlemeKipi> {
    const { data, error } = await this.supabase.client
      .from("demo_durum")
      .select("deger")
      .eq("anahtar", DURUM_ANAHTARI)
      .maybeSingle();
    if (error || !data) return { aktif: false };
    const deger = (data.deger ?? {}) as DuzenlemeKipi;
    return { aktif: deger.aktif === true, acan: deger.acan, acildi: deger.acildi };
  }

  async duzenlemeKipiniAyarla(aktif: boolean, acan?: string): Promise<DuzenlemeKipi> {
    const deger: DuzenlemeKipi = aktif
      ? { aktif: true, acan, acildi: new Date().toISOString() }
      : { aktif: false };
    const { error } = await this.supabase.client
      .from("demo_durum")
      .upsert(
        { anahtar: DURUM_ANAHTARI, deger, guncellendi_at: new Date().toISOString() },
        { onConflict: "anahtar" }
      );
    if (error) throw new Error(`Düzenleme kipi yazılamadı: ${error.message}`);
    return deger;
  }
}
