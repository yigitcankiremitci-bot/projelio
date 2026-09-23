import { useState } from "react";
import { api } from "../api/client";
import { useT } from "../lib/i18n";
import { Z } from "../lib/layout";
import { useThemeColors } from "../theme/useThemeColors";

interface Props {
  fullName?: string;
  onTamam: () => void;
}

/**
 * "Kendi şifreni belirle" — ekip yöneticisinin açtığı hesapta ilk giriş.
 *
 * KAPATILAMAZ, bilerek: yöneticinin koyduğu şifreyi başkası (yönetici, onu
 * iletirken duyan) biliyor. Kişi kendi şifresini belirleyene kadar hesabın
 * sahibi tam olarak o değil. Mevcut şifre sorulmaz — kişi e-postadaki
 * bağlantıyla şifresiz girdi; sunucu bu kapıyı yalnızca bayrak açıkken
 * açıyor (bkz. UsersService.ilkSifreyiBelirle).
 */
export default function IlkSifreModal({ fullName, onTamam }: Props) {
  const c = useThemeColors();
  const t = useT();
  const [sifre, setSifre] = useState("");
  const [tekrar, setTekrar] = useState("");
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState("");

  const kaydet = async (e: React.FormEvent) => {
    e.preventDefault();
    setHata("");
    if (sifre.length < 8) return setHata(t("Şifre en az 8 karakter olmalı."));
    if (sifre !== tekrar) return setHata(t("Şifreler eşleşmiyor."));
    setBusy(true);
    try {
      await api.post("/auth/ilk-sifre", { newPassword: sifre });
      onTamam();
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Şifre kaydedilemedi."));
    } finally {
      setBusy(false);
    }
  };

  const alan = {
    fontSize: 15,
    padding: "10px 12px",
    width: "100%",
    boxSizing: "border-box" as const,
    borderRadius: 8,
    border: `1px solid ${c.border}`,
    background: c.background,
    color: c.textPrimary,
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: Z.onboarding,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <form
        onSubmit={kaydet}
        style={{
          width: "100%",
          maxWidth: 400,
          background: c.surface,
          border: `1px solid ${c.border}`,
          borderRadius: 14,
          padding: "28px 26px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 20, color: c.textPrimary }}>
          {fullName ? t("Hoş geldin, {ad}", { ad: fullName.split(" ")[0] }) : t("Hoş geldin")}
        </h2>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: c.textSecondary }}>
          {t("Hesabını yöneticin açtı. Devam etmeden önce yalnızca senin bildiğin bir şifre belirle; bundan sonra e-posta adresin ve bu şifreyle giriş yaparsın.")}
        </p>
        <input
          type="password"
          value={sifre}
          onChange={(e) => setSifre(e.target.value)}
          placeholder={t("Yeni şifre (en az 8 karakter)")}
          autoComplete="new-password"
          autoFocus
          style={alan}
        />
        <input
          type="password"
          value={tekrar}
          onChange={(e) => setTekrar(e.target.value)}
          placeholder={t("Yeni şifre (tekrar)")}
          autoComplete="new-password"
          style={alan}
        />
        {hata && <span style={{ fontSize: 13, color: c.danger }}>{hata}</span>}
        <button
          type="submit"
          disabled={busy}
          style={{
            fontSize: 15,
            padding: "11px 16px",
            background: c.primary,
            color: c.onPrimary,
            border: "none",
            borderRadius: 8,
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? t("Kaydediliyor…") : t("Şifremi belirle ve devam et")}
        </button>
      </form>
    </div>
  );
}
