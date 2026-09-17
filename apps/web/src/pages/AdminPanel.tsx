import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import type { User } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import { IconShield } from "../components/icons";
import AiCreditAdminPanel from "../components/AiCreditAdminPanel";
import AiCreditOrdersAdmin from "../components/AiCreditOrdersAdmin";
import AdminKullanicilarPanel from "../components/AdminKullanicilarPanel";
import BillingAdminPanel from "../components/BillingAdminPanel";
import SupportAdminPanel from "../components/SupportAdminPanel";
import DemoAdminPanel from "../components/DemoAdminPanel";
import DemoZiyaretleriPanel from "../components/DemoZiyaretleriPanel";
import WhatsappNumbersPanel from "../components/WhatsappNumbersPanel";
import TabBar from "../components/TabBar";
import { useIsDesktop } from "../lib/useIsDesktop";
import { pageGutter } from "../lib/layout";
import { useT } from "../lib/i18n";
import type { ThemeColors } from "@projelio/shared";

type AdminTab =
  | "kullanicilar"
  | "bakiye"
  | "siparisler"
  | "saglayicilar"
  | "paketler"
  | "destek"
  | "demo"
  | "ziyaretler"
  | "whatsapp";

/**
 * Sekme etiketleri modül düzeyinde, t() burada çağrılamaz (kanca yok); Türkçe
 * metin anahtar olarak duruyor, çeviri kullanıldığı yerde yapılıyor (bkz.
 * Settings.tsx'teki aynı düzen).
 *
 * Eskiden tüm paneller tek sayfada alt alta diziliyordu; sayfa uzadıkça
 * aranan bölümü bulmak kaydırmaya dönüşmüştü. Her özellik artık kendi sekmesinde.
 */
const TABS: { key: AdminTab; label: string }[] = [
  { key: "kullanicilar", label: "Kullanıcılar" },
  { key: "bakiye", label: "Lio Bakiyesi" },
  { key: "siparisler", label: "Bakiye siparişleri" },
  { key: "saglayicilar", label: "AI sağlayıcıları" },
  { key: "paketler", label: "Paketler ve ödeme" },
  { key: "destek", label: "Destek" },
  { key: "demo", label: "Demo hesabı" },
  { key: "ziyaretler", label: "Demo ziyaretleri" },
  { key: "whatsapp", label: "WhatsApp numaraları" },
];

const NAV_WIDTH = 200;

// Ayarlar sayfasındaki menüyle aynı görünüm (bkz. Settings.tsx navItemStyle).
function navItemStyle(active: boolean, c: ThemeColors): CSSProperties {
  return {
    width: "100%",
    display: "flex",
    alignItems: "center",
    padding: "10px 14px",
    borderRadius: 9,
    border: "none",
    cursor: "pointer",
    background: active ? c.surface : "transparent",
    color: active ? c.textPrimary : c.textSecondary,
    fontSize: 15,
    fontWeight: active ? 500 : 400,
    textAlign: "left",
  };
}

/**
 * Bu sayfa yalnızca role === "admin" olan kullanıcılara açılır.
 * Not: Sidebar'daki "Admin" linki de zaten yalnızca admin'lere gösteriliyor
 * (bkz. App.tsx / Sidebar.tsx); buradaki kontrol, birisi /admin adresine
 * doğrudan girerse diye ikinci bir savunma katmanıdır. Asıl güvenlik zaten
 * backend'de: her admin endpoint'i (kredi yükleme, marj raporu, bakiye
 * takibi) req.user.role === "admin" olmadan 403 döner.
 */
