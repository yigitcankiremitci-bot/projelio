import { useEffect, useMemo, useState } from "react";
import { Z, safeTop, safeBottom } from "../lib/layout";
import { useNavigate } from "react-router-dom";
import type {
  AccountType,
  ModuleCatalogEntry,
  OrgType,
  Sector,
  TeamSize,
  UseCase,
} from "@projelio/shared";
import {
  SECTOR_LABEL,
  SECTORS,
  TEAM_SIZE_LABEL,
  TEAM_SIZES,
  USE_CASE_LABEL,
  USE_CASES,
  MODUL_HAKKI,
  modulSayilirMi,
} from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import { onEnter } from "../lib/enterAction";
import { cropAvatarImage } from "../lib/imageProcessing";
import type { CropArea } from "../lib/imageProcessing";
import AvatarCropper from "./AvatarCropper";
import { useT } from "../lib/i18n";
import { yoneticiyeEklenebilir } from "../lib/modulYeri";
import {
  IconUser,
  IconBuilding,
  IconLayers,
  IconCheck,
  IconShield,
  IconChevronRight,
  IconChevronLeft,
  IconUpload,
} from "./icons";

interface Props {
  onCompleted: () => void;
}

// dil:anahtar-baslangic — modül düzeyi etiket sabitleri: burada t()
// çağrılamaz, çeviri render anında yapılıyor.
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
// dil:anahtar-bitis

// Sihirbazın adımları. Hangilerinin gösterileceği hesap tipine göre değişir:
// kendi yapısını kuranlara (organization_owner/group_owner) org adımı eklenir.
// Sıra bu dizideki sıradır.
//
// Şirket kuranlara eskiden bir de departman adımı soruluyordu. Kullanıcı
// hepsini işaretleme eğilimindeydi ve 2-3 kişilik işletmelerde kimsesi olmayan
// bir sürü departman doğuyordu. Artık şirket departmansız kurulur; seçilen
// modüller yöneticide açılır (bkz. lib/modulYeri.ts), departman ekip büyüdükçe
// şirket sayfasından eklenir.
type StepKey = "account" | "profile" | "org" | "usage" | "modules" | "summary";

function stepsFor(accountType: AccountType | null): StepKey[] {
  const steps: StepKey[] = ["account", "profile"];
  if (accountType === "organization_owner" || accountType === "group_owner") steps.push("org");
  steps.push("usage", "modules", "summary");
  return steps;
}

