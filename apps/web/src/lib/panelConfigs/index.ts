import {
  auditPanel,
  budgetPanel,
  cashFlowPanel,
  financeAnalysisPanel,
  financialPlanningPanel,
} from "./finans";
import {
  acquisitionPanel,
  digitalMarketingPanel,
  holdingAnalysisPanel,
  holdingReportingPanel,
  managementAnalysisPanel,
  reportingPanel,
} from "./genel";
import type { PanelConfig } from "./types";

export * from "./types";

/**
 * A6 — Türev Panel modülleri.
 *
 * Bu modüllerin kendi verisi yoktur; diğer modüllerin kayıtlarını okuyup
 * gösterge üretirler. Katalogdaki anahtarla birebir eşleşir.
 *
 * Bu kayıt defteri sayesinde 11 modül tek motorla açıldı — mimarideki
 * "6 motor, 45 modül" tezinin en büyük tek kazancı.
 * Bkz. docs/moduller/00-modul-mimarisi.md §2 (A6)
 */
export const PANEL_CONFIGS: Record<string, PanelConfig> = {
  // YÖNETİM
  yonetim_analiz: managementAnalysisPanel,
  yonetim_raporlama: reportingPanel,
  yonetim_denetim: auditPanel,
  yonetim_butce_yonetimi: budgetPanel,

  // FİNANS
  fm_analiz_rapor: financeAnalysisPanel,
  fm_nakit_akis: cashFlowPanel,
  fm_finansal_planlama: financialPlanningPanel,

  // PAZARLAMA
  pd_musteri_kazanim_optimizasyonu: acquisitionPanel,
  // Not: bu anahtar SEO/SEM veri girişiyle bölünmüştü; panel yarısı burada.
  // Bkz. docs/moduller/01-modul-arketip-eslesmesi.md Karar 2
  pd_dijital_pazarlama: digitalMarketingPanel,

  // HOLDİNG
  holding_analiz: holdingAnalysisPanel,
  holding_raporlama: holdingReportingPanel,
  holding_denetim: { ...auditPanel, title: "Denetim (Holding)", scopeNote: holdingAnalysisPanel.scopeNote },
};

export function isPanelModule(moduleKey: string): boolean {
  return moduleKey in PANEL_CONFIGS;
}

/** Panelin okuduğu tüm modüller (kayıt çekmek için). */
export function panelSourceKeys(config: PanelConfig): string[] {
  const keys = new Set(config.sources);
  for (const m of config.metrics) m.sources.forEach((s) => keys.add(s));
  for (const b of config.breakdowns ?? []) b.sources.forEach((s) => keys.add(s));
  return Array.from(keys).filter(Boolean);
}
