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
  /** Kendi (bireysel) aboneliği; şirket üzerinden gelen plan burada yok. */
  abonelik?: { planKey: string; status: string; period: string };
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
