/**
 * Paket kataloğu — abonelik planlarının TEK KAYNAĞI.
 *
 * Vitrin fiyatı burada USD olarak duruyor; TAHSİLAT TUTARI BURADA DEĞİL.
 * Nedeni: iyzico Abonelik API'sinde tutar, iyzico'daki "ödeme planı"na sabitlenir
 * ve o plan panelde oluşturulunca bir referans kodu üretilir. Yani gerçek tutarı
 * biz değil sağlayıcı taşır; biz yalnızca hangi planın hangi koda karşılık geldiğini
 * bilmek zorundayız (bkz. billing_plan_refs tablosu ve BillingSettingsService).
 *
 * Kur çevirisi kasten CANLI DEĞİL. Canlı kurla çalışmak, kullanıcıya gösterilen
 * tutarla iyzico'nun çektiği tutarın her an ayrışması demekti — abonelikte fiyat
 * bir kez sabitlenir, her yenilemede oynamaz. Kur değişip fiyat güncellenecekse
 * iyzico'da yeni bir ödeme planı açılır ve yeni kod tabloya yazılır; eski aboneler
 * eski tutarla devam eder (zaten olması gereken davranış).
 *
 * AYLIK KREDİ, ÖDEME DÖNEMİNDEN BAĞIMSIZDIR: yıllık ödeyen de krediyi her ay alır.
 * Yıllık ödeyene 12 aylık krediyi peşin vermek, iptal/iade durumunda geri
 * alınamayacak bir bakiye bırakırdı.
 */

export type PlanKey = "free" | "starter" | "pro" | "business";
export type BillingPeriod = "monthly" | "yearly";

export interface Plan {
  key: PlanKey;
  /** Kullanıcıya görünen ad. */
  name: string;
  /** Vitrin fiyatı — USD, aylık ödemede. free için 0. */
  priceUsdMonthly: number;
  /** Vitrin fiyatı — USD, yıllık ödemede (12 ay yerine 10 ay). */
  priceUsdYearly: number;
  /** Her ay bakiyeye yüklenen Lio kredisi. */
  monthlyCredits: number;
  /** Vitrinde "Popüler" rozeti. */
  featured: boolean;
  /** Aynı anda kaç kişi bu abonelikten yararlanabilir (şirket planlarında koltuk). */
  seats: number;
  features: string[];
}

/**
 * Yıllık ödemede 12 ay yerine 10 ay: ekran görüntüsündeki $49,90 / $99,90 /
 * $249,90 tam olarak bu. Sayıyı elle yazmak yerine çarpanı yazıyoruz ki fiyat
 * değişince ikisi ayrışmasın (bir test bunu doğruluyor).
 */
export const YEARLY_MONTHS = 10;

function yillik(aylik: number): number {
  // 4.99 * 10 = 49.900000000000006 — kayan nokta artığını kuruşta kesiyoruz.
  return Math.round(aylik * YEARLY_MONTHS * 100) / 100;
}

