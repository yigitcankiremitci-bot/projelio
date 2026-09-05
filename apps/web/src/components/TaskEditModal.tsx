import { useEffect, useId, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Output, Task, TaskComment } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import Modal from "./Modal";
import AssigneePicker from "./AssigneePicker";
import EntityDangerZone from "./EntityDangerZone";
import FilesPanel from "./FilesPanel";
import TaskAttachmentsPanel from "./TaskAttachmentsPanel";
import AutoGrowTextarea from "./AutoGrowTextarea";
import AutoGrowNotes from "./AutoGrowNotes";
import { useCurrentUser } from "../lib/useCurrentUser";
import { IconIndent, IconOutdent } from "./icons";
import { useUndo } from "../lib/undo";
import { useT } from "../lib/i18n";

interface Props {
  task: Task;
  /**
   * Rutin tekrarlarının projesi yoktur ama rutinin bağlı olduğu İŞ vardır.
   * Verilirse Dosyalar bölümü o iş bağlamıyla açılır — dosyalar Drive/OneDrive'da
   * yaşadığı ve her dosya bir işe ait olduğu için (bkz. FilesPanel) bağlam şart.
   */
  fileJobId?: string;
  onClose: () => void;
  onSaved: (updated: Task) => void;
  /**
   * Görevin listedeki kaydını MODALI KAPATMADAN günceller.
   *
   * `onSaved` bunun için kullanılamaz: çağıran sayfaların hepsi orada modalı
   * kapatıyor. Ek eklemek ise kaydetmeyi beklemiyor (bkz. TaskAttachmentsPanel)
   * — kullanıcı link bırakıp yorum yazmaya devam edebilmeli, ama karttaki ek
   * rozeti de hemen belirmeli.
   */
  onTaskPatched?: (updated: Task) => void;
  onDeleted?: (deletedTaskId: string) => void;
  onArchived?: (archivedTaskId: string) => void;
}

function toDateInputValue(iso?: string) {
  return iso ? new Date(iso).toISOString().slice(0, 10) : "";
}

/**
 * İki sütunlu form satırı (tarihler, saat/hatırlatma, ekip/bütçe).
 *
 * NEDEN sabit bir kırılma noktası (useIsDesktop) değil: bu satırların
 * genişliğini pencere değil MODALİN kendisi belirliyor — dar ekranda tam ekran,
 * geniş ekranda 1280 px'e kadar. Sarma (wrap) modalin o anki genişliğine göre
 * kendiliğinden karar verir; iki göz yan yana sığmadığı anda alt alta geçerler.
 */
const twoColumnRow: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 10 };

/**
 * O satırların tek bir gözü.
 *
 * `minWidth: 0` ŞART: flex gözleri varsayılan olarak `min-width: auto` alır,
 * yani içindeki alanın asgari genişliğinin altına inemezler. Telefonda tarih
 * alanının asgari genişliği (177 px) gözün payına düşenden büyük olduğu için
 * satır dışarı taşıyor, modal yatay kaydırılır hale geliyor ve alanlar üst üste
 * binmiş gibi görünüyordu.
 *
 * 190 px'lik taban ölçü de bu asgari genişliklerden geliyor: iki tarih alanı
 * ancak bu kadar yer bulunca yan yana durabiliyor, bulamayınca satır sarıyor.
 */
const halfField: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  flex: "1 1 190px",
  minWidth: 0,
};

