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
  /** Yıllık ödemede AYLIK KARŞILIK — vitrinde büyük rakam bu (ör. 7,99 $/ay). */
  priceUsdYearlyMonthly: number;
  /** Vitrin fiyatı — USD, yıllık ödemede toplam = aylık karşılık × 12. */
  priceUsdYearly: number;
  /** Her ay bakiyeye yüklenen Lio kredisi. */
  monthlyCredits: number;
  /** Vitrinde "Popüler" rozeti. */
  featured: boolean;
  /** Aynı anda kaç kişi bu abonelikten yararlanabilir (şirket planlarında koltuk). */
  seats: number;
  /** Koltukla fiyatlanan paketlerde ek kişi kuralı; yoksa paket sabit kişilik. */
  ekKoltuk?: EkKoltuk;
  features: string[];
}

/**
 * Ek koltuk (kullanıcı kararı, 2026-11-02).
 *
 * Business eskiden 24,99 $'a 10 kişiydi: 2 kişilik şirket de 10 kişilik şirket
 * de aynı parayı ödüyordu, kişi başı 2,50 $ rakiplerin dörtte biriydi. Artık
 * taban fiyata `seats` kadar kişi dahil, her ek kişi ayrıca fiyatlanır.
 *
 * KOLTUK SATIN ALIRKEN SEÇİLİR, gerçek üye sayısından türetilmez: PayTR
 * yenilemesinde duyurulmamış tutar çekilmiyor (paytr-abonelik-takvim.ts) ve
 * tutar her ay üye sayısıyla oynasaydı her yenileme bir duyuru gerektirirdi.
 * Koltuk dolunca yeni üye eklenmez (bkz. KoltukService).
 *
 * KOLTUK SÜTUNU BOŞ = 2026-11 ÖNCESİ BUSINESS. O aboneler eski tutarla ve
 * söz verilen bakiyeyle devam eder, koltuk sınırı onlara uygulanmaz.
 */
export interface EkKoltuk {
  /** Ek kişi başına aylık fiyat (USD). */
  usdMonthly: number;
  /** Ek kişi başına aylık Lio Bakiyesi. */
  credits: number;
  /** Bir abonelikte en çok kaç kişi olabilir. */
  enCok: number;
  /** Koltuk sütunu boş (eski) Business aboneliğine yüklenen aylık bakiye. */
  koltuksuzCredits: number;
}

/**
 * YILLIK ÖDEMEDE 12 AY YERİNE 10 AY — "2 ay bedava" (kullanıcı kararı 2026-09-20).
 *
 * Arada bir süre yıllık fiyat x,99'luk aylık karşılıktan türetiliyordu (%20
 * indirim); indirim seviyesi 10 aya geri alındı. Vitrindeki büyük rakam artık
 * TL olduğu için USD'deki 99,90 / 12 = 8,33 küsuratı ekranda görünmüyor:
 * Türkçe vitrin TL aylık karşılığı gösteriyor ve o 10 ₺'ye yuvarlanıyor
 * (bkz. abonelik-tutari.ts).
 */
export const YEARLY_MONTHS = 10;

function yillik(aylik: number): number {
  // 4.99 * 10 = 49.900000000000006 — kayan nokta artığını kuruşta kesiyoruz.
  return Math.round(aylik * YEARLY_MONTHS * 100) / 100;
}

/** Yıllık toplamın aylık karşılığı (USD). İngilizce vitrinde gösterilir. */
function aylikKarsilik(aylik: number): number {
  return Math.round((yillik(aylik) / 12) * 100) / 100;
}

