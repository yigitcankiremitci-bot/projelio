import { colors } from "../theme/colors";
import { useIsDesktop } from "../lib/useIsDesktop";

export type OrgTab = "home" | "flow" | "departments" | "products" | "budget" | "files";

// JobTabs ile aynı sekme görünümü. Anasayfa, organizasyonun özeti (Ürün/Hizmet +
// Departmanlar + Modüller kartları) — varsayılan sekme budur. Departmanlar
// sekmesi ise yalnızca departman yönetimi (ekleme/listeleme) için ayrı bir
// ekrandır (bkz. OrganizationDetail.tsx). Sosyal, organizasyona bağlı TÜM
// departmanların akışlarını (+ organizasyona doğrudan yapılan paylaşımları)
// tek bir zaman çizelgesinde toplar (bkz. FeedPanel).
const tabs: { key: OrgTab; label: string }[] = [
  { key: "home", label: "Anasayfa" },
  { key: "flow", label: "Sosyal" },
  { key: "departments", label: "Departmanlar" },
  { key: "products", label: "Ürün/Hizmet" },
  { key: "budget", label: "Bütçe" },
  { key: "files", label: "Dosyalar" },
];

interface Props {
  active: OrgTab;
  onChange: (tab: OrgTab) => void;
  // Sabit başlığın üst bandındaki küçültülmüş kopya (bkz. OrganizationDetail
  // usePageHeaderTabs) marginBottom'u kaldırmak için kullanır.
  style?: React.CSSProperties;
}

export default function OrgTabs({ active, onChange, style }: Props) {
  const c = colors.light;
  const isDesktop = useIsDesktop();
  return (
    <div
      style={{
        // 6 sekme dar ekranda tek sirada okunmuyordu. Serbest satir kirilmasi
        // (flex-wrap) genislige gore 4+2 gibi dengesiz bolunmeler uretiyor; grid
        // ile bolunme deterministik: mobilde 3+3, masaustunde tek sira.
        display: "grid",
        gridTemplateColumns: isDesktop
          ? `repeat(${tabs.length}, minmax(0, 1fr))`
          : "repeat(3, minmax(0, 1fr))",
        gap: 4,
        background: c.surface,
        border: `1px solid ${c.border}`,
        borderRadius: 10,
        padding: 4,
        marginBottom: 16,
        ...style,
      }}
    >
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          style={{
            padding: "8px 4px",
            lineHeight: 1.25,
            // Hucreye sigmayan uzun etiket (ornegin buyutulmus yazi olceginde
            // "Departmanlar") tasmak yerine ikinci satira insin.
            overflowWrap: "break-word",
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
