import { useState } from "react";
import type { Department, ModuleRecord } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import { MODULE_RECORD_CONFIGS } from "../lib/moduleRecordConfigs";
import { emptyForm, formFromRecord, formToData } from "../lib/moduleRecordForm";
import { hasDynamicFields, useModuleReferences } from "../lib/moduleReferences";
import ModuleFieldInput from "./ModuleFieldInput";
import Modal from "./Modal";
import { useT } from "../lib/i18n";

interface Props {
  organizationId: string;
  moduleKey: string;
  /** Departman seçici için — verilirse kullanıcı isteğe bağlı bir departman işaretleyebilir. */
  departments?: Department[];
  /**
   * Verilirse modal DÜZENLEME moduna geçer: alanlar kaydın kendi değerleriyle
   * dolu açılır ve kaydetmek yeni kayıt açmak yerine mevcudu günceller.
   */
  record?: ModuleRecord;
  /**
   * Bazı alanları önceden doldurup formdan tamamen gizler — örn. Bütçe
   * sekmesindeki "Gelir ekle" hızlı seçeneği `{ type: "income" }` geçirir,
   * kullanıcı tekrar "Tür" seçmek zorunda kalmaz (bkz. OrgBudgetPanel).
   * Düzenlemede yok sayılır: var olan bir kaydın türünü gizlemek, kullanıcıyı
   * yanlış girdiği türü düzeltemez halde bırakırdı.
   */
  presetData?: Record<string, string>;
  /** Modal başlığını config.addLabel yerine bununla değiştirir (örn. "Gelir ekle"). */
  titleOverride?: string;
  onClose: () => void;
  onSaved: (saved: ModuleRecord) => void;
}

/**
 * Anasayfadaki birleşik "+" menüsünden "İşe al" / "Gelir/gider ekle" gibi tam
 * özellikli modül kayıtlarını (bkz. moduleRecordConfigs.ts) tek adımda, bir
 * modal içinde oluşturmayı sağlar — ModuleRecordsPanel'in satır içi formuyla
 * aynı alan tanımlarını ve aynı form kontrollerini (ModuleFieldInput) kullanır,
 * sadece ayrı bir modül ekranına gitmeden doğrudan Anasayfa'da açılır.
 */
export default function AddModuleRecordModal({
  organizationId,
  moduleKey,
  departments,
  record,
  presetData,
  titleOverride,
  onClose,
  onSaved,
}: Props) {
  const c = useThemeColors();
  const t = useT();
  const config = MODULE_RECORD_CONFIGS[moduleKey];
  const [departmentId, setDepartmentId] = useState("");
  const [form, setForm] = useState<Record<string, string>>(() => {
    if (record) return formFromRecord(config.fields, record);
    const f = emptyForm(config.fields);
    for (const field of config.fields) {
      if (presetData?.[field.key] !== undefined) f[field.key] = presetData[field.key];
    }
    return f;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Referans alanı (müşteri/tedarikçi) olmayan modülde iki gereksiz istek atılmaz.
  const references = useModuleReferences({ organizationId }, hasDynamicFields(config));

  if (!config) return null;

  // Önceden doldurulmuş alanlar forma hiç çizilmez — kullanıcı yalnızca geri
  // kalanları görür (bkz. presetData üstündeki not).
  const visibleFields = record ? config.fields : config.fields.filter((field) => presetData?.[field.key] === undefined);
  const kaydetLabel = record ? t("Değişikliği kaydet") : titleOverride ?? config.addLabel;

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
      const data = formToData(config.fields, form);
      const saved = record
        ? await api.patch<ModuleRecord>(`/module-records/${record.id}`, { data })
        : await api.post<ModuleRecord>(`/organizations/${organizationId}/module-records`, {
            departmentId: departmentId || undefined,
            moduleKey,
            data,
          });
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kaydedilemedi");
      setSaving(false);
    }
  };

  return (
    <Modal title={record ? t("{modul} — düzenle", { modul: t(config.title) }) : titleOverride ?? config.addLabel} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Kaydın departmanı yalnızca açılırken seçilir: PATCH ucu yalnızca
            `data` alanını günceller, kaydı başka departmana taşımaz. */}
        {!record && departments && departments.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 15, color: c.textSecondary }}>Departman (opsiyonel)</label>
            <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} style={{ width: "100%" }}>
              <option value="">{t("Genel")}</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {visibleFields.map((field) => (
          <div key={field.key} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 15, color: c.textSecondary }}>
              {t(field.label)}
              {field.required ? " *" : ""}
            </label>
            <ModuleFieldInput
              field={field}
              form={form}
              setValue={(key, value) => setForm((f) => ({ ...f, [key]: value }))}
              references={references}
              createPartyPath={`/organizations/${organizationId}/party`}
            />
          </div>
        ))}

        {error && <p style={{ color: c.danger, fontSize: 15, margin: 0 }}>{error}</p>}

        <button
          data-primary
          onClick={handleSave}
          disabled={saving}
          style={{
            marginTop: 4,
            background: c.primary,
            color: c.onPrimary,
            padding: "11px 0",
            borderRadius: 8,
            border: "none",
            fontSize: 17,
            fontWeight: 500,
          }}
        >
          {saving ? "Kaydediliyor…" : kaydetLabel}
        </button>
      </div>
    </Modal>
  );
}
