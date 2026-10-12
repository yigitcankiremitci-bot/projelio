import { useEffect, useState } from "react";
import type { ProjectFile } from "@projelio/shared";
import { socialMediaApi, type SocialFileBrowse, type SocialScope } from "../api/socialMedia";
import { fileKindLabel, formatFileSize } from "../lib/driveLinks";
import { useFileThumbnails } from "../lib/fileThumbnails";
import { useT } from "../lib/i18n";
import { useThemeColors } from "../theme/useThemeColors";
import FileThumb from "./FileThumb";
import Modal from "./Modal";
import { IconCheck, IconChevronLeft, IconFolder } from "./icons";

interface Props {
  scope: SocialScope;
  /**
   * "medya": çoklu seçim, seçim sırası karusel sırasıdır.
   * "kapak": tek JPEG görsel (Instagram kapakta yalnızca JPEG alıyor).
   */
  mode: "medya" | "kapak";
  /** Gönderide zaten olan dosyalar: yeniden seçilmesin diye işaretli görünür. */
  mevcut?: string[];
  onClose: () => void;
  onPicked: (files: ProjectFile[]) => void | Promise<void>;
}

const BOS: SocialFileBrowse = { roots: [], root: null, folders: [], files: [], breadcrumb: [] };

/** Kök anahtarı → görünen ad. Sunucunun adı Türkçe; çeviri burada. */
const KOK_ADI: Record<string, string> = {
  job: "İşin dosyaları",
  department: "Departman dosyaları",
  organization: "Şirket dosyaları",
};

/**
 * "Dosyalardan seç": içerik penceresinden çıkmadan Projelio'nun Dosyalar
 * bölümündeki klasörlerde gezinip görselleri/videoları TOPLU seçmek.
 *
 * NEDEN: karusel hazırlayan kullanıcı dosyaları zaten Dosyalar'da, klasör
 * klasör tutuyordu; ama içerik penceresi yalnızca bilgisayardan yüklemeye ve
 * tek dosyalık Drive seçicisine izin veriyordu. Aynı dosyaları indirip yeniden
 * yüklemek zorunda kalıyordu. Burada seçilen dosya KOPYALANMAZ, gönderiye
 * bağlanır — Dosyalar'da yerinde durur.
 *
 * Seçim sırası korunur: karuselde ilk seçilen ilk görünür (ve kapak olur).
 */
