/**
 * Demo ziyaret analitiği — "demoya giren biri önce neyi merak ediyor?"
 *
 * KİŞİ DEĞİL, OTURUM ölçülür. Demo hesabı herkese açık ve ortak
 * (bkz. backend common/demo-hesap.ts): aynı anda birden çok ziyaretçi aynı
 * kullanıcıyla içeride olabilir, o yüzden kullanıcı kimliği hiçbir şey
 * ayırt etmez. Her demo girişi tarayıcıda rastgele bir ziyaret kimliği üretir;
 * IP, tarayıcı parmak izi ya da sonradan açılan hesapla eşleştirme YOK.
 *
 * Bu dosya saf: istemci sayfa anahtarını buradan üretir, sunucu özeti buradan
 * hesaplar — iki taraf aynı sözlüğü konuşsun.
 */

export type DemoOlayTuru = "sayfa" | "ozellik" | "tikla";
export type DemoCihaz = "mobil" | "tablet" | "masaustu";
export type DemoKaynak = "tanitim" | "giris";

export const DEMO_OLAY_TURLERI: readonly DemoOlayTuru[] = ["sayfa", "ozellik", "tikla"];
export const DEMO_CIHAZLAR: readonly DemoCihaz[] = ["mobil", "tablet", "masaustu"];

/** Bir istekte kabul edilen en fazla olay. İstemci bundan küçük paketler yollar. */
export const DEMO_PAKET_SINIRI = 100;
/** Metin alanlarının tavanı: tıklama etiketi uzun bir görev başlığı olmasın. */
export const DEMO_ANAHTAR_SINIRI = 60;
/**
 * Tek bir sayfa görüntülemesine yazılabilecek en uzun süre (sn). Süre istemcide
 * ölçülüyor (yalnızca sekme görünür ve kişi son 5 dakikada bir şeye
 * dokunmuşken); tavan, unutulmuş bir sekmenin ortalamayı bozmasını önler.
 */
export const DEMO_SAYFA_SURE_TAVANI = 30 * 60;

export interface DemoOlayGirdisi {
  /** Ziyaret içinde artan sayı — yeniden gönderimde aynı olay iki kez yazılmasın. */
  sira: number;
  /** İstemci saati (ms). Sunucu kendi saatine göre kaydırır. */
  t: number;
  tur: DemoOlayTuru;
  anahtar: string;
  /** Olay sırasında açık olan sayfanın anahtarı. */
  sayfa: string;
  /** Yalnızca "sayfa" olaylarında: o sayfada etkin geçen saniye. */
  sure?: number | null;
}

