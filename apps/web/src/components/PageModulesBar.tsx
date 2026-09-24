import { useEffect, useState } from "react";
import type { JobModule, ModuleCatalogEntry, OrganizationModule } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import { useIsDesktop } from "../lib/useIsDesktop";
import { isOpenableModule } from "../lib/entityModules";
import { MODULE_RECORD_CONFIGS } from "../lib/moduleRecordConfigs";
import { moduleSurface } from "../lib/moduleSurfaces";
import { useKatlanirBolum } from "../lib/useKatlanirBolum";
import { sonAcilislar, sonKullanimaGoreSirala } from "../lib/sonKullanilanModul";
import ListRowLink, { ROW_INNER_HEIGHT } from "./ListRowLink";
import ModuleEmblem from "./ModuleEmblem";
import ModuleModal from "./ModuleModal";
import SectionToggle from "./SectionToggle";
import { useT } from "../lib/i18n";

type Props =
  // yenile: artınca liste yeniden yüklenir (iş sayfasında modül eklenip kaldırılınca).
  | { kind: "job"; jobId: string; yenile?: number }
  | { kind: "department"; departmentId: string; organizationId: string; departmentKey?: string; yenile?: number };

/**
 * İş ve departman sayfalarının TEPESİNDEKİ modül listesi — hangi sekme açık
 * olursa olsun sekmelerin hemen altında durur.
 *
 * Neden: modüller iş sayfasında Projeler sekmesinin dibinde, departmanda ayrı
 * bir sekmede duruyordu; kullanıcı her seferinde sekme değiştirip aşağı
 * kaydırmak zorundaydı. Burada anasayfadaki Modüller bölümüyle aynı dil:
 * tek satırlık düğmeler, başlıktan açılır/kapanır (son hâl hatırlanır), en
 * son kullanılan en üstte (bkz. lib/sonKullanilanModul).
 *
 * Yönetim (ekleme/kaldırma) burada YOK — o hâlâ Modüller sekmesinde ve "+"
 * menüsünde. Bu bir kısayol şeridi.
 */
export default function PageModulesBar(props: Props) {
  const c = useThemeColors();
  const t = useT();
  const isDesktop = useIsDesktop();
  const [entries, setEntries] = useState<ModuleCatalogEntry[]>([]);
  const [modalEntry, setModalEntry] = useState<ModuleCatalogEntry | null>(null);
  const [collapsed, toggleCollapsed] = useKatlanirBolum("projelio.sayfa-moduller-kapali");

  const scopeKey =
    props.kind === "job"
      ? `${props.jobId}:${props.yenile ?? 0}`
      : `${props.departmentId}:${props.departmentKey ?? ""}:${props.yenile ?? 0}`;

  useEffect(() => {
    let cancelled = false;
    const yukle = async (): Promise<ModuleCatalogEntry[]> => {
      if (props.kind === "job") {
        const [cat, mods] = await Promise.all([
          api.get<ModuleCatalogEntry[]>("/module-catalog?freelancer=true").catch(() => []),
          api.get<JobModule[]>(`/jobs/${props.jobId}/modules`).catch(() => []),
        ]);
        const atanan = new Set(mods.map((m) => m.moduleKey));
        return cat.filter((e) => atanan.has(e.key));
      }
      // Katalog dışı (özel) departmanın modülü yok.
      if (!props.departmentKey) return [];
      const [cat, org] = await Promise.all([
        api
          .get<ModuleCatalogEntry[]>(`/module-catalog?departmentKey=${encodeURIComponent(props.departmentKey)}`)
          .catch(() => []),
        api.get<OrganizationModule[]>(`/organizations/${props.organizationId}/modules`).catch(() => []),
      ]);
      const etkin = new Set(org.map((m) => m.moduleKey));
      return cat.filter((e) => etkin.has(e.key));
    };
    yukle().then((list) => {
      if (!cancelled) setEntries(list);
    });
    return () => {
      cancelled = true;
    };
    // scopeKey kapsamın tamamını taşıyor (iş kimliği + tazeleme sayacı ya da
    // departman + katalog anahtarı).
  }, [scopeKey]);

  // Modülü olmayan sayfada boş bir başlık durmasın.
  if (entries.length === 0) return null;

  const sirali = sonKullanimaGoreSirala(entries, (e) => e.key, sonAcilislar());

  /** Modül nerede açılır: sayfa yüzeyli kendi adresinde, modal yüzeyli yerinde. */
  const hedef = (entry: ModuleCatalogEntry): { to?: string; onClick?: () => void } => {
    if (!isOpenableModule(entry.key, Boolean(MODULE_RECORD_CONFIGS[entry.key]))) return {};
    if (props.kind === "department") {
      // Departmanın modül paneli ?module= parametresini zaten çözüyor: sayfa
      // yüzeyliyi kendi adresine götürüyor, modal yüzeyliyi yerinde açıyor.
      return { to: `/departments/${props.departmentId}?tab=modules&module=${encodeURIComponent(entry.key)}` };
    }
    return moduleSurface(entry.key) === "modal"
      ? { onClick: () => setModalEntry(entry) }
      : { to: `/jobs/${props.jobId}/modules/${encodeURIComponent(entry.key)}` };
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 500, color: c.textPrimary }}>{t("Modüller")}</h3>
        <SectionToggle
          collapsed={collapsed}
          onToggle={toggleCollapsed}
          count={entries.length}
          showLabel={t("Modülleri göster")}
          hideLabel={t("Modülleri gizle")}
        />
      </div>

      {!collapsed && (
        <div
          style={{
            display: "grid",
            // Telefonda alt alta; geniş ekranda satırlar sütunlara yayılır.
            gridTemplateColumns: isDesktop ? "repeat(auto-fill, minmax(240px, 1fr))" : "1fr",
            gap: 8,
          }}
        >
          {sirali.map((entry) => (
            <ListRowLink
              key={entry.key}
              {...hedef(entry)}
              icon={<ModuleEmblem moduleKey={entry.key} size={ROW_INNER_HEIGHT} radius="11px 0 0 11px" />}
              iconBleed
              label={entry.name}
            />
          ))}
        </div>
      )}

      {modalEntry && props.kind === "job" && (
        <ModuleModal
          moduleKey={modalEntry.key}
          moduleName={modalEntry.name}
          description={modalEntry.description}
          jobId={props.jobId}
          onClose={() => setModalEntry(null)}
        />
      )}
    </div>
  );
}
