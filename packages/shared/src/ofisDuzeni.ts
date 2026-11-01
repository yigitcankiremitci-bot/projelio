// 3D ofisteki oda düzenleri (web: components/ofis3d, backend: modules/ofis-duzeni).
//
// Kullanıcı bir odaya girip masaları, modül eşyalarını, bitkileri taşıyabilir,
// döndürebilir ya da kaldırabilir; düzen bütün ekipte ortaktır (migration 171).
// Konumlar odanın sol üst köşesine GÖRE saklanır (dx, dz): departman büyüyüp
// oda planda yer değiştirse de düzen odanın içinde aynı kalır. Modül eşyası
// dışındakiler ortak alana da çıkarılabilir; o zaman dx/dz odanın dışına düşer.
//
// Web ve backend aynı doğrulamadan geçer: sunucu istemciden geleni bununla
// temizler, istemci de kaydettiğini bununla okur.

/** Bir nesnenin oda içindeki varsayılandan sapması. */
export interface NesneDuzeni {
  /** Odanın sol üst köşesine göre konum (metre). */
  dx: number;
  dz: number;
  /** Yatay dönüş (radyan). */
  don: number;
  /** Odadan kaldırıldı mı (varsayılan nesne gizlenir; eklenen eşya depoda bekler). */
  gizli?: boolean;
  /**
   * Ortak alana taşınıp şirketin eşyası oldu (gizli ile birlikte): odanın
   * deposunda görünmez; eşya artık ortak alanın düzeninde "ek:" olarak durur.
   */
  devir?: boolean;
  /**
   * Yalnızca düzenleyicide sonradan eklenen eşyalarda ("ek:…"): katalogdaki
   * türü (web: lib/ofisOyunu.ts EsyaTuru). Varsayılan nesnelerin türü plandan gelir.
   */
  tur?: string;
}

export interface OdaDuzeni {
  /** Anahtar: nesne kimliği — "masa-0", "modul:crm_musteri", "dekor:kitaplik", eklenenler "ek:…". */
  nesneler: Record<string, NesneDuzeni>;
}

export const BOS_ODA_DUZENI: OdaDuzeni = { nesneler: {} };

/** Bir odada en çok bu kadar nesnenin düzeni saklanır (kötüye kullanıma tavan). */
export const EN_COK_DUZEN_NESNESI = 200;
const NESNE_KIMLIGI = /^[a-z0-9:_-]{1,80}$/i;
/** Eklenen eşyanın türü: katalog anahtarı biçiminde (ör. "monstera", "kanepe"). */
const ESYA_TURU = /^[a-zA-Z]{1,30}$/;
/** Oda kimliği: departman kimliği (uuid) ya da "toplanti" / "ortak". */
export const ODA_KIMLIGI = /^([0-9a-f-]{36}|toplanti|ortak)$/i;

/**
 * Gelen düzeni doğrular ve temizler: bilinmeyen alanlar atılır, sayılar
 * makul aralığa kırpılır, bozuk girdi boş düzene düşer. Hiçbir zaman hata
 * fırlatmaz — bozuk bir kayıt ofisi açılmaz hâle getirmemeli.
 */
export function odaDuzeniTemizle(ham: unknown): OdaDuzeni {
  const kaynak = ham && typeof ham === "object" ? (ham as { nesneler?: unknown }).nesneler : null;
  if (!kaynak || typeof kaynak !== "object") return { nesneler: {} };
  const nesneler: Record<string, NesneDuzeni> = {};
  let sayi = 0;
  for (const [kimlik, deger] of Object.entries(kaynak as Record<string, unknown>)) {
    if (sayi >= EN_COK_DUZEN_NESNESI) break;
    if (!NESNE_KIMLIGI.test(kimlik) || !deger || typeof deger !== "object") continue;
    const d = deger as Record<string, unknown>;
    const sayiMi = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
    if (!sayiMi(d.dx) || !sayiMi(d.dz)) continue;
    // Eksi de geniş: modül eşyası dışındakiler odadan ortak alana taşınabiliyor
    // ve ortak alan odanın köşesinin batısında/kuzeyinde onlarca metre uzakta olabilir.
    const kirp = (v: number) => Math.round(Math.min(80, Math.max(-80, v)) * 100) / 100;
    const don = sayiMi(d.don) ? Math.round(Math.atan2(Math.sin(d.don), Math.cos(d.don)) * 1000) / 1000 : 0;
    // Eklenen eşya türsüz anlamsız: türü olmayan "ek:" atılır.
    const tur = kimlik.startsWith("ek:") && typeof d.tur === "string" && ESYA_TURU.test(d.tur) ? d.tur : undefined;
    if (kimlik.startsWith("ek:") && !tur) continue;
    nesneler[kimlik] = {
      dx: kirp(d.dx),
      dz: kirp(d.dz),
      don,
      ...(d.gizli === true ? { gizli: true } : {}),
      ...(d.gizli === true && d.devir === true ? { devir: true } : {}),
      ...(tur ? { tur } : {}),
    };
    sayi++;
  }
  return { nesneler };
}

/**
 * Odayı kim düzenleyebilir: şirket sahibi her odayı; departman yöneticisi
 * yalnızca kendi departmanının odasını. Toplantı odası ve ortak alan herkesin
 * olduğu için yalnızca sahibe açık.
 */
export function odaDuzenleyebilir(
  odaId: string,
  kullanici: { sahip: boolean; yonettigiDepartmanlar: string[] }
): boolean {
  if (kullanici.sahip) return true;
  if (odaId === "toplanti" || odaId === "ortak") return false;
  return kullanici.yonettigiDepartmanlar.includes(odaId);
}
