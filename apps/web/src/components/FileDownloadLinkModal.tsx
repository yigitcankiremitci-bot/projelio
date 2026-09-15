import { useEffect, useRef, useState } from "react";
import type { FileDownloadLink } from "@projelio/shared";
import type { ProjectFile } from "@projelio/shared";
import { fileDownloadLinksApi } from "../api/fileDownloadLinks";
import { formatDateTime } from "../lib/dates";
import { useT } from "../lib/i18n";
import { useThemeColors } from "../theme/useThemeColors";
import Modal from "./Modal";
import { IconCopy, IconSend, IconTrash } from "./icons";

interface Props {
  file: ProjectFile;
  onClose: () => void;
}

/**
 * "Bağlantı oluştur": dosyayı Projelio hesabı OLMAYAN birine göndermek.
 *
 * NEDEN AYRI BİR PENCERE ve menüde tek tıkla üretilmiyor: bağlantı üretmek
 * kararın YARISI. Asıl sorular hemen ardından geliyor — indirsin mi yoksa
 * yalnızca baksın mı, adresini sorayım mı, indirince haber alayım mı. Menüde
 * "kopyalandı" deyip geçmek, bu üç kararı da sessizce varsayılana bırakırdı.
 *
 * ADRES SUNUCUDAN GELİYOR (`link.url`), burada kurulmuyor: web adresi ortama
 * göre değişiyor ve ikinci bir kopya, e-postayla gönderilen adresle panodaki
 * adresin ayrışması demekti.
 */
