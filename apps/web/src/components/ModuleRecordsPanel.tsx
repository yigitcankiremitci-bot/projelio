import { useEffect, useMemo, useState } from "react";
import type { ModuleRecord } from "@projelio/shared";
import { api } from "../api/client";
import { colors } from "../theme/colors";
import type { ModuleFieldConfig, ModuleRecordConfig } from "../lib/moduleRecordConfigs";
import { useUndo } from "../lib/undo";
import { IconTrash } from "./icons";

// Kayıtların sahibi iki türlü olabilir (bkz. 037_freelancer_modules.sql):
// bir organizasyon (şirket/işletme departman modülleri) ya da bir iş (serbest
// çalışanın anasayfadan bir işe attığı modüller). İkisinden tam olarak biri verilir.
interface Props {
  organizationId?: string;
  departmentId?: string;
  jobId?: string;
  moduleKey: string;
  config: ModuleRecordConfig;
  // Modüle atanmamış departman üyeleri kayıtları görebilir ama değiştiremez
  // (bkz. 042_module_members.sql yetki sırası). Verilmezse yazma varsayılır —
  // sunucu her hâlükârda kendi kontrolünü yapar, bu yalnızca arayüz kolaylığı.
  canWrite?: boolean;
}

type FormMode = { kind: "create" } | { kind: "edit"; id: string } | null;

// Liste 8'den fazla kayda çıkınca arama/filtre çubuğu görünür. Daha azında
// araç çubuğu yer kaplamaktan başka işe yaramıyor.
const TOOLBAR_THRESHOLD = 8;

function emptyForm(fields: ModuleFieldConfig[]): Record<string, string> {
  const f: Record<string, string> = {};
  for (const field of fields) f[field.key] = field.defaultValue ?? "";
  return f;
}

function formFromRecord(fields: ModuleFieldConfig[], record: ModuleRecord): Record<string, string> {
  const f: Record<string, string> = {};
  for (const field of fields) {
    const v = record.data[field.key];
    f[field.key] = v === undefined || v === null ? "" : String(v);
  }
  return f;
}

/** Aramada kullanılacak, kaydın tüm metinsel içeriği. */
function searchableText(record: ModuleRecord): string {
  return Object.values(record.data)
    .filter((v) => typeof v === "string" || typeof v === "number")
    .join(" ")
    .toLocaleLowerCase("tr");
}

/**
 * Tam özellikli hale getirilen bir modülün (Gelir-Gider, Fatura, Müşteri, İşe
 * Alım…) çalışma alanı: veri girişi, düzenleme, arama, filtre, sıralama ve liste.
 *
 * Alan tanımı lib/moduleConfigs/ altındaki departman dosyalarından gelir — yeni
 * bir modülü tam özellikli yapmak için buraya dokunmadan sadece oraya bir tanım
 * eklenir. Arama, filtre ve sıralama alan tanımından otomatik türetilir.
 */
