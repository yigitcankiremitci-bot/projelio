import { useState } from "react";
import type { SocialAccount, SocialPlatform } from "@projelio/shared";
import { socialMediaApi, type SocialAccountInput, type SocialScope } from "../api/socialMedia";
import { PLATFORM_ORDER, SOCIAL_PLATFORMS, accountColor } from "../lib/socialMedia";
import { useThemeColors } from "../theme/useThemeColors";
import Modal from "./Modal";
import { useT } from "../lib/i18n";

interface Props {
  scope: SocialScope;
  /** Boşsa yeni hesap. */
  account?: SocialAccount | null;
  /** Hesabın sorumlusu seçilebilsin diye ekip listesi. */
  members: { id: string; label: string; hint?: string }[];
  onClose: () => void;
  onSaved: () => void;
}

interface FormState {
  platform: SocialPlatform;
  handle: string;
  displayName: string;
  profileUrl: string;
  followerCount: string;
  audienceNote: string;
  toneNote: string;
  postingFrequency: string;
  color: string;
  ownerUserId: string;
  active: boolean;
}

function initialForm(account?: SocialAccount | null): FormState {
  return {
    platform: account?.platform ?? "instagram",
    handle: account?.handle ?? "",
    displayName: account?.displayName ?? "",
    profileUrl: account?.profileUrl ?? "",
    followerCount: account?.followerCount !== undefined ? String(account.followerCount) : "",
    audienceNote: account?.audienceNote ?? "",
    toneNote: account?.toneNote ?? "",
    postingFrequency: account?.postingFrequency ?? "",
    color: account ? accountColor(account) : SOCIAL_PLATFORMS.instagram.color,
    ownerUserId: account?.ownerUserId ?? "",
    active: account?.active ?? true,
  };
}

/**
 * Sosyal hesap ekleme/düzenleme.
 *
 * Hesap yalnızca "@kullaniciadi" değil: kitlesi, tonu ve yayın ritmi de burada
 * duruyor. Sebep pratik — içerik yazan kişi çoğu zaman hesabı açan kişi
 * değildir; "bu hesapta nasıl konuşuyoruz" bilgisi bir yerde yazılı olmazsa
 * her devirde yeniden keşfediliyor.
 */
