import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { Department, Organization, Task } from "@projelio/shared";
import { ORG_TYPE_LABEL } from "@projelio/shared";
import { api } from "../api/client";
import EditOrganizationModal from "../components/EditOrganizationModal";
import FilesPanel from "../components/FilesPanel";
import DepartmentsPanel, { DepartmentsPanelHandle } from "../components/DepartmentsPanel";
import ProductsPanel, { ProductsPanelHandle } from "../components/ProductsPanel";
import ModulesPanel from "../components/ModulesPanel";
import OrgBudgetPanel, { OrgBudgetPanelHandle } from "../components/OrgBudgetPanel";
import AddModuleRecordModal from "../components/AddModuleRecordModal";
import QuickFileUploadModal from "../components/QuickFileUploadModal";
import OrgTabs, { CORE_ORG_TABS, OrgTab } from "../components/OrgTabs";
import ModuleSurface from "../components/ModuleSurface";
import { useModuleTabs } from "../lib/useModuleTabs";
import ProfileCard from "../components/ProfileCard";
import FeedPanel, { FeedPanelHandle } from "../components/panels/FeedPanel";
import { useProjectFabAction } from "../lib/projectFab";
import { usePageHeader, usePageHeaderTabs } from "../lib/pageHeader";
import { useIsDesktop } from "../lib/useIsDesktop";
import { colors } from "../theme/colors";
import { IconUser, IconCalendar, IconSettings, IconLayers } from "../components/icons";

// Şirket akışında görev/tamamlanan-görev karışımı yok — organizasyon seviyesinde
// tek bir görev listesi kavramı yok (görevler departmanlara özgü, kendi Sosyal
// sekmelerinde zaten gösteriliyor). Sabit boş dizi, her render'da yeni referans
// oluşup FeedPanel'in gereksiz yeniden yüklenmesine yol açmasın diye modül
// seviyesinde tutuluyor.
const NO_TASKS: Task[] = [];

