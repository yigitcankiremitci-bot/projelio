import { useState } from "react";
import type { PlanFocusArea, PlanTimeBlock } from "@projelio/shared";
import Modal from "../Modal";
import { useThemeColors } from "../../theme/useThemeColors";
import { planning, type PlanBlockInput } from "../../api/planning";
import { formatDuration, timeToMinutes } from "../../lib/planGrid";
import { inputStyle, labelStyle, primaryButton, secondaryButton } from "./PlanTargetsModal";
import { useT } from "../../lib/i18n";

interface Props {
  /** Var olan blok düzenleniyorsa dolu; yeni blokta boş. */
  block?: PlanTimeBlock;
  /** Yeni blok için ön doldurulmuş değerler (grid'de çift tıklanan saat). */
  draft?: { blockDate: string; startsAt: string; endsAt: string };
  focusAreas: PlanFocusArea[];
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Zaman bloğu ekleme/düzenleme.
 *
 * Bir bloğu SİLMEK, bağlı olduğu görevi silmez — blok görevin kendisi değil,
 * ona ayrılan zamandır. Modal bunu kullanıcıya açıkça söylüyor: takvimden bir
 * kutuyu kaldırırken "işim de gitti mi?" diye tereddüt etmemeli.
 */
export default function PlanBlockModal({ block, draft, focusAreas, onClose, onSaved }: Props) {
  const c = useThemeColors();
  const t = useT();
  const editing = Boolean(block);

  const [blockDate, setBlockDate] = useState(block?.blockDate ?? draft?.blockDate ?? "");
  const [startsAt, setStartsAt] = useState(block?.startsAt ?? draft?.startsAt ?? "09:00");
  const [endsAt, setEndsAt] = useState(block?.endsAt ?? draft?.endsAt ?? "10:30");
  const [title, setTitle] = useState(block?.title ?? "");
  const [note, setNote] = useState(block?.note ?? "");
  const [focusAreaId, setFocusAreaId] = useState(block?.focusAreaId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const minutes = timeToMinutes(endsAt) - timeToMinutes(startsAt);

  const save = async () => {
    if (minutes <= 0) {
      setError(t("Bitiş saati başlangıçtan sonra olmalı."));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: PlanBlockInput = {
        blockDate,
        startsAt,
        endsAt,
        title: title.trim() || undefined,
        note: note.trim() || undefined,
        focusAreaId: focusAreaId || null,
      };
      if (block) {
        await planning.updateBlock(block.id, payload);
      } else {
        // Elle açılan blok "manual": Lio'nun önerileriyle karışmasın, "önerileri
        // temizle" dendiğinde kullanıcının kendi koyduğu bloklar silinmesin.
        await planning.createBlock({ ...payload, source: "manual" });
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(String(err?.message ?? "Blok kaydedilemedi."));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!block) return;
    setSaving(true);
    try {
      await planning.deleteBlock(block.id);
      onSaved();
      onClose();
    } catch (err: any) {
      setError(String(err?.message ?? "Blok silinemedi."));
      setSaving(false);
    }
  };

  return (
    <Modal title={editing ? "Zaman bloğu" : "Yeni zaman bloğu"} onClose={onClose} maxWidth={440}>
      {block?.linkedTitle && (
        <div
          style={{
            fontSize: 13,
            color: c.textSecondary,
            background: c.background,
            border: `1px solid ${c.border}`,
            borderRadius: 8,
            padding: "8px 10px",
            marginBottom: 14,
          }}
        >
          {t("Bağlı iş:")} <strong style={{ color: c.textPrimary, fontWeight: 500 }}>{block.linkedTitle}</strong>
        </div>
      )}

      <label style={labelStyle(c)}>{t("Başlık")}</label>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={block?.linkedTitle ?? "Ne üzerinde çalışacaksın?"}
        style={inputStyle(c)}
      />

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <div style={{ flex: 1.4 }}>
          <label style={labelStyle(c)}>{t("Tarih")}</label>
          <input type="date" value={blockDate} onChange={(e) => setBlockDate(e.target.value)} style={inputStyle(c)} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle(c)}>{t("Başlangıç")}</label>
          <input type="time" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} style={inputStyle(c)} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle(c)}>{t("Bitiş")}</label>
          <input type="time" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} style={inputStyle(c)} />
        </div>
      </div>
      <div style={{ fontSize: 12, color: minutes > 0 ? c.textSecondary : c.danger, marginTop: 4 }}>
        {minutes > 0 ? formatDuration(minutes) : "Bitiş saati başlangıçtan sonra olmalı"}
      </div>

      <label style={{ ...labelStyle(c), marginTop: 14 }}>{t("Odak alanı")}</label>
      <select value={focusAreaId} onChange={(e) => setFocusAreaId(e.target.value)} style={inputStyle(c)}>
        <option value="">{t("— seçilmedi —")}</option>
        {focusAreas.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <div style={{ fontSize: 12, color: c.textSecondary, marginTop: 4 }}>
        {t("Odak alanı seçilmeyen bloklar dağılım raporunda \"plan dışı\" görünür.")}
      </div>

      <label style={{ ...labelStyle(c), marginTop: 14 }}>{t("Not")}</label>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        style={{ ...inputStyle(c), resize: "vertical" }}
      />

      {error && <p style={{ color: c.danger, fontSize: 13, margin: "12px 0 0" }}>{error}</p>}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 18 }}>
        {editing && (
          <button onClick={remove} disabled={saving} style={{ ...secondaryButton(c), color: c.danger, marginRight: "auto" }}>
            {t("Bloğu sil")}
          </button>
        )}
        <div style={{ display: "flex", gap: 8, marginLeft: editing ? 0 : "auto" }}>
          <button onClick={onClose} style={secondaryButton(c)}>
            {t("Vazgeç")}
          </button>
          <button onClick={save} disabled={saving} style={primaryButton(c, saving)}>
            data-primary
            {saving ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </div>
      </div>

      {editing && (
        <p style={{ fontSize: 12, color: c.textSecondary, margin: "12px 0 0", lineHeight: 1.5 }}>
          Bloğu silmek bağlı olduğu işi silmez; yalnızca o işe ayırdığın zamanı takvimden kaldırır.
        </p>
      )}
    </Modal>
  );
}
