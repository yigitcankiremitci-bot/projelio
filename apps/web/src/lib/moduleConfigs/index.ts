import { hardwareConfig, networkSecurityConfig, softwareConfig } from "./bilgiTeknolojileri";
import {
  budgetPlanConfig,
  financeEntryConfig,
  invoiceConfig,
  investmentConfig,
  receivablesPayablesConfig,
  riskConfig,
  taxTrackingConfig,
} from "./finans";
import { contractConfig, intellectualPropertyConfig, regulationConfig } from "./hukuk";
import {
  candidateConfig,
  internalCommsConfig,
  payrollConfig,
  performanceConfig,
  trainingConfig,
} from "./insanKaynaklari";
import { complaintConfig, supportTicketConfig } from "./musteriIliskileri";
import { procurementConfig, qualityControlConfig, shipmentConfig, warehouseConfig } from "./operasyon";
import {
  advertisingConfig,
  competitorConfig,
  emailCampaignConfig,
  growthGoalConfig,
  productStrategyConfig,
  seoSemConfig,
  targetAudienceConfig,
} from "./pazarlama";
import { marketResearchConfig, partnershipConfig, salesPipelineConfig } from "./satis";
import { countBy, opts, type ModuleRecordConfig } from "./shared";
import { goalConfig, missionConfig, visionConfig } from "./yonetim";

export * from "./shared";

// ============================================================ Genel amaçlı (fallback)
// Katalogda olup henüz kendine özel alan tanımı yazılmamış modüller için basit
// bir "kayıt defteri": başlık + durum + tarih + not. Böylece hiçbir modül boş
// kabuk olarak kalmıyor; bir modül tam özellikli yapıldığında aşağıdaki
// MODULE_RECORD_CONFIGS'e eklenip bu fallback devreden çıkar.
const GENERIC_STATUS = { open: "Açık", in_progress: "Devam ediyor", done: "Tamamlandı" };

function genericConfig(moduleName: string): ModuleRecordConfig {
  return {
    title: moduleName,
    addLabel: "Kayıt ekle",
    emptyLabel: "Henüz kayıt yok.",
    fields: [
      { key: "title", label: "Başlık", type: "text", required: true },
      { key: "status", label: "Durum", type: "select", defaultValue: "open", options: opts(GENERIC_STATUS) },
      { key: "date", label: "Tarih", type: "date" },
      { key: "notes", label: "Not", type: "textarea" },
    ],
    summary: (d) => (d.title as string) ?? "",
    detail: (d) => {
      const parts = [GENERIC_STATUS[d.status as keyof typeof GENERIC_STATUS], d.date as string | undefined];
      return parts.filter(Boolean).join(" · ") || undefined;
    },
    computeStats: (records) => [
      { label: "Toplam", value: String(records.length) },
      { label: "Devam eden", value: String(countBy(records, "status", "in_progress")) },
      { label: "Tamamlanan", value: String(countBy(records, "status", "done")) },
    ],
  };
}

/**
 * Bir modülün veri giriş tanımını verir. Modüle özel bir tanım yoksa genel amaçlı
 * kayıt defterine düşer — bu yüzden her zaman bir config döner.
 */
export function getModuleRecordConfig(moduleKey: string, moduleName: string): ModuleRecordConfig {
  return MODULE_RECORD_CONFIGS[moduleKey] ?? genericConfig(moduleName);
}

/**
 * Tam özellikli modüller. Buradaki anahtarlar module_catalog.key ile birebir
 * eşleşir.
 *
 * Listede olmayanlar bilerek dışarıda:
 *   - Türev paneller (analiz, raporlama, denetim, nakit akış, finansal planlama,
 *     dijital pazarlama, müşteri kazanım) veri girişi almaz; A6 panel motorunu
 *     bekliyorlar.
 *   - Yönetim'in proje/program/görev/çıktı/dosya/bütçe modülleri Projelio'nun
 *     çekirdeğidir, modül değildir.
 *   - uyd_urunler kendi tablosuna (products) sahip, module_records kullanmaz.
 * Bkz. docs/moduller/01-modul-arketip-eslesmesi.md
 */
export const MODULE_RECORD_CONFIGS: Record<string, ModuleRecordConfig> = {
  // YÖNETİM
  yonetim_hedef_belirleme: goalConfig,
  yonetim_vizyon_sablonu: visionConfig,
  yonetim_misyon_sablonu: missionConfig,

  // İNSAN KAYNAKLARI
  ik_ise_alim_oryantasyon: candidateConfig,
  ik_egitim_gelisim: trainingConfig,
  ik_performans_izleme: performanceConfig,
  ik_bordro_ozluk: payrollConfig,
  ik_ic_iletisim_kultur: internalCommsConfig,

  // FİNANS MUHASEBE
  fm_gelir_gider: financeEntryConfig,
  fm_alacak_borc: receivablesPayablesConfig,
  fm_fatura: invoiceConfig,
  fm_vergi_takip: taxTrackingConfig,
  fm_butce_hazirlama: budgetPlanConfig,
  fm_sermaye_yatirim_takip: investmentConfig,
  fm_risk_yonetimi: riskConfig,

  // PAZARLAMA ve BÜYÜME
  pd_rakip_sektor_analizi: competitorConfig,
  pd_hedef_kitle: targetAudienceConfig,
  pd_dijital_pazarlama_seo_sem: seoSemConfig,
  // pd_sosyal_medya burada YOK: kendi tablolarına yazıyor ve kendi paneli var
  // (bkz. 054_social_media.sql, SocialMediaPanel.tsx).
  pd_email: emailCampaignConfig,
  pd_reklam: advertisingConfig,
  pd_urun_stratejileri: productStrategyConfig,
  pd_buyume_hedefleri: growthGoalConfig,

  // SATIŞ ve İŞ GELİŞTİRME
  spd_satis_planlama_b2b_b2c: salesPipelineConfig,
  spd_ortaklik_dagitim: partnershipConfig,
  spd_pazar_arastirma: marketResearchConfig,

  // OPERASYON / ÜRETİM
  oud_tedarik: procurementConfig,
  oud_depo: warehouseConfig,
  oud_sevkiyat_yonetimi: shipmentConfig,
  oud_kalite_kontrol: qualityControlConfig,

  // BİLGİ TEKNOLOJİLERİ / YAZILIM
  bt_yazilim: softwareConfig,
  bt_donanim: hardwareConfig,
  bt_ag_guvenlik: networkSecurityConfig,

  // MÜŞTERİ İLİŞKİLERİ
  // Müşteri modülü burada yok: crm_musteri ortak `party` varlığına yazar ve
  // kendi paneli vardır (bkz. lib/entityModules.ts).
  mid_sikayet_oneri: complaintConfig,
  mid_teknik_destek: supportTicketConfig,

  // HUKUK ve UYUM
  hud_sozlesme: contractConfig,
  hud_marka_patent_telif: intellectualPropertyConfig,
  hud_mevzuatlar: regulationConfig,
};
