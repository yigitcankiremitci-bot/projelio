import { useEffect, useState } from "react";
import type { ModuleRecord } from "@projelio/shared";
import { api } from "../api/client";
import { colors } from "../theme/colors";
import type { ModuleRecordConfig } from "../lib/moduleRecordConfigs";
import { IconTrash } from "./icons";

interface Props {
  organizationId: string;
  departmentId?: string;
  moduleKey: string;
  config: ModuleRecordConfig;
}

function defaultForm(config: ModuleRecordConfig): Record<string, string> {
  const f: Record<string, string> = {};
  for (const field of config.fields) f[field.key] = field.defaultValue ?? "";
  return f;
}

// Tam özellikli hale getirilen bir modülün (Gelir-Gider, Fatura, Müşteri, İşe
// Alım…) veri girişi + liste ekranı. moduleRecordConfigs.ts'teki alan
// tanımından form ve özet satırlarını üretir — yeni bir modül tam özellikli
// yapılmak istendiğinde buraya dokunmadan sadece o dosyaya bir tanım eklenir.
export default function ModuleRecordsPanel({ organizationId, departmentId, moduleKey, config }: Props) {
  const c = colors.light;
  const [records, setRecords] = useState<ModuleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<Record<string, string>>(() => defaultForm(config));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    api
      .get<ModuleRecord[]>(`/organizations/${organizationId}/module-records?moduleKey=${encodeURIComponent(moduleKey)}`)
      .then(setRecords)
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, [organizationId, moduleKey]);

  const resetForm = () => setForm(defaultForm(config));

  const handleSave = async () => {
    setError("");
    for (const field of config.fields) {
      if (field.required && !form[field.key]?.trim()) {
        setError(`${field.label} gerekli`);
        return;
      }
    }
    setSaving(true);
    try {
      const data: Record<string, unknown> = {};
      for (const field of config.fields) {
        const v = form[field.key];
        if (v === undefined || v === "") continue;
        data[field.key] = field.type === "number" ? Number(v) : v;
      }
      await api.post(`/organizations/${organizationId}/module-records`, { departmentId, moduleKey, data });
      resetForm();
      setAdding(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await api.delete(`/module-records/${id}`).catch(() => {});
    load();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h5 style={{ fontSize: 14, fontWeight: 500, color: c.textPrimary, margin: 0 }}>{config.title}</h5>
        <button
          onClick={() => {
            setAdding((v) => !v);
            resetForm();
            setError("");
          }}
          style={{ fontSize: 13, color: c.primary, background: "transparent", border: "none" }}
        >
          {adding ? "Vazgeç" : `+ ${config.addLabel}`}
        </button>
      </div>

      {!loading && config.computeStats && records.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {config.computeStats(records).map((stat) => (
            <div
              key={stat.label}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 2,
                padding: "6px 12px",
                borderRadius: 8,
                background: c.background,
                border: `1px solid ${c.border}`,
                minWidth: 92,
              }}
            >
              <span style={{ fontSize: 11, color: c.textSecondary }}>{stat.label}</span>
              <span style={{ fontSize: 15, fontWeight: 500, color: c.textPrimary }}>{stat.value}</span>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, background: c.background, borderRadius: 10, padding: 10 }}>
          {config.fields.map((field) => (
            <div key={field.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 12, color: c.textSecondary }}>
                {field.label}
                {field.required ? " *" : ""}
              </label>
              {field.type === "select" ? (
                <select
                  value={form[field.key] ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                  style={{ width: "100%" }}
                >
                  {field.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : field.type === "textarea" ? (
                <textarea
                  value={form[field.key] ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  rows={2}
                  style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
                />
              ) : (
                <input
                  type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                  value={form[field.key] ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  style={{ width: "100%" }}
                />
              )}
            </div>
          ))}
          {error && <p style={{ color: c.danger, fontSize: 13, margin: 0 }}>{error}</p>}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ padding: "8px 0", borderRadius: 8, border: "none", background: c.primary, color: "#fff", fontSize: 14 }}
          >
            {saving ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </div>
      )}

      {loading ? (
        <p style={{ fontSize: 13, color: c.textSecondary, margin: 0 }}>Yükleniyor…</p>
      ) : records.length === 0 ? (
        <p style={{ fontSize: 13, color: c.textSecondary, margin: 0 }}>{config.emptyLabel}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {records.map((r) => {
            const detail = config.detail?.(r.data);
            return (
              <div
                key={r.id}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, background: c.background }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: c.textPrimary }}>{config.summary(r.data)}</div>
                  {detail && <div style={{ fontSize: 12, color: c.textSecondary, marginTop: 2 }}>{detail}</div>}
                </div>
                <button onClick={() => handleDelete(r.id)} aria-label="Kaydı sil" style={{ background: "transparent", border: "none" }}>
                  <IconTrash size={14} color={c.textSecondary} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
