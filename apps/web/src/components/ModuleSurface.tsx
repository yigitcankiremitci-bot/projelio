import type { ModuleAccess } from "@projelio/shared";
import { isEntityModule } from "../lib/entityModules";
import { MODULE_FORM_CONFIGS } from "../lib/moduleForms";
import { getModuleRecordConfig } from "../lib/moduleRecordConfigs";
import { MODULE_RECORD_CONFIGS } from "../lib/moduleConfigs";
import { PANEL_CONFIGS } from "../lib/panelConfigs";
import CustomersPanel from "./CustomersPanel";
import ModuleFormPanel from "./ModuleFormPanel";
import ModulePanelView from "./ModulePanelView";
import ModuleRecordsPanel from "./ModuleRecordsPanel";

/**
 * Bir modülün içeriği — hangi motor olduğuna bakmadan.
 *
 * Bu dallanma (form / türev panel / ortak varlık / kayıt listesi) daha önce
 * DepartmentModulesPanel ve DashboardAssignedModules içinde iki kez
 * kopyalanmıştı; A4 ve A5 motorları gelince üçe, sekme yerleşimiyle dörde
 * çıkacaktı. Tek yerde toplanınca yeni bir motor eklemek tek dosyaya dokunmak
 * oluyor.
 *
 * Yüzey (modal mı sayfa mı) burada KARARLAŞTIRILMAZ, yalnızca içerik üretilir.
 * Kararı çağıran verir; bkz. lib/moduleSurfaces.ts ve ModuleModal.tsx.
 */

export interface ModuleSurfaceProps {
  moduleKey: string;
  moduleName: string;
  organizationId?: string;
  departmentId?: string;
  departmentKey?: string;
  jobId?: string;
  access?: ModuleAccess | null;
}

export default function ModuleSurface({
  moduleKey,
  moduleName,
  organizationId,
  departmentId,
  departmentKey,
  jobId,
  access,
}: ModuleSurfaceProps) {
  // Yetki verilmediğinde yazma varsayılır: sunucu her hâlükârda kendi kontrolünü
  // yapar, buradaki yalnızca arayüz kolaylığı (bkz. ModuleRecordsPanel).
  const canWrite = access?.canWrite ?? true;
  // Serbest çalışanda ayrı bir onay makamı yok: işin sahibi hem yazar hem onaylar.
  const canApprove = jobId ? true : access?.canManageTeam ?? false;

  const formConfig = MODULE_FORM_CONFIGS[moduleKey];
  if (formConfig) {
    return (
      <ModuleFormPanel
        organizationId={organizationId}
        departmentId={departmentId}
        jobId={jobId}
        moduleKey={moduleKey}
        config={formConfig}
        canWrite={canWrite}
        canApprove={canApprove}
      />
    );
  }

  const panelConfig = PANEL_CONFIGS[moduleKey];
  if (panelConfig) {
    // Türev panel: kendi verisi yok, diğer modüllerden okur.
    return <ModulePanelView config={panelConfig} organizationId={organizationId} jobId={jobId} />;
  }

  if (isEntityModule(moduleKey)) {
    // Ortak varlığa yazar: iki departman AYNI kayıtları görür, yalnızca görünüm
    // profili değişir.
    return (
      <CustomersPanel
        organizationId={organizationId}
        departmentId={departmentId}
        departmentKey={departmentKey}
        jobId={jobId}
        canWrite={canWrite}
      />
    );
  }

  // Kayıt listesi. Tanımı olmayan modüller genel amaçlı kayıt defterine düşer —
  // hiçbir modül boş kabuk kalmasın diye (bkz. moduleConfigs/index.ts).
  return (
    <ModuleRecordsPanel
      organizationId={organizationId}
      departmentId={departmentId}
      jobId={jobId}
      moduleKey={moduleKey}
      config={getModuleRecordConfig(moduleKey, moduleName)}
      canWrite={canWrite}
    />
  );
}

/** Modül tıklanınca bir şey açılıyor mu. */
export function isOpenable(moduleKey: string): boolean {
  return (
    Boolean(MODULE_FORM_CONFIGS[moduleKey]) ||
    Boolean(PANEL_CONFIGS[moduleKey]) ||
    isEntityModule(moduleKey) ||
    Boolean(MODULE_RECORD_CONFIGS[moduleKey])
  );
}
