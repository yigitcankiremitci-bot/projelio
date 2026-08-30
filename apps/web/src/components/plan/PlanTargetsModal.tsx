import { useMemo, useState } from "react";
import type { PlanFocusArea, PlanPeriod, PlanTarget, ThemeColors } from "@projelio/shared";
import Modal from "../Modal";
import { useThemeColors } from "../../theme/useThemeColors";
import { planning, type PlanTargetInput } from "../../api/planning";

interface Props {
  period: PlanPeriod;
  targets: PlanTarget[];
  focusAreas: PlanFocusArea[];
  onClose: () => void;
  onSaved: () => void;
}

interface Row {
  key: string;
  focusAreaId?: string;
  /** Listede olmayan yeni bir alan adı yazıldıysa burada tutulur. */
  newAreaName?: string;
  sharePct: string;
  targetCount: string;
  unit: string;
}

/**
 * Dönemin hedeflerini düzenleme. Kullanıcının "%60 yazılım, %30 müzik, ayrıca
 * 10 içerik" cümlesinin arayüzdeki karşılığı.
 *
 * Kaydetme, dönemin hedeflerini bütünüyle DEĞİŞTİRİR (bkz. planning.setTargets):
 * bu ekranda görünen liste ne ise dönemin hedefleri o olur. Satır satır
 * ekle/sil/güncelle uçları yerine tek bir "yerine koy" çağrısı tercih edildi —
 * kullanıcı burada üç satırı birden değiştirip tek seferde kaydediyor, ara
 * durumların sunucuya yazılması gereksiz.
 */
