/**
 * Lio'ya WhatsApp'tan gelen medya (video, fotoğraf) + "onaysız planlama olmaz"
 * koruması.
 *
 * Servislerden AYRI, saf bir dosya: veritabanı ya da HTTP gerektirmeden test
 * edilebilsin diye (bkz. publish-format.ts ile aynı gerekçe).
 *
 * NEDEN BELLEKTE: sohbete iliştirilen dosya bir proje dosyası değildir
 * (bkz. AiAttachmentsService.prepared) — kullanıcı "bunu Instagram'a at"
 * demeden Drive'a yazmak kotayı şişirir. Dosya ancak Lio bir gönderi taslağı
 * açtığında kalıcı olur (Drive'a yazılır). Süre dolarsa ya da sunucu yeniden
 * başlarsa Lio kullanıcıdan dosyayı yeniden ister; sessizce kaybolmaz.
 */

export interface GelenMedya {
  id: string;
  ad: string;
  mimeType: string;
  boyut: number;
  buffer: Buffer;
  gelis: number;
  /**
   * Dosya (belge) olarak mı geldi. WhatsApp video/fotoğrafı "medya" olarak
   * gönderince yeniden sıkıştırıyor; belge olarak gönderilen orijinal kalır.
   */
  orijinal: boolean;
  /** Bu dosya, daha önce gelen sıkıştırılmış bir kopyanın yerine geçti (o kopya depodan düştü). */
  yerineGectigi?: { id: string; ad: string };
}

/** Bir kullanıcının bekleyen medyası bu kadar kalır (kararsız kullanıcı için yeterli, bellek için kısa). */
export const MEDYA_OMRU_MS = 3 * 60 * 60 * 1000;
/** Kullanıcı başına en çok kaç medya (karusel 10 görsel). */
export const MEDYA_ADET_TAVANI = 12;
/** Kullanıcı başına toplam bayt tavanı; aşılırsa en eskiler düşer. */
export const MEDYA_BAYT_TAVANI = 150 * 1024 * 1024;
/** Tek dosya tavanı. WhatsApp video olarak ~16 MB; belge olarak gelirse daha büyük olabilir. */
export const MEDYA_TEK_DOSYA_TAVANI = 64 * 1024 * 1024;

export function medyaTuru(mimeType: string): "video" | "gorsel" | null {
  if (mimeType.startsWith("video/")) return "video";
  if (["image/jpeg", "image/png", "image/webp"].includes(mimeType)) return "gorsel";
  return null;
}

/**
 * WAHA yükünden: mesaj belge olarak mı gönderildi.
 *
 * Motora göre alan adları değişiyor (NOWEB/GOWS), o yüzden birkaç yoldan
 * bakılır; hiçbiri yoksa dosya adı ipucu olur — WhatsApp belgelere ad
 * verir, video/fotoğrafa vermez.
 */
export function belgeOlarakMi(payload: any, dosyaAdi?: string | null): boolean {
  const d = payload?._data ?? {};
  const msg = d.message ?? d.Message ?? {};
  if (d.type === "document" || d.mediaType === "document") return true;
  if (msg.documentMessage || msg.documentWithCaptionMessage) return true;
  if (msg.videoMessage || msg.imageMessage) return false;
  return Boolean(dosyaAdi?.trim());
}

export class GelenMedyaDeposu {
  private medya = new Map<string, GelenMedya[]>();
  /** Bu kullanıcı mesajında (turda) oluşturulan ya da değiştirilen taslaklar. */
  private buTur = new Map<string, Set<string>>();
  /** Kullanıcıya gösterilmiş ve bir mesajla karşılık almış taslaklar. */
  private sunulan = new Map<string, Set<string>>();

  // Node'un yerleşik test koşucusu "parameter property" sözdizimini
  // çalıştıramıyor (bkz. publish-format.ts başlığı); alanlar açık yazıldı.
  private now: () => number;
  private id: () => string;

  constructor(now: () => number = Date.now, id: () => string = () => Math.random().toString(36).slice(2, 10)) {
    this.now = now;
    this.id = id;
  }

  // ------------------------------------------------------------------ medya