export default function TaskEditModal({
  task,
  fileJobId,
  onClose,
  onSaved,
  onTaskPatched,
  onDeleted,
  onArchived,
}: Props) {
  const c = useThemeColors();
  const t = useT();
  const { pushUndo } = useUndo();
  const formRef = useRef<HTMLFormElement>(null);
  // Kaydet butonu formun dışında, alttaki yapışkan çubukta duruyor; forma bu
  // kimlikle bağlanır (bkz. Modal'ın footer prop'u).
  const formId = useId();
  /**
   * Ekler iki AYRI panelden geliyor (link ve dosya) ve ikisi de birbirinden
   * habersiz. Yamayı `task` prop'undan türetseydik ikinci panel birincinin
   * değişikliğini ezerdi: `task` sayfada ayrı bir state'te (editingTask)
   * duruyor ve yama sonrası tazelenmiyor. Bu yüzden ikisi burada biriktiriliyor.
   */
  const attachmentPatch = useRef<Pick<Task, "attachments" | "files">>({
    attachments: task.attachments,
    files: task.files,
  });
  const patchAttachments = (part: Partial<Pick<Task, "attachments" | "files">>) => {
    attachmentPatch.current = { ...attachmentPatch.current, ...part };
    onTaskPatched?.({ ...task, ...attachmentPatch.current });
  };
  const isSubtask = Boolean(task.parentTaskId);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [startDate, setStartDate] = useState(toDateInputValue(task.startDate));
  const [deadline, setDeadline] = useState(toDateInputValue(task.deadline));
  // Opsiyonel bitiş saati ve ona bağlı hatırlatma (bkz. migration 057).
  const [deadlineTime, setDeadlineTime] = useState(task.deadlineTime ?? "");
  const [reminderLead, setReminderLead] = useState<string>(
    task.reminderLeadMinutes != null ? String(task.reminderLeadMinutes) : ""
  );
  // Çoklu atama (bkz. migration 053). İlk eleman birincil atanan sayılır;
  // eski tek atamalı görevlerde `assignees` boş gelebilir, o zaman assignedTo'ya düşülür.
  const [assigneeIds, setAssigneeIds] = useState<string[]>(
    task.assignees?.length ? task.assignees.map((a) => a.userId) : task.assignedTo ? [task.assignedTo] : []
  );
  const [budget, setBudget] = useState(String(task.budget ?? 0));
  const [durationValue, setDurationValue] = useState(
    task.estimatedDurationValue != null ? String(task.estimatedDurationValue) : ""
  );
  const [durationUnit, setDurationUnit] = useState<"hours" | "days">(task.estimatedDurationUnit ?? "hours");
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [commentBody, setCommentBody] = useState("");
  /**
   * Seviye dönüşümü (görev ↔ alt görev).
   *
   * Aday üst görevler yalnızca kullanıcı "Alt göreve dönüştür"e bastığında
   * çekiliyor: modal her açıldığında liste indirmek, dönüşüm nadir bir işlem
   * olduğu için boşuna istek olurdu.
   */
  /**
   * Görevin bağlı olduğu çıktı.
   *
   * Liste modal açılınca çekiliyor (seviye dönüşümündeki tembel yükleme gibi
   * değil): çıktı, görevin günlük olarak değiştirilen bir alanı — açılır kutu
   * boş görünüp sonra dolmasın.
   */
  const [outputs, setOutputs] = useState<Output[] | null>(null);
  const [outputId, setOutputId] = useState<string>(task.outputId ?? "");
  const [savingOutput, setSavingOutput] = useState(false);

  const [pickingParent, setPickingParent] = useState(false);
  const [siblings, setSiblings] = useState<Task[] | null>(null);
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [postingComment, setPostingComment] = useState(false);
  const { user: currentUser } = useCurrentUser();

  /**
   * Görevden ayrılma: kullanıcı kendini atananlar listesinden çıkarır. Görev
   * silinmez, başkalarının ataması bozulmaz. Son atanan da ayrılırsa görev
   * "atanmamış" kalır — kimseye zorla bırakılmaktansa ekibin görüp yeniden
   * ataması daha dürüst.
   */
  const amAssigned = assigneeIds.includes(currentUser?.id ?? "");

  const handleLeaveTask = async () => {
    if (!currentUser) return;
    if (!window.confirm(t("Bu görevden ayrılmak istiyor musun? Görev silinmez, üzerinden düşersin."))) return;
    const updated = await api.delete<Task>(`/tasks/${task.id}/assignees/me`).catch(() => null);
    if (updated) {
      setAssigneeIds(updated.assignees?.map((a) => a.userId) ?? []);
      onSaved(updated);
    }
  };

  // DELETE isteğini EntityDangerZone geciktirmeli olarak atar (bkz. resourcePath);
  // burada yalnızca silme sonrası arayüz davranışı kalır.
  const handleDelete = async () => {
    onDeleted?.(task.id);
  };

  const handleArchive = async () => {
    await api.patch(`/tasks/${task.id}/archive`, {});
    onArchived?.(task.id);
  };

  useEffect(() => {
    api
      .get<TaskComment[]>(`/tasks/${task.id}/comments`)
      .then(setComments)
      .catch(() => setComments([]));
  }, [task.id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const trimmedDuration = durationValue.trim();
      const updated = await api.patch<Task>(`/tasks/${task.id}`, {
        title,
        description: description.trim() ? description : null,
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        deadline: deadline ? new Date(deadline).toISOString() : undefined,
        deadlineTime: deadlineTime || null,
        // Saat yoksa hatırlatma da yok: sunucu ve veritabanı aynı kuralı uyguluyor.
        reminderLeadMinutes: deadlineTime && reminderLead !== "" ? Number(reminderLead) : null,
        assignedToIds: assigneeIds,
        budget: Number(budget) || 0,
        estimatedDurationValue: trimmedDuration ? Number(trimmedDuration) : null,
        estimatedDurationUnit: trimmedDuration ? durationUnit : null,
      });
      onSaved(updated);
    } catch {
      setError(t("Görev güncellenemedi. Tekrar dene."));
      setSaving(false);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = commentBody.trim();
    if (!trimmed) return;
    setPostingComment(true);
    try {
      const created = await api.post<TaskComment>(`/tasks/${task.id}/comments`, { body: trimmed });
      setComments((prev) => [...prev, created]);
      setCommentBody("");
    } catch {
      // yorum gönderilemedi, kullanıcı tekrar deneyebilir
    } finally {
      setPostingComment(false);
    }
  };

  // Görevin kapsamındaki çıktılar. Kapsamı yoksa (ör. rutin tekrarı) bölüm hiç açılmaz.
  useEffect(() => {
    const path = task.projectId
      ? `/projects/${task.projectId}/outputs`
      : task.departmentId
        ? `/departments/${task.departmentId}/outputs`
        : null;
    if (!path) return;
    api
      .get<Output[]>(path)
      .then(setOutputs)
      .catch(() => setOutputs([]));
  }, [task.projectId, task.departmentId]);

  const changeOutput = async (nextId: string) => {
    const previous = outputId;
    setOutputId(nextId);
    setSavingOutput(true);
    try {
      const updated = await api.patch<Task>(`/tasks/${task.id}`, { outputId: nextId || null });
      onTaskPatched?.(updated);
      pushUndo({
        label: t("Görevin çıktısı değişti"),
        run: async () => {
          const reverted = await api.patch<Task>(`/tasks/${task.id}`, { outputId: previous || null });
          onTaskPatched?.(reverted);
          setOutputId(previous);
        },
        redo: async () => {
          const redone = await api.patch<Task>(`/tasks/${task.id}`, { outputId: nextId || null });
          onTaskPatched?.(redone);
          setOutputId(nextId);
        },
      });
    } catch {
      // Kaydedilemedi: seçimi geri al, kullanıcı yanlış bilgiyle kalmasın.
      setOutputId(previous);
    } finally {
      setSavingOutput(false);
    }
  };

  /** Seviye değiştirir: parentId doluysa alt göreve iner, null ise göreve çıkar. */
  const convertHierarchy = async (parentId: string | null) => {
    setConverting(true);
    setConvertError(null);
    // Eski üst görev işlemden ÖNCE saklanır; geri alma buna dönecek.
    const previousParent = task.parentTaskId ?? null;
    try {
      const updated = await api.patch<Task>(`/tasks/${task.id}/hierarchy`, { parentTaskId: parentId });
      pushUndo({
        label: parentId ? t("Alt göreve dönüştürüldü") : t("Göreve dönüştürüldü"),
        run: async () => {
          await api.patch(`/tasks/${task.id}/hierarchy`, { parentTaskId: previousParent });
        },
        redo: async () => {
          await api.patch(`/tasks/${task.id}/hierarchy`, { parentTaskId: parentId });
        },
      });
      // onSaved çağıran sayfayı da tazeleyip modali kapatıyor; kart yeni
      // seviyesinde yeniden çizilsin diye burada kapanması doğru.
      onSaved(updated);
    } catch (err: any) {
      setConvertError(err?.message ?? t("Dönüştürme başarısız oldu."));
      setConverting(false);
    }
  };

  const openParentPicker = async () => {
    setPickingParent(true);
    setConvertError(null);
    if (siblings) return;

    // Görev ya bir projeye ya bir departmana ait; aday listesi o kapsamdan gelir.
    const path = task.projectId
      ? `/projects/${task.projectId}/tasks`
      : task.departmentId
        ? `/departments/${task.departmentId}/tasks`
        : null;
    if (!path) {
      setConvertError(t("Bu görevin bağlı olduğu bir proje ya da departman yok."));
      return;
    }
    try {
      setSiblings(await api.get<Task[]>(path));
    } catch (err: any) {
      setConvertError(err?.message ?? t("Görev listesi alınamadı."));
    }
  };

  return (
    <Modal
      title={t("Görevi düzenle")}
      onClose={onClose}
      maxWidth={1280}
      // Kaydet, modalin alt kenarına yapışır: altında ekler, dosyalar, yorumlar
      // ve arşivle/sil bölümleri var, buton içeriğin ortasında kaybolmasın.
      footer={
        <button
          type="submit"
          form={formId}
          disabled={saving}
          style={{ width: "100%", background: c.primary, color: c.onPrimary, padding: "10px 0", borderRadius: 8, border: "none", fontSize: 17, fontWeight: 500 }}
        >
          {saving ? t("Kaydediliyor…") : t("Kaydet")}
        </button>
      }
    >
      <form id={formId} ref={formRef} onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>{t("Başlık")}</label>
          {/* Uzun başlık tek satırda yatay kayıp okunmaz hale gelmesin diye
              sararak büyüyen alan; Enter yine kaydeder (bkz. AutoGrowTextarea). */}
          <AutoGrowTextarea
            value={title}
            onChange={setTitle}
            onSubmit={() => formRef.current?.requestSubmit()}
            onCancel={onClose}
            ariaLabel={t("Başlık")}
            maxLength={200}
            required
            minHeight={42}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>{t("Notlar")}</label>
          {/* Dört satır yüksekliğinde durur, not uzadıkça kendiliğinden büyür:
              sabit yükseklikte uzun not kendi içinde kayan bir kutuya hapsoluyor
              ve yazılanın tamamı görünmüyordu (bkz. AutoGrowNotes). */}
          <AutoGrowNotes
            value={description}
            onChange={setDescription}
            placeholder={t("Görevle ilgili notlar (opsiyonel)")}
            ariaLabel={t("Notlar")}
            maxLength={2000}
            rows={4}
          />
        </div>

        <div style={twoColumnRow}>
          <div style={halfField}>
            <label style={{ fontSize: 15, color: c.textSecondary }}>{t("Başlangıç tarihi")}</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ width: "100%" }} />
          </div>
          <div style={halfField}>
            <label style={{ fontSize: 15, color: c.textSecondary }}>{t("Bitiş tarihi")}</label>
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} required style={{ width: "100%" }} />
          </div>
        </div>

        {/* Bitiş saati opsiyonel: çoğu görevin saati yok, zorunlu kılmak her
            görevde anlamsız bir seçim dayatırdı. Saat girilince hatırlatma
            seçeneği açılır — saat yokken "ne kadar önce" sorusunun karşılığı yok. */}
        <div style={twoColumnRow}>
          <div style={halfField}>
            <label style={{ fontSize: 15, color: c.textSecondary }}>{t("Bitiş saati (opsiyonel)")}</label>
            <input
              type="time"
              value={deadlineTime}
              onChange={(e) => {
                setDeadlineTime(e.target.value);
                // Saat silinince hatırlatma da düşer; kalırsa kaydedilmeyen bir
                // seçim ekranda asılı kalıyordu.
                if (!e.target.value) setReminderLead("");
              }}
              style={{ width: "100%" }}
            />
          </div>
          <div style={halfField}>
            <label style={{ fontSize: 15, color: c.textSecondary }}>{t("Hatırlat")}</label>
            <select
              value={reminderLead}
              onChange={(e) => setReminderLead(e.target.value)}
              disabled={!deadlineTime}
              style={{ width: "100%" }}
            >
              <option value="">{t("Hatırlatma yok")}</option>
              <option value="0">{t("Tam saatinde")}</option>
              <option value="15">{t("15 dakika önce")}</option>
              <option value="60">{t("1 saat önce")}</option>
              <option value="1440">{t("1 gün önce")}</option>
            </select>
          </div>
        </div>

        <div style={twoColumnRow}>
          <div style={halfField}>
            <label style={{ fontSize: 15, color: c.textSecondary }}>{t("Ekip")}</label>
            {/* Tüm kullanıcılar yerine yalnızca proje ekibi/departman kadrosu, arama ile.
                Çoklu: bir görevi birden fazla kişi birlikte yürütebilir. */}
            <AssigneePicker
              projectId={task.projectId}
              departmentId={task.departmentId}
              multiple
              values={assigneeIds}
              onChangeValues={setAssigneeIds}
              value=""
              onChange={() => {}}
            />
          </div>
          <div style={halfField}>
            <label style={{ fontSize: 15, color: c.textSecondary }}>{t("Bütçe (₺)")}</label>
            <input type="number" min={0} value={budget} onChange={(e) => setBudget(e.target.value)} style={{ width: "100%" }} />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>{t("Tahmini süre (opsiyonel)")}</label>
          {/* Süre ve birimi tek bir alanın iki parçası; sarmalarına izin verilmez.
              Birim kutusu yalnızca "Saat"/"Gün" kadar yer tutar (eskiden yarım
              satır kaplıyor, dar ekranda sayı alanını dışarı itiyordu). */}
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="number"
              min={0}
              step="0.5"
              value={durationValue}
              onChange={(e) => setDurationValue(e.target.value)}
              placeholder={t("Örn. 4")}
              style={{ flex: "1 1 0", minWidth: 0 }}
            />
            <select
              value={durationUnit}
              onChange={(e) => setDurationUnit(e.target.value as "hours" | "days")}
              style={{ flex: "0 0 auto" }}
            >
              <option value="hours">{t("Saat")}</option>
              <option value="days">{t("Gün")}</option>
            </select>
          </div>
        </div>

        {error && <p style={{ color: c.danger, fontSize: 16, margin: 0 }}>{error}</p>}
      </form>

      {amAssigned && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <button
            type="button"
            onClick={handleLeaveTask}
            style={{
              padding: "6px 12px",
              fontSize: 13,
              borderRadius: 8,
              border: `1px solid ${c.border}`,
              background: "transparent",
              color: c.danger,
              cursor: "pointer",
            }}
          >
            {t("Görevden ayrıl")}
          </button>
        </div>
      )}

      {/* Çıktı: görevin projenin hangi teslim parçasına ait olduğu. Değişiklik
          anında kaydedilir — açılır kutuda "kaydet"i beklemek doğal değil. */}
      {outputs !== null && outputs.length > 0 && (
        <div style={{ borderTop: `1px solid ${c.border}`, marginTop: 20, paddingTop: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 500, color: c.textPrimary, margin: "0 0 10px" }}>{t("Çıktı")}</h3>
          <select
            value={outputId}
            onChange={(e) => void changeOutput(e.target.value)}
            disabled={savingOutput}
            style={{
              width: "100%",
              fontSize: 15,
              padding: "8px 10px",
              borderRadius: 8,
              border: `1px solid ${c.border}`,
              background: c.surface,
              color: c.textPrimary,
            }}
          >
            <option value="">{t("Çıktı yok")}</option>
            {outputs.map((output) => (
              <option key={output.id} value={output.id}>
                {output.title}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Seviye: görev ↔ alt görev dönüşümü.
          Kartların üstünde değil burada: satırdaki eylem şeridi zaten kalabalıktı
          ve bu, günlük değil ara sıra yapılan bir işlem. */}
      <div style={{ borderTop: `1px solid ${c.border}`, marginTop: 20, paddingTop: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 500, color: c.textPrimary, margin: "0 0 10px" }}>{t("Seviye")}</h3>

        {task.parentTaskId ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, color: c.textSecondary }}>{t("Bu kayıt bir alt görev.")}</span>
            <button
              type="button"
              onClick={() => void convertHierarchy(null)}
              disabled={converting}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                fontSize: 13,
                borderRadius: 8,
                border: `1px solid ${c.border}`,
                background: "transparent",
                color: c.textPrimary,
                cursor: converting ? "default" : "pointer",
                opacity: converting ? 0.6 : 1,
              }}
            >
              <IconOutdent size={14} color={c.textSecondary} />
              {converting ? t("Dönüştürülüyor…") : t("Göreve dönüştür")}
            </button>
          </div>
        ) : !pickingParent ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, color: c.textSecondary }}>{t("Bu kayıt bir görev.")}</span>
            <button
              type="button"
              onClick={() => void openParentPicker()}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                fontSize: 13,
                borderRadius: 8,
                border: `1px solid ${c.border}`,
                background: "transparent",
                color: c.textPrimary,
                cursor: "pointer",
              }}
            >
              <IconIndent size={14} color={c.textSecondary} />
              {t("Alt göreve dönüştür")}
            </button>
          </div>
        ) : (
          <ParentPicker
            task={task}
            siblings={siblings}
            converting={converting}
            onPick={(parentId) => void convertHierarchy(parentId)}
            onCancel={() => setPickingParent(false)}
          />
        )}

        {convertError && (
          <p style={{ color: c.danger, fontSize: 13, margin: "10px 0 0" }}>{convertError}</p>
        )}
      </div>

      {/* Link/dosya ekleri her görevde çalışır — rutin tekrarları dahil (bkz. 060).
          FilesPanel'den ayrı: o Drive/OneDrive klasör bağlamı kurar ve proje
          gerektirir; bu ise göreve doğrudan bağlı, bağlamsız bir ek listesi. */}
      <div style={{ borderTop: `1px solid ${c.border}`, marginTop: 20, paddingTop: 16 }}>
        <TaskAttachmentsPanel taskId={task.id} onChanged={(attachments) => patchAttachments({ attachments })} />
      </div>

      {/* Dosyalar Drive/OneDrive'da yaşar; kendi veritabanımıza dosya yazılmaz.
          Proje görevinde proje bağlamı, rutin tekrarında rutinin işi kullanılır —
          ikisi de yoksa (departman görevi) bölüm hiç açılmaz. */}
      {(task.projectId || fileJobId) && (
        <div style={{ borderTop: `1px solid ${c.border}`, marginTop: 20, paddingTop: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 500, color: c.textPrimary, margin: "0 0 10px" }}>{t("Dosyalar")}</h3>
          {task.projectId ? (
            <FilesPanel
              projectId={task.projectId}
              taskId={task.id}
              compact
              onFilesChange={(files) => patchAttachments({ files })}
            />
          ) : (
            <FilesPanel
              jobId={fileJobId}
              taskId={task.id}
              compact
              onFilesChange={(files) => patchAttachments({ files })}
            />
          )}
        </div>
      )}

      <div style={{ borderTop: `1px solid ${c.border}`, marginTop: 20, paddingTop: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 500, color: c.textPrimary, margin: "0 0 10px" }}>{t("Yorumlar")}</h3>

        {comments.length === 0 ? (
          <p style={{ fontSize: 15, color: c.textSecondary, margin: "0 0 12px" }}>{t("Henüz yorum yok.")}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12, maxHeight: 180, overflowY: "auto" }}>
            {comments.map((cm) => (
              <div key={cm.id} style={{ background: c.background, border: `1px solid ${c.border}`, borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontSize: 15, fontWeight: 500, color: c.textPrimary }}>{cm.authorName}</span>
                  <span style={{ fontSize: 13, color: c.textSecondary }}>
                    {new Date(cm.createdAt).toLocaleDateString("tr-TR")}
                  </span>
                </div>
                <p style={{ fontSize: 16, color: c.textPrimary, margin: 0, lineHeight: 1.4 }}>{cm.body}</p>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleAddComment} style={{ display: "flex", gap: 8 }}>
          {/* minWidth: 0 — yoksa kutunun asgari genişliği Gönder'i dar ekranda
              modalin dışına itiyordu (bkz. halfField'daki aynı gerekçe). */}
          <input
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            placeholder={t("Yorum yaz…")}
            style={{ flex: "1 1 0", minWidth: 0 }}
          />
          <button
            type="submit"
            disabled={postingComment || !commentBody.trim()}
            style={{ flexShrink: 0, padding: "0 16px", borderRadius: 8, border: "none", background: c.primary, color: c.onPrimary, fontSize: 16, fontWeight: 500 }}
          >
            {t("Gönder")}
          </button>
        </form>
      </div>

      <EntityDangerZone
        entityLabel={isSubtask ? t("Alt görevi") : t("Görevi")}
        resourcePath={`/tasks/${task.id}`}
        onArchive={onArchived ? handleArchive : undefined}
        onDelete={onDeleted ? handleDelete : undefined}
        archiveMessage={
          isSubtask
            ? t('"{baslik}" alt görevini arşive eklemek istediğine emin misin? İstediğin zaman Ayarlar > Arşiv üzerinden geri getirebilirsin.', { baslik: task.title })
            : t('"{baslik}" görevini arşive eklemek istediğine emin misin? Varsa bu göreve bağlı tüm alt görevler de arşive taşınır. İstediğin zaman Ayarlar > Arşiv üzerinden geri getirebilirsin.', { baslik: task.title })
        }
        deleteMessage={
          isSubtask
            ? t('"{baslik}" alt görevini silmek istediğine emin misin? Silindikten sonra birkaç saniye içinde Cmd/Ctrl+Z ile geri alabilirsin, sonrasında kalıcı olarak silinir.', { baslik: task.title })
            : t('"{baslik}" görevini silmek istediğine emin misin? Varsa bu göreve bağlı tüm alt görevler de silinecek. Silindikten sonra birkaç saniye içinde Cmd/Ctrl+Z ile geri alabilirsin, sonrasında kalıcı olarak silinir.', { baslik: task.title })
        }
      />
    </Modal>
  );
}

