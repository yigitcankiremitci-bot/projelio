import type { OrganizationAccess } from "@projelio/shared";
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

/**
 * Sekme görünürlüğü artık ÇIKARIMLA değil, sunucunun söylediğiyle belirlenir:
 * GET /organizations/:id yanıtındaki viewerAccess (bkz. shared OrganizationAccess).
 *
 * Önceki sürüm departman listesinden çıkarım yapıyordu ve liste boş geldiğinde
 * (ör. hiçbir departmana bağlı olmayan, yalnızca bir işe alınmış taşeron)
 * "kısıt yok" varsayıp Bütçe sekmesini açık bırakıyordu.
 *
 * access henüz gelmediyse sekmeler gizli tutulur: yetkisiz kullanıcıya bir an
 * bile bütçe sekmesi göstermektense, yetkili kullanıcıda sekmenin bir kare geç
 * belirmesi yeğdir.
 */
export function canViewOrgBudget(access?: OrganizationAccess): boolean {
  return access?.canViewBudget === true;
}

interface Props {
  active: OrgTab;
  onChange: (tab: OrgTab) => void;
  // Sabit başlığın üst bandındaki küçültülmüş kopya (bkz. OrganizationDetail
  // usePageHeaderTabs) marginBottom'u kaldırmak için kullanır.
  style?: React.CSSProperties;
  /** Terfi etmiş modüller — çekirdek sekmelerin SONUNA eklenir, araya girmez. */
  moduleTabs?: { key: string; label: string; isNew?: boolean }[];
  /** Tek satır + yana kaydırma (bkz. TabBar): sabit şeritteki kopya kullanır. */
  scrollable?: boolean;
  /** Sunucudan gelen görünürlük (Organization.viewerAccess). */
  access?: OrganizationAccess;
}

export function visibleOrgTabs(access?: OrganizationAccess) {
  return coreTabs.filter((t) => {
    if (t.key === "budget") return access?.canViewBudget === true;
    if (t.key === "products") return access?.canViewCommercial !== false;
    return true;
  });
}

export default function OrgTabs({ active, onChange, style, moduleTabs = [], scrollable, access }: Props) {
  return (
    <TabBar
      tabs={[...visibleOrgTabs(access), ...moduleTabs]}
      active={active}
      onChange={(k) => onChange(k as OrgTab)}
      style={style}
      scrollable={scrollable}
    />
  );
}
