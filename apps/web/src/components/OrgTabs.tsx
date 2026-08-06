import { colors } from "../theme/colors";

export type OrgTab = "flow" | "departments" | "products" | "files";

// JobTabs ile aynı sekme görünümü — "departmanlar ve dosyalar, tıpkı iş
// anasayfasındaki gibi sekme görünümünde olsun". Modüller ayrı bir sekme değil
// — Departmanlar sekmesinin altında, anasayfada kart olarak gösterilir (bkz.
// OrganizationDetail.tsx). Sosyal, departman sekmelerindeki desenin aynısı:
// organizasyona bağlı TÜM departmanların akışlarını (+ organizasyona doğrudan
// yapılan paylaşımları) tek bir zaman çizelgesinde toplar (bkz. FeedPanel).
const tabs: { key: OrgTab; label: string }[] = [
  { key: "flow", label: "Sosyal" },
  { key: "departments", label: "Departmanlar" },
  { key: "products", label: "Ürün/Hizmet" },
  { key: "files", label: "Dosyalar" },
];

interface Props {
  active: OrgTab;
  onChange: (tab: OrgTab) => void;
}

export default function OrgTabs({ active, onChange }: Props) {
  const c = colors.light;
  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        background: c.surface,
        border: `1px solid ${c.border}`,
        borderRadius: 10,
        padding: 4,
        marginBottom: 16,
      }}
    >
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          style={{
            flex: 1,
            padding: "8px 0",
            borderRadius: 7,
            border: "none",
            background: active === t.key ? c.primary : "transparent",
            color: active === t.key ? "#fff" : c.textSecondary,
            fontSize: 16,
            fontWeight: 500,
            cursor: "pointer",
            transition: "background 0.12s ease, color 0.12s ease",
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
