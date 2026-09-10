import { useEffect, useRef, useState } from "react";
import type { ProjectFile } from "@projelio/shared";
import { filesApi, uploadFile, type UploadTarget } from "../api/files";
import { driveEditUrl, driveProviderLabel, fileKindLabel, formatFileSize } from "../lib/driveLinks";
import { useT } from "../lib/i18n";
import { useThemeColors } from "../theme/useThemeColors";
import FilePreviewModal from "./FilePreviewModal";
import { IconExternalLink, IconFile, IconUpload, IconX } from "./icons";

interface Props {
  /** Virgülle ayrılmış dosya kimlikleri (bkz. moduleForms/types.ts attachmentKey). */
  value: string;
  /** Düzenleme kipinde verilir; okuma kipinde verilmez. */
  onChange?: (next: string) => void;
  /** Yüklemenin gideceği yer. Yoksa yalnızca mevcut ekler listelenir. */
  target?: UploadTarget | null;
}

/**
 * Bir A1 form alanının cevabına iliştirilmiş dosyalar.
 *
 * NEDEN AYRI BİR KAVRAM: modül kaydının tamamına dosya bağlamak zaten mümkün
 * (file_links, migration 095) ama orada bağlantı KAYDA asılır — hangi soruya
 * ait olduğu kaybolur ve taslak/onay ayrımını hiç bilmez. Marka kılavuzunda
 * "logo dosyaları" ile "tescil belgesi" aynı torbaya girseydi, kılavuzu okuyan
 * kişi doğru dosyayı yine sorarak bulurdu. Bu yüzden kimlikler kaydın kendi
 * jsonb'sinde, alanın yanındaki anahtarda duruyor: metinle birlikte taslakta
 * bekliyor, metinle birlikte onaylanıyor, sürüm geçmişinde metinle birlikte
 * görünüyor.
 *
 * ERİŞİLEMEYEN DOSYA SESSİZCE ELENİR: künyesi okunamayan kimlik listede hiç
 * çizilmez ama değerden de SİLİNMEZ. Silseydik, dosyaya erişimi olmayan bir
 * üyenin kaydı açıp kaydetmesi başkalarının eklerini süpürürdü.
 */
export default function ModuleFormAttachments({ value, onChange, target }: Props) {
  const c = useThemeColors();
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [preview, setPreview] = useState<ProjectFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const ids = value.split(",").map((v) => v.trim()).filter(Boolean);
  // Etkiyi id LİSTESİNE bağlıyoruz, diziye değil: dizi her çizimde yeni bir
  // referans ve bağımlılık olarak verilseydi istek döngüye girerdi.
  const idKey = ids.join(",");

  useEffect(() => {
    if (!idKey) {
      setFiles([]);
      return;
    }
    let cancelled = false;
    Promise.all(idKey.split(",").map((id) => filesApi.getById(id).catch(() => null))).then((rows) => {
      if (!cancelled) setFiles(rows.filter((f): f is ProjectFile => Boolean(f)));
    });
    return () => {
      cancelled = true;
    };
  }, [idKey]);

  const yukle = async (picked: FileList | null) => {
    if (!picked || picked.length === 0 || !target || !onChange) return;
    setBusy(true);
    setError("");
    const eklenen: string[] = [];
    try {
      for (const file of Array.from(picked)) {
        const uploaded = await uploadFile(target, file);
        eklenen.push(uploaded.id);
      }
    } catch (e: any) {
      setError(e?.message ?? t("Dosya yüklenemedi"));
    } finally {
      // Hata yarıda çıksa bile yüklenenler kaybolmasın: kullanıcı üç dosya
      // seçtiyse ve üçüncüsü patladıysa ilk ikisi gerçekten yüklendi.
      if (eklenen.length > 0) onChange([...ids, ...eklenen].join(","));
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const cikar = (id: string) => onChange?.(ids.filter((x) => x !== id).join(","));

  // Okuma kipinde eki olmayan alan hiçbir iz bırakmamalı.
  if (!onChange && files.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: onChange ? 2 : 6 }}>
      {files.map((file) => (
        <div
          key={file.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 8px",
            borderRadius: 8,
            border: `1px solid ${c.border}`,
            background: c.background,
          }}
        >
          <IconFile size={15} color={c.textSecondary} />
          <button
            type="button"
            onClick={() => setPreview(file)}
            style={{
              flex: 1,
              minWidth: 0,
              textAlign: "left",
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
              color: file.status === "missing" ? c.danger : c.textPrimary,
              fontSize: 13,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {file.name}
            <span style={{ color: c.textSecondary, fontWeight: 400 }}>
              {" · "}
              {[fileKindLabel(file), file.sizeBytes ? formatFileSize(file.sizeBytes) : null]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </button>
          <button
            type="button"
            title={t("{saglayici}'da aç", { saglayici: driveProviderLabel(file) })}
            onClick={() => window.open(driveEditUrl(file), "_blank", "noopener,noreferrer")}
            style={ikonDugmesi}
          >
            <IconExternalLink size={13} color={c.textSecondary} />
          </button>
          {onChange && (
            <button type="button" title={t("Ekten çıkar")} onClick={() => cikar(file.id)} style={ikonDugmesi}>
              <IconX size={13} color={c.textSecondary} />
            </button>
          )}
        </div>
      ))}

      {onChange && target && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <input
            ref={inputRef}
            type="file"
            multiple
            onChange={(e) => void yukle(e.target.files)}
            style={{ display: "none" }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              padding: "5px 10px",
              borderRadius: 8,
              border: `1px dashed ${c.border}`,
              background: "transparent",
              color: c.textSecondary,
              cursor: busy ? "default" : "pointer",
            }}
          >
            <IconUpload size={13} color={c.textSecondary} />
            {busy ? t("Yükleniyor…") : t("Dosya ekle")}
          </button>
        </div>
      )}

      {error && <span style={{ fontSize: 12, color: c.danger }}>{error}</span>}
      {preview && <FilePreviewModal file={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

const ikonDugmesi = {
  display: "flex",
  alignItems: "center",
  background: "transparent",
  border: "none",
  padding: 2,
  cursor: "pointer",
  flexShrink: 0,
} as const;