export default function PlanTargetsModal({ period, targets, focusAreas, onClose, onSaved }: Props) {
  const c = useThemeColors();

  const [theme, setTheme] = useState(period.theme ?? "");
  const [rows, setRows] = useState<Row[]>(() =>
    targets.length
      ? targets.map((t, i) => ({
          key: `t${i}`,
          focusAreaId: t.focusAreaId,
          newAreaName: t.focusAreaId ? undefined : t.title,
          sharePct: t.sharePct != null ? String(t.sharePct) : "",
          targetCount: t.targetCount != null ? String(t.targetCount) : "",
          unit: t.unit ?? "",
        }))
      : [emptyRow(0)]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = useMemo(
    () => rows.reduce((sum, r) => sum + (Number(r.sharePct.replace(",", ".")) || 0), 0),
    [rows]
  );

  const update = (key: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      // Adı yazılıp listede bulunmayan alanlar önce oluşturulur; sunucu
      // hedefleri yalnızca var olan bir alan id'siyle kabul ediyor.
      const payload: PlanTargetInput[] = [];
      for (const row of rows) {
        const share = Number(row.sharePct.replace(",", ".")) || undefined;
        const count = Number(row.targetCount) || undefined;
        if (!row.focusAreaId && !row.newAreaName?.trim()) continue;
        if (share == null && count == null) continue;

        let focusAreaId = row.focusAreaId;
        if (!focusAreaId && row.newAreaName?.trim()) {
          const created = await planning.createFocusArea({ name: row.newAreaName.trim() });
          focusAreaId = created.id;
        }
        payload.push({
          focusAreaId,
          sharePct: share,
          targetCount: count,
          unit: row.unit.trim() || undefined,
        });
      }

      await planning.setTargets(period.id, payload);
      if ((period.theme ?? "") !== theme.trim()) {
        await planning.updatePeriod(period.id, { theme: theme.trim() || null, status: "active" });
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(String(err?.message ?? "Hedefler kaydedilemedi."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Dönem hedefleri" onClose={onClose} maxWidth={560}>
      <label style={labelStyle(c)}>Bu dönemin niyeti</label>
      <input
        value={theme}
        onChange={(e) => setTheme(e.target.value)}
        placeholder="Tek cümle: bu dönem ağırlığı neye vereceksin?"
        style={inputStyle(c)}
      />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "18px 0 8px" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: c.textPrimary }}>Odak alanları</span>
        <span style={{ fontSize: 12, color: total > 100 ? c.danger : c.textSecondary }}>
          toplam %{Math.round(total)}
          {total > 100 ? " — dönemde olmayan bir zamanı bölüştürüyorsun" : total < 100 ? ` · %${Math.round(100 - total)} esneklik payı` : ""}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((row) => (
          <div key={row.key} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <AreaPicker
              focusAreas={focusAreas}
              value={row.focusAreaId}
              customName={row.newAreaName}
              onChange={(focusAreaId, newAreaName) => update(row.key, { focusAreaId, newAreaName })}
            />
            <NumberField
              value={row.sharePct}
              onChange={(v) => update(row.key, { sharePct: v })}
              suffix="%"
              width={68}
              placeholder="0"
            />
            <NumberField
              value={row.targetCount}
              onChange={(v) => update(row.key, { targetCount: v })}
              width={58}
              placeholder="adet"
            />
            <input
              value={row.unit}
              onChange={(e) => update(row.key, { unit: e.target.value })}
              placeholder="birim"
              style={{ ...inputStyle(c), width: 74, margin: 0 }}
            />
            <button
              onClick={() => setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== row.key) : prev))}
              aria-label="Satırı sil"
              style={{
                width: 28,
                height: 32,
                flexShrink: 0,
                borderRadius: 7,
                border: `1px solid ${c.border}`,
                background: c.surface,
                color: c.textSecondary,
                cursor: "pointer",
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={() => setRows((prev) => [...prev, emptyRow(prev.length)])}
        style={{
          marginTop: 10,
          padding: "6px 12px",
          fontSize: 13,
          borderRadius: 7,
          border: `1px dashed ${c.border}`,
          background: "transparent",
          color: c.textSecondary,
          cursor: "pointer",
        }}
      >
        + Alan ekle
      </button>

      <p style={{ fontSize: 12, color: c.textSecondary, lineHeight: 1.5, margin: "14px 0 0" }}>
        Yüzde, dönemin zamanını böler. Adet ise zamanla ölçülmeyen hedefler içindir — "10 içerik" gibi.
        İkisini aynı satırda birlikte kullanabilirsin.
      </p>

      {error && <p style={{ color: c.danger, fontSize: 13, margin: "12px 0 0" }}>{error}</p>}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
        <button onClick={onClose} style={secondaryButton(c)}>
          Vazgeç
        </button>
        <button onClick={save} disabled={saving} style={primaryButton(c, saving)}>
          data-primary
          {saving ? "Kaydediliyor…" : "Kaydet"}
        </button>
      </div>
    </Modal>
  );
}

function emptyRow(index: number): Row {
  return { key: `n${index}-${Date.now()}`, sharePct: "", targetCount: "", unit: "" };
}

/**
 * Var olan alanlardan seçtiren, ama listede olmayan bir ad da yazdıran alan
 * seçici. İki ayrı kontrol (seç / yeni ekle) koymak, kullanıcının ilk kullanımda
 * hiç alanı olmadığı için boş bir açılır listeye bakmasına yol açıyordu.
 */
function AreaPicker({
  focusAreas,
  value,
  customName,
  onChange,
}: {
  focusAreas: PlanFocusArea[];
  value?: string;
  customName?: string;
  onChange: (focusAreaId?: string, newAreaName?: string) => void;
}) {
  const c = useThemeColors();
  const listId = "plan-focus-areas";

  const text = value ? (focusAreas.find((a) => a.id === value)?.name ?? "") : (customName ?? "");

  return (
    <>
      <datalist id={listId}>
        {focusAreas.map((a) => (
          <option key={a.id} value={a.name} />
        ))}
      </datalist>
      <input
        list={listId}
        value={text}
        placeholder="Yazılım, Müzik…"
        onChange={(e) => {
          const typed = e.target.value;
          const match = focusAreas.find((a) => a.name.toLocaleLowerCase("tr") === typed.trim().toLocaleLowerCase("tr"));
          // Yazılan ad mevcut bir alanla eşleşirse o alanın id'si kullanılır;
          // eşleşmezse kaydederken yeni alan oluşturulur.
          if (match) onChange(match.id, undefined);
          else onChange(undefined, typed);
        }}
        style={{ ...inputStyle(c), flex: 1, minWidth: 0, margin: 0 }}
      />
    </>
  );
}

function NumberField({
  value,
  onChange,
  suffix,
  width,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  width: number;
  placeholder?: string;
}) {
  const c = useThemeColors();
  return (
    <div style={{ position: "relative", width, flexShrink: 0 }}>
      <input
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...inputStyle(c), width: "100%", margin: 0, paddingRight: suffix ? 20 : undefined }}
      />
      {suffix && (
        <span style={{ position: "absolute", right: 7, top: 8, fontSize: 12, color: c.textSecondary, pointerEvents: "none" }}>
          {suffix}
        </span>
      )}
    </div>
  );
}

// --------------------------------------------------------------- Ortak stiller

type Palette = ThemeColors;

export function labelStyle(c: Palette): React.CSSProperties {
  return { display: "block", fontSize: 13, color: c.textSecondary, marginBottom: 5 };
}

export function inputStyle(c: Palette): React.CSSProperties {
  return {
    width: "100%",
    boxSizing: "border-box",
    padding: "7px 9px",
    fontSize: 14,
    borderRadius: 7,
    border: `1px solid ${c.border}`,
    background: c.surface,
    color: c.textPrimary,
    marginBottom: 2,
  };
}

export function primaryButton(c: Palette, disabled?: boolean): React.CSSProperties {
  return {
    padding: "8px 16px",
    fontSize: 14,
    borderRadius: 8,
    border: "none",
    background: c.primary,
    color: c.onPrimary,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}

export function secondaryButton(c: Palette): React.CSSProperties {
  return {
    padding: "8px 16px",
    fontSize: 14,
    borderRadius: 8,
    border: `1px solid ${c.border}`,
    background: c.surface,
    color: c.textPrimary,
    cursor: "pointer",
  };
}
