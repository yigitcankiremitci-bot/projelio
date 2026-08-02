import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { User } from "@projelio/shared";
import { api } from "../api/client";
import { colors } from "../theme/colors";
import GoogleDriveCard from "../components/GoogleDriveCard";
import { IconShield, IconLogout, IconChevronRight, IconArchive, IconSparkle } from "../components/icons";
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
  const [me, setMe] = useState<User | null>(null);
  const [username, setUsername] = useState("");
  const [savingUsername, setSavingUsername] = useState(false);
  const [usernameError, setUsernameError] = useState("");
  const [usernameSaved, setUsernameSaved] = useState(false);

  useEffect(() => {
    api
      .get<User>("/auth/me")
      .then((u) => {
        setMe(u);
        setUsername(u.username);
      })
      .catch(() => setMe(null));
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("projelio_token");
    navigate("/login");
  };

  const handleUsernameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUsernameError("");
    setUsernameSaved(false);
    setSavingUsername(true);
    try {
      const updated = await api.patch<{ username: string }>("/users/me/username", { username });
      setUsername(updated.username);
      setUsernameSaved(true);
    } catch (err) {
      setUsernameError(err instanceof Error ? err.message : "Kullanıcı adı güncellenemedi.");
    } finally {
      setSavingUsername(false);
    }
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

        <button onClick={() => navigate("/settings/ai-credits")} style={rowStyle}>
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <IconSparkle size={17} color={c.accent} />
            <span style={{ fontSize: 17, color: c.textPrimary }}>AI kredilerim</span>
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
        Bağlı hesaplar
      </h2>

      <div style={{ maxWidth: 420 }}>
        <GoogleDriveCard />
      </div>

      <h2 style={{ fontSize: 15, fontWeight: 500, color: c.textSecondary, margin: "26px 0 10px", maxWidth: 420 }}>
        Hesap
      </h2>

      <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, padding: 16, maxWidth: 420 }}>
        <div style={{ fontSize: 16, color: c.textPrimary, marginBottom: 4 }}>Kullanıcı adı</div>
        <p style={{ fontSize: 13, color: c.textSecondary, margin: "0 0 12px", lineHeight: 1.4 }}>
          Ekip üyesi eklerken seni bu kullanıcı adıyla arayabilirler.
        </p>
        <form onSubmit={handleUsernameSubmit} style={{ display: "flex", gap: 8 }}>
          <div style={{ position: "relative", flex: 1 }}>
            <span
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: c.textSecondary,
                fontSize: 16,
                pointerEvents: "none",
              }}
            >
              @
            </span>
            <input
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value.replace(/^@/, ""));
                setUsernameSaved(false);
              }}
              minLength={3}
              maxLength={30}
              pattern="[a-zA-Z0-9_.]{3,30}"
              style={{ width: "100%", paddingLeft: 26 }}
              disabled={!me}
            />
          </div>
          <button
            type="submit"
            disabled={savingUsername || !me || username === me?.username}
            style={{ background: c.primary, color: "#fff", padding: "0 16px", borderRadius: 8, border: "none", fontSize: 15, fontWeight: 500 }}
          >
            {savingUsername ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </form>
        {usernameError && <p style={{ color: c.danger, fontSize: 14, margin: "8px 0 0" }}>{usernameError}</p>}
        {usernameSaved && !usernameError && (
          <p style={{ color: c.success, fontSize: 14, margin: "8px 0 0" }}>Kullanıcı adı güncellendi.</p>
        )}
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
