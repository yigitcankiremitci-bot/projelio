import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import type { Job, Organization, Group, Project, User } from "@projelio/shared";
import { api } from "../api/client";
import JobCard from "../components/JobCard";
import { useThemeColors } from "../theme/useThemeColors";
import { useSortableList } from "../lib/useSortableList";
import { useRefreshOnUndo, useReorderUndo, useWithoutPendingDeletes } from "../lib/undo";
import { onSidebarChanged } from "../lib/sidebarEvents";
import { useIsDesktop } from "../lib/useIsDesktop";
import { useNavVisibility } from "../lib/useNavVisibility";
import { onJobInvitesChanged } from "../lib/jobInvites";
import { IconBuilding, IconLayers, IconChevronRight } from "../components/icons";
import { usePageHeader } from "../lib/pageHeader";
import { pageGutter } from "../lib/layout";
import BudgetPanel from "../components/BudgetPanel";
import AllFilesPanel from "../components/AllFilesPanel";
import DashboardModulesPanel from "../components/DashboardModulesPanel";
import DashboardAssignedModules from "../components/DashboardAssignedModules";
import ModuleSurface from "../components/ModuleSurface";
import { useModuleTabs } from "../lib/useModuleTabs";
import { useT } from "../lib/i18n";
import AnasayfaBaslik, { GeriDugmesi } from "../components/anasayfa/AnasayfaBaslik";
import AnasayfaPanosu, { OfisKapisi } from "../components/anasayfa/AnasayfaPanosu";
import GorunumSecici from "../components/anasayfa/GorunumSecici";
import { SERBEST_VARSAYILAN_PANO, useSerbestKatalogu } from "../components/anasayfa/ozetKartlari";
import { useAnasayfaPano } from "../lib/useAnasayfaPano";

