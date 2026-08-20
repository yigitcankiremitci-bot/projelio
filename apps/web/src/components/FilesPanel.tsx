import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { GoogleDriveStatus, ProjectFile } from "@projelio/shared";
import { driveApi, filesApi, oneDriveApi, uploadFile } from "../api/files";
import type { FileScope } from "../api/files";
import { driveEditUrl, driveProviderLabel, fileKindLabel, formatFileSize } from "../lib/driveLinks";
import { openGooglePicker } from "../lib/googlePicker";
import { colors } from "../theme/colors";
import { publishTaskAttachments } from "../lib/taskAttachmentEvents";
import BrowseDriveModal from "./BrowseDriveModal";
import ConfirmDialog from "./ConfirmDialog";
import CreateNativeFileMenu from "./CreateNativeFileMenu";
import type { CreateNativeFileMenuHandle } from "./CreateNativeFileMenu";
import FilePreviewModal from "./FilePreviewModal";
import {
  IconDownload,
  IconExternalLink,
  IconFile,
  IconFolder,
  IconGoogleDrive,
  IconOneDrive,
  IconTrash,
  IconUpload,
} from "./icons";

/**
 * Dosyalar İŞE aittir.
 *
 * - İş ekranından açıldığında (`jobId`) işin bütün dosyaları görünür; iş sahibi
 *   ve iş ekibi tüm projelerin dosyalarına buradan ulaşır.
 * - Proje/görev/çıktı ekranından açıldığında (`projectId`) yalnızca o bağlamın
 *   dosyaları listelenir; yükleme de o bağlama iliştirilir.
 */
interface Props {
  jobId?: string;
  projectId?: string;
  taskId?: string;
  outputId?: string;
  /**
   * Hiyerarşinin üst kademeleri. Dosyalar her zaman bir İŞE ait olduğu için
   * buradan yükleme yapılmaz — yalnızca altındaki işlerin dosyaları listelenir.
   */
  organizationId?: string;
  groupId?: string;
  /** Departman ekranı: dosyalar iş hiyerarşisinden bağımsız, düz bir liste. */
  departmentId?: string;
  /** İş ekranında: hepsi / yalnızca işin geneli. */
  scope?: FileScope;
  /** Modal içinde başlık ve büyük yükleme alanı gösterilmez. */
  compact?: boolean;
  /**
   * Başlıktaki üç ekleme düğmesini (Drive'dan seç / Yeni dosya / Dosya yükle)
   * gizler; eylemler sayfanın "+" düğmesine taşınmıştır (bkz. JobDetail).
   * Varsayılan kapalı — diğer sayfalarda düğmeler yerinde kalıyor.
   */
  actionsInFab?: boolean;
  /**
   * Bağlı bulut sağlayıcısını yukarı bildirir. "+" menüsündeki "Drive'dan seç"
   * seçeneğinin etiketi (ve gösterilip gösterilmeyeceği) buna bağlı, ama bilgi
   * yalnızca burada hesaplanıyor.
   */
  onProviderChange?: (provider: "google" | "microsoft" | undefined) => void;
  /**
   * Listelenen dosyalar değiştiğinde çağrılır. Görev modalında kullanılıyor:
   * karttaki dosya rozeti pano listesinden besleniyor, panel haber vermezse
   * yeni dosya ancak bir sonraki tazelemede rozete dönüşürdü.
   */
  onFilesChange?: (files: { id: string; name: string; webViewLink?: string }[]) => void;
}

interface UploadingItem {
  id: string;
  name: string;
  ratio: number;
  error?: string;
}

/**
 * Sayfa (ProjectDetail/JobDetail/DepartmentDetail) alt navigasyondaki "+"
 * düğmesini bu sekmedeyken buraya bağlamak için kullanır — TeamPanelHandle/
 * OutputsPanelHandle ile birebir aynı desen. FAB'ın KENDİSİ burada değil,
 * çağıran sayfada kayıtlıdır (useProjectFabAction sayfa başına TEK yerden
 * çağrılmalı — bkz. DepartmentsPanel'deki "iki bileşen aynı eylemi kaydediyor"
 * hatasının çözümü); bu panel yalnızca tetikleyici metotları dışa açar.
 */
