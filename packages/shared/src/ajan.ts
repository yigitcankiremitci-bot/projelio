/**
 * Ajan MVP: kullanıcının kendi Mac'inde (Ollama) çalışan, öğrettiklerini
 * belleğinde tutan, araştırıp rapor yazan ve boşta kalınca öğrenme listesinden
 * öğrenmeye devam eden yardımcı (migration 177).
 *
 * Sunucu modele hiç bağlanmaz: Mac'teki program (repoda `ajan/`) kişiye özel
 * anahtarla işi alır, sonucu geri yazar. Buradaki kurallar sunucu ve arayüzde
 * ORTAK — "Mac bağlı mı" kararı iki yerde ayrı hesaplanırsa robot uyurken panel
 * "çalışıyor" derdi.
 */

/**
 * fikir: boşta, yeni öğrendiklerinden iş bitirici fikir çıkarma.
 * otomasyon: kullanıcının kurduğu zamanlanmış görev (migration 178).
 * sirket: boşta, şirketin Projelio'daki profilini inceleyip not/fikir çıkarma (179).
 */
export type AjanIsTuru = "sohbet" | "arastirma" | "ogrenme" | "liste" | "fikir" | "otomasyon" | "sirket";
export type AjanIsDurumu = "bekliyor" | "calisiyor" | "bitti" | "hata";
export type AjanKonuDurumu = "bekliyor" | "ogreniliyor" | "ogrenildi" | "atlandi";
export type AjanBilgiTuru = "ogretilen" | "ogrenilen";

export interface AjanKaynak {
  baslik: string;
  adres: string;
}

export interface AjanBilgi {
  id: string;
  tur: AjanBilgiTuru;
  baslik: string;
  /** Listede uzun metnin yalnızca başı gelir; tamamının boyu `uzunluk`'ta. */
  icerik: string;
  uzunluk: number;
  kaynaklar: AjanKaynak[];
  createdAt: string;
}

export interface AjanKonu {
  id: string;
  konu: string;
  neden: string | null;
  oneren: "kullanici" | "ajan";
  durum: AjanKonuDurumu;
  oncelik: number;
  createdAt: string;
}

export interface AjanIs {
  id: string;
  tur: AjanIsTuru;
  girdi: string;
  konuId: string | null;
  durum: AjanIsDurumu;
  hata: string | null;
  createdAt: string;
}

export interface AjanMesaj {
  id: string;
  rol: "kullanici" | "ajan";
  metin: string;
  createdAt: string;
}

export interface AjanRaporOzeti {
  id: string;
  baslik: string;
  ozet: string | null;
  okundu: boolean;
  createdAt: string;
}

export interface AjanRapor extends AjanRaporOzeti {
  icerik: string;
  kaynaklar: AjanKaynak[];
}

export interface AjanYapilacakVerisi {
  baslik: string;
  aciklama?: string;
  /** YYYY-AA-GG */
  bitis?: string;
}

export type AjanFikirEtkisi = "yuksek" | "orta" | "dusuk";
export type AjanFikirEmegi = "kucuk" | "orta" | "buyuk";

/**
 * Ajanın şirkete önerdiği iş. "Sosyal medyayı etkin kullanın" gibi genel öğüt
 * değil, bitirilebilir bir iş olsun diye fayda ve somut adımlar ZORUNLU
 * (ajanSonucunuTemizle en az 2 adım ister).
 */
export interface AjanFikirVerisi {
  baslik: string;
  /** Şirkete faydası: gelir, maliyet, zaman, müşteri. */
  fayda: string;
  adimlar: string[];
  etki: AjanFikirEtkisi;
  emek: AjanFikirEmegi;
  /** Dayandığı rapor/öğrenme/kaynak, kısa. */
  dayanak?: string;
}

/**
 * Lio'ya devredilen iş. Ajan Projelio'da işlem yapmaz (migration 179): görev,
 * proje, müşteri, kayıt açmak/değiştirmek gerekiyorsa talimatı Lio'ya yazar.
 * Onayda Lio açılır, talimat yazı kutusuna gelir; göndermek kullanıcıdadır.
 */
