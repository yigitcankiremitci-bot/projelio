import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import type { ReactNode } from "react";
import type { Department, ModuleCatalogEntry, ModuleStatsResponse, OrganizationModule } from "@projelio/shared";
import { sonAcilislar, sonKullanimaGoreSirala } from "../lib/sonKullanilanModul";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import ModuleCard from "./ModuleCard";
import { useT } from "../lib/i18n";
import SectionToggle from "./SectionToggle";
import { useKatlanirBolum } from "../lib/useKatlanirBolum";
import AddModuleModal from "./AddModuleModal";
import { modulDepartmani, yoneticiModulAdresi } from "../lib/modulYeri";
import { isOpenableModule } from "../lib/entityModules";
import { MODULE_RECORD_CONFIGS } from "../lib/moduleRecordConfigs";
import { kartModaldaAcilir } from "../lib/moduleSurfaces";
import ModuleModal from "./ModuleModal";

export interface ModulesPanelHandle {
  /** Anasayfadaki "+" menüsünden "Modül ekle" (bkz. OrganizationDetail HomeAddFabRegistrar). */
  openAdd: () => void;
}

interface Props {
  organizationId: string;
  // Başlık satırının en sağına konan ek öğe — şirket anasayfasında bölümü
  // yukarı/aşağı taşıyan oklar (bkz. OrganizationDetail, lib/anasayfaSirasi).
  basliktaSag?: ReactNode;
}

// Şirket anasayfasındaki "Modüller" sekmesi: organizasyonda (hangi departmandan
// etkinleştirilmiş olursa olsun) etkin olan TÜM modülleri kart görünümünde
// gösterir — böylece yöneticiler her departmana ayrı ayrı girmeden ekli tüm
// modülleri tek yerde görebilir. İlgili departmanı açılmamış modüller
// yöneticide durur ve kartları şirket düzeyindeki sayfaya gider (bkz.
// lib/modulYeri.ts).