  ekle(userId: string, m: { ad: string; mimeType: string; buffer: Buffer; orijinal?: boolean }): GelenMedya {
    const kayit: GelenMedya = {
      id: `med_${this.id()}`,
      ad: m.ad,
      mimeType: m.mimeType,
      boyut: m.buffer.length,
      buffer: m.buffer,
      gelis: this.now(),
      orijinal: m.orijinal === true,
    };
    const liste = this.temiz(userId);
    // Kullanıcı sıkıştırılmış kopyanın ardından aynı içeriği dosya olarak
    // yeniden gönderdi: ikincisiyle devam edilir. Eşleştirme türe ve sıraya
    // göre — en eski bekleyen sıkıştırılmış kopya düşer; aynı sırayla
    // yeniden gönderilen bir karusel bu yüzden doğru eşleşir.
    if (kayit.orijinal) {
      const tur = medyaTuru(kayit.mimeType);
      const i = liste.findIndex((x) => !x.orijinal && medyaTuru(x.mimeType) === tur);
      if (i >= 0) {
        kayit.yerineGectigi = { id: liste[i].id, ad: liste[i].ad };
        liste.splice(i, 1);
      }
    }
    liste.push(kayit);
    while (liste.length > MEDYA_ADET_TAVANI || toplamBayt(liste) > MEDYA_BAYT_TAVANI) {
      if (liste.length <= 1) break;
      liste.shift();
    }
    this.medya.set(userId, liste);
    return kayit;
  }

  liste(userId: string): GelenMedya[] {
    return [...this.temiz(userId)];
  }

  /** Verilen sırayla döner; bulunamayan kimlik varsa `eksik`e girer. */
  coz(userId: string, ids: string[]): { medya: GelenMedya[]; eksik: string[] } {
    const liste = this.temiz(userId);
    const medya: GelenMedya[] = [];
    const eksik: string[] = [];
    for (const id of ids) {
      const m = liste.find((x) => x.id === id);
      if (m) medya.push(m);
      else eksik.push(id);
    }
    return { medya, eksik };
  }

  birak(userId: string, ids: string[]): void {
    const kalan = this.temiz(userId).filter((m) => !ids.includes(m.id));
    if (kalan.length) this.medya.set(userId, kalan);
    else this.medya.delete(userId);
  }

  private temiz(userId: string): GelenMedya[] {
    const sinir = this.now() - MEDYA_OMRU_MS;
    const canli = (this.medya.get(userId) ?? []).filter((m) => m.gelis >= sinir);
    if (canli.length) this.medya.set(userId, canli);
    else this.medya.delete(userId);
    return canli;
  }

  // ------------------------------------------------------------ onay koruması
  //
  // Kural: bir taslak, KULLANICIYA GÖSTERİLDİKTEN SONRA gelen bir mesajdan önce
  // planlanamaz. Modelin "onayladı" saymasına güvenmiyoruz: Lio taslağı açıp
  // aynı turda planlarsa kullanıcı açıklamayı hiç görmeden içerik yayına girer
  // ve Instagram'da yayımlanan bir şey geri alınamaz. Kullanıcının araya giren
  // her mesajı (evet, düzelt, iptal) turu kapatır.

  /** Taslak bu turda oluştu ya da değişti: yeniden gösterilmesi gerekir. */
  taslakDokunuldu(userId: string, postId: string): void {
    ekleSet(this.buTur, userId, postId);
    this.sunulan.get(userId)?.delete(postId);
  }

  /** Kullanıcı yeni bir mesaj yazdı: önceki turda dokunulanlar artık gösterilmiş sayılır. */
  yeniTur(userId: string): void {
    const onceki = this.buTur.get(userId);
    if (!onceki?.size) return;
    for (const id of onceki) ekleSet(this.sunulan, userId, id);
    this.buTur.delete(userId);
  }

  planlanabilir(userId: string, postId: string): boolean {
    return this.sunulan.get(userId)?.has(postId) === true;
  }

  planlandi(userId: string, postId: string): void {
    this.sunulan.get(userId)?.delete(postId);
    this.buTur.get(userId)?.delete(postId);
  }
}

function ekleSet(m: Map<string, Set<string>>, k: string, v: string): void {
  const s = m.get(k) ?? new Set<string>();
  s.add(v);
  m.set(k, s);
}

function toplamBayt(l: GelenMedya[]): number {
  return l.reduce((t, m) => t + m.boyut, 0);
}

/** Süreç genelinde tek depo: WhatsApp köprüsü yazar, Lio'nun araçları okur. */
export const gelenMedya = new GelenMedyaDeposu();
