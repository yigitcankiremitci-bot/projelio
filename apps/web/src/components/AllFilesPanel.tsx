import { useEffect, useMemo, useState } from "react";
import type { Job, Project, ProjectFile } from "@projelio/shared";
import { filesApi } from "../api/files";
import { driveEditUrl, driveProviderLabel, fileKindLabel, formatFileSize } from "../lib/driveLinks";
import { useFileThumbnails } from "../lib/fileThumbnails";
import { fileKey, parseKey, useFileSelection } from "../lib/fileSelection";
import { useFileViewMode } from "../lib/fileViewMode";
import { useMarqueeSelection } from "../lib/useMarqueeSelection";
import { useRefreshOnUndo, useUndo, useWithoutPendingDeletes } from "../lib/undo";
import { useIsDesktop } from "../lib/useIsDesktop";
import { useProjectFabAction } from "../lib/projectFab";
import { usePageFileDrop } from "../lib/usePageFileDrop";
import { useThemeColors } from "../theme/useThemeColors";
import ConfirmDialog from "./ConfirmDialog";
import FileContextMenu from "./FileContextMenu";
import FilePreviewModal from "./FilePreviewModal";
import FileThumb from "./FileThumb";
import QuickFileUploadModal, { type UploadTargetOption } from "./QuickFileUploadModal";
import { IconDownload, IconExternalLink } from "./icons";
import { useT } from "../lib/i18n";

/**
 * İşlerim sayfasındaki "Dosyalar" sekmesi: kullanıcının erişebildiği TÜM işlerin
 * dosyalarını tek listede gösterir.
 *
 * Liste birden fazla işi birleştirdiği için tek bir yükleme bağlamı yok; bu yüzden
 * uzun süre salt okunurdu ve "+" düğmesi anasayfanın varsayılanı olan "Yeni iş"i
 * açıyordu. Yalnızca proje düzeyinde erişimi olan kullanıcı (örn. taşeron) buradan
 * hiç dosya ekleyemiyordu. Artık "+" bir hedef seçtiren yükleme modalini açıyor.
 */
interface Props {
  jobs: Job[];
  /** Kullanıcının erişebildiği projeler — yükleme hedefi listesi için. */
  projects: Project[];
  myUserId: string | null;
}