export default function ModuleRecordsPanel({
  organizationId,
  departmentId,
  jobId,
  moduleKey,
  config,
  canWrite = true,
}: Props) {
  const c = colors.light;
  const [records, setRecords] = useState<ModuleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [showAllFields, setShowAllFields] = useState(false);
  const [form, setForm] = useState<Record<string, string>>(() => emptyForm(config.fields));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sortKey, setSortKey] = useState("");
  const { pushUndo } = useUndo();

  const basePath = jobId ? `/jobs/${jobId}/module-records` : `/organizations/${organizationId}/module-records`;

  const load = () => {
    setLoading(true);
    api
      .get<ModuleRecord[]>(`${basePath}?moduleKey=${encodeURIComponent(moduleKey)}`)
      .then(setRecords)
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, [basePath, moduleKey]);

  // ============================================================ Alan grupları
  // Hızlı ekleme formu yalnızca zorunlu alanları gösterir. 12 alanlı bir form
  // kullanıcıyı kaydetmeden vazgeçirir; gerisi "Tüm alanlar" ile açılır.
  const requiredFields = useMemo(() => config.fields.filter((f) => f.required), [config.fields]);
  const quickFields = requiredFields.length > 0 ? requiredFields : config.fields.slice(0, 3);
  const visibleFields = showAllFields || formMode?.kind === "edit" ? config.fields : quickFields;

  const filterableFields = useMemo(
    () => config.fields.filter((f) => f.type === "select" && (f.options?.length ?? 0) > 1),
    [config.fields]
  );
  const sortableFields = useMemo(
    () => config.fields.filter((f) => f.type === "date" || f.type === "number"),
    [config.fields]
  );

  // ============================================================ Görüntülenen liste
  const visible = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr");
    let rows = records;

    if (q) rows = rows.filter((r) => searchableText(r).includes(q));

    for (const [key, value] of Object.entries(filters)) {
      if (value) rows = rows.filter((r) => r.data[key] === value);
    }

    if (sortKey) {
      const [field, dir] = sortKey.split(":");
      const cfg = config.fields.find((f) => f.key === field);
      const numeric = cfg?.type === "number";
      rows = [...rows].sort((a, b) => {
        const av = a.data[field];
        const bv = b.data[field];
        // Değeri olmayan kayıtlar her zaman sona düşer — sıralama yönünden
        // bağımsız olarak "bilgi yok" en az ilgi çeken gruptur.
        if (av === undefined || av === "" || av === null) return 1;
        if (bv === undefined || bv === "" || bv === null) return -1;
        const cmp = numeric ? Number(av) - Number(bv) : String(av).localeCompare(String(bv), "tr");
        return dir === "asc" ? cmp : -cmp;
      });
    }
    return rows;
  }, [records, search, filters, sortKey, config.fields]);

  const hasActiveFilter = search.trim() !== "" || Object.values(filters).some(Boolean);
  const showToolbar = records.length > TOOLBAR_THRESHOLD || hasActiveFilter;

  // ============================================================ Eylemler
  const openCreate = () => {
    setForm(emptyForm(config.fields));
    setShowAllFields(false);
    setError("");
    setFormMode({ kind: "create" });
  };

  const openEdit = (record: ModuleRecord) => {
    setForm(formFromRecord(config.fields, record));
    setError("");
    setFormMode({ kind: "edit", id: record.id });
  };

  const closeForm = () => {
    setFormMode(null);
    setError("");
  };

  const handleSave = async () => {
    setError("");
    // Doğrulama tüm alanlar üzerinden yapılır: hızlı formda gizli kalan zorunlu
    // bir alan varsa kullanıcı "Tüm alanlar"a yönlendirilir.
    for (const field of config.fields) {
      if (field.required && !form[field.key]?.trim()) {
        setError(`${field.label} gerekli`);
        setShowAllFields(true);
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
      if (formMode?.kind === "edit") {
        await api.patch(`/module-records/${formMode.id}`, { data });
      } else {
        await api.post(basePath, jobId ? { moduleKey, data } : { departmentId, moduleKey, data });
      }
      closeForm();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };

  // Arşivleme sert silme değil: kayıt listeden düşer ama veritabanında kalır,
  // bu yüzden geri alma sunucudan gerçekten geri getirebiliyor (pushUndo).
  const handleArchive = async (record: ModuleRecord) => {
    await api.delete(`/module-records/${record.id}`).catch(() => {});
    load();
    pushUndo({
      label: "Kayıt arşivleme",
      run: async () => {
        await api.patch(`/module-records/${record.id}/restore`, {});
        load();
      },
      redo: async () => {
        await api.delete(`/module-records/${record.id}`);
        load();
      },
    });
  };

  const inputStyle = { width: "100%" } as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <h5 style={{ fontSize: 14, fontWeight: 500, color: c.textPrimary, margin: 0 }}>{config.title}</h5>
        {canWrite ? (
          <button
            onClick={() => (formMode ? closeForm() : openCreate())}
            style={{ fontSize: 13, color: c.primary, background: "transparent", border: "none", cursor: "pointer" }}
          >
            {formMode ? "Vazgeç" : `+ ${config.addLabel}`}
          </button>
        ) : (
          <span style={{ fontSize: 12, color: c.textSecondary }} title="Bu modüle atanan kişiler kayıt ekleyebilir">
            Salt görüntüleme
          </span>
        )}
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

      {showToolbar && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ara…"
            style={{ flex: "1 1 140px", minWidth: 120, fontSize: 13, padding: "5px 8px" }}
          />
          {filterableFields.map((field) => (
            <select
              key={field.key}
              value={filters[field.key] ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, [field.key]: e.target.value }))}
              style={{ fontSize: 13, padding: "5px 6px" }}
            >
              <option value="">{field.label}: tümü</option>
              {field.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ))}
          {sortableFields.length > 0 && (
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value)}
              style={{ fontSize: 13, padding: "5px 6px" }}
            >
              <option value="">Sıralama: eklenme</option>
              {sortableFields.map((field) => [
                <option key={`${field.key}:desc`} value={`${field.key}:desc`}>
                  {field.label} ↓
                </option>,
                <option key={`${field.key}:asc`} value={`${field.key}:asc`}>
                  {field.label} ↑
                </option>,
              ])}
            </select>
          )}
          {hasActiveFilter && (
            <button
              onClick={() => {
                setSearch("");
                setFilters({});
              }}
              style={{ fontSize: 12, color: c.primary, background: "transparent", border: "none", cursor: "pointer" }}
            >
              Temizle
            </button>
          )}
        </div>
      )}

      {formMode && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, background: c.background, borderRadius: 10, padding: 10 }}>
          {formMode.kind === "edit" && (
            <span style={{ fontSize: 12, color: c.textSecondary }}>Kaydı düzenliyorsun</span>
          )}
          {visibleFields.map((field) => (
            <div key={field.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 12, color: c.textSecondary }}>
                {field.label}
                {field.required ? " *" : ""}
              </label>
              {field.type === "select" ? (
                <select
                  value={form[field.key] ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                  style={inputStyle}
                >
                  {!field.required && <option value="">—</option>}
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
                  style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
                />
              ) : (
                <input
                  type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                  value={form[field.key] ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  style={inputStyle}
                />
              )}
            </div>
          ))}

          {formMode.kind === "create" && visibleFields.length < config.fields.length && (
            <button
              onClick={() => setShowAllFields(true)}
              style={{
                alignSelf: "flex-start",
                fontSize: 12,
                color: c.primary,
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
              }}
            >
              Tüm alanlar ({config.fields.length - visibleFields.length} tane daha)
            </button>
          )}

          {error && <p style={{ color: c.danger, fontSize: 13, margin: 0 }}>{error}</p>}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ padding: "8px 0", borderRadius: 8, border: "none", background: c.primary, color: "#fff", fontSize: 14 }}
          >
            {saving ? "Kaydediliyor…" : formMode.kind === "edit" ? "Güncelle" : "Kaydet"}
          </button>
        </div>
      )}

      {loading ? (
        <p style={{ fontSize: 13, color: c.textSecondary, margin: 0 }}>Yükleniyor…</p>
      ) : records.length === 0 ? (
        <p style={{ fontSize: 13, color: c.textSecondary, margin: 0 }}>{config.emptyLabel}</p>
      ) : visible.length === 0 ? (
        <p style={{ fontSize: 13, color: c.textSecondary, margin: 0 }}>Aramanla eşleşen kayıt yok.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {hasActiveFilter && (
            <span style={{ fontSize: 12, color: c.textSecondary }}>
              {visible.length} / {records.length} kayıt
            </span>
          )}
          {visible.map((r) => {
            const detail = config.detail?.(r.data);
            const isEditing = formMode?.kind === "edit" && formMode.id === r.id;
            return (
              <div
                key={r.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: c.background,
                  outline: isEditing ? `1.5px solid ${c.primary}` : "none",
                }}
              >
                <button
                  type="button"
                  onClick={() => canWrite && (isEditing ? closeForm() : openEdit(r))}
                  disabled={!canWrite}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    textAlign: "left",
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    cursor: canWrite ? "pointer" : "default",
                  }}
                >
                  <div style={{ fontSize: 14, color: c.textPrimary }}>{config.summary(r.data)}</div>
                  {detail && <div style={{ fontSize: 12, color: c.textSecondary, marginTop: 2 }}>{detail}</div>}
                </button>
                {canWrite && (
                  <button
                    onClick={() => handleArchive(r)}
                    aria-label="Kaydı arşivle"
                    title="Arşivle"
                    style={{ background: "transparent", border: "none", cursor: "pointer" }}
                  >
                    <IconTrash size={14} color={c.textSecondary} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
