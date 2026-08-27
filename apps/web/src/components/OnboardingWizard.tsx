import { useEffect, useState } from "react";
import { Z } from "../lib/layout";
import { useNavigate } from "react-router-dom";
import type { AccountType, DepartmentCatalogEntry, OrgType } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import { onEnter } from "../lib/enterAction";
import { IconUser, IconBuilding, IconLayers, IconCheck, IconShield, IconChevronRight } from "./icons";

interface Props {
  onCompleted: () => void;
}

const OPTIONS: { type: AccountType; title: string; description: string; icon: typeof IconUser }[] = [
  {
    type: "freelancer",
    title: "Bireysel çalışıyorum",
    description: "Serbest çalışan olarak kendi işlerini/projelerini yönetmek istiyorsun.",
    icon: IconUser,
  },
  {
    type: "organization_owner",
    title: "Bir şirket/işletme yönetiyorum",
    description: "İşlerini bir şirket ya da işletme çatısı altında toplamak istiyorsun.",
    icon: IconBuilding,
  },
  {
    type: "group_owner",
    title: "Birden fazla şirketim var",
    description: "Bir holding gibi birden çok organizasyonu tek yerden yönetmek istiyorsun.",
    icon: IconLayers,
  },
  {
    type: "employee",
    title: "Bir şirkette çalışıyorum",
    description: "Bir departmanın kadrosuna davetle bağlanacaksın; işvereninin sana göndereceği daveti bekleyebilirsin.",
    icon: IconUser,
  },
  {
    type: "subcontractor",
    title: "Taşeronum",
    description: "Bağlı olacağın departmanın yalnızca ilgili modülünü yöneteceksin.",
    icon: IconShield,
  },
];

const ORG_TYPE_OPTIONS: { type: OrgType; title: string; description: string }[] = [
  { type: "sirket", title: "Şirket", description: "Büyük ölçekli, çok departmanlı bir yapı." },
  { type: "isletme", title: "İşletme", description: "Daha küçük ölçekli bir yapı." },
];

