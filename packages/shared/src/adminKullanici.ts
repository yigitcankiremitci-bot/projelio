import type { AccountType, UserRole } from "./types";

/**
 * Admin paneli kullanıcı yönetimi — ortak tipler ve saf kararlar.
 *
 * NEDEN ORTAK DOSYADA: "bu hesap hangi durumda" sorusunu hem sunucu (hangi
 * işleme izin verilir) hem arayüz (hangi rozet, hangi düğme) soruyor. İki kopya
 * ayrıştığında ekran "Aktif" derken sunucu "silinmiş" diye reddederdi.
 */

/**
 * Hesabın tek bir durumu. Birden fazlası aynı anda doğru olabilir (askıdaki bir
 * hesabın silme talebi de olabilir); öncelik sırası en ağır olandan hafifine:
 * silindi > silinecek > askıda > doğrulanmamış > aktif.
 */
export type AdminKullaniciDurumu = "aktif" | "dogrulanmamis" | "askida" | "silinecek" | "silindi";

export const ADMIN_KULLANICI_DURUMLARI: AdminKullaniciDurumu[] = [
  "aktif",
  "dogrulanmamis",
  "askida",
  "silinecek",
  "silindi",
];

export const ADMIN_KULLANICI_DURUM_ETIKETI: Record<AdminKullaniciDurumu, string> = {
  aktif: "Aktif", // dil:anahtar
  dogrulanmamis: "Doğrulanmamış", // dil:anahtar
  askida: "Askıda", // dil:anahtar
  silinecek: "Silinecek", // dil:anahtar
  silindi: "Silindi", // dil:anahtar
};

export function adminKullaniciDurumu(u: {
  anonimlestirildi: boolean;
  deletedAt?: string | null;
  bannedAt?: string | null;
  emailVerifiedAt?: string | null;
}): AdminKullaniciDurumu {
  if (u.anonimlestirildi) return "silindi";
  if (u.deletedAt) return "silinecek";
  if (u.bannedAt) return "askida";
  if (!u.emailVerifiedAt) return "dogrulanmamis";
  return "aktif";
}

export interface AdminKullaniciSatiri {
  id: string;
  fullName: string;
  email: string;
  username: string;
  avatarUrl?: string;
  role: UserRole;
  accountType: AccountType;
  createdAt: string;
  emailVerifiedAt?: string;
  deletedAt?: string;
  bannedAt?: string;
  banReason?: string;
  /** Kalıcı silme yapılmış; satır yalnızca geçmiş kayıtlar için duruyor. */
  anonimlestirildi: boolean;
  /** Şifresi yok = yalnızca Google/Microsoft ile giriyor. */
  sifreliGiris: boolean;
  durum: AdminKullaniciDurumu;
  kredi: { balance: number; lifetimePurchased: number; lifetimeSpent: number };
  /**
   * Uygulamada geçirilen süre (saniye), sunucunun saydığı hâliyle — bkz.
   * migration 109. Hiç sinyal göndermemiş (özellik yayınlanmadan önce gelmiş
   * ve sonra dönmemiş) kullanıcıda boş.
   */
  etkinlik?: AdminKullaniciEtkinligi;
  /** Kendi (bireysel) aboneliği; şirket üzerinden gelen plan burada yok. */
  abonelik?: { planKey: string; status: string; period: string };
}

export interface AdminKullaniciEtkinligi {
  ilkGorulme: string;
  sonGorulme: string;
  toplamSaniye: number;
  son7GunSaniye: number;
  son30GunSaniye: number;
  son30GundeAktifGun: number;
}

export interface AdminKrediHareketi {
  id: string;
  type: "topup" | "usage" | "refund" | "adjustment" | "welcome";
  credits: number;
  balanceAfter: number;
  description?: string;
  model?: string;
  createdAt: string;
  /** Bu satır başka bir yüklemeyi geri alıyorsa onun kimliği. */
  reversesTransactionId?: string;
  /** Bu yükleme sonradan geri alındıysa true. */
  geriAlindi: boolean;
}

