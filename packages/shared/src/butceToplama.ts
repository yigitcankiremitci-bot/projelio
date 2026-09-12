import type {
  BudgetTransaction,
  ButceDonemNoktasi,
  ButceKategoriSatiri,
  ButceTTablosu,
  ParaBirimiToplami,
} from "./types";

/**
 * Bütçe toplama — saf fonksiyonlar.
 *
 * Hem sunucu (kademe özetlerini üretirken) hem arayüz (elindeki hareketleri
 * yeniden gruplarken) buradan geçiyor. İki tarafta iki ayrı toplama kodu
 * olsaydı ekranda görünen rakamla uçtan gelen rakam bir gün ayrışırdı ve
 * hangisinin doğru olduğu anlaşılmazdı.
 *
 * TEK KURAL, her fonksiyonda geçerli: KUR DÖNÜŞÜMÜ YOKTUR. Her para birimi
 * kendi kovasında toplanır. "1.000 USD + 1.000 TRY = 2.000 ₺" her zaman
 * yanlıştır ve kur kaynağı olmadan doğrusu da üretilemez — bu yüzden burada
 * hiçbir yerde tek bir "genel toplam" döndürülmez.
 */

export const VARSAYILAN_PARA_BIRIMI = "TRY";

/**
 * "Harcanan" sayılan türler.
 *
 * payout (hakediş/ödeme) gider gibi davranır: kasadan çıkan paradır. Ayrı bir
 * tür olması muhasebe ayrımı için — ekip ödemesiyle malzeme gideri aynı satırda
 * görünmesin diye — ama bakiye hesabında ikisi de eksiye yazılır.
 */
function giderMi(t: BudgetTransaction): boolean {
  return t.type === "expense" || t.type === "payout";
}

function paraBirimi(t: { currency?: string }): string {
  return t.currency || VARSAYILAN_PARA_BIRIMI;
}

/** Tutarı sayıya çevirir; okunamayan değer toplamı bozmasın diye 0'a düşer. */
function tutar(t: { amount: number }): number {
  return Number.isFinite(t.amount) ? Number(t.amount) : 0;
}

/**
 * Hareketleri para birimi başına gelir/gider/net üçlüsüne indirir.
 *
 * Sıralama para birimi koduna göre sabittir: aksi hâlde aynı veri iki farklı
 * istekte farklı sırada dönebilir ve ekrandaki kutular yer değiştirirdi.
 */
export function paraBirimiBazinda(hareketler: BudgetTransaction[]): ParaBirimiToplami[] {
  const kovalar = new Map<string, ParaBirimiToplami>();
  for (const h of hareketler) {
    const currency = paraBirimi(h);
    let kova = kovalar.get(currency);
    if (!kova) {
      kova = { currency, income: 0, expense: 0, net: 0 };
      kovalar.set(currency, kova);
    }
    if (giderMi(h)) kova.expense += tutar(h);
    else kova.income += tutar(h);
  }
  for (const kova of kovalar.values()) kova.net = kova.income - kova.expense;
  return Array.from(kovalar.values()).sort((a, b) => a.currency.localeCompare(b.currency));
}

/**
 * İki (ya da daha çok) toplam listesini birleştirir — kademe toplamasının
 * çekirdeği: "şirketin kendi giderleri" + "departmanlarından gelen giderler".
 *
 * Girdiler DEĞİŞTİRİLMEZ: aynı özet nesnesi hem `kendi` hem `toplam` içinde
 * geçtiği için, yerinde toplama yapmak alt kademenin rakamını da şişirirdi.
 */
export function toplamlariTopla(...listeler: ParaBirimiToplami[][]): ParaBirimiToplami[] {
  const kovalar = new Map<string, ParaBirimiToplami>();
  for (const liste of listeler) {
    for (const t of liste) {
      let kova = kovalar.get(t.currency);
      if (!kova) {
        kova = { currency: t.currency, income: 0, expense: 0, net: 0 };
        kovalar.set(t.currency, kova);
      }
      kova.income += t.income;
      kova.expense += t.expense;
    }
  }
  for (const kova of kovalar.values()) kova.net = kova.income - kova.expense;
  return Array.from(kovalar.values()).sort((a, b) => a.currency.localeCompare(b.currency));
}

/** Kategorisi girilmemiş kayıtların toplandığı kova. */
export const KATEGORISIZ = "Diğer";

function kategoriKirilimi(hareketler: BudgetTransaction[], currency: string): ButceKategoriSatiri[] {
  const kovalar = new Map<string, number>();
  let toplam = 0;
  for (const h of hareketler) {
    const kategori = (h.category || "").trim() || KATEGORISIZ;
    const deger = tutar(h);
    kovalar.set(kategori, (kovalar.get(kategori) ?? 0) + deger);
    toplam += deger;
  }
  return Array.from(kovalar.entries())
    .map(([category, amount]) => ({
      category,
      currency,
      amount,
      // Toplam 0 ise yüzde tanımsız; 0 yazmak "hiç yok" demek ve doğru okunur.
      yuzde: toplam === 0 ? 0 : (amount / toplam) * 100,
    }))
    // Büyük kalem üstte: T tablosuna bakan kişinin ilk sorusu "en çok nereye gitti".
    .sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category));
}

