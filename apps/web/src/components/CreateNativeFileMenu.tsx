import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { ProjectFile } from "@projelio/shared";
import { filesApi } from "../api/files";
import type { NativeFileKind } from "../api/files";
import { colors } from "../theme/colors";
import Modal from "./Modal";
import { IconChevronDown, IconFile, IconPlus } from "./icons";

export interface CreateNativeFileMenuHandle {
  /** Dışarıdan (örn. Dosyalar sekmesinin "+" FAB seçeneği) tür listesini açar. */
  openMenu: () => void;
}

interface Props {
  target: { jobId: string } | { projectId: string } | { departmentId: string };
  taskId?: string;
  outputId?: string;
  /** Hangi sağlayıcı bağlı: seçenek listesi buna göre değişir (bkz. backend NativeFileKind). */
  provider: "google" | "microsoft";
  /**
   * Tetikleyici düğmeyi çizme; menü yalnızca dışarıdan (openMenu) açılsın.
   * Dosyalar sekmesinde ekleme eylemleri sayfanın "+" düğmesinde toplandığı
   * için kullanılıyor (bkz. FilesPanel actionsInFab). Bu hâlde tür listesi
   * açılır menü olarak DEĞİL, modal olarak gösterilir: açılır menü düğmeye
   * göre konumlanıyor, düğme yokken sarmalayıcı sıfır boyutlu kalıyor ve liste
   * başlığın içinde tuhaf bir yere düşüyordu.
   */
  hideTrigger?: boolean;
  onCreated: (file: ProjectFile) => void;
}

const GOOGLE_KINDS: { kind: NativeFileKind; label: string }[] = [
  { kind: "gdoc", label: "Google Doküman" },
  { kind: "gsheet", label: "Google E-Tablo" },
  { kind: "gslide", label: "Google Sunum" },
];

const MICROSOFT_KINDS: { kind: NativeFileKind; label: string }[] = [
  { kind: "docx", label: "Word Belgesi" },
  { kind: "xlsx", label: "Excel Tablosu" },
  { kind: "pptx", label: "PowerPoint Sunumu" },
];

/**
 * "Yeni dosya oluştur" — bağlı sağlayıcıya göre (Google Dokümanlar/E-Tablolar/
 * Sunular ya da boş Word/Excel/PowerPoint) doğrudan Drive/OneDrive'da boş bir
 * dosya açar ve Projelio'ya kaydeder.
 *
 * Oluşturulan dosya artık otomatik yeni sekmede AÇILMAZ — Projelio'nun geniş
 * önizleme modalında (bkz. FilesPanel.handleFileAdded -> FilePreviewModal)
 * gösterilir; kullanıcı isterse oradaki "Xda düzenle" düğmesiyle kendi
 * sekmesinde açar. Böylece varsayılan olarak Projelio'dan hiç ayrılmadan devam
 * edilir, ayrılmak tamamen kullanıcının tercihi olur.
 */
const CreateNativeFileMenu = forwardRef<CreateNativeFileMenuHandle, Props>(function CreateNativeFileMenu(
  { target, taskId, outputId, provider, hideTrigger = false, onCreated },
  ref
) {
  const c = colors.light;
  const [open, setOpen] = useState(false);
  const [pendingKind, setPendingKind] = useState<{ kind: NativeFileKind; label: string } | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);

  const kinds = provider === "google" ? GOOGLE_KINDS : MICROSOFT_KINDS;

  useImperativeHandle(ref, () => ({ openMenu: () => setOpen(true) }));

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const pick = (item: { kind: NativeFileKind; label: string }) => {
    setOpen(false);
    setPendingKind(item);
    setName("");
    setError("");
  };

  const handleCreate = async () => {
    if (!pendingKind || !name.trim()) return;
    setSaving(true);
    setError("");
    try {
      const created = await filesApi.createNativeFile(target, { kind: pendingKind.kind, name: name.trim(), taskId, outputId });
      onCreated(created);
      setPendingKind(null);
    } catch (e: any) {
      setError(e?.message ?? "Dosya oluşturulamadı");
    } finally {
      setSaving(false);
    }
  };

  /** Ad sorma adımı; hem açılır menü hem modal yolunda aynı. */
  const pendingModal = pendingKind && (
    <Modal title={pendingKind.label} onClose={() => (saving ? undefined : setPendingKind(null))} maxWidth={380}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Dosya adı</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Örn. Toplantı Notları"
            autoFocus
            disabled={saving}
            onKeyDown={(e) => e.key === "Enter" && void handleCreate()}
            style={{ width: "100%" }}
          />
        </div>
        {error && <p style={{ color: c.danger, fontSize: 14, margin: 0 }}>{error}</p>}
        <button
          onClick={handleCreate}
          disabled={saving || !name.trim()}
          style={{
            padding: "10px 0",
            borderRadius: 9,
            border: "none",
            background: c.primary,
            color: "#fff",
            fontSize: 15,
            fontWeight: 500,
            cursor: saving || !name.trim() ? "not-allowed" : "pointer",
          }}
        >
          {saving ? "Oluşturuluyor…" : "Oluştur"}
        </button>
      </div>
    </Modal>
  );

  const kindList = (inModal: boolean) =>
    kinds.map((item) => (
      <button
        key={item.kind}
        onClick={() => pick(item)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          width: "100%",
          padding: inModal ? "12px 13px" : "10px 13px",
          border: "none",
          background: "transparent",
          textAlign: "left",
          fontSize: 15,
          color: c.textPrimary,
          cursor: "pointer",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = c.background)}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <IconFile size={16} color={c.textSecondary} />
        {item.label}
      </button>
    ));

  if (hideTrigger) {
    return (
      <>
        {open && (
          <Modal title="Yeni dosya" onClose={() => setOpen(false)} maxWidth={340}>
            <div style={{ display: "flex", flexDirection: "column" }}>{kindList(true)}</div>
          </Modal>
        )}
        {pendingModal}
      </>
    );
  }

  return (
    <div ref={wrapperRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
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
        <IconPlus size={15} color={c.textPrimary} />
        Yeni dosya
        <IconChevronDown size={13} color={c.textSecondary} />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            minWidth: 190,
            background: c.surface,
            border: `1px solid ${c.border}`,
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(26,31,41,0.14)",
            zIndex: 20,
            overflow: "hidden",
          }}
        >
          {kindList(false)}
        </div>
      )}

      {pendingModal}
    </div>
  );
});

export default CreateNativeFileMenu;
