import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { Department, ModuleCatalogEntry, Organization, Task } from "@projelio/shared";
import { api } from "../api/client";
import { useLiveRoom } from "../lib/liveRoom";
import EditOrganizationModal from "../components/EditOrganizationModal";
import FilesPanel from "../components/FilesPanel";
import DepartmentsPanel, { DepartmentsPanelHandle } from "../components/DepartmentsPanel";
import OrgTasksPanel from "../components/OrgTasksPanel";
import ProductsPanel, { ProductsPanelHandle } from "../components/ProductsPanel";
import ModulesPanel, { ModulesPanelHandle } from "../components/ModulesPanel";
import SirketEkibiPanel, { SirketEkibiPanelHandle } from "../components/iseAlim/SirketEkibiPanel";
import OrgBudgetPanel, { OrgBudgetPanelHandle } from "../components/OrgBudgetPanel";
import QuickFileUploadModal from "../components/QuickFileUploadModal";
import BilgiKartiModal from "../components/bilgiKarti/BilgiKartiModal";
import { CORE_ORG_TABS, ORG_TABS, OrgTab, visibleOrgTabs } from "../components/OrgTabs";
import ModuleSurface from "../components/ModuleSurface";
import { useModuleTabs } from "../lib/useModuleTabs";
import { modulDepartmani } from "../lib/modulYeri";
import { coverActionButton } from "../components/EntityCover";
import FeedPanel, { FeedPanelHandle } from "../components/panels/FeedPanel";
import { useProjectFabAction } from "../lib/projectFab";
import { usePageHeader } from "../lib/pageHeader";
import { useBackTarget, useGezintiAdi } from "../lib/backTarget";
import { useIsDesktop } from "../lib/useIsDesktop";
import { useThemeColors } from "../theme/useThemeColors";
import { pageGutter } from "../lib/layout";
import { IconSettings, IconIdCard } from "../components/icons";
import { useT } from "../lib/i18n";
import { departmanAdi } from "../lib/departmanAdi";
import AnasayfaBaslik, { GeriDugmesi } from "../components/anasayfa/AnasayfaBaslik";
import AnasayfaPanosu, { OfisKapisi } from "../components/anasayfa/AnasayfaPanosu";
import GorunumSecici from "../components/anasayfa/GorunumSecici";
import { SIRKET_VARSAYILAN_PANO, useSirketKatalogu } from "../components/anasayfa/ozetKartlari";
import { useAnasayfaPano } from "../lib/useAnasayfaPano";

// Eskiden anasayfada alt alta duran bölümler artık özet kartı; her birinin tam
// görünümü kendi adresinde. Sahibinin kapatabildiği sekmelerden (ENTITY_TAB_KEYS)
// ayrı tutuluyor: bunlar hiçbir zaman "kapatılabilir sekme" olmadı.
const PANO_GORUNUMLERI = ["departments", "team", "modules"];
const GORUNUM_ADLARI: Record<string, string> = {
  departments: "Departmanlar", // dil:anahtar
  team: "Ekip", // dil:anahtar
  modules: "Modüller", // dil:anahtar
};
type EklemeHedefi = "products" | "team" | "departments" | "modules";

// Şirket AKIŞINDA görev/tamamlanan-görev karışımı yok: paylaşımlar ile görevler
// ayrı şeyler ve akışın altına görev listesi asmak ikisini karıştırıyordu.
// Görevler kendi sekmesinde duruyor (bkz. "tasks" / OrgTasksPanel). Sabit boş
// dizi, her render'da yeni referans oluşup FeedPanel'in gereksiz yeniden
// yüklenmesine yol açmasın diye modül seviyesinde tutuluyor.
const NO_TASKS: Task[] = [];