/**
 * "Hangi görevin altına girsin?" listesi.
 *
 * Ayrı bileşen: aday süzme kuralları (kendisi hariç, yalnızca üst görevler) ve
 * "bu görevin kendi alt görevleri var" durumu bir arada okunabilir kalsın.
 * Aynı liste hem adayları hem de engeli tespit etmeye yarıyor, ikinci bir istek
 * gerekmiyor.
 */
function ParentPicker({
  task,
  siblings,
  converting,
  onPick,
  onCancel,
}: {
  task: Task;
  siblings: Task[] | null;
  converting: boolean;
  onPick: (parentId: string) => void;
  onCancel: () => void;
}) {
  const c = useThemeColors();
  const t = useT();

  if (!siblings) {
    return <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>{t("Görevler yükleniyor…")}</p>;
  }

  // Alt görevleri olan bir görev indirilemez: sonuç üçüncü bir seviye olurdu
  // (sunucu da reddeder, ama sebebi burada peşinen söylemek daha anlaşılır).
  const hasSubtasks = siblings.some((candidate) => candidate.parentTaskId === task.id);
  if (hasSubtasks) {
    return (
      <p style={{ fontSize: 14, color: c.textSecondary, margin: 0, lineHeight: 1.5 }}>
        {t("Bu görevin kendi alt görevleri var, bu yüzden alt göreve dönüştürülemez. Önce alt görevlerini başka bir göreve taşı ya da üst seviyeye çıkar.")}
      </p>
    );
  }

  const candidates = siblings.filter(
    (candidate) => !candidate.parentTaskId && candidate.id !== task.id
  );
  if (candidates.length === 0) {
    return (
      <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>
        {t("Alt görev yapılabileceği başka bir görev yok.")}
      </p>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 14, color: c.textSecondary }}>{t("Hangi görevin altına girsin?")}</span>
        <button
          type="button"
          onClick={onCancel}
          style={{
            marginLeft: "auto",
            background: "transparent",
            border: "none",
            color: c.textSecondary,
            fontSize: 13,
            textDecoration: "underline",
            cursor: "pointer",
          }}
        >
          {t("Vazgeç")}
        </button>
      </div>

      <div style={{ maxHeight: 260, overflowY: "auto", border: `1px solid ${c.border}`, borderRadius: 10 }}>
        {candidates.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            onClick={() => onPick(candidate.id)}
            disabled={converting}
            style={{
              width: "100%",
              padding: "10px 12px",
              background: "transparent",
              border: "none",
              borderBottom: `1px solid ${c.border}`,
              textAlign: "left",
              fontSize: 14,
              color: c.textPrimary,
              cursor: converting ? "default" : "pointer",
              opacity: converting ? 0.6 : 1,
            }}
          >
            {candidate.title}
          </button>
        ))}
      </div>
    </div>
  );
}
