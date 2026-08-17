import TabBar from "./TabBar";

// Terfi etmiş modüller de bu çubuğa girdiği için tip string'e açıldı: sabit
// sekme anahtarları + modül katalog anahtarları.
// Bkz. docs/moduller/24-yerlesim-modul-yuzeyleri.md §3
export type OrgTab = "home" | "flow" | "departments" | "products" | "budget" | "files" | (string & {});

export const CORE_ORG_TABS = ["home", "flow", "departments", "products", "budget", "files"];

// Anasayfa, organizasyonun özeti (Ürün/Hizmet + Departmanlar + Modüller) —
// varsayılan sekme budur. Departmanlar sekmesi yalnızca departman yönetimi
// (ekleme/listeleme) içindir (bkz. OrganizationDetail.tsx). Sosyal, organizasyona
// bağlı TÜM departmanların akışlarını (+ organizasyona doğrudan yapılan
// paylaşımları) tek zaman çizelgesinde toplar (bkz. FeedPanel).
const coreTabs = [
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
  /** Terfi etmiş modüller — çekirdek sekmelerin SONUNA eklenir, araya girmez. */
  moduleTabs?: { key: string; label: string; isNew?: boolean }[];
}

export default function OrgTabs({ active, onChange, style, moduleTabs = [] }: Props) {
  return (
    <TabBar
      tabs={[...coreTabs, ...moduleTabs]}
      active={active}
      onChange={(k) => onChange(k as OrgTab)}
      style={style}
    />
  );
}