export const PLANS: Plan[] = [
  {
    key: "free",
    name: "Ücretsiz",
    priceUsdMonthly: 0,
    priceUsdYearly: 0,
    monthlyCredits: 0,
    featured: false,
    seats: 1,
    features: [
      "Sınırsız görev ve takvim",
      "Hoş geldin kredisi ile Lio denemesi",
      "Mobil uygulama",
    ],
  },
  {
    key: "starter",
    name: "Starter",
    priceUsdMonthly: 4.99,
    priceUsdYearly: yillik(4.99),
    monthlyCredits: 20_000,
    featured: false,
    seats: 1,
    features: [
      "Aylık 20.000 Lio kredisi",
      "Sınırsız proje ve görev",
      "Google Drive / OneDrive bağlantısı",
      "E-posta desteği",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    priceUsdMonthly: 9.99,
    priceUsdYearly: yillik(9.99),
    monthlyCredits: 50_000,
    featured: true,
    seats: 1,
    features: [
      "Aylık 50.000 Lio kredisi",
      "Starter'daki her şey",
      "WhatsApp üzerinden Lio",
      "Gelir-gider ve proje bütçesi",
      "Öncelikli destek",
    ],
  },
  {
    key: "business",
    name: "Business",
    priceUsdMonthly: 24.99,
    priceUsdYearly: yillik(24.99),
    monthlyCredits: 150_000,
    featured: false,
    seats: 10,
    features: [
      "Aylık 150.000 Lio kredisi",
      "Pro'daki her şey",
      "10 kullanıcıya kadar",
      "Departman bazlı yetkilendirme",
      "Dışa aktarma ve raporlar",
    ],
  },
];

/** Ücretsiz plan satın alınamaz; vitrinde ve "aboneliğin yok" durumunda görünür. */
export const SATIN_ALINABILIR: PlanKey[] = ["starter", "pro", "business"];

export const FREE_PLAN: Plan = PLANS[0];

export function findPlan(key: string): Plan | undefined {
  return PLANS.find((p) => p.key === key);
}

export function isPlanKey(key: string): key is PlanKey {
  return PLANS.some((p) => p.key === key);
}

export function isBillingPeriod(value: string): value is BillingPeriod {
  return value === "monthly" || value === "yearly";
}

/** Vitrin fiyatı (USD) — dönem farkını tek yerden çözer. */
export function planPriceUsd(plan: Plan, period: BillingPeriod): number {
  return period === "yearly" ? plan.priceUsdYearly : plan.priceUsdMonthly;
}

/**
 * Bir dönemin kaç ay sürdüğü. Kredi yüklemesi AY bazında ilerlediği için
 * (yıllık abone de krediyi aylık alır) yenileme tarihini bununla hesaplıyoruz.
 */
export function periodMonths(period: BillingPeriod): number {
  return period === "yearly" ? 12 : 1;
}

/**
 * Verilen ana bir sonraki kredi ayını ekler.
 *
 * Ayın 31'inde başlayan bir abonelik şubatta 31 Şubat'a düşemez; JS'in Date'i
 * bunu 3 Mart'a taşır ve dönem sınırı her ay bir gün kayardı. Ayın son gününe
 * sabitliyoruz — abonelik tarihi yıl boyunca aynı kalsın.
 */
export function ayEkle(tarih: Date, ay: number): Date {
  const sonuc = new Date(tarih.getTime());
  const hedefGun = sonuc.getUTCDate();
  sonuc.setUTCDate(1);
  sonuc.setUTCMonth(sonuc.getUTCMonth() + ay);
  const ayinSonGunu = new Date(Date.UTC(sonuc.getUTCFullYear(), sonuc.getUTCMonth() + 1, 0)).getUTCDate();
  sonuc.setUTCDate(Math.min(hedefGun, ayinSonGunu));
  return sonuc;
}

/**
 * Yıllık aboneliğin İÇİNDE BULUNULAN kredi ayının başlangıcı.
 *
 * Yıllık abone parayı yılda bir öder ama krediyi her ay alır; kredi yüklemesi
 * bu yüzden yenileme ödemesine bağlanamaz. Ayın sınırını abonelik tarihine
 * sabitliyoruz (ayın 7'sinde başlayan abonelik her ayın 7'sinde kredi alır) —
 * takvim ayının 1'ine sabitlemek, ayın 30'unda abone olana iki gün sonra ikinci
 * bir aylık kredi verirdi.
 *
 * Dönem başlamadıysa ya da 12 ayı aştıysa null döner: o durumda yükleme
 * yapılmaz ve yeni dönemi yenileme olayı açar.
 */
export function krediAyiBasi(donemBasi: Date, simdi: Date): Date | null {
  if (Number.isNaN(donemBasi.getTime()) || donemBasi > simdi) return null;

  let aday = donemBasi;
  for (let ay = 0; ay < 12; ay += 1) {
    const sonraki = ayEkle(donemBasi, ay + 1);
    if (sonraki > simdi) return aday;
    aday = sonraki;
  }
  return null;
}
