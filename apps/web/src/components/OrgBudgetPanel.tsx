import { forwardRef, useImperativeHandle, useRef } from "react";
import ScopeBudgetPanel, { type ScopeBudgetPanelHandle } from "./butce/ScopeBudgetPanel";
import AlacakBorcBolumu, { type AlacakBorcHandle } from "./butce/AlacakBorcBolumu";

export type BudgetQuickAddKind = "income" | "expense" | "receivable" | "payable";

export interface OrgBudgetPanelHandle {
  openQuickAdd: (kind: BudgetQuickAddKind) => void;
}

interface Props {
  organizationId: string;
}

/**
 * Şirket "Kasa" sekmesi.
 *
 * ARTIK KENDİ EKRANI DEĞİL, İKİ PARÇANIN BİRLEŞİMİ:
 *   · gelir/gider defteri → ScopeBudgetPanel (dört kademede aynı bileşen)
 *   · alacak/borç         → AlacakBorcBolumu (hâlâ bir modül)
 *
 * Eskiden defter de şirkete özel bir modüldü (fm_gelir_gider, module_records).
 * Bu, aynı paranın hem proje bütçesine hem şirket defterine girilmesini mümkün
 * kılıyordu ve yönetim paneli iki katını gösterebiliyordu. Modül kaldırıldı,
 * kayıtları budget_transactions'a taşındı (migration 104): artık tek defter var
 * ve kademeler birbirini TOPLUYOR, kopyalamıyor.
 *
 * Alacak/borç bilerek yerinde kaldı: orada henüz GERÇEKLEŞMEMİŞ para var ve
 * hiçbir bakiyeye girmiyor (bkz. AlacakBorcBolumu).
 */
const OrgBudgetPanel = forwardRef<OrgBudgetPanelHandle, Props>(function OrgBudgetPanel({ organizationId }, ref) {
  const defterRef = useRef<ScopeBudgetPanelHandle>(null);
  const alacakRef = useRef<AlacakBorcHandle>(null);

  useImperativeHandle(ref, () => ({
    openQuickAdd: (kind) => {
      // Gelir/gider artık defterin kendi formunda; alacak/borç modülün modalında.
      if (kind === "income" || kind === "expense") defterRef.current?.openCreate();
      else alacakRef.current?.openQuickAdd(kind);
    },
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <ScopeBudgetPanel ref={defterRef} scopeType="organization" scopeId={organizationId} />
      <AlacakBorcBolumu ref={alacakRef} organizationId={organizationId} />
    </div>
  );
});

export default OrgBudgetPanel;
