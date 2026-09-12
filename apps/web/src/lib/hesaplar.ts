// dil:anahtar-dosya
//
// Bu dosyadaki metinlerin tamamı arayüzde görünen etiket: kategori adları,
// giriş yöntemleri, yetki gerekçeleri. Modül düzeyinde sabit oldukları için
// burada t() çağrılamıyor; çeviri kullanıldıkları yerde yapılıyor.
// Karşılıkları: apps/web/src/lib/i18n/en/hesaplar.ts

import type {
  ServiceAccount,
  ServiceAccountCategory,
  ServiceAccountLoginMethod,
  ServiceCredentialReason,
  ServiceUnlockMethod,
} from "@projelio/shared";
import { aylikKarsilikHesapla, safeExternalUrl } from "@projelio/shared";

/**
 * Hesaplar modülünün sözlüğü ve küçük hesapları.
 *
 * Panel, hesap modali ve paylaşım ekranı aynı etiketleri kullanıyor; üç
 * dosyaya kopyalanırsa biri güncellenip diğerleri unutuluyor. Bileşen değil
 * veri olduğu için lib altında (sosyal medyada da aynı düzen).
 *
 * Modül kendi tablolarına yazar (bkz. 106_hesaplar_modulu.sql), bu yüzden
 * moduleConfigs altındaki alan tanımı sözleşmesine tabi değil.
 */

export const HESAPLAR_MODULE_KEY = "hesaplar";

export function isHesaplarModule(moduleKey: string): boolean {
  return moduleKey === HESAPLAR_MODULE_KEY;
}

export interface KategoriMeta {
  label: string;
  /** Listede kategori rozetinin rengi. */
  color: string;
}

/**
 * Kategoriler.
 *
 * Renkler paletten (packages/shared/theme.ts'in accent ve nötr tonları
 * çevresinde): kategori bir uyarı değil bir etiket, o yüzden hiçbiri kırmızı
 * değil. Banka ve resmi kurum bilerek daha koyu — listede gözle taranırken
 * "buraya dikkat" demek için.
 */
export const HESAP_KATEGORILERI: Record<ServiceAccountCategory, KategoriMeta> = {
  yazilim: { label: "Yazılım", color: "#C0813F" },
  bulut: { label: "Bulut / depolama", color: "#3E8FA8" },
  sosyal: { label: "Sosyal medya", color: "#A8558F" },
  banka: { label: "Banka / finans", color: "#2E5E8F" },
  resmi: { label: "Resmi kurum", color: "#3E4858" },
  egitim: { label: "Eğitim", color: "#5E8F4F" },
  pazaryeri: { label: "Pazaryeri", color: "#8F6B3E" },
  kargo: { label: "Kargo / lojistik", color: "#6B7A8F" },
  iletisim: { label: "İletişim", color: "#4F8F8F" },
  diger: { label: "Diğer", color: "#66707F" },
};

/**
 * Giriş yöntemleri.
 *
 * ŞİFRESİZ YÖNTEMLER LİSTEDE: "Google ile devam et" ya da geçiş anahtarıyla
 * girilen hesapta şifre yok ve kullanıcıya boş bir şifre alanı göstermek onu
 * olmayan bir şeyi aramaya iterdi. Yöntem yazılıysa ekranda "şifre gerekmez"
 * diyebiliyoruz.
 */
export const HESAP_GIRIS_YONTEMLERI: Record<ServiceAccountLoginMethod, { label: string; hint: string }> = {
  password: { label: "Kullanıcı adı + şifre", hint: "Klasik giriş" },
  passkey: { label: "Geçiş anahtarı", hint: "Cihaz biyometrisiyle giriliyor, şifresi yok" },
  sso_google: { label: "Google ile giriş", hint: "Şifre Google hesabında" },
  sso_microsoft: { label: "Microsoft ile giriş", hint: "Şifre Microsoft hesabında" },
  magic_link: { label: "E-posta bağlantısı", hint: "Her girişte e-postaya bağlantı gelir" },
  certificate: { label: "E-imza / sertifika", hint: "Kart ya da mobil imza gerekiyor" },
  other: { label: "Diğer", hint: "" },
};

/** Şifresiz giriş yöntemleri — formda şifre alanı zorunlu görünmesin. */
export function sifresizYontem(method: ServiceAccountLoginMethod): boolean {
  return method === "passkey" || method === "sso_google" || method === "sso_microsoft" || method === "magic_link";
}

/** Kullanıcının sırrı hangi haktan gördüğü — denetim izinde ve rozette yazılı. */
export const HESAP_YETKI_GEREKCESI: Record<ServiceCredentialReason, string> = {
  admin: "Modül yöneticisi",
  creator: "Bilgiyi giren kişi",
  account_grant: "Bu hesap paylaşıldı",
  scope_grant: "Tüm hesaplar paylaşıldı",
};

export const HESAP_KILIT_YONTEMI: Record<ServiceUnlockMethod, string> = {
  password: "Hesap şifresiyle",
  passkey: "Geçiş anahtarıyla",
};

/**
 * Hesabın tarayıcıda açılacak adresi.
 *
 * Adres kullanıcı girdisi olduğu için safeExternalUrl'den geçer — sunucu da
 * aynı süzgeci uyguluyor (hesaplar.service.ts), ama eski kayıtlar için burada
 * da kontrol ediliyor: `javascript:` yazılmış bir adres düğmeyi tıklanabilir
 * yapardı.
 */
export function hesapAdresi(hesap: ServiceAccount): string | null {
  return safeExternalUrl(hesap.url);
}

/**
 * Aylık karşılığı — farklı ritimdeki abonelikler kıyaslanabilsin.
 *
 * Hesap ORTAK dosyada (packages/shared/hesapAbonelik.ts): aynı rakamı Lio da
 * üretiyor ("aylık yazılım gideri ne kadar") ve iki kopya, biri düzeltilip
 * diğeri unutulduğunda iki farklı cevap demekti.
 */
export function aylikKarsilik(hesap: ServiceAccount): number | null {
  if (!hesap.isPaid) return null;
  return aylikKarsilikHesapla(hesap.amount, hesap.billingInterval);
}