// Uygulamayı ilk kez (ya da mevcut kullanıcılar için ilk yeniden girişte) açan herkese
// bir kez gösterilir; hesap tipini belirler ve gerekirse aynı anda Organizasyon/Grup
// oluşturur. Kapatılamaz — tamamlanmadan arkasındaki uygulama kullanılamaz.
//
// "Bir şirket/işletme yönetiyorum" seçilirse ikinci bir adıma geçilir: şirket kurulurken
// departmanlar da doğrudan burada seçilebilir (Doküman 1'deki kurulum sihirbazı akışı).
export default function OnboardingWizard({ onCompleted }: Props) {
  const c = useThemeColors();
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [selected, setSelected] = useState<AccountType | null>(null);
  const [name, setName] = useState("");
  const [orgType, setOrgType] = useState<OrgType>("sirket");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [catalog, setCatalog] = useState<DepartmentCatalogEntry[]>([]);
  const [selectedDeptKeys, setSelectedDeptKeys] = useState<string[]>([]);
  const [customDept, setCustomDept] = useState("");

  useEffect(() => {
    api
      .get<DepartmentCatalogEntry[]>("/department-catalog")
      .then(setCatalog)
      .catch(() => setCatalog([]));
  }, []);

  const needsName = selected === "organization_owner" || selected === "group_owner";

  const toggleDept = (key: string) => {
    setSelectedDeptKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  // Adım 1: hesap tipini ve (gerekliyse) ad/ölçeği doğrular. Şirket/işletme
  // yönetiyorsa 2. adıma (departman seçimi) geçer; diğer tiplerde doğrudan kaydeder.
  const handleContinue = async () => {
    if (!selected) return;
    if (needsName && !name.trim()) {
      setError(selected === "organization_owner" ? "Şirket/işletme adını gir" : "Grup adını gir");
      return;
    }
    setError("");
    if (selected === "organization_owner") {
      setStep(2);
      return;
    }
    await finish();
  };

  // Adım 2: organizasyonu (ve varsa seçilen departmanları) oluşturup bitirir.
  const finish = async () => {
    setLoading(true);
    try {
      const result = await api.patch<{ organizationId?: string; groupId?: string }>("/users/me/onboarding", {
        accountType: selected,
        organizationName: selected === "organization_owner" ? name.trim() : undefined,
        orgType: selected === "organization_owner" ? orgType : undefined,
        groupName: selected === "group_owner" ? name.trim() : undefined,
      });

      if (result?.organizationId) {
        for (const key of selectedDeptKeys) {
          await api.post(`/organizations/${result.organizationId}/departments`, { catalogKey: key }).catch(() => {});
        }
        if (customDept.trim()) {
          await api.post(`/organizations/${result.organizationId}/departments`, { name: customDept.trim() }).catch(() => {});
        }
      }

      // Şirket/işletme ya da holding kurduysa doğrudan oraya yönlendir — anasayfada
      // "işlerim" listesi yerine az önce kurduğu yapının departman görünümünü görsün.
      if (result?.organizationId) navigate(`/organizations/${result.organizationId}`, { replace: true });
      else if (result?.groupId) navigate(`/groups/${result.groupId}`, { replace: true });
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
        zIndex: Z.onboarding,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        overflowY: "auto",
      }}
    >
      <div style={{ width: "100%", maxWidth: 480 }}>
        {step === 1 ? (
          <>
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
                  {selected === "organization_owner" ? "Şirket/işletme adı" : "Grup (holding) adı"}
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={onEnter(() => selected && !loading && void handleContinue())}
                  placeholder={selected === "organization_owner" ? "Örn. Acme Yazılım A.Ş." : "Örn. Acme Holding"}
                  style={{ width: "100%" }}
                  autoFocus
                />
              </div>
            )}

            {selected === "organization_owner" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18 }}>
                <label style={{ fontSize: 15, color: c.textSecondary }}>Ölçek</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {ORG_TYPE_OPTIONS.map((opt) => {
                    const active = orgType === opt.type;
                    return (
                      <button
                        key={opt.type}
                        onClick={() => setOrgType(opt.type)}
                        style={{
                          flex: 1,
                          textAlign: "left",
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: `1.5px solid ${active ? c.primary : c.border}`,
                          background: active ? c.background : c.surface,
                        }}
                      >
                        <span style={{ display: "block", fontSize: 15, fontWeight: 500, color: c.textPrimary }}>{opt.title}</span>
                        <span style={{ display: "block", fontSize: 13, color: c.textSecondary }}>{opt.description}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {error && <p style={{ color: c.danger, fontSize: 15, margin: "0 0 14px" }}>{error}</p>}

            <button
              onClick={handleContinue}
              disabled={!selected || loading}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: "12px 0",
                borderRadius: 10,
                border: "none",
                background: c.primary,
                color: "#fff",
                fontSize: 17,
                fontWeight: 500,
              }}
            >
              {loading ? "Kaydediliyor…" : selected === "organization_owner" ? "Devam et — departmanları seç" : "Devam et"}
              {!loading && selected === "organization_owner" && <IconChevronRight size={16} color="#fff" />}
            </button>
          </>
        ) : (
          <>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <h1 style={{ fontSize: 22, fontWeight: 600, color: c.textPrimary, margin: "0 0 8px" }}>Departmanlarını seç</h1>
              <p style={{ fontSize: 16, color: c.textSecondary, margin: 0, lineHeight: 1.5 }}>
                "{name.trim()}" için ISO 9001 uyumlu standart departmanlardan istediklerini işaretle. İstersen bu adımı
                boş geçip departmanları daha sonra da ekleyebilirsin.
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8, marginBottom: 16 }}>
              {catalog.map((entry) => {
                const active = selectedDeptKeys.includes(entry.key);
                return (
                  <button
                    key={entry.key}
                    onClick={() => toggleDept(entry.key)}
                    style={{
                      textAlign: "left",
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: `1.5px solid ${active ? c.primary : c.border}`,
                      background: active ? c.background : c.surface,
                      fontSize: 14,
                      color: c.textPrimary,
                    }}
                  >
                    {entry.name}
                  </button>
                );
              })}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18 }}>
              <label style={{ fontSize: 15, color: c.textSecondary }}>Ya da özel departman adı (opsiyonel)</label>
              <input
                value={customDept}
                onChange={(e) => setCustomDept(e.target.value)}
                onKeyDown={onEnter(() => !loading && void finish())}
                placeholder="Örn. Ar-Ge"
                style={{ width: "100%" }}
              />
            </div>

            {error && <p style={{ color: c.danger, fontSize: 15, margin: "0 0 14px" }}>{error}</p>}

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setStep(1)}
                disabled={loading}
                style={{
                  padding: "12px 18px",
                  borderRadius: 10,
                  border: `1px solid ${c.border}`,
                  background: c.surface,
                  color: c.textPrimary,
                  fontSize: 16,
                }}
              >
                Geri
              </button>
              <button
                onClick={finish}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: "12px 0",
                  borderRadius: 10,
                  border: "none",
                  background: c.primary,
                  color: "#fff",
                  fontSize: 17,
                  fontWeight: 500,
                }}
              >
                {loading ? "Kuruluyor…" : "Şirketi oluştur"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
