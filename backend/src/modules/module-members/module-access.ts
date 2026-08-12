import type { ModuleAccess, ModuleMemberRole } from "@projelio/shared";

/**
 * Yetki kararının saf (yan etkisiz) hali.
 *
 * Veritabanı sorguları ModuleMembersService'te kalır; burada yalnızca
 * "bu gerçekler verildiğinde kullanıcı ne yapabilir?" sorusu yanıtlanır.
 * Böylece modül sisteminin en güvenlik-kritik mantığı Supabase'i taklit etmeden
 * test edilebiliyor.
 *
 * Bkz. database/migrations/042_module_members.sql ve
 *      docs/moduller/05-mevcut-kod-ile-uzlasma.md (Faz 0 yetki sırası)
 */
export interface AccessFacts {
  /** Organizasyonun ya da işin sahibi mi. */
  isOwner: boolean;
  /** Modülün etkin olduğu departmanlardan birinin onaylı yöneticisi mi. */
  isDepartmentManager: boolean;
  /** Modülün etkin olduğu departmanlardan birinin onaylı üyesi mi (yönetici olmadan). */
  isDepartmentMember: boolean;
  /** Modüle doğrudan atanmışsa rolleri. Boş dizi = atanmamış. */
  moduleMemberRoles: ModuleMemberRole[];
}

export const NO_ACCESS = (moduleKey: string): ModuleAccess => ({
  moduleKey,
  canRead: false,
  canWrite: false,
  canManageTeam: false,
  reason: "none",
});

/**
 * Yetki sırası — en geniş yetkiden en dara, ilk eşleşen kazanır:
 *
 *   1. Sahip                                   → oku, yaz, ekibi yönet
 *   2. Departman yöneticisi                    → oku, yaz, ekibi yönet
 *   3. Modül üyesi (manager)                   → oku, yaz, ekibi yönet
 *   4. Modül üyesi (employee / subcontractor)  → oku, yaz
 *   5. Departman üyesi, modüle atanmamış       → oku
 *   6. Diğer                                   → erişim yok
 *
 * Sıranın 2 ve 3'ten önce gelmesi bilinçli: departman yöneticisi modüle ayrıca
 * atanmasa da kendi departmanının modüllerinden sorumludur.
 */
export function decideAccess(moduleKey: string, facts: AccessFacts): ModuleAccess {
  if (facts.isOwner) {
    return { moduleKey, canRead: true, canWrite: true, canManageTeam: true, reason: "owner" };
  }

  if (facts.isDepartmentManager) {
    return { moduleKey, canRead: true, canWrite: true, canManageTeam: true, reason: "department_manager" };
  }

  if (facts.moduleMemberRoles.length > 0) {
    // Bir kişi aynı modüle birden fazla departman bağlamında atanmış olabilir;
    // en yetkili rolü kazanır.
    const isManager = facts.moduleMemberRoles.includes("manager");
    return {
      moduleKey,
      canRead: true,
      canWrite: true,
      canManageTeam: isManager,
      reason: "module_member",
      role: isManager ? "manager" : facts.moduleMemberRoles[0],
    };
  }

  if (facts.isDepartmentMember) {
    return { moduleKey, canRead: true, canWrite: false, canManageTeam: false, reason: "department_member" };
  }

  return NO_ACCESS(moduleKey);
}