// Not: bir organizasyonun (şirket/işletme) "İşler" görünümü yoktur — iş (job) kavramı
// yalnızca serbest çalışan ve taşeron hesaplarına özgüdür. Şirket içi çalışma
// Departmanlar üzerinden yürütülür (bkz. DepartmentsPanel). Sayfanın açılış
// görünümü kişinin kendi dizdiği özet panosudur; kartlar Sosyal, Görevler, Kasa
// gibi tam görünümleri (?tab=) açar.
export default function OrganizationDetail() {
  const { id } = useParams();
  // Aynı sayfadaki kullanıcılar: canlı tazeleme + "kim burada" (bkz. lib/liveRoom.ts).
  useLiveRoom(id ? `organization:${id}` : null);
  const navigate = useNavigate();
  const c = useThemeColors();
  const t = useT();
  const isDesktop = useIsDesktop();
  const gutter = pageGutter(isDesktop);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [editing, setEditing] = useState(false);
  // Şirket bilgi kartı (künye + belgeler + özet). Kapakta kendi düğmesi var:
  // aranan bilgi çoğu zaman başka bir işin ortasında lazım oluyor ve sekme
  // arkasına saklanınca hiç açılmıyordu (bkz. BilgiKartiModal).
  const [bilgiKarti, setBilgiKarti] = useState(false);
  // Ürün/Hizmet panelinden doğrudan ürün/hizmet eklendiğinde de departman yöneticisinin
  // yetkisi çalışsın diye Ürün Yönetimi departmanının id'si burada tutulur
  // (bkz. ProductsPanel/ProductsService.assertCanManage).
  const [productDepartmentId, setProductDepartmentId] = useState<string | undefined>(undefined);
  // Anasayfadaki birleşik "+" menüsünün departman seçicisi (Dosya ekle) ve
  // modül sekmelerinin departman kapsamı için tüm departman listesi burada tutulur.
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmanlarHazir, setDepartmanlarHazir] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  // Shopify bağlantısından dönüş: sonuç şirket ayarlarındaki Shopify kartında
  // gösteriliyor, o yüzden ayarlar penceresi kendiliğinden açılır.
  useEffect(() => {
    if (searchParams.get("shopify")) setEditing(true);
  }, []);
  // Terfi etmiş modüller de sekme olabilir: geçerli sekme listesi çekirdek
  // sekmeler + o anki modül sekmeleridir (bkz. lib/moduleLayout.ts).
  const moduleTabs = useModuleTabs(id);
  const openModuleTab = moduleTabs.find((m) => m.key === tabParam);
  // Modül bir departmana aittir: sekmede de o departmanın kapsamıyla açılmalı,
  // yoksa buraya girilen kayıtlar departman sayfasında görünmez (ve tersi).
  const [moduleCatalog, setModuleCatalog] = useState<ModuleCatalogEntry[]>([]);
  useEffect(() => {
    api.get<ModuleCatalogEntry[]>("/module-catalog").then(setModuleCatalog).catch(() => setModuleCatalog([]));
  }, []);
  // Departmanı açılmamış modülün evi Yönetim (bkz. lib/modulYeri.ts).
  const openModuleDepartmentId = (() => {
    const entry = moduleCatalog.find((e) => e.key === openModuleTab?.key);
    return entry ? modulDepartmani(entry, departments) : undefined;
  })();
  // Bütçe sekmesi yalnızca finansal görünürlüğü olanlara açık (bkz. canViewOrgBudget);
  // yetkisi olmayan ?tab=budget ile gelse bile Anasayfa'ya düşer.
  // Sekme yetkileri sunucudan gelir (bkz. OrganizationAccess); istemci çıkarım yapmaz.
  const access = organization?.viewerAccess;
  // Sahibinin ayarlardan kapattığı sekmeler de daraltır (bkz. Organization.hiddenTabs).
  const hiddenTabs = organization?.hiddenTabs;
  const openCoreTabs = visibleOrgTabs(access, hiddenTabs).map((t) => t.key);
  const requestedTab: OrgTab =
    CORE_ORG_TABS.includes(tabParam ?? "") || PANO_GORUNUMLERI.includes(tabParam ?? "") || openModuleTab
      ? (tabParam as OrgTab)
      : "home";
  // Kapalı bir çekirdek sekme istendiyse Anasayfa'ya düş (modül sekmeleri kendi
  // yetkisini sunucuda kontrol eder).
  const activeTab: OrgTab =
    CORE_ORG_TABS.includes(requestedTab) && !openCoreTabs.includes(requestedTab) ? "home" : requestedTab;
  // Yeni kayıt olarak yazılır: tam görünümden tarayıcının geri tuşu panoya dönsün.
  const setActiveTab = (next: OrgTab) => {
    setSearchParams(next === "home" ? {} : { tab: next });
  };
  const feedRef = useRef<FeedPanelHandle>(null);
  const departmentsRef = useRef<DepartmentsPanelHandle>(null);
  const modulesRef = useRef<ModulesPanelHandle>(null);
  const productsRef = useRef<ProductsPanelHandle>(null);
  const budgetRef = useRef<OrgBudgetPanelHandle>(null);
  const ekipRef = useRef<SirketEkibiPanelHandle>(null);
  const [addingFile, setAddingFile] = useState(false);
  // "+" menüsünden seçilen ekleme, ilgili panel kurulduğunda açılır: paneller
  // artık anasayfada değil kendi görünümünde yaşıyor, ref ancak geçişten sonra dolu.
  const [bekleyenEkleme, setBekleyenEkleme] = useState<EklemeHedefi | null>(null);
  useEffect(() => {
    if (!bekleyenEkleme || activeTab !== bekleyenEkleme) return;
    if (bekleyenEkleme === "products") productsRef.current?.openAdd();
    if (bekleyenEkleme === "team") ekipRef.current?.openHire();
    if (bekleyenEkleme === "departments") departmentsRef.current?.openAdd();
    if (bekleyenEkleme === "modules") modulesRef.current?.openAdd();
    setBekleyenEkleme(null);
  }, [bekleyenEkleme, activeTab]);
  const eklemeyiAc = (hedef: EklemeHedefi) => {
    setBekleyenEkleme(hedef);
    setActiveTab(hedef);
  };

  const katalog = useSirketKatalogu({
    organizationId: id ?? "",
    access,
    hiddenTabs,
    departmanlar: departments,
    departmanlarHazir,
    modulKatalogu: moduleCatalog,
  });
  const pano = useAnasayfaPano(id ?? "me", SIRKET_VARSAYILAN_PANO);

  const reload = () => {
    if (!id) return;
    api.get<Organization>(`/organizations/${id}`).then(setOrganization).catch(() => setOrganization(null));
    api
      .get<Department[]>(`/organizations/${id}/departments`)
      .then((depts) => {
        setDepartments(depts);
        setProductDepartmentId(depts.find((d) => d.catalogKey === "urun_yonetimi")?.id);
        setDepartmanlarHazir(true);
      })
      .catch(() => {
        setDepartments([]);
        setProductDepartmentId(undefined);
        setDepartmanlarHazir(true);
      });
  };

  useEffect(reload, [id]);

  useEffect(() => {
    if (organization?.name) document.title = `${organization.name} · Projelio`;
    return () => {
      document.title = "Projelio";
    };
  }, [organization?.name]);

  // Kaydırınca tepede beliren sabit başlık için (bkz. App.tsx / lib/pageHeader).
  const headerRef = useRef<HTMLDivElement>(null);
  // Geri, şirkete hangi sayfadan girildiyse oraya döner (bkz. lib/backTarget).
  const back = useBackTarget({ to: "/organizations", label: t("Organizasyonlar") });
  // Buradan açılan modülün geri bağlantısı bu sayfaya dönebilsin.
  useGezintiAdi(organization?.name);

  const anasayfada = activeTab === "home";
  const panoyaDon = { to: id ? `/organizations/${id}` : "/", label: t("Ana Sayfa") };
  const gorunumAdi =
    openModuleTab?.name ??
    (GORUNUM_ADLARI[activeTab] ? t(GORUNUM_ADLARI[activeTab]) : t(ORG_TABS.find((s) => s.key === activeTab)?.label ?? ""));
  const baslik = anasayfada ? (organization?.name ?? "…") : gorunumAdi;
  const geriHedefi = anasayfada ? back : panoyaDon;
  // sourceRef bilerek verilmiyor: geri düğmesi en üst bantta doğuyor ve yüzen hap
  // "kaynak çizgiyi geçti" sayıp sayfa kaydırılmadan açılıyordu; kaynak yokken
  // hap şeritle birlikte, ancak başlık yukarı kayınca belirir.
  usePageHeader(baslik, headerRef, [baslik, geriHedefi.to, geriHedefi.label, anasayfada && back.geriGit], geriHedefi);

  if (!id) return null;

  return (
    <div style={{ minHeight: "100vh", background: c.background }}>
      <AnasayfaBaslik
        baslik={baslik}
        baslikRef={headerRef}
        geri={
          anasayfada ? undefined : (
            <GeriDugmesi to={geriHedefi.to} etiket={geriHedefi.label} />
          )
        }
        secici={anasayfada && id ? <GorunumSecici aktif={id} /> : undefined}
        araclar={
          anasayfada ? (
            <>
              {access?.canViewCommercial !== false && (
                // Taşerona gösterilmiyor: sunucu kartı zaten reddediyor (bkz.
                // bilgiKartiYetkisiKarari); canViewCommercial bu ayrımı taşıyor.
                <button onClick={() => setBilgiKarti(true)} aria-label={t("Şirket bilgi kartı")} title={t("Şirket bilgi kartı")} style={coverActionButton(c)}>
                  <IconIdCard size={18} color={c.textSecondary} />
                </button>
              )}
              <button onClick={() => setEditing(true)} aria-label={t("Organizasyonu düzenle")} title={t("Organizasyonu düzenle")} style={coverActionButton(c)}>
                <IconSettings size={18} color={c.textSecondary} />
              </button>
              {id && <OfisKapisi hedef={`/yeni?ofis=${encodeURIComponent(id)}`} />}
            </>
          ) : undefined
        }
      />

      {anasayfada && (
        <>
          <HomeAddFabRegistrar
            urunEklenebilir={access?.canViewCommercial !== false}
            eklemeyiAc={eklemeyiAc}
            setAddingFile={setAddingFile}
            onGelirGider={() => setActiveTab("budget")}
          />
          <AnasayfaPanosu pano={pano} katalog={katalog} />
        </>
      )}

      <div style={{ padding: anasayfada ? 0 : `0 ${gutter}px 28px` }}>
        {/* Terfi etmiş modül: sekmenin içeriği modülün kendisi; modülün ait
            olduğu departmanın kapsamıyla açılır (departman sayfasıyla aynı veri). */}
        {openModuleTab && id && (
          <ModuleSurface
            moduleKey={openModuleTab.key}
            moduleName={openModuleTab.name}
            organizationId={id}
            departmentId={openModuleDepartmentId}
          />
        )}

        {activeTab === "flow" && (
          <>
            <FlowFabRegistrar feedRef={feedRef} />
            <FeedPanel ref={feedRef} organizationId={id} tasks={NO_TASKS} />
          </>
        )}

        {activeTab === "departments" && <DepartmentsPanel ref={departmentsRef} organizationId={id} layout="grid" />}
        {activeTab === "team" && (
          <>
            <TekFabRegistrar label={t("İşe al")} onClick={() => ekipRef.current?.openHire()} />
            <SirketEkibiPanel ref={ekipRef} organizationId={id} />
          </>
        )}
        {activeTab === "modules" && (
          <>
            <TekFabRegistrar label={t("Modül ekle")} onClick={() => modulesRef.current?.openAdd()} />
            <ModulesPanel ref={modulesRef} organizationId={id} />
          </>
        )}
        {activeTab === "tasks" && <OrgTasksPanel organizationId={id} organizationName={organization?.name} />}
        {/* Sekme zaten gizli; ?tab= ile zorlansa da panel açılmasın (sunucu 403 döner). */}
        {activeTab === "products" && access?.canViewCommercial !== false && (
          <ProductsPanel ref={productsRef} organizationId={id} departmentId={productDepartmentId} layout="grid" />
        )}
        {activeTab === "budget" && access?.canViewBudget === true && (
          <>
            <BudgetFabRegistrar budgetRef={budgetRef} />
            <OrgBudgetPanel ref={budgetRef} organizationId={id} />
          </>
        )}
        {activeTab === "files" && <FilesPanel organizationId={id} />}
      </div>

      {bilgiKarti && <BilgiKartiModal scopeType="organization" scopeId={id} onClose={() => setBilgiKarti(false)} />}

      {editing && organization && (
        <EditOrganizationModal
          organization={organization}
          onClose={() => setEditing(false)}
          onSaved={reload}
          onDeleted={() => navigate("/organizations")}
          onArchived={() => navigate("/organizations")}
        />
      )}

      {addingFile && (
        <QuickFileUploadModal
          targets={departments.map((d) => ({ id: d.id, label: departmanAdi(d.name, t), target: { departmentId: d.id } }))}
          pickerLabel={t("Departman")}
          emptyMessage={t("Dosya yükleyebilmek için önce en az bir departman kurman gerekiyor.")}
          onClose={() => setAddingFile(false)}
          onUploaded={() => setAddingFile(false)}
        />
      )}
    </div>
  );
}