export interface DemoPaketi {
  ziyaretId: string;
  cihaz: DemoCihaz;
  kaynak: DemoKaynak | null;
  dil: string | null;
  /** Paket gönderilirken istemci saati (ms) — saat farkını düzeltmek için. */
  simdi: number;
  olaylar: DemoOlayGirdisi[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuidMi(deger: unknown): deger is string {
  return typeof deger === "string" && UUID.test(deger);
}

/**
 * Adres → sayfa anahtarı. Kimlikler `:id` olur: "/projects/ce11…" ile
 * "/projects/ce12…" aynı sayfadır ve kayda demo verisinin kimliği girmesin.
 * Modül anahtarı (fm_gelir_gider gibi) bir kimlik değil, özellik adıdır; kalır.
 */
export function demoSayfaAnahtari(yol: string): string {
  const temiz = (yol.split(/[?#]/)[0] || "/").replace(/\/+$/, "") || "/";
  const parcalar = temiz
    .split("/")
    .map((p) => (UUID.test(p) || /^\d+$/.test(p) ? ":id" : p.slice(0, 40)));
  return parcalar.join("/") || "/";
}

/**
 * Sayfa anahtarı → özellik. Admin panelinde "neyle ilgilendi" sorusu sayfa
 * düzeyinde değil özellik düzeyinde soruluyor: bir işin detayı da iş listesi
 * de "İşler"dir. Tanınmayan sayfa null döner, sayılmaz.
 */
export function demoOzellikAnahtari(sayfa: string): string | null {
  const modul = /\/modules\/([^/]+)/.exec(sayfa);
  if (modul) return `modul:${modul[1]}`;
  if (sayfa === "/") return "pano";
  const bas = sayfa.split("/")[1] ?? "";
  if (sayfa.startsWith("/settings/lio-units")) return "lio-bakiyesi";
  if (sayfa.startsWith("/settings/billing")) return "abonelik";
  if (sayfa.startsWith("/settings/archive")) return "arsiv";
  const eslesme: Record<string, string> = {
    jobs: "is",
    projects: "proje",
    operations: "rutin",
    organizations: "organizasyon",
    departments: "departman",
    groups: "holding",
    calendar: "takvim",
    tasks: "gorevler",
    worklog: "yaptim",
    settings: "ayarlar",
  };
  return eslesme[bas] ?? null;
}

/** Ekran boyutundan kaba cihaz sınıfı. Tarayıcı kimliği okunmuyor. */
export function demoCihazSinifi(genislik: number): DemoCihaz {
  if (genislik < 768) return "mobil";
  if (genislik < 1100) return "tablet";
  return "masaustu";
}

// ─────────────────────────────────────────────────────────── özet

export interface DemoZiyaretSatiri {
  id: string;
  basladiAt: string;
  sonGorulmeAt: string;
  cihaz: DemoCihaz;
  kaynak: DemoKaynak | null;
}

export interface DemoOlaySatiri {
  ziyaretId: string;
  at: string;
  tur: DemoOlayTuru;
  anahtar: string;
  sayfa: string;
  sureSn: number | null;
}

export interface DemoSayac {
  anahtar: string;
  /** Kaç farklı ziyarette görüldü. */
  ziyaret: number;
  oran: number;
}

export interface DemoSayfaOzeti {
  sayfa: string;
  goruntulenme: number;
  ziyaret: number;
  toplamSn: number;
  ortSn: number;
}

export interface DemoTiklamaOzeti {
  sayfa: string;
  anahtar: string;
  sayi: number;
  ziyaret: number;
}

export interface DemoAdim {
  at: string;
  tur: DemoOlayTuru;
  anahtar: string;
  sureSn: number | null;
}

export interface DemoZiyaretOzeti {
  id: string;
  basladiAt: string;
  cihaz: DemoCihaz;
  kaynak: DemoKaynak | null;
  sureSn: number;
  ilkIlgi: string | null;
  adimSayisi: number;
  adimlar: DemoAdim[];
}

export interface DemoAnalitik {
  gun: number;
  ziyaret: number;
  ortSureSn: number;
  medyanSureSn: number;
  ortSayfa: number;
  /** Yalnızca ana panoyu görüp çıkan ziyaretlerin oranı. */
  hemenCikma: number;
  cihaz: Record<DemoCihaz, number>;
  kaynak: { tanitim: number; giris: number; bilinmiyor: number };
  gunluk: { gun: string; ziyaret: number }[];
  ilkIlgi: DemoSayac[];
  ozellikler: DemoSayac[];
  sayfalar: DemoSayfaOzeti[];
  tiklamalar: DemoTiklamaOzeti[];
  sonSayfa: DemoSayac[];
  sonZiyaretler: DemoZiyaretOzeti[];
}

/** Olaydan özellik: Lio gibi adresi olmayan özellikler kendi olayıyla gelir. */
function olayinOzelligi(o: DemoOlaySatiri): string | null {
  if (o.tur === "ozellik") return o.anahtar;
  if (o.tur === "sayfa") return demoOzellikAnahtari(o.anahtar);
  return null;
}

function sirala(sayim: Map<string, Set<string>>, toplam: number, sinir: number): DemoSayac[] {
  return [...sayim.entries()]
    .map(([anahtar, s]) => ({ anahtar, ziyaret: s.size, oran: toplam ? s.size / toplam : 0 }))
    .sort((a, b) => b.ziyaret - a.ziyaret || a.anahtar.localeCompare(b.anahtar))
    .slice(0, sinir);
}

function ekle(sayim: Map<string, Set<string>>, anahtar: string, ziyaretId: string) {
  let s = sayim.get(anahtar);
  if (!s) sayim.set(anahtar, (s = new Set()));
  s.add(ziyaretId);
}

/** Europe/Istanbul günü (YYYY-MM-DD). Zaman damgaları saat dilimsiz UTC. */
function istanbulGunu(iso: string): string {
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
  return new Date(d.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
}

/**
 * Ham satırlardan admin özetini üretir.
 *
 * "İLK İLGİ" = ziyaretin ana pano DIŞINDA açtığı ilk özellik. Demo panoda
 * açıldığı için pano her ziyarette ilk sırada; onu saymak hiçbir şey
 * söylemezdi.
 */
export function demoAnalitikHesapla(
  ziyaretler: DemoZiyaretSatiri[],
  olaylar: DemoOlaySatiri[],
  gun: number,
  bugun: string = istanbulGunu(new Date().toISOString())
): DemoAnalitik {
  const olayMap = new Map<string, DemoOlaySatiri[]>();
  for (const o of olaylar) {
    const liste = olayMap.get(o.ziyaretId);
    if (liste) liste.push(o);
    else olayMap.set(o.ziyaretId, [o]);
  }
  for (const liste of olayMap.values()) liste.sort((a, b) => a.at.localeCompare(b.at));

  // Hiç olayı olmayan ziyaret (giriş yapıp sayfa yüklenmeden kapatan) sayılmaz.
  const gecerli = ziyaretler.filter((z) => olayMap.has(z.id));
  const toplam = gecerli.length;

  const ilkIlgi = new Map<string, Set<string>>();
  const ozellikler = new Map<string, Set<string>>();
  const sonSayfa = new Map<string, Set<string>>();
  const sayfalar = new Map<string, { goruntulenme: number; ziyaret: Set<string>; toplamSn: number; sureliSayi: number }>();
  const tiklamalar = new Map<string, DemoTiklamaOzeti & { ziyaretler: Set<string> }>();
  const cihaz: Record<DemoCihaz, number> = { mobil: 0, tablet: 0, masaustu: 0 };
  const kaynak = { tanitim: 0, giris: 0, bilinmiyor: 0 };
  const gunluk = new Map<string, number>();
  const sureler: number[] = [];
  let sayfaToplami = 0;
  let hemenCikan = 0;
  const ozetler: DemoZiyaretOzeti[] = [];

  for (const z of gecerli) {
    const liste = olayMap.get(z.id)!;
    cihaz[z.cihaz] = (cihaz[z.cihaz] ?? 0) + 1;
    if (z.kaynak === "tanitim") kaynak.tanitim++;
    else if (z.kaynak === "giris") kaynak.giris++;
    else kaynak.bilinmiyor++;
    const g = istanbulGunu(z.basladiAt);
    gunluk.set(g, (gunluk.get(g) ?? 0) + 1);

    let sure = 0;
    let ilk: string | null = null;
    let son: string | null = null;
    const gorulenOzellikler = new Set<string>();

    for (const o of liste) {
      const oz = olayinOzelligi(o);
      if (oz) {
        gorulenOzellikler.add(oz);
        if (!ilk && oz !== "pano") ilk = oz;
      }
      if (o.tur === "sayfa") {
        const s = sayfalar.get(o.anahtar) ?? { goruntulenme: 0, ziyaret: new Set(), toplamSn: 0, sureliSayi: 0 };
        s.goruntulenme++;
        s.ziyaret.add(z.id);
        if (o.sureSn != null) {
          s.toplamSn += o.sureSn;
          s.sureliSayi++;
          sure += o.sureSn;
        }
        sayfalar.set(o.anahtar, s);
        sayfaToplami++;
        son = o.anahtar;
      } else if (o.tur === "tikla") {
        const k = `${o.sayfa} ${o.anahtar}`;
        const t = tiklamalar.get(k) ?? { sayfa: o.sayfa, anahtar: o.anahtar, sayi: 0, ziyaret: 0, ziyaretler: new Set() };
        t.sayi++;
        t.ziyaretler.add(z.id);
        tiklamalar.set(k, t);
      }
    }

    for (const oz of gorulenOzellikler) ekle(ozellikler, oz, z.id);
    if (ilk) ekle(ilkIlgi, ilk, z.id);
    if (son) ekle(sonSayfa, son, z.id);
    if (!ilk) hemenCikan++;
    sure = Math.round(sure);
    sureler.push(sure);

    ozetler.push({
      id: z.id,
      basladiAt: z.basladiAt,
      cihaz: z.cihaz,
      kaynak: z.kaynak,
      sureSn: sure,
      ilkIlgi: ilk,
      adimSayisi: liste.length,
      adimlar: liste.slice(0, 80).map((o) => ({ at: o.at, tur: o.tur, anahtar: o.anahtar, sureSn: o.sureSn })),
    });
  }

  sureler.sort((a, b) => a - b);
  const medyan = sureler.length
    ? sureler.length % 2
      ? sureler[(sureler.length - 1) / 2]
      : Math.round((sureler[sureler.length / 2 - 1] + sureler[sureler.length / 2]) / 2)
    : 0;

  // Günlük seri boşluksuz: ziyaret olmayan gün de 0 olarak görünsün.
  const gunlukSeri: { gun: string; ziyaret: number }[] = [];
  const son = new Date(`${bugun}T00:00:00Z`).getTime();
  for (let i = gun - 1; i >= 0; i--) {
    const g = new Date(son - i * 86400_000).toISOString().slice(0, 10);
    gunlukSeri.push({ gun: g, ziyaret: gunluk.get(g) ?? 0 });
  }

  return {
    gun,
    ziyaret: toplam,
    ortSureSn: toplam ? Math.round(sureler.reduce((a, b) => a + b, 0) / toplam) : 0,
    medyanSureSn: medyan,
    ortSayfa: toplam ? Math.round((sayfaToplami / toplam) * 10) / 10 : 0,
    hemenCikma: toplam ? hemenCikan / toplam : 0,
    cihaz,
    kaynak,
    gunluk: gunlukSeri,
    ilkIlgi: sirala(ilkIlgi, toplam, 15),
    ozellikler: sirala(ozellikler, toplam, 30),
    sayfalar: [...sayfalar.entries()]
      .map(([sayfa, s]) => ({
        sayfa,
        goruntulenme: s.goruntulenme,
        ziyaret: s.ziyaret.size,
        toplamSn: Math.round(s.toplamSn),
        ortSn: s.sureliSayi ? Math.round(s.toplamSn / s.sureliSayi) : 0,
      }))
      .sort((a, b) => b.ziyaret - a.ziyaret || b.toplamSn - a.toplamSn)
      .slice(0, 30),
    tiklamalar: [...tiklamalar.values()]
      .map(({ ziyaretler, ...t }) => ({ ...t, ziyaret: ziyaretler.size }))
      .sort((a, b) => b.ziyaret - a.ziyaret || b.sayi - a.sayi)
      .slice(0, 40),
    sonSayfa: sirala(sonSayfa, toplam, 10),
    sonZiyaretler: ozetler.sort((a, b) => b.basladiAt.localeCompare(a.basladiAt)).slice(0, 25),
  };
}
