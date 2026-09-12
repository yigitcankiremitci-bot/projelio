import type { BudgetScopeType, ButceYetkisi } from "@projelio/shared";

/**
 * Bütçe görünürlüğünün karar mantığı — saf fonksiyon.
 *
 * Veritabanına bakmaz, yalnızca toplanmış GERÇEKLERDEN karar üretir (bkz.
 * departments/department-access.ts, aynı desen). Ayrı durmasının sebebi:
 * finansal veri bu üründeki en hassas yüzey ve kuralın testlenebilir tek bir
 * yerde olması gerekiyor. Kural beş kademeye dağılmış if'ler hâlindeyken
 * departman bütçesi aylarca kadroda olmayan herkese açık kaldı
 * (bkz. BudgetService.assertCanViewDepartmentBudget yorumu).
 */
export interface ButceErisimGercekleri {
  scopeType: BudgetScopeType;
  /** Kademenin sahibi (iş sahibi, şirket sahibi, holding sahibi). */
  isOwner: boolean;
  /**
   * Kademenin yöneticisi: departmanın onaylı yöneticisi, ya da departman
   * için organizasyonun sahibi. Sahip kadar yetkilidir.
   */
  isManager: boolean;
  /** budget_viewers'a elle eklenmiş kullanıcı mı. */
  isExplicitViewer: boolean;
  /** Elle eklenmişse kayıt girme yetkisi verilmiş mi. */
  explicitCanManage: boolean;
  /** Taşeron dış kaynaktır; kurumsal finansal veriye hiç erişmez. */
  isSubcontractor: boolean;
}

export const BUTCE_YETKISI_YOK: ButceYetkisi = {
  canView: false,
  canManage: false,
  canApprove: false,
  canManageViewers: false,
};

/**
 * TAŞERON HER ŞEYDEN ÖNCE GELİR. Bir taşeron budget_viewers'a yanlışlıkla
 * eklenmiş olsa bile şirketin defterini göremez: taşeron dış kaynaktır ve
 * kurumsal kademeye (iş/departman/şirket/holding) hiç dahil değildir. Aynı
 * kural AccessService.canViewJob ve canViewGroup içinde de var.
 *
 * ONAY YETKİSİ SATIN ALINAMAZ: budget_viewers'tan gelen kullanıcı `canManage`
 * ile kayıt girebilir ama görev bütçesi ONAYLAYAMAZ. Onay bir yönetim
 * kararıdır — "bu parayı harcamaya izin veriyorum" demektir — ve yalnızca
 * kademenin sahibi/yöneticisi verebilir. Görünürlük listesi bir okuma izni
 * mekanizmasıdır, imza yetkisi değil.
 */
export function butceYetkisiKarari(g: ButceErisimGercekleri): ButceYetkisi {
  if (g.isSubcontractor) return BUTCE_YETKISI_YOK;

  if (g.isOwner || g.isManager) {
    return { canView: true, canManage: true, canApprove: true, canManageViewers: true };
  }

  if (g.isExplicitViewer) {
    return {
      canView: true,
      canManage: g.explicitCanManage,
      canApprove: false,
      // Kimin göreceğine yalnızca sahip/yönetici karar verir. Aksi hâlde
      // görünürlük verilen kişi kendi arkadaşlarını da ekleyebilir ve liste
      // sahibin haberi olmadan büyür.
      canManageViewers: false,
    };
  }

  return BUTCE_YETKISI_YOK;
}

/**
 * budget_viewers tablosunun tanıdığı kademeler.
 *
 * Proje ve rutin BİLEREK dışarıda: projede görünürlük zaten
 * project_members.can_view_budget ile ekip kaydının üzerinde duruyor ve aynı
 * bilgi için ikinci bir tablo tutmak, iki listenin çelişmesi demek olurdu.
 */
export const VIEWER_KAPSAMLARI = ["job", "department", "organization", "group"] as const;
export type ViewerKapsami = (typeof VIEWER_KAPSAMLARI)[number];

export function viewerKapsamiMi(deger: unknown): deger is ViewerKapsami {
  return typeof deger === "string" && (VIEWER_KAPSAMLARI as readonly string[]).includes(deger);
}
