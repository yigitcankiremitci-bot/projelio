import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ModuleMember,
  SocialAccount,
  SocialCredential,
  SocialCredentialGrant,
  SocialCredentialSecret,
  SocialCredentialView,
  Translate,
} from "@projelio/shared";
import { api } from "../api/client";
import { socialCredentialsApi, type SocialCredentialInput } from "../api/socialCredentials";
import type { SocialScope } from "../api/socialMedia";
import { useT } from "../lib/i18n";
import { SOCIAL_PLATFORMS } from "../lib/socialMedia";
import { useThemeColors } from "../theme/useThemeColors";
import Modal from "./Modal";

interface Props {
  scope: SocialScope;
  account: SocialAccount;
  onClose: () => void;
}

/** Gösterilen şifrenin ekranda kalma süresi. */
const REVEAL_SECONDS = 45;

/**
 * Şifrenin neden görülebildiği. Cümlenin İÇİNDE geçiyor ("… izinli yetkisiyle"),
 * bu yüzden küçük harf. Sabit bir tabloda değil fonksiyonda: modül düzeyinde
 * t() çağrılamıyor, üç metnin de sözlükte aranabilir kalması gerekiyor.
 */
function reasonLabel(t: Translate, reason: SocialCredentialView["reason"]): string {
  if (reason === "admin") return t("yönetici");
  if (reason === "creator") return t("kaydı giren");
  return t("izinli");
}

function formatDate(value?: string): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Hesap giriş bilgileri (kullanıcı adı + şifre).
 *
 * EKRANDA TUTMA SÜRESİ SINIRLI: şifre görünür kaldığı sürece omuz üstünden
 * okunabilir, ekran paylaşımında görünür, ekran görüntüsüne girer. Bu yüzden
 * gösterim {REVEAL_SECONDS} saniye sonra kendiliğinden kapanıyor ve şifre
 * hiçbir listede, hiçbir kalıcı state'te tutulmuyor — her gösterim sunucuya
 * ayrı bir istek ve sunucuda ayrı bir denetim satırı.
 *
 * Bkz. backend/src/modules/social-media/social-credentials.service.ts
 */
