/**
 * Proje klonlama + proje şablonları (kullanıcı kararı, 2026-11-10).
 *
 * İkisi AYNI modelden geçer: "proje içeriği" — bir projenin tarihsiz,
 * kimliksiz iskeleti. Tarihler projenin başlangıcına GÖRE gün olarak tutulur:
 * yeni proje hangi gün başlarsa her şey aynı aralıkla o güne kayar (kullanıcı
 * kararı: "yeni başlangıca kaydır"). Kimlikler yerine `ref` var: alt görev
 * üstünü, görev çıktısını, bağımlılık iki ucunu ref ile bulur; yeni projede
 * gerçek kimlikler yazılırken eşlenir.
 *
 * - Klonlama: kaynak projeden içerik çıkarılır (sunucu), kullanıcının seçtiği
 *   parçalara süzülür (`icerigiSuz`), yeni projeye yazılır.
 * - Şablon: içerik `proje_sablonlari.icerik` sütununda saklanır (migration
 *   194). Şablonda KİŞİ yok — atamalar ve ekip yalnızca klonlamada var;
 *   şablon başka bir ekipte, başka bir şirkette açılabilir.
 * - Hazır şablonlar burada sabit (`HAZIR_SABLONLAR`): veritabanına tohum
 *   yazılmaz, herkese açık, silinemez.
 *
 * Sunucu ve arayüz aynı dosyadan geçer: modaldaki seçenek listesi ile
 * sunucunun süzgeci ayrışmasın.
 */

export const PROJE_ICERIGI_SURUMU = 1;

export interface SablonCikti {
  ref: string;
  baslik: string;
  aciklama?: string;
}

export interface SablonGorev {
  ref: string;
  /** Alt görevse üst görevin ref'i (tek seviye). */
  ustRef?: string;
  ciktiRef?: string;
  baslik: string;
  aciklama?: string;
  /** 0-5 (tasks.priority). */
  oncelik?: number;
  /** Proje başlangıcından gün; boş = başlangıç tarihi yok. */
  baslangicGun?: number | null;
  /** Proje başlangıcından gün (bitiş zorunlu, tasks.deadline NOT NULL). */
  bitisGun: number;
  /** "HH:MM". */
  saat?: string | null;
  tahminiSure?: { deger: number; birim: "hours" | "days" } | null;
  butce?: { tutar: number; birim: string } | null;
  /** Kullanıcı kimlikleri — YALNIZCA klonlamada; şablona yazılmaz. */
  atananlar?: string[];
}

export interface SablonEtkinlik {
  baslik: string;
  not?: string;
  yer?: string;
  tur: "meeting" | "milestone" | "delivery" | "other";
  gun: number;
  /** Çok günlü etkinlikte son gün (dahil). */
  bitisGun?: number | null;
  tumGun: boolean;
  /** "HH:MM" — tumGun değilse iki uç da dolu. */
  baslangicSaati?: string | null;
  bitisSaati?: string | null;
  renk?: string | null;
}

export interface ProjeIcerigi {
  surum: number;
  aciklama?: string;
  /** Anlaşılan ücret (projects.total_budget). */
  toplamButce?: number;
  /** Başlangıçtan bitişe gün (en az 1). */
  sureGun: number;
  kapak?: string;
  ciktilar: SablonCikti[];
  gorevler: SablonGorev[];
  bagimliliklar: { gorevRef: string; oncekiRef: string }[];
  etkinlikler: SablonEtkinlik[];
  /** Ekip (kullanıcı kimlikleri) — YALNIZCA klonlamada. */
  ekip?: string[];
}

/** Modalda seçilebilen parçalar. Sıra = modaldaki sıra. */
export type ProjeParcasi =
  | "aciklama"
  | "kapak"
  | "butce"
  | "ciktilar"
  | "gorevler"
  | "altGorevler"
  | "bagimliliklar"
  | "gorevButceleri"
  | "etkinlikler"
  | "atamalar"
  | "ekip";

export interface ParcaTanimi {
  anahtar: ProjeParcasi;
  ad: string;
  aciklama: string;
  /** Seçilmesi için gereken parça (ör. alt görevler → görevler). */
  gerektirir?: ProjeParcasi;
  /** Şablonda var mı (kişiye bağlı parçalar yok). */
  sablondaVar: boolean;
}

