import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
import Terms from "./pages/Terms";
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
import PresenceStrip from "./components/PresenceStrip";
import AiLauncher from "./components/AiLauncher";
import AiCreditsPage from "./pages/AiCredits";
import { initPush } from "./push";
import { useThemeColors } from "./theme/useThemeColors";
import { ProjectFabContext } from "./lib/projectFab";
import { PageHeaderProvider, usePageHeaderState } from "./lib/pageHeader";
import { UndoProvider } from "./lib/undo";
import { TourProvider } from "./lib/tour/TourContext";
import TourOverlay from "./components/tour/TourOverlay";
import TourLauncher from "./components/tour/TourLauncher";
import type { ProjectFabAction } from "./lib/projectFab";
import { useIsDesktop } from "./lib/useIsDesktop";
import { getSidebarDefaultOpen, useAppPrefs } from "./lib/appPrefs";
import { refreshSession } from "./lib/session";
import { SIDEBAR_WIDTH, pageGutter } from "./lib/layout";
import { CoverBackLink } from "./components/EntityCover";
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
  const c = useThemeColors();
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
  const c = useThemeColors();
  const registration = usePageHeaderState();
  // Şerit tek parça halinde değil, üç aşamada açılır (aksi halde en geç kaynak
  // — genelde araç çubuğu — ekrandan çıkana kadar hiçbir şey belirmiyor, o arada
  // sayfanın kendi sekmeleri de şeridin altında kalıp kayboluyordu):
  //  1. kapak logonun altına kayınca  -> sayfa adı + kişi kartı satırı
  //  2. sayfanın sekme çubuğu kayınca -> sekmeler
  //  3. araç çubuğu kayınca           -> Görevler/Çıktılar + Sırala/Seç
  //
  // GERİ HAPI şeridin bir satırı DEĞİL: şeridin altında yüzen, kendi zemini
  // olmayan ayrı bir bant. Şeridin GERÇEK yüksekliğine göre konumlanır (bkz.
  // barHeight) — sabit bir sayı değil, çünkü sekmeler/araç çubuğu açılınca
  // şerit büyür. Bu sayede sol üstteki yüzen logoyla (yalnızca üst satırın
  // hizasında) hiçbir zaman aynı bandı paylaşmaz.
  //
  // Hap, yukarıdaki üç aşamanın DIŞINDA, kendi eşiğiyle açılır (bkz. check).
  const [stage, setStage] = useState({ title: false, tabs: false, actions: false, back: false });
  const barRef = useRef<HTMLDivElement>(null);
  const [barHeight, setBarHeight] = useState(STICKY_TOP_ROW);
  const isDesktop = useIsDesktop();

  const coverRef = registration?.coverRef;
  const tabsSourceRef = registration?.tabs?.sourceRef;
  const actionsSourceRef = registration?.actions?.sourceRef;
  const backSourceRef = registration?.back?.sourceRef;

  // Şeridin yüksekliği HER render'dan sonra doğrulanır (bilerek bağımlılık
  // dizisi yok): satırlar açılıp kapandıkça, mobil/masaüstü arasında geçildikçe
  // ve yazı ölçeği değiştikçe değişiyor, hap da tam altına oturmalı.
  //
  // ResizeObserver'a bırakılmıyordu: ölçümü boyanmadan önce değil, React
  // render'ından SONRA ayrı bir turda geldiği için şerit büyüdüğünde hap bir
  // süre eski yerinde — yani şeridin İÇİNDE — kalıyordu. useLayoutEffect ölçüyü
  // aynı kare içinde, ekrana çizilmeden önce günceller.
  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const h = el.offsetHeight;
    setBarHeight((prev) => (prev === h ? prev : h));
  });

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
      const backEl = backSourceRef?.current;
      const next = {
        title,
        tabs: title && scrolledPast(tabsSourceRef),
        actions: title && scrolledPast(actionsSourceRef),
        // Hap, sayfanın KENDİ geri bağlantısı hapın oturacağı çizgiye gelir
        // gelmez belirir — şeridin açılmasını BEKLEMEZ. Beklediğinde, bağlantı
        // sol üstteki yüzen logonun (position:fixed, 10–58 px) altına girip
        // gömülüyor, şerit ise ancak kapak tamamen yukarı kayınca açıldığı için
        // arada geri düğmesinin görünmediği bir aralık kalıyordu.
        //
        // Eşik, hapın şerit KAPALIYKEN oturduğu çizgi (STICKY_TOP_ROW): devir
        // teslim tam da iki hapın aynı hizaya geldiği anda olur, yani göz bir
        // sıçrama görmez. Çizgi logo bandının (10–58) altında kaldığı için de
        // hap hiçbir zaman logoyla çakışmaz.
        //
        // Şeridin O ANKİ yüksekliği KULLANILMAZ: sekmeler açılınca şerit büyüyor,
        // yukarı geri kaydırıldığında ise küçülme ölçümü kaydırma olayından sonra
        // geldiği için eşik bayat kalıyor ve hap sayfanın en tepesinde de açık
        // kalıyordu.
        //
        // (sourceRef vermeden kaydeden bir sayfa olursa eski davranış: şeridin
        // başlık satırıyla birlikte açılır.)
        back: backEl ? backEl.getBoundingClientRect().top <= STICKY_TOP_ROW : title,
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

  // Hap devredeyken sayfanın KAPAKTAKİ kendi geri bağlantısı gizlenir; böylece
  // ekranda her an tek bir geri hapı olur. Yoksa ikisi bir süre yan yana duruyor,
  // hemen ardından kapaktaki logonun altına girip "gömülmüş" gibi görünüyordu.
  //
  // Gizleme neden burada: altı detay sayfasının dördü kapak bağlantısını
  // EntityCover'ın `back` prop'una veriyor, ikisi (proje, departman) kendi
  // işaretlemesine koyuyor. Hepsinin ORTAK noktası usePageHeader'a verdikleri
  // sourceRef — şeridin zaten her kaydırmada ölçtüğü öğe.
  //
  // `visibility`, `display` DEĞİL: öğe yerini korumalı. Hem sayfa zıplamamalı,
  // hem de eşiği hesaplayan getBoundingClientRect geçerli kalmalı; display:none
  // ile rect sıfırlanır, eşik (top <= STICKY_TOP_ROW) kalıcı olarak sağlanır ve
  // yukarı geri kaydırıldığında kapaktaki bağlantı bir daha geri gelmezdi.
  const backActive = visibleOn && stage.back && Boolean(registration?.back);
  useEffect(() => {
    const el = backSourceRef?.current;
    if (!el) return;
    el.style.visibility = backActive ? "hidden" : "";
    return () => {
      el.style.visibility = "";
    };
  }, [backActive, backSourceRef]);

  if (!visibleOn || !registration) return null;

  const passed = stage.title;
  const showTabs = stage.tabs && Boolean(registration.tabs);
  // Mobilde de gösteriliyor: dar ekranda bu kontroller eskiden hiç kopyalanmıyor,
  // sayfadaki asılları da şeridin altında kaldığı için kaydırınca tamamen
  // erişilemez oluyordu. Masaüstünde başlık satırının içinde, mobilde kendi
  // satırlarında dururlar.
  const showActions = stage.actions && Boolean(registration.actions);
  const showBack = backActive;

  return (
    <>
    <div
      ref={barRef}
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
    </div>

      {/* GERİ HAPI — şeridin ALTINDA yüzen, kendi zemini olmayan bant: bandın
          kendisi şeffaf (tıklama da geçer, pointerEvents "none"), yalnızca
          hapın kendisi görünür ve tıklanabilir. Şeridin gerçek yüksekliğine
          göre konumlandığı (barHeight) için soldaki yüzen logoyla (yalnızca
          üst satırın hizasında) asla çakışmaz — her sayfada aynı yere, aynı
          şekilde oturur. */}
      {showBack && registration.back && (
        <div
          style={{
            position: "fixed",
            top: barHeight,
            left,
            right: 0,
            zIndex: 36,
            // Yatay boşluk kapağınkiyle AYNI olmalı (bkz. lib/layout.ts): iki
            // hap devir teslimde aynı dikey çizgide buluşuyor, farklı olursa
            // hap yana zıplıyordu.
            padding: `${isDesktop ? 10 : 8}px ${pageGutter(isDesktop)}px`,
            pointerEvents: "none",
          }}
        >
          {/* Kapaktakiyle AYNI bileşen: tasarımın iki yerde ayrı ayrı yazılması
              karanlık modda iki farklı hap görünmesine yol açıyordu. */}
          <span style={{ pointerEvents: "auto", display: "inline-flex" }}>
            <CoverBackLink to={registration.back.to} label={registration.back.label} floating />
          </span>
        </div>
      )}
    </>
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
    // Gizlilik politikası ve kullanıcı sözleşmesi herkese açık olmalı: Meta
    // (WhatsApp Business Platform) app'i yayınlarken giriş gerektirmeyen bir
    // politika URL'i zorunlu tutuyor; sözleşmeye de kayıt olmadan bakılabilmeli
    // (kabul ettiği metni okumak için hesap açmak zorunda kalmasın).
    location.pathname === "/privacy" ||
    location.pathname === "/terms";
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
  //
  // Masaüstündeki varsayılan Ayarlar > Gezinme'den değiştirilebilir; mobilde
  // çekmece her zaman kapalı başlar (açık başlasa içeriğin üstünü örterdi).
  const prefs = useAppPrefs();
  const sidebarDefault = isDesktop && getSidebarDefaultOpen(true);
  const [sidebarOpen, setSidebarOpen] = useState(sidebarDefault);
  useEffect(() => {
    setSidebarOpen(sidebarDefault);
  }, [sidebarDefault]);
  // Giriş yapmış her kullanıcı için bir kez kontrol edilir: onboardingCompletedAt
  // boşsa (yeni kayıt ya da bu özellik eklenmeden önce kaydolmuş mevcut kullanıcı)
  // sihirbaz gösterilir, tamamlanana kadar uygulamanın geri kalanı erişilemez.
  const [me, setMe] = useState<User | null>(null);

  const reloadMe = () => {
    if (!hasToken || isAuthScreen) return;
    api.get<User>("/auth/me").then(setMe).catch(() => setMe(null));
  };

  useEffect(reloadMe, [hasToken, isAuthScreen]);

  // Oturumu her açılışta tazele ki süre "son kullanımdan itibaren" işlesin —
  // düzenli kullanan biri token ömrü dolduğu için giriş ekranına düşmesin
  // (bkz. lib/session.ts). Bilerek yalnızca bir kez: sayfa gezinmeleri App'i
  // yeniden mount etmiyor.
  useEffect(() => {
    if (hasToken && !isAuthScreen) void refreshSession();
  }, []);

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
        <Route path="/terms" element={<Terms />} />
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

  const c = useThemeColors();

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
        {/* Lio balonu ve kişi şeridi ekranda sürekli duran öğeler; ikisi de
            Ayarlar > Yardımcılar'dan gizlenebilir (bkz. lib/appPrefs.tsx). */}
        {prefs.showLio && <AiLauncher />}
        {/* Aynı sayfada başka kim çalışıyor — sol altta ince şerit
            (bkz. lib/liveRoom.ts). Kenar çubuğu açıkken içerik sütununa hizalanır. */}
        {prefs.showPresence && <PresenceStrip left={isDesktop && sidebarOpen ? SIDEBAR_WIDTH : 0} />}
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
          <BottomNav sidebarOpen={isDesktop && sidebarOpen} />
        </ProjectFabContext.Provider>
      </div>
    </div>
    </TourProvider>
    </PageHeaderProvider>
    </UndoProvider>
  );
}
