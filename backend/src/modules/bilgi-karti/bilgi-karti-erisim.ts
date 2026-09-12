import type { BilgiKartiKapsami, BilgiKartiYetkisi } from "@projelio/shared";

/**
 * Bilgi kartı yetkisinin karar mantığı — saf fonksiyon.
 *
 * Veritabanına bakmaz, yalnızca toplanmış GERÇEKLERDEN karar üretir (bkz.
 * budget/butce-erisim.ts, aynı desen). Ayrı durmasının sebebi: kartta şirketin
 * resmî kimliği duruyor (vergi no, MERSİS, IBAN, imza sirküleri) ve kuralın
 * veritabanı olmadan testlenebilir tek bir yerde olması gerekiyor.
 */
export interface BilgiKartiErisimGercekleri {
  scopeType: BilgiKartiKapsami;
  /** Kapsamın sahibi: şirket sahibi, işin sahibi — ya da bağlı olduğu holdingin sahibi. */
  isOwner: boolean;
  /**
   * YÖNETİM departmanının onaylı yöneticisi mi (department_catalog.key =
   * 'yonetim'). Şirketin künyesini güncellemek bir yönetim işidir; her
   * departman yöneticisine açmak, satış yöneticisinin vergi dairesini
   * değiştirebilmesi demekti.
   */
  isYonetimManager: boolean;
  /** Kapsamı görebiliyor mu (AccessService kararı). */
  canViewScope: boolean;
  /** Taşeron dış kaynaktır; şirketin kurumsal kimliğine hiç erişmez. */
  isSubcontractor: boolean;
}

export const BILGI_KARTI_YETKISI_YOK: BilgiKartiYetkisi = { canView: false, canEdit: false };

/**
 * TAŞERON HER ŞEYDEN ÖNCE GELİR — bütçede olduğu gibi (bkz. butceYetkisiKarari).
 * Taşeron çalıştığı işi görür ama şirketin vergi levhasını, IBAN'ını ve imza
 * sirkülerini görmez: bunlar kurumsal kimliktir, dış kaynağa açılmaz.
 *
 * GÖRMEK GENİŞ, DÜZENLEMEK DAR: şirketin adresini ve vergi numarasını teklif
 * hazırlayan da, fatura kesen de, kargo gönderen de arıyor — bu bilgiyi kilit
 * altında tutmak kartın var oluş sebebini ortadan kaldırırdı. Değiştirmek ise
 * yalnızca sahibin ve Yönetim'in işi.
 */
export function bilgiKartiYetkisiKarari(g: BilgiKartiErisimGercekleri): BilgiKartiYetkisi {
  if (g.isSubcontractor) return BILGI_KARTI_YETKISI_YOK;
  if (g.isOwner || g.isYonetimManager) return { canView: true, canEdit: true };
  if (g.canViewScope) return { canView: true, canEdit: false };
  return BILGI_KARTI_YETKISI_YOK;
}
