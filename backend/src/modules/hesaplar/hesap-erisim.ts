import type { ServiceCredentialReason } from "@projelio/shared";

/**
 * "Bu hesabın giriş bilgilerini kim görebilir?" kararının saf hâli.
 *
 * social-credential-access.ts ile aynı gerekçeyle ayrı dosyada: modülün en
 * güvenlik-kritik kararı Supabase taklidi gerektirmeden test edilebilsin.
 * Veritabanı sorguları servislerde kalır; burada yalnızca "bu gerçekler
 * verildiğinde ne olur" sorusu yanıtlanır.
 *
 * KURAL — varsayılan KAPALI. Modüle atanmış olmak sırrı görmeye yetmez;
 * modülü okuyabilen biri hesabın VARLIĞINI, adını, aboneliğini ve giriş
 * adresini görür — şifresini görmez. Liste bu yüzden herkese açık,
 * `reveal` ucu kapalıdır.
 *
 * PAYLAŞIMIN İKİ TANESİ AYRI TUTULUYOR (account_grant / scope_grant): denetim
 * izinde "tek hesap paylaşıldı" ile "tüm kasa paylaşıldı" aynı satır gibi
 * görünmemeli. İkisi de aynı yetkiyi verir, ama sonradan bakan kişi hangisinin
 * verildiğini bilmek ister.
 *
 * Bkz. database/migrations/106_hesaplar_modulu.sql
 */
export interface HesapErisimGercekleri {
  /** Modülü okuyabiliyor mu. Okuyamayan için diğer gerçekler sorulmaz bile. */
  canReadModule: boolean;
  /** Yönetici mi: organizasyon sahibi, departman yöneticisi ya da modül yöneticisi. */
  isAdmin: boolean;
  /** Kaydı bu kullanıcı mı girdi. */
  isCreator: boolean;
  /** Bu HESAP için verilmiş, geçerli bir paylaşımı var mı. */
  hasAccountGrant: boolean;
  /** Kapsamın TAMAMI için verilmiş, geçerli bir paylaşımı var mı. */
  hasScopeGrant: boolean;
}

export interface HesapErisimKarari {
  canReveal: boolean;
  /** Görebiliyorsa hangi haktan — arayüzde gerekçe ve denetim izi için. */
  reason?: ServiceCredentialReason;
  /** Kaydı düzenleyip silebilir mi. Paylaşılan kişi görür ama değiştiremez. */
  canEdit: boolean;
}

const KAPALI: HesapErisimKarari = { canReveal: false, canEdit: false };

/**
 * Yetki sırası — ilk eşleşen kazanır:
 *
 *   1. Yönetici        → görür, düzenler, paylaşır
 *   2. Kaydı giren     → görür, düzenler
 *   3. Hesap paylaşımı → yalnızca görür
 *   4. Kapsam paylaşımı→ yalnızca görür
 *   5. Diğer           → göremez
 *
 * 2'nin gerekçesi 076'daki ile aynı ve pratik: kendi girdiği şifreyi bir daha
 * okuyamayan kullanıcı onu bir kenara da yazar — sırrın Projelio dışına
 * çıkması tam da engellemeye çalıştığımız şey.
 */
export function hesapErisimKarari(g: HesapErisimGercekleri): HesapErisimKarari {
  if (!g.canReadModule) return KAPALI;
  if (g.isAdmin) return { canReveal: true, reason: "admin", canEdit: true };
  if (g.isCreator) return { canReveal: true, reason: "creator", canEdit: true };
  if (g.hasAccountGrant) return { canReveal: true, reason: "account_grant", canEdit: false };
  if (g.hasScopeGrant) return { canReveal: true, reason: "scope_grant", canEdit: false };
  return KAPALI;
}

/**
 * Paylaşım şu an geçerli mi.
 *
 * Süre dolduğunda satır silinmiyor (kimin ne zaman erişebildiği geçmişi
 * kalsın); geçerlilik her okumada burada hesaplanıyor.
 */
export function paylasimGecerliMi(
  grant: { revoked_at?: string | null; expires_at?: string | null },
  now: Date = new Date()
): boolean {
  if (grant.revoked_at) return false;
  if (grant.expires_at && new Date(grant.expires_at).getTime() <= now.getTime()) return false;
  return true;
}