export default function AllFilesPanel({ jobs, projects, myUserId }: Props) {
  const c = useThemeColors();
  const t = useT();
  const isDesktop = useIsDesktop();
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<ProjectFile | null>(null);
  /**
   * Sağ tık, seçim ve görünüm FilesPanel'dekiyle AYNI kancalardan geliyor:
   * kullanıcı için burası da "dosyalar sayfası" ve listenin birden çok işten
   * derlendiği onun sorunu değil. Kuralları burada ayrıca yazmak, birinde
   * düzeltilen davranışın diğerinde eski kalması demekti.
   *
   * Klasör YOK: bu liste birden fazla işi birleştiriyor, tek bir klasör ağacı
   * karşılığı bulunmuyor (bkz. FilesPanel'deki canBrowse).
   */
  const [menu, setMenu] = useState<{ x: number; y: number; file?: ProjectFile; toplu?: string[] } | null>(null);
  const secim = useFileSelection();
  /** Onay bekleyen kaldırma; tek dosya da bir kümedir (bkz. FilesPanel). */
  const [pendingDelete, setPendingDelete] = useState<ProjectFile[] | null>(null);
  const [viewMode, toggleViewMode] = useFileViewMode();
  const { pushUndo, pushDestructive } = useUndo();
  const [adding, setAdding] = useState(false);
  // Sürükleyip bırakılan dosyalar: hedefi kullanıcı pencerede seçecek.
  const [dropped, setDropped] = useState<File[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  // İşin geneline yükleme yalnızca iş ekibine açık (bkz. backend files.service.ts
  // assertContextAllowed). İş sahibi her zaman iş düzeyindedir; diğerleri için
  // seçeneği göstermiyoruz ki tıklayınca 403 almasınlar — asıl kısıt yine sunucuda.
  const uploadTargets = useMemo<UploadTargetOption[]>(() => {
    const out: UploadTargetOption[] = [];
    const listed = new Set<string>();

    for (const job of jobs) {
      listed.add(job.id);
      if (myUserId && job.ownerId === myUserId) {
        out.push({ id: `job:${job.id}`, label: "İş geneli", group: job.title, target: { jobId: job.id } });
      }
      for (const p of projects.filter((pr) => pr.jobId === job.id)) {
        out.push({ id: `project:${p.id}`, label: p.title, group: job.title, target: { projectId: p.id } });
      }
    }

    // İşi listede olmayan projeler (örn. iş kartı gizlenmiş) kaybolmasın.
    for (const p of projects.filter((pr) => !listed.has(pr.jobId))) {
      out.push({ id: `project:${p.id}`, label: p.title, group: "Diğer", target: { projectId: p.id } });
    }

    return out;
  }, [jobs, projects, myUserId]);

  /**
   * Bu liste birden çok işi birleştiriyor, yani bırakılan dosyanın hedefi
   * belirsiz. Bu yüzden bırakma doğrudan yüklemiyor: dosyaları tutup "nereye?"
   * penceresini açıyoruz — kullanıcı yine sürükleyip bırakabiliyor, tek fark
   * bir seçim adımı.
   */
  // Klasör bırakılırsa ağaçtaki dosyalar düz listeye açılır (bkz. lib/dropFiles.ts);
  // hedef seçimi yapıldıktan sonra klasör yapısını sunucu kuruyor.
  const { dragging } = usePageFileDrop(uploadTargets.length > 0, (dosyalar) =>
    setDropped(dosyalar.map((d) => d.file))
  );



  useProjectFabAction({ label: "Dosya ekle", onClick: () => setAdding(true) }, []);

  useEffect(() => {
    if (jobs.length === 0) {
      setFiles([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    Promise.all(
      jobs.map((job) =>
        filesApi
          .listByJob(job.id, { scope: "all" })
          // Bir işin dosyaları çekilemese bile (erişim, ağ vb.) diğerleri listelenmeye devam etsin.
          .then((list) => list.map((f) => ({ ...f, jobTitle: f.jobTitle ?? job.title })))
          .catch(() => [] as ProjectFile[])
      )
    )
      .then((lists) => {
        if (cancelled) return;
        const merged = lists.flat().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        setFiles(merged);
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [jobs, reloadKey]);

  const handleDownload = async (file: ProjectFile) => {
    try {
      window.location.href = await filesApi.contentUrl(file.id, { download: true });
    } catch (e: any) {
      setError(e?.message ?? "Dosya indirilemedi");
    }
  };

  const reload = () => setReloadKey((k) => k + 1);
  // Geri/ileri alma sunucuyu değiştiriyor; liste kendini tazelemeli.
  useRefreshOnUndo(reload);

  /** Silinmeyi bekleyenler elenmiş liste (bkz. FilesPanel'deki aynı gerekçe). */
  const gorunen = useWithoutPendingDeletes(files);
  const thumbs = useFileThumbnails(gorunen);
  const sirali = useMemo(() => gorunen.map((f) => fileKey(f.id)), [gorunen]);

  /** Menünün üstünde çalışacağı dosyalar: çoklu seçim varsa hepsi. */
  const menuDosyalari = (m: { file?: ProjectFile; toplu?: string[] }): ProjectFile[] => {
    if (m.toplu) {
      const ids = new Set(m.toplu.map((k) => parseKey(k).id));
      return gorunen.filter((f) => ids.has(f.id));
    }
    return m.file ? [m.file] : [];
  };

  /** Kement (tarayarak) seçim — FilesPanel'dekiyle aynı kanca. */
  const marquee = useMarqueeSelection({
    enabled: isDesktop,
    getBase: () => secim.keys,
    onChange: secim.replace,
  });

  const rowClick = (e: React.MouseEvent, file: ProjectFile) => {
    e.stopPropagation();
    setMenu(null);
    // Masaüstünde tek tık seçer, çift tık açar; dokunmatikte tek dokunma açar
    // (bkz. FilesPanel'deki aynı kural).
    if (isDesktop) secim.click(e, fileKey(file.id), sirali);
    else setPreview(file);
  };

  const rowContextMenu = (e: React.MouseEvent, file: ProjectFile) => {
    e.preventDefault();
    e.stopPropagation();
    const aktif = secim.contextSelect(fileKey(file.id));
    setMenu({ x: e.clientX, y: e.clientY, file, toplu: aktif.length > 1 ? aktif : undefined });
  };

  const handleRename = async (file: ProjectFile) => {
    const ad = window.prompt(t("Yeni ad:"), file.name)?.trim();
    if (!ad || ad === file.name) return;
    const eski = file.name;
    try {
      const guncel = await filesApi.rename(file.id, ad);
      setFiles((prev) => prev.map((f) => (f.id === file.id ? { ...guncel, jobTitle: f.jobTitle } : f)));
      pushUndo({
        label: t("Dosya yeniden adlandırma"),
        run: () => filesApi.rename(file.id, eski).then(() => undefined),
        redo: () => filesApi.rename(file.id, ad).then(() => undefined),
      });
    } catch (e: any) {
      setError(e?.message ?? t("Dosya yeniden adlandırılamadı"));
    }
  };

  const handleDuplicate = async (list: ProjectFile[]) => {
    try {
      for (const file of list) {
        const kopya = await filesApi.duplicate(file.id);
        setFiles((prev) => [{ ...kopya, jobTitle: file.jobTitle }, ...prev]);
        // İleri alma yok: her çoğaltma yeni bir kimlik üretiyor.
        pushUndo({
          label: t("Dosya çoğaltma"),
          run: () => filesApi.remove(kopya.id, true).then(() => undefined),
        });
      }
    } catch (e: any) {
      setError(e?.message ?? t("Dosya çoğaltılamadı"));
    }
  };

  const handleDelete = () => {
    if (!pendingDelete) return;
    const list = pendingDelete;
    setPendingDelete(null);

    const ids = new Set(list.map((f) => f.id));
    setFiles((prev) => prev.filter((f) => !ids.has(f.id)));
    secim.clear();
    // Silme sunucuda geri alınamıyor; istek Cmd+Z penceresi kadar bekletiliyor.
    pushDestructive({
      label: list.length > 1 ? t("{sayi} öğeyi kaldırma", { sayi: list.length }) : t("Dosya kaldırma"),
      entityIds: list.map((f) => f.id),
      commit: async () => {
        try {
          await Promise.all(list.map((f) => filesApi.remove(f.id, true)));
        } catch (e: any) {
          setError(e?.message ?? t("Dosya kaldırılamadı"));
          reload();
        }
      },
      restore: reload,
    });
  };

  /** Bir dosyanın alt satırı: hangi işten geldiği, türü, boyutu. */
  const altSatir = (file: ProjectFile) =>
    file.status === "missing"
      ? t("{saglayici}'da bulunamadı", { saglayici: driveProviderLabel(file) })
      : [file.jobTitle, fileKindLabel(file), file.sizeBytes ? formatFileSize(file.sizeBytes) : null]
          .filter(Boolean)
          .join(" · ");

  // Modal her durumda render edilmeli: dosya yokken de "+" ile yükleme yapılabilsin.
  // (Eskiden boş durumda erken return vardı; taşeronun gördüğü ekran tam da buydu.)
  const body = loading ? (
    <div style={{ color: c.textSecondary, fontSize: 15 }}>{t("Yükleniyor…")}</div>
  ) : error ? (
    <div style={{ color: c.danger, fontSize: 15 }}>{error}</div>
  ) : gorunen.length === 0 ? (
    <div
      style={{
        border: `1px dashed ${c.border}`,
        borderRadius: 12,
        padding: 40,
        textAlign: "center",
        color: c.textSecondary,
        fontSize: 16,
      }}
    >
      {t("Henüz dosya yok.")}
    </div>
  ) : viewMode === "grid" ? (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
      {gorunen.map((file) => (
        <div
          key={file.id}
          ref={marquee.item(fileKey(file.id))}
          onClick={(e) => rowClick(e, file)}
          onDoubleClick={() => setPreview(file)}
          onContextMenu={(e) => rowContextMenu(e, file)}
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
          <div
            title={altSatir(file)}
            style={{
              fontSize: 12,
              color: c.textSecondary,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {file.jobTitle ?? fileKindLabel(file)}
          </div>
        </div>
      ))}
    </div>
  ) : (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {gorunen.map((file) => (
        <div
          key={file.id}
          ref={marquee.item(fileKey(file.id))}
          onContextMenu={(e) => rowContextMenu(e, file)}
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
            onClick={(e) => rowClick(e, file)}
            onDoubleClick={() => setPreview(file)}
            style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, cursor: "pointer" }}
          >
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
              <div style={{ fontSize: 13, color: c.textSecondary }}>{altSatir(file)}</div>
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
        </div>
      ))}
    </div>
  );

  return (
    <div onClick={() => secim.clear()}>
      {/* Görünüm anahtarı FilesPanel'dekiyle AYNI tercihi okuyor
          (bkz. lib/fileViewMode.ts): kullanıcı simge görünümünü bir kez
          seçtiyse dosyaları nerede açarsa açsın öyle görmeli. */}
      {!loading && !error && gorunen.length > 0 && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <button
            type="button"
            title={viewMode === "grid" ? t("Liste görünümü") : t("Simge görünümü")}
            onClick={toggleViewMode}
            style={{
              padding: "7px 12px",
              borderRadius: 9,
              border: `1px solid ${c.border}`,
              background: "transparent",
              color: c.textPrimary,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            {viewMode === "grid" ? t("Liste") : t("Simge")}
          </button>
        </div>
      )}

      {/* Kement kapsayıcısı: `position: relative` + altta boşluk
          (bkz. FilesPanel'deki aynı düzen). */}
      <div
        ref={marquee.containerRef}
        onMouseDown={marquee.onMouseDown}
        style={{ position: "relative", minHeight: gorunen.length > 0 ? 220 : undefined }}
      >
        {body}

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
              pointerEvents: "none",
            }}
          />
        )}
      </div>

      {menu && (
        <FileContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={
            menu.toplu
              ? [
                  {
                    label: t("{sayi} öğeyi çoğalt", { sayi: menu.toplu.length }),
                    onClick: () => void handleDuplicate(menuDosyalari(menu)),
                  },
                  {
                    label: t("{sayi} öğeyi kaldır", { sayi: menu.toplu.length }),
                    danger: true,
                    onClick: () => setPendingDelete(menuDosyalari(menu)),
                  },
                ]
              : [
                  { label: t("Önizle"), onClick: () => setPreview(menu.file!) },
                  { label: t("İndir"), onClick: () => void handleDownload(menu.file!) },
                  {
                    label: t("{saglayici}'da aç", { saglayici: driveProviderLabel(menu.file!) }),
                    onClick: () => window.open(driveEditUrl(menu.file!), "_blank", "noopener,noreferrer"),
                  },
                  { label: t("Yeniden adlandır"), onClick: () => void handleRename(menu.file!) },
                  { label: t("Çoğalt"), onClick: () => void handleDuplicate([menu.file!]) },
                  {
                    label: t("Kaldır"),
                    danger: true,
                    onClick: () => setPendingDelete([menu.file!]),
                  },
                ]
          }
        />
      )}

      {preview && <FilePreviewModal file={preview} onClose={() => setPreview(null)} />}

      {pendingDelete && (
        <ConfirmDialog
          title={t("Dosyayı kaldır")}
          message={
            pendingDelete.length > 1
              ? t("{sayi} öğe Projelio'dan kaldırılacak.", { sayi: pendingDelete.length })
              : t('"{dosya}" Projelio\'dan kaldırılacak.', { dosya: pendingDelete[0].name })
          }
          confirmLabel={t("Kaldır")}
          onConfirm={handleDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {/* Sayfaya bırakılan dosya için tam sayfa gösterge (bkz. FilesPanel'deki eşi). */}
      {dragging && (
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
            {t("Bırakın, nereye ekleneceğini soralım")}
          </div>
        </div>
      )}

      {(adding || dropped.length > 0) && (
        <QuickFileUploadModal
          targets={uploadTargets}
          pickerLabel="Nereye"
          emptyMessage="Dosya yükleyebilmek için önce bir işe ya da projeye eklenmen gerekiyor."
          pendingFiles={dropped.length ? dropped : undefined}
          onClose={() => {
            setAdding(false);
            setDropped([]);
          }}
          onUploaded={() => {
            setAdding(false);
            setDropped([]);
            setReloadKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}

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