// dil:anahtar-baslangic — etiketler; çeviri kullanıldığı yerde t() ile.
export const PROJE_PARCALARI: ParcaTanimi[] = [
  { anahtar: "aciklama", ad: "Açıklama", aciklama: "Projenin açıklama metni", sablondaVar: true },
  { anahtar: "kapak", ad: "Kapak görseli", aciklama: "Projenin kapak fotoğrafı ya da rengi", sablondaVar: true },
  { anahtar: "butce", ad: "Anlaşılan ücret", aciklama: "Projenin toplam bütçesi", sablondaVar: true },
  { anahtar: "ciktilar", ad: "Çıktılar", aciklama: "Teslim edilecek çıktılar", sablondaVar: true },
  { anahtar: "gorevler", ad: "Görevler", aciklama: "Bütün görevler; durumları sıfırlanır", sablondaVar: true },
  { anahtar: "altGorevler", ad: "Alt görevler", aciklama: "Görevlerin altındaki adımlar", gerektirir: "gorevler", sablondaVar: true },
  { anahtar: "bagimliliklar", ad: "Görev bağımlılıkları", aciklama: "Hangi görevin hangisini beklediği", gerektirir: "gorevler", sablondaVar: true },
  { anahtar: "gorevButceleri", ad: "Görev bütçeleri", aciklama: "Görevlerdeki tutarlar; onaylar yeniden istenir", gerektirir: "gorevler", sablondaVar: true },
  { anahtar: "etkinlikler", ad: "Takvim etkinlikleri", aciklama: "Toplantılar, kilometre taşları, teslimler", sablondaVar: true },
  { anahtar: "atamalar", ad: "Görev atamaları", aciklama: "Görevler aynı kişilere atanır", gerektirir: "gorevler", sablondaVar: false },
  { anahtar: "ekip", ad: "Proje ekibi", aciklama: "Ekipteki kişiler yeni projeye de eklenir", sablondaVar: false },
];
// dil:anahtar-bitis

/** Klonlamada varsayılan seçim: içerik evet, kişiler hayır (yeni proje başka ekiple yürüyebilir). */
export const VARSAYILAN_KLON_PARCALARI: ProjeParcasi[] = [
  "aciklama",
  "kapak",
  "butce",
  "ciktilar",
  "gorevler",
  "altGorevler",
  "bagimliliklar",
  "gorevButceleri",
  "etkinlikler",
];

const PARCA_ANAHTARLARI = new Set(PROJE_PARCALARI.map((p) => p.anahtar));

/**
 * İstemciden gelen seçimi temizler: tanınmayanlar düşer, gereği seçilmemiş
 * parça düşer (görevsiz alt görev olmaz). `sablon` ise kişiye bağlı parçalar da.
 */
export function parcalariTemizle(secim: unknown, sablon = false): Set<ProjeParcasi> {
  const ham = Array.isArray(secim) ? secim.filter((k): k is ProjeParcasi => typeof k === "string" && PARCA_ANAHTARLARI.has(k as ProjeParcasi)) : [];
  const kume = new Set<ProjeParcasi>(ham);
  for (const p of PROJE_PARCALARI) {
    if (!kume.has(p.anahtar)) continue;
    if (p.gerektirir && !kume.has(p.gerektirir)) kume.delete(p.anahtar);
    if (sablon && !p.sablondaVar) kume.delete(p.anahtar);
  }
  return kume;
}

