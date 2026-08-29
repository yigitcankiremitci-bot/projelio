import type { SocialCredentialReason } from "@projelio/shared";

/**
 * "Bu şifreyi kim görebilir?" kararının saf (yan etkisiz) hali.
 *
 * module-access.ts ile aynı gerekçeyle ayrı dosyada: modülün en
 * güvenlik-kritik kararı Supabase taklidi gerektirmeden test edilebilsin.
 * Veritabanı sorguları SocialCredentialsService'te kalır; burada yalnızca
 * "bu gerçekler verildiğinde ne olur" sorusu yanıtlanır.
 *
 * KURAL — varsayılan KAPALI. Modüle atanmış olmak şifreyi görmeye yetmez;
 * modülü okuyabilen biri şifrenin VARLIĞINI görür, değerini görmez.
 * Bkz. database/migrations/076_sosyal_hesap_kimlik_bilgileri.sql
 */
export interface CredentialAccessFacts {
  /** Modülü okuyabiliyor mu. Okuyamayan için diğer gerçekler sorulmaz bile. */
  canReadModule: boolean;
  /** Yönetici mi: organizasyon sahibi, departman yöneticisi ya da modül yöneticisi. */
  isAdmin: boolean;
  /** Şifreyi bu kullanıcı mı girdi. */
  isCreator: boolean;
  /** Yönetici tarafından verilmiş, geri alınmamış ve süresi geçmemiş izni var mı. */
  hasActiveGrant: boolean;
}

export interface CredentialAccessDecision {
  canReveal: boolean;
  /** Görebiliyorsa hangi haktan — arayüzde gerekçe yazmak ve denetim izi için. */
  reason?: SocialCredentialReason;
  /** Kaydı düzenleyip silebilir mi. İzinli kişi şifreyi görür ama değiştiremez. */
  canEdit: boolean;
}

const CLOSED: CredentialAccessDecision = { canReveal: false, canEdit: false };

/**
 * Yetki sırası — ilk eşleşen kazanır:
 *
 *   1. Yönetici       → görür, düzenler, izin verir
 *   2. Şifreyi giren  → görür, düzenler
 *   3. İzin verilmiş  → yalnızca görür
 *   4. Diğer          → göremez
 *
 * 2'nin var olma sebebi pratik: kendi girdiği şifreyi bir daha okuyamayan
 * kullanıcı, şifreyi bir kenara da yazar — sırrın Projelio dışına çıkması
 * tam da engellemeye çalıştığımız şey.
 */
export function decideCredentialAccess(facts: CredentialAccessFacts): CredentialAccessDecision {
  if (!facts.canReadModule) return CLOSED;
  if (facts.isAdmin) return { canReveal: true, reason: "admin", canEdit: true };
  if (facts.isCreator) return { canReveal: true, reason: "creator", canEdit: true };
  if (facts.hasActiveGrant) return { canReveal: true, reason: "grant", canEdit: false };
  return CLOSED;
}

/**
 * İzin şu an geçerli mi.
 *
 * Süre dolduğunda satır silinmiyor (kimin ne zaman erişebildiği geçmişi
 * kalsın); geçerlilik her okumada burada hesaplanıyor.
 */
export function isGrantActive(
  grant: { revoked_at?: string | null; expires_at?: string | null },
  now: Date = new Date()
): boolean {
  if (grant.revoked_at) return false;
  if (grant.expires_at && new Date(grant.expires_at).getTime() <= now.getTime()) return false;
  return true;
}