// Anasayfanın kendisi özet panosu ("home"). Diğerleri bir kartın açtığı tam
// görünümler; adresleri (?tab=budget gibi) kenar çubuğu ve kayıtlı "Ana Sayfa"
// hedefleri kullandığı için aynen kaldı. Modül anahtarları da gelebilir.
type DashboardTab = "home" | "jobs" | "budget" | "files" | "modules" | (string & {});

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
  const c = useThemeColors();
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
  const [searchParams] = useSearchParams();
  // Üstteki "Ben" geçişi: şirket sahibi de kişisel panosunu açabilsin.
  const benGorunumu = searchParams.get("gorunum") === "ben";

  useEffect(() => {
    api
      .get<User>("/auth/me")
      .then(async (me) => {
        setMyUserId(me.id);
        if (benGorunumu) {
          setRedirectTo(null);
        } else if (me.accountType === "organization_owner") {
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
  }, [benGorunumu]);

  // Görünüm, URL'deki ?tab= ile eşleşir: kenar çubuğundan "/?tab=budget" gibi
  // bir bağlantıyla gelindiğinde ilgili tam görünüm açık başlasın diye.
  const tabParam = searchParams.get("tab");
  // Terfi etmiş modüller: puanlama ve slot sayısı useModuleTabs içinde
  // (bkz. lib/moduleLayout.ts). Serbest çalışan bağlamı — organizasyon yok.
  const moduleTabs = useModuleTabs();
  const openModuleTab = moduleTabs.find((m) => m.key === tabParam);
  const tab: DashboardTab =
    tabParam === "jobs" || tabParam === "budget" || tabParam === "files" || tabParam === "modules" || openModuleTab
      ? (tabParam as DashboardTab)
      : "home";
  const [jobs, setJobs] = useState<Job[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const c = useThemeColors();
  const t = useT();
  const gridRef = useRef<HTMLDivElement>(null);
  const joinedGridRef = useRef<HTMLDivElement>(null);
  // Sabit şeridin ölçtüğü öğe (bkz. lib/pageHeader): başlık satırı "kapak" yerine geçer.
  const headerRef = useRef<HTMLDivElement>(null);
  // Masaüstünde sol sidebar'da zaten Organizasyonlar/Gruplar linkleri var;
  // bu kısayol satırı sadece sidebar'ın kaybolduğu mobil görünümde gösterilir.
  const isDesktop = useIsDesktop();
  const gutter = pageGutter(isDesktop);
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
  // Panodaki Projeler kartından proje açılınca (CreateProjectModal bunu yayar) kart tazelensin.
  useEffect(() => onSidebarChanged(reloadAll), []);
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
      ? t("İşlerim")
      : tab === "budget"
        ? t("Kasam")
        : tab === "files"
          ? t("Dosyalarım")
          : tab === "modules"
            ? t("Modüller")
            : t("Ana Sayfa");

  const pano = useAnasayfaPano("me", SERBEST_VARSAYILAN_PANO);
  const katalog = useSerbestKatalogu({ isler: visibleJobs, projeler: projects, pano });

  // Kaydırınca tepede beliren sabit şerit (bkz. App.tsx CoverStickyHeader).
  const anasayfaEtiketi = t("Ana Sayfa");
  // sourceRef bilerek verilmiyor: geri düğmesi en üst bantta doğuyor ve yüzen hap
  // "kaynak çizgiyi geçti" sayıp sayfa kaydırılmadan açılıyordu; kaynak yokken
  // hap şeritle birlikte, ancak başlık yukarı kayınca belirir.
  usePageHeader(pageTitle, headerRef, [pageTitle, tab], tab === "home" ? undefined : { to: "/", label: anasayfaEtiketi });

  // Hesap tipi belirlenene kadar "İşlerim" görünümünü göstermeyelim (yanlış görünüm
  // bir an için parlayıp kaybolmasın); organizasyon/grup sahibiyse oraya yönlendir.
  if (redirectTo === undefined) return null;
  if (redirectTo) return <Navigate to={redirectTo} replace />;

  return (
    <div style={{ minHeight: "100vh", background: c.background }}>
      <AnasayfaBaslik
        baslik={pageTitle}
        baslikRef={headerRef}
        geri={tab === "home" ? undefined : <GeriDugmesi to="/" etiket={anasayfaEtiketi} />}
        secici={tab === "home" ? <GorunumSecici aktif="ben" isSayisi={visibleJobs.length} /> : undefined}
        araclar={
          tab === "home" ? <OfisKapisi hedef="/yeni?ofis=studyo" /> : undefined
        }
      />

      {tab === "home" && (
        <AnasayfaPanosu pano={pano} katalog={katalog} />
      )}

      {tab !== "home" && (
      <div style={{ padding: `0 ${gutter}px 28px` }}>
      {/* Terfi etmiş modül: içeriği modülün kendisi. jobId, modülün en son
          çalışıldığı iştir (bkz. myJobModuleStats). */}
      {openModuleTab && (
        <ModuleSurface
          moduleKey={openModuleTab.key}
          moduleName={openModuleTab.name}
          jobId={openModuleTab.jobId}
        />
      )}

      {tab === "budget" && <BudgetPanel />}

      {tab === "files" && <AllFilesPanel jobs={visibleJobs} projects={projects} myUserId={myUserId} />}

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
              <span style={{ flex: 1, fontSize: 15, color: c.textPrimary, fontWeight: 500 }}>{t("Organizasyonlar")}</span>
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
              <span style={{ flex: 1, fontSize: 15, color: c.textPrimary, fontWeight: 500 }}>{t("Gruplar")}</span>
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
            {t("Henüz iş yok.")}
          </div>
        ) : (
          <>
            {/* İşler iki kaynaktan gelir: kullanıcının kendi kurduğu işler ve bir
                projesine ekip üyesi/taşeron olarak eklendiği işler. Her ikisi de
                varsa ayrı başlıklar altında gösterilir; tek tür varsa başlık
                gereksiz gürültü olacağından tek ızgara olarak kalır. */}
            {splitView && (
              <SectionHeading
                title={t("Kurduklarım")}
                hint={t("Sahibi sensin — düzenleyebilir, ekip kurabilirsin")}
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
                title={t("Katıldıklarım")}
                hint={t("Ekibinde yer aldığın, başkasının yürüttüğü işler")}
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
      )}
    </div>
  );
}
