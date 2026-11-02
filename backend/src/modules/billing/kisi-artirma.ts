import { ayEkle, krediAyiBasi } from "./billing.plans";

/**
 * Business aboneliğinde dönem ortasında kişi artırma (saf fonksiyonlar).
 *
 * KARARLAR (kullanıcı, 2026-11-02):
 *   · Artırma HEMEN geçerli; dönemin kalan kısmı için yalnızca FARK çekilir
 *     (yeni ve eski liste tutarının farkı × kalan gün oranı). Dönemin tamamını
 *     yeniden çekmek, ödenmiş günleri iki kez ödetmek olurdu.
 *   · Ek kişilerin Lio Bakiyesi de hemen gelir, içinde bulunulan kredi ayının
 *     kalan kısmı kadar: ayın son günü kişi ekleyen ay başında ekleyenle aynı
 *     birimi almasın.
 *   · Sonraki yenilemeden itibaren yeni kişi sayısının tam tutarı çekilir.
 *     Müşteri bu tutarı formda görüp onayladığı için ayrıca 7 gün önce haber
 *     verilmesi gerekmez (bkz. paytr-abonelik-takvim.ts).
 *   · Kişi sayısı AZALTILMAZ; azaltma iade ve "kim çıkarılacak" sorusu doğurur.
 */

/** Dönemin henüz kullanılmamış kısmının oranı (0..1). */
export function kalanOran(bas: Date, bit: Date, simdi: Date): number {
  const toplam = bit.getTime() - bas.getTime();
  if (!(toplam > 0)) return 0;
  return Math.min(1, Math.max(0, (bit.getTime() - simdi.getTime()) / toplam));
}

/**
 * Kişi artırmada bugün çekilecek tutar (TL). Tam liraya YUKARI yuvarlanır:
 * kuruşlu tutar makbuzda amatör durur, aşağı yuvarlamak da her artırmada
 * küçük bir eksik bırakırdı. En az 1 ₺ — PayTR sıfır tutarlı ödeme almıyor.
 */
export function kisiArtirmaTutari(p: {
  eskiListe: number;
  yeniListe: number;
  donemBasi: Date;
  donemSonu: Date;
  simdi: Date;
}): number {
  const fark = Math.max(0, p.yeniListe - p.eskiListe) * kalanOran(p.donemBasi, p.donemSonu, p.simdi);
  return Math.max(1, Math.ceil(fark - 1e-9));
}

/**
 * Ek kişilerle bu kredi ayında yüklenecek ek birim. Yıllık abonelikte de
 * bakiye aylık yüklendiği için oran DÖNEMİN değil, içinde bulunulan kredi
 * ayının kalanıdır. Ek birimin bittiği an da o ayın sonudur.
 */
export function kisiArtirmaBirimi(p: {
  eskiBirim: number;
  yeniBirim: number;
  donemBasi: Date;
  simdi: Date;
}): { birim: number; aySonu: Date | null } {
  const ayBasi = krediAyiBasi(p.donemBasi, p.simdi);
  if (!ayBasi) return { birim: 0, aySonu: null };
  const aySonu = ayEkle(p.donemBasi, ayFarki(p.donemBasi, ayBasi) + 1);
  const birim = Math.ceil(Math.max(0, p.yeniBirim - p.eskiBirim) * kalanOran(ayBasi, aySonu, p.simdi));
  return { birim, aySonu };
}

/** ayBasi, donemBasi'ndan kaç ay sonra (krediAyiBasi ayEkle ile ürettiği için tam sayı). */
function ayFarki(donemBasi: Date, ayBasi: Date): number {
  return (ayBasi.getUTCFullYear() - donemBasi.getUTCFullYear()) * 12 + ayBasi.getUTCMonth() - donemBasi.getUTCMonth();
}