export default function FileDownloadLinkModal({ file, onClose }: Props) {
  const c = useThemeColors();
  const t = useT();
  const [links, setLinks] = useState<FileDownloadLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const yukle = () =>
    fileDownloadLinksApi
      .list(file.id)
      .then(setLinks)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));

  useEffect(() => {
    void yukle();
  }, [file.id]);

  const olustur = async () => {
    setBusy(true);
    setError("");
    try {
      const link = await fileDownloadLinksApi.create(file.id);
      setLinks((onceki) => [link, ...onceki]);
    } catch (e: any) {
      setError(e?.message ?? t("Bağlantı oluşturulamadı"));
    } finally {
      setBusy(false);
    }
  };

  const degistir = (guncel: FileDownloadLink) =>
    setLinks((onceki) => onceki.map((l) => (l.id === guncel.id ? guncel : l)));

  const acikVar = links.some((l) => l.active);

  return (
    <Modal title={t("İndirme bağlantısı")} subtitle={file.name} onClose={onClose} maxWidth={520}>
      {error && <div style={{ color: c.danger, fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {loading ? (
        <div style={{ color: c.textSecondary, fontSize: 14 }}>{t("Yükleniyor…")}</div>
      ) : (
        <>
          {links.length === 0 && (
            <p style={{ margin: "0 0 16px", fontSize: 14, lineHeight: 1.6, color: c.textSecondary }}>
              {t(
                "Bu dosya için bir bağlantı oluşturun; açan kişi Projelio hesabı olmadan dosyayı önizleyip indirebilir. Bağlantıyı istediğiniz an kaldırabilirsiniz."
              )}
            </p>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {links.map((link) => (
              <LinkKarti key={link.id} link={link} onChange={degistir} />
            ))}
          </div>

          <button
            type="button"
            data-primary
            onClick={() => void olustur()}
            disabled={busy}
            style={{
              marginTop: links.length ? 16 : 0,
              width: "100%",
              padding: "11px 14px",
              borderRadius: 10,
              border: "none",
              background: acikVar ? "transparent" : c.accent,
              color: acikVar ? c.accent : "#fff",
              boxShadow: acikVar ? `inset 0 0 0 1px ${c.border}` : undefined,
              fontSize: 15,
              fontWeight: 600,
              cursor: busy ? "wait" : "pointer",
            }}
          >
            {acikVar ? t("Yeni bağlantı oluştur") : t("Bağlantı oluştur")}
          </button>
        </>
      )}
    </Modal>
  );
}

/** Tek bir bağlantının kartı: adres, ayarlar, e-postayla gönderme, kaldırma. */
function LinkKarti({ link, onChange }: { link: FileDownloadLink; onChange: (l: FileDownloadLink) => void }) {
  const c = useThemeColors();
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState("");
  const [alici, setAlici] = useState(link.recipientEmail ?? "");
  const [gonderAdres, setGonderAdres] = useState(link.recipientEmail ?? "");
  const [not, setNot] = useState("");
  const [gonderimDurumu, setGonderimDurumu] = useState<"" | "gonderildi" | "gonderilemedi">("");

  const guncelle = async (input: Parameters<typeof fileDownloadLinksApi.update>[1]) => {
    setBusy(true);
    setHata("");
    try {
      onChange(await fileDownloadLinksApi.update(link.id, input));
    } catch (e: any) {
      setHata(e?.message ?? t("Kaydedilemedi"));
    } finally {
      setBusy(false);
    }
  };

  const kaldir = async () => {
    setBusy(true);
    setHata("");
    try {
      onChange(await fileDownloadLinksApi.revoke(link.id));
    } catch (e: any) {
      setHata(e?.message ?? t("Kaldırılamadı"));
    } finally {
      setBusy(false);
    }
  };

  const epostaylaGonder = async () => {
    setBusy(true);
    setHata("");
    setGonderimDurumu("");
    try {
      const sonuc = await fileDownloadLinksApi.send(link.id, gonderAdres.trim(), not.trim() || undefined);
      onChange(sonuc.link);
      // `sent: false` sessizce "gönderildi" sayılmaz: e-posta sağlayıcısı
      // yapılandırılmamışsa istek başarılı olur ama mesaj hiç çıkmaz.
      setGonderimDurumu(sonuc.sent ? "gonderildi" : "gonderilemedi");
      if (sonuc.sent) setNot("");
    } catch (e: any) {
      setHata(e?.message ?? t("Gönderilemedi"));
    } finally {
      setBusy(false);
    }
  };

  const kutu: React.CSSProperties = {
    border: `1px solid ${c.border}`,
    borderRadius: 12,
    padding: 14,
    background: link.active ? c.surface : "transparent",
    opacity: link.active ? 1 : 0.6,
  };

  if (!link.active) {
    return (
      <div style={kutu}>
        <div style={{ fontSize: 13, color: c.textSecondary }}>
          {link.closedReason === "expired" ? t("Süresi doldu") : t("Bağlantı kapatıldı")}
          {" · "}
          {t("{sayi} indirme", { sayi: link.downloadCount })}
          {link.label ? ` · ${link.label}` : ""}
        </div>
      </div>
    );
  }

  return (
    <div style={kutu}>
      <KopyalaSatiri url={link.url} />

      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        <Anahtar
          checked={link.downloadEnabled}
          disabled={busy}
          onChange={(v) => void guncelle({ downloadEnabled: v })}
          label={t("İndirmeye izin ver")}
          hint={t("Kapalıyken bağlantıyı açan kişi dosyayı görebilir ama indiremez.")}
        />
        <Anahtar
          checked={link.notifyOnDownload}
          disabled={busy}
          onChange={(v) => void guncelle({ notifyOnDownload: v })}
          label={t("İndirilince bana haber ver")}
          hint={t("E-posta ve uygulama içi bildirim gönderilir.")}
        />
      </div>

      {/* E-posta kapısı. Kimlik doğrulaması DEĞİL (bkz. migration 077); metin
          de böyle söylüyor ki kullanıcı bunu bir kilit sanmasın. */}
      <div style={{ marginTop: 14 }}>
        <label style={{ display: "block", fontSize: 13, color: c.textSecondary, marginBottom: 5 }}>
          {t("Yalnızca bu adresi bilen açsın (isteğe bağlı)")}
        </label>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            type="email"
            value={alici}
            disabled={busy}
            onChange={(e) => setAlici(e.target.value)}
            placeholder={t("ornek@firma.com")}
            style={{ flex: 1, minWidth: 0, fontSize: 13, padding: "7px 9px" }}
          />
          <button
            type="button"
            onClick={() => void guncelle({ recipientEmail: alici.trim() || null })}
            disabled={busy || (alici.trim() || null) === (link.recipientEmail ?? null)}
            style={ikincilButon(c)}
          >
            {t("Kaydet")}
          </button>
        </div>
      </div>

      {/* Süre. "Süresiz" varsayılan: çoğu paylaşım tek seferlik ve kullanıcı
          süreyi düşünmek zorunda kalmasın; kalıcı olmasını istemeyen seçer. */}
      <div style={{ marginTop: 14 }}>
        <label style={{ display: "block", fontSize: 13, color: c.textSecondary, marginBottom: 5 }}>
          {t("Geçerlilik")}
        </label>
        <select
          disabled={busy}
          value=""
          onChange={(e) => {
            const v = e.target.value;
            if (v === "") return;
            void guncelle({ expiresInDays: v === "0" ? null : Number(v) });
          }}
          style={{ width: "100%", fontSize: 13, padding: "7px 9px" }}
        >
          <option value="">
            {link.expiresAt
              ? t("{tarih} tarihine kadar — değiştir", { tarih: formatDateTime(link.expiresAt) })
              : t("Süresiz — değiştir")}
          </option>
          <option value="0">{t("Süresiz")}</option>
          <option value="1">{t("1 gün")}</option>
          <option value="7">{t("7 gün")}</option>
          <option value="30">{t("30 gün")}</option>
          <option value="90">{t("90 gün")}</option>
        </select>
      </div>

      {/* E-postayla gönderme. Gönderen link@ alan adı, yanıt kullanıcının
          kendi adresi — alıcı "bu dosya ne?" diye yanıtlayabilsin. */}
      <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${c.border}` }}>
        <label style={{ display: "block", fontSize: 13, color: c.textSecondary, marginBottom: 5 }}>
          {t("Bağlantıyı e-postayla gönder")}
        </label>
        <input
          type="email"
          value={gonderAdres}
          disabled={busy}
          onChange={(e) => setGonderAdres(e.target.value)}
          placeholder={t("alici@firma.com")}
          style={{ width: "100%", fontSize: 13, padding: "7px 9px", marginBottom: 6 }}
        />
        <textarea
          value={not}
          disabled={busy}
          onChange={(e) => setNot(e.target.value)}
          placeholder={t("Kısa bir not (isteğe bağlı)")}
          rows={2}
          style={{ width: "100%", fontSize: 13, padding: "7px 9px", resize: "vertical" }}
        />
        <button
          type="button"
          onClick={() => void epostaylaGonder()}
          disabled={busy || !gonderAdres.trim()}
          style={{ ...ikincilButon(c), marginTop: 6, display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <IconSend size={14} color={c.textSecondary} />
          {t("Gönder")}
        </button>
        {gonderimDurumu === "gonderildi" && (
          <span style={{ marginLeft: 10, fontSize: 12, color: c.textSecondary }}>{t("Gönderildi")}</span>
        )}
        {gonderimDurumu === "gonderilemedi" && (
          <span style={{ marginLeft: 10, fontSize: 12, color: c.danger }}>
            {t("E-posta gönderilemedi; bağlantıyı kopyalayıp kendiniz iletebilirsiniz.")}
          </span>
        )}
      </div>

      <div
        style={{
          marginTop: 14,
          paddingTop: 12,
          borderTop: `1px solid ${c.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: 12, color: c.textSecondary }}>
          {t("{goruntuleme} görüntüleme · {indirme} indirme", {
            goruntuleme: link.viewCount,
            indirme: link.downloadCount,
          })}
          {link.lastDownloadedAt ? ` · ${t("son indirme {tarih}", { tarih: formatDateTime(link.lastDownloadedAt) })}` : ""}
        </span>
        <button
          type="button"
          onClick={() => void kaldir()}
          disabled={busy}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 12,
            padding: "6px 10px",
            borderRadius: 8,
            border: `1px solid ${c.border}`,
            background: "transparent",
            color: c.danger,
            cursor: "pointer",
          }}
        >
          <IconTrash size={13} color={c.danger} />
          {t("Bağlantıyı kapat")}
        </button>
      </div>

      {hata && <div style={{ marginTop: 8, fontSize: 12, color: c.danger }}>{hata}</div>}
    </div>
  );
}

function ikincilButon(c: ReturnType<typeof useThemeColors>): React.CSSProperties {
  return {
    fontSize: 13,
    padding: "7px 12px",
    borderRadius: 8,
    border: `1px solid ${c.border}`,
    background: c.surface,
    color: c.textPrimary,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

function Anahtar({
  checked,
  disabled,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
}) {
  const c = useThemeColors();
  return (
    <label style={{ display: "flex", gap: 9, alignItems: "flex-start", cursor: disabled ? "wait" : "pointer" }}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: 2 }}
      />
      <span>
        <span style={{ display: "block", fontSize: 14, color: c.textPrimary }}>{label}</span>
        <span style={{ display: "block", fontSize: 12, color: c.textSecondary, lineHeight: 1.5 }}>{hint}</span>
      </span>
    </label>
  );
}

/**
 * Adres + kopyala.
 *
 * Adres salt okunur bir input'ta duruyor, düz metinde değil: pano yazma izni
 * olmayan bağlamlarda kullanıcı yine de metni seçip elle kopyalayabilsin
 * (ShareProjectModal'daki CopyRow ile aynı gerekçe).
 */
function KopyalaSatiri({ url }: { url: string }) {
  const c = useThemeColors();
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [kopyalandi, setKopyalandi] = useState(false);

  useEffect(() => {
    if (!kopyalandi) return;
    const zaman = setTimeout(() => setKopyalandi(false), 2000);
    return () => clearTimeout(zaman);
  }, [kopyalandi]);

  const kopyala = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setKopyalandi(true);
    } catch {
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
      <button type="button" onClick={() => void kopyala()} style={{ ...ikincilButon(c), display: "flex", alignItems: "center", gap: 5, fontSize: 12, padding: "6px 10px" }}>
        <IconCopy size={14} color={c.textSecondary} />
        {kopyalandi ? t("Kopyalandı") : t("Kopyala")}
      </button>
    </div>
  );
}