export default function SocialCredentialsModal({ scope, account, onClose }: Props) {
  const c = useThemeColors();
  const t = useT();
  const [rows, setRows] = useState<SocialCredential[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [canCreate, setCanCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Açık olan sır: yalnızca bellekte, tek kayıt için, süreli.
  const [secret, setSecret] = useState<SocialCredentialSecret | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [form, setForm] = useState<{ id: string | null; label: string; username: string; password: string; note: string } | null>(
    null
  );
  const [permsFor, setPermsFor] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    socialCredentialsApi
      .list(account.id)
      .then((res) => {
        setRows(res.credentials);
        setCanManage(res.canManage);
        setCanCreate(res.canCreate);
        setError("");
      })
      .catch((err) => setError(err instanceof Error ? err.message : t("Kayıtlar yüklenemedi")))
      .finally(() => setLoading(false));
  };

  useEffect(load, [account.id]);

  // Geri sayım. Süre dolunca sır state'ten SİLİNİR, yalnızca gizlenmez.
  useEffect(() => {
    if (!secret) return;
    setCountdown(REVEAL_SECONDS);
    const tick = setInterval(() => setCountdown((n) => n - 1), 1000);
    const timer = setTimeout(() => setSecret(null), REVEAL_SECONDS * 1000);
    return () => {
      clearInterval(tick);
      clearTimeout(timer);
    };
  }, [secret]);

  const reveal = async (row: SocialCredential) => {
    setBusyId(row.id);
    setError("");
    try {
      setSecret(await socialCredentialsApi.reveal(row.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Şifre gösterilemedi"));
    } finally {
      setBusyId(null);
    }
  };

  const save = async () => {
    if (!form) return;
    if (!form.id && !form.password.trim()) {
      setError(t("Şifre gerekli"));
      return;
    }
    const body: SocialCredentialInput = {
      label: form.label,
      username: form.username,
      note: form.note,
      // Düzenlemede boş şifre "dokunma" demek: form şifreyi hiçbir zaman dolu
      // getirmiyor, boş göndermek olağan durum.
      password: form.password.trim() || undefined,
    };
    setBusyId("form");
    setError("");
    try {
      if (form.id) await socialCredentialsApi.update(form.id, body);
      else await socialCredentialsApi.create(account.id, body);
      setForm(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Kaydedilemedi"));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (row: SocialCredential) => {
    if (!window.confirm(t('"{etiket}" girişi silinsin mi? Şifre kalıcı olarak silinir.', { etiket: row.label })))
      return;
    setBusyId(row.id);
    try {
      await socialCredentialsApi.remove(row.id);
      if (secret?.id === row.id) setSecret(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Silinemedi"));
    } finally {
      setBusyId(null);
    }
  };

  const label = (text: string) => <label style={{ fontSize: 12, color: c.textSecondary }}>{text}</label>;
  const field = { fontSize: 13, padding: "6px 8px", width: "100%" } as const;
  const ghostButton = {
    fontSize: 12,
    background: "transparent",
    border: `1px solid ${c.border}`,
    borderRadius: 8,
    padding: "4px 10px",
    cursor: "pointer",
    color: c.textSecondary,
  } as const;

  return (
    <Modal
      title={t("{kanal} · @{hesap} giriş bilgileri", {
        kanal: SOCIAL_PLATFORMS[account.platform].label,
        hesap: account.handle,
      })}
      subtitle={t("Şifreler sunucuda şifreli saklanır. Yalnızca yöneticiler, şifreyi giren kişi ve izin verilenler görebilir; her gösterim kaydedilir.")}
      onClose={onClose}
      maxWidth={620}
      mobileFullScreen
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {loading && <span style={{ fontSize: 13, color: c.textSecondary }}>{t("Yükleniyor…")}</span>}

        {!loading && rows.length === 0 && (
          <span style={{ fontSize: 13, color: c.textSecondary }}>
            {t("Bu hesap için kayıtlı giriş yok.")}{" "}
            {canCreate ? t("Aşağıdan ekleyebilirsiniz.") : t("Ekleme yetkiniz yok.")}
          </span>
        )}

        {rows.map((row) => (
          <div
            key={row.id}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              padding: "10px 12px",
              background: c.surface,
              border: `1px solid ${c.border}`,
              borderRadius: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 14, color: c.textPrimary, flex: 1, minWidth: 120 }}>{row.label}</span>
              {row.canReveal ? (
                <button onClick={() => reveal(row)} disabled={busyId === row.id} style={ghostButton}>
                  {busyId === row.id ? t("Açılıyor…") : secret?.id === row.id ? t("Yenile") : t("Göster")}
                </button>
              ) : (
                <span style={{ fontSize: 11, color: c.textSecondary }}>{t("Görme izniniz yok")}</span>
              )}
              {row.canEdit && (
                <>
                  <button
                    onClick={() =>
                      setForm({ id: row.id, label: row.label, username: "", password: "", note: "" })
                    }
                    style={ghostButton}
                  >
                    {t("Düzenle")}
                  </button>
                  <button onClick={() => remove(row)} style={{ ...ghostButton, color: c.danger }}>
                    {t("Sil")}
                  </button>
                </>
              )}
              {canManage && (
                <button
                  onClick={() => setPermsFor(permsFor === row.id ? null : row.id)}
                  style={ghostButton}
                >
                  {t("İzinler")}
                  {row.grantCount ? ` · ${row.grantCount}` : ""}
                </button>
              )}
            </div>

            <span style={{ fontSize: 12, color: c.textSecondary }}>
              {[
                row.createdByName ? t("Giren: {kisi}", { kisi: row.createdByName }) : null,
                t("Şifre güncellenme: {tarih}", { tarih: formatDate(row.passwordChangedAt) }),
                row.hasNote ? t("Not var") : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>

            {secret?.id === row.id && <SecretBox secret={secret} countdown={countdown} />}

            {canManage && permsFor === row.id && (
              <GrantPanel scope={scope} credentialId={row.id} onChanged={load} />
            )}
          </div>
        ))}

        {/* Ekleme / düzenleme formu */}
        {form ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              padding: "10px 12px",
              border: `1px solid ${c.border}`,
              borderRadius: 10,
              background: c.background,
            }}
          >
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 160px", display: "flex", flexDirection: "column", gap: 4 }}>
                {label(t("Etiket"))}
                <input
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder={t("Ana giriş")}
                  style={field}
                />
              </div>
              <div style={{ flex: "1 1 160px", display: "flex", flexDirection: "column", gap: 4 }}>
                {label(t("Kullanıcı adı / e-posta"))}
                <input
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  autoComplete="off"
                  style={field}
                />
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {label(form.id ? t("Yeni şifre (boş bırakılırsa değişmez)") : t("Şifre *"))}
              {/* type=password + autoComplete=new-password: tarayıcı bunu kendi
                  şifre kasasına kaydetmeye çalışmasın, sır tek yerde dursun. */}
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                autoComplete="new-password"
                style={field}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {label(t("Not (kurtarma e-postası, 2FA'nın hangi telefonda olduğu…)"))}
              <textarea
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                rows={2}
                style={{ ...field, resize: "vertical" }}
              />
            </div>
            {form.id && (
              <span style={{ fontSize: 11, color: c.textSecondary }}>
                {t("Kullanıcı adı ve not, kaydedildiğinde yazdığınızla değiştirilir; boş bırakırsanız temizlenir.")}
              </span>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setForm(null)} style={ghostButton}>
                {t("Vazgeç")}
              </button>
              <button
                data-primary
                onClick={save}
                disabled={busyId === "form"}
                style={{
                  fontSize: 13,
                  padding: "6px 14px",
                  background: c.primary,
                  color: c.onPrimary,
                  border: "none",
                  borderRadius: 8,
                  cursor: busyId === "form" ? "default" : "pointer",
                  opacity: busyId === "form" ? 0.6 : 1,
                }}
              >
                {busyId === "form" ? t("Kaydediliyor…") : t("Kaydet")}
              </button>
            </div>
          </div>
        ) : (
          canCreate && (
            <button
              onClick={() => setForm({ id: null, label: "", username: "", password: "", note: "" })}
              style={{ ...ghostButton, alignSelf: "flex-start", color: c.primary }}
            >
              + {t("Giriş ekle")}
            </button>
          )
        )}

        {error && <span style={{ fontSize: 12, color: c.danger }}>{error}</span>}
      </div>
    </Modal>
  );
}

/** Açılan sır — süreli, kopyalanabilir, hiçbir yere yazılmaz. */
function SecretBox({ secret, countdown }: { secret: SocialCredentialSecret; countdown: number }) {
  const c = useThemeColors();
  const t = useT();
  const [copied, setCopied] = useState("");
  const timer = useRef<number | null>(null);

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(""), 2000);
    } catch {
      setCopied("hata");
    }
  };

  const line = (title: string, value: string, mono = false) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ fontSize: 11, color: c.textSecondary, width: 92 }}>{title}</span>
      <span
        style={{
          fontSize: 13,
          color: c.textPrimary,
          fontFamily: mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : undefined,
          wordBreak: "break-all",
          flex: 1,
          minWidth: 120,
        }}
      >
        {value}
      </span>
      <button
        onClick={() => copy(value, title)}
        style={{
          fontSize: 11,
          background: "transparent",
          border: `1px solid ${c.border}`,
          borderRadius: 6,
          padding: "2px 8px",
          cursor: "pointer",
          color: c.textSecondary,
        }}
      >
        {copied === title ? t("Kopyalandı") : t("Kopyala")}
      </button>
    </div>
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "8px 10px",
        border: `1px dashed ${c.accent}`,
        borderRadius: 8,
        background: `${c.accent}0F`,
      }}
    >
      {secret.username && line(t("Kullanıcı adı"), secret.username)}
      {line(t("Şifre"), secret.password, true)}
      {secret.note && line(t("Not"), secret.note)}
      <span style={{ fontSize: 11, color: c.textSecondary }}>
        {countdown > 0 ? t("{n} saniye sonra gizlenecek.", { n: countdown }) : t("Gizleniyor…")}{" "}
        {t("Bu gösterim kaydedildi ({yetki} yetkisiyle).", { yetki: reasonLabel(t, secret.reason) })}
      </span>
    </div>
  );
}

