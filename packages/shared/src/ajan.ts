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

export type AjanIsTuru = "sohbet" | "arastirma" | "ogrenme" | "liste";
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
  icerik: string;
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

export interface AjanOneri {
  id: string;
  tur: "yapilacak";
  veri: AjanYapilacakVerisi;
  durum: "bekliyor" | "onaylandi" | "reddedildi";
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
  bekleyenOneri: number;
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
}

/** Mac'in işi bitirirken gönderdiği sonuç. Hepsi isteğe bağlı. */
export interface AjanIsSonucu {
  hata?: string;
  mesaj?: string;
  rapor?: { baslik: string; ozet?: string; icerik: string; kaynaklar?: AjanKaynak[] };
  bilgiler?: { baslik: string; icerik: string; kaynaklar?: AjanKaynak[] }[];
  konular?: { konu: string; neden?: string }[];
  oneriler?: { tur: "yapilacak"; veri: AjanYapilacakVerisi }[];
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
 */
export const AJAN_OGRENME_ARALIGI_MS = 20 * 60_000;

/** Bekleyen konu kalmayınca ajanın kendine yeni liste çıkarma aralığı. */
export const AJAN_LISTE_ARALIGI_MS = 6 * 60 * 60_000;

/** Anahtarın görünür öneki: kullanıcı Lio'nun ya da başka bir şeyin anahtarıyla karıştırmasın. */
export const AJAN_ANAHTAR_ONEKI = "ajan_";

export const AJAN_SINIRLARI = {
  mesaj: 4000,
  girdi: 1000,
  baslik: 200,
  bilgi: 8000,
  rapor: 60_000,
  ozet: 1000,
  konu: 200,
  neden: 500,
  hata: 500,
  not: 200,
  ad: 40,
  kaynak: 20,
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
  simdi?: number;
}): "ogrenme" | "liste" | null {
  if (!g.ogrenmeAcik) return null;
  const simdi = g.simdi ?? Date.now();
  const gecti = (t: string | null, ms: number) => !t || simdi - Date.parse(t) >= ms;
  if (!gecti(g.sonOgrenme, AJAN_OGRENME_ARALIGI_MS)) return null;
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
  if (Array.isArray(h.oneriler))
    s.oneriler = h.oneriler
      .slice(0, n)
      .filter((o: any) => o?.tur === "yapilacak")
      .map((o: any) => ({
        tur: "yapilacak" as const,
        veri: {
          baslik: ajanKirp(o?.veri?.baslik, AJAN_SINIRLARI.baslik),
          aciklama: ajanKirp(o?.veri?.aciklama, AJAN_SINIRLARI.ozet) || undefined,
          bitis: tarihMi(o?.veri?.bitis) ? o.veri.bitis : undefined,
        },
      }))
      .filter((o: { veri: AjanYapilacakVerisi }) => o.veri.baslik);
  return s;
}

/** Aynı konu iki kez listeye girmesin diye karşılaştırma anahtarı. */
export function ajanKonuAnahtari(konu: string): string {
  return konu.toLocaleLowerCase("tr").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
