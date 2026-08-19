import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import type { Job, Organization, Group, Project, User } from "@projelio/shared";
import { api } from "../api/client";
import JobCard from "../components/JobCard";
import { colors } from "../theme/colors";
import { useSortableList } from "../lib/useSortableList";
import { useRefreshOnUndo, useReorderUndo, useWithoutPendingDeletes } from "../lib/undo";
import { useIsDesktop } from "../lib/useIsDesktop";
import { useNavVisibility } from "../lib/useNavVisibility";
import { onJobInvitesChanged } from "../lib/jobInvites";
import { IconBuilding, IconLayers, IconChevronRight, IconFolder, IconActivity, IconFile, IconSparkle } from "../components/icons";
import ProfileCard from "../components/ProfileCard";
import { usePageHeader, usePageHeaderTabs } from "../lib/pageHeader";
import BudgetPanel from "../components/BudgetPanel";
import AllFilesPanel from "../components/AllFilesPanel";
import DashboardModulesPanel from "../components/DashboardModulesPanel";
import DashboardAssignedModules from "../components/DashboardAssignedModules";
import ModuleSurface from "../components/ModuleSurface";
import { useModuleTabs } from "../lib/useModuleTabs";
import { tourAnchor } from "../lib/tour/types";

// Sabit sekmeler + (varsa) terfi etmiş modül sekmeleri. Modül sekmeleri
// "Modüller"in soluna girer: kullanıcı en sık kullandığı modülü çekirdek
// sekmelerin hemen yanında bulur, katalog en sağda kalır.
// Bkz. docs/moduller/24-yerlesim-modul-yuzeyleri.md §3
type DashboardTab = "jobs" | "budget" | "files" | "modules" | (string & {});

const coreTabs: { key: DashboardTab; label: string; icon: typeof IconFolder }[] = [
  { key: "jobs", label: "İşler", icon: IconFolder },
  { key: "budget", label: "Bütçe", icon: IconActivity },
  { key: "files", label: "Dosyalar", icon: IconFile },
];

const catalogTab = { key: "modules" as DashboardTab, label: "Modüller", icon: IconSparkle };

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
  gap: 14,
};

/** İş ızgaralarının üstündeki küçük bölüm başlığı: ad + adet + tek satırlık açıklama. */
function SectionHeading({
  title,
  hint,
  count,
  style,
}: {
  title: string;
  hint: string;
  count: number;
  style?: React.CSSProperties;
}) {
  const c = colors.light;
  return (
    <div style={{ marginBottom: 12, ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: c.textPrimary }}>{title}</h2>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: c.textSecondary,
            background: c.surface,
            border: `1px solid ${c.border}`,
            borderRadius: 999,
            padding: "1px 8px",
          }}
        >
          {count}
        </span>
      </div>
      <p style={{ margin: "3px 0 0", fontSize: 13, color: c.textSecondary }}>{hint}</p>
    </div>
  );
}