export default function SocialFilePickerModal({ scope, mode, mevcut = [], onClose, onPicked }: Props) {
  const c = useThemeColors();
  const t = useT();
  const [kok, setKok] = useState<string | undefined>(undefined);
  const [folderId, setFolderId] = useState<string | undefined>(undefined);
  const [data, setData] = useState<SocialFileBrowse>(BOS);
  const [loading, setLoading] = useState(true);
  // Klasörler arasında gezinirken seçim KORUNUR: farklı klasörlerden toplanan
  // dosyalar tek seferde eklenebilsin. Bu yüzden dosyanın kendisi tutuluyor.
  const [secili, setSecili] = useState<ProjectFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const thumbs = useFileThumbnails(data.files);
  // Kapsam nesnesi her çizimde yeniden kurulabiliyor; içeriğe göre izlenir.
  const scopeKey = JSON.stringify(scope);

  useEffect(() => {
    let iptal = false;
    setLoading(true);
    setError("");
    socialMediaApi
      .browseFiles(scope, kok, folderId)
      .then((d) => {
        if (!iptal) setData(d);
      })
      .catch((e: Error) => {
        if (!iptal) setError(e.message);
      })
      .finally(() => {
        if (!iptal) setLoading(false);
      });
    return () => {
      iptal = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, kok, folderId]);

  const secilebilir = (f: ProjectFile) =>
    !mevcut.includes(f.id) && (mode === "medya" || f.mimeType === "image/jpeg");

  const degistir = (f: ProjectFile) => {
    if (!secilebilir(f)) return;
    if (mode === "kapak") {
      setSecili((s) => (s[0]?.id === f.id ? [] : [f]));
      return;
    }
    setSecili((s) => (s.some((x) => x.id === f.id) ? s.filter((x) => x.id !== f.id) : [...s, f]));
  };

  // "Tümünü seç" yalnızca bu klasörün dosyaları; alt klasörlere inmez —
  // kullanıcı neyin ekleneceğini ekranda görmeli.
  const klasordekiler = data.files.filter(secilebilir);
  const hepsiSecili = klasordekiler.length > 0 && klasordekiler.every((f) => secili.some((x) => x.id === f.id));
  const tumunuDegistir = () =>
    setSecili((s) =>
      hepsiSecili
        ? s.filter((x) => !klasordekiler.some((f) => f.id === x.id))
        : [...s, ...klasordekiler.filter((f) => !s.some((x) => x.id === f.id))]
    );

  const ekle = async () => {
    if (!secili.length) return;
    setBusy(true);
    setError("");
    try {
      await onPicked(secili);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? t("Eklenemedi"));
    } finally {
      setBusy(false);
    }
  };

  const ustKlasor = data.breadcrumb.length > 1 ? data.breadcrumb[data.breadcrumb.length - 2].id : undefined;
  const kokAdi = data.root ? t(KOK_ADI[data.root] ?? data.root) : t("Dosyalar");

  return (
    <Modal
      title={mode === "kapak" ? t("Kapak seç") : t("Dosyalardan seç")}
      subtitle={
        mode === "kapak"
          ? t("Instagram kapakta yalnızca JPEG görsel kabul ediyor.")
          : t("Klasörler arasında gezinip birden çok görsel/video seçebilirsin. Seçim sırası karusel sırasıdır.")
      }
      onClose={onClose}
      maxWidth={620}
    >
      {/* Kök seçimi: iş kapsamında tek kök, şirkette departman + şirket. */}
      {data.roots.length > 1 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {data.roots.map((r) => {
            const on = r.key === data.root;
            return (
              <button
                key={r.key}
                type="button"
                onClick={() => {
                  setKok(r.key);
                  setFolderId(undefined);
                }}
                style={{
                  fontSize: 13,
                  padding: "4px 12px",
                  borderRadius: 999,
                  border: `1px solid ${on ? c.accent : c.border}`,
                  background: on ? `${c.accent}1A` : "transparent",
                  color: on ? c.textPrimary : c.textSecondary,
                  cursor: "pointer",
                }}
              >
                {t(KOK_ADI[r.key] ?? r.label)}
              </button>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 10, fontSize: 14 }}>
        {folderId && (
          <button
            type="button"
            onClick={() => setFolderId(ustKlasor)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              background: "transparent",
              border: `1px solid ${c.border}`,
              borderRadius: 8,
              color: c.textPrimary,
              cursor: "pointer",
              padding: "3px 9px 3px 6px",
              fontSize: 13,
            }}
          >
            <IconChevronLeft size={13} color={c.textSecondary} />
            {t("Geri")}
          </button>
        )}
        <button
          type="button"
          onClick={() => setFolderId(undefined)}
          style={{ background: "transparent", border: "none", color: c.accent, cursor: "pointer", padding: 0, fontSize: 14 }}
        >
          {kokAdi}
        </button>
        {data.breadcrumb.map((k) => (
          <span key={k.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: c.textSecondary }}>/</span>
            <button
              type="button"
              onClick={() => setFolderId(k.id)}
              style={{ background: "transparent", border: "none", color: c.accent, cursor: "pointer", padding: 0, fontSize: 14 }}
            >
              {k.name}
            </button>
          </span>
        ))}
        {mode === "medya" && klasordekiler.length > 1 && (
          <button
            type="button"
            onClick={tumunuDegistir}
            style={{
              marginLeft: "auto",
              fontSize: 13,
              padding: "3px 10px",
              borderRadius: 8,
              border: `1px solid ${c.border}`,
              background: "transparent",
              color: c.textPrimary,
              cursor: "pointer",
            }}
          >
            {hepsiSecili ? t("Seçimi kaldır") : t("Bu klasördekilerin tümünü seç ({n})", { n: klasordekiler.length })}
          </button>
        )}
      </div>

      {error && <div style={{ color: c.danger, fontSize: 14, marginBottom: 10 }}>{error}</div>}

      <div style={{ maxHeight: 380, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
        {loading ? (
          <div style={{ color: c.textSecondary, fontSize: 15 }}>{t("Yükleniyor…")}</div>
        ) : !data.root ? (
          <div style={{ color: c.textSecondary, fontSize: 15 }}>{t("Erişebildiğin bir dosya klasörü yok.")}</div>
        ) : !data.folders.length && !data.files.length ? (
          <div style={{ color: c.textSecondary, fontSize: 15 }}>{t("Bu klasörde görsel ya da video yok.")}</div>
        ) : (
          <>
            {data.folders.map((klasor) => (
              <button
                key={klasor.id}
                type="button"
                onClick={() => setFolderId(klasor.id)}
                style={satirStili(c.border, false)}
              >
                <IconFolder size={18} color={c.accent} />
                <span style={{ flex: 1, fontSize: 15, color: c.textPrimary, textAlign: "left" }}>{klasor.name}</span>
                <span style={{ fontSize: 12, color: c.textSecondary }}>{t("Klasör")}</span>
              </button>
            ))}

            {data.files.map((file) => {
              const sira = secili.findIndex((x) => x.id === file.id);
              const isaretli = sira >= 0;
              const zatenVar = mevcut.includes(file.id);
              const uygun = secilebilir(file);
              return (
                <button
                  key={file.id}
                  type="button"
                  onClick={() => degistir(file)}
                  disabled={!uygun}
                  title={
                    zatenVar
                      ? t("Bu dosya içerikte zaten var")
                      : !uygun
                      ? t("Kapak JPEG olmalı")
                      : undefined
                  }
                  style={{
                    ...satirStili(isaretli ? c.accent : c.border, isaretli),
                    opacity: uygun ? 1 : 0.5,
                    cursor: uygun ? "pointer" : "default",
                  }}
                >
                  <SecimKutusu isaretli={isaretli || zatenVar} sira={mode === "medya" && isaretli ? sira + 1 : undefined} />
                  <FileThumb file={file} thumbs={thumbs} variant="row" size={28} />
                  <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                    <span
                      style={{
                        display: "block",
                        fontSize: 15,
                        color: c.textPrimary,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {file.name}
                    </span>
                    <span style={{ display: "block", fontSize: 12, color: c.textSecondary }}>
                      {[
                        zatenVar ? t("içerikte var") : null,
                        fileKindLabel(file),
                        file.sizeBytes ? formatFileSize(file.sizeBytes) : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </button>
              );
            })}
          </>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button
          data-primary
          onClick={ekle}
          disabled={busy || !secili.length}
          style={{
            flex: 1,
            padding: "9px 0",
            borderRadius: 9,
            border: "none",
            background: secili.length ? c.primary : c.border,
            color: secili.length ? c.onPrimary : c.textSecondary,
            fontSize: 15,
            cursor: secili.length ? "pointer" : "not-allowed",
          }}
        >
          {busy
            ? t("Ekleniyor…")
            : mode === "kapak"
            ? t("Kapak yap")
            : secili.length > 1
            ? t("{sayi} dosyayı ekle", { sayi: secili.length })
            : t("Ekle")}
        </button>
        <button onClick={onClose} disabled={busy} style={{ padding: "9px 16px", fontSize: 15 }}>
          {t("Vazgeç")}
        </button>
      </div>
    </Modal>
  );
}

function satirStili(border: string, secili: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "8px 10px",
    borderRadius: 9,
    border: `1px solid ${border}`,
    background: secili ? `${border}14` : "transparent",
    cursor: "pointer",
  };
}

function SecimKutusu({ isaretli, sira }: { isaretli: boolean; sira?: number }) {
  const c = useThemeColors();
  return (
    <span
      style={{
        width: 18,
        height: 18,
        borderRadius: 4,
        flexShrink: 0,
        border: isaretli ? "none" : `1.5px solid ${c.border}`,
        background: isaretli ? c.accent : "transparent",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 11,
        fontWeight: 600,
        color: c.onPrimary,
      }}
    >
      {sira !== undefined ? sira : isaretli && <IconCheck size={10} color={c.onPrimary} />}
    </span>
  );
}
