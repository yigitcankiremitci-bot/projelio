import type { TabScope } from "@projelio/shared";
import { ENTITY_TAB_KEYS, LOCKED_TABS } from "@projelio/shared";
import { useThemeColors } from "../theme/useThemeColors";
import { ORG_TABS } from "./OrgTabs";
import { JOB_TABS } from "./JobTabs";
import { DEPARTMENT_TABS } from "./DepartmentTabs";
import { PROJECT_TABS } from "./ProjectTabs";
import { useT } from "../lib/i18n";

/**
 * Ayar ekranındaki sekme listesi, sekme ÇUBUĞUNUN kendisinden beslenir: anahtar
 * ve etiket tek yerde (bkz. OrgTabs / JobTabs / DepartmentTabs / ProjectTabs)
 * duruyor. Ayarlara ikinci bir liste yazılsaydı yeni eklenen sekme çubukta
 * görünüp ayarlarda görünmezdi.
 *
 * Sıra ENTITY_TAB_KEYS'ten değil bu dizilerden geliyor: kullanıcı ayarlardaki
 * satırları çubuktaki sırayla görsün.
 */
const TABS_BY_SCOPE: Record<TabScope, { key: string; label: string }[]> = {
  organization: ORG_TABS,
  job: JOB_TABS,
  department: DEPARTMENT_TABS,
  project: PROJECT_TABS,
};

interface Props {
  scope: TabScope;
  /** Kapatılmış sekme anahtarları (bkz. <Entity>.hiddenTabs). */
  value: string[];
  onChange: (hidden: string[]) => void;
  /**
   * Yetki gereği zaten görünmeyen sekmeler (ör. bütçeyi göremeyen kullanıcı).
   * Listeden çıkarılır: kapatılıp kapatılmadığının bir anlamı yok ve satır,
   * olmayan bir sekmeyi varmış gibi gösterirdi.
   */
  unavailable?: string[];
}

/**
 * "Hangi sekmeler görünsün" ayarı — dört düzenleme penceresinin ortak parçası.
 *
 * Kutular "GÖSTER" mantığında: kapalı kutu = gizli sekme. Kayıtta tutulan alan
 * ise tersi (hiddenTabs) çünkü varsayılan "hepsi açık" olmalı — yeni bir sekme
 * eklendiğinde eski kayıtlarda kendiliğinden görünsün diye.
 *
 * Sayfanın açılış sekmesi (bkz. shared LOCKED_TABS) kapatılamaz; satırı yine de
 * gösteriliyor ama kutusu kilitli — "burada eksik bir şey var" hissi vermesin.
 */
export default function TabVisibilitySection({ scope, value, onChange, unavailable = [] }: Props) {
  const c = useThemeColors();
  const t = useT();
  const hidden = new Set(value);
  const locked = LOCKED_TABS[scope];
  const gizlenemez = new Set(unavailable);
  const rows = TABS_BY_SCOPE[scope].filter((tab) => !gizlenemez.has(tab.key));

  const toggle = (key: string) => {
    if (locked.includes(key)) return;
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    // Hepsini birden kapatmak sayfayı gövdesiz bırakır; sunucu da aynı listeyi
    // eliyor (bkz. sanitizeHiddenTabs), burada da baştan izin verilmiyor.
    if (next.size >= ENTITY_TAB_KEYS[scope].length) return;
    onChange(Array.from(next));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 15, color: c.textSecondary }}>{t("Görünecek sekmeler")}</label>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
          gap: 4,
          border: `1px solid ${c.border}`,
          borderRadius: 8,
          padding: 6,
        }}
      >
        {rows.map((tab) => {
          const kilitli = locked.includes(tab.key);
          const acik = !hidden.has(tab.key);
          return (
            <label
              key={tab.key}
              title={kilitli ? t("Sayfanın açılış sekmesi kapatılamaz") : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 8px",
                borderRadius: 8,
                cursor: kilitli ? "default" : "pointer",
                background: acik ? `${c.accent}14` : "transparent",
                opacity: kilitli ? 0.65 : 1,
              }}
            >
              <input type="checkbox" checked={acik} disabled={kilitli} onChange={() => toggle(tab.key)} />
              <span style={{ fontSize: 15, color: c.textPrimary, minWidth: 0, overflowWrap: "anywhere" }}>
                {t(tab.label)}
              </span>
            </label>
          );
        })}
      </div>
      <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>
        {t("Kapattığın sekme bu sayfada hiç görünmez. İçerik silinmez; sekmeyi geri açtığında yerinde durur.")}
      </p>
    </div>
  );
}