export interface FilesPanelHandle {
  openUpload: () => void;
  /** Sağlayıcı henüz bağlı/hazır değilse sessizce başarısız olmak yerine kullanıcıya açıklayıcı bir hata gösterir. */
  openCreateNative: () => void;
  /** Drive/OneDrive dosya seçici. */
  openBrowseDrive: () => void;
}

const FilesPanel = forwardRef<FilesPanelHandle, Props>(function FilesPanel(
  {
    jobId,
    projectId,
    taskId,
    outputId,
    organizationId,
    groupId,
    departmentId,
    scope,
    compact = false,
    actionsInFab = false,
    onProviderChange,
    onFilesChange,
  },
  ref
) {
  const c = colors.light;
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [googleStatus, setGoogleStatus] = useState<GoogleDriveStatus | null>(null);
  const [msStatus, setMsStatus] = useState<GoogleDriveStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploads, setUploads] = useState<UploadingItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<ProjectFile | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ProjectFile | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [pickerError, setPickerError] = useState("");
  // Google ve Microsoft durumu iki AYRI istekle gelir; biri diğerinden önce
  // dönerse (örn. yalnızca OneDrive bağlıyken Google isteği önce döner) o anlık
  // "anyReady=false" görünüp driveMissing uyarısı bir anlığına yanıp söner.
  // İkisi de dönene kadar bekleyip uyarıyı ona göre göstermek bunu önler.
  const [statusLoading, setStatusLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const createMenuRef = useRef<CreateNativeFileMenuHandle>(null);

  // Organizasyon/grup ekranı salt okunurdur: dosya bir işe ait olmak zorunda,
  // "hangi işe?" sorusunun cevabı burada yok.
  const readOnly = Boolean(organizationId || groupId);

  const target = useMemo(
    () =>
      departmentId
        ? ({ departmentId } as const)
        : jobId
        ? ({ jobId } as const)
        : ({ projectId: projectId! } as const),
    [departmentId, jobId, projectId]
  );

  const load = useCallback(() => {
    setError("");
    const request = organizationId
      ? filesApi.listByOrganization(organizationId)
      : groupId
      ? filesApi.listByGroup(groupId)
      : departmentId
      ? filesApi.listByDepartment(departmentId)
      : jobId
      ? filesApi.listByJob(jobId, { scope: scope ?? "all", projectId, taskId, outputId })
      : filesApi.listByProject(projectId!, { taskId, outputId });

    return request
      .then(setFiles)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [organizationId, groupId, departmentId, jobId, projectId, taskId, outputId, scope]);

  useEffect(() => {
    void load();
  }, [load]);

  // Kullanıcı iki sağlayıcıdan yalnızca birini bağlamış olabilir; yükleme
  // engeli ikisi de hazır değilse devreye girmeli (bkz. driveMissing).
  useEffect(() => {
    setStatusLoading(true);
    Promise.allSettled([
      driveApi.status().then(setGoogleStatus).catch(() => setGoogleStatus(null)),
      oneDriveApi.status().then(setMsStatus).catch(() => setMsStatus(null)),
    ]).finally(() => setStatusLoading(false));
  }, []);

  const handleFiles = async (selected: FileList | null) => {
    if (!selected?.length) return;

    for (const file of Array.from(selected)) {
      const uploadId = `${file.name}-${Date.now()}-${Math.random()}`;
      setUploads((prev) => [...prev, { id: uploadId, name: file.name, ratio: 0 }]);

      try {
        const created = await uploadFile(target, file, { taskId, outputId }, (ratio) =>
          setUploads((prev) => prev.map((u) => (u.id === uploadId ? { ...u, ratio } : u)))
        );
        setFiles((prev) => [created, ...prev]);
        setUploads((prev) => prev.filter((u) => u.id !== uploadId));
      } catch (e: any) {
        // Başarısız yükleme listeden hemen kaybolmasın; kullanıcı nedenini görsün.
        setUploads((prev) =>
          prev.map((u) => (u.id === uploadId ? { ...u, error: e?.message ?? "Yüklenemedi" } : u))
        );
      }
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const victim = pendingDelete;
    setPendingDelete(null);
    try {
      await filesApi.remove(victim.id);
      setFiles((prev) => prev.filter((f) => f.id !== victim.id));
    } catch (e: any) {
      setError(e?.message ?? "Dosya kaldırılamadı");
    }
  };

  const handleDownload = async (file: ProjectFile) => {
    try {
      window.location.href = await filesApi.contentUrl(file.id, { download: true });
    } catch (e: any) {
      setError(e?.message ?? "Dosya indirilemedi");
    }
  };

  // Hiçbir sağlayıcı (Drive/OneDrive) bağlı değilse yükleme yapılamaz;
  // kullanıcıyı boş bir hata yerine doğrudan çözüme yönlendir. Kullanıcı
  // ikisinden birini bağlamışsa (hangisi olursa olsun) engel kalkar.
  const anyConfigured = Boolean(googleStatus?.configured || msStatus?.configured);
  const anyReady = Boolean(googleStatus?.driveReady || msStatus?.driveReady);
  const driveMissing = !statusLoading && anyConfigured && !anyReady;
  // "Drive'dan seç"/"Yeni dosya" için hangi sağlayıcı bağlı: Google Drive
  // öncelikli (bkz. CloudStorageService.findAccountForUser'daki aynı sıralama).
  const connectedProvider: "google" | "microsoft" | undefined = googleStatus?.driveReady
    ? "google"
    : msStatus?.driveReady
    ? "microsoft"
    : undefined;

  // Yeni oluşturulan/içe aktarılan dosya listeye eklenir VE hemen geniş önizleme
  // modalında açılır — kullanıcı Projelio'dan hiç ayrılmadan görür; ayrılmak
  // (Xda düzenle) tamamen kendi tercihi olur (bkz. CreateNativeFileMenu üstündeki not).
  useEffect(() => {
    const list = files.map((f) => ({ id: f.id, name: f.name, webViewLink: f.webViewLink }));
    onFilesChange?.(list);
    // Görev bağlamında açıldıysa karttaki dosya rozetini de tazele.
    if (taskId) publishTaskAttachments(taskId, { files: list });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  useEffect(() => {
    onProviderChange?.(connectedProvider);
    // Panel kapanınca (sekme değişince) seçenek de kalksın.
    return () => onProviderChange?.(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedProvider]);

  const handleFileAdded = (file: ProjectFile) => {
    setFiles((prev) => [file, ...prev]);
    setPreview(file);
  };

  const handleBrowseDriveClick = () => {
    setPickerError("");
    if (connectedProvider === "google") {
      openGooglePicker(async ({ id, name }) => {
        try {
          const created = await filesApi.importFromDrive(target, { sourceFileId: id, name, taskId, outputId });
          handleFileAdded(created);
        } catch (e: any) {
          setPickerError(e?.message ?? "Dosya içe aktarılamadı");
        }
      }).catch((e: Error) => setPickerError(e.message));
      return;
    }
    if (connectedProvider === "microsoft") setBrowsing(true);
  };

  // İş ekranında dosyanın hangi projeden geldiğini göstermek gerekir; proje
  // ekranında zaten belli olduğu için gösterilmez.
  const showOrigin = Boolean(jobId && !projectId && !taskId && !outputId);

  useImperativeHandle(ref, () => ({
    openUpload: () => inputRef.current?.click(),
    openBrowseDrive: () => handleBrowseDriveClick(),
    openCreateNative: () => {
      if (createMenuRef.current) {
        createMenuRef.current.openMenu();
      } else {
        setPickerError("Yeni dosya oluşturmak için önce Google Drive ya da OneDrive hesabınızı bağlayın (Ayarlar > Bağlı hesaplar).");
      }
    },
  }));

  return (
    <div>
      {!compact && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <h3 style={{ fontSize: 19, fontWeight: 500, color: c.textPrimary, margin: 0, flex: 1 }}>
            Dosyalar
          </h3>
          {/* CreateNativeFileMenu, düğmeler "+"a taşınsa da MONTE KALMALI:
              "Yeni dosya oluştur" seçeneği onun imperatif metodunu çağırıyor.
              Yalnızca tetikleyici düğmesi gizleniyor. */}
          {!readOnly && !driveMissing && connectedProvider && (
            <>
              {!actionsInFab && (
              <button
                onClick={handleBrowseDriveClick}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "9px 13px",
                  borderRadius: 9,
                  border: `1px solid ${c.border}`,
                  background: "transparent",
                  color: c.textPrimary,
                  fontSize: 15,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                <IconFolder size={16} color={c.textPrimary} />
                {connectedProvider === "microsoft" ? "OneDrive'dan seç" : "Drive'dan seç"}
              </button>
              )}
              <CreateNativeFileMenu
                ref={createMenuRef}
                target={target}
                taskId={taskId}
                outputId={outputId}
                provider={connectedProvider}
                hideTrigger={actionsInFab}
                onCreated={handleFileAdded}
              />
            </>
          )}
          {!readOnly && !actionsInFab && (
          <button
            onClick={() => inputRef.current?.click()}
            disabled={driveMissing}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "9px 15px",
              borderRadius: 9,
              border: "none",
              background: driveMissing ? c.border : c.primary,
              color: driveMissing ? c.textSecondary : "#fff",
              fontSize: 15,
              fontWeight: 500,
              cursor: driveMissing ? "not-allowed" : "pointer",
            }}
          >
            <IconUpload size={16} color={driveMissing ? c.textSecondary : "#fff"} />
            Dosya yükle
          </button>
          )}
        </div>
      )}

      {pickerError && <div style={{ color: c.danger, fontSize: 14, marginBottom: 10 }}>{pickerError}</div>}

      <input
        ref={inputRef}
        type="file"
        multiple
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = "";
        }}
        style={{ display: "none" }}
      />

      {driveMissing && !readOnly && <DriveNotice google={googleStatus} microsoft={msStatus} />}

      {!readOnly && (
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!driveMissing) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!driveMissing) void handleFiles(e.dataTransfer.files);
        }}
        onClick={() => !driveMissing && inputRef.current?.click()}
        style={{
          border: `1.5px dashed ${dragging ? c.accent : c.border}`,
          borderRadius: 12,
          background: dragging ? "rgba(192,129,63,0.06)" : "transparent",
          padding: compact ? "16px 14px" : "22px 18px",
          textAlign: "center",
          color: c.textSecondary,
          fontSize: 15,
          cursor: driveMissing ? "not-allowed" : "pointer",
          marginBottom: 14,
          transition: "border-color 0.12s ease, background 0.12s ease",
        }}
      >
        <IconUpload size={20} color={c.textSecondary} />
        <div style={{ marginTop: 6 }}>
          {dragging ? "Bırakın, yükleyelim" : "Dosyaları buraya sürükleyin veya tıklayın"}
        </div>
        <div style={{ fontSize: 13, marginTop: 3 }}>
          {departmentId
            ? "Departmanın bağlı Drive/OneDrive klasöründe saklanır"
            : "İşin bağlı Drive/OneDrive klasöründe saklanır"}
        </div>
      </div>
      )}

      {uploads.map((u) => (
        <div
          key={u.id}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: `1px solid ${u.error ? c.danger : c.border}`,
            marginBottom: 8,
          }}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 15, color: c.textPrimary }}>
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {u.name}
            </span>
            <span style={{ fontSize: 14, color: u.error ? c.danger : c.textSecondary }}>
              {u.error ? u.error : `%${Math.round(u.ratio * 100)}`}
            </span>
            {u.error && (
              <button
                onClick={() => setUploads((prev) => prev.filter((x) => x.id !== u.id))}
                style={{ background: "transparent", border: "none", color: c.textSecondary, cursor: "pointer" }}
              >
                Kapat
              </button>
            )}
          </div>
          {!u.error && (
            <div style={{ height: 4, background: c.border, borderRadius: 2, marginTop: 8, overflow: "hidden" }}>
              <div
                style={{
                  width: `${Math.round(u.ratio * 100)}%`,
                  height: "100%",
                  background: c.accent,
                  transition: "width 0.2s ease",
                }}
              />
            </div>
          )}
        </div>
      ))}

      {error && <div style={{ color: c.danger, fontSize: 15, marginBottom: 10 }}>{error}</div>}

      {loading ? (
        <div style={{ color: c.textSecondary, fontSize: 15 }}>Yükleniyor…</div>
      ) : files.length === 0 ? (
        <div style={{ color: c.textSecondary, fontSize: 15 }}>
          {readOnly
            ? "Bağlı işlerde henüz dosya yok. Dosyalar işlere yüklenir; bir işi buraya bağlamak için \"İşi düzenle\" ekranını kullanın."
            : "Henüz dosya eklenmemiş."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {files.map((file) => (
            <div
              key={file.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "11px 14px",
                borderRadius: 10,
                border: `1px solid ${c.border}`,
                background: c.surface,
              }}
            >
              <div
                onClick={() => setPreview(file)}
                style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, cursor: "pointer" }}
              >
                {file.iconLink ? (
                  <img src={file.iconLink} alt="" width={18} height={18} />
                ) : (
                  <IconFile size={18} color={c.textSecondary} />
                )}
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 16,
                      color: file.status === "missing" ? c.danger : c.textPrimary,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {file.name}
                  </div>
                  <div style={{ fontSize: 13, color: c.textSecondary }}>
                    {file.status === "missing"
                      ? `${driveProviderLabel(file)}'da bulunamadı`
                      : [
                          // Üst kademede dosyanın hangi işten geldiği kritik bilgi.
                          readOnly ? file.jobTitle : null,
                          showOrigin ? (file.projectId ? "Proje dosyası" : "İş geneli") : null,
                          fileKindLabel(file),
                          file.sizeBytes ? formatFileSize(file.sizeBytes) : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                  </div>
                </div>
              </div>

              <IconButton title="İndir" onClick={() => void handleDownload(file)}>
                <IconDownload size={16} color={c.textSecondary} />
              </IconButton>
              <IconButton
                title={`${driveProviderLabel(file)}'da düzenle`}
                onClick={() => window.open(driveEditUrl(file), "_blank", "noopener,noreferrer")}
              >
                <IconExternalLink size={16} color={c.textSecondary} />
              </IconButton>
              {!readOnly && (
                <IconButton title="Kaldır" onClick={() => setPendingDelete(file)}>
                  <IconTrash size={16} color={c.danger} />
                </IconButton>
              )}
            </div>
          ))}
        </div>
      )}

      {browsing && (
        <BrowseDriveModal
          target={target}
          taskId={taskId}
          outputId={outputId}
          onClose={() => setBrowsing(false)}
          onImported={handleFileAdded}
        />
      )}

      {preview && (
        <FilePreviewModal file={preview} onClose={() => setPreview(null)} onMaybeChanged={load} />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Dosyayı kaldır"
          message={`"${pendingDelete.name}" Projelio'dan kaldırılacak. Dosya ${driveProviderLabel(pendingDelete)}'da kalmaya devam eder.`}
          confirmLabel="Kaldır"
          onConfirm={handleDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
});

export default FilesPanel;

function IconButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const c = colors.light;
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 32,
        height: 32,
        borderRadius: 8,
        border: `1px solid ${c.border}`,
        background: "transparent",
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

function DriveNotice({ google, microsoft }: { google: GoogleDriveStatus | null; microsoft: GoogleDriveStatus | null }) {
  const c = colors.light;
  const needsReconnect = Boolean(google?.needsReconnect || microsoft?.needsReconnect);
  const message = needsReconnect
    ? "Bulut depolama erişiminiz sona ermiş. Dosya yüklemek için yeniden bağlanın."
    : "Dosya yükleyebilmek için önce Google Drive ya da OneDrive hesabınızı bağlayın.";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 14px",
        borderRadius: 10,
        border: `1px solid ${c.border}`,
        background: "rgba(192,129,63,0.07)",
        marginBottom: 14,
      }}
    >
      <IconGoogleDrive size={18} />
      <IconOneDrive size={18} />
      <div style={{ flex: 1, fontSize: 15, color: c.textPrimary }}>{message}</div>
      <a
        href="/settings"
        style={{ fontSize: 15, fontWeight: 500, color: c.primary, textDecoration: "none", whiteSpace: "nowrap" }}
      >
        Ayarlar'a git
      </a>
    </div>
  );
}