// Not: bir organizasyonun (şirket/işletme) "İşler" görünümü yoktur — iş (job) kavramı
// yalnızca serbest çalışan ve taşeron hesaplarına özgüdür. Şirket içi çalışma
// Departmanlar üzerinden yürütülür (bkz. DepartmentsPanel). Anasayfa/Sosyal/
// Departmanlar/Ürün-Hizmet/Dosyalar, JobTabs ile aynı sekme görünümünde
// gösterilir (bkz. OrgTabs). Anasayfa varsayılan sekmedir ve organizasyonun
// özetini (Ürün/Hizmet + Departmanlar + Modüller) gösterir; Departmanlar
// sekmesi ise yalnızca departman yönetimi içindir.
export default function OrganizationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const c = colors.light;
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [editing, setEditing] = useState(false);
  // Ürün/Hizmet panelinden doğrudan ürün/hizmet eklendiğinde de departman yöneticisinin
  // yetkisi çalışsın diye Ürün Yönetimi departmanının id'si burada tutulur
  // (bkz. ProductsPanel/ProductsService.assertCanManage).
  const [productDepartmentId, setProductDepartmentId] = useState<string | undefined>(undefined);
  // Anasayfadaki birleşik "+" menüsünün departman seçicileri (İşe al/Gelir-Gider
  // kayıtları, Dosya ekle) için tüm departman listesi burada tutulur.
  const [departments, setDepartments] = useState<Department[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  // Terfi etmiş modüller de sekme olabilir: geçerli sekme listesi çekirdek
  // sekmeler + o anki modül sekmeleridir (bkz. lib/moduleLayout.ts).
  const moduleTabs = useModuleTabs(id);
  const openModuleTab = moduleTabs.find((m) => m.key === tabParam);
  const activeTab: OrgTab =
    CORE_ORG_TABS.includes(tabParam ?? "") || openModuleTab ? (tabParam as OrgTab) : "home";
  const setActiveTab = (next: OrgTab) => {
    setSearchParams(next === "home" ? {} : { tab: next }, { replace: true });
  };
  const feedRef = useRef<FeedPanelHandle>(null);
  const departmentsRef = useRef<DepartmentsPanelHandle>(null);
  const productsRef = useRef<ProductsPanelHandle>(null);
  const budgetRef = useRef<OrgBudgetPanelHandle>(null);
  // "İşe al" ve "Gelir/gider ekle" aynı modalı (bkz. AddModuleRecordModal),
  // yalnızca moduleKey'i değiştirerek kullanır.
  const [addingRecordModule, setAddingRecordModule] = useState<string | null>(null);
  const [addingFile, setAddingFile] = useState(false);

  const reload = () => {
    if (!id) return;
    api.get<Organization>(`/organizations/${id}`).then(setOrganization).catch(() => setOrganization(null));
    api
      .get<Department[]>(`/organizations/${id}/departments`)
      .then((depts) => {
        setDepartments(depts);
        setProductDepartmentId(depts.find((d) => d.catalogKey === "urun_yonetimi")?.id);
      })
      .catch(() => {
        setDepartments([]);
        setProductDepartmentId(undefined);
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
  const coverRef = useRef<HTMLDivElement>(null);
  usePageHeader(organization?.name, coverRef, [organization?.name]);
  const isDesktop = useIsDesktop();
  // Kaydırılınca sabit başlığın en üst bandında da sekmeler görünsün diye
  // (bkz. ProjectDetail'deki aynı desen).
  usePageHeaderTabs(
    isDesktop ? <OrgTabs
        active={activeTab}
        onChange={setActiveTab}
        moduleTabs={moduleTabs.map((m) => ({ key: m.key, label: m.name, isNew: m.isNew }))}
        style={{ marginBottom: 0 }}
      /> : null,
    [activeTab, isDesktop]
  );

  if (!id) return null;

  return (
    <div style={{ minHeight: "100vh", background: c.background }}>
      <div
        ref={coverRef}
        style={{
          position: "relative",
          height: 270,
          background: organization?.coverImageUrl
            ? `linear-gradient(rgba(255,255,255,0.18), rgba(255,255,255,0.95)), center/cover url(${organization.coverImageUrl})`
            : `linear-gradient(135deg, ${c.primary}, ${c.primaryDark})`,
          padding: "20px 28px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
        }}
      >
        {/* Kişi kartı: serbest çalışan anasayfasıyla (Dashboard) aynı bileşen, ama burada
            ekstra yer kaplamasın diye kapak görselinin/gradientinin üstüne bindirilmiş —
            sağ üstte. */}
        <div style={{ position: "absolute", top: 76, right: 28, zIndex: 3 }}>
          <ProfileCard />
        </div>

        <div style={{ paddingRight: 64 }}>
          <h1 style={{ fontSize: 22, fontWeight: 500, color: c.textPrimary, margin: "0 0 4px" }}>
            {organization?.name ?? "…"}
          </h1>
          {organization?.description && (
            <p style={{ fontSize: 16, color: c.textSecondary, margin: "0 0 8px" }}>{organization.description}</p>
          )}
          {organization && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontSize: 15, color: c.textSecondary }}>
              <span
                style={{
                  fontSize: 12,
                  color: c.primaryDark,
                  background: `${c.primary}22`,
                  borderRadius: 20,
                  padding: "2px 9px",
                  alignSelf: "center",
                }}
              >
                {ORG_TYPE_LABEL[organization.orgType]}
              </span>
              {organization.ownerName && (
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <IconUser size={12} color={c.textSecondary} />
                  {organization.ownerName}
                </span>
              )}
              {organization.groupName && (
                <Link to={`/groups/${organization.groupId}`} style={{ display: "flex", alignItems: "center", gap: 5, color: c.textSecondary }}>
                  <IconLayers size={12} color={c.textSecondary} />
                  {organization.groupName}
                </Link>
              )}
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <IconCalendar size={12} color={c.textSecondary} />
                {new Date(organization.createdAt).toLocaleDateString("tr-TR")} kuruldu
              </span>
            </div>
          )}
        </div>

        <button
          onClick={() => setEditing(true)}
          aria-label="Organizasyonu düzenle"
          style={{
            position: "absolute",
            bottom: 16,
            right: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 48,
            height: 48,
            borderRadius: 10,
            border: `1px solid ${c.border}`,
            background: c.surface,
            boxShadow: "0 2px 8px rgba(26,31,41,0.12)",
          }}
        >
          <IconSettings size={20} color={c.textSecondary} />
        </button>
      </div>

      <div style={{ padding: "0 28px 28px" }}>
        <Link to="/organizations" style={{ fontSize: 15, color: c.textSecondary, display: "inline-block", margin: "14px 0" }}>
          ← Organizasyonlar
        </Link>

        <OrgTabs
          active={activeTab}
          onChange={setActiveTab}
          moduleTabs={moduleTabs.map((m) => ({ key: m.key, label: m.name, isNew: m.isNew }))}
        />

        {/* Terfi etmiş modül: sekmenin içeriği modülün kendisi. Departman
            bağlamı yok — organizasyon geneli açılır. */}
        {openModuleTab && id && (
          <ModuleSurface moduleKey={openModuleTab.key} moduleName={openModuleTab.name} organizationId={id} />
        )}

        {activeTab === "flow" && (
          <>
            <FlowFabRegistrar feedRef={feedRef} />
            <FeedPanel ref={feedRef} organizationId={id} tasks={NO_TASKS} />
          </>
        )}

        {activeTab === "home" && (
          <>
            <HomeAddFabRegistrar
              productsRef={productsRef}
              departmentsRef={departmentsRef}
              setAddingRecordModule={setAddingRecordModule}
              setAddingFile={setAddingFile}
            />
            <ProductsPanel
              ref={productsRef}
              organizationId={id}
              departmentId={productDepartmentId}
              useFab={false}
              showAddButton={false}
            />
            <div style={{ marginTop: 28 }}>
              <DepartmentsPanel ref={departmentsRef} organizationId={id} useFab={false} />
            </div>
            <div style={{ marginTop: 28 }}>
              <ModulesPanel organizationId={id} />
            </div>
          </>
        )}
        {activeTab === "departments" && <DepartmentsPanel organizationId={id} layout="grid" />}
        {activeTab === "products" && <ProductsPanel organizationId={id} departmentId={productDepartmentId} />}
        {activeTab === "budget" && (
          <>
            <BudgetFabRegistrar budgetRef={budgetRef} />
            <OrgBudgetPanel ref={budgetRef} organizationId={id} />
          </>
        )}
        {activeTab === "files" && <FilesPanel organizationId={id} />}
      </div>

      {editing && organization && (
        <EditOrganizationModal
          organization={organization}
          onClose={() => setEditing(false)}
          onSaved={reload}
          onDeleted={() => navigate("/organizations")}
          onArchived={() => navigate("/organizations")}
        />
      )}

      {addingRecordModule && (
        <AddModuleRecordModal
          organizationId={id}
          moduleKey={addingRecordModule}
          departments={departments}
          onClose={() => setAddingRecordModule(null)}
          onSaved={() => setAddingRecordModule(null)}
        />
      )}

      {addingFile && (
        <QuickFileUploadModal
          departments={departments}
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
  // feedRef nesnesinin kendisi her render'da aynı kalır (useRef), bu yüzden
  // efekt yalnızca mount/unmount'ta çalışır; onClick içindeki feedRef.current
  // her tıklamada güncel değeri okur.
  useProjectFabAction({ label: "Yeni paylaşım", onClick: () => feedRef.current?.openCreate() }, [feedRef]);
  return null;
}

// Bütçe sekmesindeki "+" düğmesi de Anasayfa'daki gibi birden fazla seçenek
// sunar: gelir/gider/alacak/borç dört ayrı hızlı ekleme kısayolu (bkz.
// OrgBudgetPanel.openQuickAdd).
function BudgetFabRegistrar({ budgetRef }: { budgetRef: React.RefObject<OrgBudgetPanelHandle | null> }) {
  useProjectFabAction(
    {
      label: "Kayıt ekle",
      options: [
        { label: "Gelir ekle", onClick: () => budgetRef.current?.openQuickAdd("income") },
        { label: "Gider ekle", onClick: () => budgetRef.current?.openQuickAdd("expense") },
        { label: "Alacak ekle", onClick: () => budgetRef.current?.openQuickAdd("receivable") },
        { label: "Borç ekle", onClick: () => budgetRef.current?.openQuickAdd("payable") },
      ],
    },
    [budgetRef]
  );
  return null;
}

// Anasayfa sekmesindeki tek "+" düğmesi, sık kullanılan beş ekleme eylemini
// birden temsil eder — tıklanınca job-choice ile aynı küçük seçim menüsü
// (butonun üstüne doğru açılan liste) çıkar (bkz. BottomNav/ProjectFabAction.options).
// Modül ekleme burada YOK: o, her departmanın kendi sayfasından yapılır (bkz.
// ModulesPanel'deki not) — bu menü yalnızca en sık tekrarlanan günlük eylemler
// için bir kısayoldur.
function HomeAddFabRegistrar({
  productsRef,
  departmentsRef,
  setAddingRecordModule,
  setAddingFile,
}: {
  productsRef: React.RefObject<ProductsPanelHandle | null>;
  departmentsRef: React.RefObject<DepartmentsPanelHandle | null>;
  setAddingRecordModule: (value: string | null) => void;
  setAddingFile: (value: boolean) => void;
}) {
  useProjectFabAction(
    {
      label: "Ekle",
      options: [
        { label: "Ürün ekle", onClick: () => productsRef.current?.openAdd() },
        { label: "İşe al", onClick: () => setAddingRecordModule("ik_ise_alim_oryantasyon") },
        { label: "Gelir/gider ekle", onClick: () => setAddingRecordModule("fm_gelir_gider") },
        { label: "Departman kur", onClick: () => departmentsRef.current?.openAdd() },
        { label: "Dosya ekle", onClick: () => setAddingFile(true) },
      ],
    },
    [productsRef, departmentsRef, setAddingRecordModule, setAddingFile]
  );
  return null;
}