export interface AjanLioVerisi {
  baslik: string;
  /** Lio'nun tek başına anlayacağı talimat. */
  talimat: string;
}

export type AjanOneri =
  | { id: string; tur: "yapilacak"; veri: AjanYapilacakVerisi; durum: AjanOneriDurumu; yanitNotu: string | null; createdAt: string }
  | { id: string; tur: "fikir"; veri: AjanFikirVerisi; durum: AjanOneriDurumu; yanitNotu: string | null; createdAt: string }
  | { id: string; tur: "lio"; veri: AjanLioVerisi; durum: AjanOneriDurumu; yanitNotu: string | null; createdAt: string };

export type AjanOneriDurumu = "bekliyor" | "onaylandi" | "reddedildi";

export type AjanOtomasyonSikligi = "gunluk" | "haftalik" | "aylik";

export interface AjanOtomasyon {
  id: string;
  ad: string;
  talimat: string;
  siklik: AjanOtomasyonSikligi;
  /** Türkiye saatiyle 0-23. */
  saat: number;
  /** haftalik: 1 (pazartesi) - 7 (pazar); aylik: 1-28. */
  gun: number;
  acik: boolean;
  sonCalisma: string | null;
  sonraki: string;
  createdAt: string;
}

/** Robot ve panel bu tek yanıttan beslenir. */
export interface AjanDurumu {
  izinli: boolean;
  ad: string;
  /** Mac'teki program son AJAN_BAGLI_SAYILMA_MS içinde nabız attı mı. */
  bagli: boolean;
  /** Anahtar hiç üretilmediyse kurulum adımları gösterilir. */
  kurulu: boolean;
  calisiyor: boolean;
  not: string | null;
  model: string | null;
  sonNabiz: string | null;
  ogrenmeAcik: boolean;
  bekleyenIs: number;
  okunmamisRapor: number;
  /** Onay bekleyen yapılacak önerileri (sohbette görünür). */
  bekleyenOneri: number;
  /** Yanıt bekleyen fikirler (Fikirler sekmesi). */
  bekleyenFikir: number;
}

/** Mac'in işi alırken gördüğü paket. */
export interface AjanIsPaketi {
  is: AjanIs;
  ad: string;
  /** Kullanıcının öğrettikleri: ajanın uyması gereken kurallar ve bilgiler. */
  ogretilenler: { baslik: string; icerik: string }[];
  /** Sohbet işinde son mesajlar (eskiden yeniye). */
  sonMesajlar: { rol: "kullanici" | "ajan"; metin: string }[];
  /** Liste işinde ajan yeni konu önerirken tekrar etmesin diye. */
  mevcutKonular: string[];
  /**
   * Fikir, araştırma ve otomasyon işlerinde: son öğrendikleri, son raporlar ve
   * kullanıcının önceki fikirlere verdiği yanıtlar. Ajan öğrendiğini burada
   * KULLANIR; kabul/ret geçmişi ona neyin işe yaradığını öğretir.
   */
  baglam?: string;
  /** Şirketin Projelio'daki profili (hassas alanlar ayıklanmış); her işte gider. */
  sirket?: string;
}

/** Mac'in işi bitirirken gönderdiği sonuç. Hepsi isteğe bağlı. */
export interface AjanIsSonucu {
  hata?: string;
  mesaj?: string;
  rapor?: { baslik: string; ozet?: string; icerik: string; kaynaklar?: AjanKaynak[] };
  bilgiler?: { baslik: string; icerik: string; kaynaklar?: AjanKaynak[] }[];
  konular?: { konu: string; neden?: string }[];
  oneriler?: ({ tur: "yapilacak"; veri: AjanYapilacakVerisi } | { tur: "fikir"; veri: AjanFikirVerisi } | { tur: "lio"; veri: AjanLioVerisi })[];
}

// ------------------------------------------------------------------ kurallar

/** Program 30 sn'de bir nabız atar; iki nabız kaçırırsa "uyuyor" sayılır. */
export const AJAN_BAGLI_SAYILMA_MS = 90_000;

/**
 * "calisiyor" kalmış bir iş bu kadar süre sonra yeniden kuyruğa döner. Mac iş
 * ortasında kapanırsa (kapak, uyku) iş sonsuza dek yarım kalmasın diye.
 */