// Modül sayıları vitrinde yazılı ama kaynağı shared modulHakki.ts (MODUL_HAKKI);
// bir test ikisinin ayrışmasını yakalıyor (billing.plans.test.ts).
export const PLANS: Plan[] = [
  {
    key: "free",
    name: "Ücretsiz", // dil:anahtar
    priceUsdMonthly: 0,
    priceUsdYearlyMonthly: 0,
    priceUsdYearly: 0,
    monthlyCredits: 0,
    featured: false,
    seats: 1,
    features: [
      "Sınırsız görev ve takvim", // dil:anahtar
      "Şirkette 2 modül", // dil:anahtar
      "Şirkette 3 kişiye kadar", // dil:anahtar
      "Hoş geldin bakiyesi ile Lio denemesi", // dil:anahtar
      "Mobil uygulama", // dil:anahtar
    ],
  },
  {
    key: "starter",
    name: "Starter",
    priceUsdMonthly: 4.99,
    priceUsdYearlyMonthly: aylikKarsilik(4.99),
    priceUsdYearly: yillik(4.99),
    monthlyCredits: 20_000,
    featured: false,
    seats: 1,
    features: [
      "Aylık 20.000 birim Lio Bakiyesi", // dil:anahtar
      "Sınırsız proje ve görev", // dil:anahtar
      "Şirkette 4 modül", // dil:anahtar
      "Şirkette 3 kişiye kadar", // dil:anahtar
      "Google Drive / OneDrive bağlantısı", // dil:anahtar
      "E-posta desteği", // dil:anahtar
    ],
  },
  {
    key: "pro",
    name: "Pro",
    priceUsdMonthly: 9.99,
    priceUsdYearlyMonthly: aylikKarsilik(9.99),
    priceUsdYearly: yillik(9.99),
    monthlyCredits: 50_000,
    featured: true,
    seats: 1,
    features: [
      "Aylık 50.000 birim Lio Bakiyesi", // dil:anahtar
      "Starter'daki her şey", // dil:anahtar
      "Şirkette 8 modül", // dil:anahtar
      "Şirkette 3 kişiye kadar", // dil:anahtar
      "WhatsApp üzerinden Lio", // dil:anahtar
      "Gelir-gider ve proje bütçesi", // dil:anahtar
      "Öncelikli destek", // dil:anahtar
    ],
  },
  {
    key: "business",
    name: "Business",
    priceUsdMonthly: 19.99,
    priceUsdYearlyMonthly: aylikKarsilik(19.99),
    priceUsdYearly: yillik(19.99),
    monthlyCredits: 100_000,
    featured: false,
    seats: 3,
    ekKoltuk: { usdMonthly: 4.99, credits: 10_000, enCok: 50, koltuksuzCredits: 150_000 },
    features: [
      "Aylık 100.000 birim Lio Bakiyesi, her ek kişiyle +10.000", // dil:anahtar
      "Pro'daki her şey", // dil:anahtar
      "Sınırsız modül", // dil:anahtar
      "3 kişi dahil, ek kişi başına 4,99 $", // dil:anahtar
      "Departman bazlı yetkilendirme", // dil:anahtar
      "Dışa aktarma ve raporlar", // dil:anahtar
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

/** Vitrin fiyatı (USD) — dönem farkını tek yerden çözer. Koltuklu pakette ek kişiler dahil. */
export function planPriceUsd(plan: Plan, period: BillingPeriod, koltuk?: number | null): number {
  const taban = period === "yearly" ? plan.priceUsdYearly : plan.priceUsdMonthly;
  const ek = ekKoltukSayisi(plan, koltuk);
  if (!plan.ekKoltuk || ek === 0) return taban;
  const kisiBasi = period === "yearly" ? yillik(plan.ekKoltuk.usdMonthly) : plan.ekKoltuk.usdMonthly;
  return Math.round((taban + ek * kisiBasi) * 100) / 100;
}

/** Ek kişinin yıllık ödemedeki aylık karşılığı (USD); taban fiyatla aynı 10/12 kuralı. */
export function ekKoltukYillikAylikUsd(ek: EkKoltuk): number {
  return aylikKarsilik(ek.usdMonthly);
}

/** Tabana dahil olanların üstündeki kişi sayısı. Koltuksuz pakette ya da koltuk boşsa 0. */
export function ekKoltukSayisi(plan: Plan, koltuk?: number | null): number {
  if (!plan.ekKoltuk || koltuk === null || koltuk === undefined) return 0;
  return Math.max(0, koltuk - plan.seats);
}

/**
 * Satın alma isteğindeki koltuk sayısı. Koltuksuz pakette null (sütun boş kalır);
 * koltuklu pakette belirtilmemişse taban kişi sayısı. Geçersizse hata metni.
 */
export function koltukCoz(
  plan: Plan,
  istenen: unknown
): { koltuk: number | null } | { hata: string; params: { enAz: number; enCok: number } } {
  if (!plan.ekKoltuk) return { koltuk: null };
  if (istenen === undefined || istenen === null || istenen === "") return { koltuk: plan.seats };
  const sayi = Number(istenen);
  if (!Number.isInteger(sayi) || sayi < plan.seats || sayi > plan.ekKoltuk.enCok) {
    return { hata: "Kişi sayısı {enAz} ile {enCok} arasında olmalı.", params: { enAz: plan.seats, enCok: plan.ekKoltuk.enCok } };
  }
  return { koltuk: sayi };
}

/** Aboneliğe her ay yüklenecek Lio Bakiyesi. */
export function planBirimi(plan: Plan, koltuk?: number | null): number {
  if (!plan.ekKoltuk) return plan.monthlyCredits;
  if (koltuk === null || koltuk === undefined) return plan.ekKoltuk.koltuksuzCredits;
  return plan.monthlyCredits + ekKoltukSayisi(plan, koltuk) * plan.ekKoltuk.credits;
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

/**
 * Yıllık aboneliğin bu ayki bakiye yüklemesinin dönem başı; yükleme gerekmiyorsa null.
 *
 * İPTAL EDİLMİŞ YILLIK ABONE DE ALIR, dönem sonuna kadar: parayı bir yıl için
 * peşin ödedi ve erişimi dönem sonuna kadar sürüyor (iptal = "yenileme",
 * "şimdi kes" değil). Eskiden yalnızca active/trialing yükleniyordu; iptal
 * edenin ödenmiş aylarının bakiyesi kesiliyordu.
 *
 * AMA iptal ettikten sonra yeni bir paket aldıysa eski abonelik YÜKLEMEZ: her
 * yükleme kullanıcının paket payını sıfırlayıp kendi miktarını yazıyor
 * (ai_grant_plan_credits); iki abonelik birbirinin payını ezerdi.
 *
 * past_due yıllık abone yüklemez: yıllık çekim düşmüş demektir, yeni yılın
 * bakiyesi ödeme gelince yenileme yolundan yüklenir.
 */
export function yillikAylikYukleme(
  a: { status: string; currentPeriodStart?: string; currentPeriodEnd?: string; yenisiYururlukte: boolean },
  simdi: Date
): Date | null {
  if (!a.currentPeriodStart) return null;
  const baslangic = new Date(a.currentPeriodStart);
  if (a.status === "active" || a.status === "trialing") return krediAyiBasi(baslangic, simdi);
  if (a.status !== "canceled" || a.yenisiYururlukte || !a.currentPeriodEnd) return null;
  const bitis = new Date(a.currentPeriodEnd);
  if (bitis <= simdi) return null;
  const ay = krediAyiBasi(baslangic, simdi);
  return ay && ay < bitis ? ay : null;
}
