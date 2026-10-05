import type { SocialAccountMediaItem } from "./types";

/**
 * İçerik analizinin saf hesapları: bir gönderi "iyi gitti mi" sorusunun cevabı.
 *
 * NEDEN ORTAK DOSYADA: aynı hesabı iki yer yapıyor — Analiz sekmesi (rozetler,
 * özet kutuları) ve sunucunun Lio'ya giden özeti. İkisi ayrı hesaplasaydı Lio
 * "en iyi videon şu" derken ekranda başka bir video yıldızlı görünebilirdi
 * (butceToplama.ts ile aynı gerekçe).
 *
 * TEMEL FİKİR — mutlak sayı değil, HESABIN KENDİ NORMALİ: 5.000 izlenme bir
 * hesap için rekor, başka biri için kötü gün. Her gönderi kendi hesabının
 * medyanıyla kıyaslanır ("normalin 3,2 katı"). Ortalama değil medyan, çünkü tek
 * bir viral video ortalamayı uçurup geri kalan her şeyi "zayıf" gösterirdi.
 */

/**
 * Bir gönderinin metrikleri bu kadar saat dolmadan kıyasa girmez.
 *
 * Yeni bir reels ilk iki günde izlenmesinin çoğunu toplar; 6 saatlik bir video
 * medyanın altında görünür ve "zayıf" damgası yer, ertesi gün yıldız olur.
 * Olgunlaşmamış gönderi hem temel hesaba katılmaz hem de rozet almaz.
 */
export const OLGUNLASMA_SAATI = 48;

/** Medyan hesaplanırken en az bu kadar olgun gönderi olmalı; azında kıyas anlamsız. */
export const MIN_KIYAS_GONDERISI = 3;

export type IcerikTuru = "reels" | "karusel" | "gorsel" | "video";

export type PerformansEtiketi = "yildiz" | "iyi" | "normal" | "zayif" | "yeni";

/** Instagram'ın iki alanından (media_type + media_product_type) tek tür. */
export function icerikTuru(m: Pick<SocialAccountMediaItem, "mediaType" | "mediaProductType">): IcerikTuru {
  if (m.mediaProductType === "REELS") return "reels";
  if (m.mediaType === "CAROUSEL_ALBUM") return "karusel";
  if (m.mediaType === "VIDEO") return "video";
  return "gorsel";
}

/**
 * Kıyasta kullanılan tek sayı.
 *
 * Öncelik izlenme (views): Instagram 2025'ten beri her türde onu raporluyor ve
 * "ne kadar izlendi" sorusunun doğrudan cevabı. Eski gönderilerde ya da
 * okunamadığında erişim, o da yoksa beğeni — hiç yoksa kıyas dışı.
 */
export function performansDegeri(m: SocialAccountMediaItem): number | null {
  for (const deger of [m.views, m.reach, m.likeCount]) {
    if (typeof deger === "number" && Number.isFinite(deger) && deger >= 0) return deger;
  }
  return null;
}

export function medyan(sayilar: number[]): number | null {
  if (sayilar.length === 0) return null;
  const sirali = [...sayilar].sort((a, b) => a - b);
  const orta = Math.floor(sirali.length / 2);
  return sirali.length % 2 ? sirali[orta] : (sirali[orta - 1] + sirali[orta]) / 2;
}

export function olgunMu(m: Pick<SocialAccountMediaItem, "postedAt">, simdi: Date): boolean {
  if (!m.postedAt) return true;
  const zaman = Date.parse(m.postedAt);
  if (!Number.isFinite(zaman)) return true;
  return simdi.getTime() - zaman >= OLGUNLASMA_SAATI * 60 * 60 * 1000;
}

/** Hesap başına medyan performans değeri (yalnızca olgun gönderilerden). */
export function hesapMedyanlari(medya: SocialAccountMediaItem[], simdi: Date): Map<string, number> {
  const gruplar = new Map<string, number[]>();
  for (const m of medya) {
    if (!olgunMu(m, simdi)) continue;
    const deger = performansDegeri(m);
    if (deger === null) continue;
    const liste = gruplar.get(m.accountId) ?? [];
    liste.push(deger);
    gruplar.set(m.accountId, liste);
  }
  const sonuc = new Map<string, number>();
  for (const [hesap, degerler] of gruplar) {
    if (degerler.length < MIN_KIYAS_GONDERISI) continue;
    const md = medyan(degerler);
    // Medyanı 0 olan hesapta her şey "sonsuz kat" olurdu; kıyas yapılmaz.
    if (md !== null && md > 0) sonuc.set(hesap, md);
  }
  return sonuc;
}

export interface PerformansSonucu {
  /** Hesabın medyanına oranı; kıyas yapılamıyorsa null. */
  kat: number | null;
  etiket: PerformansEtiketi | null;
}

