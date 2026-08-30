import { useEffect, useRef, useState } from "react";
import type { ProjectShareLink, ProjectShareVisibility } from "@projelio/shared";
import { projectSharesApi } from "../api/projectShares";
import { parseServerDate } from "../lib/dates";
import { useThemeColors } from "../theme/useThemeColors";
import ConfirmDialog from "./ConfirmDialog";
import Modal from "./Modal";
import { IconCopy, IconTrash } from "./icons";

interface Props {
  projectId: string;
  projectTitle: string;
  onClose: () => void;
}

/**
 * "Takip linki" penceresi: projeyi Projelio hesabı OLMAYAN kişilere gösteren
 * salt okunur bağlantıları üretir ve yönetir.
 *
 * TASARIM KARARI — ne görüneceği link BAŞINA seçilir, proje başına değil. Aynı
 * projenin müşterisine gösterilecek şey ile taşeronun patronuna gösterilecek şey
 * aynı değil; tek bir "paylaşım ayarı" olsaydı sahibi her yeni kişide eskisini
 * bozmak zorunda kalırdı.
 *
 * Kutuların varsayılanı bilerek dar: görevler ve çıktılar açık, ekip/akış/
 * dosya/bütçe kapalı. Yanlışlıkla fazla paylaşmanın bedeli, az paylaşmanınkinden
 * çok daha yüksek.
 */

const SECTIONS: { key: keyof ProjectShareVisibility; label: string; hint: string }[] = [
  { key: "tasks", label: "Görevler", hint: "Görev başlıkları, durumları ve tarihleri" },
  { key: "outputs", label: "Çıktılar", hint: "Projenin çıktı başlıkları" },
  { key: "team", label: "Ekip", hint: "Yalnızca ad ve unvan — e-posta ve ücret paylaşılmaz" },
  { key: "feed", label: "Sosyal akış", hint: "Projeye yazılan paylaşımlar" },
  { key: "files", label: "Dosya adları", hint: "Yalnızca isim listesi — dosyalar indirilemez" },
  { key: "budget", label: "Bütçe", hint: "Toplam ve harcanan tutar" },
];

const DEFAULT_VISIBILITY: ProjectShareVisibility = {
  tasks: true,
  outputs: true,
  team: false,
  feed: false,
  files: false,
  budget: false,
};

/** Linkin neden kapandığı — yalnızca sahibin listesinde görünür. */
const CLOSED_LABEL: Record<NonNullable<ProjectShareLink["closedReason"]>, string> = {
  revoked: "Kapatıldı",
  expired: "Süresi doldu",
  completed: "Proje tamamlandı",
};

const EXPIRY_OPTIONS: { label: string; days?: number }[] = [
  { label: "Süresiz" },
  { label: "7 gün", days: 7 },
  { label: "30 gün", days: 30 },
  { label: "90 gün", days: 90 },
];