export default function SocialAccountModal({ scope, account, members, onClose, onSaved }: Props) {
  const c = useThemeColors();
  const t = useT();
  const [form, setForm] = useState<FormState>(() => initialForm(account));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const platform = SOCIAL_PLATFORMS[form.platform];

  /**
   * Platform değişince renk de değişir — ama kullanıcı rengi kendisi
   * seçtiyse ona dokunulmaz. Ayırt etme ölçütü: mevcut renk eski platformun
   * varsayılanı mı.
   */
  const changePlatform = (next: SocialPlatform) => {
    setForm((f) => ({
      ...f,
      platform: next,
      color: f.color === SOCIAL_PLATFORMS[f.platform].color ? SOCIAL_PLATFORMS[next].color : f.color,
    }));
  };

  const save = async () => {
    if (!form.handle.trim()) {
      setError("Hesap adı gerekli");
      return;
    }
    setSaving(true);
    setError("");

    const handle = form.handle.trim().replace(/^@/, "");
    const body: SocialAccountInput = {
      platform: form.platform,
      handle,
      displayName: form.displayName,
      // Adres girilmediyse platformun kalıbından üretiriz: kullanıcı her hesap
      // için tam adres yazmak zorunda kalmasın, ama istediğinde ezebilsin.
      profileUrl: form.profileUrl.trim() || (platform.profilePrefix ? `${platform.profilePrefix}${handle}` : ""),
      followerCount: form.followerCount === "" ? undefined : Number(form.followerCount),
      audienceNote: form.audienceNote,
      toneNote: form.toneNote,
      postingFrequency: form.postingFrequency,
      color: form.color,
      ownerUserId: form.ownerUserId || null,
      active: form.active,
    };

    try {
      if (account) await socialMediaApi.updateAccount(account.id, body);
      else await socialMediaApi.createAccount(scope, body);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hesap kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };

  const label = (text: string) => <label style={{ fontSize: 12, color: c.textSecondary }}>{text}</label>;
  const field = { fontSize: 13, padding: "6px 8px", width: "100%" } as const;

  return (
    <Modal
      title={account ? "Hesabı düzenle" : "Sosyal medya hesabı ekle"}
      subtitle={t("Hesabın kimliği, kitlesi ve yayın ritmi — içerik yazarken bu bilgiler composer'da hatırlatılır.")}
      onClose={onClose}
      maxWidth={560}
      mobileFullScreen
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 180px", display: "flex", flexDirection: "column", gap: 4 }}>
            {label("Platform *")}
            <select
              value={form.platform}
              onChange={(e) => changePlatform(e.target.value as SocialPlatform)}
              style={field}
            >
              {PLATFORM_ORDER.map((p) => (
                <option key={p} value={p}>
                  {SOCIAL_PLATFORMS[p].label}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: "1 1 180px", display: "flex", flexDirection: "column", gap: 4 }}>
            {label("Kullanıcı adı *")}
            <input
              value={form.handle}
              onChange={(e) => set("handle", e.target.value)}
              placeholder="projelio"
              style={field}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 180px", display: "flex", flexDirection: "column", gap: 4 }}>
            {label("Görünen ad")}
            {/* Listede "@projelio" yerine "Projelio TR" yazması, aynı markanın
                birden çok hesabı olduğunda hangisinin hangisi olduğunu ayırıyor. */}
            <input
              value={form.displayName}
              onChange={(e) => set("displayName", e.target.value)}
              placeholder={t("Projelio Türkiye")}
              style={field}
            />
          </div>
          <div style={{ flex: "1 1 120px", display: "flex", flexDirection: "column", gap: 4 }}>
            {label("Takipçi")}
            <input
              type="number"
              value={form.followerCount}
              onChange={(e) => set("followerCount", e.target.value)}
              placeholder="0"
              style={field}
            />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {label("Profil adresi")}
          <input
            value={form.profileUrl}
            onChange={(e) => set("profileUrl", e.target.value)}
            placeholder={platform.profilePrefix ? `${platform.profilePrefix}kullaniciadi` : "https://…"}
            style={field}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {label("Kitle")}
          <textarea
            value={form.audienceNote}
            onChange={(e) => set("audienceNote", e.target.value)}
            placeholder={t("25–34 yaş, İstanbul, küçük işletme sahibi")}
            rows={2}
            style={{ ...field, resize: "vertical" }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {label("Ton / marka sesi")}
          <textarea
            value={form.toneNote}
            onChange={(e) => set("toneNote", e.target.value)}
            placeholder={t("Samimi ama abartısız; emoji az; teknik terim yok")}
            rows={2}
            style={{ ...field, resize: "vertical" }}
          />
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 160px", display: "flex", flexDirection: "column", gap: 4 }}>
            {label("Yayın ritmi")}
            <input
              value={form.postingFrequency}
              onChange={(e) => set("postingFrequency", e.target.value)}
              placeholder={t("Haftada 3, hafta içi 19:00")}
              style={field}
            />
          </div>
          <div style={{ flex: "1 1 160px", display: "flex", flexDirection: "column", gap: 4 }}>
            {label("Sorumlu")}
            <select value={form.ownerUserId} onChange={(e) => set("ownerUserId", e.target.value)} style={field}>
              <option value="">{t("Belirtilmedi")}</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: "0 0 92px", display: "flex", flexDirection: "column", gap: 4 }}>
            {label("Renk")}
            {/* Takvimde hangi kartın hangi hesaba ait olduğu renkten okunuyor. */}
            <input
              type="color"
              value={form.color}
              onChange={(e) => set("color", e.target.value)}
              style={{ ...field, padding: 2, height: 32 }}
            />
          </div>
        </div>

        {account && (
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: c.textPrimary }}>
            <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} />
            {t("Aktif — pasif hesaplar yeni içerikte seçilemez")}
          </label>
        )}

        {/* Bu ekran hesabın KİMLİĞİNİ tutar; doğrudan yayın yetkisi ayrı bir
            adım (OAuth). İkisini aynı forma sıkıştırmak, "kaydettim ama neden
            yayımlamıyor" sorusunu doğuruyordu. */}
        <div
          style={{
            fontSize: 12,
            color: c.textSecondary,
            background: c.background,
            border: `1px solid ${c.border}`,
            borderRadius: 8,
            padding: "8px 10px",
            lineHeight: 1.5,
          }}
        >
          Buradaki bilgiler hesabın kimliği ve çalışma biçimi. Projelio'nun bu hesaba{" "}
          <strong>{t("doğrudan yayımlaması")}</strong> için Hesaplar sekmesindeki “Instagram'a bağla” adımı gerekiyor —
          bağlanmayan hesaplarda plan ve metin burada durur, yayını siz yaparsınız.
        </div>

        {error && <span style={{ fontSize: 12, color: c.danger }}>{error}</span>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
          <button
            onClick={onClose}
            style={{
              fontSize: 13,
              padding: "6px 12px",
              background: "transparent",
              border: `1px solid ${c.border}`,
              borderRadius: 8,
              cursor: "pointer",
              color: c.textSecondary,
            }}
          >
            {t("Vazgeç")}
          </button>
          <button
            data-primary
            onClick={save}
            disabled={saving}
            style={{
              fontSize: 13,
              padding: "6px 14px",
              background: c.primary,
              color: c.onPrimary,
              border: "none",
              borderRadius: 8,
              cursor: saving ? "default" : "pointer",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "Kaydediliyor…" : account ? "Kaydet" : "Hesabı ekle"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
