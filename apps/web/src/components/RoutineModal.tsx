import { useEffect, useMemo, useState } from "react";
import type { OperationRoutine, RoutineFreq } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import { useUndo } from "../lib/undo";
import Modal from "./Modal";

interface Props {
  operationId: string;
  routine?: OperationRoutine;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}

const freqOptions: { value: RoutineFreq; label: string; unit: string }[] = [
  { value: "daily", label: "Günlük", unit: "günde bir" },
  { value: "weekly", label: "Haftalık", unit: "haftada bir" },
  { value: "monthly", label: "Aylık", unit: "ayda bir" },
  { value: "yearly", label: "Yıllık", unit: "yılda bir" },
];

// Veritabanı 0=Pazar kabul ediyor; kullanıcıya haftayı pazartesiden başlatarak gösteriyoruz.
const weekdays = [
  { value: 1, label: "Pzt" },
  { value: 2, label: "Sal" },
  { value: 3, label: "Çar" },
  { value: 4, label: "Per" },
  { value: 5, label: "Cum" },
  { value: 6, label: "Cmt" },
  { value: 0, label: "Paz" },
];

const setPosOptions = [
  { value: 1, label: "1." },
  { value: 2, label: "2." },
  { value: 3, label: "3." },
  { value: 4, label: "4." },
  { value: -1, label: "Son" },
];

type MonthlyMode = "day-of-month" | "nth-weekday";