export const AJAN_ASILI_IS_MS = 30 * 60_000;

/**
 * Boşta öğrenme adımları arası en kısa süre. Mac'in fanını sürekli
 * döndürmesin, belleği de bir günde yüzlerce yüzeysel notla dolmasın.
 * İlk sürümde 20 dk'ydı; ilk denemede fazla yavaş bulundu (2026-11-02).
 * Sohbet her zaman önce alındığı için kısa aralık mesajları bekletmez.
 */
export const AJAN_OGRENME_ARALIGI_MS = 5 * 60_000;

/**
 * Bekleyen konu kalmayınca ajanın kendine yeni liste çıkarma aralığı. İlk
 * sürümde 6 saatti (konu tekrarı korkusuyla); ajan çoğu zaman boş bekledi.
 * Kullanıcının kararı (2026-11-02): 10 dk — öğrendikçe tekrar ihtimali
 * azalıyor, aynı konu zaten ikinci kez eklenemiyor (ajanKonuAnahtari).
 * Yoğun modda da aynı: daha kısası ayrıca gerekmiyor.
 */
export const AJAN_LISTE_ARALIGI_MS = 10 * 60_000;

/**
 * Yoğun mod: Mac prizde ve kullanıcı başında değil (ajan/src/mac.ts). Fan ve
 * pil dert değil, aralık neredeyse kalkar. Tamamen sıfır değil: arka arkaya
 * gelen işler SearXNG'nin arkasındaki motorları (Google, Brave) dakikada
 * onlarca aramayla yorup geçici engel yemesin, sohbete de yer kalsın.
 */
export const AJAN_YOGUN_OGRENME_ARALIGI_MS = 60_000;

/** Anahtarın görünür öneki: kullanıcı Lio'nun ya da başka bir şeyin anahtarıyla karıştırmasın. */
export const AJAN_ANAHTAR_ONEKI = "ajan_";

export const AJAN_SINIRLARI = {
  mesaj: 4000,
  girdi: 1000,
  baslik: 200,
  bilgi: 8000,
  /**
   * Kullanıcının elle öğrettiği tek metin: 100 sayfalık bir belge de sığsın
   * (sayfa ~3000 karakter). Bu kadarı modele HİÇBİR ZAMAN tek parça gitmez;
   * istemde yalnızca başı durur, kalanı bellekte_ara ile parça parça okunur.
   */
  ogretilen: 600_000,
  rapor: 60_000,
  ozet: 1000,
  konu: 200,
  neden: 500,
  hata: 500,
  not: 200,
  ad: 40,
  kaynak: 20,
  fikirAdimi: 300,
  fikirAdimSayisi: 8,
  talimat: 4000,
  otomasyonAdi: 120,
  /** Kullanıcı başına en çok otomasyon: her biri Mac'te dakikalarca iş demek. */
  otomasyon: 20,
  /** Tek bir sonuçta kabul edilen en çok kayıt (model çılgınca not yağdırmasın). */
  sonucKalemi: 10,
} as const;

export function ajanBagliMi(sonNabiz: string | null | undefined, simdi: number = Date.now()): boolean {
  if (!sonNabiz) return false;
  const t = Date.parse(sonNabiz);
  return Number.isFinite(t) && simdi - t < AJAN_BAGLI_SAYILMA_MS;
}

export function ajanIsAsiliMi(alindiAt: string | null | undefined, simdi: number = Date.now()): boolean {
  if (!alindiAt) return true;
  const t = Date.parse(alindiAt);
  return !Number.isFinite(t) || simdi - t > AJAN_ASILI_IS_MS;
}

/**
 * Kuyruk boşken ajana ne verileceği. Sırası: bekleyen konu varsa öğrenme,
 * yoksa (ve son listeden beri yeterince geçtiyse) yeni liste çıkarma.
 */