export default function AdminPanel() {
  const c = useThemeColors();
  const t = useT();
  const isDesktop = useIsDesktop();
  const gutter = pageGutter(isDesktop);
  const [me, setMe] = useState<User | null | undefined>(undefined);
  // Seçili sekme adreste tutulur: sayfa yenilenince ya da bağlantı
  // paylaşılınca aynı sekme açılsın (/admin?sekme=destek). Geçersiz değer
  // varsayılana düşer.
  const [searchParams, setSearchParams] = useSearchParams();
  const istenen = searchParams.get("sekme");
  const tab: AdminTab = TABS.some((s) => s.key === istenen) ? (istenen as AdminTab) : "kullanicilar";
  const setTab = (key: AdminTab) => {
    const sonraki = new URLSearchParams(searchParams);
    sonraki.set("sekme", key);
    setSearchParams(sonraki, { replace: true });
  };
  // Kredi siparişi onaylanınca Kullanıcılar listesindeki bakiyeler tazelensin.
  const [kullaniciYenile, setKullaniciYenile] = useState(0);

  useEffect(() => {
    api
      .get<User>("/auth/me")
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  if (me === undefined) return null;

  if (!me || me.role !== "admin") {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: c.background,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 320,
            background: c.surface,
            border: `1px solid ${c.border}`,
            borderRadius: 14,
            padding: "32px 28px",
            textAlign: "center",
          }}
        >
          <span
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: c.primaryDark,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 14,
            }}
          >
            <IconShield size={18} color={c.accent} />
          </span>
          <h2 style={{ color: c.textPrimary, fontSize: 20, fontWeight: 500, margin: "0 0 8px" }}>
            {t("Bu sayfaya erişim yetkin yok")}
          </h2>
          <p style={{ color: c.textSecondary, fontSize: 14, margin: 0, lineHeight: 1.5 }}>
            {t("Admin paneli yalnızca yönetici hesapları içindir.")}
          </p>
        </div>
      </div>
    );
  }

  // Yalnızca açık sekmenin paneli bağlanır: her panel açılışta kendi verisini
  // çekiyor, dokuzunu birden yüklemek sayfayı gereksiz yavaşlatırdı.
  const TAB_CONTENT: Record<AdminTab, () => ReactNode> = {
    kullanicilar: () => <AdminKullanicilarPanel yenile={kullaniciYenile} />,
    bakiye: () => <AiCreditAdminPanel bolum="bakiye" />,
    // Sipariş onaylanınca Kullanıcılar sekmesine dönüldüğünde bakiyeler taze olsun.
    siparisler: () => <AiCreditOrdersAdmin onCredited={() => setKullaniciYenile((n) => n + 1)} />,
    saglayicilar: () => <AiCreditAdminPanel bolum="saglayicilar" />,
    paketler: () => <BillingAdminPanel />,
    destek: () => <SupportAdminPanel />,
    demo: () => <DemoAdminPanel />,
    ziyaretler: () => <DemoZiyaretleriPanel />,
    whatsapp: () => <WhatsappNumbersPanel />,
  };

  const tabs = TABS.map((s) => ({ ...s, label: t(s.label) }));
  const icerik = <div style={{ minWidth: 0 }}>{TAB_CONTENT[tab]()}</div>;

  return (
    <div style={{ minHeight: "100vh", background: c.background, padding: `${isDesktop ? 28 : 20}px ${gutter}px 40px` }}>
      <h1 style={{ color: c.textPrimary, fontSize: 22, fontWeight: 500, margin: "0 0 8px" }}>{t("Admin paneli")}</h1>
      <p style={{ color: c.textSecondary, fontSize: 16, margin: "0 0 22px" }}>
        {t("Kullanıcılar, proje istatistikleri ve sistem durumu burada listelenir.")}
      </p>

      {isDesktop ? (
        <div style={{ display: "flex", gap: 28, alignItems: "flex-start" }}>
          <nav
            style={{
              width: NAV_WIDTH,
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              gap: 2,
              position: "sticky",
              top: 96,
            }}
          >
            {tabs.map((s) => (
              <button key={s.key} type="button" onClick={() => setTab(s.key)} style={navItemStyle(tab === s.key, c)}>
                {s.label}
              </button>
            ))}
          </nav>
          <div style={{ flex: 1, minWidth: 0 }}>{icerik}</div>
        </div>
      ) : (
        <>
          <TabBar tabs={tabs} active={tab} onChange={(key) => setTab(key as AdminTab)} scrollable />
          <div style={{ marginTop: 16 }}>{icerik}</div>
        </>
      )}
    </div>
  );
}