export default function RoutineModal({ operationId, routine, onClose, onSaved, onDeleted }: Props) {
  const c = useThemeColors();
  const editing = !!routine;

  const [title, setTitle] = useState(routine?.title ?? "");
  const [description, setDescription] = useState(routine?.description ?? "");
  const [freq, setFreq] = useState<RoutineFreq>(routine?.freq ?? "weekly");
  const [intervalN, setIntervalN] = useState(String(routine?.intervalN ?? 1));
  const [byWeekday, setByWeekday] = useState<number[]>(routine?.byWeekday ?? [1]);
  const [monthlyMode, setMonthlyMode] = useState<MonthlyMode>(
    routine?.bySetPos != null ? "nth-weekday" : "day-of-month"
  );
  const [monthDay, setMonthDay] = useState(String(routine?.byMonthDay?.[0] ?? 1));
  const [bySetPos, setBySetPos] = useState(routine?.bySetPos ?? 1);
  const [nthWeekday, setNthWeekday] = useState(routine?.byWeekday?.[0] ?? 1);
  const [startsOn, setStartsOn] = useState(routine?.startsOn?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [endsOn, setEndsOn] = useState(routine?.endsOn?.slice(0, 10) ?? "");
  const [dueTime, setDueTime] = useState(routine?.dueTime ?? "18:00");
  const [leadDays, setLeadDays] = useState(String(routine?.leadDays ?? 0));
  const [graceDays, setGraceDays] = useState(String(routine?.graceDays ?? 0));
  const [budget, setBudget] = useState(routine?.budget ? String(routine.budget) : "");
  const [active, setActive] = useState(routine?.active ?? true);

  const [preview, setPreview] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { pushDestructive } = useUndo();

  // Formdaki kuralı sunucunun anladığı biçime çevirir. Önizleme ve kaydetme
  // aynı gövdeyi kullanır ki gördüğün tarihler kaydedilenle birebir aynı olsun.
  const payload = useMemo(() => {
    const base: Partial<OperationRoutine> = {
      title,
      description: description || undefined,
      freq,
      intervalN: Math.max(1, Number(intervalN) || 1),
      startsOn,
      endsOn: endsOn || undefined,
      dueTime,
      leadDays: Math.max(0, Number(leadDays) || 0),
      graceDays: Math.max(0, Number(graceDays) || 0),
      budget: Number(budget) || 0,
      active,
      byWeekday: undefined,
      byMonthDay: undefined,
      bySetPos: undefined,
    };

    if (freq === "weekly") {
      base.byWeekday = byWeekday.length > 0 ? byWeekday : undefined;
    } else if (freq === "monthly") {
      if (monthlyMode === "nth-weekday") {
        base.byWeekday = [nthWeekday];
        base.bySetPos = bySetPos;
      } else {
        base.byMonthDay = [Number(monthDay) || 1];
      }
    }
    return base;
  }, [
    title, description, freq, intervalN, byWeekday, monthlyMode, monthDay,
    bySetPos, nthWeekday, startsOn, endsOn, dueTime, leadDays, graceDays, budget, active,
  ]);

  // Kural değiştikçe sıradaki tarihleri sunucudan çek: önizlemeyi de tekrarları da
  // üreten aynı SQL fonksiyonu olduğu için ikisi asla ayrışmaz.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .post<string[]>("/operations/routines/preview", payload)
        .then((dates) => {
          if (!cancelled) setPreview(dates ?? []);
        })
        .catch(() => {
          if (!cancelled) setPreview([]);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [payload]);

  const toggleWeekday = (value: number) => {
    setByWeekday((prev) => (prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value]));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (editing) await api.patch(`/routines/${routine!.id}`, payload);
      else await api.post(`/operations/${operationId}/routines`, payload);
      onSaved();
      onClose();
    } catch {
      setError("Rutin kaydedilemedi. Tekrar dene.");
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!routine) return;
    setLoading(true);
    try {
      // Silme birkaç saniye geciktirilir; bu pencerede Cmd/Ctrl+Z ile vazgeçilebilir.
      pushDestructive({
        label: "Rutin silme",
        commit: async () => {
          await api.delete(`/routines/${routine.id}`).catch(() => {});
        },
        restore: onSaved,
      });
      onDeleted?.();
      onSaved();
      onClose();
    } catch {
      setError("Rutin silinemedi.");
      setLoading(false);
    }
  };

  const label = { fontSize: 15, color: c.textSecondary };
  const chip = (selected: boolean) => ({
    padding: "6px 10px",
    borderRadius: 8,
    border: `1px solid ${selected ? c.primary : c.border}`,
    background: selected ? c.primary : "transparent",
    color: selected ? "#fff" : c.textPrimary,
    fontSize: 14,
    cursor: "pointer",
  });

  return (
    <Modal title={editing ? "Rutini düzenle" : "Yeni rutin"} onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={label}>Başlık</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Haftalık içerik planı" style={{ width: "100%" }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={label}>Açıklama</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Opsiyonel" style={{ width: "100%" }} />
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
            <label style={label}>Tekrar</label>
            <select value={freq} onChange={(e) => setFreq(e.target.value as RoutineFreq)} style={{ width: "100%" }}>
              {freqOptions.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, width: 110 }}>
            <label style={label}>Her</label>
            <input type="number" min={1} value={intervalN} onChange={(e) => setIntervalN(e.target.value)} style={{ width: "100%" }} />
          </div>
          <span style={{ fontSize: 14, color: c.textSecondary, paddingBottom: 10 }}>
            {freqOptions.find((f) => f.value === freq)?.unit}
          </span>
        </div>

        {freq === "weekly" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={label}>Hangi günler</label>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {weekdays.map((d) => (
                <button key={d.value} type="button" onClick={() => toggleWeekday(d.value)} style={chip(byWeekday.includes(d.value))}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {freq === "monthly" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={label}>Ayın hangi günü</label>
            <div style={{ display: "flex", gap: 5 }}>
              <button type="button" onClick={() => setMonthlyMode("day-of-month")} style={chip(monthlyMode === "day-of-month")}>
                Ayın X. günü
              </button>
              <button type="button" onClick={() => setMonthlyMode("nth-weekday")} style={chip(monthlyMode === "nth-weekday")}>
                Ayın X. haftasının Y günü
              </button>
            </div>

            {monthlyMode === "day-of-month" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <select value={monthDay} onChange={(e) => setMonthDay(e.target.value)} style={{ width: "100%" }}>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>{d}. gün</option>
                  ))}
                  <option value={-1}>Ayın son günü</option>
                </select>
                <span style={{ fontSize: 13, color: c.textSecondary }}>
                  29–31 arası günler o ayda yoksa atlanır. Her ayda çalışması için "Ayın son günü" seç.
                </span>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                <select value={bySetPos} onChange={(e) => setBySetPos(Number(e.target.value))} style={{ flex: 1 }}>
                  {setPosOptions.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                <select value={nthWeekday} onChange={(e) => setNthWeekday(Number(e.target.value))} style={{ flex: 2 }}>
                  {weekdays.map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
            <label style={label}>Başlangıç</label>
            <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} required style={{ width: "100%" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
            <label style={label}>Bitiş (boş = süresiz)</label>
            <input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} style={{ width: "100%" }} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
            <label style={label}>Saat</label>
            <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} style={{ width: "100%" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
            <label style={label}>Kaç gün önce açılsın</label>
            <input type="number" min={0} value={leadDays} onChange={(e) => setLeadDays(e.target.value)} style={{ width: "100%" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
            <label style={label}>Tolerans (gün)</label>
            <input type="number" min={0} value={graceDays} onChange={(e) => setGraceDays(e.target.value)} style={{ width: "100%" }} />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={label}>Tekrar başına ücret (₺)</label>
          <input type="number" min={0} value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="0" style={{ width: "100%" }} />
        </div>

        {editing && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, color: c.textPrimary }}>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Aktif — kapatırsan gelecekteki tekrarlar geri çekilir, geçmiş kalır
          </label>
        )}

        {/* Kaydetmeden önce kuralın gerçekten ne ürettiğini göster. */}
        <div style={{ border: `1px solid ${c.border}`, borderRadius: 10, padding: 12, background: c.background }}>
          <div style={{ fontSize: 13, color: c.textSecondary, marginBottom: 8 }}>Sıradaki tekrarlar</div>
          {preview.length === 0 ? (
            <div style={{ fontSize: 14, color: c.textSecondary }}>Bu kural hiçbir tarihe denk gelmiyor.</div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {preview.map((d) => (
                <span
                  key={d}
                  style={{
                    fontSize: 13,
                    padding: "4px 8px",
                    borderRadius: 6,
                    background: c.surface,
                    border: `1px solid ${c.border}`,
                    color: c.textPrimary,
                  }}
                >
                  {new Date(d).toLocaleDateString("tr-TR", { day: "numeric", month: "short", weekday: "short" })}
                </span>
              ))}
            </div>
          )}
        </div>

        {error && <p style={{ color: c.danger, fontSize: 16, margin: 0 }}>{error}</p>}

        <button
          type="submit"
          disabled={loading}
          style={{ marginTop: 4, background: c.primary, color: c.onPrimary, padding: "11px 0", borderRadius: 8, border: "none", fontSize: 17, fontWeight: 500 }}
        >
          {loading ? "Kaydediliyor…" : editing ? "Kaydet" : "Rutin oluştur"}
        </button>

        {editing && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading}
            style={{ background: "transparent", color: c.danger, padding: "8px 0", borderRadius: 8, border: `1px solid ${c.border}`, fontSize: 15 }}
          >
            Rutini sil
          </button>
        )}
      </form>
    </Modal>
  );
}
