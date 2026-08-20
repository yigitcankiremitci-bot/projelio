import { useEffect, useState } from "react";
import type { RefObject } from "react";
import { Routes, Route, Link, useLocation, useParams, Navigate } from "react-router-dom";
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
import HabieConnect from "./pages/HabieConnect";
import MicrosoftReturn from "./pages/MicrosoftReturn";
import Privacy from "./pages/Privacy";
import JobDetail from "./pages/JobDetail";
import ProjectDetail from "./pages/ProjectDetail";
import OperationDetail from "./pages/OperationDetail";
import Organizations from "./pages/Organizations";
import OrganizationDetail from "./pages/OrganizationDetail";
import DepartmentDetail from "./pages/DepartmentDetail";
import ModulePage from "./pages/ModulePage";
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
import { TourProvider } from "./lib/tour/TourContext";
import TourOverlay from "./components/tour/TourOverlay";
import TourLauncher from "./components/tour/TourLauncher";
import type { ProjectFabAction } from "./lib/projectFab";
import { useIsDesktop } from "./lib/useIsDesktop";
import { SIDEBAR_WIDTH } from "./lib/layout";
import { IconChevronRight, IconUser } from "./components/icons";

const HEADER_HEIGHT = 76;

// Kapak sayfalarında aşağı kaydırırken beliren sabit başlığın iki satırı.
//
// ÜST satır logonun/bildirim çanının arkasına opak bir zemin koyar (kapak
// sayfalarında normalde böyle bir zemin yok, içerik onların altından geçerken
// karışıyordu) ve sayfanın kimliğini taşır: geri bağlantısı, ad, araç çubuğu ve
// en sağda kişi göstergesi. Kişi göstergesi bilerek burada — bildirim çanı ile
// yardım düğmesinin hemen yanına düşüyor ve kendisi için ayrı bir satır
// açılmasına gerek kalmıyor.
//
// ALT satır sekmelere ayrıldı. Sekmeler eskiden üst satırdaydı: orası solda
// logo, sağda çan/tur düğmeleri arasında sıkışan dar bir bant. Alt satır
// kenardan kenara olduğu için sekmeler bandın tamamını kullanıyor.
const STICKY_TOP_ROW = 68;
const STICKY_TABS_ROW = 48;
// Şeridin satırları hep aynı eşikte açılır: bir kaynak (kapak / sayfanın sekme
// çubuğu / araç çubuğu) bu çizginin üstüne kayınca kendi satırı belirir. Eşiğin
// sabit olması önemli — şeridin o anki yüksekliğine bağlansaydı satır açılınca
// eşik de büyür, kaynak yeniden "görünür" sayılır ve satır açılıp kapanıp
// titrerdi.
const STICKY_REVEAL = STICKY_TOP_ROW + STICKY_TABS_ROW;

/**
 * Proje detayını proje id'sine göre `key`ler.
 *
 * Aynı rotada yalnızca :id değişince (sidebar'dan başka bir projeye tıklamak)
 * React bileşeni yeniden KULLANIR: state olduğu gibi kalır, efektler yeniden
 * çalışmaz. Sonuç olarak Bütçe sekmesindeyken açılan yeni proje de Bütçe'de
 * açılıyor, önceki projenin görev listesi bir an için yeni projenin başlığıyla
 * görünüyordu. `key` değişince React eskisini söküp yenisini sıfırdan kurar —
 * "yeni projeye geçtim" ile "sayfayı yeniden açtım" aynı şey olur.
 */
function KeyedProjectDetail() {
  const { id } = useParams();
  return <ProjectDetail key={id} />;
}

