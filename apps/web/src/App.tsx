import { useEffect, useState } from "react";
import { Routes, Route, Link, useLocation, Navigate } from "react-router-dom";
import type { User } from "@projelio/shared";
import { api } from "./api/client";
import OnboardingWizard from "./components/OnboardingWizard";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import VerifyEmail from "./pages/VerifyEmail";
import GoogleReturn from "./pages/GoogleReturn";
import MicrosoftReturn from "./pages/MicrosoftReturn";
import JobDetail from "./pages/JobDetail";
import ProjectDetail from "./pages/ProjectDetail";
import OperationDetail from "./pages/OperationDetail";
import Organizations from "./pages/Organizations";
import OrganizationDetail from "./pages/OrganizationDetail";
import DepartmentDetail from "./pages/DepartmentDetail";
import Groups from "./pages/Groups";
import GroupDetail from "./pages/GroupDetail";
import CalendarView from "./pages/Calendar";
import AdminPanel from "./pages/AdminPanel";
import Settings from "./pages/Settings";
import Archive from "./pages/Archive";
import TasksOverview from "./pages/TasksOverview";
import Sidebar from "./components/Sidebar";
import BottomNav from "./components/BottomNav";
import NotificationBell from "./components/NotificationBell";
import AiLauncher from "./components/AiLauncher";
import AiCreditsPage from "./pages/AiCredits";
import { initPush } from "./push";
import { colors } from "./theme/colors";
import { ProjectFabContext } from "./lib/projectFab";
import { PageHeaderProvider, usePageHeaderState } from "./lib/pageHeader";
import { UndoProvider } from "./lib/undo";
import type { ProjectFabAction } from "./lib/projectFab";
import { useIsDesktop } from "./lib/useIsDesktop";
import { SIDEBAR_WIDTH } from "./lib/layout";
import { IconChevronRight, IconUser } from "./components/icons";

const HEADER_HEIGHT = 76;

// Kapak sayfalarında aşağı kaydırırken beliren sabit başlığın iki satırı.
// Üst satır logonun/bildirim çanının arkasına opak bir zemin koyar (kapak
// sayfalarında normalde böyle bir zemin yok, bu yüzden içerik onların altından
// geçerken karışıyordu); alt satır sayfanın adını taşır.
const STICKY_TOP_ROW = 68;
const STICKY_TITLE_ROW = 44;

/**
 * Kapak sayfalarında aşağı kaydırınca beliren sabit başlık.
 *
 * Bu sayfalarda kapak görseli sayfanın en üstüne (y=0) kadar uzansın diye üstteki
 * opak şerit kaldırılmıştı; sonuç olarak aşağı kaydırırken içerik, sabit duran
 * logonun ve bildirim çanının altından geçip onlarla karışıyordu. Artık kapağın
 * alt kenarı üst şeridin altına geçtiği anda opak bir başlık beliriyor: üst satır
 * logo/çan bandına zemin oluyor, alt satır sayfanın adını taşıyor, içerik de
 * ikisinin altından akıp gidiyor.
 */
