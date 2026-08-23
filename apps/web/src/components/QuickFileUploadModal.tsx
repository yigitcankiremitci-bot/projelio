import { useEffect, useRef, useState } from "react";
import type { GoogleDriveStatus } from "@projelio/shared";
import { driveApi, oneDriveApi, uploadFile } from "../api/files";
import { useThemeColors } from "../theme/useThemeColors";
import Modal from "./Modal";
import { IconUpload } from "./icons";

/** Yüklemenin gideceği yer. uploadFile'ın kabul ettiği hedeflerle birebir aynı. */
export interface UploadTargetOption {
  /** select'in değeri; hedef türünden bağımsız benzersiz bir anahtar. */
  id: string;
  label: string;
  /** Verilirse seçenekler optgroup altında toplanır (örn. iş adı). */
  group?: string;
  target: { jobId: string } | { projectId: string } | { departmentId: string };
}

interface Props {
  targets: UploadTargetOption[];
  /** Seçim kutusunun etiketi — "Departman", "Nereye" gibi. */
  pickerLabel: string;
  /** Hiç hedef yoksa gösterilecek açıklama. */
  emptyMessage: string;
  onClose: () => void;
  onUploaded: () => void;
}

/**
 * "+" menüsünden "Dosya ekle" ile açılır.
 *
 * Dosyalar her zaman bir İŞE, PROJEYE ya da DEPARTMANA ait olduğu için (bkz.
 * FilesPanel.tsx üstündeki not) "genel" bir yükleme yeri yok — kullanıcı önce
 * nereye yükleyeceğini seçmeli. Hedef listesini çağıran ekran belirler:
 * organizasyonda departmanlar, anasayfada erişilebilen işler/projeler.
 */
export default function QuickFileUploadModal({
  targets,
  pickerLabel,
  emptyMessage,
  onClose,
  onUploaded,
}: Props) {
  const c = useThemeColors();
  const [targetId, setTargetId] = useState(targets[0]?.id ?? "");
  const [googleStatus, setGoogleStatus] = useState<GoogleDriveStatus | null>(null);
  const [msStatus, setMsStatus] = useState<GoogleDriveStatus | null>(null);
  const [uploading, setUploading] = useState(false);
  const [ratio, setRatio] = useState(0);
  // Süren yüklemeyi durdurabilmek için (bkz. FilesPanel'deki aynı desen).
  const [controller, setController] = useState<AbortController | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    driveApi.status().then(setGoogleStatus).catch(() => setGoogleStatus(null));
    oneDriveApi.status().then(setMsStatus).catch(() => setMsStatus(null));
  }, []);

  const anyReady = Boolean(googleStatus?.driveReady || msStatus?.driveReady);
  const anyConfigured = Boolean(googleStatus?.configured || msStatus?.configured);
  const driveMissing = anyConfigured && !anyReady;

  const handleFile = async (file: File | null) => {
    const selected = targets.find((t) => t.id === targetId);
    if (!file || !selected) return;
    setError("");
    setFileName(file.name);
    setUploading(true);
    setRatio(0);
    const iptal = new AbortController();
    setController(iptal);
    try {
      await uploadFile(selected.target, file, {}, setRatio, iptal.signal);
      onUploaded();
      onClose();
    } catch (e: any) {
      // İptal hata değil: kullanıcı bilerek durdurdu, uyarı göstermiyoruz.
      if (e?.name === "AbortError") {
        setUploading(false);
        setFileName("");
        setController(null);
        return;
      }
      // Sunucu yetki hatasını Türkçe ve anlaşılır döndürüyor (örn. "İşin geneline
      // dosya eklemek için iş ekibinde olmanız gerekir"); olduğu gibi gösteriyoruz.
      setError(e?.message ?? "Dosya yüklenemedi");
      setUploading(false);
      setController(null);
    }
  };

  // Gruplar ilk görüldükleri sırayı korur: seçenek listesi çağıranın verdiği
  // sırayla aynı kalsın (işler anasayfadaki sırasıyla gelir).
  const groupNames = Array.from(new Set(targets.map((t) => t.group).filter(Boolean) as string[]));
  const ungrouped = targets.filter((t) => !t.group);

  const optionEl = (t: UploadTargetOption) => (
    <option key={t.id} value={t.id}>
      {t.label}
    </option>
  );

  return (
    <Modal title="Dosya ekle" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {targets.length === 0 ? (
          <p style={{ fontSize: 15, color: c.textSecondary, margin: 0 }}>{emptyMessage}</p>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 15, color: c.textSecondary }}>{pickerLabel}</label>
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                disabled={uploading}
                style={{ width: "100%" }}
              >
                {ungrouped.map(optionEl)}
                {groupNames.map((g) => (
                  <optgroup key={g} label={g}>
                    {targets.filter((t) => t.group === g).map(optionEl)}
                  </optgroup>
                ))}
              </select>
            </div>

            {driveMissing ? (
              <p style={{ fontSize: 15, color: c.textSecondary, margin: 0, lineHeight: 1.5 }}>
                Dosya yükleyebilmek için önce Google Drive ya da OneDrive hesabını bağla (Ayarlar &gt; Bağlı
                hesaplar).
              </p>
            ) : (
              <>
                <input
                  ref={inputRef}
                  type="file"
                  onChange={(e) => {
                    void handleFile(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                  style={{ display: "none" }}
                />
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  disabled={uploading}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    padding: "22px 0",
                    borderRadius: 10,
                    border: `1.5px dashed ${c.border}`,
                    background: "transparent",
                    color: c.textSecondary,
                    fontSize: 15,
                    cursor: uploading ? "wait" : "pointer",
                  }}
                >
                  <IconUpload size={18} color={c.textSecondary} />
                  {uploading ? `Yükleniyor… ${fileName} (${Math.round(ratio * 100)}%)` : "Dosya seç"}
                </button>

                {/* Yanlış dosya seçildiyse bitmesini beklemek gerekmesin. */}
                {uploading && (
                  <button
                    type="button"
                    onClick={() => controller?.abort()}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: c.textSecondary,
                      fontSize: 14,
                      cursor: "pointer",
                      alignSelf: "center",
                    }}
                  >
                    Vazgeç
                  </button>
                )}
              </>
            )}

            {error && <p style={{ color: c.danger, fontSize: 15, margin: 0 }}>{error}</p>}
          </>
        )}
      </div>
    </Modal>
  );
}