export function ajanBostaNeYapsin(g: {
  ogrenmeAcik: boolean;
  bekleyenKonuVar: boolean;
  sonOgrenme: string | null;
  sonListe: string | null;
  /** Mac prizde ve kullanıcı başında değil. */
  yogun?: boolean;
  /** Son fikir işinden beri biriken yeni not sayısı ve o işin zamanı. */
  yeniNot?: number;
  sonFikir?: string | null;
  /** Son şirket inceleme işi; hiç yoksa ilk boşta şirketi tanır. */
  sonSirket?: string | null;
  simdi?: number;
}): "ogrenme" | "liste" | "fikir" | "sirket" | null {
  if (!g.ogrenmeAcik) return null;
  const simdi = g.simdi ?? Date.now();
  const gecti = (t: string | null, ms: number) => !t || simdi - Date.parse(t) >= ms;
  if (!gecti(g.sonOgrenme, g.yogun ? AJAN_YOGUN_OGRENME_ARALIGI_MS : AJAN_OGRENME_ARALIGI_MS)) return null;
  // Önce şirketi tanı: her şey ona göre öğrenilir ve önerilir. Alan verilmezse (eski çağıran) atlanır.
  if (g.sonSirket !== undefined && gecti(g.sonSirket, AJAN_SIRKET_ARALIGI_MS)) return "sirket";
  // Öğrenmek amaç değil: yeterince not birikince önce onları işe çevir.
  if ((g.yeniNot ?? 0) >= AJAN_FIKIR_ESIGI && gecti(g.sonFikir ?? null, AJAN_FIKIR_ARALIGI_MS)) return "fikir";
  if (g.bekleyenKonuVar) return "ogrenme";
  return gecti(g.sonListe, AJAN_LISTE_ARALIGI_MS) ? "liste" : null;
}

/** Metni kırpar; boşlukları sadeleştirmez (rapor markdown'ı bozulmasın). */
export function ajanKirp(metin: unknown, sinir: number): string {
  return typeof metin === "string" ? metin.trim().slice(0, sinir) : "";
}

function kaynaklariTemizle(v: unknown): AjanKaynak[] {
  if (!Array.isArray(v)) return [];
  const sonuc: AjanKaynak[] = [];
  for (const k of v.slice(0, AJAN_SINIRLARI.kaynak)) {
    const adres = ajanKirp((k as any)?.adres, 500);
    // Yalnızca http(s): rapordaki bağlantıya tıklayan kişi `javascript:` ile karşılaşmasın.
    if (!/^https?:\/\//i.test(adres)) continue;
    sonuc.push({ baslik: ajanKirp((k as any)?.baslik, AJAN_SINIRLARI.baslik) || adres, adres });
  }
  return sonuc;
}

function tarihMi(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v));
}

/**
 * Mac'ten gelen sonucu sınırlar içinde, bilinmeyen alanları atarak temizler.
 * Mac'teki program kullanıcının kendi programı olsa da çıktıyı bir dil modeli
 * üretiyor ve modelin okuduğu web sayfaları ona her şeyi yazdırabilir.
 */
