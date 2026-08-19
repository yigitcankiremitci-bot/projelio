import { PROJECT_STATUSES, PROJECT_STATUS_LABELS, type ProjectStatus } from "@projelio/shared";

export { PROJECT_STATUSES, PROJECT_STATUS_LABELS };

/**
 * Proje durum rozetlerinin renkleri.
 *
 * Neden tema paletinden değil: palette beş durumu birbirinden ayıracak kadar
 * ton yok — `textSecondary` tek başına hem "Pasif"i hem "Arşivlendi"yi
 * karşılamak zorunda kalırdı. Bunun yerine duruma özel, kontrastı ÖLÇÜLMÜŞ
 * çiftler kullanılıyor (bkz. projectStatus.test.ts — her çift kendi zemininde
 * WCAG AA eşiği olan 4.5:1'i geçmek zorunda; yeni bir durum eklenip renk
 * seçimi kötü olursa test kırılır).
 *
 * Bileşenden ayrı bir dosyada olmasının nedeni de bu: renk tablosu React'e
 * bulaşmadan test edilebilsin (bkz. covers.ts ile aynı desen).
 */
export const PROJECT_STATUS_STYLE: Record<ProjectStatus, { bg: string; text: string }> = {
  active: { bg: "#E1F3E8", text: "#1B6B3C" },
  on_hold: { bg: "#FFF3CD", text: "#7A5200" },
  passive: { bg: "#ECEEF2", text: "#5A6270" },
  completed: { bg: "#E7EDF9", text: "#26437E" },
  archived: { bg: "#F6E8D6", text: "#8C5A28" },
};
