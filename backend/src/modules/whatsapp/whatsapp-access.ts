import type { OrganizationAccess } from "@projelio/shared";

/**
 * "Bu kullanıcı organizasyonun WhatsApp bağlantısına ne yapabilir?" kararının
 * saf hali (social-credential-access.ts ile aynı desen).
 *
 * KURAL — numarayı bağlamak/koparmak ve QR'ı görmek yalnızca organizasyon
 * SAHİBİNİN işi. QR'ı okutan kişi numaranın tüm sohbet geçmişine erişebilir;
 * departman yöneticiliği buna yetmez. Bağlantının VARLIĞINI ve durumunu
 * organizasyonu görebilen herkes görür (kendi bildirim ayarını yapabilmesi
 * için numaranın bağlı olup olmadığını bilmesi gerekir).
 */
export interface ConnectionAccessDecision {
  canView: boolean;
  /** Bağla, QR gör, eşleştirme kodu iste, kopar, kişi ekle. */
  canManage: boolean;
}

const CLOSED: ConnectionAccessDecision = { canView: false, canManage: false };

export function decideConnectionAccess(access: Pick<OrganizationAccess, "role" | "canView">): ConnectionAccessDecision {
  if (!access.canView) return CLOSED;
  return { canView: true, canManage: access.role === "owner" };
}
