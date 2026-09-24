import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import type { Department, ModuleCatalogEntry, ModuleStatsResponse, OrganizationModule } from "@projelio/shared";
import { sonAcilislar, sonKullanimaGoreSirala } from "../lib/sonKullanilanModul";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import ModuleCard from "./ModuleCard";
import { useDragScroll } from "../lib/useDragScroll";
import { useT } from "../lib/i18n";
import { useIsDesktop } from "../lib/useIsDesktop";
import ListRowLink, { ListRowStack, ROW_INNER_HEIGHT } from "./ListRowLink";
import SectionToggle from "./SectionToggle";
import { useKatlanirBolum } from "../lib/useKatlanirBolum";
import ModuleEmblem from "./ModuleEmblem";
import AddModuleModal from "./AddModuleModal";

export interface ModulesPanelHandle {
  /** Anasayfadaki "+" menüsünden "Modül ekle" (bkz. OrganizationDetail HomeAddFabRegistrar). */
  openAdd: () => void;
}

interface Props {
  organizationId: string;
}

// Şirket anasayfasındaki "Modüller" sekmesi: organizasyonda (hangi departmandan
// etkinleştirilmiş olursa olsun) etkin olan TÜM modülleri kart görünümünde
// gösterir — böylece yöneticiler her departmana ayrı ayrı girmeden ekli tüm
// modülleri tek yerde görebilir. Ekleme/kaldırma ilgili departmanın kendi
// sayfasından ("+" düğmesi) yapılır; bu sekme salt görünürlük içindir.
// Bu sayıya kadar tek satır; üstünde iki satıra bölünüp yana kaydırılır.
const SINGLE_ROW_LIMIT = 4;

const ModulesPanel = forwardRef<ModulesPanelHandle, Props>(function ModulesPanel({ organizationId }, ref) {
  const c = useThemeColors();
  const t = useT();
  const isDesktop = useIsDesktop();
  const scrollRef = useDragScroll<HTMLDivElement>();
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

  const deptIdByCatalogKey = new Map(departments.filter((d) => d.catalogKey).map((d) => [d.catalogKey as string, d.id]));
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
   * Kart tıklanınca hangi departmanın sayfasına gidilecek.
   *
   * Modül BİRDEN FAZLA departmana açık olabiliyor (module_catalog_departments)
   * ve şirkette bunlardan yalnızca biri kurulmuş olabiliyor. Eskiden yalnızca
   * BİRİNCİL departmana bakılıyordu: Hesaplar'ın birincili BT olduğu için, modül
   * Yönetim'den açılmış bir şirkette kart hiçbir yere gitmiyor — tıklanınca
   * hiçbir şey olmuyordu. Artık kurulu olan ilk departman kazanıyor (liste
   * zaten birincil başta geliyor).
   */
  const departmentIdFor = (entry: ModuleCatalogEntry): string | undefined => {
    const keys = entry.departmentKeys?.length ? entry.departmentKeys : entry.departmentKey ? [entry.departmentKey] : [];
    for (const key of keys) {
      const id = deptIdByCatalogKey.get(key);
      if (id) return id;
    }
    return undefined;
  };

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
          {t("Henüz etkinleştirilmiş modül yok. Bir departmanın sayfasından \"+\" ile modül ekleyebilirsin.")}
        </div>
      ) : !isDesktop ? (
        // Telefonda iki satırlık yatay şerit yerine alt alta tek satırlık
        // düğmeler (bkz. ListRowLink). Hedef, kartınkiyle aynı.
        <ListRowStack>
          {activeEntries.map((entry) => {
            const departmentId = departmentIdFor(entry);
            return (
              <ListRowLink
                key={entry.key}
                to={departmentId ? `/departments/${departmentId}?tab=modules&module=${encodeURIComponent(entry.key)}` : undefined}
                icon={<ModuleEmblem moduleKey={entry.key} size={ROW_INNER_HEIGHT} radius="11px 0 0 11px" />}
                iconBleed
                label={entry.name}
              />
            );
          })}
        </ListRowStack>
      ) : (
        // Anasayfada modüller departman kartlarıyla aynı mantıkta: yana
        // kaydırmalı, EN FAZLA İKİ SATIR. Tam liste 20+ modülde sayfanın
        // yarısını kaplıyor ve altındaki hiçbir şey görünmüyordu; burası bir
        // özet, modül yönetimi departman sayfasında yapılıyor.
        //
        // Az sayıda modülde iki satır tuhaf duruyor (üç modül 2+1 diye
        // bölünürdü), o yüzden eşik altında tek satır kalıyor.
        <div
          ref={scrollRef}
          style={{
            display: "grid",
            gridAutoFlow: "column",
            gridTemplateRows: activeEntries.length > SINGLE_ROW_LIMIT ? "repeat(2, auto)" : "auto",
            gridAutoColumns: "240px",
            gap: 14,
            overflowX: "auto",
            // Kaydırma çubuğu kartların altına yapışmasın.
            paddingBottom: 6,
          }}
        >
          {activeEntries.map((entry) => (
            <ModuleCard key={entry.key} entry={entry} departmentId={departmentIdFor(entry)} />
          ))}
        </div>
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