export function ajanSonucunuTemizle(ham: unknown): AjanIsSonucu {
  const h = (ham && typeof ham === "object" ? ham : {}) as Record<string, any>;
  const s: AjanIsSonucu = {};
  const n = AJAN_SINIRLARI.sonucKalemi;
  if (h.hata) s.hata = ajanKirp(h.hata, AJAN_SINIRLARI.hata) || "Bilinmeyen hata";
  const mesaj = ajanKirp(h.mesaj, AJAN_SINIRLARI.mesaj);
  if (mesaj) s.mesaj = mesaj;
  if (h.rapor && typeof h.rapor === "object") {
    const icerik = ajanKirp(h.rapor.icerik, AJAN_SINIRLARI.rapor);
    if (icerik)
      s.rapor = {
        baslik: ajanKirp(h.rapor.baslik, AJAN_SINIRLARI.baslik) || "Araştırma raporu",
        ozet: ajanKirp(h.rapor.ozet, AJAN_SINIRLARI.ozet) || undefined,
        icerik,
        kaynaklar: kaynaklariTemizle(h.rapor.kaynaklar),
      };
  }
  if (Array.isArray(h.bilgiler))
    s.bilgiler = h.bilgiler
      .slice(0, n)
      .map((b: any) => ({
        baslik: ajanKirp(b?.baslik, AJAN_SINIRLARI.baslik),
        icerik: ajanKirp(b?.icerik, AJAN_SINIRLARI.bilgi),
        kaynaklar: kaynaklariTemizle(b?.kaynaklar),
      }))
      .filter((b: { baslik: string; icerik: string }) => b.baslik && b.icerik);
  if (Array.isArray(h.konular))
    s.konular = h.konular
      .slice(0, n)
      .map((k: any) => ({ konu: ajanKirp(k?.konu, AJAN_SINIRLARI.konu), neden: ajanKirp(k?.neden, AJAN_SINIRLARI.neden) || undefined }))
      .filter((k: { konu: string }) => k.konu);
  if (Array.isArray(h.oneriler)) {
    const oneriler: NonNullable<AjanIsSonucu["oneriler"]> = [];
    for (const o of h.oneriler.slice(0, n)) {
      if (o?.tur === "yapilacak") {
        const veri = {
          baslik: ajanKirp(o?.veri?.baslik, AJAN_SINIRLARI.baslik),
          aciklama: ajanKirp(o?.veri?.aciklama, AJAN_SINIRLARI.ozet) || undefined,
          bitis: tarihMi(o?.veri?.bitis) ? o.veri.bitis : undefined,
        };
        if (veri.baslik) oneriler.push({ tur: "yapilacak", veri });
      } else if (o?.tur === "lio") {
        const veri = { baslik: ajanKirp(o?.veri?.baslik, AJAN_SINIRLARI.baslik), talimat: ajanKirp(o?.veri?.talimat, AJAN_SINIRLARI.mesaj) };
        if (veri.baslik && veri.talimat) oneriler.push({ tur: "lio", veri });
      } else if (o?.tur === "fikir") {
        const veri = ajanFikriTemizle(o?.veri);
        if (veri) oneriler.push({ tur: "fikir", veri });
      }
    }
    s.oneriler = oneriler;
  }
  return s;
}

