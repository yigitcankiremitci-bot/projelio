import { useState } from "react";
import type { AccountType } from "@projelio/shared";
import { api } from "../api/client";
import { colors } from "../theme/colors";
import { IconUser, IconBuilding, IconLayers, IconCheck } from "./icons";

interface Props {
  onCompleted: () => void;
}

const OPTIONS: { type: AccountType; title: string; description: string; icon: typeof IconUser }[] = [
  {
    type: "freelancer",
    title: "Bireysel çalışıyorum",
    description: "Serbest çalışan ya da taşeron olarak kendi işlerini/projelerini yönetmek istiyorsun.",
    icon: IconUser,
  },
  {
    type: "organization_owner",
    title: "Bir şirket yönetiyorum",
    description: "İşlerini bir şirket/marka çatısı altında toplamak istiyorsun.",
    icon: IconBuilding,
  },
  {
    type: "group_owner",
    title: "Birden fazla şirketim var",
    description: "Bir holding gibi birden çok organizasyonu tek yerden yönetmek istiyorsun.",
    icon: IconLayers,
  },
];

// Uygulamayı ilk kez (ya da mevcut kullanıcılar için ilk yeniden girişte) açan herkese
// bir kez gösterilir; hesap tipini belirler ve gerekirse aynı anda Organizasyon/Grup
// oluşturur. Kapatılamaz — tamamlanmadan arkasındaki uygulama kullanılamaz.
export default function OnboardingWizard({ onCompleted }: Props) {
  const c = colors.light;
  const [selected, setSelected] = useState<AccountType | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const needsName = selected === "organization_owner" || selected === "group_owner";

  const handleSubmit = async () => {
    if (!selected) return;
    if (needsName && !name.trim()) {
      setError(selected === "organization_owner" ? "Organizasyon adını gir" : "Grup adını gir");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await api.patch("/users/me/onboarding", {
        accountType: selected,
        organizationName: selected === "organization_owner" ? name.trim() : undefined,
        groupName: selected === "group_owner" ? name.trim() : undefined,
      });
      onCompleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir şeyler ters gitti, tekrar dene.");
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: c.background,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        overflowY: "auto",
      }}
    >
      <div style={{ width: "100%", maxWidth: 480 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <span
            style={{
              display: "inline-flex",
              width: 40,
              height: 40,
              borderRadius: 10,
              background: c.accent,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 14,
            }}
          >
            <IconCheck size={20} color={c.primaryDark} />
          </span>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: c.textPrimary, margin: "0 0 8px" }}>Projelio'ya hoş geldin</h1>
          <p style={{ fontSize: 16, color: c.textSecondary, margin: 0, lineHeight: 1.5 }}>
            Nasıl çalıştığını seç, arayüzü buna göre ayarlayalım. Bunu istediğin zaman değiştirebilirsin.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
          {OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = selected === opt.type;
            return (
              <button
                key={opt.type}
                onClick={() => setSelected(opt.type)}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  textAlign: "left",
                  padding: "14px 16px",
                  borderRadius: 12,
                  border: `1.5px solid ${active ? c.primary : c.border}`,
                  background: active ? c.background : c.surface,
                }}
              >
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 36,
                    height: 36,
                    borderRadius: 9,
                    background: active ? c.primary : c.background,
                    flexShrink: 0,
                  }}
                >
                  <Icon size={17} color={active ? "#fff" : c.textSecondary} />
                </span>
                <span>
                  <span style={{ display: "block", fontSize: 16, fontWeight: 500, color: c.textPrimary, marginBottom: 2 }}>
                    {opt.title}
                  </span>
                  <span style={{ display: "block", fontSize: 14, color: c.textSecondary, lineHeight: 1.4 }}>
                    {opt.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {needsName && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18 }}>
            <label style={{ fontSize: 15, color: c.textSecondary }}>
              {selected === "organization_owner" ? "Organizasyon adı" : "Grup (holding) adı"}
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={selected === "organization_owner" ? "Örn. Acme Yazılım A.Ş." : "Örn. Acme Holding"}
              style={{ width: "100%" }}
              autoFocus
            />
          </div>
        )}

        {error && <p style={{ color: c.danger, fontSize: 15, margin: "0 0 14px" }}>{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={!selected || loading}
          style={{
            width: "100%",
            padding: "12px 0",
            borderRadius: 10,
            border: "none",
            background: c.primary,
            color: "#fff",
            fontSize: 17,
            fontWeight: 500,
          }}
        >
          {loading ? "Kaydediliyor…" : "Devam et"}
        </button>
      </div>
    </div>
  );
}
