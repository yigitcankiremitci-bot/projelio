import { toleransSonu } from "./paytr-abonelik-takvim";

/**
 * Bir aboneliğin bugün hak verip vermediği — SAF, servis bağımlılığı yok.
 *
 * BillingService'in içindeydi; modül hakkı hesabı (organization-modules)
 * da aynı kurala ihtiyaç duyunca buraya çıktı. BillingModule'ü oraya bağlamak
 * Lio üzerinden döngüsel bağımlılık kurardı (AiAssistant → OrganizationModules
 * → Billing → AiAssistant), kuralı ikinci kez yazmak ise iki yerin zamanla
 * ayrışması demekti.
 */

/**
 * Hak veren durumlar. İkisi de bilinçli:
 *   · past_due — tek bir başarısız çekim erişimi kesmez, sağlayıcı yeniden deniyor.
 *   · canceled — ödenmiş dönem sonuna kadar kullanmaya devam edilir.
 */
export const HAK_VEREN_DURUMLAR = ["trialing", "active", "past_due", "canceled"] as (
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
)[];

export interface AbonelikDonemi {
  status: string;
  source: string;
  currentPeriodEnd?: string | null;
}

/**
 * İptal edilmiş ya da ödemesi gecikmiş abonelik dönem sonuna kadar hak verir;
 * dönem geçmişse vermez. Süre dolduğunda satırı 'expired' yapan iş
 * donemleriIlerlet() ama ona güvenmiyoruz: cron gecikirse hak sızmasın.
 */
export function abonelikDonemiGecerli(abonelik: AbonelikDonemi, simdi: number = Date.now()): boolean {
  if (!abonelik.currentPeriodEnd) return abonelik.status === "active" || abonelik.status === "trialing";
  const bitis = new Date(abonelik.currentPeriodEnd);
  // PayTR'de yenilemeyi biz deniyoruz ve vade geçtikten sonra 14 gün daha
  // deniyoruz; bu sürede erişim açık kalmalı (kullanıcı kararı, 2026-09-28).
  // Aktif ama vadesi geçmiş satır da aynı durumda: saat başı iş henüz
  // çekmemiş olabilir, bir saatlik gecikme erişimi kesmemeli.
  if (abonelik.source === "paytr" && (abonelik.status === "past_due" || abonelik.status === "active")) {
    return toleransSonu(bitis).getTime() > simdi;
  }
  return bitis.getTime() > simdi;
}
