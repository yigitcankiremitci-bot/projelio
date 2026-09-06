import type { OrganizationAccess } from "@projelio/shared";
import { ENTITY_TAB_KEYS } from "@projelio/shared";
import TabBar from "./TabBar";

// Terfi etmiş modüller de bu çubuğa girdiği için tip string'e açıldı: sabit
// sekme anahtarları + modül katalog anahtarları.
// Bkz. docs/moduller/24-yerlesim-modul-yuzeyleri.md §3
export type OrgTab = "home" | "flow" | "departments" | "tasks" | "products" | "budget" | "files" | (string & {});

// Çekirdek sekme anahtarları ortak listeden gelir (bkz. shared ENTITY_TAB_KEYS):
// ayarlar ekranındaki "kapatılabilir sekmeler" ile buradaki çubuk aynı kümeden
// beslensin, biri değişip diğeri unutulmasın.
export const CORE_ORG_TABS = ENTITY_TAB_KEYS.organization;

// Anasayfa, organizasyonun özeti (Ürün/Hizmet + Departmanlar + Modüller) —
// varsayılan sekme budur. Departmanlar sekmesi yalnızca departman yönetimi
// (ekleme/listeleme) içindir (bkz. OrganizationDetail.tsx). Sosyal, organizasyona
// bağlı TÜM departmanların akışlarını (+ organizasyona doğrudan yapılan
// paylaşımları) tek zaman çizelgesinde toplar (bkz. FeedPanel).
export const ORG_TABS = [
  { key: "home", label: "Anasayfa" },
  { key: "flow", label: "Sosyal" },
  { key: "departments", label: "Departmanlar" },
  // Departmanlarda dağınık duran görevlerin tek panosu (bkz. OrgTasksPanel).
  { key: "tasks", label: "Görevler" },
  { key: "products", label: "Ürün/Hizmet" },
  // Etiket "Kasa": sayfa bir plan değil, gerçekleşen gelir/gider defteri
  // (bkz. Dashboard.tsx'teki aynı gerekçe). Anahtar "budget" KALDI —
  // adresler (?tab=budget), kayıtlı hedefler ve tur çapaları ona bağlı.
  { key: "budget", label: "Kasa" },
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
  /** Sahibinin ayarlardan kapattığı sekmeler (Organization.hiddenTabs). */
  hiddenTabs?: string[];
}

/**
 * Görünen çekirdek sekmeler: önce YETKİ (sunucu ne diyorsa), sonra SAHİBİN
 * TERCİHİ (organizasyon ayarlarından kapattıkları, bkz. Organization.hiddenTabs).
 *
 * Sıra önemli: kapatma tercihi bir yetki değil, yalnızca sadeleştirmedir —
 * yetkisi olmayan birine sekmeyi açamaz.
 */
export function visibleOrgTabs(access?: OrganizationAccess, hiddenTabs?: string[]) {
  const hidden = new Set(hiddenTabs ?? []);
  return ORG_TABS.filter((t) => {
    if (hidden.has(t.key)) return false;
    if (t.key === "budget") return access?.canViewBudget === true;
    if (t.key === "products") return access?.canViewCommercial !== false;
    return true;
  });
}

export default function OrgTabs({ active, onChange, style, moduleTabs = [], scrollable, access, hiddenTabs }: Props) {
  return (
    <TabBar
      tabs={[...visibleOrgTabs(access, hiddenTabs), ...moduleTabs]}
      active={active}
      onChange={(k) => onChange(k as OrgTab)}
      style={style}
      scrollable={scrollable}
    />
  );
}
