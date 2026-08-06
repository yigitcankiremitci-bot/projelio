import { useEffect, useRef, useState } from "react";
import type { Department, GoogleDriveStatus } from "@projelio/shared";
import { driveApi, oneDriveApi, uploadFile } from "../api/files";
import { colors } from "../theme/colors";
import Modal from "./Modal";
import { IconUpload } from "./icons";

interface Props {
  departments: Department[];
  onClose: () => void;
  onUploaded: () => void;
}

/**
 * Anasayfadaki birleşik "+" menüsünden "Dosya ekle" ile açılır.
 *
 * Dosyalar her zaman bir İŞE ya da DEPARTMANA ait olduğu için (bkz.
 * FilesPanel.tsx üstündeki not), organizasyon seviyesinde "genel" bir yükleme
 * yeri yok — kullanıcı önce hangi departmana yükleyeceğini seçmeli.
 */
export default function QuickFileUploadModal({ departments, onClose, onUploaded }: Props) {
  const c = colors.light;
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? "");
  const [googleStatus, setGoogleStatus] = useState<GoogleDriveStatus | null>(null);
  const [msStatus, setMsStatus] = useState<GoogleDriveStatus | null>(null);
  const [uploading, setUploading] = useState(false);
  const [ratio, setRatio] = useState(0);
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
    if (!file || !departmentId) return;
    setError("");
    setFileName(file.name);
    setUploading(true);
    setRatio(0);
    try {
      await uploadFile({ departmentId }, file, {}, setRatio);
      onUploaded();
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Dosya yüklenemedi");
      setUploading(false);
    }
  };

  return (
    <Modal title="Dosya ekle" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {departments.length === 0 ? (
          <p style={{ fontSize: 15, color: c.textSecondary, margin: 0 }}>
            Dosya yükleyebilmek için önce en az bir departman kurman gerekiyor.
          </p>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 15, color: c.textSecondary }}>Departman</label>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                disabled={uploading}
                style={{ width: "100%" }}
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
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
              </>
            )}

            {error && <p style={{ color: c.danger, fontSize: 15, margin: 0 }}>{error}</p>}
          </>
        )}
      </div>
    </Modal>
  );
}
