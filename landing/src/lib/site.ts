import type { Locale } from "@/i18n";

/**
 * Sitenin tek doğruluk kaynağı.
 * Yayına almadan önce burada domaini ve iletişim bilgilerini güncelleyin;
 * .env.local içine NEXT_PUBLIC_SITE_URL yazarsanız o değer kullanılır.
 */
export const site = {
  name: "Projelio",
  /** GoDaddy'den alınan alan adı. */
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://projelio.app",
  /** Uygulamanın (panelin) adresi. */
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "https://projelio.netlify.app",
  email: "info@projelio.app",
  /**
   * Üye olmadan gezmek isteyenler için herkese açık demo hesabı.
   * Gizli değil — sitede ve panelin giriş ekranında bilerek yayımlanıyor.
   * Şifre değişirse panel tarafındaki karşılığı da güncellenmeli:
   * projelio/apps/web/src/lib/demoHesap.ts
   */
  demo: {
    email: "ceo@celikhan.test",
    password: "Celikhan2026!",
  },
  /** Uluslararası formatta, sadece rakam. Örn: 905551112233 */
  whatsapp: process.env.NEXT_PUBLIC_WHATSAPP ?? "",
  social: {
    linkedin: "https://www.linkedin.com/company/projelio",
    instagram: "https://www.instagram.com/projelio",
    x: "https://x.com/projelio",
  },
  company: {
    legalName: "Projelio Yazılım A.Ş.",
    address: "İstanbul, Türkiye",
    taxOffice: "—",
    taxNumber: "—",
    mersis: "—",
  },
} as const;

/**
 * Panele giden bağlantılar.
 * Panelde kayıt/kredi sayfalarının kendi adresleri oluştuğunda buradaki
 * ortam değişkenlerini doldurun; boşsa hepsi panelin ana sayfasına gider
 * (kırık link riski olmaz).
 */
export const appLinks = {
  login: process.env.NEXT_PUBLIC_LOGIN_URL || site.appUrl,
  signup: process.env.NEXT_PUBLIC_SIGNUP_URL || site.appUrl,
  credits: process.env.NEXT_PUBLIC_CREDITS_URL || site.appUrl,
  /**
   * Demo bağlantısı panelin giriş ekranına `?demo=1` ile gider; orada e-posta
   * ve şifre alanları hazır dolu gelir (bkz. apps/web/src/pages/Login.tsx).
   * NEXT_PUBLIC_LOGIN_URL'e değil appUrl'e ekleniyor: login değişkenine yol
   * içeren bir adres yazılırsa sorgu parametresi yanlış yere iliştirilirdi.
   */
  demo: process.env.NEXT_PUBLIC_DEMO_URL || `${site.appUrl}/login?demo=1`,
};

/**
 * "Bu paketi seç" bağlantısı — panelin paket ekranına, seçim önceden işaretli
 * olarak gider. Giriş yapılmamışsa panel kişiyi giriş ekranına yollar ve
 * girişten sonra BU adrese geri getirir (bkz. apps/web/src/App.tsx hedef).
 *
 * Ödeme formu kendiliğinden açılmaz: kullanıcı ne satın aldığını panelde bir
 * kez daha görüp onaylar.
 */
export function checkoutHref(planKey: string, period: "monthly" | "yearly"): string {
  return `${site.appUrl}/settings/billing?plan=${encodeURIComponent(planKey)}&period=${period}`;
}

/** Panelin herkese açık fiyat ucu (bkz. backend billing-public.controller.ts). */
export const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "https://api.projelio.app";

export const legalSlugs = ["privacy", "terms", "kvkk", "distance", "refund"] as const;
export type LegalSlug = (typeof legalSlugs)[number];

export function path(locale: Locale | string, sub = ""): string {
  const clean = sub.replace(/^\/+/, "");
  return clean ? `/${locale}/${clean}` : `/${locale}`;
}

export function waLink(text = ""): string {
  if (!site.whatsapp) return "#";
  const q = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${site.whatsapp}${q}`;
}

export function formatTRY(value: number, locale: Locale | string = "tr"): string {
  return new Intl.NumberFormat(locale === "en" ? "en-US" : "tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Vitrin fiyatı ABD doları olarak gösterilir (tahsilat TL).
 * Kuruş her zaman yazılır: "$4.99" yerine "$5" göstermek fiyatı yanlış aktarır.
 */
export function formatUSD(value: number, locale: Locale | string = "tr"): string {
  return new Intl.NumberFormat(locale === "en" ? "en-US" : "tr-TR", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(value: number, locale: Locale | string = "tr"): string {
  return new Intl.NumberFormat(locale === "en" ? "en-US" : "tr-TR").format(value);
}
