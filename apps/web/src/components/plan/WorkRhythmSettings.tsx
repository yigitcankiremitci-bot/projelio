import { useEffect, useMemo, useState } from "react";
import type { PlanPreferences, ThemeColors } from "@projelio/shared";
import { useThemeColors } from "../../theme/useThemeColors";
import { planning } from "../../api/planning";
import { useT } from "../../lib/i18n";

/** 0 = Pazar … 6 = Cumartesi (JS getDay() ile aynı ölçek, sunucu da öyle bekliyor). */
const DAYS: { value: number; label: string }[] = [
  { value: 1, label: "Pzt" },
  { value: 2, label: "Sal" },
  { value: 3, label: "Çar" },
  { value: 4, label: "Per" },
  { value: 5, label: "Cum" },
  { value: 6, label: "Cmt" },
  { value: 0, label: "Paz" },
];

/**
 * Çalışma ritmi ayarları — takvimin ve Lio'nun dağıtım yaparken kullandığı çerçeve.
 *
 * Buradaki her alan somut bir davranışı belirliyor, dekoratif hiçbir şey yok:
 *   çalışma günleri + mesai   → takvim gridinin çizildiği aralık, dağıtımın yerleşeceği yer
 *   günlük hedef              → dönemin kapasitesi, yani "%60" ifadesinin paydası
 *   blok uzunluğu + mola      → otomatik dağıtımın ürettiği blokların boyu
 *   ritüel zamanlaması        → sihirbazın hangi gün karşılayacağı
 *
 * Kaydetme "kirli" alan olmadıkça kapalı: kullanıcı yanlışlıkla açtığı ayar
 * sayfasından çıkarken bir şeyi değiştirdiğinden şüphe etmesin.
 */
