import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { GoogleDriveStatus, ProjectFile } from "@projelio/shared";
import { driveApi, filesApi, oneDriveApi } from "../api/files";
import { useRefreshOnUndo } from "../lib/undo";
import type { FileFolder, FileFolderOwner, FileScope } from "../api/files";
import { driveEditUrl, driveProviderLabel, fileKindLabel, formatFileSize } from "../lib/driveLinks";
import {
  cancelUpload,
  dismissUpload,
  enqueueUploads,
  subscribeUploadDone,
  uploadScope,
  useUploads,
} from "../lib/uploadQueue";
import { openGooglePicker } from "../lib/googlePicker";
import { usePageFileDrop } from "../lib/usePageFileDrop";
import { useThemeColors } from "../theme/useThemeColors";
import { FAB_PRIORITY, useFabAvailable, useProjectFabAction } from "../lib/projectFab";
import { publishTaskAttachments } from "../lib/taskAttachmentEvents";
import BrowseDriveModal from "./BrowseDriveModal";
import ConfirmDialog from "./ConfirmDialog";
import CreateNativeFileMenu from "./CreateNativeFileMenu";
import type { CreateNativeFileMenuHandle } from "./CreateNativeFileMenu";
import FileContextMenu from "./FileContextMenu";
import FilePreviewModal from "./FilePreviewModal";
import { useT } from "../lib/i18n";
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
   * Listelenen dosyalar değiştiğinde çağrılır. Görev modalında kullanılıyor:
   * karttaki dosya rozeti pano listesinden besleniyor, panel haber vermezse
   * yeni dosya ancak bir sonraki tazelemede rozete dönüşürdü.
   */
  onFilesChange?: (files: { id: string; name: string; webViewLink?: string }[]) => void;
}

/**
 * Panelin dışarıya açtığı tetikleyiciler.
 *
 * "+" kaydını artık panelin KENDİSİ yapıyor (bkz. aşağıdaki
 * useProjectFabAction): eskiden kayıt sayfa başına tek yerden yapılmak
 * zorundaydı, o yüzden her sayfa aynı üç seçeneği kendi içinde tekrar
 * yazıyordu. Handle yine de duruyor — dosya eklemeyi başka bir yerden
 * (örn. bir boş durum kartından) tetiklemek isteyen için.
 */
export interface FilesPanelHandle {
  openUpload: () => void;
  /** Sağlayıcı henüz bağlı/hazır değilse sessizce başarısız olmak yerine kullanıcıya açıklayıcı bir hata gösterir. */
  openCreateNative: () => void;
  /** Drive/OneDrive dosya seçici. */
  openBrowseDrive: () => void;
}

/** Sağ tık menüsünün hedefi: bir dosya ya da bir klasör. */
type MenuState = { x: number; y: number; file?: ProjectFile; folder?: FileFolder };

const GORUNUM_ANAHTARI = "projelio.dosya-gorunumu";

/**
 * Görünüm tercihi tarayıcıda saklanıyor: kullanıcı bir kez simge görünümünü
 * seçtiyse her sayfada yeniden seçmek zorunda kalmasın. Sunucuya taşımak için
 * fazla önemsiz bir tercih.
 */
function readStoredView(): "list" | "grid" {
  try {
    return localStorage.getItem(GORUNUM_ANAHTARI) === "grid" ? "grid" : "list";
  } catch {
    // Gizli sekmede / depolama kapalıyken erişim hata fırlatabiliyor.
    return "list";
  }
}