// Hook'u koşullu çağırmak yerine onu çağıran bileşeni koşullu render etmek
// gerekir (bkz. ProductsPanel.ProductsFabRegistrar) — aksi halde bu bileşenin
// üst öğesi olan OrganizationDetail'ın kendi efekti, çocuk panellerin (bkz.
// DepartmentsPanel/ProductsPanel) az önce kaydettiği "+" eylemini her render'da
// null ile ezerdi (efektler çocuktan ebeveyne doğru çalışır) — anasayfadaki
// "+" düğmesinin kaybolmasının sebebi buydu.
function FlowFabRegistrar({ feedRef }: { feedRef: React.RefObject<FeedPanelHandle | null> }) {
  const t = useT();
  // feedRef nesnesinin kendisi her render'da aynı kalır (useRef), bu yüzden
  // efekt yalnızca mount/unmount'ta çalışır; onClick içindeki feedRef.current
  // her tıklamada güncel değeri okur.
  useProjectFabAction({ label: t("Yeni paylaşım"), onClick: () => feedRef.current?.openCreate() }, [feedRef]);
  return null;
}

// Bütçe sekmesindeki "+" düğmesi de Anasayfa'daki gibi birden fazla seçenek
// sunar: gelir/gider/alacak/borç dört ayrı hızlı ekleme kısayolu (bkz.
// OrgBudgetPanel.openQuickAdd).
function BudgetFabRegistrar({ budgetRef }: { budgetRef: React.RefObject<OrgBudgetPanelHandle | null> }) {
  const t = useT();
  useProjectFabAction(
    {
      label: t("Kayıt ekle"),
      options: [
        { label: t("Gelir ekle"), onClick: () => budgetRef.current?.openQuickAdd("income") },
        { label: t("Gider ekle"), onClick: () => budgetRef.current?.openQuickAdd("expense") },
        { label: t("Alacak ekle"), onClick: () => budgetRef.current?.openQuickAdd("receivable") },
        { label: t("Borç ekle"), onClick: () => budgetRef.current?.openQuickAdd("payable") },
      ],
    },
    [budgetRef]
  );
  return null;
}

