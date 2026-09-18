/**
 * TCMB günlük kur bülteninden USD satırını ayıklar.
 *
 * NEDEN TCMB, NEDEN ZİRAAT DEĞİL: fiyat kararı Ziraat'in satış kuruna göre
 * veriliyor ama Ziraat kuru makineyle okunabilir bir yerden yayımlamıyor —
 * kur sayfası kaldırılmış, ana sayfadaki değerler JavaScript'le geliyor ve
 * onları besleyen uç sunucudan çağrıldığında boş dönüyor. Geriye sunucuda
 * tarayıcı çalıştırmak kalıyordu; bir abonelik fiyatı için hem ağır hem
 * kırılgan. TCMB'nin bülteni ise makine için tasarlanmış ve kararlı.
 *
 * BU KUR TAHSİLATTA KULLANILMAZ. Yalnızca yöneticiye "TL fiyatları ne zaman
 * güncellemeliyim" sorusunda yol göstersin diye gösteriliyor; tahsilat tutarı
 * `billing_plan_refs` içinde sabit durur (bkz. billing.plans.ts başlığı).
 *
 * XML düz metin olarak ayrıştırılıyor: tek bir alan için bağımlılık eklemeye
 * değmez ve bülten biçimi yıllardır aynı.
 */

export interface TcmbUsdKuru {
  /** Bültenin tarihi, XML'de yazdığı gibi: "17.09.2026". */
  tarih: string;
  /** Döviz satış — hesap üzerinden işlemlerde kullanılan kur. */
  forexSelling: number;
  /** Efektif satış — nakit/banknot satış kuru; bankaların kart kuruna daha yakın. */
  banknoteSelling: number;
}

function sayi(ham: string | undefined): number | null {
  if (!ham) return null;
  // Bülten ondalık ayracı olarak nokta kullanıyor; yine de boşluk kırpılıyor.
  const deger = Number(ham.trim());
  return Number.isFinite(deger) && deger > 0 ? deger : null;
}

/**
 * Bülten XML'inden USD kurunu çıkarır; bulunamazsa null döner.
 *
 * null dönmesi hata değildir: hafta sonu ve resmî tatillerde bülten yayımlanmaz,
 * ayrıca günlük bülten saat 15:30'dan önce bir önceki iş gününü gösterir.
 */
export function usdKuruAyikla(xml: string): TcmbUsdKuru | null {
  if (!xml) return null;

  const tarih = /<Tarih_Date[^>]*\sTarih="([^"]+)"/.exec(xml)?.[1]?.trim() ?? "";

  // Yalnızca USD bloğunun içine bakılıyor: <Currency ... Kod="USD"> ... </Currency>.
  // Tüm belgede arama yapmak, listedeki bir sonraki para biriminin değerini
  // yakalama riski taşırdı.
  const blok = /<Currency\b[^>]*\bKod="USD"[^>]*>([\s\S]*?)<\/Currency>/.exec(xml)?.[1];
  if (!blok) return null;

  const forexSelling = sayi(/<ForexSelling>([^<]*)<\/ForexSelling>/.exec(blok)?.[1]);
  const banknoteSelling = sayi(/<BanknoteSelling>([^<]*)<\/BanknoteSelling>/.exec(blok)?.[1]);
  if (forexSelling === null || banknoteSelling === null) return null;

  return { tarih, forexSelling, banknoteSelling };
}

/**
 * Yürürlükteki TL fiyatın ima ettiği kur ile güncel kur arasındaki fark (oran).
 *
 * Fiyatı ne zaman güncellemek gerektiğini gösterir: 0.08 dönmesi, TL fiyatın
 * güncel kura göre %8 geride kaldığı anlamına gelir. Fiyat kurun ÜSTÜNDEyse
 * (yukarı yuvarlandığı için normaldir) negatif döner.
 */
export function kurSapmasi(fiyatinKuru: number, guncelKur: number): number | null {
  if (!Number.isFinite(fiyatinKuru) || fiyatinKuru <= 0) return null;
  if (!Number.isFinite(guncelKur) || guncelKur <= 0) return null;
  return (guncelKur - fiyatinKuru) / fiyatinKuru;
}