export interface AdminKullaniciIslemi {
  id: string;
  action: string;
  detail?: Record<string, unknown>;
  adminName?: string;
  createdAt: string;
}

export interface AdminKullaniciDetayi {
  kullanici: AdminKullaniciSatiri;
  sayilar: { sahipOlunanIs: number; sahipOlunanOrganizasyon: number; sahipOlunanGrup: number };
  sonAiKullanimi?: string;
  krediHareketleri: AdminKrediHareketi[];
  islemler: AdminKullaniciIslemi[];
  silmeOnizleme: { blocker: string | null; silinecekIsler: string[]; korunacakIsler: string[] } | null;
  /** Son 30 günün günlük süresi (Europe/Istanbul günü, eskiden yeniye; boş günler 0). */
  gunlukEtkinlik: { gun: string; saniye: number }[];
  /** Migration 108 uygulanmadıysa askı/geri alma/işlem kaydı çalışmaz. */
  migrationEksik: boolean;
}

/**
 * Bir kredi hareketi geri alınabilir mi? Sunucudaki
 * `ai_reverse_credit_transaction` ile aynı kural; düğme yalnızca geçerli
 * satırlarda görünsün diye burada da var.
 */
export function krediHareketiGeriAlinabilirMi(h: Pick<AdminKrediHareketi, "type" | "credits" | "reversesTransactionId" | "geriAlindi">): boolean {
  if (h.geriAlindi || h.reversesTransactionId) return false;
  if (h.credits <= 0) return false;
  return h.type === "topup" || h.type === "adjustment" || h.type === "welcome" || h.type === "refund";
}

/**
 * Süreyi kısa ve okunur yazar: "45 sn", "12 dk", "3 sa 20 dk", "41 sa".
 *
 * Günlere çevrilmiyor: "2 gün" 48 saat kullanım gibi okunuyor, oysa kastedilen
 * toplam aktif süre. 24 saati geçen toplamlar saat olarak kalır.
 */
export function etkinlikSuresiYaz(saniye: number | null | undefined): string {
  if (!saniye || saniye <= 0) return "—";
  if (saniye < 60) return `${Math.round(saniye)} sn`;
  const dakika = Math.round(saniye / 60);
  if (dakika < 60) return `${dakika} dk`;
  const saat = Math.floor(dakika / 60);
  const kalan = dakika % 60;
  if (saat >= 10 || kalan === 0) return `${saat} sa`;
  return `${saat} sa ${kalan} dk`;
}

/**
 * Son 30 günü eksiksiz bir diziye açar: sunucu yalnızca kullanım olan günleri
 * döndürüyor, grafik ise boş günleri de göstermeli (yoksa 3 günlük kullanım
 * 30 günlük gibi görünür).
 *
 * @param bugun Europe/Istanbul günü, "YYYY-MM-DD".
 */
export function gunlukEtkinligiDoldur(
  kayitlar: { gun: string; saniye: number }[],
  bugun: string,
  gunSayisi = 30
): { gun: string; saniye: number }[] {
  const harita = new Map(kayitlar.map((k) => [k.gun, k.saniye]));
  const [y, m, d] = bugun.split("-").map(Number);
  const sonuc: { gun: string; saniye: number }[] = [];
  for (let i = gunSayisi - 1; i >= 0; i--) {
    // UTC üzerinden gün aritmetiği: yaz saati geçişi yerel saatle bir günü kaydırabiliyor.
    const t = new Date(Date.UTC(y, m - 1, d - i));
    const gun = t.toISOString().slice(0, 10);
    sonuc.push({ gun, saniye: harita.get(gun) ?? 0 });
  }
  return sonuc;
}

// ================================================================ Yönetici mesajı