// Uygulamayı ilk kez (ya da mevcut kullanıcılar için ilk yeniden girişte) açan herkese
// bir kez gösterilir; hesap tipini belirler, kişisel profili toplar ve gerekirse aynı
// anda Organizasyon/Grup kurup seçilen modülleri açar. Kapatılamaz — tamamlanmadan
// arkasındaki uygulama kullanılamaz.
//
// Tüm ağ çağrıları SON adımda (finish) yapılır. Adım adım kaydetmiyoruz: kullanıcı
// sihirbazı yarıda bırakırsa yarım bir hesap (tipi yazılmış ama organizasyonu
// kurulmamış) kalmasın diye. Profil alanlarının hepsi opsiyonel, adımlar atlanabilir.
export default function OnboardingWizard({ onCompleted }: Props) {
  const c = useThemeColors();
  const t = useT();
  const navigate = useNavigate();

  const [selected, setSelected] = useState<AccountType | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Adım 2 — kişisel bilgiler
  const [title, setTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [sector, setSector] = useState<Sector | null>(null);
  const [teamSize, setTeamSize] = useState<TeamSize | null>(null);
  const [bio, setBio] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [crop, setCrop] = useState<CropArea | null>(null);

  // Adım 3 — organizasyon/grup
  const [name, setName] = useState("");
  const [orgType, setOrgType] = useState<OrgType>("sirket");

  // Adım 5/6 — kullanım amacı ve modüller
  const [useCases, setUseCases] = useState<UseCase[]>([]);
  const [modules, setModules] = useState<ModuleCatalogEntry[]>([]);
  const [modulesLoading, setModulesLoading] = useState(false);
  const [selectedModuleKeys, setSelectedModuleKeys] = useState<string[]>([]);

  const steps = useMemo(() => stepsFor(selected), [selected]);
  const step = steps[Math.min(stepIndex, steps.length - 1)];

  // Modül listesi hesap tipine göre farklı bir kaynaktan gelir; bu yüzden modül
  // adımına GELİNDİĞİNDE yükleniyor, sihirbaz açılışında değil: hesap tipi
  // birkaç adım önce değiştirilebiliyor.
  useEffect(() => {
    if (step !== "modules") return;
    let cancelled = false;
    setModulesLoading(true);

    const load = async (): Promise<ModuleCatalogEntry[]> => {
      if (selected === "organization_owner") {
        // Henüz departman yok: yöneticide açılabilecek tüm şirket modülleri.
        const all = await api.get<ModuleCatalogEntry[]>("/module-catalog").catch(() => []);
        return all.filter((m) => yoneticiyeEklenebilir(m, [])).sort((a, b) => a.sortOrder - b.sortOrder);
      }
      if (selected === "group_owner") {
        const all = await api.get<ModuleCatalogEntry[]>("/module-catalog").catch(() => []);
        return all.filter((m) => m.scope === "holding");
      }
      // Bireysel/çalışan/taşeron: serbest çalışan panelinde görünen modüller.
      return api.get<ModuleCatalogEntry[]>("/module-catalog?freelancer=true").catch(() => []);
    };

    load()
      .then((list) => {
        if (cancelled) return;
        setModules(list);
        // Artık listede olmayan bir modül seçili kalmasın (hesap tipi değişmiş olabilir).
        const valid = new Set(list.map((m) => m.key));
        setSelectedModuleKeys((prev) => prev.filter((k) => valid.has(k)));
      })
      .finally(() => {
        if (!cancelled) setModulesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [step, selected]);

  // Şirket kuranın modül seçimi ücretsiz paketin hakkıyla sınırlı.
  const kurulumHakki = selected === "organization_owner" ? MODUL_HAKKI.free : null;
  const sayilanSecim = selectedModuleKeys.filter(modulSayilirMi).length;
  const hakDoldu = kurulumHakki !== null && sayilanSecim >= kurulumHakki;

  const toggle = <T,>(setter: React.Dispatch<React.SetStateAction<T[]>>, value: T) => {
    setter((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  };

  const needsName = selected === "organization_owner" || selected === "group_owner";

  // Bir sonraki adıma geçmeden önceki doğrulama. Yalnızca hesap tipi ve (kendi
  // yapısını kuranlarda) ad zorunlu; kalan adımlar boş geçilebilir.
  const validate = (): string => {
    if (step === "account" && !selected) return t("Devam etmek için bir seçenek seç");
    if (step === "org" && !name.trim()) {
      return selected === "organization_owner" ? t("Şirket/işletme adını gir") : t("Grup adını gir");
    }
    return "";
  };

  const goNext = () => {
    const message = validate();
    if (message) {
      setError(message);
      return;
    }
    setError("");
    if (step === "summary") {
      void finish();
      return;
    }
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  };

  const goBack = () => {
    setError("");
    setStepIndex((i) => Math.max(i - 1, 0));
  };

  // Tüm sihirbaz sonuçlarını tek seferde uygular: profil + hesap tipi, ardından
  // (varsa) organizasyon/grup ve şirketin modülleri, en son avatar.
  const finish = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      const result = await api.patch<{ organizationId?: string; groupId?: string }>("/users/me/onboarding", {
        accountType: selected,
        organizationName: selected === "organization_owner" ? name.trim() : undefined,
        orgType: selected === "organization_owner" ? orgType : undefined,
        groupName: selected === "group_owner" ? name.trim() : undefined,
        title: title.trim() || undefined,
        bio: bio.trim() || undefined,
        phone: phone.trim() || undefined,
        sector: sector ?? undefined,
        teamSize: teamSize ?? undefined,
        useCases: useCases.length ? useCases : undefined,
        onboardingModules: selectedModuleKeys.length ? selectedModuleKeys : undefined,
      });

      // Şirkette seçilen modüller gerçekten açılır (yöneticide). Eskiden yalnızca
      // users.onboarding_modules'a "tercih" olarak yazılıyor, hiçbir şey
      // açılmıyordu. Hata yutuluyor: modül sonradan "Modül ekle"den de açılır,
      // kurulumun tamamı bunun için geri alınmasın.
      if (result?.organizationId && selectedModuleKeys.length) {
        // Geri dönülüp seçim değiştiyse hak aşılmış olabilir; sunucu o zaman
        // HEPSİNİ reddederdi. Hakka sayılanlardan ilk N'i gönderilir.
        let sayilan = 0;
        const gonderilecek = selectedModuleKeys.filter((k) => !modulSayilirMi(k) || ++sayilan <= (kurulumHakki ?? Infinity));
        await api
          .post(`/organizations/${result.organizationId}/modules`, { moduleKeys: gonderilecek })
          .catch(() => {});
      }

      // Avatar en sonda ve hatası yutuluyor: fotoğraf yüklenemedi diye kurulumun
      // tamamı geri alınamaz — kullanıcı profil fotoğrafını sonradan da ekleyebilir.
      if (avatarFile && crop) {
        try {
          const cropped = await cropAvatarImage(avatarFile, crop);
          const formData = new FormData();
          formData.append("file", cropped);
          await api.uploadFile("/users/me/avatar", formData);
        } catch {
          /* yoksay */
        }
      }

      // Şirket/işletme ya da holding kurduysa doğrudan oraya yönlendir — anasayfada
      // "işlerim" listesi yerine az önce kurduğu yapının departman görünümünü görsün.
      if (result?.organizationId) navigate(`/organizations/${result.organizationId}`, { replace: true });
      else if (result?.groupId) navigate(`/groups/${result.groupId}`, { replace: true });
      onCompleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Bir şeyler ters gitti, tekrar dene."));
      setLoading(false);
    }
  };

  // ------------------------------------------------------------- ortak parçalar

  const cardStyle = (active: boolean) => ({
    textAlign: "left" as const,
    padding: "12px 14px",
    borderRadius: 10,
    border: `1.5px solid ${active ? c.primary : c.border}`,
    background: active ? c.background : c.surface,
    color: c.textPrimary,
    fontSize: 15,
  });

  const fieldLabel = { fontSize: 15, color: c.textSecondary } as const;

  const Header = ({ heading, sub }: { heading: string; sub: string }) => (
    <div style={{ textAlign: "center", marginBottom: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: c.textPrimary, margin: "0 0 8px" }}>{heading}</h1>
      <p style={{ fontSize: 16, color: c.textSecondary, margin: 0, lineHeight: 1.5 }}>{sub}</p>
    </div>
  );

  const selectedModuleNames = modules.filter((m) => selectedModuleKeys.includes(m.key)).map((m) => m.name);
  const accountLabel = OPTIONS.find((o) => o.type === selected)?.title ?? "";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: c.background,
        zIndex: Z.onboarding,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        // Sihirbaz tüm ekranı kaplıyor ve içerik uzayınca üstten başlıyor;
        // mobil kabukta ilk adımın başlığı durum çubuğunun altında kalıyordu.
        padding: `${safeTop(20)} 20px ${safeBottom(20)}`,
        overflowY: "auto",
      }}
    >
      <div style={{ width: "100%", maxWidth: 560, margin: "auto", paddingBottom: 24 }}>
        {/* İlerleme çubuğu: kaç adım kaldığını göstermek sihirbazı bitirme oranını artırıyor. */}
        <div style={{ marginBottom: 22 }}>
          <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
            {steps.map((s, i) => (
              <span
                key={s}
                style={{
                  flex: 1,
                  height: 4,
                  borderRadius: 2,
                  background: i <= stepIndex ? c.accent : c.border,
                }}
              />
            ))}
          </div>
          <span style={{ fontSize: 13, color: c.textSecondary }}>
            {t("Adım {n} / {toplam}", { n: stepIndex + 1, toplam: steps.length })}
          </span>
        </div>

        {step === "account" && (
          <>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
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
              <h1 style={{ fontSize: 22, fontWeight: 600, color: c.textPrimary, margin: "0 0 8px" }}>
                {t("Projelio'ya hoş geldin")}
              </h1>
              <p style={{ fontSize: 16, color: c.textSecondary, margin: 0, lineHeight: 1.5 }}>
                {t("Nasıl çalıştığını seç, arayüzü buna göre ayarlayalım. Bunu istediğin zaman değiştirebilirsin.")}
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
                        {t(opt.title)}
                      </span>
                      <span style={{ display: "block", fontSize: 14, color: c.textSecondary, lineHeight: 1.4 }}>
                        {t(opt.description)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {step === "profile" && (
          <>
            <Header
              heading={t("Seni tanıyalım")}
              sub={t("Bu bilgiler profilinde görünür ve ekip arkadaşlarının seni tanımasını kolaylaştırır. Tamamı isteğe bağlı.")}
            />

            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginBottom: 20 }}>
              {avatarFile ? (
                <AvatarCropper file={avatarFile} onChange={setCrop} />
              ) : (
                <div
                  style={{
                    width: 84,
                    height: 84,
                    borderRadius: "50%",
                    background: c.surface,
                    border: `1px solid ${c.border}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <IconUser size={34} color={c.textSecondary} />
                </div>
              )}
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 14px",
                  borderRadius: 9,
                  border: `1px solid ${c.border}`,
                  background: c.surface,
                  color: c.textPrimary,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                <IconUpload size={15} color={c.textSecondary} />
                {avatarFile ? t("Fotoğrafı değiştir") : t("Profil fotoğrafı ekle")}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setAvatarFile(file);
                      setCrop(null);
                    }
                  }}
                  style={{ display: "none" }}
                />
              </label>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={fieldLabel}>{t("Unvan / görev")}</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("Örn. Kurucu Ortak, Grafik Tasarımcı")}
                  maxLength={80}
                  style={{ width: "100%" }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={fieldLabel}>{t("Telefon")}</label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t("Örn. 0555 123 45 67")}
                  maxLength={30}
                  inputMode="tel"
                  style={{ width: "100%" }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={fieldLabel}>{t("Sektör")}</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                  {SECTORS.map((key) => (
                    <button
                      key={key}
                      onClick={() => setSector((prev) => (prev === key ? null : key))}
                      style={{ ...cardStyle(sector === key), padding: "7px 12px", fontSize: 14, borderRadius: 999 }}
                    >
                      {t(SECTOR_LABEL[key])}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={fieldLabel}>{t("Ekip büyüklüğü")}</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                  {TEAM_SIZES.map((key) => (
                    <button
                      key={key}
                      onClick={() => setTeamSize((prev) => (prev === key ? null : key))}
                      style={{ ...cardStyle(teamSize === key), padding: "7px 12px", fontSize: 14, borderRadius: 999 }}
                    >
                      {t(TEAM_SIZE_LABEL[key])}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={fieldLabel}>{t("Kısa tanıtım")}</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder={t("Ne iş yaptığını bir iki cümleyle anlat.")}
                  maxLength={280}
                  rows={3}
                  style={{ width: "100%", resize: "vertical" }}
                />
                <span style={{ fontSize: 13, color: c.textSecondary, alignSelf: "flex-end" }}>{bio.length}/280</span>
              </div>
            </div>
          </>
        )}

        {step === "org" && (
          <>
            <Header
              heading={selected === "organization_owner" ? t("Şirketini kuralım") : t("Grubunu kuralım")}
              sub={
                selected === "organization_owner"
                  ? t("İşlerini toplayacağın şirket/işletme birazdan oluşturulacak.")
                  : t("Birden fazla organizasyonu altında toplayacağın holding yapısı oluşturulacak.")
              }
            />

            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18 }}>
              <label style={fieldLabel}>{selected === "organization_owner" ? t("Şirket/işletme adı") : t("Grup (holding) adı")}</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={onEnter(() => !loading && goNext())}
                placeholder={selected === "organization_owner" ? t("Örn. Acme Yazılım A.Ş.") : t("Örn. Acme Holding")}
                style={{ width: "100%" }}
                autoFocus
              />
            </div>

            {selected === "organization_owner" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={fieldLabel}>{t("Ölçek")}</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {ORG_TYPE_OPTIONS.map((opt) => (
                    <button key={opt.type} onClick={() => setOrgType(opt.type)} style={{ ...cardStyle(orgType === opt.type), flex: 1 }}>
                      <span style={{ display: "block", fontSize: 15, fontWeight: 500, color: c.textPrimary }}>{t(opt.title)}</span>
                      <span style={{ display: "block", fontSize: 13, color: c.textSecondary }}>{t(opt.description)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {step === "usage" && (
          <>
            <Header
              heading={t("Projelio'yu ne için kullanacaksın?")}
              sub={t("Birden fazla seçebilirsin. Buna göre hangi ekranların öne çıkacağına karar veriyoruz.")}
            />

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
              {USE_CASES.map((key) => {
                const active = useCases.includes(key);
                return (
                  <button key={key} onClick={() => toggle(setUseCases, key)} style={{ ...cardStyle(active), display: "flex", alignItems: "center", gap: 9 }}>
                    <span
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 5,
                        flexShrink: 0,
                        border: `1.5px solid ${active ? c.primary : c.border}`,
                        background: active ? c.primary : "transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {active && <IconCheck size={12} color="#fff" />}
                    </span>
                    {t(USE_CASE_LABEL[key])}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {step === "modules" && (
          <>
            <Header
              heading={t("Kullanacağın modüller")}
              sub={
                selected === "organization_owner"
                  ? t("Yalnızca hemen kullanacaklarını işaretle — seçtiklerin şirketinde açılır, gerisini sonradan ekleyebilirsin.")
                  : t("Şimdilik işine yarayacakları işaretle — bu bir tercih kaydı, hepsini sonradan açıp kapatabilirsin.")
              }
            />

            {/* Yeni şirket ücretsiz paketle başlar: seçim onun modül hakkıyla
                sınırlı (bkz. shared modulHakki.ts). Sunucu fazlasını zaten
                reddederdi — ve hata yutulduğu için hiçbiri açılmazdı. */}
            {selected === "organization_owner" && kurulumHakki !== null && (
              <p style={{ fontSize: 14, color: c.textSecondary, textAlign: "center", margin: "0 0 12px", lineHeight: 1.5 }}>
                {t("Ücretsiz pakette şirketinde {hak} modül açabilirsin ({secili}/{hak}). Daha fazlası için sonradan paketini yükseltebilirsin.", {
                  hak: kurulumHakki,
                  secili: sayilanSecim,
                })}
              </p>
            )}
            {modulesLoading ? (
              <p style={{ fontSize: 15, color: c.textSecondary, textAlign: "center", margin: 0 }}>{t("Modüller yükleniyor…")}</p>
            ) : modules.length === 0 ? (
              <p style={{ fontSize: 15, color: c.textSecondary, textAlign: "center", margin: 0, lineHeight: 1.5 }}>
                {t("Seçilebilecek bir modül bulunamadı. Bu adımı geçebilirsin; modülleri daha sonra \"Modül ekle\"den açabilirsin.")}
              </p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8 }}>
                {modules.map((m) => {
                  const active = selectedModuleKeys.includes(m.key);
                  const kilitli = !active && hakDoldu && modulSayilirMi(m.key);
                  return (
                    <button
                      key={m.key}
                      onClick={() => !kilitli && toggle(setSelectedModuleKeys, m.key)}
                      disabled={kilitli}
                      style={{ ...cardStyle(active), opacity: kilitli ? 0.45 : 1 }}
                    >
                      <span style={{ display: "block", fontSize: 15, fontWeight: 500, color: c.textPrimary, marginBottom: 2 }}>{m.name}</span>
                      {m.description && (
                        <span style={{ display: "block", fontSize: 13, color: c.textSecondary, lineHeight: 1.4 }}>{t(m.description)}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        {step === "summary" && (
          <>
            <Header heading={t("Her şey hazır")} sub={t("Seçtiklerini bir kez gözden geçir; istersen geri dönüp değiştirebilirsin.")} />

            <div style={{ border: `1px solid ${c.border}`, borderRadius: 12, background: c.surface, padding: "4px 16px", marginBottom: 4 }}>
              {[
                { label: t("Çalışma şekli"), value: accountLabel ? t(accountLabel) : "" },
                { label: selected === "group_owner" ? t("Grup") : t("Şirket/işletme"), value: needsName ? name.trim() : "" },
                { label: t("Unvan"), value: title.trim() },
                { label: t("Telefon"), value: phone.trim() },
                { label: t("Sektör"), value: sector ? t(SECTOR_LABEL[sector]) : "" },
                { label: t("Ekip büyüklüğü"), value: teamSize ? t(TEAM_SIZE_LABEL[teamSize]) : "" },
                { label: t("Kullanım amacı"), value: useCases.map((u) => t(USE_CASE_LABEL[u])).join(", ") },
                { label: t("Modüller"), value: selectedModuleNames.join(", ") },
              ]
                .filter((row) => row.value)
                .map((row) => (
                  <div
                    key={row.label}
                    style={{
                      display: "flex",
                      gap: 14,
                      padding: "11px 0",
                      borderBottom: `1px solid ${c.border}`,
                      fontSize: 15,
                    }}
                  >
                    <span style={{ color: c.textSecondary, flex: "0 0 40%" }}>{row.label}</span>
                    <span style={{ color: c.textPrimary, flex: 1, wordBreak: "break-word" }}>{row.value}</span>
                  </div>
                ))}
            </div>
          </>
        )}

        {error && <p style={{ color: c.danger, fontSize: 15, margin: "16px 0 0" }}>{error}</p>}

        <div style={{ display: "flex", gap: 8, marginTop: 22 }}>
          {stepIndex > 0 && (
            <button
              onClick={goBack}
              disabled={loading}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "12px 16px",
                borderRadius: 10,
                border: `1px solid ${c.border}`,
                background: c.surface,
                color: c.textPrimary,
                fontSize: 16,
              }}
            >
              <IconChevronLeft size={16} color={c.textSecondary} />
              {t("Geri")}
            </button>
          )}
          <button
            onClick={goNext}
            disabled={loading || (step === "account" && !selected)}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "12px 0",
              borderRadius: 10,
              border: "none",
              background: c.primary,
              color: c.onPrimary,
              fontSize: 17,
              fontWeight: 500,
            }}
          >
            {loading ? t("Kuruluyor…") : step === "summary" ? t("Projelio'yu kullanmaya başla") : t("Devam et")}
            {!loading && step !== "summary" && <IconChevronRight size={16} color="#fff" />}
          </button>
        </div>
      </div>
    </div>
  );
}