/** Aynı konu iki kez listeye girmesin diye karşılaştırma anahtarı. */
export function ajanKonuAnahtari(konu: string): string {
  return konu.toLocaleLowerCase("tr").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

// ------------------------------------------------------------------ uzun öğretilenler

/** İstemde tam yer alan öğretilenin en uzun boyu; uzunu "belge" sayılır. */
export const AJAN_ISTEMDE_TAM_SINIR = 1500;
/** Belgenin istemde duran başı. */
export const AJAN_BELGE_BASI = 600;
/** Tüm öğretilenlerin istemdeki toplam payı (qwen3:8b bağlamı 16K token). */
export const AJAN_OGRETILEN_BUTCESI = 12_000;

/**
 * Öğretilenleri modelin bağlamına sığdırır. Kısa olanlar (kurallar) olduğu
 * gibi gider; uzun belgenin yalnızca başı ve "tamamı bellekte" notu gider.
 * Liste yeniden eskiye gelir; bütçe dolunca eskiler düşer — bellekte_ara
 * onları yine bulur.
 */
export function ajanOgretilenleriSigdir(liste: { baslik: string; icerik: string }[], butce = AJAN_OGRETILEN_BUTCESI) {
  const sonuc: { baslik: string; icerik: string }[] = [];
  let kalan = butce;
  for (const o of liste) {
    const icerik =
      o.icerik.length <= AJAN_ISTEMDE_TAM_SINIR
        ? o.icerik
        : `${o.icerik.slice(0, AJAN_BELGE_BASI).trimEnd()}… [Uzun belge, toplam ${o.icerik.length} karakter. Ayrıntı gerektiğinde bellekte_ara ile içinde ara.]`;
    if (icerik.length + o.baslik.length > kalan) break;
    kalan -= icerik.length + o.baslik.length;
    sonuc.push({ baslik: o.baslik, icerik });
  }
  return sonuc;
}

/** Aramanın kelimeleri: kısa ekler ve noktalama aramayı boğmasın. */
export function ajanAramaKelimeleri(sorgu: string): string[] {
  const kelimeler = sorgu
    .toLocaleLowerCase("tr")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((k) => k.length >= 3);
  return [...new Set(kelimeler)].slice(0, 6);
}

/**
 * Uzun metinden aranan kelimelerin geçtiği yerlerin çevresini alır. 100
 * sayfalık belgenin başını değil, sorulan yerini göstermek için: bellekte_ara
 * eskiden her kaydın ilk 1500 karakterini dönüyordu.
 */
export function ajanBellekAlintisi(icerik: string, kelimeler: string[], pencere = 700, enCok = 3): string {
  if (icerik.length <= pencere * 2) return icerik;
  const kucuk = icerik.toLocaleLowerCase("tr");
  const konumlar: number[] = [];
  for (const k of kelimeler) {
    let i = kucuk.indexOf(k);
    while (i >= 0 && konumlar.length < 50) {
      konumlar.push(i);
      i = kucuk.indexOf(k, i + k.length);
    }
  }
  if (!konumlar.length) return icerik.slice(0, pencere) + "…";
  konumlar.sort((a, b) => a - b);
  // Kelimelerin en sık bir arada geçtiği yerler önce gelsin.
  const puan = (i: number) => konumlar.filter((j) => Math.abs(j - i) < pencere / 2).length;
  const secilen: number[] = [];
  for (const i of [...konumlar].sort((a, b) => puan(b) - puan(a))) {
    if (secilen.length >= enCok) break;
    if (secilen.every((j) => Math.abs(j - i) >= pencere)) secilen.push(i);
  }
  return secilen
    .sort((a, b) => a - b)
    .map((i) => {
      const bas = Math.max(0, i - pencere / 2);
      return `${bas > 0 ? "…" : ""}${icerik.slice(bas, bas + pencere).trim()}${bas + pencere < icerik.length ? "…" : ""}`;
    })
    .join("\n\n");
}

// ------------------------------------------------------------------ fikirler

const ETKILER: AjanFikirEtkisi[] = ["yuksek", "orta", "dusuk"];
const EMEKLER: AjanFikirEmegi[] = ["kucuk", "orta", "buyuk"];

/**
 * Fikri doğrular. Faydası ya da en az 2 somut adımı olmayan fikir düşer:
 * kullanıcının istediği "iş bitirici" fikir, adımı olmayan bir öğüt değil.
 */
export function ajanFikriTemizle(v: any): AjanFikirVerisi | null {
  const baslik = ajanKirp(v?.baslik, AJAN_SINIRLARI.baslik);
  const fayda = ajanKirp(v?.fayda, AJAN_SINIRLARI.ozet);
  const adimlar = (Array.isArray(v?.adimlar) ? v.adimlar : typeof v?.adimlar === "string" ? ajanAdimlariAyir(v.adimlar) : [])
    .map((a: unknown) => ajanKirp(a, AJAN_SINIRLARI.fikirAdimi))
    .filter(Boolean)
    .slice(0, AJAN_SINIRLARI.fikirAdimSayisi);
  if (!baslik || !fayda || adimlar.length < 2) return null;
  return {
    baslik,
    fayda,
    adimlar,
    etki: ETKILER.includes(v?.etki) ? v.etki : "orta",
    emek: EMEKLER.includes(v?.emek) ? v.emek : "orta",
    dayanak: ajanKirp(v?.dayanak, AJAN_SINIRLARI.baslik) || undefined,
  };
}

/** Modelin tek metin olarak yazdığı adımları ayırır: "1. … 2. …", satırlar ya da ";". */
export function ajanAdimlariAyir(metin: string): string[] {
  const satirlar = metin.split(/\n|;/).map((x) => x.trim()).filter(Boolean);
  const parcalar = satirlar.length > 1 ? satirlar : metin.split(/\s(?=\d+[.)]\s)/);
  return parcalar.map((x) => x.replace(/^\s*(\d+[.)]|[-*•])\s*/, "").trim()).filter(Boolean);
}

/** Onaylanan fikrin yapılacak açıklaması: fayda + adım listesi. */
export function ajanFikirAciklamasi(f: AjanFikirVerisi): string {
  return `${f.fayda}\n\nAdımlar:\n${f.adimlar.map((a, i) => `${i + 1}. ${a}`).join("\n")}${f.dayanak ? `\n\nDayanak: ${f.dayanak}` : ""}`;
}