/**
 * Her gönderinin hesabının normaline göre yeri.
 *
 * Eşikler: 2 kat ve üstü yıldız, 1,3 ve üstü iyi, 0,6 ve altı zayıf. Dar
 * tutulmadı: her hafta yarısı "iyi" yarısı "zayıf" görünen bir ekran bilgi
 * vermez; rozet gerçekten ayrışan gönderide çıkmalı.
 */
export function performanslar(medya: SocialAccountMediaItem[], simdi: Date): Map<string, PerformansSonucu> {
  const medyanlar = hesapMedyanlari(medya, simdi);
  const sonuc = new Map<string, PerformansSonucu>();
  for (const m of medya) {
    if (!olgunMu(m, simdi)) {
      sonuc.set(m.id, { kat: null, etiket: "yeni" });
      continue;
    }
    const deger = performansDegeri(m);
    const md = medyanlar.get(m.accountId);
    if (deger === null || md === undefined) {
      sonuc.set(m.id, { kat: null, etiket: null });
      continue;
    }
    const kat = Math.round((deger / md) * 10) / 10;
    sonuc.set(m.id, { kat, etiket: performansEtiketi(kat) });
  }
  return sonuc;
}

export function performansEtiketi(kat: number): PerformansEtiketi {
  if (kat >= 2) return "yildiz";
  if (kat >= 1.3) return "iyi";
  if (kat <= 0.6) return "zayif";
  return "normal";
}

/**
 * Kaydetme + paylaşım / erişim — "insanlar bunu sakladı ve yaydı mı".
 *
 * İzlenmeden daha iyi bir kalite sinyali: algoritma bir videoyu çok kişiye
 * gösterebilir, ama kaydedilmesi içeriğin değer taşıdığını söyler. Erişimi
 * 0 ya da bilinmeyen gönderide hesaplanmaz.
 */
export function kaydetPaylasOrani(m: SocialAccountMediaItem): number | null {
  if (!m.reach || m.reach <= 0) return null;
  if (m.saved === undefined && m.shares === undefined) return null;
  return ((m.saved ?? 0) + (m.shares ?? 0)) / m.reach;
}

export interface TurOzeti {
  tur: IcerikTuru;
  adet: number;
  medyanDeger: number | null;
}

/** İçerik türlerine göre adet ve medyan performans — hangi format işliyor. */
export function turOzeti(medya: SocialAccountMediaItem[], simdi: Date): TurOzeti[] {
  const gruplar = new Map<IcerikTuru, { adet: number; degerler: number[] }>();
  for (const m of medya) {
    const tur = icerikTuru(m);
    const grup = gruplar.get(tur) ?? { adet: 0, degerler: [] };
    grup.adet++;
    const deger = performansDegeri(m);
    if (deger !== null && olgunMu(m, simdi)) grup.degerler.push(deger);
    gruplar.set(tur, grup);
  }
  return Array.from(gruplar, ([tur, g]) => ({ tur, adet: g.adet, medyanDeger: medyan(g.degerler) })).sort(
    (a, b) => (b.medyanDeger ?? -1) - (a.medyanDeger ?? -1)
  );
}

export interface SaatOzeti {
  /** 0-23, çağıranın verdiği saat diliminde. */
  saat: number;
  adet: number;
  medyanDeger: number;
}

/**
 * Paylaşım saatine göre medyan performans.
 *
 * Saat dilimini çağıran verir (`saatAl`): tarayıcı kullanıcının yerel saatini,
 * sunucu kullanıcının tercih ettiği dilimi kullanır. Burada sabit bir dilim
 * seçmek, yurt dışındaki kullanıcıya "en iyi saatin 03:00" dedirtirdi.
 * Tek gönderilik saat dilimleri listeye girmez: bir gönderiden ders çıkmaz.
 */
export function saatOzeti(
  medya: SocialAccountMediaItem[],
  simdi: Date,
  saatAl: (iso: string) => number
): SaatOzeti[] {
  const gruplar = new Map<number, number[]>();
  for (const m of medya) {
    if (!m.postedAt || !olgunMu(m, simdi)) continue;
    const deger = performansDegeri(m);
    if (deger === null) continue;
    const saat = saatAl(m.postedAt);
    if (!Number.isInteger(saat) || saat < 0 || saat > 23) continue;
    const liste = gruplar.get(saat) ?? [];
    liste.push(deger);
    gruplar.set(saat, liste);
  }
  return Array.from(gruplar, ([saat, degerler]) => ({ saat, adet: degerler.length, medyanDeger: medyan(degerler)! }))
    .filter((s) => s.adet >= 2)
    .sort((a, b) => b.medyanDeger - a.medyanDeger);
}
