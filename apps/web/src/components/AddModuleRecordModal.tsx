import { useState } from "react";
import type { Department } from "@projelio/shared";
import { api } from "../api/client";
import { colors } from "../theme/colors";
import { MODULE_RECORD_CONFIGS } from "../lib/moduleRecordConfigs";
import Modal from "./Modal";

interface Props {
  organizationId: string;
  moduleKey: string;
  /** Departman seçici için — verilirse kullanıcı isteğe bağlı bir departman işaretleyebilir. */
  departments?: Department[];
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Anasayfadaki birleşik "+" menüsünden "İşe al" / "Gelir/gider ekle" gibi tam
 * özellikli modül kayıtlarını (bkz. moduleRecordConfigs.ts) tek adımda, bir
 * modal içinde oluşturmayı sağlar — ModuleRecordsPanel'in satır içi formuyla
 * aynı alan tanımlarını kullanır, sadece ayrı bir modül ekranına gitmeden
 * doğrudan Anasayfa'da açılır.
 */
export default function AddModuleRecordModal({ organizationId, moduleKey, departments, onClose, onSaved }: Props) {
  const c = colors.light;
  const config = MODULE_RECORD_CONFIGS[moduleKey];
  const [departmentId, setDepartmentId] = useState("");
  const [form, setForm] = useState<Record<string, string>>(() => {
    const f: Record<string, string> = {};
    for (const field of config.fields) f[field.key] = field.defaultValue ?? "";
    return f;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!config) return null;

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
      await api.post(`/organizations/${organizationId}/module-records`, {
        departmentId: departmentId || undefined,
        moduleKey,
        data,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kaydedilemedi");
      setSaving(false);
    }
  };

  return (
    <Modal title={config.addLabel} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {departments && departments.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 15, color: c.textSecondary }}>Departman (opsiyonel)</label>
            <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} style={{ width: "100%" }}>
              <option value="">Genel</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {config.fields.map((field) => (
          <div key={field.key} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 15, color: c.textSecondary }}>
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
                rows={3}
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

        {error && <p style={{ color: c.danger, fontSize: 15, margin: 0 }}>{error}</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            marginTop: 4,
            background: c.primary,
            color: "#fff",
            padding: "11px 0",
            borderRadius: 8,
            border: "none",
            fontSize: 17,
            fontWeight: 500,
          }}
        >
          {saving ? "Kaydediliyor…" : config.addLabel}
        </button>
      </div>
    </Modal>
  );
}