export default function ShareProjectModal({ projectId, projectTitle, onClose }: Props) {
  const c = useThemeColors();
  const [links, setLinks] = useState<ProjectShareLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const [label, setLabel] = useState("");
  // E-posta kapısı: boş bırakılırsa link doğrudan açılır (bkz. migration 077).
  const [recipientEmail, setRecipientEmail] = useState("");
  const [visibility, setVisibility] = useState<ProjectShareVisibility>(DEFAULT_VISIBILITY);
  const [expiryIndex, setExpiryIndex] = useState(0);
  // Az önce üretilen link: listede de var ama kullanıcının aradığı şey bu, üstte
  // ve kopyalanmaya hazır dursun.
  const [justCreated, setJustCreated] = useState<ProjectShareLink | null>(null);
  // Kapatma geri alınamıyor: linki elinde tutan kişiler projeyi bir daha
  // göremez. Onay penceresiyle soruluyor (bkz. ConfirmDialog).
  const [revoking, setRevoking] = useState<ProjectShareLink | null>(null);

  const load = () => {
    setLoading(true);
    projectSharesApi
      .list(projectId)
      .then(setLinks)
      .catch(() => setError("Linkler yüklenemedi."))
      .finally(() => setLoading(false));
  };

  useEffect(load, [projectId]);

  const toggle = (key: keyof ProjectShareVisibility) =>
    setVisibility((v) => ({ ...v, [key]: !v[key] }));

  const handleCreate = async () => {
    setCreating(true);
    setError("");
    try {
      const created = await projectSharesApi.create(projectId, {
        label: label.trim() || undefined,
        visibility,
        expiresInDays: EXPIRY_OPTIONS[expiryIndex].days,
        recipientEmail: recipientEmail.trim() || undefined,
      });
      setJustCreated(created);
      setLinks((ls) => [created, ...ls]);
      setLabel("");
      setRecipientEmail("");
    } catch (err) {
      // Sunucunun mesajı korunuyor: "Geçerli bir e-posta adresi girin" gibi
      // düzeltilebilir hataları "tekrar dene" ile örtmek kullanıcıyı çıkmaza sokar.
      setError(err instanceof Error && err.message ? err.message : "Link oluşturulamadı. Tekrar dene.");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (link: ProjectShareLink) => {
    const updated = await projectSharesApi.revoke(link.id);
    setLinks((ls) => ls.map((l) => (l.id === link.id ? updated : l)));
    if (justCreated?.id === link.id) setJustCreated(null);
    setRevoking(null);
  };

  const sectionSummary = (v: ProjectShareVisibility) => {
    const on = SECTIONS.filter((s) => v[s.key]).map((s) => s.label);
    return on.length === 0 ? "Yalnızca özet" : `Özet + ${on.join(", ")}`;
  };

  return (
    <Modal
      title="Takip linki"
      subtitle={`"${projectTitle}" projesini hesabı olmayan kişilere göster. Link salt okunur.`}
      onClose={onClose}
      maxWidth={640}
      mobileFullScreen
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {justCreated && <CreatedLinkBox link={justCreated} />}

        {/* -------------------------------------------------- Yeni link */}
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 14, color: c.textPrimary }}>Yeni link oluştur</h3>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 12, color: c.textSecondary }}>Bu link kimin için? (yalnızca sen görürsün)</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Örn. Müşteri — Ahmet Bey"
              style={{ width: "100%", fontSize: 13, padding: "6px 8px" }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 12, color: c.textSecondary }}>
              E-posta sorulsun mu? (isteğe bağlı)
            </label>
            <input
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="ahmet@firma.com"
              autoComplete="off"
              style={{ width: "100%", fontSize: 13, padding: "6px 8px" }}
            />
            {/* Kapının ne olduğu ve ne OLMADIĞI burada yazılı: sahibi bunu bir
                kimlik doğrulaması sanıp bütçeyi açarsa yanlış bir güven kurmuş olur. */}
            <span style={{ fontSize: 11, color: c.textSecondary, lineHeight: 1.6 }}>
              Doldurursan sayfa açılmadan önce bu adres sorulur; link başkasına iletilse de
              adresi bilmeyen açamaz. Bir şifre değildir — adresi bilen herkes geçer.
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 12, color: c.textSecondary }}>Neler görünsün?</label>
            {/* Özet her linkte var: kapatılabilseydi geriye boş bir sayfa kalırdı. */}
            <div
              style={{
                fontSize: 12,
                color: c.textSecondary,
                background: c.background,
                border: `1px solid ${c.border}`,
                borderRadius: 8,
                padding: "6px 10px",
              }}
            >
              Proje adı, durumu, tarihleri ve ilerleme yüzdesi her linkte görünür.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 4 }}>
              {SECTIONS.map((s) => (
                <label
                  key={s.key}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                    padding: "7px 8px",
                    borderRadius: 8,
                    cursor: "pointer",
                    background: visibility[s.key] ? `${c.accent}14` : "transparent",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={visibility[s.key]}
                    onChange={() => toggle(s.key)}
                    style={{ marginTop: 2 }}
                  />
                  <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    <span style={{ fontSize: 13, color: c.textPrimary }}>{s.label}</span>
                    <span style={{ fontSize: 11, color: c.textSecondary }}>{s.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 12, color: c.textSecondary }}>Geçerlilik</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {EXPIRY_OPTIONS.map((o, i) => (
                <button
                  key={o.label}
                  onClick={() => setExpiryIndex(i)}
                  style={{
                    fontSize: 12,
                    padding: "5px 12px",
                    borderRadius: 999,
                    cursor: "pointer",
                    border: `1px solid ${i === expiryIndex ? c.accent : c.border}`,
                    background: i === expiryIndex ? `${c.accent}1A` : c.surface,
                    color: c.textPrimary,
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <span style={{ fontSize: 11, color: c.textSecondary }}>
              Süreden bağımsız olarak, proje tamamlandığında link kendiliğinden kapanır.
            </span>
          </div>

          {error && <p style={{ color: c.danger, fontSize: 13, margin: 0 }}>{error}</p>}

          <button
            onClick={handleCreate}
            disabled={creating}
            data-primary
            style={{
              background: c.primary,
              color: c.onPrimary,
              padding: "10px 0",
              borderRadius: 8,
              border: "none",
              fontSize: 15,
              fontWeight: 500,
              cursor: creating ? "default" : "pointer",
            }}
          >
            {creating ? "Oluşturuluyor…" : "Link oluştur"}
          </button>
        </section>

        {/* -------------------------------------------------- Mevcut linkler */}
        <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 14, color: c.textPrimary }}>Oluşturulmuş linkler</h3>
          {loading ? (
            <span style={{ fontSize: 13, color: c.textSecondary }}>Yükleniyor…</span>
          ) : links.length === 0 ? (
            <span style={{ fontSize: 13, color: c.textSecondary }}>Henüz link oluşturmadın.</span>
          ) : (
            links.map((link) => (
              <div
                key={link.id}
                style={{
                  border: `1px solid ${c.border}`,
                  borderRadius: 10,
                  padding: 10,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  // Kapalı linkler soluk: listede kalıyorlar ama artık çalışmıyorlar.
                  opacity: link.active ? 1 : 0.55,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, color: c.textPrimary, flex: 1, minWidth: 0 }}>
                    {link.label ?? "Adsız link"}
                  </span>
                  {!link.active && (
                    <span style={{ fontSize: 11, color: c.danger }}>{CLOSED_LABEL[link.closedReason ?? "expired"]}</span>
                  )}
                  {link.active && (
                    <button
                      onClick={() => setRevoking(link)}
                      title="Linki kapat"
                      aria-label="Linki kapat"
                      style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4 }}
                    >
                      <IconTrash size={15} color={c.textSecondary} />
                    </button>
                  )}
                </div>

                {link.active && <CopyRow url={link.url} />}

                <div style={{ fontSize: 11, color: c.textSecondary, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <span>{sectionSummary(link.visibility)}</span>
                  {link.recipientEmail && <span>Kapı: {link.recipientEmail}</span>}
                  <span>
                    {link.viewCount === 0
                      ? "Henüz açılmadı"
                      : `${link.viewCount} kez açıldı${
                          link.lastViewedAt
                            ? ` · son: ${parseServerDate(link.lastViewedAt).toLocaleDateString("tr-TR")}`
                            : ""
                        }`}
                  </span>
                  {link.expiresAt && link.active && (
                    <span>Bitiş: {parseServerDate(link.expiresAt).toLocaleDateString("tr-TR")}</span>
                  )}
                </div>
              </div>
            ))
          )}
        </section>
      </div>

      {revoking && (
        <ConfirmDialog
          title="Link kapatılsın mı?"
          message={`${
            revoking.label ? `"${revoking.label}" ` : ""
          }linkini kapatırsan, bu adresi daha önce gönderdiğin kişiler projeyi artık göremez. Bu işlem geri alınamaz; gerekirse yeni bir link oluşturabilirsin.`}
          confirmLabel="Linki kapat"
          onConfirm={() => handleRevoke(revoking)}
          onCancel={() => setRevoking(null)}
        />
      )}
    </Modal>
  );
}

/** Az önce oluşturulan link — kullanıcının aradığı tek şey bu, en üstte durur. */
function CreatedLinkBox({ link }: { link: ProjectShareLink }) {
  const c = useThemeColors();
  return (
    <div
      style={{
        border: `1px solid ${c.accent}`,
        background: `${c.accent}12`,
        borderRadius: 10,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <span style={{ fontSize: 13, color: c.textPrimary }}>Link hazır — kopyalayıp gönderebilirsin.</span>
      <CopyRow url={link.url} />
    </div>
  );
}

/**
 * Adres + kopyala.
 *
 * Adres salt okunur bir input'ta duruyor, düz metinde değil: pano yazma izni
 * olmayan bağlamlarda (http üzerinden açılmış geliştirme sunucusu, izin
 * vermeyen tarayıcı) kullanıcı yine de metni seçip elle kopyalayabilsin.
 */
function CopyRow({ url }: { url: string }) {
  const c = useThemeColors();
  const inputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Pano yazılamadı: metni seç, kullanıcı kendi kopyalasın.
      inputRef.current?.select();
    }
  };

  return (
    <div style={{ display: "flex", gap: 6 }}>
      <input
        ref={inputRef}
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        style={{ flex: 1, minWidth: 0, fontSize: 12, padding: "6px 8px" }}
      />
      <button
        onClick={copy}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          fontSize: 12,
          padding: "6px 10px",
          borderRadius: 8,
          border: `1px solid ${c.border}`,
          background: c.surface,
          color: c.textPrimary,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        <IconCopy size={14} color={c.textSecondary} />
        {copied ? "Kopyalandı" : "Kopyala"}
      </button>
    </div>
  );
}
