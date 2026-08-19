import type { DepartmentAccess, DepartmentMemberRole, DepartmentViewerRole } from "@projelio/shared";

/**
 * Departman görünürlüğünün saf (yan etkisiz) hali.
 *
 * Veritabanı sorguları DepartmentsService'te kalır; burada yalnızca "bu
 * gerçekler verildiğinde kullanıcı departmanın nesini görebilir?" sorusu
 * yanıtlanır — böylece hiyerarşinin en güvenlik-kritik kuralı Supabase'i taklit
 * etmeden test edilebiliyor (bkz. module-members/module-access.ts, aynı desen).
 *
 * Kural özeti — bir departman, kadrosunda olmayan hiç kimseye görünmez.
 * Taşeron yalnızca kendi departmanını görür; bütçeyi ve ekip listesini görmez.
 */
export interface DepartmentAccessFacts {
  /** Departmanın bağlı olduğu organizasyonun sahibi mi. */
  isOrgOwner: boolean;
  /** Organizasyonun onaylı üyesi mi (organization_members). */
  isOrgMember: boolean;
  /** Bu departmandaki ONAYLI kadro rolü. Yoksa kadroda değildir. */
  membershipRole?: DepartmentMemberRole;
}

export const NO_DEPARTMENT_ACCESS: DepartmentAccess = {
  role: "none",
  canView: false,
  canViewTeam: false,
  canViewBudget: false,
  canManage: false,
};

/**
 * Yetki sırası — en geniş yetkiden en dara, ilk eşleşen kazanır:
 *
 *   1. Organizasyon sahibi          → gör, ekip, bütçe, yönet
 *   2. Departman yöneticisi         → gör, ekip, bütçe, yönet
 *   3. Organizasyon üyesi           → gör, ekip            (bütçe yok)
 *   4. Kadro: çalışan               → gör, ekip            (bütçe yok)
 *   5. Kadro: taşeron               → gör                  (ekip ve bütçe yok)
 *   6. Diğer                        → departman hiç görünmez
 *
 * 2'nin 3'ten önce gelmesi bilinçli: departman yöneticisi organizasyon üyesi
 * olarak da işaretlenmiş olabilir, dar olan rol geniş olanı bastırmamalı.
 */
export function decideDepartmentAccess(facts: DepartmentAccessFacts): DepartmentAccess {
  if (facts.isOrgOwner) {
    return { role: "owner", canView: true, canViewTeam: true, canViewBudget: true, canManage: true };
  }

  if (facts.membershipRole === "manager") {
    return { role: "manager", canView: true, canViewTeam: true, canViewBudget: true, canManage: true };
  }

  if (facts.isOrgMember) {
    return { role: "org_member", canView: true, canViewTeam: true, canViewBudget: false, canManage: false };
  }

  if (facts.membershipRole === "employee") {
    return { role: "employee", canView: true, canViewTeam: true, canViewBudget: false, canManage: false };
  }

  // Taşeron: dış kaynak. Departmanı görür (ekli olduğu iş orada), ancak
  // organizasyonun kadrosunu ve finansal defterini görmez.
  if (facts.membershipRole === "subcontractor") {
    return { role: "subcontractor", canView: true, canViewTeam: false, canViewBudget: false, canManage: false };
  }

  return NO_DEPARTMENT_ACCESS;
}

/** Tip dışa aktarımı, çağıranlar shared'ı ayrıca import etmek zorunda kalmasın. */
export type { DepartmentAccess, DepartmentViewerRole };
