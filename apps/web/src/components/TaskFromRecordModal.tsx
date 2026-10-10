import { useEffect, useState } from "react";
import type { Department, Task } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import { todayISO } from "../lib/moduleConfigs";
import AssigneePicker from "./AssigneePicker";
import Modal from "./Modal";
import { useT } from "../lib/i18n";

interface Props {
  /** Varsayılan departman. organizationId verilmezse görev YALNIZCA buraya açılır. */
  departmentId?: string;
  /**
   * Verilirse görev şirketin istenen departmanına ve istenirse bir görevin
   * ALTINA (alt görev) açılabilir — kartvizitten doğan iş çoğu zaman başka bir
   * ekibin işi (ör. teklifi satış hazırlar, bağlantıyı yönetim kurar).
   */
  organizationId?: string;
  moduleKey: string;
  moduleTitle: string;
  recordId: string;
  /** Kaydın özeti — görev başlığının varsayılanı. */
  defaultTitle: string;
  /** Kayıttaki tarih (planlanan gün, vade, teslim…) — teslim tarihinin varsayılanı. */
  defaultDeadline?: string;
  /** Bu kayıttan daha önce üretilmiş görev sayısı. */
  existingCount: number;
  onClose: () => void;
  onCreated: () => void;
}

/**
 * Modül kaydını göreve dönüştürme.
 *
 * "Modüller birbirini besliyor" ilkesinin çekirdeğe uzanan hali: sosyal medya
 * planı, tedarik talebi ya da kalite uygunsuzluğu girildiğinde iş orada
 * bitmiyor — birinin onu yapması gerekiyor. Bu köprü olmadan kullanıcı aynı
 * cümleyi bir de departman görevlerine elle yazıyordu.
 *
 * Görev departmanın görev listesine düşer ve kaynağını taşır (source_record_id),
 * böylece modül panelinde "bu kayıttan görev üretildi" görünür.
 */
export default function TaskFromRecordModal({
  departmentId: varsayilanDepartman,
  organizationId,
  moduleKey,
  moduleTitle,
  recordId,
  defaultTitle,
  defaultDeadline,
  existingCount,
  onClose,
  onCreated,
}: Props) {
  const c = useThemeColors();
  const t = useT();
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState("");
  // Çoklu atama (bkz. migration 053).
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  // Kayıtta tarih varsa onu kullan; yoksa bugün. Boş bırakılan teslim tarihi
  // görevi "ne zaman" sorusu olmayan bir nota çevirirdi.
  const [deadline, setDeadline] = useState(defaultDeadline || todayISO());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [departmanlar, setDepartmanlar] = useState<Department[]>([]);
  const [departmentId, setDepartmentId] = useState(varsayilanDepartman ?? "");
  const [ustGorevler, setUstGorevler] = useState<Task[]>([]);
  const [ustGorevId, setUstGorevId] = useState("");

  useEffect(() => {
    if (!organizationId) return;
    api
      .get<Department[]>(`/organizations/${organizationId}/departments`)
      .then((d) => {
        setDepartmanlar(d);
        setDepartmentId((mevcut) => mevcut || d[0]?.id || "");
      })
      .catch(() => setDepartmanlar([]));
  }, [organizationId]);

  // Alt görev seçenekleri: seçilen departmanın tamamlanmamış ana görevleri.
  useEffect(() => {
    setUstGorevId("");
    // Başka ekibin kişisi yeni departmanın görevine atanamaz.
    setAssigneeIds([]);
    if (!departmentId) return setUstGorevler([]);
    api
      .get<Task[]>(`/departments/${departmentId}/tasks`)
      .then((g) => setUstGorevler(g.filter((x) => !x.parentTaskId && x.status !== "completed").slice(0, 200)))
      .catch(() => setUstGorevler([]));
  }, [departmentId]);

  const save = async () => {
    if (!title.trim()) {
      setError(t("Görev başlığı gerekli"));
      return;
    }
    if (!departmentId) {
      setError(t("Departman seç"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.post<Task>(`/departments/${departmentId}/tasks`, {
        title: title.trim(),
        // Veritabanına yazılan metin: kaydın kendi dilinde kalır, çevrilmez.
        description: description.trim() || `${moduleTitle} kaydından oluşturuldu.`, // dil:atla
        deadline,
        assignedToIds: assigneeIds,
        sourceModuleKey: moduleKey,
        sourceRecordId: recordId,
        ...(ustGorevId ? { parentTaskId: ustGorevId } : {}),
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Görev oluşturulamadı"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={t("Göreve dönüştür")} onClose={onClose} maxWidth={520} mobileFullScreen>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {existingCount > 0 && (
          // Aynı kayıttan ikinci görev açmak yasak değil (bir plan birden fazla
          // kişiye bölünebilir) ama kullanıcı bilmeli.
          <div style={{ fontSize: 12, color: c.textSecondary, background: c.background, borderRadius: 8, padding: "8px 10px" }}>
            {t("Bu kayıttan daha önce {n} görev oluşturulmuş.", { n: existingCount })}
          </div>
        )}

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12, color: c.textSecondary }}>{t("Görev başlığı")}</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: "100%" }} />
        </label>

        {departmanlar.length > 1 && (
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, color: c.textSecondary }}>{t("Departman")}</span>
            <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} style={{ width: "100%" }}>
              {departmanlar.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {ustGorevler.length > 0 && (
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, color: c.textSecondary }}>{t("Alt görev olarak ekle (isteğe bağlı)")}</span>
            <select value={ustGorevId} onChange={(e) => setUstGorevId(e.target.value)} style={{ width: "100%" }}>
              <option value="">{t("Hayır — ayrı görev")}</option>
              {ustGorevler.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          </label>
        )}

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12, color: c.textSecondary }}>{t("Açıklama")}</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder={t("{modul} kaydından oluşturuldu.", { modul: moduleTitle })}
            style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12, color: c.textSecondary }}>{t("Kime")}</span>
          <AssigneePicker
            // Departman değişince kişi listesi o ekibe göre yenilenir.
            key={departmentId}
            departmentId={departmentId}
            multiple
            values={assigneeIds}
            onChangeValues={setAssigneeIds}
            value=""
            onChange={() => {}}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12, color: c.textSecondary }}>{t("Teslim tarihi")}</span>
          <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} style={{ width: "100%" }} />
        </label>

        {error && <p style={{ color: c.danger, fontSize: 13, margin: 0 }}>{error}</p>}

        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button
            data-primary
            onClick={save}
            disabled={saving}
            style={{
              flex: 1,
              padding: "8px 0",
              borderRadius: 8,
              border: "none",
              background: c.primary,
              color: c.onPrimary,
              fontSize: 14,
            }}
          >
            {saving ? t("Oluşturuluyor…") : t("Görevi oluştur")}
          </button>
          <button onClick={onClose} disabled={saving} style={{ padding: "8px 16px", fontSize: 14 }}>
            {t("Vazgeç")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