// Tam görünümlerde tek eylemli "+" (paneller kendi FAB'ını kaydetmiyor). Hook
// neden ayrı bileşende: bkz. yukarıdaki FlowFabRegistrar notu.
function TekFabRegistrar({ label, onClick }: { label: string; onClick: () => void }) {
  useProjectFabAction({ label, onClick }, [label]);
  return null;
}

// Anasayfadaki tek "+" düğmesi, sık kullanılan ekleme eylemlerini birden temsil
// eder — tıklanınca job-choice ile aynı küçük seçim menüsü (butonun üstüne doğru
// açılan liste) çıkar (bkz. BottomNav/ProjectFabAction.options). Paneller artık
// kendi görünümlerinde; seçim ilgili görünümü açıp formu orada başlatır.
function HomeAddFabRegistrar({
  urunEklenebilir,
  eklemeyiAc,
  setAddingFile,
  onGelirGider,
}: {
  urunEklenebilir: boolean;
  eklemeyiAc: (hedef: EklemeHedefi) => void;
  setAddingFile: (value: boolean) => void;
  onGelirGider: () => void;
}) {
  const t = useT();
  const eklemeyiAcRef = useRef(eklemeyiAc);
  eklemeyiAcRef.current = eklemeyiAc;
  const onGelirGiderRef = useRef(onGelirGider);
  onGelirGiderRef.current = onGelirGider;
  useProjectFabAction(
    {
      label: t("Ekle"),
      options: [
        ...(urunEklenebilir ? [{ label: t("Ürün ekle"), onClick: () => eklemeyiAcRef.current("products") }] : []),
        // Kişiyi gerçekten şirkete alır: davet + departman/modül seçimi
        // (bkz. SirketEkibiPanel). Eskiden yalnızca İK modülüne kayıt açıyordu.
        { label: t("İşe al"), onClick: () => eklemeyiAcRef.current("team") },
        // Gelir/gider artık bir modül kaydı değil, defterin kendisi: kısayol
        // Kasa görünümüne götürüyor (bkz. migration 104, tek defter kararı).
        { label: t("Gelir/gider ekle"), onClick: () => onGelirGiderRef.current() },
        { label: t("Departman ekle"), onClick: () => eklemeyiAcRef.current("departments") },
        { label: t("Modül ekle"), onClick: () => eklemeyiAcRef.current("modules") },
        { label: t("Dosya ekle"), onClick: () => setAddingFile(true) },
      ],
    },
    [urunEklenebilir, setAddingFile]
  );
  return null;
}