export default function WorkRhythmSettings() {
  const c = useThemeColors();
  const t = useT();
  const [saved, setSaved] = useState<PlanPreferences | null>(null);
  const [draft, setDraft] = useState<PlanPreferences | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    planning
      .getPreferences()
      .then((p) => {
        setSaved(p);
        setDraft(p);
      })
      .catch(() => setError("Çalışma ritmi ayarları yüklenemedi."));
  }, []);

  const dirty = useMemo(
    () => Boolean(saved && draft) && JSON.stringify(saved) !== JSON.stringify(draft),
    [saved, draft]
  );

  const patch = (changes: Partial<PlanPreferences>) => {
    setDraft((prev) => (prev ? { ...prev, ...changes } : prev));
    setJustSaved(false);
  };

  const toggleDay = (day: number) => {
    if (!draft) return;
    const next = draft.workdays.includes(day)
      ? draft.workdays.filter((d) => d !== day)
      : [...draft.workdays, day].sort((a, b) => a - b);
    // Sunucu en az bir çalışma günü istiyor; kullanıcıyı hata mesajıyla
    // karşılamak yerine son günün kapatılmasına burada izin vermiyoruz.
    if (next.length === 0) return;
    patch({ workdays: next });
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await planning.updatePreferences(draft);
      setSaved(updated);
      setDraft(updated);
      setJustSaved(true);
    } catch (err: any) {
      setError(String(err?.message ?? "Ayarlar kaydedilemedi."));
    } finally {
      setSaving(false);
    }
  };

  if (!draft) {
    return (
      <div style={cardStyle(c)}>
        <p style={{ margin: 0, fontSize: 14, color: c.textSecondary }}>
          {error ?? "Yükleniyor…"}
        </p>
      </div>
    );
  }

  return (
    <div style={cardStyle(c)}>
      <Field
        label={t("Çalışma günleri")}
        hint={t("Takvimde plan yalnızca bu günlere dağıtılır; diğerleri soluk görünür.")}
      >
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {DAYS.map((d) => {
            const active = draft.workdays.includes(d.value);
            return (
              <button
                key={d.value}
                onClick={() => toggleDay(d.value)}
                aria-pressed={active}
                style={{
                  padding: "7px 11px",
                  fontSize: 13,
                  borderRadius: 8,
                  border: `1.5px solid ${active ? c.primary : c.border}`,
                  background: active ? c.primary : "transparent",
                  color: active ? "#fff" : c.textSecondary,
                  cursor: "pointer",
                }}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Mesai saatleri" hint={t("Takvim gridi bu aralıkta çizilir. Dışına taşan bloklar yine görünür.")}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="time"
            value={draft.dayStart}
            onChange={(e) => patch({ dayStart: e.target.value })}
            style={inputStyle(c)}
          />
          <span style={{ color: c.textSecondary, fontSize: 14 }}>–</span>
          <input
            type="time"
            value={draft.dayEnd}
            onChange={(e) => patch({ dayEnd: e.target.value })}
            style={inputStyle(c)}
          />
        </div>
      </Field>

      <Field
        label={t("Günlük çalışma hedefi")}
        hint={t("Dönem kapasitesi bundan hesaplanır — yüzdelerin paydası budur.")}
      >
        <NumberInput
          value={draft.dailyTargetMinutes / 60}
          onChange={(v) => patch({ dailyTargetMinutes: Math.round(v * 60) })}
          suffix="saat"
          step={0.5}
          min={0.5}
          max={24}
        />
      </Field>

      <Field
        label={t("Odak bloğu ve mola")}
        hint={t("Otomatik dağıtımın ürettiği blokların boyu ve aralarındaki boşluk.")}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <NumberInput
            value={draft.focusBlockMinutes}
            onChange={(v) => patch({ focusBlockMinutes: Math.round(v) })}
            suffix="dk blok"
            step={15}
            min={15}
            max={480}
          />
          <NumberInput
            value={draft.breakMinutes}
            onChange={(v) => patch({ breakMinutes: Math.round(v) })}
            suffix="dk mola"
            step={5}
            min={0}
            max={240}
          />
        </div>
      </Field>

      <div style={{ borderTop: `1px solid ${c.border}`, margin: "18px 0" }} />

      <Field
        label={t("Planlama sihirbazı")}
        hint={t("Lio dönem başlarında seni karşılayıp planı birlikte kurar.")}
      >
        <label style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={draft.ritualsEnabled}
            onChange={(e) => patch({ ritualsEnabled: e.target.checked })}
            style={{ width: 17, height: 17 }}
          />
          <span style={{ fontSize: 14, color: c.textPrimary }}>
            {draft.ritualsEnabled ? "Açık" : "Kapalı"}
          </span>
        </label>
      </Field>

      {draft.ritualsEnabled && (
        <>
          <Field label={t("Haftalık planlama günü")} hint={t("Bu güne gelince haftalık sihirbaz seni karşılar.")}>
            <select
              value={draft.weeklyRitualWeekday}
              onChange={(e) => patch({ weeklyRitualWeekday: Number(e.target.value) })}
              style={{ ...inputStyle(c), width: 140 }}
            >
              {DAYS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t("Günlük plan saati")} hint={t("Gün başında kısa bir plan oturumu.")}>
            <input
              type="time"
              value={draft.dailyRitualTime}
              onChange={(e) => patch({ dailyRitualTime: e.target.value })}
              style={inputStyle(c)}
            />
          </Field>

          <Field
            label={t("Aylık planlama günü")}
            hint={t("Her ayda karşılığı olsun diye en fazla 28 seçilebilir.")}
          >
            <NumberInput
              value={draft.monthlyRitualDay}
              onChange={(v) => patch({ monthlyRitualDay: Math.round(v) })}
              suffix=". gün"
              step={1}
              min={1}
              max={28}
            />
          </Field>
        </>
      )}

      {error && <p style={{ color: c.danger, fontSize: 14, margin: "4px 0 0" }}>{error}</p>}
      {justSaved && !error && (
        <p style={{ color: c.success, fontSize: 14, margin: "4px 0 0" }}>{t("Çalışma ritmin güncellendi.")}</p>
      )}

      <button
        onClick={save}
        disabled={!dirty || saving}
        style={{
          marginTop: 14,
          padding: "9px 18px",
          fontSize: 15,
          fontWeight: 500,
          borderRadius: 8,
          border: "none",
          background: dirty ? c.primary : c.border,
          color: dirty ? "#fff" : c.textSecondary,
          cursor: dirty && !saving ? "pointer" : "default",
        }}
      >
        {saving ? "Kaydediliyor…" : "Kaydet"}
      </button>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  const c = useThemeColors();
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 15, color: c.textPrimary, marginBottom: 2 }}>{label}</div>
      <p style={{ fontSize: 12.5, color: c.textSecondary, margin: "0 0 9px", lineHeight: 1.4 }}>{hint}</p>
      {children}
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  suffix,
  step,
  min,
  max,
}: {
  value: number;
  onChange: (v: number) => void;
  suffix: string;
  step: number;
  min: number;
  max: number;
}) {
  const c = useThemeColors();
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={(e) => {
          const n = Number(e.target.value);
          // Boş ya da anlamsız girdide durumu bozmuyoruz; kullanıcı yazmayı
          // bitirdiğinde geçerli bir değer kalıyor.
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
        }}
        style={{ ...inputStyle(c), width: 78 }}
      />
      <span style={{ fontSize: 13, color: c.textSecondary }}>{suffix}</span>
    </span>
  );
}

type Palette = ThemeColors;

function cardStyle(c: Palette): React.CSSProperties {
  return {
    background: c.surface,
    border: `1px solid ${c.border}`,
    borderRadius: 12,
    padding: 16,
  };
}

function inputStyle(c: Palette): React.CSSProperties {
  return {
    padding: "7px 9px",
    fontSize: 14,
    borderRadius: 7,
    border: `1px solid ${c.border}`,
    background: c.surface,
    color: c.textPrimary,
  };
}