function CoverStickyHeader({
  visibleOn,
  left,
  sidebarOpen,
  user,
}: {
  visibleOn: boolean;
  left: number;
  // Sidebar kapalıyken sol üstte yüzen logo/aç düğmesi bu şeridin üstünde
  // (daha yüksek zIndex ile) durur — sekme çubuğu (bkz. registration.tabs)
  // onların altına girmesin diye sol tarafta yer açılır.
  sidebarOpen: boolean;
  user: User | null;
}) {
  const c = colors.light;
  const registration = usePageHeaderState();
  const [passed, setPassed] = useState(false);
  const isDesktop = useIsDesktop();

  const coverRef = registration?.coverRef;

  useEffect(() => {
    if (!visibleOn || !coverRef) {
      setPassed(false);
      return;
    }
    // Kapak yükseklikleri sayfadan sayfaya değiştiği (ve projede kapak yoksa
    // tamamen değişken olduğu) için sabit bir kaydırma eşiği yerine kapağın
    // kendisi ölçülüyor.
    //
    // Sayfanın kendi araç çubuğu varsa (bkz. usePageHeaderActions sourceRef —
    // ör. OutputsPanel'in Görevler/Çıktılar + Sırala/Seç satırı) kapak geçilir
    // geçilmez değil, o satır da ekrandan çıkana kadar beklenir. Aksi halde
    // araç çubuğu hâlâ görünürken sabit başlıktaki küçültülmüş kopyası da
    // belirip aynı düğmeler bir an için iki kez görünüyordu.
    const check = () => {
      const el = coverRef.current;
      if (!el) return;
      const toolbarEl = registration?.actions?.sourceRef?.current;
      const bottom = toolbarEl
        ? Math.max(el.getBoundingClientRect().bottom, toolbarEl.getBoundingClientRect().bottom)
        : el.getBoundingClientRect().bottom;
      setPassed(bottom <= STICKY_TOP_ROW + STICKY_TITLE_ROW);
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [visibleOn, coverRef, registration?.actions?.sourceRef]);

  if (!visibleOn || !registration) return null;

  return (
    <div
      aria-hidden={!passed}
      style={{
        position: "fixed",
        top: 0,
        left,
        right: 0,
        // Logo ve bildirim çanı (zIndex 40) bu şeridin ÜSTÜNDE kalır; içerik
        // (zIndex yok) altından geçer.
        zIndex: 34,
        background: c.surface,
        borderBottom: `1px solid ${c.border}`,
        boxShadow: "0 1px 6px rgba(26,31,41,0.06)",
        opacity: passed ? 1 : 0,
        transform: passed ? "none" : "translateY(-8px)",
        transition: "opacity 0.16s ease, transform 0.16s ease",
        // Görünmezken altındaki içeriğe tıklanabilmeli.
        pointerEvents: passed ? "auto" : "none",
      }}
    >
      {/* Üst satır: normalde yalnızca zemin (logo/çan zaten ayrı position:fixed
          öğeler). Sayfa kendi sekme çubuğunu kaydettiyse (bkz. usePageHeaderTabs
          — ör. ProjectDetail) burada gösterilir; aksi halde boş kalır. Yalnızca
          masaüstünde: dar ekranda sekmeler zaten sayfanın kendi akışında kalıyor. */}
      <div
        style={{
          height: STICKY_TOP_ROW,
          display: "flex",
          alignItems: "center",
        }}
      >
        {isDesktop && registration.tabs && (
          <div
            style={{
              flex: 1,
              minWidth: 0,
              padding: `0 28px 0 ${sidebarOpen ? 28 : 170}px`,
              // Bildirim çanı (zIndex 40) sağda sabit duruyor; sekmeler onun
              // altına girmesin diye sağda da yer bırakılır.
              paddingRight: 70,
            }}
          >
            {registration.tabs}
          </div>
        )}
      </div>
      {/* Alt satır: solda sayfanın adı, ardından (varsa) sayfaya özgü ek kontroller
          (bkz. usePageHeaderActions — ör. OutputsPanel'in Görevler/Çıktılar +
          Sırala/Seç kontrolleri), sağda kişi kartının küçültülmüş hali.
          Kapağın üstündeki büyük kişi kartı (bkz. ProfileCard) yukarı kayıp gözden
          kaybolduğu için burada yalnızca kimlik göstergesi olarak fotoğraf + ad
          kalıyor; satır yükselmesin diye unvan, açıklama ve düzenleme simgesi yok. */}
      <div
        style={{
          height: STICKY_TITLE_ROW,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "0 28px",
          borderTop: `1px solid ${c.border}`,
        }}
      >
        {(() => {
          // Ek kontroller yalnızca masaüstünde gösterilir: dar ekranlarda bu satıra
          // sığmıyorlar, mobilde kontroller sayfanın kendi (kaydırılabilen) akışında
          // hâlâ erişilebilir durumda kalıyor.
          const showActions = isDesktop && Boolean(registration.actions);
          return (
            <>
              <span
                title={registration.title}
                style={{
                  flex: showActions ? "0 1 auto" : 1,
                  minWidth: 0,
                  maxWidth: showActions ? 200 : undefined,
                  fontSize: 16,
                  fontWeight: 500,
                  color: c.textPrimary,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {registration.title}
              </span>

              {showActions && registration.actions?.left && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  {registration.actions.left}
                </div>
              )}

              {showActions && <div style={{ flex: 1 }} />}

              {showActions && registration.actions?.right && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  {registration.actions.right}
                </div>
              )}
            </>
          );
        })()}

        {user && (
          <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, maxWidth: "45%" }}>
            <span
              style={{
                width: 26,
                height: 26,
                borderRadius: "50%",
                overflow: "hidden",
                flexShrink: 0,
                background: c.background,
                border: `1px solid ${c.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt=""
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <IconUser size={14} color={c.textSecondary} />
              )}
            </span>
            <span
              title={user.fullName}
              style={{
                fontSize: 14,
                color: c.textSecondary,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {user.fullName}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const location = useLocation();
  // Google dönüş ekranı da kimlik doğrulaması gerektirmeyen bir ekrandır: token
  // henüz yerel depoda yok, tam da burada oluşturuluyor. Korumalı bölgeye
  // koyarsak /login'e yönlenir ve akış hiç tamamlanamaz.
  // Microsoft dönüşünde token zaten var (yalnızca "bağlama" akışı), ama aynı
  // bağımsız, tam ekran kart tasarımını paylaşması için burada tutuluyor.
  const isAuthScreen =
    location.pathname === "/login" ||
    location.pathname === "/register" ||
    location.pathname === "/forgot-password" ||
    location.pathname === "/reset-password" ||
    location.pathname === "/verify-email" ||
    location.pathname === "/google/return" ||
    location.pathname === "/microsoft/return";
  const hasToken = !!localStorage.getItem("projelio_token");
  const [fabAction, setFabAction] = useState<ProjectFabAction | null>(null);
  // Bilgisayarda (geniş ekran) sol sidebar + üstte tam genişlik header;
  // telefonda (dar ekran) sidebar kaybolur, alt menü (BottomNav) ve
  // sol üstte yüzen logo geri gelir. Pencere yeniden boyutlandırıldığında canlı güncellenir.
  const isDesktop = useIsDesktop();
  // Sidebar artık masaüstünde de mobilde de açılıp kapanabiliyor: masaüstünde
  // varsayılan açık (eski davranış), mobilde varsayılan kapalı (üstteki oka
  // basılınca bir çekmece gibi açılır). Ekran genişliği eşiği aşıldığında
  // (masaüstü <-> mobil geçişinde) varsayılana geri dönülür.
  const [sidebarOpen, setSidebarOpen] = useState(isDesktop);
  useEffect(() => {
    setSidebarOpen(isDesktop);
  }, [isDesktop]);
  // Giriş yapmış her kullanıcı için bir kez kontrol edilir: onboardingCompletedAt
  // boşsa (yeni kayıt ya da bu özellik eklenmeden önce kaydolmuş mevcut kullanıcı)
  // sihirbaz gösterilir, tamamlanana kadar uygulamanın geri kalanı erişilemez.
  const [me, setMe] = useState<User | null>(null);

  const reloadMe = () => {
    if (!hasToken || isAuthScreen) return;
    api.get<User>("/auth/me").then(setMe).catch(() => setMe(null));
  };

  useEffect(reloadMe, [hasToken, isAuthScreen]);

  useEffect(() => {
    if (!isAuthScreen) void initPush();
  }, [isAuthScreen]);

  if (isAuthScreen) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/google/return" element={<GoogleReturn />} />
        <Route path="/microsoft/return" element={<MicrosoftReturn />} />
      </Routes>
    );
  }

  if (!hasToken) {
    return <Navigate to="/login" replace />;
  }

  // İş/Proje/Rutin/Organizasyon/Departman/Grup detay sayfaları en üstte tam
  // genişlikte bir kapak fotoğrafı/gradyanı gösterir (bkz. ilgili sayfaların
  // return'ünün ilk elemanı). Bu sayfalarda kapak, sayfanın gerçek en üstüne
  // (y=0) kadar uzansın diye burada normalde her sayfaya uygulanan
  // HEADER_HEIGHT boşluğu ve dekoratif header çubuğunun opak arka planı
  // kaldırılır; sidebar açma düğmesi/logo/bildirim çanı/AI başlatıcı zaten
  // ayrı position:fixed öğeler olduğu için kapağın üzerinde yüzmeye devam eder.
  const isCoverPage = /^\/(jobs|projects|operations|organizations|departments|groups)\/[^/]+$/.test(
    location.pathname
  );

  const c = colors.light;

  return (
    // Geri alma (Cmd/Ctrl+Z) tüm sayfaları kapsadığı için sağlayıcı en dışta;
    // bekleyen silmelerin sayfalar arasında gezinirken de yaşaması gerekiyor.
    <UndoProvider>
    <PageHeaderProvider>
    <div style={{ minHeight: "100vh" }}>
      {me && !me.onboardingCompletedAt && <OnboardingWizard onCompleted={reloadMe} />}

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} overlay={!isDesktop} isAdmin={me?.role === "admin"} />

      {/* Sidebar artık position:fixed olduğu için akışta yer kaplamıyor;
          içerik sütununu (yalnızca masaüstünde ve açıkken) onun genişliği kadar
          sağa kaydırıyoruz. Mobilde sidebar bir çekmece/overlay olduğu için
          içerik hiçbir zaman kaymaz. */}
      <div style={{ marginLeft: isDesktop && sidebarOpen ? SIDEBAR_WIDTH : 0, minHeight: "100vh", position: "relative" }}>
        {!isCoverPage && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: isDesktop && sidebarOpen ? SIDEBAR_WIDTH : 0,
              right: 0,
              height: HEADER_HEIGHT,
              // Kasıtlı olarak sayfa arka planıyla AYNI renk (beyaz değil): bu şerit
              // dekoratif bir başlık çubuğu değil, yukarı kaydırılan içeriğin sabit
              // duran bildirim çanı / AI düğmesi / sidebar okunun altından geçerken
              // görünmesini engelleyen bir maske. Beyaz olduğunda sayfanın üstünde
              // sırıtan bir bant gibi duruyordu; çerçeve ve gölge de bu yüzden yok.
              background: c.background,
              zIndex: 35,
            }}
          />
        )}
        {/* Kapak sayfalarında kaydırma başlayınca beliren opak başlık şeridi.
            Logo/çan ondan sonra render ediliyor ki (ve daha yüksek zIndex ile)
            şeridin üstünde kalsınlar. */}
        <CoverStickyHeader
          visibleOn={isCoverPage}
          left={isDesktop && sidebarOpen ? SIDEBAR_WIDTH : 0}
          sidebarOpen={sidebarOpen}
          user={me}
        />

        {/* Sidebar kapalıyken (masaüstünde veya mobilde) sol üstte küçük bir ok
            butonu ve onun yanında Projelio logosu gösterilir; oka basınca sidebar
            açılır, logoya basınca ana sayfaya gidilir. Sidebar açıkken zaten kendi
            logosunu ve kapatma okunu içeriyor, burada ayrıca bir şey göstermeye
            gerek yok. */}
        {!sidebarOpen && (
          <>
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Sidebar'ı aç"
              title="Sidebar'ı aç"
              style={{
                position: "fixed",
                top: 14,
                left: 14,
                zIndex: 40,
                width: 40,
                height: 40,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: c.surface,
                border: `1px solid ${c.border}`,
                boxShadow: "0 2px 8px rgba(26,31,41,0.12)",
              }}
            >
              <IconChevronRight size={18} color={c.textSecondary} />
            </button>
            <Link
              to="/"
              aria-label="Projelio - Ana sayfa"
              style={{
                position: "fixed",
                top: 10,
                left: 62,
                zIndex: 40,
                display: "flex",
                alignItems: "center",
              }}
            >
              <img src="/logo.png" alt="Projelio" style={{ width: 48, height: 48 }} />
            </Link>
          </>
        )}
        <NotificationBell />
        <AiLauncher />
        <ProjectFabContext.Provider value={{ action: fabAction, setAction: setFabAction }}>
          <div style={{ paddingTop: isCoverPage ? 0 : HEADER_HEIGHT, paddingBottom: isDesktop ? 28 : 84 }}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/jobs/:id" element={<JobDetail />} />
              <Route path="/projects/:id" element={<ProjectDetail />} />
              <Route path="/operations/:id" element={<OperationDetail />} />
              <Route path="/organizations" element={<Organizations />} />
              <Route path="/organizations/:id" element={<OrganizationDetail />} />
              <Route path="/departments/:id" element={<DepartmentDetail />} />
              <Route path="/groups" element={<Groups />} />
              <Route path="/groups/:id" element={<GroupDetail />} />
              <Route path="/calendar" element={<CalendarView />} />
              <Route path="/tasks" element={<TasksOverview />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/settings/archive" element={<Archive />} />
              <Route path="/settings/ai-credits" element={<AiCreditsPage />} />
              <Route path="/admin" element={<AdminPanel />} />
            </Routes>
          </div>
          {/* Mobilde tam alt menü, masaüstünde ise sadece ortadaki "+" butonu olarak
              render edilir — karar BottomNav içinde isDesktop'a göre veriliyor. */}
          <BottomNav />
        </ProjectFabContext.Provider>
      </div>
    </div>
    </PageHeaderProvider>
    </UndoProvider>
  );
}
