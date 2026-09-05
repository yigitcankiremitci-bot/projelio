import { useEffect, useMemo, useState } from "react";
import type { ModuleRecord, ModuleRecordVersion, Product } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import {
  changedFields,
  missingForApproval,
  type ModuleFormConfig,
  type ModuleFormFieldConfig,
} from "../lib/moduleForms";
import { useModuleReferences } from "../lib/moduleReferences";
import ModuleFieldInput from "./ModuleFieldInput";
import { useT } from "../lib/i18n";

// A1 — Form / Doküman görünümü.
//
// A2'den (ModuleRecordsPanel) farkı liste olmamasıdır: kapsam başına TEK kayıt
// vardır. Bu yüzden "yeni" düğmesi, arama, sıralama ve toplu işlem yok; onların
// yerine taslak/onay ayrımı ve sürüm geçmişi var.
//
// Ekran üç kipte çalışır:
//   read     — yürürlükteki metin (modal açılınca gelen)
//   edit     — bölüm bölüm form; Kaydet taslağa yazar, Onayla yayımlar
//   versions — geçmiş sürümler, istenirse taslağa geri yükleme
//
// Bkz. docs/moduller/20-motor-a1-form.md

interface Props {
  organizationId?: string;
  departmentId?: string;
  jobId?: string;
  moduleKey: string;
  config: ModuleFormConfig;
  /** Taslak yazabilir mi. Sunucu kendi kontrolünü ayrıca yapar. */
  canWrite?: boolean;
  /** Yayımlayabilir mi (modül yöneticisi / organizasyon sahibi). */
  canApprove?: boolean;
}

type Mode = "read" | "edit" | "versions";

function emptyForm(fields: ModuleFormFieldConfig[]): Record<string, string> {
  const f: Record<string, string> = {};
  for (const field of fields) f[field.key] = field.defaultValue ?? "";
  return f;
}

function formFromData(
  fields: ModuleFormFieldConfig[],
  data: Record<string, unknown>
): Record<string, string> {
  const f: Record<string, string> = {};
  for (const field of fields) {
    const v = data[field.key];
    f[field.key] = v === undefined || v === null ? field.defaultValue ?? "" : String(v);
  }
  return f;
}

/** Ekranda gösterilecek değer: select etiketi, etiket listesi ya da ham metin. */
function displayValue(field: ModuleFormFieldConfig, data: Record<string, unknown>): string {
  const raw = data[field.key];
  if (raw === undefined || raw === null || String(raw).trim() === "") return "";
  if (field.type === "select" || field.type === "multiselect") {
    const values = String(raw).split(",").map((v) => v.trim()).filter(Boolean);
    const labels = values.map((v) => field.options?.find((o) => o.value === v)?.label ?? v);
    return labels.join(", ");
  }
  if (field.type === "tags") {
    return String(raw).split(",").map((v) => v.trim()).filter(Boolean).join(" · ");
  }
  return String(raw);
}