/** İçeriği seçilen parçalara indirger. Kaynak değiştirilmez. */
export function icerigiSuz(icerik: ProjeIcerigi, parcalar: Set<ProjeParcasi>): ProjeIcerigi {
  const ciktilar = parcalar.has("ciktilar") ? icerik.ciktilar : [];
  const ciktiRefleri = new Set(ciktilar.map((c) => c.ref));
  let gorevler = parcalar.has("gorevler") ? icerik.gorevler : [];
  if (!parcalar.has("altGorevler")) gorevler = gorevler.filter((g) => !g.ustRef);
  const gorevRefleri = new Set(gorevler.map((g) => g.ref));
  gorevler = gorevler
    // Üstü listede olmayan alt görev yetim kalmasın.
    .filter((g) => !g.ustRef || gorevRefleri.has(g.ustRef))
    .map((g) => ({
      ...g,
      ciktiRef: g.ciktiRef && ciktiRefleri.has(g.ciktiRef) ? g.ciktiRef : undefined,
      butce: parcalar.has("gorevButceleri") ? g.butce ?? null : null,
      atananlar: parcalar.has("atamalar") ? g.atananlar ?? [] : undefined,
    }));
  const kalan = new Set(gorevler.map((g) => g.ref));
  return {
    surum: PROJE_ICERIGI_SURUMU,
    aciklama: parcalar.has("aciklama") ? icerik.aciklama : undefined,
    kapak: parcalar.has("kapak") ? icerik.kapak : undefined,
    toplamButce: parcalar.has("butce") ? icerik.toplamButce : undefined,
    sureGun: icerik.sureGun,
    ciktilar,
    gorevler,
    bagimliliklar: parcalar.has("bagimliliklar")
      ? icerik.bagimliliklar.filter((b) => kalan.has(b.gorevRef) && kalan.has(b.oncekiRef))
      : [],
    etkinlikler: parcalar.has("etkinlikler") ? icerik.etkinlikler : [],
    ekip: parcalar.has("ekip") ? icerik.ekip ?? [] : undefined,
  };
}

/** Şablona yazılacak hâl: kişiye bağlı her şey çıkarılır. */
export function sablonaCevir(icerik: ProjeIcerigi): ProjeIcerigi {
  return {
    ...icerik,
    ekip: undefined,
    gorevler: icerik.gorevler.map(({ atananlar: _a, ...g }) => g),
  };
}

// ─── Tarih ─────────────────────────────────────────────────────────────────

