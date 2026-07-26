import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { colors } from "../theme/colors";
import { IconShield, IconLogout, IconChevronRight, IconArchive } from "../components/icons";
import {
  FONT_SCALE_OPTIONS,
  FONT_SCALE_LABELS,
  FONT_SCALE_VALUES,
  FontScaleOption,
  getFontScaleOption,
  setFontScaleOption,
} from "../lib/fontScale";

const rowStyle: React.CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "14px 16px",
  background: "transparent",
  border: "none",
  textAlign: "left",
};

export default function Settings() {
  const c = colors.light;
  const navigate = useNavigate();
  const [fontScale, setFontScale] = useState<FontScaleOption>(getFontScaleOption());

  const handleLogout = () => {
    localStorage.removeItem("projelio_token");
    navigate("/login");
  };

  const handleFontScaleChange = (option: FontScaleOption) => {
    if (option === fontScale) return;
    setFontScale(option);
    setFontScaleOption(option);
    // Uygulama genelindeki yazı boyutu <html> üzerinde uygulanıyor; en temiz
    // ve tutarlı yol sayfayı yeniden yüklemek (index.html'deki script bunu
    // boyamadan önce uygular, titreme olmaz).
    window.location.reload();
  };

  return (
    <div style={{ minHeight: "100vh", background: c.background, padding: 28 }}>
      <h1 style={{ fontSize: 22, fontWeight: 500, color: c.textPrimary, margin: "0 0 20px" }}>Ayarlar</h1>

      <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, overflow: "hidden", maxWidth: 420 }}>
        <button onClick={() => navigate("/admin")} style={rowStyle}>
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <IconShield size={17} color={c.textSecondary} />
            <span style={{ fontSize: 17, color: c.textPrimary }}>Admin paneli</span>
          </span>
          <IconChevronRight size={16} color={c.textSecondary} />
        </button>

        <div style={{ borderTop: `1px solid ${c.border}` }} />

        <button onClick={() => navigate("/settings/archive")} style={rowStyle}>
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <IconArchive size={17} color={c.textSecondary} />
            <span style={{ fontSize: 17, color: c.textPrimary }}>Arşiv</span>
          </span>
          <IconChevronRight size={16} color={c.textSecondary} />
        </button>

        <div style={{ borderTop: `1px solid ${c.border}` }} />

        <button onClick={handleLogout} style={rowStyle}>
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <IconLogout size={17} color={c.danger} />
            <span style={{ fontSize: 17, color: c.danger }}>Çıkış yap</span>
          </span>
        </button>
      </div>

      <h2 style={{ fontSize: 15, fontWeight: 500, color: c.textSecondary, margin: "26px 0 10px", maxWidth: 420 }}>
        Erişilebilirlik
      </h2>

      <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, padding: 16, maxWidth: 420 }}>
        <div style={{ fontSize: 16, color: c.textPrimary, marginBottom: 4 }}>Yazı boyutu</div>
        <p style={{ fontSize: 13, color: c.textSecondary, margin: "0 0 14px", lineHeight: 1.4 }}>
          Görme zorluğu yaşıyorsan uygulamadaki yazıları ve arayüzü büyütebilirsin.
        </p>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {FONT_SCALE_OPTIONS.map((option) => {
            const active = fontScale === option;
            return (
              <button
                key={option}
                onClick={() => handleFontScaleChange(option)}
                aria-pressed={active}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: `1.5px solid ${active ? c.primary : c.border}`,
                  background: active ? c.background : "transparent",
                  minWidth: 70,
                }}
              >
                <span style={{ fontSize: Math.round(FONT_SCALE_VALUES[option] * 14), fontWeight: 600, color: c.textPrimary, lineHeight: 1 }}>
                  A
                </span>
                <span style={{ fontSize: 11, color: active ? c.primary : c.textSecondary, fontWeight: active ? 500 : 400 }}>
                  {FONT_SCALE_LABELS[option]}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