export default function ModuleFormPanel({
  organizationId,
  departmentId,
  jobId,
  moduleKey,
  config,
  canWrite = true,
  canApprove = false,
}: Props) {
  const c = useThemeColors();
  const t = useT();
  const basePath = jobId ? `/jobs/${jobId}/module-records` : `/organizations/${organizationId}/module-records`;

  const [records, setRecords] = useState<ModuleRecord[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [scopeRef, setScopeRef] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("read");
  const [form, setForm] = useState<Record<string, string>>(() => emptyForm(config.fields));
  const [versions, setVersions] = useState<ModuleRecordVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Referans alanları (user_ref) yalnızca gerekiyorsa yüklensin.
  const references = useModuleReferences(
    { organizationId, departmentId, jobId },
    config.fields.some((f) => f.type === "user_ref" || f.type === "entity_ref")
  );

  const load = () => {
    setLoading(true);
    const calls: [Promise<ModuleRecord[]>, Promise<Product[]>] = [
      api.get<ModuleRecord[]>(`${basePath}?moduleKey=${moduleKey}`).catch(() => []),
      config.scope === "entity" && organizationId
        ? api.get<Product[]>(`/organizations/${organizationId}/products`).catch(() => [])
        : Promise.resolve([]),
    ];
    Promise.all(calls)
      .then(([recs, prods]) => {
        setRecords(recs);
        setProducts(prods);
        // Varlık kapsamında ilk açılışta bir ürün seçili gelsin: strateji yazılmış
        // ilk ürün, yoksa listedeki ilk ürün.
        if (config.scope === "entity") {
          setScopeRef((current) => current ?? recs[0]?.scopeRef ?? prods[0]?.id ?? null);
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [basePath, moduleKey, config.scope]);

  // Kapsamdaki tek kayıt. Organizasyon kapsamında en yeni kayıt alınır: göç
  // öncesi dönemde aynı modülde birden çok satır oluşmuş olabilir (her
  // güncelleme yeni satır açıyordu) — en yenisi yürürlükteki metindir.
  const record = useMemo(() => {
    if (config.scope === "entity") return records.find((r) => r.scopeRef === scopeRef) ?? null;
    return records[0] ?? null;
  }, [records, scopeRef, config.scope]);

  const current = record?.data ?? {};
  const draft = record?.draftData ?? null;
  const pending = useMemo(() => changedFields(config, current, draft), [config, current, draft]);
  const missing = useMemo(() => missingForApproval(config, draft ?? current), [config, draft, current]);

  const startEdit = () => {
    setForm(record ? formFromData(config.fields, draft ?? current) : emptyForm(config.fields));
    setError(null);
    setMode("edit");
  };

  const applyTemplate = (key: string) => {
    const t = config.templates?.find((x) => x.key === key);
    if (!t) return;
    setForm((f) => {
      const next = { ...f };
      for (const [k, v] of Object.entries(t.data)) next[k] = v === undefined || v === null ? "" : String(v);
      return next;
    });
  };

  /** Kaydın var olduğundan emin olur; yoksa boş bir kayıt açar. */
  const ensureRecord = async (): Promise<ModuleRecord> => {
    if (record) return record;
    const created = await api.post<ModuleRecord>(basePath, {
      moduleKey,
      departmentId,
      // Kayıt BOŞ doğar: ilk metin taslağa yazılır, onaylanana kadar
      // yürürlükte bir şey yoktur. Böylece "hiç doldurulmamış" ile
      // "boşaltılmış" ayırt edilebilir.
      data: {},
      ...(config.scope === "entity" && scopeRef ? { scopeRef } : {}),
    });
    setRecords((rs) => [created, ...rs]);
    return created;
  };

  const saveDraft = async (): Promise<ModuleRecord | null> => {
    setBusy(true);
    setError(null);
    try {
      const target = await ensureRecord();
      const saved = await api.patch<ModuleRecord>(`/module-records/${target.id}/draft`, { data: form });
      setRecords((rs) => rs.map((r) => (r.id === saved.id ? saved : r)));
      return saved;
    } catch (e: any) {
      setError(e?.message ?? "Kaydedilemedi");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    const saved = await saveDraft();
    if (saved) setMode("read");
  };

  const handleApprove = async () => {
    const saved = mode === "edit" ? await saveDraft() : record;
    if (!saved) return;
    setBusy(true);
    setError(null);
    try {
      const approved = await api.post<ModuleRecord>(`/module-records/${saved.id}/approve`, {});
      setRecords((rs) => rs.map((r) => (r.id === approved.id ? approved : r)));
      setMode("read");
    } catch (e: any) {
      setError(e?.message ?? "Onaylanamadı");
    } finally {
      setBusy(false);
    }
  };

  const handleDiscard = async () => {
    if (!record) return;
    setBusy(true);
    try {
      const updated = await api.delete<ModuleRecord>(`/module-records/${record.id}/draft`);
      setRecords((rs) => rs.map((r) => (r.id === updated.id ? updated : r)));
      setMode("read");
    } finally {
      setBusy(false);
    }
  };

  const openVersions = async () => {
    if (!record) return;
    setMode("versions");
    setVersions(await api.get<ModuleRecordVersion[]>(`/module-records/${record.id}/versions`).catch(() => []));
  };

  const revert = async (versionId: string) => {
    if (!record) return;
    setBusy(true);
    try {
      const updated = await api.post<ModuleRecord>(
        `/module-records/${record.id}/versions/${versionId}/revert`,
        {}
      );
      setRecords((rs) => rs.map((r) => (r.id === updated.id ? updated : r)));
      setMode("read");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p style={{ fontSize: 13, color: c.textSecondary, margin: 0 }}>{t("Yükleniyor…")}</p>;

  const setValue = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Varlık kapsamı: her ürün için ayrı bir doküman. Seçim kaydın kimliğidir. */}
      {config.scope === "entity" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: c.textSecondary }}>{t("Ürün:")}</span>
          {products.length === 0 ? (
            <span style={{ fontSize: 13, color: c.textSecondary }}>
              {t("Önce Ürünler modülünden bir ürün ekleyin.")}
            </span>
          ) : (
            <select
              value={scopeRef ?? ""}
              onChange={(e) => {
                setScopeRef(e.target.value);
                setMode("read");
              }}
              style={{ minWidth: 180 }}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {records.some((r) => r.scopeRef === p.id) ? "" : " — strateji yok"}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {error && (
        <div style={{ fontSize: 13, color: c.danger }}>{error}</div>
      )}

      {/* Onaylanmamış değişiklik uyarısı: okuma görünümü hâlâ ESKİ metni gösterir,
          kullanıcı bunun farkında olmalı. */}
      {pending.length > 0 && mode === "read" && (
        <div
          style={{
            fontSize: 12,
            color: c.textSecondary,
            background: `${c.primary}0d`,
            border: `1px solid ${c.primary}40`,
            borderRadius: 8,
            padding: "8px 10px",
          }}
        >
          Onaylanmamış değişiklik var — {pending.join(", ")}.{" "}
          {canApprove ? "Yayımlamak için Onayla." : "Onay için modül yöneticisine iletilmeli."}
        </div>
      )}

      {mode === "read" && !record && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <strong style={{ fontSize: 15, color: c.textPrimary }}>{config.empty.title}</strong>
          <p style={{ fontSize: 13, color: c.textSecondary, margin: 0, lineHeight: 1.5 }}>{config.empty.body}</p>
          {canWrite && (
            <button
              onClick={startEdit}
              disabled={config.scope === "entity" && !scopeRef}
              style={{ alignSelf: "flex-start", fontSize: 13 }}
            >
              {config.empty.action}
            </button>
          )}
        </div>
      )}

      {mode === "read" && record && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {config.groups.map((group) => {
            const fields = config.fields.filter((f) => f.group === group.key);
            const filled = fields.filter((f) => displayValue(f, current) !== "");
            if (filled.length === 0) return null;
            return (
              <div key={group.key} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 11, letterSpacing: 0.6, color: c.textSecondary, textTransform: "uppercase" }}>
                  {group.label}
                </span>
                {filled.map((f) => (
                  <div key={f.key} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 12, color: c.textSecondary }}>{f.label}</span>
                    <span style={{ fontSize: 14, color: c.textPrimary, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                      {displayValue(f, current)}
                    </span>
                  </div>
                ))}
              </div>
            );
          })}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {canWrite && (
              <button onClick={startEdit} style={{ fontSize: 13 }}>
                {t("Düzenle")}
              </button>
            )}
            {canApprove && pending.length > 0 && (
              <button onClick={handleApprove} disabled={busy || missing.length > 0} style={{ fontSize: 13 }}>
                {t("Onayla")}
              </button>
            )}
            {canWrite && draft && (
              <button onClick={handleDiscard} disabled={busy} style={{ fontSize: 13 }}>
                {t("Taslağı at")}
              </button>
            )}
            <button onClick={openVersions} style={{ fontSize: 13 }}>
              {t("Sürüm geçmişi")}
            </button>
          </div>

          {canApprove && pending.length > 0 && missing.length > 0 && (
            <span style={{ fontSize: 12, color: c.textSecondary }}>
              Onay için eksik: {missing.join(", ")}
            </span>
          )}
        </div>
      )}

      {mode === "edit" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {config.templates && config.templates.length > 0 && !record && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: c.textSecondary }}>{t("Şablondan başla:")}</span>
              {config.templates.map((t) => (
                <button key={t.key} type="button" onClick={() => applyTemplate(t.key)} style={{ fontSize: 12 }}>
                  {t.label}
                </button>
              ))}
            </div>
          )}

          {config.groups.map((group) => {
            const fields = config.fields.filter((f) => f.group === group.key);
            if (fields.length === 0) return null;
            return (
              <div key={group.key} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span
                    style={{ fontSize: 11, letterSpacing: 0.6, color: c.textSecondary, textTransform: "uppercase" }}
                  >
                    {group.label}
                  </span>
                  {group.hint && <span style={{ fontSize: 12, color: c.textSecondary }}>{group.hint}</span>}
                </div>
                {fields.map((f) => (
                  <label key={f.key} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <span style={{ fontSize: 12, color: c.textSecondary }}>
                      {f.label}
                      {f.requiredForApproval && <span style={{ color: c.textSecondary }}> {t("· onay için gerekli")}</span>}
                    </span>
                    <ModuleFieldInput field={f} form={form} setValue={setValue} references={references} />
                    {f.help && <span style={{ fontSize: 11, color: c.textSecondary }}>{f.help}</span>}
                  </label>
                ))}
              </div>
            );
          })}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button data-primary onClick={handleSave} disabled={busy} style={{ fontSize: 13 }}>
              {t("Kaydet")}
            </button>
            {canApprove && (
              <button onClick={handleApprove} disabled={busy} style={{ fontSize: 13 }}>
                {t("Kaydet ve onayla")}
              </button>
            )}
            <button onClick={() => setMode("read")} disabled={busy} style={{ fontSize: 13 }}>
              {t("Vazgeç")}
            </button>
          </div>
          <span style={{ fontSize: 11, color: c.textSecondary }}>
            {t("Kaydetmek yayımlamaz: metin onaylanana kadar okuma görünümünde eski hali kalır.")}
          </span>
        </div>
      )}

      {mode === "versions" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ fontSize: 13, color: c.textPrimary }}>{t("Sürüm geçmişi")}</span>
          {versions.length === 0 ? (
            <span style={{ fontSize: 13, color: c.textSecondary }}>
              {t("Henüz sürüm yok — ilk onaydan sonra burada birikir.")}
            </span>
          ) : (
            versions.map((v) => (
              <div
                key={v.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  border: `1px solid ${c.border}`,
                  borderRadius: 8,
                  padding: "8px 10px",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: c.textPrimary }}>
                    {new Date(v.approvedAt).toLocaleDateString("tr-TR")} tarihine kadar yürürlükteydi
                  </div>
                  {v.note && <div style={{ fontSize: 12, color: c.textSecondary }}>{v.note}</div>}
                </div>
                {canApprove && (
                  <button onClick={() => revert(v.id)} disabled={busy} style={{ fontSize: 12 }}>
                    {t("Taslağa yükle")}
                  </button>
                )}
              </div>
            ))
          )}
          <button onClick={() => setMode("read")} style={{ alignSelf: "flex-start", fontSize: 13 }}>
            {t("Geri")}
          </button>
        </div>
      )}
    </div>
  );
}
