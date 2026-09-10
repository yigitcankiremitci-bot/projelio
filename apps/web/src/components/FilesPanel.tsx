import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { GoogleDriveStatus, ProjectFile } from "@projelio/shared";
import { driveApi, filesApi, oneDriveApi } from "../api/files";
import { useRefreshOnUndo, useUndo, useWithoutPendingDeletes } from "../lib/undo";
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
import { readDroppedFiles, type DroppedFile } from "../lib/dropFiles";
import { fileKey, folderKey, parseKey, useFileSelection } from "../lib/fileSelection";
import { useFileThumbnails } from "../lib/fileThumbnails";
import { useFileViewMode } from "../lib/fileViewMode";
import { useMarqueeSelection } from "../lib/useMarqueeSelection";
import { usePageFileDrop } from "../lib/usePageFileDrop";
import { useIsDesktop } from "../lib/useIsDesktop";
import { useThemeColors } from "../theme/useThemeColors";
import { FAB_PRIORITY, useFabAvailable, useProjectFabAction } from "../lib/projectFab";
import { publishTaskAttachments } from "../lib/taskAttachmentEvents";
import BrowseDriveModal from "./BrowseDriveModal";
import ConfirmDialog from "./ConfirmDialog";
import CreateNativeFileMenu from "./CreateNativeFileMenu";
import type { CreateNativeFileMenuHandle } from "./CreateNativeFileMenu";
import FileContextMenu from "./FileContextMenu";
import FilePreviewModal from "./FilePreviewModal";
import FileThumb from "./FileThumb";
import { useT } from "../lib/i18n";
import {
  IconChevronLeft,
  IconDownload,
  IconExternalLink,
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

/**
 * Sağ tık menüsünün hedefi: bir dosya, bir klasör ya da BOŞLUK.
 *
 * İkisi de boşsa menü panelin kendisine ait ("Yeni klasör", "Yeni belge") —
 * masaüstündeki her dosya yöneticisinde olan davranış.
 */
type MenuState = {
  x: number;
  y: number;
  file?: ProjectFile;
  folder?: FileFolder;
  /** Çoklu seçime sağ tıklandıysa seçimin tamamı; tek öğede boş. */
  toplu?: string[];
};

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
  const isDesktop = useIsDesktop();
  // Cmd+Z burada da çalışsın: dosya işlemleri uygulamanın geri kalanıyla aynı
  // yığına yazılıyor (bkz. lib/undo.tsx).
  const { pushUndo, pushDestructive } = useUndo();
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [googleStatus, setGoogleStatus] = useState<GoogleDriveStatus | null>(null);
  const [msStatus, setMsStatus] = useState<GoogleDriveStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<ProjectFile | null>(null);
  /**
   * Silinmeyi bekleyen küme. Tek dosya da bir kümedir: çoklu seçim geldikten
   * sonra iki ayrı onay akışı tutmak, birinde düzeltilen bir hatanın diğerinde
   * kalması demekti.
   */
  const [pendingDelete, setPendingDelete] = useState<{
    items: { kind: "file" | "folder"; id: string }[];
    /** Onay penceresinde gösterilecek ad; birden fazlaysa sayı. */
    label: string;
    /** Pencere metnini belirler: klasör içindekilerle birlikte gider. */
    mode: "file" | "folder" | "many";
    /** Sağlayıcı adı ("Drive'da da çöp kutusuna taşı") — karışıksa boş. */
    provider?: string;
  } | null>(null);
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
  const [viewMode, toggleViewMode] = useFileViewMode();
  const [menu, setMenu] = useState<MenuState | null>(null);
  // Önizleme jetonları: dosya başına imzalı, tek istekte toplu alınır
  // (bkz. lib/fileThumbnails.ts).
  /**
   * Ekrana çizilen liste: silinmeyi BEKLEYEN kayıtlar elenmiş hâli.
   *
   * Yıkıcı işlemler geciktirmeli (bkz. pushDestructive) — o pencerede sunucu
   * kaydı hâlâ döndürüyor, yani araya giren herhangi bir tazeleme silinen
   * dosyayı geri getiriyormuş gibi gösterirdi.
   */
  const gorunenDosyalar = useWithoutPendingDeletes(files);
  const gorunenKlasorler = useWithoutPendingDeletes(folders);

  const thumbs = useFileThumbnails(gorunenDosyalar);
  // Uygulama İÇİ sürükleme: satırı klasöre bırakarak taşıma. Bilgisayardan
  // dosya sürüklemekle karışmıyor — o sürüklemede dataTransfer türü "Files",
  // bunda kendi türümüz (bkz. usePageFileDrop'taki denetim).
  const [dragKeys, setDragKeys] = useState<string[] | null>(null);
  // Üzerine bırakılabilecek hedefin vurgusu; "root" ekmek kırıntısındaki kök.
  const [dropOver, setDropOver] = useState<string | null>(null);
  /**
   * Seçim. Masaüstünde tek tık SEÇER, çift tık AÇAR; Cmd/Ctrl ve Shift ile
   * birden fazla öğe seçilir (bkz. lib/fileSelection.ts).
   *
   * DOKUNMATİKTE çift dokunma diye bir şey yok: orada tek dokunma açar
   * (telefonda Drive da böyle davranıyor).
   */
  const secim = useFileSelection();

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

  /**
   * Klasör yüklemesinden sonra ağacı tazelemek için gecikmeli tetikleyici.
   *
   * Bir klasör yüklemesi onlarca dosya demek ve her biri ayrı ayrı bitiyor;
   * her bitişte listeyi yeniden çekmek aynı isteği onlarca kez atardı.
   */
  const folderRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Kuyruk panelin dışında olduğu için biten dosyayı listeye o haber veriyor.
  useEffect(() => {
    const cikis = subscribeUploadDone((doneScope, created) => {
      if (doneScope !== queueScope) return;

      // Klasör yüklemesinde dosya bir ALT klasöre iniyor: açık olan listeye
      // eklemek onu bulunduğu yerden başka bir yerde göstermek olurdu. O
      // durumda klasör ağacı tazelenir, yeni klasörler orada belirir.
      if ((created.folderId ?? undefined) !== folderId) {
        if (folderRefreshTimer.current) clearTimeout(folderRefreshTimer.current);
        folderRefreshTimer.current = setTimeout(() => void load(), 700);
        return;
      }
      setFiles((prev) => [created, ...prev]);
    });
    return () => {
      cikis();
      if (folderRefreshTimer.current) clearTimeout(folderRefreshTimer.current);
    };
  }, [queueScope, folderId, load]);

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

  const handleFiles = useCallback((selected: FileList | DroppedFile[] | null) => {
    if (!selected?.length) return;
    // Kuyruk sıralı ilerliyor, hız sınırını ve hataları da o yönetiyor
    // (bkz. lib/uploadQueue). Panel yalnızca işi teslim ediyor.
    enqueueUploads({
      target,
      files: selected,
      // Klasör yüklemesinde göreli yolu kuyruk dosyanın kendisinden okuyor
      // (webkitRelativePath ya da bırakılan ağaçtaki yol); burada yalnızca
      // bulunulan klasörü veriyoruz.
      context: { taskId, outputId, folderId },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, taskId, outputId, folderId]);

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
    const altinda = folderId;
    try {
      const klasor = await filesApi.createFolder(folderOwner, ad, altinda);
      setFolders((prev) => [...prev, klasor].sort((a, b) => a.name.localeCompare(b.name, "tr")));
      // Geri alma listeyi kendi tazeliyor (bkz. useRefreshOnUndo), bu yüzden
      // burada state'e dokunmuyoruz.
      pushUndo({
        label: t("Klasör oluşturma"),
        run: () => filesApi.removeFolder(klasor.id).then(() => undefined),
        redo: () => filesApi.createFolder(folderOwner, ad, altinda).then(() => undefined),
      });
    } catch (e: any) {
      setError(e?.message ?? t("Klasör oluşturulamadı"));
    }
  };

  const handleDuplicateFolder = async (folder: FileFolder) => {
    try {
      const kopya = await filesApi.duplicateFolder(folder.id);
      setFolders((prev) => [...prev, kopya].sort((a, b) => a.name.localeCompare(b.name, "tr")));
      // İleri alma yok: her çoğaltma YENİ bir kimlik üretiyor, ikinci kez
      // uygulanan adımın geri alması bayat bir kimliğe bakardı.
      pushUndo({
        label: t("Klasör çoğaltma"),
        run: () => filesApi.removeFolder(kopya.id).then(() => undefined),
      });
    } catch (e: any) {
      setError(e?.message ?? t("Klasör çoğaltılamadı"));
    }
  };

  const handleDuplicateFile = async (file: ProjectFile) => {
    try {
      const kopya = await filesApi.duplicate(file.id);
      setFiles((prev) => [kopya, ...prev]);
      pushUndo({
        label: t("Dosya çoğaltma"),
        run: () => filesApi.remove(kopya.id, true).then(() => undefined),
      });
    } catch (e: any) {
      setError(e?.message ?? t("Dosya çoğaltılamadı"));
    }
  };

  const handleRenameFolder = async (folder: FileFolder) => {
    const ad = window.prompt(t("Yeni ad:"), folder.name)?.trim();
    if (!ad || ad === folder.name) return;
    const eski = folder.name;
    try {
      const guncel = await filesApi.renameFolder(folder.id, ad);
      setFolders((prev) => prev.map((f) => (f.id === folder.id ? guncel : f)));
      pushUndo({
        label: t("Klasör yeniden adlandırma"),
        run: () => filesApi.renameFolder(folder.id, eski).then(() => undefined),
        redo: () => filesApi.renameFolder(folder.id, ad).then(() => undefined),
      });
    } catch (e: any) {
      setError(e?.message ?? t("Klasör yeniden adlandırılamadı"));
    }
  };

  /**
   * Satır bu panelden TAŞINABİLİR mi.
   *
   * Üst kademe listeleri (şirket ekranı) altındaki işlerin dosyalarını da
   * gösteriyor; onları şirketin klasörüne taşımak kapsam değiştirmek olurdu ve
   * sunucu zaten reddediyor (bkz. FilesService.resolvePlacement). Sürüklemeyi
   * hiç başlatmamak, kullanıcıya hata göstermekten iyi.
   */
  const canMoveFile = (file: ProjectFile): boolean => {
    if (!canBrowse || readOnly || !folderOwner) return false;
    if (folderOwner.kind === "job") return file.jobId === folderOwner.id;
    if (folderOwner.kind === "department") return file.departmentId === folderOwner.id;
    return file.organizationId === folderOwner.id;
  };

  const openFolder = (id: string) => {
    secim.clear();
    setFolderId(id);
  };

  /**
   * Ekrandaki sıra — Shift+tık aralığı buna göre kuruluyor.
   *
   * Klasörler önce, dosyalar sonra: iki görünümde de çizim sırası bu, yani
   * kullanıcının "aradakiler" dediği şey bu sıra.
   */
  const sirali = useMemo(
    () => [
      ...gorunenKlasorler.map((f) => folderKey(f.id)),
      ...gorunenDosyalar.map((f) => fileKey(f.id)),
    ],
    [gorunenKlasorler, gorunenDosyalar]
  );

  /**
   * Kement (tarayarak) seçim — boşluğa basılı tutup sürüklemek.
   *
   * Dokunmatikte KAPALI: orada parmakla sürüklemek sayfayı kaydırmak demek,
   * kement onu yutardı.
   */
  const marquee = useMarqueeSelection({
    enabled: isDesktop && !compact,
    getBase: () => secim.keys,
    onChange: secim.replace,
  });

  /**
   * Tek tık: masaüstünde seçer, dokunmatikte doğrudan açar.
   *
   * stopPropagation ŞART: panelin kökünde "boşluğa tıklayınca seçimi bırak"
   * dinleyicisi var ve olay oraya kabardığında satır seçilir seçilmez tekrar
   * bırakılırdı.
   */
  const rowClick = (e: React.MouseEvent, key: string, ac: () => void) => {
    e.stopPropagation();
    setMenu(null);
    if (isDesktop) secim.click(e, key, sirali);
    else ac();
  };

  /** Sağ tık önce SEÇER: menü hangi öğe(ler) için açıldığını göstersin. */
  const rowContextMenu = (e: React.MouseEvent, hedef: { file?: ProjectFile; folder?: FileFolder }) => {
    e.preventDefault();
    // Panelin boşluk menüsü satırların üstünde açılmasın.
    e.stopPropagation();
    const key = hedef.folder ? folderKey(hedef.folder.id) : fileKey(hedef.file!.id);
    const aktif = secim.contextSelect(key);
    setMenu({ x: e.clientX, y: e.clientY, ...hedef, toplu: aktif.length > 1 ? aktif : undefined });
  };

  /** Menünün üstünde çalışacağı öğeler: çoklu seçim varsa hepsi, yoksa tıklanan. */
  const menuHedefleri = (m: MenuState): { kind: "file" | "folder"; id: string }[] =>
    m.toplu
      ? m.toplu.map(parseKey)
      : m.folder
      ? [{ kind: "folder", id: m.folder.id }]
      : m.file
      ? [{ kind: "file", id: m.file.id }]
      : [];

  const beginDrag = (e: React.DragEvent, key: string) => {
    // Seçimin İÇİNDEN sürüklemek seçimin tamamını taşır; dışından sürüklemek
    // yalnızca o öğeyi (ve seçimi ona indirger) — dosya yöneticilerinin
    // davranışı bu, aksi hâlde kullanıcı görmediği dosyaları da taşırdı.
    const keys = secim.has(key) ? secim.keys : secim.contextSelect(key);
    // Kendi türümüz: sayfanın geneline kurulu DOSYA bırakma dinleyicisi
    // yalnızca "Files" taşıyan sürüklemelere bakıyor (bkz. usePageFileDrop).
    e.dataTransfer.setData("text/x-projelio-dosya", keys.join(","));
    e.dataTransfer.effectAllowed = "move";
    setDragKeys(keys);
  };

  /**
   * Taşımayı uygular ve geri alma yığınına yazar.
   *
   * `hedef` verilmezse kapsamın kökü. Eski yer BURADA biliniyor: kullanıcı
   * bulunduğu klasörden taşıyor, yani kaynak her zaman `folderId`.
   */
  const tasi = async (items: { kind: "file" | "folder"; id: string }[], hedefId?: string) => {
    if (!items.length) return;
    const eskiKlasor = folderId;

    const uygula = (nereye?: string) =>
      Promise.all(
        items.map((item) =>
          item.kind === "file" ? filesApi.move(item.id, nereye) : filesApi.moveFolder(item.id, nereye)
        )
      ).then(() => undefined);

    try {
      await uygula(hedefId);
      const dosyalar = new Set(items.filter((i) => i.kind === "file").map((i) => i.id));
      const klasorler = new Set(items.filter((i) => i.kind === "folder").map((i) => i.id));
      setFiles((prev) => prev.filter((f) => !dosyalar.has(f.id)));
      setFolders((prev) => prev.filter((f) => !klasorler.has(f.id)));
      secim.clear();
      // Toplu taşıma TEK adım: kullanıcı bir hareket yaptı, Cmd+Z de bir kez
      // basılmalı (bkz. TaskSelectionBar'daki aynı gerekçe).
      pushUndo({
        label: items.length > 1 ? t("Taşıma") : items[0].kind === "file" ? t("Dosya taşıma") : t("Klasör taşıma"),
        run: () => uygula(eskiKlasor),
        redo: () => uygula(hedefId),
      });
    } catch (e: any) {
      setError(e?.message ?? t("Taşınamadı"));
      load();
    }
  };

  /** `hedef` verilmezse kapsamın kökü. */
  const handleInternalDrop = async (hedef?: FileFolder) => {
    const keys = dragKeys;
    setDragKeys(null);
    setDropOver(null);
    if (!keys?.length) return;
    // Klasörü kendi üstüne bırakmak işlemsiz; sürüklenen küme hedefi de
    // içeriyorsa yalnızca o eleniyor, kalanlar taşınıyor.
    const items = keys.map(parseKey).filter((i) => !(i.kind === "folder" && i.id === hedef?.id));
    await tasi(items, hedef?.id);
  };

  /** Bir üst klasör — sağ tık menüsündeki "Üst klasöre taşı" için (dokunmatikte sürükleme yok). */
  const parentFolderId = crumbs.length > 1 ? crumbs[crumbs.length - 2].id : undefined;

  const moveToParent = (items: { kind: "file" | "folder"; id: string }[]) => tasi(items, parentFolderId);

  /** Bırakma hedeflerinin ortak olay bağlantıları. */
  const dropTargetProps = (anahtar: string, hedef?: FileFolder) =>
    dragKeys
      ? {
          onDragOver: (e: React.DragEvent) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move" as const;
            setDropOver(anahtar);
          },
          onDragLeave: () => setDropOver((prev) => (prev === anahtar ? null : prev)),
          onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            void handleInternalDrop(hedef);
          },
        }
      : {};

  const handleRenameFile = async (file: ProjectFile) => {
    const ad = window.prompt(t("Yeni ad:"), file.name)?.trim();
    if (!ad || ad === file.name) return;
    const eski = file.name;
    try {
      const guncel = await filesApi.rename(file.id, ad);
      setFiles((prev) => prev.map((f) => (f.id === file.id ? guncel : f)));
      pushUndo({
        label: t("Dosya yeniden adlandırma"),
        run: () => filesApi.rename(file.id, eski).then(() => undefined),
        redo: () => filesApi.rename(file.id, ad).then(() => undefined),
      });
    } catch (e: any) {
      setError(e?.message ?? t("Dosya yeniden adlandırılamadı"));
    }
  };

  const handleDelete = () => {
    if (!pendingDelete) return;
    const { items } = pendingDelete;
    const buluttaDa = alsoTrash;
    setPendingDelete(null);

    const dosyalar = new Set(items.filter((i) => i.kind === "file").map((i) => i.id));
    const klasorler = new Set(items.filter((i) => i.kind === "folder").map((i) => i.id));
    setFiles((prev) => prev.filter((f) => !dosyalar.has(f.id)));
    setFolders((prev) => prev.filter((f) => !klasorler.has(f.id)));
    secim.clear();

    // Silme sunucuda geri alınamıyor; istek Cmd+Z penceresi kadar bekletiliyor:
    // satır arayüzden düşüyor, gerçek çağrı o pencerede hiç gönderilmiyor.
    pushDestructive({
      label:
        items.length > 1
          ? t("{sayi} öğeyi kaldırma", { sayi: items.length })
          : items[0].kind === "file"
          ? t("Dosya kaldırma")
          : t("Klasör kaldırma"),
      entityIds: items.map((i) => i.id),
      commit: async () => {
        try {
          await Promise.all(
            items.map((i) =>
              i.kind === "file" ? filesApi.remove(i.id, buluttaDa) : filesApi.removeFolder(i.id)
            )
          );
        } catch (e: any) {
          setError(e?.message ?? t("Dosya kaldırılamadı"));
          load();
        }
      },
      restore: () => load(),
    });
  };

  /** Onay penceresini açar; kaldırmanın kendisi handleDelete'te. */
  const askDelete = (items: { kind: "file" | "folder"; id: string }[]) => {
    if (!items.length) return;
    if (items.length === 1 && items[0].kind === "file") {
      const dosya = gorunenDosyalar.find((f) => f.id === items[0].id);
      setPendingDelete({
        items,
        mode: "file",
        label: dosya?.name ?? t("Dosya"),
        provider: dosya ? driveProviderLabel(dosya) : undefined,
      });
      return;
    }
    if (items.length === 1 && items[0].kind === "folder") {
      const klasor = gorunenKlasorler.find((f) => f.id === items[0].id);
      setPendingDelete({ items, mode: "folder", label: klasor?.name ?? t("Klasör") });
      return;
    }
    setPendingDelete({ items, mode: "many", label: t("{sayi} öğe", { sayi: items.length }) });
  };

  const handleDuplicateMany = async (items: { kind: "file" | "folder"; id: string }[]) => {
    for (const item of items) {
      const dosya = item.kind === "file" ? gorunenDosyalar.find((f) => f.id === item.id) : undefined;
      const klasor = item.kind === "folder" ? gorunenKlasorler.find((f) => f.id === item.id) : undefined;
      if (dosya) await handleDuplicateFile(dosya);
      else if (klasor) await handleDuplicateFolder(klasor);
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

  /** Panelin boşluğuna sağ tık: oluşturma menüsü. */
  const backgroundContextMenu = (e: React.MouseEvent) => {
    if (!canBrowse || readOnly || driveMissing) return;
    e.preventDefault();
    // Açık bir menü varken ikinci sağ tık: olayın window'a ulaşması menüyü
    // KAPATIYOR (bkz. FileContextMenu'nun kapatma dinleyicileri) ve az önce
    // açtığımız menü aynı karede yok oluyordu. Satır menüleri bunu zaten
    // durduruyor (rowContextMenu), boşluk menüsü de durdurmalı.
    e.stopPropagation();
    secim.clear();
    setMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <div
      onContextMenu={backgroundContextMenu}
      // Boşluğa sol tık seçimi bırakır — seçili satır sonsuza kadar vurgulu
      // kalmasın.
      onClick={() => secim.clear()}
    >
      {!compact && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <h3 style={{ fontSize: 19, fontWeight: 500, color: c.textPrimary, margin: 0, flex: 1 }}>
            {t("Dosyalar")}
          </h3>

          {/* Görünüm anahtarı: tercih bütün dosya ekranlarında ortak
              (bkz. lib/fileViewMode.ts). */}
          <button
            type="button"
            title={viewMode === "grid" ? t("Liste görünümü") : t("Simge görünümü")}
            onClick={toggleViewMode}
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

      {/*
        Görev/çıktı ekleri (compact) için ince araç çubuğu.

        SORUN: compact modda başlık satırı hiç çizilmiyor ve "+" düğmesi de
        modalın içinde erişilemiyor (bkz. fabInHeader). Dosya ekleme seçenekleri
        yalnızca BOŞ durum kutusunda duruyordu; göreve bir dosya ekledikten
        sonra ikincisini Drive'dan seçmenin hiçbir yolu kalmıyordu — geriye
        yalnızca sürükleyip bırakmak vardı.

        Boşken çizilmiyor: aynı iki düğme boş durum kutusunda zaten var, küçük
        bir modalda iki kez göstermek kalabalık yaratıyordu.
      */}
      {compact && !readOnly && !driveMissing && (gorunenDosyalar.length > 0 || gorunenKlasorler.length > 0) && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          {connectedProvider && (
            <button
              type="button"
              onClick={handleBrowseDriveClick}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 12px",
                borderRadius: 8,
                border: `1px solid ${c.border}`,
                background: "transparent",
                color: c.textPrimary,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              <IconFolder size={14} color={c.textSecondary} />
              {connectedProvider === "microsoft" ? t("OneDrive'dan seç") : t("Drive'dan seç")}
            </button>
          )}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 12px",
              borderRadius: 8,
              border: `1px solid ${c.border}`,
              background: "transparent",
              color: c.textPrimary,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            <IconUpload size={14} color={c.textSecondary} />
            {t("Bilgisayardan seç")}
          </button>
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
      {!readOnly && !loading && gorunenDosyalar.length === 0 && gorunenKlasorler.length === 0 && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!driveMissing) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            // Klasör bırakılabilsin diye ağaç okunuyor (bkz. lib/dropFiles.ts).
            if (!driveMissing) void readDroppedFiles(e.dataTransfer).then(handleFiles);
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

      {/*
        Yükleme satırları İNCE. Eskiden her satır çerçeveli, iki katlı ve dosya
        satırlarından daha uzun bir kutuydu; bir klasör yüklemesinde onlarcası
        birden çıkınca listeyi tamamen ekrandan itiyordu. Yükleme geçici bir
        durum, kalıcı içeriğin önüne geçmemeli.
      */}
      {uploads.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
          {uploads.map((u) => (
            <div key={u.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  color: u.error ? c.danger : c.textSecondary,
                }}
              >
                {u.name}
              </span>

              {u.error ? (
                <span style={{ color: c.danger, flexShrink: 0 }}>{u.error}</span>
              ) : (
                <>
                  {/* İnce çubuk: yüzde yazısı zaten var, çubuk yalnızca
                      "ilerliyor mu" sorusunu bir bakışta cevaplıyor. */}
                  <span
                    style={{
                      width: 90,
                      height: 3,
                      borderRadius: 2,
                      background: c.border,
                      overflow: "hidden",
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        display: "block",
                        width: `${ratioPct(u)}%`,
                        height: "100%",
                        background: c.accent,
                        transition: "width 0.2s ease",
                      }}
                    />
                  </span>
                  {/* Boyut hem yüklenen hem toplam: yalnızca yüzde göstermek
                      büyük bir dosyada "takıldı mı?" sorusunu cevaplamıyordu. */}
                  <span style={{ color: c.textSecondary, flexShrink: 0 }}>
                    {formatFileSize(u.uploadedBytes)} / {formatFileSize(u.sizeBytes)}
                  </span>
                </>
              )}

              <button
                type="button"
                onClick={() => (u.error ? dismissUpload(u.id) : cancelUpload(u.id))}
                style={{
                  background: "transparent",
                  border: "none",
                  color: c.textSecondary,
                  cursor: "pointer",
                  fontSize: 13,
                  padding: 0,
                  flexShrink: 0,
                }}
              >
                {/* Yükleme sürerken vazgeçilebilir: yanlış dosya seçildiğinde
                    bitmesini beklemek gerekiyordu. */}
                {u.error ? t("Kapat") : t("Vazgeç")}
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <div style={{ color: c.danger, fontSize: 15, marginBottom: 10 }}>{error}</div>}

      {/* Ekmek kırıntısı: kökten bulunulan klasöre. Kök her zaman tıklanabilir,
          çünkü en sık istenen "başa dön". */}
      {/*
        Koşul `folderId`e bakıyor, kırıntılara DEĞİL: yol sunucudan ayrı bir
        istekle geliyor ve o istek başarısız olursa (ya da henüz dönmediyse)
        kullanıcı klasörün içinde çıkışsız kalırdı. Geri düğmesi her hâlükârda
        çizilmeli.
      */}
      {canBrowse && folderId && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 12, fontSize: 15 }}>
          {/*
            Açık "Geri" düğmesi. Ekmek kırıntısı bir üst kademeyi zaten
            gösteriyor ama onu bir GEZİNME aracı olarak okumak öğrenilmiş bir
            beceri; klasöre giren kullanıcı önce geri düğmesi arıyor ve
            bulamayınca tarayıcının geri tuşuna basıp sayfadan çıkıyordu.
          */}
          <button
            type="button"
            onClick={() => setFolderId(parentFolderId)}
            aria-label={t("Geri")}
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
              fontSize: 14,
              marginRight: 2,
            }}
          >
            <IconChevronLeft size={14} color={c.textSecondary} />
            {t("Geri")}
          </button>
          {/* Kök de bir bırakma hedefi: klasörün dışına çıkarmanın yolu bu. */}
          <button
            type="button"
            onClick={() => setFolderId(undefined)}
            {...dropTargetProps("root")}
            style={{
              background: dropOver === "root" ? `${c.accent}22` : "transparent",
              border: "none",
              borderRadius: 6,
              color: c.accent,
              cursor: "pointer",
              padding: "2px 6px",
              margin: "0 -6px",
              fontSize: 15,
            }}
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
                  {...dropTargetProps(`crumb:${k.id}`, k)}
                  style={{
                    background: dropOver === `crumb:${k.id}` ? `${c.accent}22` : "transparent",
                    border: "none",
                    borderRadius: 6,
                    color: c.accent,
                    cursor: "pointer",
                    padding: "2px 6px",
                    fontSize: 15,
                  }}
                >
                  {k.name}
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {/*
        Kement (tarayarak) seçim buradan başlıyor: kapsayıcı `position:
        relative`, çünkü dikdörtgen onun içine çiziliyor. `minHeight` bilerek
        var — listenin altındaki BOŞLUK da kementin başlayabileceği yer, yoksa
        birkaç dosyalık bir klasörde taramaya başlayacak zemin kalmıyordu.
      */}
      <div
        ref={marquee.containerRef}
        onMouseDown={marquee.onMouseDown}
        style={{
          position: "relative",
          // Liste boşken taban yükseklik verilmiyor: boş durum kutusunun
          // altında taranacak bir şey de yok, sadece boşluk kalırdı.
          minHeight: canBrowse && (gorunenDosyalar.length > 0 || gorunenKlasorler.length > 0) ? 220 : undefined,
        }}
      >

      {loading ? (
        <div style={{ color: c.textSecondary, fontSize: 15 }}>{t("Yükleniyor…")}</div>
      ) : gorunenDosyalar.length === 0 && gorunenKlasorler.length === 0 ? (
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
          {gorunenKlasorler.map((folder) => (
            <div
              key={folder.id}
              ref={marquee.item(folderKey(folder.id))}
              draggable={canBrowse && !readOnly && !folder.managed}
              onDragStart={(e) => beginDrag(e, folderKey(folder.id))}
              onDragEnd={() => setDragKeys(null)}
              onDoubleClick={() => openFolder(folder.id)}
              onClick={(e) => rowClick(e, folderKey(folder.id), () => openFolder(folder.id))}
              onContextMenu={(e) => rowContextMenu(e, { folder })}
              {...dropTargetProps(`folder:${folder.id}`, folder)}
              style={{
                border: `1px solid ${
                  dropOver === `folder:${folder.id}` || secim.has(folderKey(folder.id)) ? c.accent : c.border
                }`,
                borderRadius: 10,
                background:
                  dropOver === `folder:${folder.id}` || secim.has(folderKey(folder.id))
                    ? `${c.accent}14`
                    : c.surface,
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

          {gorunenDosyalar.map((file) => (
            <div
              key={file.id}
              ref={marquee.item(fileKey(file.id))}
              draggable={canMoveFile(file)}
              onDragStart={(e) => beginDrag(e, fileKey(file.id))}
              onDragEnd={() => setDragKeys(null)}
              onClick={(e) => rowClick(e, fileKey(file.id), () => setPreview(file))}
              onDoubleClick={() => setPreview(file)}
              onContextMenu={(e) => rowContextMenu(e, { file })}
              style={{
                border: `1px solid ${secim.has(fileKey(file.id)) ? c.accent : c.border}`,
                borderRadius: 10,
                background: secim.has(fileKey(file.id)) ? `${c.accent}14` : c.surface,
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
                <FileThumb file={file} thumbs={thumbs} variant="tile" />
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
          {gorunenKlasorler.map((folder) => (
            <div
              key={folder.id}
              ref={marquee.item(folderKey(folder.id))}
              draggable={canBrowse && !readOnly && !folder.managed}
              onDragStart={(e) => beginDrag(e, folderKey(folder.id))}
              onDragEnd={() => setDragKeys(null)}
              onClick={(e) => rowClick(e, folderKey(folder.id), () => openFolder(folder.id))}
              onDoubleClick={() => openFolder(folder.id)}
              onContextMenu={(e) => rowContextMenu(e, { folder })}
              {...dropTargetProps(`folder:${folder.id}`, folder)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "11px 14px",
                borderRadius: 10,
                border: `1px solid ${
                  dropOver === `folder:${folder.id}` || secim.has(folderKey(folder.id)) ? c.accent : c.border
                }`,
                background:
                  dropOver === `folder:${folder.id}` || secim.has(folderKey(folder.id))
                    ? `${c.accent}14`
                    : c.surface,
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

          {gorunenDosyalar.map((file) => (
            <div
              key={file.id}
              ref={marquee.item(fileKey(file.id))}
              draggable={canMoveFile(file)}
              onDragStart={(e) => beginDrag(e, fileKey(file.id))}
              onDragEnd={() => setDragKeys(null)}
              onContextMenu={(e) => rowContextMenu(e, { file })}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "11px 14px",
                borderRadius: 10,
                border: `1px solid ${secim.has(fileKey(file.id)) ? c.accent : c.border}`,
                background: secim.has(fileKey(file.id)) ? `${c.accent}14` : c.surface,
              }}
            >
              <div
                onClick={(e) => rowClick(e, fileKey(file.id), () => setPreview(file))}
                onDoubleClick={() => setPreview(file)}
                style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, cursor: "pointer" }}
              >
                {/* Önizleme liste görünümünde de gösteriliyor: küçük bir kare
                    yeter, ama "hangi görsel bu?" sorusunu ikon cevaplayamıyor. */}
                <FileThumb file={file} thumbs={thumbs} variant="row" />
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
                <IconButton title={t("Kaldır")} onClick={() => askDelete([{ kind: "file", id: file.id }])}>
                  <IconTrash size={16} color={c.danger} />
                </IconButton>
              )}
            </div>
          ))}
        </div>
      )}

        {marquee.rect && (
          <div
            style={{
              position: "absolute",
              left: marquee.rect.left,
              top: marquee.rect.top,
              width: marquee.rect.width,
              height: marquee.rect.height,
              border: `1px solid ${c.accent}`,
              background: `${c.accent}1f`,
              borderRadius: 4,
              // Kementin altındaki öğelerin ölçüsü alınıyor; fare olaylarını
              // yutmamalı.
              pointerEvents: "none",
            }}
          />
        )}
      </div>


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
            // Boşluk menüsü: oluşturma seçenekleri. "+" düğmesindekilerin
            // aynısı — sağ tık onları imlecin altına getiriyor, ayrı bir
            // yetenek eklemiyor (bkz. useProjectFabAction).
            // Çoklu seçime sağ tık: menü seçimin TAMAMI için. Tek öğelik
            // menüyü göstermek, kullanıcının az önce seçtiği beş dosyayı yok
            // saymak olurdu.
            menu.toplu
              ? [
                  {
                    label: t("{sayi} öğeyi çoğalt", { sayi: menu.toplu.length }),
                    disabled: readOnly,
                    onClick: () => void handleDuplicateMany(menuHedefleri(menu)),
                  },
                  ...(folderId && !readOnly
                    ? [
                        {
                          label: parentFolderId
                            ? t("{sayi} öğeyi üst klasöre taşı", { sayi: menu.toplu.length })
                            : t("{sayi} öğeyi köke taşı", { sayi: menu.toplu.length }),
                          onClick: () => void moveToParent(menuHedefleri(menu)),
                        },
                      ]
                    : []),
                  {
                    label: t("{sayi} öğeyi kaldır", { sayi: menu.toplu.length }),
                    danger: true,
                    disabled: readOnly,
                    onClick: () => askDelete(menuHedefleri(menu)),
                  },
                ]
              : !menu.file && !menu.folder
              ? [
                  { label: t("Yeni klasör"), onClick: () => void handleCreateFolder() },
                  ...(connectedProvider
                    ? [{ label: t("Yeni belge oluştur"), onClick: () => createMenuRef.current?.openMenu() }]
                    : []),
                  { label: t("Dosya yükle"), onClick: () => inputRef.current?.click() },
                  { label: t("Klasör yükle"), onClick: () => folderInputRef.current?.click() },
                ]
              : menu.folder
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
                    label: t("Çoğalt"),
                    disabled: readOnly,
                    onClick: () => void handleDuplicateFolder(menu.folder!),
                  },
                  // Dokunmatikte sürükleme yok: klasörden çıkarmanın menüdeki
                  // karşılığı. Yalnızca bir klasörün İÇİNDEYKEN anlamlı.
                  ...(folderId && !readOnly && !menu.folder.managed
                    ? [
                        {
                          label: parentFolderId ? t("Üst klasöre taşı") : t("Köke taşı"),
                          onClick: () => void moveToParent(menuHedefleri(menu)),
                        },
                      ]
                    : []),
                  {
                    label: t("Kaldır"),
                    danger: true,
                    disabled: menu.folder.managed || readOnly,
                    onClick: () => askDelete(menuHedefleri(menu)),
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
                    label: t("Çoğalt"),
                    disabled: readOnly,
                    onClick: () => void handleDuplicateFile(menu.file!),
                  },
                  ...(folderId && canMoveFile(menu.file!)
                    ? [
                        {
                          label: parentFolderId ? t("Üst klasöre taşı") : t("Köke taşı"),
                          onClick: () => void moveToParent(menuHedefleri(menu)),
                        },
                      ]
                    : []),
                  {
                    label: t("Kaldır"),
                    danger: true,
                    disabled: readOnly,
                    onClick: () => askDelete(menuHedefleri(menu)),
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
          title={pendingDelete.mode === "folder" ? t("Klasörü kaldır") : t("Dosyayı kaldır")}
          message={
            pendingDelete.mode === "folder"
              ? t('"{ad}" klasörü İÇİNDEKİLERLE BİRLİKTE kaldırılacak.', { ad: pendingDelete.label })
              : pendingDelete.mode === "many"
              ? t("{sayi} öğe Projelio'dan kaldırılacak.", { sayi: pendingDelete.items.length })
              : t('"{dosya}" Projelio\'dan kaldırılacak.', { dosya: pendingDelete.label })
          }
          extra={
            // Eskiden dosya Drive'da OLDUĞU GİBİ kalıyordu ve pencere bunu
            // yazıyordu; kullanıcı için sonuç, sildiğini sandığı dosyanın
            // Drive'da durmaya devam etmesiydi. Artık varsayılan "orada da
            // kaldır" — çöp kutusuna taşındığı için geri alınabilir.
            //
            // Kümede hiç DOSYA yoksa gösterilmiyor: klasör kaldırma bulutta
            // her hâlükârda çöp kutusuna taşıyor, seçenek sunmak yalan olurdu.
            !pendingDelete.items.some((i) => i.kind === "file") ? undefined : (
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, color: c.textSecondary }}>
              <input type="checkbox" checked={alsoTrash} onChange={(e) => setAlsoTrash(e.target.checked)} />
              {pendingDelete.provider
                ? t("{saglayici}'da da çöp kutusuna taşı", { saglayici: pendingDelete.provider })
                : t("Bulut deposunda da çöp kutusuna taşı")}
            </label>
            )
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