/**
 * Yöneticinin kullanıcılara gönderdiği bildirim / e-posta.
 *
 * Kurallar sunucuda da arayüzde de aynı yerden: sınırlar ayrışırsa form "gönder"e
 * izin verip sunucudan ret alırdı.
 */
export const ADMIN_MESAJ_SINIRI = {
  baslik: 120,
  mesaj: 5000,
  link: 300,
  /** Tek seferde en fazla alıcı. E-postalar istek içinde gönderiliyor; daha fazlası zaman aşımına düşer. */
  alici: 200,
} as const;

export interface AdminMesajGirdisi {
  bildirim: boolean;
  eposta: boolean;
  baslik: string;
  mesaj: string;
  /** Uygulama içi yol ("/tasks") ya da https adresi. */
  link?: string;
}

export interface AdminMesajSonucu {
  bildirim: { gonderilen: number; basarisiz: number };
  eposta: { gonderilen: number; basarisiz: number; atlanan: number };
  /** Kalıcı silinmiş hesaplar hiçbir kanaldan mesaj almaz. */
  atlananSilinmis: number;
}

/**
 * Girdiyi doğrular ve temizler. Hata varsa kullanıcıya gösterilecek Türkçe
 * mesajı döner (sözlük anahtarı).
 */
export function adminMesajiniDogrula(
  girdi: Partial<AdminMesajGirdisi>
): { hata: string } | { temiz: AdminMesajGirdisi } {
  const bildirim = girdi.bildirim === true;
  const eposta = girdi.eposta === true;
  if (!bildirim && !eposta) return { hata: "En az bir kanal seç: bildirim ya da e-posta." }; // dil:anahtar

  const baslik = (girdi.baslik ?? "").trim();
  const mesaj = (girdi.mesaj ?? "").trim();
  if (!baslik) return { hata: "Başlık boş olamaz." }; // dil:anahtar
  if (baslik.length > ADMIN_MESAJ_SINIRI.baslik) return { hata: "Başlık çok uzun." }; // dil:anahtar
  if (!mesaj) return { hata: "Mesaj boş olamaz." }; // dil:anahtar
  if (mesaj.length > ADMIN_MESAJ_SINIRI.mesaj) return { hata: "Mesaj çok uzun." }; // dil:anahtar

  const link = (girdi.link ?? "").trim();
  if (link) {
    if (link.length > ADMIN_MESAJ_SINIRI.link) return { hata: "Bağlantı çok uzun." }; // dil:anahtar
    if (!adminMesajLinkiGecerliMi(link)) {
      return { hata: "Bağlantı uygulama içi bir yol (/tasks gibi) ya da https:// ile başlayan bir adres olmalı." }; // dil:anahtar
    }
  }
  return { temiz: { bildirim, eposta, baslik, mesaj, link: link || undefined } };
}

/**
 * Uygulama içi yol ya da https adresi. `//evil.com` bir yol gibi görünür ama
 * tarayıcı onu başka bir alan adına gider — reddedilir. `javascript:` gibi
 * şemalar da.
 */
export function adminMesajLinkiGecerliMi(link: string): boolean {
  if (link.startsWith("/")) return !link.startsWith("//") && !/[\s\\]/.test(link);
  try {
    const u = new URL(link);
    return u.protocol === "https:" && Boolean(u.hostname) && u.hostname.includes(".");
  } catch {
    return false;
  }
}

/**
 * Adres gerçekten e-posta alabilir mi? Demo kadrosu `.test`, silinmiş hesaplar
 * `.invalid` alan adında (RFC 2606: hiçbir zaman çözülmez). Onlara gönderim
 * sağlayıcıda geri dönüşe (bounce) düşer ve gönderen itibarını düşürür.
 */
export function gercekEpostaMi(email: string | null | undefined): boolean {
  if (!email || !email.includes("@")) return false;
  const alan = email.toLowerCase().split("@").pop() ?? "";
  return !/\.(test|invalid|example|localhost)$/.test(alan) && !["example.com", "example.org", "example.net"].includes(alan);
}