/**
 * T tablosu: solda gelir, sağda gider, altta bakiye.
 *
 * Para birimi BAŞINA ayrı bir T üretilir. Tek T'de iki para birimi göstermek
 * "gelir toplamı" satırını anlamsız kılardı.
 */
export function tTablolari(hareketler: BudgetTransaction[]): ButceTTablosu[] {
  const birimler = Array.from(new Set(hareketler.map(paraBirimi))).sort((a, b) => a.localeCompare(b));
  return birimler.map((currency) => {
    const kendi = hareketler.filter((h) => paraBirimi(h) === currency);
    const gelirHareketleri = kendi.filter((h) => !giderMi(h));
    const giderHareketleri = kendi.filter(giderMi);
    const gelirToplam = gelirHareketleri.reduce((s, h) => s + tutar(h), 0);
    const giderToplam = giderHareketleri.reduce((s, h) => s + tutar(h), 0);
    return {
      currency,
      gelir: kategoriKirilimi(gelirHareketleri, currency),
      gider: kategoriKirilimi(giderHareketleri, currency),
      gelirToplam,
      giderToplam,
      bakiye: gelirToplam - giderToplam,
    };
  });
}

/** "2026-09-12" → "2026-09". Tarihsiz/bozuk değerler boş döner. */
function ayAnahtari(tarih: string | undefined): string {
  if (!tarih || tarih.length < 7) return "";
  return tarih.slice(0, 7);
}

/** Bir ay öncesine gider: "2026-01" → "2025-12". */
function oncekiAy(donem: string): string {
  const [y, m] = donem.split("-").map(Number);
  return m <= 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/**
 * Son N ayın dönem noktaları — grafiklerin tek kaynağı.
 *
 * BOŞ AYLAR DA ÜRETİLİR. Yalnızca hareketi olan aylar döndürülseydi çizgi
 * grafikte Mart ile Haziran yan yana gelir ve aradaki iki aylık durgunluk
 * "hızlı düşüş" gibi okunurdu.
 *
 * `birikimli`, dönem SONU bakiyesidir ve yalnızca döndürülen pencere içindeki
 * hareketleri kapsar — pencerenin öncesinde kalan bakiye dahil değildir.
 * Grafiğin sorusu "bu yıl nasıl gidiyoruz", "şirket kurulduğundan beri ne
 * birikti" değil.
 */
export function donemNoktalari(
  hareketler: BudgetTransaction[],
  aySayisi = 12,
  bugun = new Date()
): ButceDonemNoktasi[] {
  const birimler = Array.from(new Set(hareketler.map(paraBirimi))).sort((a, b) => a.localeCompare(b));
  if (birimler.length === 0) return [];

  // Pencere: bu aydan geriye aySayisi kadar ay.
  const sonAy = `${bugun.getFullYear()}-${String(bugun.getMonth() + 1).padStart(2, "0")}`;
  const aylar: string[] = [sonAy];
  for (let i = 1; i < aySayisi; i++) aylar.unshift(oncekiAy(aylar[0]));
  const noktalar: ButceDonemNoktasi[] = [];
  for (const currency of birimler) {
    const kendi = hareketler.filter((h) => paraBirimi(h) === currency);
    let birikimli = 0;
    for (const donem of aylar) {
      const ayinkiler = kendi.filter((h) => ayAnahtari(h.occurredAt) === donem);
      const income = ayinkiler.filter((h) => !giderMi(h)).reduce((s, h) => s + tutar(h), 0);
      const expense = ayinkiler.filter(giderMi).reduce((s, h) => s + tutar(h), 0);
      const net = income - expense;
      birikimli += net;
      noktalar.push({ donem, currency, income, expense, net, birikimli });
    }
  }
  // Pencere dışında kalan hareketler bilerek düşer (yukarıdaki açıklama).
  return noktalar;
}

/**
 * Bir hareket listesindeki para birimlerinden EKRANDA ÖNCE gösterileceği seçer.
 *
 * Ölçüt hareket sayısı, tutar değil: 1 adet 50.000 USD'lik kayıt yüzünden
 * 300 kayıtlık ₺ defterinin arkaya düşmesi kullanıcıyı şaşırtır. Eşitlikte
 * alfabetik — sonucun her istekte aynı olması için.
 */
export function baskinParaBirimi(hareketler: BudgetTransaction[]): string {
  const sayac = new Map<string, number>();
  for (const h of hareketler) {
    const currency = paraBirimi(h);
    sayac.set(currency, (sayac.get(currency) ?? 0) + 1);
  }
  if (sayac.size === 0) return VARSAYILAN_PARA_BIRIMI;
  return Array.from(sayac.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}