/** Bu kadar yeni not birikince ajan onlardan fikir çıkarır. */
export const AJAN_FIKIR_ESIGI = 5;
/** İki fikir işi arası en kısa süre: aynı notlardan aynı fikirler çıkmasın. */
export const AJAN_FIKIR_ARALIGI_MS = 3 * 60 * 60_000;

// ------------------------------------------------------------------ otomasyonlar

/**
 * Türkiye 2016'dan beri yıl boyu UTC+3; yaz saati yok. Otomasyon saatleri
 * kullanıcının duvar saatidir, sunucu UTC'de çalışır.
 */
const TR_OFSET_MS = 3 * 60 * 60_000;

/**
 * Otomasyonun `simdi`den SONRAKİ ilk çalışma anı. Mac kapalıyken kaçan
 * çalışmalar birikmez: Mac açılınca bir kez koşar, sonraki yine buradan.
 */
export function ajanSonrakiCalisma(o: { siklik: AjanOtomasyonSikligi; saat: number; gun: number }, simdi = Date.now()): string {
  const yerel = new Date(simdi + TR_OFSET_MS); // UTC alanları = Türkiye saati
  const aday = (y: number, a: number, g: number) => Date.UTC(y, a, g, o.saat, 0, 0) - TR_OFSET_MS;
  const Y = yerel.getUTCFullYear();
  const A = yerel.getUTCMonth();
  const G = yerel.getUTCDate();
  if (o.siklik === "gunluk") {
    const t = aday(Y, A, G);
    return new Date(t > simdi ? t : aday(Y, A, G + 1)).toISOString();
  }
  if (o.siklik === "haftalik") {
    const bugunHafta = ((yerel.getUTCDay() + 6) % 7) + 1; // 1 = pazartesi
    let fark = (o.gun - bugunHafta + 7) % 7;
    if (fark === 0 && aday(Y, A, G) <= simdi) fark = 7;
    return new Date(aday(Y, A, G + fark)).toISOString();
  }
  const t = aday(Y, A, o.gun);
  return new Date(t > simdi ? t : aday(Y, A + 1, o.gun)).toISOString();
}

export function ajanOtomasyonZamani(o: { siklik: AjanOtomasyonSikligi; saat: number; gun: number }): string {
  const saat = `${String(o.saat).padStart(2, "0")}:00`;
  if (o.siklik === "gunluk") return `Her gün ${saat}`;
  if (o.siklik === "haftalik") return `Her ${["pazartesi", "salı", "çarşamba", "perşembe", "cuma", "cumartesi", "pazar"][o.gun - 1]} ${saat}`;
  return `Her ayın ${o.gun}. günü ${saat}`;
}

/** Panelde tek tıkla kurulan hazır otomasyonlar. Talimatlar iş bitirici çıktıya yönlendirir. */
export const AJAN_OTOMASYON_SABLONLARI: { ad: string; talimat: string; siklik: AjanOtomasyonSikligi; saat: number; gun: number }[] = [
  {
    ad: "Haftalık rakip takibi",
    talimat:
      "Öğrettiğim rakipleri ve sektörümüzü tara: son bir haftadaki yeni ürün, fiyat, kampanya ve duyuruları bul. Kısa bir rapor yaz; " +
      "rakiplerin yaptığından bizim hemen uygulayabileceğimiz 2-3 iş bitirici fikir öner.",
    siklik: "haftalik",
    saat: 9,
    gun: 1,
  },
  {
    ad: "Günlük sektör özeti",
    talimat:
      "Sektörümüzle ilgili bugünkü önemli haberleri ve gelişmeleri bul. 5 maddelik kısa bir özet rapor yaz; " +
      "işimizi doğrudan etkileyen bir gelişme varsa onu fırsata çeviren bir fikir öner.",
    siklik: "gunluk",
    saat: 8,
    gun: 1,
  },
  {
    ad: "Haftalık müşteri kazanma fikirleri",
    talimat:
      "Öğrendiklerine ve öğrettiklerime bakarak bu hafta yeni müşteri kazanmak ya da mevcut müşteriye daha fazla satmak için " +
      "bir hafta içinde bitirilebilecek 3 somut iş öner. Gerekirse internette örnek ve veri ara.",
    siklik: "haftalik",
    saat: 10,
    gun: 5,
  },
  {
    ad: "Aylık maliyet ve verim taraması",
    talimat:
      "İşimizde zaman ya da para kaybettiren süreçleri düşün; daha ucuz araçları, otomasyon yollarını ve iyi uygulamaları araştır. " +
      "Rapor yaz ve tasarruf sağlayacak 2-3 iş bitirici fikir öner.",
    siklik: "aylik",
    saat: 10,
    gun: 1,
  },
];