/** Yüzde, satırda iki yerde (yazı ve çubuk) kullanılıyor. */
function ratioPct(u: { uploadedBytes: number; sizeBytes: number }): number {
  return u.sizeBytes > 0 ? Math.min(100, Math.round((u.uploadedBytes / u.sizeBytes) * 100)) : 0;
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
    onFilesChange,
  },
  ref
) {
  const c = useThemeColors();
  const t = useT();
  const navigate = useNavigate();
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [googleStatus, setGoogleStatus] = useState<GoogleDriveStatus | null>(null);
  const [msStatus, setMsStatus] = useState<GoogleDriveStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<ProjectFile | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ProjectFile | null>(null);
  // Varsayılan AÇIK: "Projelio'dan kaldırdım ama Drive'da hâlâ duruyor" en çok
  // şaşırtan davranıştı. Çöp kutusuna taşındığı için geri alınabilir.
  const [alsoTrash, setAlsoTrash] = useState(true);
  const [browsing, setBrowsing] = useState(false);
  const [pickerError, setPickerError] = useState("");
  // Google ve Microsoft durumu iki AYRI istekle gelir; biri diğerinden önce
  // dönerse (örn. yalnızca OneDrive bağlıyken Google isteği önce döner) o anlık
  // "anyReady=false" görünüp driveMissing uyarısı bir anlığına yanıp söner.
  // İkisi de dönene kadar bekleyip uyarıyı ona göre göstermek bunu önler.
  const [statusLoading, setStatusLoading] = useState(true);

  // ── Klasör gezinme ve görünüm
  const [folders, setFolders] = useState<FileFolder[]>([]);
  const [folderId, setFolderId] = useState<string | undefined>(undefined);
  // Ekmek kırıntısı: kökten bulunulan klasöre kadar. Sunucudan geliyor, çünkü
  // kullanıcı derin bir klasöre bağlantıyla da girebilir.
  const [crumbs, setCrumbs] = useState<FileFolder[]>([]);
  const [viewMode, setViewMode] = useState<"list" | "grid">(readStoredView);
  const [menu, setMenu] = useState<MenuState | null>(null);
  // Önizleme jetonları: dosya başına imzalı, tek istekte toplu alınır.
  const [thumbTokens, setThumbTokens] = useState<Record<string, string>>({});

  const inputRef = useRef<HTMLInputElement>(null);
  // Ayrı bir input: webkitdirectory aynı elemanda açılıp kapatılamıyor
  // (tarayıcı özniteliği okuduktan sonra değiştirmek seçiciyi bozuyor).
  const folderInputRef = useRef<HTMLInputElement>(null);
  const createMenuRef = useRef<CreateNativeFileMenuHandle>(null);

  // GRUP ekranı salt okunur: grubun kendi dosya alanı yok, yalnızca altındaki
  // şirketlerin/işlerin dosyalarını topluyor — "bu dosya nereye ait olsun?"
  // sorusunun cevabı orada yok.
  //
  // ŞİRKET ekranı ARTIK YAZILABİLİR (bkz. migration 089): şirketin kendi düz
  // klasörü var. Eskiden burası da salt okunurdu ve yeni şirket kuran kullanıcı
  // hiçbir yere dosya koyamıyordu — departman açması gerektiğini hiçbir yer
  // söylemiyordu.
  const readOnly = Boolean(groupId);

  // Üst kademe listesi: satırlar başka kapsamlardan (işlerden) da geliyor,
  // o yüzden her satırda kaynağını yazmak gerekiyor.
  const aggregated = Boolean(organizationId || groupId);

  const folderOwner: FileFolderOwner | undefined = useMemo(
    () =>
      departmentId
        ? { kind: "department", id: departmentId }
        : organizationId
        ? { kind: "organization", id: organizationId }
        : jobId
        ? { kind: "job", id: jobId }
        : undefined,
    [departmentId, organizationId, jobId]
  );

  /**
   * Klasör gezinme yalnızca "tarayıcı" bağlamında açık.
   *
   * Görev eki, çıktı eki ya da proje sekmesi zaten SÜZÜLMÜŞ bir liste: orada
   * klasör ağacı göstermek, kullanıcının aradığı dosyayı gizlerdi. Grup ekranı
   * da salt okunur bir toplama.
   */
  const canBrowse = Boolean(folderOwner) && !compact && !taskId && !outputId && !projectId && !groupId;

  const target = useMemo(
    () =>
      departmentId
        ? ({ departmentId } as const)
        : organizationId
        ? ({ organizationId } as const)
        : jobId
        ? ({ jobId } as const)
        : ({ projectId: projectId! } as const),
    [departmentId, organizationId, jobId, projectId]
  );

  // Yükleme durumu bu bileşende TUTULMUYOR: kullanıcı yükleme sürerken başka
  // bir sayfaya geçtiğinde panel sökülüyor ve ilerleme ekrandan kayboluyordu
  // (bkz. lib/uploadQueue). Panel yalnızca kendi hedefine ait satırları okur.
  // Ad "queueScope": `scope` bu bileşende zaten bir prop (iş dosyalarının hangi
  // kısmı listelensin).
  const queueScope = useMemo(() => uploadScope(target, { taskId, outputId }), [target, taskId, outputId]);
  const uploads = useUploads(queueScope);

  // Kuyruk panelin dışında olduğu için biten dosyayı listeye o haber veriyor.
  useEffect(
    () =>
      subscribeUploadDone((doneScope, created) => {
        if (doneScope === queueScope) setFiles((prev) => [created, ...prev]);
      }),
    [queueScope]
  );

  const load = useCallback(() => {
    setError("");
    const request = organizationId
      ? filesApi.listByOrganization(organizationId, folderId)
      : groupId
      ? filesApi.listByGroup(groupId)
      : departmentId
      ? filesApi.listByDepartment(departmentId, folderId)
      : jobId
      ? filesApi.listByJob(jobId, {
          scope: scope ?? "all",
          projectId,
          taskId,
          outputId,
          folderId,
          // İş kapsamında her dosyanın bir klasörü var (Genel/Proje/…), bu yüzden
          // kök "klasörsüz dosyalar" demek: gezinme açıkken liste klasörlerden
          // oluşur, kapalıyken eski düz liste korunur.
          atRoot: canBrowse && !folderId ? "1" : undefined,
        })
      : filesApi.listByProject(projectId!, { taskId, outputId });

    // Klasörler ayrı uçtan; ikisi paralel gidiyor.
    const folderRequest =
      canBrowse && folderOwner
        ? filesApi.folders(folderOwner, folderId).catch(() => [] as FileFolder[])
        : Promise.resolve([] as FileFolder[]);

    return Promise.all([request, folderRequest])
      .then(([list, klasorler]) => {
        setFiles(list);
        setFolders(klasorler);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, groupId, departmentId, jobId, projectId, taskId, outputId, scope, folderId, canBrowse]);

  useEffect(() => {
    void load();
  }, [load]);

  // Aynı sayfadaki başka biri dosya eklediğinde/sildiğinde de tazelenir
  // (bkz. lib/liveRoom.ts).
  useRefreshOnUndo(load);

  // Kullanıcı iki sağlayıcıdan yalnızca birini bağlamış olabilir; yükleme
  // engeli ikisi de hazır değilse devreye girmeli (bkz. driveMissing).
  useEffect(() => {
    setStatusLoading(true);
    Promise.allSettled([
      driveApi.status().then(setGoogleStatus).catch(() => setGoogleStatus(null)),
      oneDriveApi.status().then(setMsStatus).catch(() => setMsStatus(null)),
    ]).finally(() => setStatusLoading(false));
  }, []);

  const handleFiles = useCallback((selected: FileList | null) => {
    if (!selected?.length) return;
    // Kuyruk sıralı ilerliyor, hız sınırını ve hataları da o yönetiyor
    // (bkz. lib/uploadQueue). Panel yalnızca işi teslim ediyor.
    enqueueUploads({
      target,
      files: Array.from(selected),
      // Klasör yüklemesinde göreli yolu kuyruk dosyanın kendisinden okuyor
      // (webkitRelativePath); burada yalnızca bulunulan klasörü veriyoruz.
      context: { taskId, outputId, folderId },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, taskId, outputId, folderId]);

  // Önizlemesi olan dosyalar için tek istekte jeton alınır (bkz. filesApi.accessTokens).
  useEffect(() => {
    const ids = files.filter((f) => f.hasThumbnail).map((f) => f.id);
    if (!ids.length) {
      setThumbTokens({});
      return;
    }
    let iptal = false;
    filesApi
      .accessTokens(ids)
      .then(({ tokens }) => {
        if (!iptal) setThumbTokens(tokens);
      })
      // Önizleme kritik değil: alınamazsa tür ikonu gösterilir.
      .catch(() => undefined);
    return () => {
      iptal = true;
    };
  }, [files]);

  // Ekmek kırıntısı sunucudan: kullanıcı derin bir klasöre doğrudan da girebilir.
  useEffect(() => {
    if (!folderId) {
      setCrumbs([]);
      return;
    }
    let iptal = false;
    filesApi
      .folderPath(folderId)
      .then((yol) => {
        if (!iptal) setCrumbs(yol);
      })
      .catch(() => undefined);
    return () => {
      iptal = true;
    };
  }, [folderId]);

  const handleCreateFolder = async () => {
    if (!folderOwner) return;
    const ad = window.prompt(t("Klasör adı:"))?.trim();
    if (!ad) return;
    try {
      const klasor = await filesApi.createFolder(folderOwner, ad, folderId);
      setFolders((prev) => [...prev, klasor].sort((a, b) => a.name.localeCompare(b.name, "tr")));
    } catch (e: any) {
      setError(e?.message ?? t("Klasör oluşturulamadı"));
    }
  };

  const handleRenameFolder = async (folder: FileFolder) => {
    const ad = window.prompt(t("Yeni ad:"), folder.name)?.trim();
    if (!ad || ad === folder.name) return;
    try {
      const guncel = await filesApi.renameFolder(folder.id, ad);
      setFolders((prev) => prev.map((f) => (f.id === folder.id ? guncel : f)));
    } catch (e: any) {
      setError(e?.message ?? t("Klasör yeniden adlandırılamadı"));
    }
  };

  const handleRemoveFolder = async (folder: FileFolder) => {
    // İçindekilerle birlikte gittiği için onay şart; bulutta çöp kutusuna
    // taşındığı için geri alınabilir olduğunu da söylüyoruz.
    const onay = window.confirm(
      t('"{ad}" klasörü içindekilerle birlikte kaldırılsın mı? Bulutta çöp kutusuna taşınır.', {
        ad: folder.name,
      })
    );
    if (!onay) return;
    try {
      await filesApi.removeFolder(folder.id);
      setFolders((prev) => prev.filter((f) => f.id !== folder.id));
    } catch (e: any) {
      setError(e?.message ?? t("Klasör kaldırılamadı"));
    }
  };

  const handleRenameFile = async (file: ProjectFile) => {
    const ad = window.prompt(t("Yeni ad:"), file.name)?.trim();
    if (!ad || ad === file.name) return;
    try {
      const guncel = await filesApi.rename(file.id, ad);
      setFiles((prev) => prev.map((f) => (f.id === file.id ? guncel : f)));
    } catch (e: any) {
      setError(e?.message ?? t("Dosya yeniden adlandırılamadı"));
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const victim = pendingDelete;
    setPendingDelete(null);
    try {
      await filesApi.remove(victim.id, alsoTrash);
      setFiles((prev) => prev.filter((f) => f.id !== victim.id));
    } catch (e: any) {
      setError(e?.message ?? t("Dosya kaldırılamadı"));
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

  /**
   * Sayfanın her yerine bırakılan dosya da yüklenir.
   *
   * Kesik çizgili kutu duruyor (nereye bırakılacağını öğreten işaret o), ama
   * ıskalayan bırakma artık dosyayı yeni sekmede açmıyor — tarayıcının
   * varsayılanı buydu ve kullanıcıyı uygulamadan atıyordu.
   *
   * Modal içinde (görev eki) ve salt okunur ekranlarda kapalı: orada sayfanın
   * geri kalanı bu panele ait değil.
   */
  const pageDropEnabled = !readOnly && !driveMissing && !compact && !taskId && !outputId;
  const { dragging: pageDragging } = usePageFileDrop(pageDropEnabled, handleFiles);

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

  const handleFileAdded = (file: ProjectFile) => {
    setFiles((prev) => [file, ...prev]);
    setPreview(file);
  };

  const handleBrowseDriveClick = () => {
    setPickerError("");
    if (connectedProvider === "google") {
      openGooglePicker(
        async ({ id, name }) => {
          try {
            const created = await filesApi.importFromDrive(target, { sourceFileId: id, name, taskId, outputId, folderId });
            handleFileAdded(created);
          } catch (e: any) {
            setPickerError(e?.message ?? t("Dosya içe aktarılamadı"));
          }
        },
        // Picker, hedefin depo hesabıyla açılmalı (bkz. lib/googlePicker.ts).
        // Proje hedefinde iş kimliği yok; o durumda varsayılan hesap kullanılır.
        departmentId
          ? { departmentId }
          : organizationId
          ? { organizationId }
          : jobId
          ? { jobId }
          : undefined
      ).catch((e: Error) => setPickerError(e.message));
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
        setPickerError(
          t("Yeni dosya oluşturmak için önce Google Drive ya da OneDrive hesabınızı bağlayın (Ayarlar > Bağlı hesaplar).")
        );
      }
    },
  }));

  // Dosya ekleme sayfanın "+" düğmesinde. Başlıkta üç ayrı düğme (Drive'dan seç
  // / Yeni dosya / Dosya yükle) duruyordu ve bunlar "+" menüsündeki seçeneklerin
  // birebir kopyasıydı; her sayfa da aynı menüyü kendi içinde tekrar yazıyordu.
  // Artık tek yerde, burada. Modal içinde (görev ekleri) "+" ulaşılamadığı için
  // düğmeler geri gelir; salt okunur bağlamda (organizasyon/grup) hiç çıkmaz.
  const fabAvailable = useFabAvailable();
  const fabInHeader = !compact && !readOnly && fabAvailable;
  useProjectFabAction(
    fabInHeader && !driveMissing
      ? {
          label: t("Dosya ekle"),
          options: [
            { label: t("Dosya yükle"), onClick: () => inputRef.current?.click() },
            // Klasör yükleme ve yeni klasör yalnızca gezinilebilir ekranlarda:
            // görev eki bağlamında klasör açmanın karşılığı yok.
            ...(canBrowse
              ? [
                  { label: t("Klasör yükle"), onClick: () => folderInputRef.current?.click() },
                  { label: t("Yeni klasör"), onClick: () => void handleCreateFolder() },
                ]
              : []),
            ...(connectedProvider
              ? [
                  { label: t("Yeni dosya oluştur"), onClick: () => createMenuRef.current?.openMenu() },
                  {
                    label: connectedProvider === "microsoft" ? t("OneDrive'dan seç") : t("Drive'dan seç"),
                    onClick: () => handleBrowseDriveClick(),
                  },
                ]
              : []),
          ],
        }
      : null,
    [
      fabInHeader,
      driveMissing,
      connectedProvider,
      canBrowse,
      folderId,
      departmentId,
      organizationId,
      jobId,
      projectId,
      taskId,
      outputId,
    ],
    FAB_PRIORITY.panel
  );

  return (
    <div>
      {!compact && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <h3 style={{ fontSize: 19, fontWeight: 500, color: c.textPrimary, margin: 0, flex: 1 }}>
            {t("Dosyalar")}
          </h3>

          {/* Görünüm anahtarı: tercih tarayıcıda saklanıyor (bkz. readStoredView). */}
          <button
            type="button"
            title={viewMode === "grid" ? t("Liste görünümü") : t("Simge görünümü")}
            onClick={() => {
              const sonraki = viewMode === "grid" ? "list" : "grid";
              setViewMode(sonraki);
              try {
                localStorage.setItem(GORUNUM_ANAHTARI, sonraki);
              } catch {
                // Depolama kapalıysa tercih oturumluk kalır; işlevi bozmaz.
              }
            }}
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
              cursor: "pointer",
            }}
          >
            {viewMode === "grid" ? t("Liste") : t("Simge")}
          </button>
          {/* CreateNativeFileMenu, düğmeler "+"a taşınsa da MONTE KALMALI:
              "Yeni dosya oluştur" seçeneği onun imperatif metodunu çağırıyor.
              Yalnızca tetikleyici düğmesi gizleniyor. */}
          {!readOnly && !driveMissing && connectedProvider && (
            <>
              {!fabInHeader && (
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
                {connectedProvider === "microsoft" ? t("OneDrive'dan seç") : t("Drive'dan seç")}
              </button>
              )}
              <CreateNativeFileMenu
                ref={createMenuRef}
                target={target}
                folderId={folderId}
                taskId={taskId}
                outputId={outputId}
                provider={connectedProvider}
                hideTrigger={fabInHeader}
                onCreated={handleFileAdded}
              />
            </>
          )}
          {!readOnly && !fabInHeader && (
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
            {t("Dosya yükle")}
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

      {/* Klasör yükleme. webkitdirectory standart dışı ama üç büyük tarayıcıda
          da çalışan tek yol; React öznitelikleri tanımadığı için küçük harfle
          ve string olarak veriliyor. Seçilen her dosya webkitRelativePath
          taşıyor, ağacı sunucu ondan kuruyor (bkz. lib/uploadQueue). */}
      <input
        ref={folderInputRef}
        type="file"
        multiple
        // @ts-expect-error webkitdirectory React'in bildiği öznitelikler arasında yok
        webkitdirectory=""
        directory=""
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = "";
        }}
        style={{ display: "none" }}
      />

      {driveMissing && !readOnly && <DriveNotice google={googleStatus} microsoft={msStatus} />}

      {/*
        Bırakma kutusu YALNIZCA ekran boşken.

        Dosya varken de duruyordu ve listenin üstünde sürekli yer kaplayan bir
        kutuydu; oysa asıl işlevi "buraya dosya koyabilirsin" demek ve bunu bir
        kez söylemek yeterli. Dosya varken sürükleyip bırakma yine çalışıyor —
        artık sayfanın her yerinde (bkz. usePageFileDrop).
      */}
      {!readOnly && !loading && files.length === 0 && folders.length === 0 && (
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
          style={{
            border: `1.5px dashed ${dragging ? c.accent : c.border}`,
            borderRadius: 12,
            background: dragging ? "rgba(192,129,63,0.06)" : "transparent",
            padding: compact ? "16px 14px" : "26px 18px",
            textAlign: "center",
            color: c.textSecondary,
            fontSize: 15,
            marginBottom: 14,
            transition: "border-color 0.12s ease, background 0.12s ease",
          }}
        >
          <IconUpload size={20} color={c.textSecondary} />

          {driveMissing ? (
            // Bağlı hesap yokken "sürükleyin" demek boşa umut: dosya bırakılsa
            // da yüklenemez. Tek anlamlı eylem bağlantıyı kurmak.
            <>
              <div style={{ marginTop: 8, marginBottom: 12 }}>
                {t("Dosya ekleyebilmek için önce bir Drive ya da OneDrive hesabı bağlayın.")}
              </div>
              <button
                type="button"
                onClick={() => navigate("/settings?sekme=baglantilar")}
                style={{
                  padding: "9px 16px",
                  borderRadius: 9,
                  border: "none",
                  background: c.primary,
                  color: c.onPrimary,
                  fontSize: 15,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                {t("Drive bağla")}
              </button>
            </>
          ) : (
            <>
              <div style={{ marginTop: 8, marginBottom: 12 }}>
                {dragging ? t("Bırakın, yükleyelim") : folderId ? t("Bu klasör boş.") : t("Henüz dosya yok.")}
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                {connectedProvider && (
                  <button
                    type="button"
                    onClick={handleBrowseDriveClick}
                    style={{
                      padding: "9px 14px",
                      borderRadius: 9,
                      border: `1px solid ${c.border}`,
                      background: "transparent",
                      color: c.textPrimary,
                      fontSize: 15,
                      cursor: "pointer",
                    }}
                  >
                    {connectedProvider === "microsoft" ? t("OneDrive'dan yükle") : t("Drive'dan yükle")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  style={{
                    padding: "9px 14px",
                    borderRadius: 9,
                    border: `1px solid ${c.border}`,
                    background: "transparent",
                    color: c.textPrimary,
                    fontSize: 15,
                    cursor: "pointer",
                  }}
                >
                  {t("Bilgisayardan seç")}
                </button>
              </div>
              <div style={{ fontSize: 13, marginTop: 10 }}>{t("veya sürükleyip bırakın")}</div>
            </>
          )}
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
            {/* Boyut hem yüklenen hem toplam olarak yazılıyor: yalnızca yüzde
                göstermek büyük bir dosyada "takıldı mı?" sorusunu cevaplamıyordu. */}
            <span style={{ fontSize: 14, color: u.error ? c.danger : c.textSecondary }}>
              {u.error
                ? u.error
                : `${formatFileSize(u.uploadedBytes)} / ${formatFileSize(u.sizeBytes)} · %${ratioPct(u)}`}
            </span>
            {u.error ? (
              <button
                onClick={() => dismissUpload(u.id)}
                style={{ background: "transparent", border: "none", color: c.textSecondary, cursor: "pointer" }}
              >
                {t("Kapat")}
              </button>
            ) : (
              // Yükleme sürerken vazgeçilebilir: yanlış dosya seçildiğinde
              // bitmesini beklemek gerekiyordu.
              <button
                type="button"
                onClick={() => cancelUpload(u.id)}
                style={{ background: "transparent", border: "none", color: c.textSecondary, cursor: "pointer", fontSize: 14 }}
              >
                {t("Vazgeç")}
              </button>
            )}
          </div>
          {!u.error && (
            <div style={{ height: 4, background: c.border, borderRadius: 2, marginTop: 8, overflow: "hidden" }}>
              <div
                style={{
                  width: `${ratioPct(u)}%`,
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

      {/* Ekmek kırıntısı: kökten bulunulan klasöre. Kök her zaman tıklanabilir,
          çünkü en sık istenen "başa dön". */}
      {canBrowse && crumbs.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 12, fontSize: 15 }}>
          <button
            type="button"
            onClick={() => setFolderId(undefined)}
            style={{ background: "transparent", border: "none", color: c.accent, cursor: "pointer", padding: 0, fontSize: 15 }}
          >
            {t("Dosyalar")}
          </button>
          {crumbs.map((k, i) => (
            <span key={k.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: c.textSecondary }}>/</span>
              {i === crumbs.length - 1 ? (
                <span style={{ color: c.textPrimary }}>{k.name}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => setFolderId(k.id)}
                  style={{ background: "transparent", border: "none", color: c.accent, cursor: "pointer", padding: 0, fontSize: 15 }}
                >
                  {k.name}
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ color: c.textSecondary, fontSize: 15 }}>{t("Yükleniyor…")}</div>
      ) : files.length === 0 && folders.length === 0 ? (
        // Yazılabilir ekranlarda boş durumu yukarıdaki bırakma kutusu anlatıyor;
        // burada ikinci kez yazmak aynı şeyi üst üste söylemek olurdu.
        readOnly ? (
          <div style={{ color: c.textSecondary, fontSize: 15 }}>
            {t(
              'Bağlı işlerde henüz dosya yok. Dosyalar işlere yüklenir; bir işi buraya bağlamak için "İşi düzenle" ekranını kullanın.'
            )}
          </div>
        ) : null
      ) : viewMode === "grid" ? (
        // Simge görünümü: önizlemesi olan dosya önizlemesiyle, olmayan tür
        // ikonuyla. Sabit oran, farklı boyuttaki önizlemeler ızgarayı bozmasın.
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
            gap: 12,
          }}
        >
          {folders.map((folder) => (
            <div
              key={folder.id}
              onDoubleClick={() => setFolderId(folder.id)}
              onClick={() => setFolderId(folder.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY, folder });
              }}
              style={{
                border: `1px solid ${c.border}`,
                borderRadius: 10,
                background: c.surface,
                padding: 12,
                cursor: "pointer",
                textAlign: "center",
              }}
            >
              <div style={{ height: 74, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <IconFolder size={40} color={c.accent} />
              </div>
              <div
                title={folder.name}
                style={{
                  fontSize: 14,
                  color: c.textPrimary,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {folder.name}
              </div>
            </div>
          ))}

          {files.map((file) => (
            <div
              key={file.id}
              onClick={() => setPreview(file)}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY, file });
              }}
              style={{
                border: `1px solid ${c.border}`,
                borderRadius: 10,
                background: c.surface,
                padding: 12,
                cursor: "pointer",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  height: 74,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  borderRadius: 6,
                  background: c.background,
                  marginBottom: 8,
                }}
              >
                {thumbTokens[file.id] ? (
                  <img
                    src={filesApi.thumbnailUrlWithToken(file.id, thumbTokens[file.id])}
                    alt=""
                    style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "cover" }}
                  />
                ) : file.iconLink ? (
                  <img src={file.iconLink} alt="" width={28} height={28} />
                ) : (
                  <IconFile size={28} color={c.textSecondary} />
                )}
              </div>
              <div
                title={file.name}
                style={{
                  fontSize: 14,
                  color: file.status === "missing" ? c.danger : c.textPrimary,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {file.name}
              </div>
              <div style={{ fontSize: 12, color: c.textSecondary }}>
                {file.sizeBytes ? formatFileSize(file.sizeBytes) : fileKindLabel(file)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {folders.map((folder) => (
            <div
              key={folder.id}
              onClick={() => setFolderId(folder.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY, folder });
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "11px 14px",
                borderRadius: 10,
                border: `1px solid ${c.border}`,
                background: c.surface,
                cursor: "pointer",
              }}
            >
              <IconFolder size={18} color={c.accent} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, color: c.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {folder.name}
                </div>
                <div style={{ fontSize: 13, color: c.textSecondary }}>
                  {folder.managed ? t("Projelio klasörü") : t("Klasör")}
                </div>
              </div>
            </div>
          ))}

          {files.map((file) => (
            <div
              key={file.id}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY, file });
              }}
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
                {/* Önizleme liste görünümünde de gösteriliyor: küçük bir kare
                    yeter, ama "hangi görsel bu?" sorusunu ikon cevaplayamıyor. */}
                {thumbTokens[file.id] ? (
                  <img
                    src={filesApi.thumbnailUrlWithToken(file.id, thumbTokens[file.id])}
                    alt=""
                    style={{ width: 34, height: 34, objectFit: "cover", borderRadius: 5, flexShrink: 0 }}
                  />
                ) : file.iconLink ? (
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
                      ? t("{saglayici}'da bulunamadı", { saglayici: driveProviderLabel(file) })
                      : [
                          // Üst kademede dosyanın hangi işten geldiği kritik bilgi.
                          aggregated ? file.jobTitle : null,
                          showOrigin ? (file.projectId ? t("Proje dosyası") : t("İş geneli")) : null,
                          fileKindLabel(file),
                          file.sizeBytes ? formatFileSize(file.sizeBytes) : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                  </div>
                </div>
              </div>

              <IconButton title={t("İndir")} onClick={() => void handleDownload(file)}>
                <IconDownload size={16} color={c.textSecondary} />
              </IconButton>
              <IconButton
                title={t("{saglayici}'da düzenle", { saglayici: driveProviderLabel(file) })}
                onClick={() => window.open(driveEditUrl(file), "_blank", "noopener,noreferrer")}
              >
                <IconExternalLink size={16} color={c.textSecondary} />
              </IconButton>
              {!readOnly && (
                <IconButton title={t("Kaldır")} onClick={() => setPendingDelete(file)}>
                  <IconTrash size={16} color={c.danger} />
                </IconButton>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Sayfa geneline sürüklerken tek bir örtü: kullanıcı bırakmanın
          çalışacağını görsün. Tıklamayı engellememesi için pointerEvents kapalı. */}
      {pageDragging && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 900,
            pointerEvents: "none",
            background: "rgba(192,129,63,0.10)",
            border: `2px dashed ${c.accent}`,
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              padding: "12px 20px",
              borderRadius: 10,
              background: c.surface,
              border: `1px solid ${c.border}`,
              color: c.textPrimary,
              fontSize: 16,
            }}
          >
            {t("Bırakın, yükleyelim")}
          </div>
        </div>
      )}

      {menu && (
        <FileContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={
            menu.folder
              ? [
                  { label: t("Aç"), onClick: () => setFolderId(menu.folder!.id) },
                  {
                    label: t("Yeniden adlandır"),
                    // Projelio üretimi klasörün adı projeden/görevden geliyor;
                    // burada değiştirmek yanıltıcı olurdu (bkz. FileFolder.managed).
                    disabled: menu.folder.managed || readOnly,
                    onClick: () => void handleRenameFolder(menu.folder!),
                  },
                  {
                    label: t("Kaldır"),
                    danger: true,
                    disabled: menu.folder.managed || readOnly,
                    onClick: () => void handleRemoveFolder(menu.folder!),
                  },
                ]
              : [
                  { label: t("Önizle"), onClick: () => setPreview(menu.file!) },
                  { label: t("İndir"), onClick: () => void handleDownload(menu.file!) },
                  {
                    label: t("{saglayici}'da aç", { saglayici: driveProviderLabel(menu.file!) }),
                    onClick: () => window.open(driveEditUrl(menu.file!), "_blank", "noopener,noreferrer"),
                  },
                  {
                    label: t("Yeniden adlandır"),
                    disabled: readOnly,
                    onClick: () => void handleRenameFile(menu.file!),
                  },
                  {
                    label: t("Kaldır"),
                    danger: true,
                    disabled: readOnly,
                    onClick: () => setPendingDelete(menu.file!),
                  },
                ]
          }
        />
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
          title={t("Dosyayı kaldır")}
          message={t('"{dosya}" Projelio\'dan kaldırılacak.', { dosya: pendingDelete.name })}
          extra={
            // Eskiden dosya Drive'da OLDUĞU GİBİ kalıyordu ve pencere bunu
            // yazıyordu; kullanıcı için sonuç, sildiğini sandığı dosyanın
            // Drive'da durmaya devam etmesiydi. Artık varsayılan "orada da
            // kaldır" — çöp kutusuna taşındığı için geri alınabilir.
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, color: c.textSecondary }}>
              <input type="checkbox" checked={alsoTrash} onChange={(e) => setAlsoTrash(e.target.checked)} />
              {t("{saglayici}'da da çöp kutusuna taşı", { saglayici: driveProviderLabel(pendingDelete) })}
            </label>
          }
          confirmLabel={t("Kaldır")}
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
  const c = useThemeColors();
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
  const c = useThemeColors();
  const t = useT();
  const needsReconnect = Boolean(google?.needsReconnect || microsoft?.needsReconnect);
  const message = needsReconnect
    ? t("Bulut depolama erişiminiz sona ermiş. Dosya yüklemek için yeniden bağlanın.")
    : t("Dosya yükleyebilmek için önce Google Drive ya da OneDrive hesabınızı bağlayın.");

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        // Dar ekranda (görev düzenleme modali telefonda) metin, iki ikon ile
        // bağlantının arasında ~140 px'e sıkışıp dört satıra bölünüyordu.
        // Sarma sayesinde bağlantı kendi satırına iner, metin genişler.
        flexWrap: "wrap",
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
      {/* 200 px'lik taban ölçü: metne bu kadar yer kalmıyorsa satır sarar. */}
      <div style={{ flex: "1 1 200px", minWidth: 0, fontSize: 15, color: c.textPrimary }}>{message}</div>
      <a
        href="/settings"
        style={{ fontSize: 15, fontWeight: 500, color: c.primary, textDecoration: "none", whiteSpace: "nowrap" }}
      >
        {t("Ayarlar'a git")}
      </a>
    </div>
  );
}