const ModulesPanel = forwardRef<ModulesPanelHandle, Props>(function ModulesPanel({ organizationId, basliktaSag }, ref) {
  const c = useThemeColors();
  const t = useT();
  // Anasayfadaki diğer bölümler gibi başlıktan kapatılabilir (bkz. useKatlanirBolum).
  const [collapsed, toggleCollapsed] = useKatlanirBolum("projelio.anasayfa-moduller-kapali");
  const [enabled, setEnabled] = useState<OrganizationModule[]>([]);
  const [catalog, setCatalog] = useState<ModuleCatalogEntry[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  // Modül başına sunucudaki son kayıt hareketi — sıralama için (bkz. lib/sonKullanilanModul).
  const [hareket, setHareket] = useState<Record<string, string | undefined>>({});
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  useImperativeHandle(ref, () => ({ openAdd: () => setAdding(true) }));

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<OrganizationModule[]>(`/organizations/${organizationId}/modules`).catch(() => []),
      api.get<ModuleCatalogEntry[]>("/module-catalog").catch(() => []),
      api.get<Department[]>(`/organizations/${organizationId}/departments`).catch(() => []),
      // Okunamazsa sıra yalnızca bu cihazdaki açılışlara göre kurulur.
      api.get<ModuleStatsResponse>(`/organizations/${organizationId}/module-stats`).catch(() => null),
    ])
      .then(([e, cat, d, stats]) => {
        setEnabled(e);
        setCatalog(cat);
        setDepartments(d);
        setHareket(Object.fromEntries((stats?.modules ?? []).map((m) => [m.moduleKey, m.lastActivityAt])));
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [organizationId]);

  const enabledKeys = new Set(enabled.map((m) => m.moduleKey));
  // Son kullanılan en üstte: ekranda hem liste (telefon) hem şerit (masaüstü)
  // bu sırayı izliyor.
  const activeEntries = sonKullanimaGoreSirala(
    catalog.filter((e) => enabledKeys.has(e.key)),
    (e) => e.key,
    sonAcilislar(),
    hareket
  );

  /**
   * Kart tıklanınca nereye gidilecek: ilgili departman kuruluysa onun sayfası,
   * değilse yöneticideki modül sayfası.
   *
   * Modül BİRDEN FAZLA departmana açık olabiliyor (module_catalog_departments);
   * kurulu olan ilk departman kazanır. Eskiden departmanı olmayan modülün kartı
   * hiçbir yere gitmiyordu — tıklanınca hiçbir şey olmuyordu.
   */
  const departmentIdFor = (entry: ModuleCatalogEntry) => modulDepartmani(entry, departments);
  const hedef = (entry: ModuleCatalogEntry) => {
    const departmentId = departmentIdFor(entry);
    return departmentId
      ? `/departments/${departmentId}?tab=modules&module=${encodeURIComponent(entry.key)}`
      : yoneticiModulAdresi(organizationId, entry.key);
  };
  // Kart modalde açılır (kullanıcı kararı, 2026-11-01): anasayfadan ayrılmadan
  // çalışılır, kapatınca yerine dönülür. Açılamayan (henüz veri girişi olmayan
  // panel) ve çekirdek modül eskisi gibi adrese gider — departman sayfası
  // birincisinin sebebini yazıyor, ikincisi sekmeye yönlendiriyor.
  const [acik, setAcik] = useState<ModuleCatalogEntry | null>(null);
  const tikla = (entry: ModuleCatalogEntry): { to?: string; onClick?: () => void } =>
    isOpenableModule(entry.key, Boolean(MODULE_RECORD_CONFIGS[entry.key])) && kartModaldaAcilir(entry.key)
      ? { onClick: () => setAcik(entry) }
      : { to: hedef(entry) };
  const acikDepartman = acik ? departments.find((d) => d.id === departmentIdFor(acik)) : undefined;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {/* Çift dokunuş "Modül ekle" penceresini açar (bkz. DepartmentsPanel başlığı). */}
        <h2
          onDoubleClick={() => setAdding(true)}
          title={t("Eklemek için çift tıkla")}
          style={{ fontSize: 18, fontWeight: 500, color: c.textPrimary, margin: 0, userSelect: "none", cursor: "default", touchAction: "manipulation" }}
        >
          {t("Modüller")}
        </h2>
        <SectionToggle
          collapsed={collapsed}
          onToggle={toggleCollapsed}
          count={loading ? undefined : activeEntries.length}
          showLabel={t("Modülleri göster")}
          hideLabel={t("Modülleri gizle")}
        />
        {basliktaSag && <div style={{ marginLeft: "auto" }}>{basliktaSag}</div>}
      </div>

      {collapsed ? null : loading ? (
        <p style={{ fontSize: 15, color: c.textSecondary }}>{t("Yükleniyor…")}</p>
      ) : activeEntries.length === 0 ? (
        <div
          style={{
            border: `1px dashed ${c.border}`,
            borderRadius: 12,
            padding: 32,
            textAlign: "center",
            color: c.textSecondary,
            fontSize: 15,
          }}
        >
          {t("Henüz etkinleştirilmiş modül yok. Başlığa çift tıklayarak ya da \"+\" ile modül ekleyebilirsin.")}
        </div>
      ) : (
        // Modüller sekmesi departmanınkiyle aynı: büyük simge, özet, nasıl
        // çalıştığı ve "neler yapabilirsin" (bkz. ModuleCard detayli). Eskiden
        // 240px'lik yana kayan şeritti; kullanıcı modülün ne yaptığını
        // göremiyordu ("modüller küçük ve az detaylı", 2026-11-10). Telefonda
        // ızgara tek sütuna iner.
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))",
            gap: 12,
          }}
        >
          {activeEntries.map((entry) => (
            <ModuleCard detayli key={entry.key} entry={entry} {...tikla(entry)} />
          ))}
        </div>
      )}

      {acik && (
        <ModuleModal
          moduleKey={acik.key}
          moduleName={acik.name}
          description={acik.description}
          organizationId={organizationId}
          departmentId={acikDepartman?.id}
          departmentKey={acikDepartman?.catalogKey}
          onClose={() => setAcik(null)}
        />
      )}

      {adding && (
        <AddModuleModal
          organizationId={organizationId}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            load();
          }}
        />
      )}
    </div>
  );
});

export default ModulesPanel;