export default function Dashboard() {
  // Anasayfa yalnızca serbest çalışan (ve henüz kadroya bağlanmamış çalışan/taşeron)
  // içindir — "İşlerim" mantığı buna göredir. Bir şirket/işletme/holding sahibi giriş
  // yaptığında burada değil, kurduğu yapının Departmanlar görünümünde olmalı
  // (Doküman 1: "Mevcut Projelio yapısı Serbest Çalışan tipi için uygundur").
  // undefined = henüz belirlenmedi (yüklemede), null = yönlendirme yok, string = hedef yol.
  const [redirectTo, setRedirectTo] = useState<string | null | undefined>(undefined);
  // İşleri "kendi kurduğum" ve "ekibine dahil olduğum" diye ayırabilmek için
  // gereken tek bilgi: giriş yapan kullanıcının id'si (bkz. Job.ownerId).
  const [myUserId, setMyUserId] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<User>("/auth/me")
      .then(async (me) => {
        setMyUserId(me.id);
        if (me.accountType === "organization_owner") {
          const orgs = await api.get<Organization[]>("/organizations").catch(() => []);
          setRedirectTo(orgs[0] ? `/organizations/${orgs[0].id}` : null);
        } else if (me.accountType === "group_owner") {
          const groups = await api.get<Group[]>("/groups").catch(() => []);
          setRedirectTo(groups[0] ? `/groups/${groups[0].id}` : null);
        } else {
          setRedirectTo(null);
        }
      })
      .catch(() => setRedirectTo(null));
  }, []);

  // Sekme, URL'deki ?tab= ile eşleşir: sidebar'dan doğrudan "/?tab=budget" ya da
  // "/?tab=files" gibi bir bağlantıyla gelindiğinde ilgili sekme açık başlasın diye.
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  // Terfi etmiş modüller: puanlama ve slot sayısı useModuleTabs içinde
  // (bkz. lib/moduleLayout.ts). Serbest çalışan bağlamı — organizasyon yok.
  const moduleTabs = useModuleTabs();
  const openModuleTab = moduleTabs.find((m) => m.key === tabParam);
  const tab: DashboardTab =
    tabParam === "budget" || tabParam === "files" || tabParam === "modules" || openModuleTab
      ? (tabParam as DashboardTab)
      : "jobs";
  const setTab = (next: DashboardTab) => {
    setSearchParams(next === "jobs" ? {} : { tab: next }, { replace: true });
  };
  const tabs: { key: DashboardTab; label: string; icon: typeof IconFolder; isNew?: boolean }[] = [
    ...coreTabs,
    ...moduleTabs.map((m) => ({ key: m.key, label: m.name, icon: IconSparkle, isNew: m.isNew })),
    catalogTab,
  ];
  const [jobs, setJobs] = useState<Job[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const c = colors.light;
  const gridRef = useRef<HTMLDivElement>(null);
  const joinedGridRef = useRef<HTMLDivElement>(null);
  // Sabit şeridin ölçtüğü öğeler (bkz. lib/pageHeader): başlık satırı "kapak"
  // yerine geçer, sekme çubuğunun kopyası ise ancak aslı ekrandan çıkınca belirir.
  const headerRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  // Masaüstünde sol sidebar'da zaten Organizasyonlar/Gruplar linkleri var;
  // bu kısayol satırı sadece sidebar'ın kaybolduğu mobil görünümde gösterilir.
  const isDesktop = useIsDesktop();
  // Kısayollar da nav ile aynı kuralı izler: yalnızca erişilebilir en az bir
  // organizasyon/grup varsa gösterilir.
  const { showOrganizations, showGroups } = useNavVisibility();
  const registerReorderUndo = useReorderUndo();

  const reloadJobs = () => {
    api.get<Job[]>("/jobs").then(setJobs).catch(() => setJobs([]));
  };

  const reloadAll = () => {
    reloadJobs();
    api.get<Project[]>("/projects").then(setProjects).catch(() => setProjects([]));
  };

  useEffect(reloadAll, []);
  // Geri/ileri alma sunucu durumunu değiştirir (ör. silinen iş geri gelir);
  // liste kendini tazelemeli, yoksa ancak sayfa yenilenince görünür.
  useRefreshOnUndo(reloadAll);
  // Bir iş daveti kabul edilince (bildirim çanından ya da iş sayfasından) o iş
  // "Katıldıklarım" ızgarasına anında düşsün — kullanıcı sayfayı yenilemek
  // zorunda kalmasın.
  useEffect(() => onJobInvitesChanged(reloadJobs), []);

  // /jobs hem kullanıcının sahibi olduğu işleri hem de bir projesine ekip üyesi
  // olarak eklendiği işleri döner (bkz. jobs.service.ts findAllForUser). Sunucudan
  // gelen sıra korunarak ikiye ayrılır.
  // Silinmeyi bekleyen işler (geri alma penceresi) sunucudan hâlâ geliyor; elenir.
  const visibleJobs = useWithoutPendingDeletes(jobs);
  const ownedJobs = myUserId ? visibleJobs.filter((j) => j.ownerId === myUserId) : visibleJobs;
  const joinedJobs = myUserId ? visibleJobs.filter((j) => j.ownerId !== myUserId) : [];
  // İki ayrı ızgara varken bile sıralama tek bir listedir: sunucuya her zaman
  // "önce kurduklarım, sonra dahil olduklarım" şeklindeki birleşik sıra gönderilir.
  const splitView = ownedJobs.length > 0 && joinedJobs.length > 0;

  const persistOrder = () => {
    const readIds = (el: HTMLElement | null) =>
      el ? Array.from(el.children).map((node) => (node as HTMLElement).dataset.id!).filter(Boolean) : [];
    const ids = [...readIds(gridRef.current), ...readIds(joinedGridRef.current)];
    if (ids.length === 0) return;
    // Geri alma için sürüklemeden ÖNCEKİ sıra (bu render'daki jobs) saklanır.
    const previousIds = jobs.map((j) => j.id);
    setJobs((prev) => {
      const byId = new Map(prev.map((j) => [j.id, j]));
      return ids.map((id) => byId.get(id)!).filter(Boolean);
    });
    api.patch("/jobs/reorder", { ids }).catch(() => reloadJobs());
    registerReorderUndo("/jobs/reorder", previousIds, ids, reloadJobs);
  };

  // Sekme değişince ızgara DOM'dan kalkıp geri geldiği için yeniden bağlanmalı.
  // redirectTo da listede: hesap tipi belirlenene kadar (undefined) bu bileşen
  // null render ettiğinden gridRef henüz boştur. Eğer işler, /auth/me yanıtından
  // ÖNCE gelirse effect boş ref ile çalışıp hiç bağlanmıyor ve ızgara sonradan
  // görünse bile sürükle-sırala ölü kalıyordu.
  const sortableDeps = [visibleJobs.length === 0, tab, redirectTo, splitView];
  useSortableList(gridRef, { onEnd: persistOrder }, sortableDeps);
  useSortableList(joinedGridRef, { onEnd: persistOrder }, sortableDeps);

  const projectCountByJob = projects.reduce<Record<string, number>>((acc, p) => {
    acc[p.jobId] = (acc[p.jobId] ?? 0) + 1;
    return acc;
  }, {});

  const pageTitle = openModuleTab
    ? openModuleTab.name
    : tab === "jobs"
      ? "İşlerim"
      : tab === "budget"
        ? "Bütçem"
        : tab === "files"
          ? "Dosyalarım"
          : "Modüller";

  // Sekme düğmeleri tek yerde üretilir: hem sayfadaki çubuk hem kaydırınca beliren
  // şerit aynı diziyi kullanır, böylece ikisi hiçbir zaman ayrışmaz.
  const tabButtons = tabs.map((t) => {
    const isActive = tab === t.key;
    return (
      <button
        key={t.key}
        type="button"
        {...tourAnchor(`dashboard-tab-${t.key}`)}
        onClick={() => setTab(t.key)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "9px 14px",
          border: "none",
          background: "transparent",
          color: isActive ? c.textPrimary : c.textSecondary,
          fontSize: 15,
          fontWeight: 500,
          // Etiket kelime ortasından bölünmesin; sığmıyorsa sekmenin tamamı
          // alt satıra insin.
          whiteSpace: "nowrap",
          flexShrink: 0,
          borderBottom: `2px solid ${isActive ? c.accent : "transparent"}`,
          marginBottom: -1,
        }}
      >
        <t.icon size={15} color={isActive ? c.accentDark : c.textSecondary} />
        {t.label}
        {/* Terfi görünür olur, düşüş sessizdir: yeni gelen sekme tek
            seferlik bir noktayla kendini tanıtır. */}
        {t.isNew && (
          <span
            title="Sık kullandığın için üste alındı"
            style={{ width: 6, height: 6, borderRadius: "50%", background: c.accent, flexShrink: 0 }}
          />
        )}
      </button>
    );
  });

  // Kaydırınca tepede beliren sabit şerit (bkz. App.tsx CoverStickyHeader).
  // Anasayfanın kapağı yok; "kapak" rolünü başlık + kişi kartı satırı üstlenir.
  // Taşeron hesabında anasayfa tek çalışma ekranı olduğu için sekmelerin aşağı
  // inince kaybolması burada en çok hissedilen eksikti.
  // Şerit kopyası sarmaz, yana kaydırılır: 68 px'lik bantta ikinci satır yeri yok.
  usePageHeader(pageTitle, headerRef, [pageTitle]);
  usePageHeaderTabs(
    <div style={{ display: "flex", gap: 4, overflowX: "auto", scrollbarWidth: "none" }}>{tabButtons}</div>,
    [tab, tabs.length],
    tabsRef
  );

  // Hesap tipi belirlenene kadar "İşlerim" görünümünü göstermeyelim (yanlış görünüm
  // bir an için parlayıp kaybolmasın); organizasyon/grup sahibiyse oraya yönlendir.
  if (redirectTo === undefined) return null;
  if (redirectTo) return <Navigate to={redirectTo} replace />;

  return (
    // Mobilde üst boşluk kısılıyor: App zaten HEADER_HEIGHT (76 px) kadar
    // paddingTop veriyor ve yüzen logo 58 px'de bitiyor — üstüne 28 px daha
    // eklenince logo ile "İşlerim" başlığı arasında boşluk kalıyordu.
    // Masaüstünde yer sıkıntısı yok, orada 28 px korunuyor.
    <div
      style={{
        minHeight: "100vh",
        background: c.background,
        padding: isDesktop ? 28 : "6px 16px 28px",
        // Kişi kartının kapsülü sayfa dolgusunu aşıp ekran kenarına dayanıyor
        // (bkz. ProfileCard bleedRight). Taşan kısım burada kırpılıyor: hem
        // yatay kaydırma çubuğu doğmuyor hem de kapsül tam kenarda bitiyor.
        overflowX: "hidden",
      }}
    >
      <div
        ref={headerRef}
        style={{
          display: "flex",
          flexDirection: isDesktop ? "row" : "column",
          alignItems: isDesktop ? "center" : "stretch",
          justifyContent: "space-between",
          gap: isDesktop ? 16 : 8,
          marginBottom: isDesktop ? 20 : 12,
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 500, color: c.textPrimary, margin: 0 }}>{pageTitle}</h1>
        {/* Hem masaüstünde hem mobilde sağa dayalı: kartın kendi kompozisyonu
            (sağa hizalı metin, sağdaki avatar, transformOrigin: right) sağ kenara
            yaslandığında doğru duruyor. */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          {/* Tam sayfa dolgusu kadar: kart kenara dayanır ama avatar kırpılmaz. */}
          <ProfileCard bleedRight={isDesktop ? 28 : 16} compact={!isDesktop} />
        </div>
      </div>

      {/* İşler / Bütçe sekmeleri.
          flexWrap: sekmeler sığmadığında (dar ekran ya da Ayarlar'dan büyütülmüş
          yazı ölçeği) yan yana ezilip üst üste binmek yerine alt satıra geçer.
          Ekran genişliğine göre değil, gerçekten yer kalmadığında kırıldığı için
          ayrı bir mobil/masaüstü dalına gerek yok. */}
      <div
        ref={tabsRef}
        {...tourAnchor("dashboard-tabs")}
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 4,
          marginBottom: 24,
          borderBottom: `1px solid ${c.border}`,
        }}
      >
        {tabButtons}
      </div>

      {/* Terfi etmiş modül: sekmenin içeriği modülün kendisi. jobId, modülün en
          son çalışıldığı iştir (bkz. myJobModuleStats). */}
      {openModuleTab && (
        <ModuleSurface
          moduleKey={openModuleTab.key}
          moduleName={openModuleTab.name}
          jobId={openModuleTab.jobId}
        />
      )}

      {tab === "budget" && <BudgetPanel />}

      {tab === "files" && <AllFilesPanel jobs={visibleJobs} />}

      {tab === "modules" && <DashboardModulesPanel jobs={visibleJobs} />}

      {tab === "jobs" && !isDesktop && (showOrganizations || showGroups) && (
        <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
          {showOrganizations && (
            <Link
              to="/organizations"
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 14px",
                borderRadius: 12,
                border: `1px solid ${c.border}`,
                background: c.surface,
              }}
            >
              <IconBuilding size={17} color={c.textSecondary} />
              <span style={{ flex: 1, fontSize: 15, color: c.textPrimary, fontWeight: 500 }}>Organizasyonlar</span>
              <IconChevronRight size={14} color={c.textSecondary} />
            </Link>
          )}
          {showGroups && (
            <Link
              to="/groups"
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 14px",
                borderRadius: 12,
                border: `1px solid ${c.border}`,
                background: c.surface,
              }}
            >
              <IconLayers size={17} color={c.textSecondary} />
              <span style={{ flex: 1, fontSize: 15, color: c.textPrimary, fontWeight: 500 }}>Gruplar</span>
              <IconChevronRight size={14} color={c.textSecondary} />
            </Link>
          )}
        </div>
      )}

      {tab === "jobs" &&
        (visibleJobs.length === 0 ? (
          <div
            style={{
              border: `1px dashed ${c.border}`,
              borderRadius: 12,
              padding: 40,
              textAlign: "center",
              color: c.textSecondary,
              fontSize: 16,
            }}
          >
            Henüz iş yok.
          </div>
        ) : (
          <>
            {/* İşler iki kaynaktan gelir: kullanıcının kendi kurduğu işler ve bir
                projesine ekip üyesi/taşeron olarak eklendiği işler. Her ikisi de
                varsa ayrı başlıklar altında gösterilir; tek tür varsa başlık
                gereksiz gürültü olacağından tek ızgara olarak kalır. */}
            {splitView && (
              <SectionHeading
                title="Kurduklarım"
                hint="Sahibi sensin — düzenleyebilir, ekip kurabilirsin"
                count={ownedJobs.length}
              />
            )}
            <div ref={gridRef} style={gridStyle}>
              {ownedJobs.map((j) => (
                <div key={j.id} data-id={j.id}>
                  {/* Sunucudan gelen gerçek proje sayısı öncelikli; yoksa eski yönteme düş */}
                  <JobCard job={j} projectCount={j.projectCount ?? projectCountByJob[j.id] ?? 0} />
                </div>
              ))}
            </div>

            {splitView && (
              <SectionHeading
                title="Katıldıklarım"
                hint="Ekibinde yer aldığın, başkasının yürüttüğü işler"
                count={joinedJobs.length}
                style={{ marginTop: 28 }}
              />
            )}
            {joinedJobs.length > 0 && (
              <div ref={joinedGridRef} style={gridStyle}>
                {joinedJobs.map((j) => (
                  <div key={j.id} data-id={j.id}>
                    <JobCard job={j} projectCount={j.projectCount ?? projectCountByJob[j.id] ?? 0} />
                  </div>
                ))}
              </div>
            )}

            {/* İşlere atanmış modüller sayfanın en altında; hiç atanmamışsa
                bileşen kendisi hiçbir şey render etmez. */}
            <DashboardAssignedModules jobs={visibleJobs} />
          </>
        ))}
    </div>
  );
}
