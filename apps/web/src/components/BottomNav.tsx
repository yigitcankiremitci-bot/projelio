import { useContext, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { colors } from "../theme/colors";
import { IconDashboard, IconCalendar, IconListCheck, IconSettings, IconPlus, IconFolder, IconActivity } from "./icons";
import CreateJobModal from "./CreateJobModal";
import CreateProjectModal from "./CreateProjectModal";
import CreateOperationModal from "./CreateOperationModal";
import CreateTaskModal from "./CreateTaskModal";
import CreateOrganizationModal from "./CreateOrganizationModal";
import CreateGroupModal from "./CreateGroupModal";
import { ProjectFabContext } from "../lib/projectFab";
import { useIsDesktop } from "../lib/useIsDesktop";
import { SIDEBAR_WIDTH } from "../lib/layout";
import { useHomeTarget } from "../lib/homeTarget";

const rightItems = [
  { to: "/tasks", label: "Yapılacaklar", icon: IconListCheck },
  { to: "/settings", label: "Ayarlar", icon: IconSettings },
];

type ModalKind = "job" | "project" | "operation" | "task" | "organization" | "group" | "organization-in-group";

export default function BottomNav() {
  const c = colors.light;
  const location = useLocation();
  const isDesktop = useIsDesktop();
  const [modal, setModal] = useState<ModalKind | null>(null);
  const [choosing, setChoosing] = useState(false);
  const { action: fabAction } = useContext(ProjectFabContext);
  const homeTarget = useHomeTarget();

  // Organizasyon/Grup artık burada ayrı bir sekme değil: mobilde de artık üstteki
  // ok ile açılan sidebar (Grup > Organizasyon > İş ağacı) üzerinden erişiliyor,
  // ayrıca ana sayfadaki kısayoldan da ulaşılabiliyor (bkz. Dashboard.tsx).
  // Takvim, "+" butonu ana sayfanın hemen yanında değil de Takvim ile Yapılacaklar'ın
  // ortasında görünsün diye sağdaki değil soldaki gruba (FAB'ın hemen öncesine) alındı.
  // "Ana sayfa" düğmesinin hedefi Ayarlar > Gezinme'den değiştirilebilir
  // (bkz. lib/homeTarget.ts); etiket sabit kalır, değişen sadece gittiği yer.
  const leftItems = [
    { to: homeTarget.path, label: "Ana sayfa", icon: IconDashboard },
    { to: "/calendar", label: "Takvim", icon: IconCalendar },
  ];

  const isActive = (to: string) =>
    to === "/" ? location.pathname === "/" : to.includes("?") ? location.pathname + location.search === to : location.pathname.startsWith(to);

  // Sayfaya göre "+" butonunun ne oluşturacağını belirle: ana sayfada iş, bir işin
  // içindeyken (o an aktif sekme kendi eylemini kaydetmediyse) proje veya görev seçimi,
  // Organizasyonlar/Gruplar sayfalarında ilgili kaydı, bir grubun detayındayken o gruba
  // bağlı yeni bir organizasyon. Bir işin ya da projenin içinde aktif olan sekme
  // ProjectFabContext üzerinden kendi eylemini kaydedebilir; kayıtlıysa "+" butonu
  // öncelikle onu tetikler.
  const jobMatch = location.pathname.match(/^\/jobs\/([^/]+)/);
  const projectMatch = location.pathname.match(/^\/projects\/([^/]+)/);
  const operationMatch = location.pathname.match(/^\/operations\/([^/]+)/);
  const groupDetailMatch = location.pathname.match(/^\/groups\/([^/]+)$/);
  const orgDetailMatch = location.pathname.match(/^\/organizations\/([^/]+)$/);
  const deptDetailMatch = location.pathname.match(/^\/departments\/([^/]+)$/);

  let createAction: "job" | "job-choice" | "custom" | ModalKind | null = null;
  let jobId: string | null = null;
  let groupIdForOrg: string | null = null;
  let fabLabel = "Oluştur";

  // Bir sayfa kendi eylemini kaydettiyse (useProjectFabAction) her zaman o kazanır.
  // Eskiden bu yalnızca iş/proje/rutin/organizasyon/departman detaylarında
  // geçerliydi; o rota listesi her yeni sayfada güncellenmeyi gerektiriyordu ve
  // Yapılacaklar sayfası listede olmadığı için "+" orada "Yeni iş" açıyordu.
  // Eylemi kaydeden sayfa zaten unmount olurken temizliyor, dolayısıyla rota
  // kontrolüne gerek yok.
  if (fabAction) {
    createAction = "custom";
    fabLabel = fabAction.label;
  } else if (jobMatch) {
    createAction = "job-choice";
    jobId = jobMatch[1];
    fabLabel = "Proje, rutin veya görev ekle";
  } else if (location.pathname === "/organizations") {
    createAction = "organization";
    fabLabel = "Yeni organizasyon";
  } else if (location.pathname === "/groups") {
    createAction = "group";
    fabLabel = "Yeni grup";
  } else if (groupDetailMatch) {
    createAction = "organization-in-group";
    groupIdForOrg = groupDetailMatch[1];
    fabLabel = "Bu gruba organizasyon ekle";
  } else if (orgDetailMatch) {
    // Bir organizasyonun içindeyken varsayılan "Yeni iş" eylemi uygulanmaz — şirket/işletme
    // bağlamında iş (job) kavramı yok, "+" o an sayfanın kayıtlı ettiği eyleme (departman
    // ekleme) bağlıdır. Kayıtlı eylem yoksa buton basitçe gizlenir.
    createAction = null;
  } else if (deptDetailMatch) {
    // Departman detayında da varsayılan bir eylem yok — kadro daveti sayfanın kendi
    // "+ Kişi davet et" düğmesiyle yapılır; "+" yalnızca Ürün Yönetimi departmanında
    // ProductsPanel'in kayıt ettirdiği "Ürün/Hizmet ekle" eylemine bağlıdır.
    createAction = null;
  } else {
    // "+" düğmesi diğer tüm sayfalarda da (ana sayfa, takvim, yapılacaklar, ayarlar)
    // görünür ve yeni iş oluşturur.
    createAction = "job";
    fabLabel = "Yeni iş";
  }

  // Kayıtlı eylem birden fazla seçenek sunuyorsa (bkz. ProjectFabAction.options),
  // doğrudan tetiklemek yerine job-choice ile aynı küçük seçim menüsü açılır.
  const hasCustomOptions = createAction === "custom" && !!fabAction?.options?.length;

  const handleFabClick = () => {
    if (createAction === "custom") {
      if (hasCustomOptions) {
        setChoosing((prev) => !prev);
      } else {
        fabAction?.onClick?.();
      }
    } else if (createAction === "job-choice") {
      setChoosing((prev) => !prev);
    } else if (createAction) {
      setModal(createAction);
    }
  };

  const fabButton = (
    <button
      onClick={handleFabClick}
      aria-label={fabLabel}
      style={{
        width: 64,
        height: 64,
        borderRadius: "50%",
        border: `3px solid ${c.surface}`,
        background: c.accent,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "transform 0.15s ease",
        transform: `rotate(${choosing ? 45 : 0}deg)`,
        boxShadow: "0 4px 14px rgba(26,31,41,0.22)",
      }}
    >
      <IconPlus size={28} color={c.primaryDark} />
    </button>
  );

  // jobId'deyken sabit üç seçenek (proje/rutin/görev); özel bir fabAction
  // birden fazla seçenek kaydettiyse (bkz. options) onlar kullanılır.
  const choiceMenuItems: { label: string; icon: typeof IconFolder; onClick: () => void }[] = jobId
    ? [
        { label: "Yeni proje", icon: IconFolder, onClick: () => setModal("project") },
        // Rutin: süresi olmayan, tekrarlayan işlerden oluşan çalışma (kodda "operation").
        { label: "Yeni rutin", icon: IconActivity, onClick: () => setModal("operation") },
        { label: "Yeni görev", icon: IconListCheck, onClick: () => setModal("task") },
      ]
    : hasCustomOptions
    ? fabAction!.options!.map((opt) => ({ label: opt.label, icon: IconPlus, onClick: opt.onClick }))
    : [];

  const choosingMenu = choosing && choiceMenuItems.length > 0 && (
    <div
      style={{
        position: "absolute",
        bottom: 74,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        background: c.surface,
        border: `1px solid ${c.border}`,
        borderRadius: 12,
        padding: 8,
        boxShadow: "0 4px 16px rgba(26,31,41,0.18)",
        zIndex: 31,
      }}
    >
      {choiceMenuItems.map((item) => (
        <button
          key={item.label}
          onClick={() => {
            setChoosing(false);
            item.onClick();
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "9px 14px",
            borderRadius: 8,
            border: "none",
            background: "transparent",
            color: c.textPrimary,
            fontSize: 15,
            whiteSpace: "nowrap",
          }}
        >
          <item.icon size={15} color={c.textSecondary} />
          {item.label}
        </button>
      ))}
    </div>
  );

  const modals = (
    <>
      {modal === "job" && <CreateJobModal onClose={() => setModal(null)} />}
      {modal === "project" && jobId && <CreateProjectModal jobId={jobId} onClose={() => setModal(null)} />}
      {modal === "operation" && jobId && <CreateOperationModal jobId={jobId} onClose={() => setModal(null)} />}
      {modal === "task" && jobId && <CreateTaskModal jobId={jobId} onClose={() => setModal(null)} />}
      {modal === "organization" && <CreateOrganizationModal onClose={() => setModal(null)} />}
      {modal === "group" && <CreateGroupModal onClose={() => setModal(null)} />}
      {modal === "organization-in-group" && groupIdForOrg && (
        <CreateOrganizationModal fixedGroupId={groupIdForOrg} onClose={() => setModal(null)} />
      )}
    </>
  );

  if (isDesktop) {
    // Masaüstünde sol tarafta sidebar zaten tüm navigasyonu sağlıyor; burada sadece
    // "+" oluşturma butonu, sayfanın içerik alanının altında ortalanmış şekilde kalır.
    return (
      <>
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: `calc(50% + ${SIDEBAR_WIDTH / 2}px)`,
            transform: "translateX(-50%)",
            zIndex: 32,
          }}
        >
          {choosingMenu}
          {createAction && fabButton}
        </div>

        {choosing && <div onClick={() => setChoosing(false)} style={{ position: "fixed", inset: 0, zIndex: 29 }} />}

        {modals}
      </>
    );
  }

  return (
    <>
      <nav
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          // Safe-area (çentikli telefonlar) yüksekliğe eklenir. Yükseklik ve üst padding,
          // simge + etiketin bara sığması ve üstten taşmaması için 58px'ten 68px'e çıkarıldı.
          height: "calc(68px + env(safe-area-inset-bottom))",
          background: c.surface,
          borderTop: `1px solid ${c.border}`,
          display: "flex",
          alignItems: "flex-start",
          padding: "0 4px",
          paddingBottom: "env(safe-area-inset-bottom)",
          zIndex: 30,
        }}
      >
        {leftItems.map((item) => {
          const active = isActive(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "10px 2px 6px", minWidth: 0 }}
            >
              <Icon size={18} color={active ? c.accentDark : c.textSecondary} />
              <span
                style={{
                  fontSize: 11,
                  color: active ? c.accentDark : c.textSecondary,
                  fontWeight: active ? 500 : 400,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: "100%",
                }}
              >
                {item.label}
              </span>
            </Link>
          );
        })}

        <div style={{ position: "relative", width: 60, height: "100%", flexShrink: 0 }}>
          {createAction && (
            <div style={{ position: "absolute", top: 0, left: "50%", transform: "translate(-50%, -50%)" }}>{fabButton}</div>
          )}
          {choosingMenu}
        </div>

        {rightItems.map((item) => {
          const active = isActive(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "10px 2px 6px", minWidth: 0 }}
            >
              <Icon size={18} color={active ? c.accentDark : c.textSecondary} />
              <span
                style={{
                  fontSize: 11,
                  color: active ? c.accentDark : c.textSecondary,
                  fontWeight: active ? 500 : 400,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: "100%",
                }}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {choosing && <div onClick={() => setChoosing(false)} style={{ position: "fixed", inset: 0, zIndex: 29 }} />}

      {modals}
    </>
  );
}