/** Sabit şeritteki kimlik göstergesi: fotoğraf + (yer varsa) ad. */
function MiniProfile({ user, showName }: { user: User; showName: boolean }) {
  const c = colors.light;
  return (
    <span
      title={user.fullName}
      style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, maxWidth: "45%" }}
    >
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
          <img src={user.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <IconUser size={14} color={c.textSecondary} />
        )}
      </span>
      {showName && (
        <span
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
      )}
    </span>
  );
}

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
  // Şerit tek parça halinde değil, üç aşamada açılır (aksi halde en geç kaynak
  // — genelde araç çubuğu — ekrandan çıkana kadar hiçbir şey belirmiyor, o arada
  // sayfanın kendi sekmeleri de şeridin altında kalıp kayboluyordu):
  //  1. kapak logonun altına kayınca  -> sayfa adı + kişi kartı satırı
  //  2. sayfanın sekme çubuğu kayınca -> sekmeler
  //  3. araç çubuğu kayınca           -> Görevler/Çıktılar + Sırala/Seç
  //  4. hepsi açıldıktan sonra        -> geri bağlantısı (her zaman en altta,
  //     her zaman en son: yukarıdaki satırların arasına girmesin)
  const [stage, setStage] = useState({ title: false, tabs: false, actions: false, back: false });
  const isDesktop = useIsDesktop();

  const coverRef = registration?.coverRef;
  const tabsSourceRef = registration?.tabs?.sourceRef;
  const actionsSourceRef = registration?.actions?.sourceRef;
  const backSourceRef = registration?.back?.sourceRef;

  useEffect(() => {
    if (!visibleOn || !coverRef) {
      setStage({ title: false, tabs: false, actions: false, back: false });
      return;
    }
    // Kapak yükseklikleri sayfadan sayfaya değiştiği (ve projede kapak yoksa
    // tamamen değişken olduğu) için sabit bir kaydırma eşiği yerine elemanların
    // kendisi ölçülüyor. Kaynağı olmayan bir bölüm (sourceRef verilmemişse)
    // beklenecek bir şey olmadığı için başlıkla birlikte açılır.
    const scrolledPast = (ref?: RefObject<HTMLElement>) => {
      const el = ref?.current;
      if (!el) return true;
      return el.getBoundingClientRect().bottom <= STICKY_REVEAL;
    };
    const check = () => {
      const el = coverRef.current;
      if (!el) return;
      const title = el.getBoundingClientRect().bottom <= STICKY_REVEAL;
      const tabs = title && scrolledPast(tabsSourceRef);
      const actions = title && scrolledPast(actionsSourceRef);
      const next = {
        title,
        tabs,
        actions,
        // Geri satırı en son açılır: sayfanın kendi bağlantısı kaybolmuş OLMALI
        // (yoksa iki tane görünüyor) ve üstündeki tüm satırlar açılmış olmalı.
        back: title && tabs && actions && scrolledPast(backSourceRef),
      };
      setStage((prev) =>
        prev.title === next.title &&
        prev.tabs === next.tabs &&
        prev.actions === next.actions &&
        prev.back === next.back
          ? prev
          : next
      );
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [visibleOn, coverRef, actionsSourceRef, tabsSourceRef, backSourceRef]);

  if (!visibleOn || !registration) return null;

  const passed = stage.title;
  const showTabs = stage.tabs && Boolean(registration.tabs);
  // Mobilde de gösteriliyor: dar ekranda bu kontroller eskiden hiç kopyalanmıyor,
  // sayfadaki asılları da şeridin altında kaldığı için kaydırınca tamamen
  // erişilemez oluyordu. Masaüstünde başlık satırının içinde, mobilde kendi
  // satırlarında dururlar.
  const showActions = stage.actions && Boolean(registration.actions);
  const showBack = stage.back && Boolean(registration.back);

  return (
    <div
      aria-hidden={!passed}
      style={{
        position: "fixed",
        top: 0,
        left,
        right: 0,
        // Logo ve bildirim çanı (zIndex 40) bu şeridin ÜSTÜNDE kalır; içerik
        // (zIndex yok) altından geçer. 36: kapağı olmayan sayfalardaki opak üst
        // maskenin (zIndex 35) da üstünde kalmalı, yoksa şerit onun arkasında
        // kaybolur (bkz. App.tsx isCoverPage maskesi).
        zIndex: 36,
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
      {/* Üst satır: logo/çan bandına zemin (ikisi de ayrı position:fixed öğeler).
          Ortası boş kalmasın diye:
          - masaüstünde sayfanın sekme çubuğu yukarı kayınca (2. aşama) sekmeler,
          - mobilde ise sayfa adı + kişi göstergesi buraya yerleşir; böylece dar
            ekranda ayrı bir başlık satırı açıp şeridi bir kat daha uzatmıyoruz. */}
      {/* ÜST SATIR — sayfanın kimliği. Solda sidebar oku (14–54) + logo (62–110),
          sağda bildirim çanı (14–58) + tur düğmesi (62–106) position:fixed
          duruyor; bu satırın dolgusu tam o boşluğu bırakıyor ve kişi göstergesi
          sağ uçta, çanın hemen yanına düşüyor. */}
      <div
        style={{
          height: STICKY_TOP_ROW,
          display: "flex",
          alignItems: "center",
          gap: 12,
          paddingLeft: sidebarOpen ? 28 : 118,
          paddingRight: 112,
        }}
      >
        {isDesktop ? (
          <>
            {/* Geri bağlantısı en son (4. aşamada) açılır: sayfanın kendi
                bağlantısı (artık kapağın içinde, bkz. CoverBackLink) kaybolmuş
                olmalı, yoksa ikisi bir süre birlikte görünüyordu. */}
            {showBack && registration.back && (
              <Link
                className="sticky-row-in"
                to={registration.back.to}
                style={{ fontSize: 14, color: c.textSecondary, whiteSpace: "nowrap", flexShrink: 0 }}
              >
                ← {registration.back.label}
              </Link>
            )}

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
              <div className="sticky-row-in" style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                {registration.actions.left}
              </div>
            )}

            {showActions && <div style={{ flex: 1 }} />}

            {showActions && registration.actions?.right && (
              <div className="sticky-row-in" style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                {registration.actions.right}
              </div>
            )}

            {user && <MiniProfile user={user} showName />}
          </>
        ) : (
          <>
            <span
              title={registration.title}
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: 15,
                fontWeight: 500,
                color: c.textPrimary,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {registration.title}
            </span>
            {/* Dar boşlukta yalnızca fotoğraf: ad da yazılınca proje adına
                okunabilir yer kalmıyordu. */}
            {user && <MiniProfile user={user} showName={false} />}
          </>
        )}
      </div>

      {/* ALT SATIR — sekmeler. Kenardan kenara: üst satırın dar bandına
          sıkıştıklarında sola yığılıp kalan genişliği boş bırakıyorlardı
          (bkz. TabBar FittedTabBar). */}
      {isDesktop && showTabs && (
        <div
          className="sticky-row-in"
          style={{
            height: STICKY_TABS_ROW,
            display: "flex",
            alignItems: "center",
            padding: "0 28px",
            borderTop: `1px solid ${c.border}`,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>{registration.tabs?.node}</div>
        </div>
      )}

      {/* Mobil: sekmeler kendi satırında — tek satır, yana kaydırmalı (bkz. TabBar
          `scrollable`). Sarmalı grid hâli iki satır alıp ekranın üçte birini
          yiyordu. 2. aşamada açılır. */}
      {!isDesktop && showTabs && (
        <div className="sticky-row-in" style={{ padding: "6px 14px 8px", borderTop: `1px solid ${c.border}` }}>
          {registration.tabs?.node}
        </div>
      )}

      {/* Mobil: Görevler/Çıktılar + Sırala/Seç satırı. 3. aşamada açılır. */}
      {!isDesktop && showActions && (
        <div
          className="sticky-row-in"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 14px",
            borderTop: `1px solid ${c.border}`,
            // overflowX: "auto" DEĞİL. Yatay taşmayı kaydırmalı yapmak, CSS
            // gereği dikey taşmayı da kırpıyordu: Sırala düğmesinin satırın
            // ALTINA açılan menüsü (bkz. TaskSortMenu, position:absolute)
            // görünmez oluyor, düğme tıklanıyor ama hiçbir şey olmuyordu.
            flexWrap: "wrap",
          }}
        >
          {registration.actions?.left}
          <div style={{ flex: 1 }} />
          {registration.actions?.right}
        </div>
      )}

      {/* Geri bağlantısı DAİMA şeridin en alt satırı: sekmelerle araç çubuğunun
          arasına girdiğinde iki kontrol grubunu birbirinden koparıyordu. Sayfanın
          kendi "← Projeler" bağlantısı yukarı kayıp kaybolduğu için burada
          tekrarlanıyor. */}
      {!isDesktop && showBack && registration.back && (
        <div className="sticky-row-in" style={{ padding: "6px 14px 8px", borderTop: `1px solid ${c.border}` }}>
          <Link to={registration.back.to} style={{ fontSize: 13, color: c.textSecondary }}>
            ← {registration.back.label}
          </Link>
        </div>
      )}
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
    location.pathname === "/microsoft/return" ||
    // Habie devir sayfası: token'ı okuyup Habie'ye yönlendiriyor, uygulama
    // kabuğuna (kenar çubuğu, veri çekme) hiç ihtiyacı yok.
    location.pathname === "/habie" ||
    // Gizlilik politikası herkese açık olmalı: Meta (WhatsApp Business Platform)
    // app'i yayınlarken giriş gerektirmeyen bir politika URL'i zorunlu tutuyor.
    location.pathname === "/privacy";
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
        <Route path="/habie" element={<HabieConnect />} />
        <Route path="/microsoft/return" element={<MicrosoftReturn />} />
        <Route path="/privacy" element={<Privacy />} />
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

  // Kapağı olmayan ama sabit şeride ihtiyaç duyan sayfalar: Yapılacaklar panosu
  // uzun, sekmeler ve Sırala/Seç ise yalnızca en tepedeki başlık satırında —
  // aşağı inince erişilemez oluyorlardı. Orada "kapak" rolünü sayfanın kendi
  // başlık satırı üstlenir (bkz. TasksOverview usePageHeader).
  const hasStickyHeader =
    isCoverPage || location.pathname === "/tasks" || location.pathname === "/";

  const c = colors.light;

  return (
    // Geri alma (Cmd/Ctrl+Z) tüm sayfaları kapsadığı için sağlayıcı en dışta;
    // bekleyen silmelerin sayfalar arasında gezinirken de yaşaması gerekiyor.
    <UndoProvider>
    <PageHeaderProvider>
    {/* Sesli + yazılı kullanım turu. Kurulum sihirbazı hâlâ açıkken kendiliğinden
        başlamaz (autoStartEnabled); kullanıcı isterse sağ üstteki "?" düğmesinden
        her an başlatabilir. */}
    <TourProvider autoStartEnabled={Boolean(me?.onboardingCompletedAt)}>
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
          visibleOn={hasStickyHeader}
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
        {me?.onboardingCompletedAt && <TourLauncher />}
        <TourOverlay />
        <AiLauncher />
        <ProjectFabContext.Provider value={{ action: fabAction, setAction: setFabAction }}>
          <div
            style={{
              paddingTop: isCoverPage ? 0 : HEADER_HEIGHT,
              // Mobilde sayfanın altında üç şey üst üste duruyor: alt menü
              // (68 px + safe-area), onun üstüne taşan yuvarlak FAB (bottom 24 +
              // 64 = tepesi 88 px) ve Lio balonu (bottom 96). Eski 84 px bunların
              // hiçbirine yetmiyordu; listenin son kartı FAB'ın altında kalıyor,
              // çentikli telefonlarda safe-area kadar daha da kayboluyordu.
              paddingBottom: isDesktop ? 28 : "calc(104px + env(safe-area-inset-bottom))",
            }}
          >
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/jobs/:id" element={<JobDetail />} />
              <Route path="/projects/:id" element={<KeyedProjectDetail />} />
              <Route path="/operations/:id" element={<OperationDetail />} />
              <Route path="/organizations" element={<Organizations />} />
              <Route path="/organizations/:id" element={<OrganizationDetail />} />
              <Route path="/departments/:id" element={<DepartmentDetail />} />
              {/* Sayfa yüzeyli modüller kendi adreslerinde açılır (bkz. lib/moduleSurfaces.ts). */}
              <Route path="/departments/:departmentId/modules/:moduleKey" element={<ModulePage />} />
              <Route path="/jobs/:jobId/modules/:moduleKey" element={<ModulePage />} />
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
    </TourProvider>
    </PageHeaderProvider>
    </UndoProvider>
  );
}