/** "YYYY-MM-DD" → gün sayısı (UTC; saat dilimi kaymasın diye takvim günü). */
function gunNo(tarih: string): number {
  const [y, m, d] = tarih.slice(0, 10).split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** İki tarih arası gün (b − a). */
export function gunFarki(a: string, b: string): number {
  return gunNo(b) - gunNo(a);
}

/** Tarihe gün ekler ("YYYY-MM-DD"). */
export function gunKaydir(tarih: string, gun: number): string {
  return new Date((gunNo(tarih) + gun) * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Yeni projenin bitişi: başlangıç + süre. Görevlerden biri bitişi aşıyorsa
 * (kaynak projede bitişten sonraya kalmış görev) bitiş onu kapsayacak kadar
 * uzar — yeni proje kendi görevini "gecikmiş" doğurmasın.
 */
export function yeniBitis(baslangic: string, icerik: Pick<ProjeIcerigi, "sureGun" | "gorevler">): string {
  const enGec = Math.max(icerik.sureGun, ...icerik.gorevler.map((g) => g.bitisGun));
  return gunKaydir(baslangic, Math.max(0, enGec));
}

// ─── Doğrulama ─────────────────────────────────────────────────────────────

export const SABLON_TAVANLARI = { gorev: 500, cikti: 100, etkinlik: 200, metin: 20_000, baslik: 150 } as const;

const SAAT = /^([01]\d|2[0-3]):[0-5]\d$/;
const RENK = /^#[0-9A-Fa-f]{6}$/;
const ETKINLIK_TURLERI = new Set(["meeting", "milestone", "delivery", "other"]);

function metin(v: unknown, tavan: number = SABLON_TAVANLARI.metin): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t.slice(0, tavan) : undefined;
}

function tamSayi(v: unknown, alt: number, ust: number): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  return Math.min(ust, Math.max(alt, Math.round(v)));
}

/**
 * Saklanmış ya da istemciden gelmiş içeriği güvenli hâle getirir. Bozuk
 * öğeler sessizce düşer, sınırlar kırpılır; hiçbir alan güvenilmez (şablon
 * şirket genelinde paylaşılıyor, bir kişinin yazdığını herkes açıyor).
 */
export function icerigiDogrula(ham: unknown): ProjeIcerigi {
  const o = (ham && typeof ham === "object" ? ham : {}) as Record<string, any>;
  const GUN = 3650;
  const ciktilar: SablonCikti[] = [];
  const ciktiRef = new Set<string>();
  for (const c of Array.isArray(o.ciktilar) ? o.ciktilar.slice(0, SABLON_TAVANLARI.cikti) : []) {
    const ref = metin(c?.ref, 64);
    const baslik = metin(c?.baslik, SABLON_TAVANLARI.baslik);
    if (!ref || !baslik || ciktiRef.has(ref)) continue;
    ciktiRef.add(ref);
    ciktilar.push({ ref, baslik, aciklama: metin(c?.aciklama) });
  }
  const gorevler: SablonGorev[] = [];
  const gorevRef = new Set<string>();
  for (const g of Array.isArray(o.gorevler) ? o.gorevler.slice(0, SABLON_TAVANLARI.gorev) : []) {
    const ref = metin(g?.ref, 64);
    const baslik = metin(g?.baslik, SABLON_TAVANLARI.baslik);
    const bitisGun = tamSayi(g?.bitisGun, -GUN, GUN);
    if (!ref || !baslik || bitisGun === undefined || gorevRef.has(ref)) continue;
    gorevRef.add(ref);
    const sure = g?.tahminiSure;
    const butce = g?.butce;
    gorevler.push({
      ref,
      ustRef: metin(g?.ustRef, 64),
      ciktiRef: metin(g?.ciktiRef, 64),
      baslik,
      aciklama: metin(g?.aciklama),
      oncelik: tamSayi(g?.oncelik, 0, 5),
      baslangicGun: g?.baslangicGun == null ? null : tamSayi(g.baslangicGun, -GUN, GUN) ?? null,
      bitisGun,
      saat: typeof g?.saat === "string" && SAAT.test(g.saat.slice(0, 5)) ? g.saat.slice(0, 5) : null,
      tahminiSure:
        sure && (sure.birim === "hours" || sure.birim === "days") && typeof sure.deger === "number" && sure.deger > 0
          ? { deger: Math.min(sure.deger, 10_000), birim: sure.birim }
          : null,
      butce:
        butce && typeof butce.tutar === "number" && butce.tutar > 0 && /^[A-Z]{3}$/.test(String(butce.birim))
          ? { tutar: Math.min(butce.tutar, 1e10), birim: String(butce.birim) }
          : null,
      atananlar: Array.isArray(g?.atananlar) ? g.atananlar.filter((x: unknown) => typeof x === "string").slice(0, 50) : undefined,
    });
  }
  // Tek seviye: üstü olmayan ya da üstü de alt görev olan düşer; çıktısı yoksa bağ kalkar.
  const ustler = new Set(gorevler.filter((g) => !g.ustRef).map((g) => g.ref));
  const temizGorevler = gorevler
    .filter((g) => !g.ustRef || ustler.has(g.ustRef))
    .map((g) => ({ ...g, ciktiRef: g.ciktiRef && ciktiRef.has(g.ciktiRef) ? g.ciktiRef : undefined }));
  const kalan = new Set(temizGorevler.map((g) => g.ref));
  const bagimliliklar = (Array.isArray(o.bagimliliklar) ? o.bagimliliklar : [])
    .map((b: any) => ({ gorevRef: String(b?.gorevRef ?? ""), oncekiRef: String(b?.oncekiRef ?? "") }))
    .filter((b: { gorevRef: string; oncekiRef: string }) => b.gorevRef !== b.oncekiRef && kalan.has(b.gorevRef) && kalan.has(b.oncekiRef))
    .slice(0, SABLON_TAVANLARI.gorev);
  const etkinlikler: SablonEtkinlik[] = [];
  for (const e of Array.isArray(o.etkinlikler) ? o.etkinlikler.slice(0, SABLON_TAVANLARI.etkinlik) : []) {
    const baslik = metin(e?.baslik, 200);
    const gun = tamSayi(e?.gun, -GUN, GUN);
    if (!baslik || gun === undefined) continue;
    const tumGun = e?.tumGun !== false;
    const bas = typeof e?.baslangicSaati === "string" ? e.baslangicSaati.slice(0, 5) : "";
    const bit = typeof e?.bitisSaati === "string" ? e.bitisSaati.slice(0, 5) : "";
    // Saatli etkinlik tek gün ve iki ucu dolu olmalı (veritabanı kısıtıyla aynı).
    const saatli = !tumGun && SAAT.test(bas) && SAAT.test(bit) && bit > bas;
    const bitisGun = e?.bitisGun == null ? null : tamSayi(e.bitisGun, gun, GUN) ?? null;
    etkinlikler.push({
      baslik,
      not: metin(e?.not),
      yer: metin(e?.yer, 300),
      tur: ETKINLIK_TURLERI.has(e?.tur) ? e.tur : "other",
      gun,
      bitisGun: saatli ? null : bitisGun,
      tumGun: !saatli,
      baslangicSaati: saatli ? bas : null,
      bitisSaati: saatli ? bit : null,
      renk: typeof e?.renk === "string" && RENK.test(e.renk) ? e.renk : null,
    });
  }
  return {
    surum: PROJE_ICERIGI_SURUMU,
    aciklama: metin(o.aciklama),
    toplamButce: typeof o.toplamButce === "number" && o.toplamButce >= 0 ? Math.min(o.toplamButce, 1e10) : undefined,
    sureGun: tamSayi(o.sureGun, 1, GUN) ?? 30,
    kapak: metin(o.kapak, 2000),
    ciktilar,
    gorevler: temizGorevler,
    bagimliliklar,
    etkinlikler,
    ekip: Array.isArray(o.ekip) ? o.ekip.filter((x: unknown) => typeof x === "string").slice(0, 200) : undefined,
  };
}

/** Şablon kartında gösterilen sayılar. */
export function icerikOzeti(icerik: ProjeIcerigi): { gorev: number; altGorev: number; cikti: number; etkinlik: number; sureGun: number } {
  return {
    gorev: icerik.gorevler.filter((g) => !g.ustRef).length,
    altGorev: icerik.gorevler.filter((g) => g.ustRef).length,
    cikti: icerik.ciktilar.length,
    etkinlik: icerik.etkinlikler.length,
    sureGun: icerik.sureGun,
  };
}

// ─── Şablon kaydı ──────────────────────────────────────────────────────────

/** Şablonun kimlere açık olduğu: kaydedenin kendisi ya da şirketin bütün çalışanları. */
export type SablonKapsami = "kisisel" | "sirket" | "hazir";

export interface ProjeSablonu {
  /** Hazır şablonlarda "hazir:<anahtar>". */
  id: string;
  ad: string;
  aciklama?: string;
  kapsam: SablonKapsami;
  organizationId?: string;
  organizationName?: string;
  olusturanId?: string;
  olusturanAdi?: string;
  createdAt?: string;
  icerik: ProjeIcerigi;
  /** Bakan silebilir mi (sunucu söyler). */
  silebilir?: boolean;
}

export const HAZIR_SABLON_ONEKI = "hazir:";

// ─── Hazır şablonlar ───────────────────────────────────────────────────────

type HazirGorev = {
  baslik: string;
  aciklama?: string;
  bas: number;
  bit: number;
  cikti?: string;
  oncelik?: number;
  alt?: string[];
  /** Bu görevi bekleyen (önceki) görevlerin başlıkları. */
  bekler?: string[];
};

function hazirIcerik(t: {
  aciklama: string;
  sureGun: number;
  ciktilar: { ref: string; baslik: string; aciklama?: string }[];
  gorevler: HazirGorev[];
  etkinlikler: SablonEtkinlik[];
}): ProjeIcerigi {
  const gorevler: SablonGorev[] = [];
  const baslikRef = new Map<string, string>();
  t.gorevler.forEach((g, i) => {
    const ref = `g${i + 1}`;
    baslikRef.set(g.baslik, ref);
    gorevler.push({ ref, baslik: g.baslik, aciklama: g.aciklama, baslangicGun: g.bas, bitisGun: g.bit, ciktiRef: g.cikti, oncelik: g.oncelik ?? 0 });
    (g.alt ?? []).forEach((a, j) => gorevler.push({ ref: `${ref}.${j + 1}`, ustRef: ref, baslik: a, baslangicGun: g.bas, bitisGun: g.bit, ciktiRef: g.cikti }));
  });
  const bagimliliklar = t.gorevler.flatMap((g) =>
    (g.bekler ?? []).map((onceki) => ({ gorevRef: baslikRef.get(g.baslik)!, oncekiRef: baslikRef.get(onceki)! })).filter((b) => b.oncekiRef)
  );
  return icerigiDogrula({ surum: PROJE_ICERIGI_SURUMU, aciklama: t.aciklama, sureGun: t.sureGun, ciktilar: t.ciktilar, gorevler, bagimliliklar, etkinlikler: t.etkinlikler });
}

export const HAZIR_SABLONLAR: ProjeSablonu[] = [
  {
    id: `${HAZIR_SABLON_ONEKI}web-sitesi`,
    kapsam: "hazir",
    ad: "Web sitesi projesi",
    aciklama: "Keşiften yayına altı haftalık kurumsal web sitesi: tasarım, geliştirme, içerik ve yayın.",
    icerik: hazirIcerik({
      aciklama: "Müşterinin kurumsal web sitesi: keşif, tasarım, geliştirme, içerik ve yayın aşamaları.",
      sureGun: 42,
      ciktilar: [
        { ref: "c1", baslik: "Site haritası ve kapsam belgesi" },
        { ref: "c2", baslik: "Onaylı tasarımlar" },
        { ref: "c3", baslik: "Yayındaki web sitesi" },
      ],
      gorevler: [
        { baslik: "Başlangıç toplantısı", bas: 0, bit: 1, cikti: "c1", oncelik: 3, alt: ["Hedefleri ve hedef kitleyi yaz", "Rakip siteleri incele"] },
        { baslik: "Site haritasını çıkar", bas: 1, bit: 5, cikti: "c1", bekler: ["Başlangıç toplantısı"] },
        { baslik: "Tel çerçeve (wireframe) taslakları", bas: 5, bit: 10, cikti: "c2", bekler: ["Site haritasını çıkar"] },
        { baslik: "Görsel tasarım", bas: 10, bit: 18, cikti: "c2", oncelik: 2, alt: ["Anasayfa tasarımı", "İç sayfa şablonları", "Mobil görünüm"], bekler: ["Tel çerçeve (wireframe) taslakları"] },
        { baslik: "Tasarım onayı", bas: 18, bit: 20, cikti: "c2", oncelik: 3, bekler: ["Görsel tasarım"] },
        { baslik: "Geliştirme", bas: 20, bit: 34, cikti: "c3", oncelik: 2, alt: ["Altyapı ve yönetim paneli", "Sayfaların kodlanması", "Formlar ve entegrasyonlar"], bekler: ["Tasarım onayı"] },
        { baslik: "İçeriklerin girilmesi", bas: 26, bit: 36, cikti: "c3", alt: ["Metinleri topla", "Görselleri hazırla"] },
        { baslik: "Test ve düzeltmeler", bas: 34, bit: 39, cikti: "c3", bekler: ["Geliştirme", "İçeriklerin girilmesi"] },
        { baslik: "Yayına alma", bas: 39, bit: 42, cikti: "c3", oncelik: 3, alt: ["Alan adı ve SSL", "Arama motoru ayarları", "Yedekleme"], bekler: ["Test ve düzeltmeler"] },
      ],
      etkinlikler: [
        { baslik: "Başlangıç toplantısı", tur: "meeting", gun: 0, tumGun: false, baslangicSaati: "10:00", bitisSaati: "11:00" },
        { baslik: "Tasarım sunumu", tur: "milestone", gun: 18, tumGun: true },
        { baslik: "Yayın günü", tur: "delivery", gun: 42, tumGun: true },
      ],
    }),
  },
  {
    id: `${HAZIR_SABLON_ONEKI}etkinlik`,
    kapsam: "hazir",
    ad: "Etkinlik organizasyonu",
    aciklama: "Lansman, seminer ya da kutlama: mekan, tedarikçiler, davetliler, etkinlik günü ve sonrası.",
    icerik: hazirIcerik({
      aciklama: "Etkinliğin planlanması ve yürütülmesi: mekan, tedarikçiler, davetliler, etkinlik günü ve sonrası raporu.",
      sureGun: 35,
      ciktilar: [
        { ref: "c1", baslik: "Etkinlik planı ve bütçesi" },
        { ref: "c2", baslik: "Davetli listesi ve davetiyeler" },
        { ref: "c3", baslik: "Etkinlik sonrası rapor" },
      ],
      gorevler: [
        { baslik: "Konsept ve bütçeyi belirle", bas: 0, bit: 3, cikti: "c1", oncelik: 3, alt: ["Etkinliğin amacı ve hedef katılımcı sayısı", "Taslak bütçe"] },
        { baslik: "Mekan seçimi ve rezervasyon", bas: 3, bit: 8, cikti: "c1", oncelik: 3, alt: ["Üç mekandan teklif al", "Mekanı gez", "Sözleşmeyi imzala"], bekler: ["Konsept ve bütçeyi belirle"] },
        { baslik: "Tedarikçiler", bas: 8, bit: 18, cikti: "c1", alt: ["İkram (catering)", "Ses ve ışık", "Dekorasyon", "Fotoğraf ve video"], bekler: ["Mekan seçimi ve rezervasyon"] },
        { baslik: "Davetli listesini hazırla", bas: 3, bit: 10, cikti: "c2" },
        { baslik: "Davetiyeleri gönder", bas: 10, bit: 12, cikti: "c2", oncelik: 2, bekler: ["Davetli listesini hazırla"] },
        { baslik: "Katılım teyitleri", bas: 12, bit: 30, cikti: "c2", bekler: ["Davetiyeleri gönder"] },
        { baslik: "Akış ve görev dağılımı", bas: 20, bit: 28, cikti: "c1", alt: ["Dakika dakika akış", "Kim nerede, ne yapıyor"] },
        { baslik: "Etkinlik günü", bas: 31, bit: 31, oncelik: 3, alt: ["Kurulum kontrolü", "Karşılama", "Kapanış ve toplama"], bekler: ["Tedarikçiler", "Akış ve görev dağılımı"] },
        { baslik: "Teşekkür ve geri bildirim", bas: 32, bit: 34, cikti: "c3", bekler: ["Etkinlik günü"] },
        { baslik: "Sonuç raporu", bas: 32, bit: 35, cikti: "c3", alt: ["Katılım ve harcama özeti", "Fotoğrafları arşivle"], bekler: ["Etkinlik günü"] },
      ],
      etkinlikler: [
        { baslik: "Mekan ziyareti", tur: "meeting", gun: 5, tumGun: false, baslangicSaati: "14:00", bitisSaati: "15:30" },
        { baslik: "Davetiyeler gönderilir", tur: "milestone", gun: 12, tumGun: true },
        { baslik: "Etkinlik günü", tur: "delivery", gun: 31, tumGun: true },
      ],
    }),
  },
  {
    id: `${HAZIR_SABLON_ONEKI}sosyal-medya`,
    kapsam: "hazir",
    ad: "Sosyal medya kampanyası",
    aciklama: "Dört haftalık kampanya: strateji, içerik takvimi, çekim, yayın ve raporlama.",
    icerik: hazirIcerik({
      aciklama: "Sosyal medya kampanyası: hedef ve mesaj, içerik takvimi, üretim, yayın ve sonuç raporu.",
      sureGun: 30,
      ciktilar: [
        { ref: "c1", baslik: "Kampanya stratejisi" },
        { ref: "c2", baslik: "İçerik takvimi ve içerikler" },
        { ref: "c3", baslik: "Kampanya raporu" },
      ],
      gorevler: [
        { baslik: "Hedef ve hedef kitle", bas: 0, bit: 2, cikti: "c1", oncelik: 3, alt: ["Ölçülecek hedefler (erişim, etkileşim, satış)", "Hedef kitle tanımı"] },
        { baslik: "Ana mesaj ve görsel dil", bas: 2, bit: 5, cikti: "c1", bekler: ["Hedef ve hedef kitle"] },
        { baslik: "İçerik takvimini hazırla", bas: 5, bit: 8, cikti: "c2", oncelik: 2, bekler: ["Ana mesaj ve görsel dil"] },
        { baslik: "Çekim ve tasarım", bas: 8, bit: 14, cikti: "c2", alt: ["Fotoğraf çekimi", "Reels / video", "Tasarım şablonları"], bekler: ["İçerik takvimini hazırla"] },
        { baslik: "Metinler ve etiketler", bas: 8, bit: 13, cikti: "c2" },
        { baslik: "Yayın — 1. hafta", bas: 14, bit: 20, cikti: "c2", bekler: ["Çekim ve tasarım", "Metinler ve etiketler"] },
        { baslik: "Yayın — 2. hafta", bas: 21, bit: 27, cikti: "c2", bekler: ["Yayın — 1. hafta"] },
        { baslik: "Yorum ve mesajları yanıtla", bas: 14, bit: 28 },
        { baslik: "Kampanya raporu", bas: 28, bit: 30, cikti: "c3", oncelik: 2, alt: ["Metrikleri topla", "Öğrenilenler"], bekler: ["Yayın — 2. hafta"] },
      ],
      etkinlikler: [
        { baslik: "Kampanya başlangıcı", tur: "milestone", gun: 14, tumGun: true },
        { baslik: "Ara değerlendirme", tur: "meeting", gun: 21, tumGun: false, baslangicSaati: "11:00", bitisSaati: "11:30" },
        { baslik: "Rapor teslimi", tur: "delivery", gun: 30, tumGun: true },
      ],
    }),
  },
  {
    id: `${HAZIR_SABLON_ONEKI}urun-lansmani`,
    kapsam: "hazir",
    ad: "Yeni ürün lansmanı",
    aciklama: "Sekiz haftada ürünü pazara çıkarmak: araştırma, ürün hazırlığı, pazarlama, satış ve geri bildirim.",
    icerik: hazirIcerik({
      aciklama: "Yeni ürünün pazara çıkışı: araştırma, ürün hazırlığı, pazarlama, satış kanalları ve lansman sonrası geri bildirim.",
      sureGun: 56,
      ciktilar: [
        { ref: "c1", baslik: "Pazar araştırması ve konumlandırma" },
        { ref: "c2", baslik: "Satışa hazır ürün" },
        { ref: "c3", baslik: "Lansman kampanyası" },
        { ref: "c4", baslik: "Lansman sonrası değerlendirme" },
      ],
      gorevler: [
        { baslik: "Pazar ve rakip araştırması", bas: 0, bit: 7, cikti: "c1", oncelik: 2, alt: ["Rakip ürünler ve fiyatlar", "Potansiyel müşterilerle görüşme"] },
        { baslik: "Konumlandırma ve fiyat", bas: 7, bit: 12, cikti: "c1", oncelik: 3, bekler: ["Pazar ve rakip araştırması"] },
        { baslik: "Ürün hazırlığı", bas: 7, bit: 30, cikti: "c2", oncelik: 3, alt: ["Son prototip", "Üretim / tedarik planı", "Kalite kontrol"] },
        { baslik: "Ambalaj ve ürün görselleri", bas: 20, bit: 32, cikti: "c2", bekler: ["Konumlandırma ve fiyat"] },
        { baslik: "Satış kanallarını hazırla", bas: 28, bit: 40, cikti: "c2", alt: ["Web sitesi / e-ticaret sayfası", "Bayi ve satış ekibi bilgilendirmesi"] },
        { baslik: "Lansman kampanyası", bas: 32, bit: 45, cikti: "c3", oncelik: 2, alt: ["Basın bülteni", "Sosyal medya planı", "Reklam bütçesi"], bekler: ["Ambalaj ve ürün görselleri"] },
        { baslik: "Lansman günü", bas: 45, bit: 45, cikti: "c3", oncelik: 3, bekler: ["Ürün hazırlığı", "Satış kanallarını hazırla", "Lansman kampanyası"] },
        { baslik: "İlk müşteri geri bildirimleri", bas: 46, bit: 53, cikti: "c4" },
        { baslik: "Lansman değerlendirmesi", bas: 53, bit: 56, cikti: "c4", alt: ["Satış ve maliyet özeti", "Sonraki adımlar"], bekler: ["İlk müşteri geri bildirimleri"] },
      ],
      etkinlikler: [
        { baslik: "Konumlandırma toplantısı", tur: "meeting", gun: 10, tumGun: false, baslangicSaati: "10:00", bitisSaati: "12:00" },
        { baslik: "Ürün hazır", tur: "milestone", gun: 30, tumGun: true },
        { baslik: "Lansman günü", tur: "delivery", gun: 45, tumGun: true },
      ],
    }),
  },
];
