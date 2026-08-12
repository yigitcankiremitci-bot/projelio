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
import { IconBuilding, IconLayers, IconChevronRight, IconFolder, IconActivity, IconFile, IconSparkle } from "../components/icons";
import ProfileCard from "../components/ProfileCard";
import BudgetPanel from "../components/BudgetPanel";
import AllFilesPanel from "../components/AllFilesPanel";
import DashboardModulesPanel from "../components/DashboardModulesPanel";
import DashboardAssignedModules from "../components/DashboardAssignedModules";
import { tourAnchor } from "../lib/tour/types";

type DashboardTab = "jobs" | "budget" | "files" | "modules";

const tabs: { key: DashboardTab; label: string; icon: typeof IconFolder }[] = [
  { key: "jobs", label: "İşler", icon: IconFolder },
  { key: "budget", label: "Bütçe", icon: IconActivity },
  { key: "files", label: "Dosyalar", icon: IconFile },
  { key: "modules", label: "Modüller", icon: IconSparkle },
];

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
  const tab: DashboardTab =
    tabParam === "budget" || tabParam === "files" || tabParam === "modules" ? tabParam : "jobs";
  const setTab = (next: DashboardTab) => {
    setSearchParams(next === "jobs" ? {} : { tab: next }, { replace: true });
  };
  const [jobs, setJobs] = useState<Job[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const c = colors.light;
  const gridRef = useRef<HTMLDivElement>(null);
  const joinedGridRef = useRef<HTMLDivElement>(null);
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

  // Hesap tipi belirlenene kadar "İşlerim" görünümünü göstermeyelim (yanlış görünüm
  // bir an için parlayıp kaybolmasın); organizasyon/grup sahibiyse oraya yönlendir.
  if (redirectTo === undefined) return null;
  if (redirectTo) return <Navigate to={redirectTo} replace />;

  return (
    <div style={{ minHeight: "100vh", background: c.background, padding: 28 }}>
      <div
        style={{
          display: "flex",
          flexDirection: isDesktop ? "row" : "column",
          alignItems: isDesktop ? "center" : "stretch",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 500, color: c.textPrimary, margin: 0 }}>
          {tab === "jobs" ? "İşlerim" : tab === "budget" ? "Bütçem" : tab === "files" ? "Dosyalarım" : "Modüller"}
        </h1>
        {/* Masaüstünde sağa dayalı, mobilde ise kendi satırında ortalanmış görünür
            (aksi halde dar ekranda satır kırılınca sola yapışık kalıyordu). */}
        <div style={{ display: "flex", justifyContent: isDesktop ? "flex-end" : "center" }}>
          <ProfileCard />
        </div>
      </div>

      {/* İşler / Bütçe sekmeleri.
          flexWrap: sekmeler sığmadığında (dar ekran ya da Ayarlar'dan büyütülmüş
          yazı ölçeği) yan yana ezilip üst üste binmek yerine alt satıra geçer.
          Ekran genişliğine göre değil, gerçekten yer kalmadığında kırıldığı için
          ayrı bir mobil/masaüstü dalına gerek yok. */}
      <div
        {...tourAnchor("dashboard-tabs")}
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 4,
          marginBottom: 24,
          borderBottom: `1px solid ${c.border}`,
        }}
      >
        {tabs.map((t) => {
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
            </button>
          );
        })}
      </div>

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