// ------------------------------------------------------------------ şirketi tanıma

/**
 * Ajanın Projelio'da okuyabildiği Lio araçları. YALNIZCA okuma: ajan işlem
 * yapmaz, Lio'ya devreder. Hepsi Lio'daki yetki kurallarından geçer (kullanıcının
 * göremediğini ajan da göremez). Mac'teki projelio_oku aracı bu listeden seçer.
 */
export const AJAN_PROJELIO_ARACLARI = {
  get_workspace_summary: "Genel durum: gecikmiş ve bu hafta biten görevler, bana atananlar.",
  list_organizations: "Şirketler (organizationId, ad, tür, açıklama).",
  get_info_card: "Şirketin bilgi kartı: künye, belgeler, ek bilgiler. kimlik = organizationId.",
  list_departments: "Departmanlar. kimlik = organizationId (isteğe bağlı).",
  list_jobs: "İşler.",
  list_projects: "Projeler ve durumları. kimlik = jobId (isteğe bağlı).",
  list_tasks: "Bir projenin görevleri. kimlik = projectId.",
  list_products: "Ürün ve hizmetler. kimlik = organizationId; sorgu ile süzülür.",
  list_customers: "Müşteriler. kimlik = organizationId; sorgu ile süzülür.",
  list_modules: "Şirkette açık modüller.",
} as const;

export type AjanProjelioAraci = keyof typeof AJAN_PROJELIO_ARACLARI;

export function ajanProjelioAraciMi(v: unknown): v is AjanProjelioAraci {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(AJAN_PROJELIO_ARACLARI, v);
}

/**
 * Ajana ASLA gitmeyen alanlar. Ajanın anahtarı bir Mac'te düz dosyada duruyor
 * ve model okuduğu web sayfalarından yönlendirilebiliyor; fikir üretmek için
 * IBAN'a, vergi numarasına, müşterinin telefonuna gerek yok.
 */
const HASSAS_ANAHTAR = /iban|vergi|tax|mersis|sicil|tckn|kimlik|tc_?no|telefon|phone|gsm|e-?posta|email|mail|adres|address|sifre|parola|password|token|secret|hesap_?no|account_?no|kart/i;

export function ajanHassasAlanlariAt(v: unknown, derinlik = 0): unknown {
  if (derinlik > 8) return undefined;
  if (Array.isArray(v)) return v.map((x) => ajanHassasAlanlariAt(x, derinlik + 1));
  if (v && typeof v === "object") {
    const sonuc: Record<string, unknown> = {};
    for (const [k, deger] of Object.entries(v as Record<string, unknown>)) {
      if (HASSAS_ANAHTAR.test(k)) continue;
      // Bilgi kartının ek alanları {alan, deger} biçiminde: anahtar değil ALAN adı hassas olabilir.
      if (typeof (deger as any) !== "object" && k === "deger" && HASSAS_ANAHTAR.test(String((v as any).alan ?? ""))) continue;
      sonuc[k] = ajanHassasAlanlariAt(deger, derinlik + 1);
    }
    return sonuc;
  }
  return v;
}

/** Şirket profilinin tazelenme aralığı ve ajanın onu inceleme işi. */
export const AJAN_SIRKET_ARALIGI_MS = 24 * 60 * 60_000;
/** Profilin pakete giren payı: öğretilenler ve bağlamla aynı 16K bağlamı paylaşıyor. */
export const AJAN_SIRKET_BUTCESI = 4000;
