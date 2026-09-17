import { Injectable, Logger } from "@nestjs/common";
import {
  demoAnalitikHesapla,
  type DemoAnalitik,
  type DemoOlaySatiri,
  type DemoZiyaretSatiri,
} from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { DemoAnlikGoruntuService } from "./demo-anlik-goruntu.service";
import { demoPaketiniTemizle } from "./demo-ziyaret-girdi";

/** Ziyaret başına kabul edilen en fazla olay: döngüye giren bir sekme tabloyu doldurmasın. */
const ZIYARET_OLAY_SINIRI = 3000;
/** Özet için okunacak en fazla olay. Aşılırsa en yeniler okunur, panel bunu söyler. */
const OZET_OLAY_TAVANI = 50_000;

/**
 * Demo ziyaret analitiği (migration 116). Ne ölçüldüğü ve neyin bilerek
 * ölçülmediği: packages/shared/src/demoZiyaret.ts başlığı.
 */
@Injectable()
export class DemoZiyaretService {
  private readonly logger = new Logger(DemoZiyaretService.name);
  /** Süreç içi sayaç — sınır bir istatistik koruması, kesinlik gerekmiyor. */
  private sayac = new Map<string, number>();
  private kipOnbellek: { aktif: boolean; okundu: number } | null = null;
  private hataYazildi = false;

  constructor(
    private supabase: SupabaseService,
    private anlikGoruntu: DemoAnlikGoruntuService
  ) {}

  /**
   * Ziyaretçinin paketini yazar. 90 günlük saklama süresini gece saklama işi
   * uyguluyor (data-retention, `demoZiyaret`).
   * ASLA HATA FIRLATMAZ: ölçüm yüzünden demo
   * ekranında hata görünmemeli.
   */
  async kaydet(govde: unknown): Promise<void> {
    try {
      // Düzenleme kipinde içeride gezen, demoyu hazırlayan sahibidir; onun
      // tıklamaları ziyaretçi ilgisi gibi sayılmasın.
      if (await this.duzenlemeKipiAcik()) return;

      const paket = demoPaketiniTemizle(govde, Date.now());
      if (!paket || paket.olaylar.length === 0) return;

      const onceki = this.sayac.get(paket.ziyaretId) ?? 0;
      if (onceki >= ZIYARET_OLAY_SINIRI) return;
      const olaylar = paket.olaylar.slice(0, ZIYARET_OLAY_SINIRI - onceki);
      // Sayaç süreç ömrü boyunca büyümesin; sıfırlanması yalnızca sınırı gevşetir.
      if (this.sayac.size > 5000) this.sayac.clear();
      this.sayac.set(paket.ziyaretId, onceki + olaylar.length);

      const simdi = new Date().toISOString();
      const enErken = olaylar.reduce((a, o) => (o.at < a ? o.at : a), simdi);

      // Ziyaret satırı ilk pakette açılır; sonrakiler yalnızca son görülmeyi
      // ilerletir. İki adım, çünkü upsert başlangıç zamanını ezerdi.
      const { error: ekleHata } = await this.supabase.client.from("demo_ziyaretler").upsert(
        {
          id: paket.ziyaretId,
          basladi_at: enErken,
          son_gorulme_at: simdi,
          cihaz: paket.cihaz,
          kaynak: paket.kaynak,
          dil: paket.dil,
        },
        { onConflict: "id", ignoreDuplicates: true }
      );
      if (ekleHata) throw ekleHata;
      await this.supabase.client.from("demo_ziyaretler").update({ son_gorulme_at: simdi }).eq("id", paket.ziyaretId);

      // Aynı sıra yeniden gelirse ÜZERİNE yazılır: açık sayfanın olayı her
      // gönderimde güncel süresiyle tekrar yollanıyor (bkz. web lib/demoZiyaret.ts).
      const { error } = await this.supabase.client.from("demo_olaylari").upsert(
        olaylar.map((o) => ({ ziyaret_id: paket.ziyaretId, ...o })),
        { onConflict: "ziyaret_id,sira" }
      );
      if (error) throw error;
    } catch (error) {
      // Migration 116 uygulanmadıysa her pakette log dolmasın.
      if (!this.hataYazildi) {
        this.hataYazildi = true;
        this.logger.warn(`Demo ziyaret olayı yazılamadı: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
      }
    }
  }

  async ozet(gun: number): Promise<DemoAnalitik & { kesildi: boolean }> {
    const baslangic = new Date(Date.now() - gun * 86400_000).toISOString();
    const [ziyaretler, olaylar] = await Promise.all([
      this.supabase.client
        .from("demo_ziyaretler")
        .select("id, basladi_at, son_gorulme_at, cihaz, kaynak")
        .gte("basladi_at", baslangic)
        .order("basladi_at", { ascending: false })
        .limit(10_000),
      this.supabase.client
        .from("demo_olaylari")
        .select("ziyaret_id, at, tur, anahtar, sayfa, sure_sn")
        .gte("at", baslangic)
        .order("at", { ascending: false })
        .limit(OZET_OLAY_TAVANI),
    ]);
    if (ziyaretler.error) throw new Error(ziyaretler.error.message);
    if (olaylar.error) throw new Error(olaylar.error.message);

    const z: DemoZiyaretSatiri[] = (ziyaretler.data ?? []).map((r: any) => ({
      id: r.id,
      basladiAt: r.basladi_at,
      sonGorulmeAt: r.son_gorulme_at,
      cihaz: r.cihaz,
      kaynak: r.kaynak,
    }));
    const o: DemoOlaySatiri[] = (olaylar.data ?? []).map((r: any) => ({
      ziyaretId: r.ziyaret_id,
      at: r.at,
      tur: r.tur,
      anahtar: r.anahtar,
      sayfa: r.sayfa,
      sureSn: r.sure_sn == null ? null : Number(r.sure_sn),
    }));
    return { ...demoAnalitikHesapla(z, o, gun), kesildi: o.length >= OZET_OLAY_TAVANI };
  }

  private async duzenlemeKipiAcik(): Promise<boolean> {
    const simdi = Date.now();
    if (this.kipOnbellek && simdi - this.kipOnbellek.okundu < 30_000) return this.kipOnbellek.aktif;
    const kip = await this.anlikGoruntu.duzenlemeKipi().catch(() => ({ aktif: false }));
    this.kipOnbellek = { aktif: kip.aktif, okundu: simdi };
    return kip.aktif;
  }
}