/**
 * İzin paneli — yalnızca yöneticiye açık.
 *
 * İzin verilecek kişiler MODÜL EKİBİNDEN seçiliyor: departmanı görebildiği
 * için modülü okuyabilen ama sosyal medyada çalışmayan birine şifre açılmasın
 * (sunucu da aynı kuralı uyguluyor, buradaki liste yalnızca kolaylık).
 */
function GrantPanel({
  scope,
  credentialId,
  onChanged,
}: {
  scope: SocialScope;
  credentialId: string;
  onChanged: () => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const [grants, setGrants] = useState<SocialCredentialGrant[]>([]);
  const [views, setViews] = useState<SocialCredentialView[]>([]);
  const [members, setMembers] = useState<ModuleMember[]>([]);
  const [userId, setUserId] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const scopePath = "jobId" in scope ? `/jobs/${scope.jobId}` : `/organizations/${scope.organizationId}`;
  const listQuery = `?moduleKey=pd_sosyal_medya${
    !("jobId" in scope) && scope.departmentId ? `&departmentId=${scope.departmentId}` : ""
  }`;

  const load = () => {
    Promise.all([
      socialCredentialsApi.grants(credentialId),
      socialCredentialsApi.views(credentialId).catch(() => []),
      api.get<ModuleMember[]>(`${scopePath}/module-members${listQuery}`).catch(() => []),
    ]).then(([g, v, m]) => {
      setGrants(g);
      setViews(v);
      setMembers(m.filter((x) => x.userId && x.status === "approved"));
    });
  };

  useEffect(load, [credentialId]);

  const activeUserIds = useMemo(
    () => new Set(grants.filter((g) => g.active).map((g) => g.userId)),
    [grants]
  );
  const candidates = members.filter((m) => !activeUserIds.has(m.userId as string));

  const add = async () => {
    if (!userId) return;
    setBusy(true);
    setError("");
    try {
      await socialCredentialsApi.grant(credentialId, userId, expiresAt ? new Date(expiresAt).toISOString() : null);
      setUserId("");
      setExpiresAt("");
      load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("İzin verilemedi"));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (grant: SocialCredentialGrant) => {
    setBusy(true);
    try {
      await socialCredentialsApi.revokeGrant(grant.id);
      load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("İzin geri alınamadı"));
    } finally {
      setBusy(false);
    }
  };

  const field = { fontSize: 12, padding: "5px 8px" } as const;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "8px 10px",
        border: `1px solid ${c.border}`,
        borderRadius: 8,
        background: c.background,
      }}
    >
      <span style={{ fontSize: 12, color: c.textPrimary }}>{t("Şifreyi görebilenler")}</span>

      {grants.filter((g) => g.active).length === 0 && (
        <span style={{ fontSize: 12, color: c.textSecondary }}>
          {t("Kimseye izin verilmedi. Şu an yalnızca yöneticiler ve şifreyi giren kişi görebiliyor.")}
        </span>
      )}

      {grants
        .filter((g) => g.active)
        .map((g) => (
          <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: c.textPrimary, flex: 1, minWidth: 120 }}>
              {g.userName ?? t("İsimsiz")}
              <span style={{ color: c.textSecondary }}>
                {" · "}
                {g.grantedByName ? t("{kisi} verdi", { kisi: g.grantedByName }) : t("izinli")}
                {g.expiresAt ? ` · ${t("{tarih} tarihine kadar", { tarih: formatDate(g.expiresAt) })}` : ""}
              </span>
            </span>
            <button
              onClick={() => revoke(g)}
              disabled={busy}
              style={{
                fontSize: 11,
                background: "transparent",
                border: `1px solid ${c.border}`,
                borderRadius: 6,
                padding: "2px 8px",
                cursor: busy ? "default" : "pointer",
                color: c.danger,
              }}
            >
              {t("Geri al")}
            </button>
          </div>
        ))}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <select value={userId} onChange={(e) => setUserId(e.target.value)} style={{ ...field, flex: "1 1 160px" }}>
          <option value="">{t("Modül ekibinden seçin…")}</option>
          {candidates.map((m) => (
            <option key={m.id} value={m.userId}>
              {m.fullName ?? m.username ?? m.email ?? t("İsimsiz")}
            </option>
          ))}
        </select>
        {/* Süreli izin: "kampanya boyunca". Boş bırakılırsa süresiz. */}
        <input
          type="date"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          title={t("Bitiş tarihi (boşsa süresiz)")}
          style={field}
        />
        <button
          onClick={add}
          disabled={busy || !userId}
          style={{
            fontSize: 12,
            padding: "5px 10px",
            background: c.primary,
            color: c.onPrimary,
            border: "none",
            borderRadius: 8,
            cursor: busy || !userId ? "default" : "pointer",
            opacity: busy || !userId ? 0.6 : 1,
          }}
        >
          {t("İzin ver")}
        </button>
      </div>

      {candidates.length === 0 && members.length === 0 && (
        <span style={{ fontSize: 11, color: c.textSecondary }}>
          {t("Modül ekibi boş. Önce Ekip sekmesinden kişileri sosyal medya modülüne ekleyin.")}
        </span>
      )}

      {views.length > 0 && (
        <details>
          <summary style={{ fontSize: 12, color: c.textSecondary, cursor: "pointer" }}>
            {t("Son görüntülemeler ({n})", { n: views.length })}
          </summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 4 }}>
            {views.slice(0, 20).map((v) => (
              <span key={v.id} style={{ fontSize: 11, color: c.textSecondary }}>
                {formatDate(v.viewedAt)} · {v.userName ?? t("Silinmiş kullanıcı")} ({reasonLabel(t, v.reason)})
              </span>
            ))}
          </div>
        </details>
      )}

      {error && <span style={{ fontSize: 11, color: c.danger }}>{error}</span>}
    </div>
  );
}
