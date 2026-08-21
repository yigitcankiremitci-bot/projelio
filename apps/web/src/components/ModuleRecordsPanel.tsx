import { useEffect, useMemo, useRef, useState } from "react";
import type { ModuleRecord, Task } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import type { ModuleFieldConfig, ModuleRecordConfig } from "../lib/moduleRecordConfigs";
import { isReferenceValue } from "../lib/moduleRecordConfigs";
import { hasDynamicFields, toDisplayData, useModuleReferences } from "../lib/moduleReferences";
import { useUndo } from "../lib/undo";
import { useSortableList } from "../lib/useSortableList";
import type { SortableOptions } from "sortablejs";
import Modal from "./Modal";
import TaskFromRecordModal from "./TaskFromRecordModal";
import ModuleFieldInput from "./ModuleFieldInput";
import { IconEdit, IconListCheck, IconTrash } from "./icons";

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
  for (const field of fields) {
    f[field.key] = field.defaultValue ?? "";
    // currency alanı iki anahtar yönetir; para biriminin de varsayılanı olmalı.
    if (field.type === "currency") f[field.currencyKey ?? "currency"] = "TRY";
  }
  return f;
}

function formFromRecord(fields: ModuleFieldConfig[], record: ModuleRecord): Record<string, string> {
  const f: Record<string, string> = {};
  const read = (key: string) => {
    const v = record.data[key];
    return v === undefined || v === null ? "" : String(v);
  };
  for (const field of fields) {
    f[field.key] = read(field.key);
    // Para birimi ayrı anahtarda duruyor; yüklenmezse düzenlemede TRY'ye
    // sıfırlanır ve kullanıcı farkında olmadan tutarın birimini değiştirir.
    if (field.type === "currency") {
      const ck = field.currencyKey ?? "currency";
      f[ck] = read(ck) || "TRY";
    }
  }
  return f;
}

/**
 * Aramada kullanılacak metin.
 *
 * Ham veri değil GÖSTERİM verisi taranır: referans alanlarında kayıtta UUID
 * durur, kullanıcı ise gördüğü adı arar.
 */
function searchableText(displayData: Record<string, unknown>): string {
  return Object.values(displayData)
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
  const c = useThemeColors();
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
  // Liste mi pano mı. Pano, kayıtları bir select alanına göre sütunlara böler
  // (görev kanbanıyla aynı okuma biçimi) ve geniş ekranda satırların ekranı
  // baştan sona kat etmesini engeller.
  const [view, setView] = useState<"list" | "board">("list");
  // Bu modül kayıtlarından doğmuş görevler: kayıt id -> görev sayısı.
  const [taskCounts, setTaskCounts] = useState<Record<string, number>>({});
  // Göreve dönüştürme modalinin açık olduğu kayıt.
  const [taskFor, setTaskFor] = useState<ModuleRecord | null>(null);
  const { pushUndo } = useUndo();

  const basePath = jobId ? `/jobs/${jobId}/module-records` : `/organizations/${organizationId}/module-records`;
  const partyPath = jobId ? `/jobs/${jobId}/party` : `/organizations/${organizationId}/party`;

  // Referans alanı olmayan modüllerde müşteri/üye listesi çekilmez.
  const references = useModuleReferences({ organizationId, departmentId, jobId }, hasDynamicFields(config));

  /** Kayıtların ekranda görünen hali: referanslar ada çevrilmiş, formüller hesaplanmış. */
  const displayOf = useMemo(
    () => (data: Record<string, unknown>) => toDisplayData(config, data, references.resolve),
    [config, references.resolve]
  );

  const load = () => {
    setLoading(true);
    api
      .get<ModuleRecord[]>(`${basePath}?moduleKey=${encodeURIComponent(moduleKey)}`)
      .then(setRecords)
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, [basePath, moduleKey]);

  /**
   * Bu modül kayıtlarından doğmuş görevler.
   *
   * Departman görevleri tek istekte çekilip kaynağına göre sayılıyor: her kayıt
   * için ayrı sorgu atmak 50 kayıtlık bir listede 50 istek olurdu. Görev
   * köprüsü yalnızca departman bağlamında var — serbest çalışanda görevler
   * projeye bağlı, hangi projeye yazılacağı ayrı bir karar.
   */
  const loadTaskCounts = () => {
    if (!departmentId) return;
    api
      .get<Task[]>(`/departments/${departmentId}/tasks`)
      .then((tasks) => {
        const counts: Record<string, number> = {};
        for (const t of tasks) {
          if (t.sourceModuleKey !== moduleKey || !t.sourceRecordId) continue;
          counts[t.sourceRecordId] = (counts[t.sourceRecordId] ?? 0) + 1;
        }
        setTaskCounts(counts);
      })
      .catch(() => setTaskCounts({}));
  };

  useEffect(loadTaskCounts, [departmentId, moduleKey]);

  /**
   * Kaydı panoda başka bir sütuna taşır.
   *
   * Önce yerel durum güncellenir, sonra sunucuya yazılır: sürükleme bittiğinde
   * kart yeni sütunda kalmalı, isteğin dönmesini bekleyip geri zıplamamalı.
   * İstek başarısız olursa listeyi sunucudan tazeleyip gerçeğe döneriz.
   */
  const moveRecord = async (recordId: string, value: string) => {
    const record = records.find((r) => r.id === recordId);
    if (!record || !boardField) return;
    const nextData = { ...record.data, [boardField.key]: value };
    setRecords((rs) => rs.map((r) => (r.id === recordId ? { ...r, data: nextData } : r)));
    await api.patch(`/module-records/${recordId}`, { data: nextData }).catch(() => load());
  };

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

  /**
   * Pano sütunlarını üreten alan.
   *
   * Modül kendi alanını bildirmemişse (config.boardKey) ilk uygun select alanı
   * seçilir: 2–6 seçenekli olanlar sütuna dönüşebilir, daha fazlası ekranda
   * okunmaz bir şerit olur ve pano listeden daha kötü hale gelir.
   */
  const boardField = useMemo(() => {
    if (config.boardKey) return config.fields.find((f) => f.key === config.boardKey);
    return config.fields.find(
      (f) => f.type === "select" && (f.options?.length ?? 0) >= 2 && (f.options?.length ?? 0) <= 6
    );
  }, [config.fields, config.boardKey]);

  // ============================================================ Görüntülenen liste
  const visible = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr");
    let rows = records;

    if (q) rows = rows.filter((r) => searchableText(displayOf(r.data)).includes(q));

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
  }, [records, search, filters, sortKey, config.fields, displayOf]);

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

  /**
   * Kayıt bir müşteriye referans veriyorsa müşteri kartının geçmişine düşer.
   *
   * "Modüller birbirini besliyor" ilkesinin ilk somut hali: fatura kesince,
   * destek talebi açınca ya da sözleşme girince müşteri kartında görünür.
   *
   * Bilerek "en iyi çaba": başarısız olursa kaydın kendisi etkilenmez —
   * aktivite bir yan kayıttır, asıl veri değil. Alan tanımları yalnızca
   * frontend'de olduğu için bu bağı sunucu kuramıyor; tanımlar paylaşılan
   * pakete taşınırsa backend'e alınabilir.
   */
  const logToReferencedParties = async (data: Record<string, unknown>) => {
    const partyIds = config.fields
      .filter((f) => f.type === "entity_ref" && f.entity === "party")
      .map((f) => data[f.key])
      .filter(isReferenceValue);

    for (const partyId of new Set(partyIds)) {
      await api
        .post(`/party/${partyId}/activities`, {
          type: "sistem",
          summary: `${config.title}: ${config.summary(data) || "yeni kayıt"}`,
        })
        .catch(() => {});
    }
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
        // Hesaplanan alanlar kaydedilmez; her okumada yeniden üretilir, aksi
        // halde kaynak alan değişince bayat bir değer kalırdı.
        if (field.type === "formula") continue;
        const v = form[field.key];
        if (v === undefined || v === "") continue;
        data[field.key] = field.type === "number" || field.type === "currency" ? Number(v) : v;
      }
      // currency alanı para birimini ayrı anahtara yazar (bkz. shared.ts currencyField).
      for (const field of config.fields) {
        if (field.type !== "currency") continue;
        const ck = field.currencyKey ?? "currency";
        if (form[ck]) data[ck] = form[ck];
      }

      if (formMode?.kind === "edit") {
        await api.patch(`/module-records/${formMode.id}`, { data });
      } else {
        await api.post(basePath, jobId ? { moduleKey, data } : { departmentId, moduleKey, data });
      }
      void logToReferencedParties(data);
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

  /** Bir kaydın satır/kart gövdesi: özet, detay ve düzenle/arşivle düğmeleri. */
  const renderRecord = (r: ModuleRecord) => {
    const shown = displayOf(r.data);
    const detail = config.detail?.(shown);
    const taskCount = taskCounts[r.id] ?? 0;
    return (
      <div
        key={r.id}
        // Panoda sürükle-bırak bu iki veriyle çalışıyor: hangi kayıt, hangi sütun.
        data-id={r.id}
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          padding: "8px 10px",
          borderRadius: 8,
          background: c.background,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, color: c.textPrimary }}>{config.summary(shown)}</div>
          {detail && <div style={{ fontSize: 12, color: c.textSecondary, marginTop: 2 }}>{detail}</div>}
        </div>
        {canWrite && departmentId && (
          // Görev köprüsü: kayıt girildi, şimdi birinin yapması gerekiyor.
          // Sayı rozeti, aynı kayıttan kaç görev doğduğunu gösterir.
          <button
            onClick={() => setTaskFor(r)}
            aria-label="Göreve dönüştür"
            title={taskCount > 0 ? `${taskCount} görev oluşturulmuş — bir tane daha ekle` : "Göreve dönüştür"}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 3,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 2,
              flexShrink: 0,
              color: taskCount > 0 ? c.primary : c.textSecondary,
            }}
          >
            <IconListCheck size={14} color={taskCount > 0 ? c.primary : c.textSecondary} />
            {taskCount > 0 && <span style={{ fontSize: 11 }}>{taskCount}</span>}
          </button>
        )}
        {canWrite && (
          <>
            {/* Düzenleme artık satırın kendisine tıklamakla değil, açık bir
                kalem düğmesiyle başlar: satıra tıklamak kazara düzenleme
                açıyordu ve hangi eylemin ne yapacağı belirsizdi. */}
            <button
              onClick={() => openEdit(r)}
              aria-label="Kaydı düzenle"
              title="Düzenle"
              style={{ background: "transparent", border: "none", cursor: "pointer", padding: 2, flexShrink: 0 }}
            >
              <IconEdit size={14} color={c.textSecondary} />
            </button>
            <button
              onClick={() => handleArchive(r)}
              aria-label="Kaydı arşivle"
              title="Arşivle"
              style={{ background: "transparent", border: "none", cursor: "pointer", padding: 2, flexShrink: 0 }}
            >
              <IconTrash size={14} color={c.textSecondary} />
            </button>
          </>
        )}
      </div>
    );
  };

  return (
    // Genişlik sınırı: geniş ekranda satırlar ekranı baştan sona kat edince göz
    // satır başını kaybediyor. Pano görünümü sütunlara bölündüğü için sınırdan muaf.
    <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: view === "board" ? "none" : 920 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <h5 style={{ fontSize: 14, fontWeight: 500, color: c.textPrimary, margin: 0 }}>{config.title}</h5>
        {canWrite ? (
          <button
            onClick={openCreate}
            style={{ fontSize: 13, color: c.primary, background: "transparent", border: "none", cursor: "pointer" }}
          >
            {`+ ${config.addLabel}`}
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

      {/* Görünüm seçici yalnızca panoya bölünebilen modüllerde. Tek sütunluk bir
          pano listeden daha kötü olurdu. */}
      {boardField && records.length > 0 && (
        <div style={{ display: "flex", gap: 4 }}>
          {(["list", "board"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                fontSize: 12,
                padding: "4px 10px",
                borderRadius: 6,
                cursor: "pointer",
                border: `1px solid ${view === v ? c.primary : c.border}`,
                background: view === v ? `${c.primary}18` : "transparent",
                color: view === v ? c.primary : c.textSecondary,
              }}
            >
              {v === "list" ? "Liste" : `Pano · ${boardField.label}`}
            </button>
          ))}
        </div>
      )}

      {/* Ekleme ve düzenleme modalde: form listenin arasına girdiğinde kullanıcı
          hangi kaydı düzenlediğini kaybediyordu ve uzun formlarda liste ekrandan
          taşıyordu. */}
      {formMode && (
        <Modal
          title={formMode.kind === "edit" ? `${config.title} — düzenle` : config.addLabel}
          onClose={closeForm}
          maxWidth={560}
          mobileFullScreen
        >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {visibleFields.map((field) => (
            <div key={field.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 12, color: c.textSecondary }}>
                {field.label}
                {field.required ? " *" : ""}
              </label>
              <ModuleFieldInput
                field={field}
                form={form}
                setValue={(key, value) => setForm((f) => ({ ...f, [key]: value }))}
                references={references}
                createPartyPath={partyPath}
              />
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
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button
              data-primary
              onClick={handleSave}
              disabled={saving}
              style={{
                flex: 1,
                padding: "8px 0",
                borderRadius: 8,
                border: "none",
                background: c.primary,
                color: "#fff",
                fontSize: 14,
              }}
            >
              {saving ? "Kaydediliyor…" : formMode.kind === "edit" ? "Güncelle" : "Kaydet"}
            </button>
            <button onClick={closeForm} disabled={saving} style={{ padding: "8px 16px", fontSize: 14 }}>
              Vazgeç
            </button>
          </div>
        </div>
        </Modal>
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

          {view === "list" && visible.map(renderRecord)}

          {view === "board" && boardField && (
            <div
              style={{
                display: "grid",
                // Sütun sayısı sabit değil: ekrana sığdığı kadar sütun, kalanı
                // yatay kaydırma. Görev panosuyla aynı okuma biçimi.
                gridAutoFlow: "column",
                gridAutoColumns: "minmax(240px, 1fr)",
                gap: 10,
                overflowX: "auto",
                paddingBottom: 4,
              }}
            >
              {[
                ...(boardField.options ?? []),
                // Alanı boş bırakılmış kayıtlar da bir sütunda görünmeli, yoksa
                // pano görünümünde sessizce kaybolurlardı.
                { value: "", label: "Belirtilmemiş" },
              ]
                .map((option) => ({
                  option,
                  rows: visible.filter((r) => (r.data[boardField.key] ?? "") === option.value),
                }))
                .filter(({ option, rows }) => option.value !== "" || rows.length > 0)
                .map(({ option, rows }) => (
                  <BoardColumn
                    key={option.value || "_bos"}
                    label={option.label}
                    value={option.value}
                    count={rows.length}
                    canDrag={canWrite}
                    onDrop={moveRecord}
                  >
                    {rows.map(renderRecord)}
                  </BoardColumn>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Modül kaydını göreve dönüştürme: modüller ile çekirdek arasındaki köprü. */}
      {taskFor && departmentId && (
        <TaskFromRecordModal
          departmentId={departmentId}
          moduleKey={moduleKey}
          moduleTitle={config.title}
          recordId={taskFor.id}
          defaultTitle={config.summary(displayOf(taskFor.data)) || config.title}
          defaultDeadline={config.periodKey ? (taskFor.data[config.periodKey] as string | undefined) : undefined}
          existingCount={taskCounts[taskFor.id] ?? 0}
          onClose={() => setTaskFor(null)}
          onCreated={loadTaskCounts}
        />
      )}
    </div>
  );
}

/**
 * Panodaki tek sütun.
 *
 * Sürükle-bırak sortablejs ile ve görev panosuyla AYNI ayarlarla çalışır
 * (bkz. useSortableList): kısa basılı tutunca kalkar, böylece normal kaydırma
 * hareketi yanlışlıkla sürükleme sayılmaz. Sütunlar ortak bir grup adı
 * paylaştığı için kartlar sütunlar arasında taşınabilir.
 */
function BoardColumn({
  label,
  value,
  count,
  canDrag,
  onDrop,
  children,
}: {
  label: string;
  value: string;
  count: number;
  canDrag: boolean;
  onDrop: (recordId: string, value: string) => void;
  children: React.ReactNode;
}) {
  const c = useThemeColors();
  const listRef = useRef<HTMLDivElement>(null);

  useSortableList(
    listRef,
    // onAdd sortablejs'in Options tipinde, SortableOptions'ta değil; hook ortak
    // ayarları SortableOptions olarak alıyor. Cast yalnızca tip katmanında —
    // seçenek nesnesi Sortable.create'e olduğu gibi geçiyor.
    ({
      group: { name: "module-board", pull: canDrag, put: canDrag },
      // Sıra içi taşımanın bir anlamı yok (sıralama alan tanımından geliyor);
      // önemli olan kaydın HANGİ sütuna bırakıldığı.
      sort: false,
      onAdd: (evt: { item: HTMLElement; to: HTMLElement; from: HTMLElement; oldIndex?: number }) => {
        const recordId = evt.item.dataset.id;
        const target = evt.to.dataset.column;

        // KRİTİK: sortablejs kartı DOM'da fiziksel olarak taşıdı, ama React o
        // düğümün hâlâ eski sütunun çocuğu olduğunu sanıyor. Durumu bu hâlde
        // güncellersek React eski sütundan olmayan bir düğümü silmeye çalışıp
        // "removeChild" hatasıyla patlıyor ve taşıma hiç gerçekleşmiyordu.
        // Bu yüzden önce DOM eski hâline alınır, sonra taşımayı React yapar.
        const from = evt.from;
        const reference = from.children[evt.oldIndex ?? from.children.length] ?? null;
        from.insertBefore(evt.item, reference);

        if (recordId && target !== undefined) onDrop(recordId, target);
      },
    } as unknown) as SortableOptions,
    [value, canDrag, count]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: c.textSecondary, padding: "0 2px" }}>
        <span style={{ fontWeight: 500 }}>{label}</span>
        <span
          style={{
            fontSize: 11,
            background: c.background,
            border: `1px solid ${c.border}`,
            borderRadius: 999,
            padding: "0 6px",
          }}
        >
          {count}
        </span>
      </div>
      {/* Sürükleme hedefi liste kabının kendisi: boş sütuna da bırakılabilmeli,
          bu yüzden boşken bile en az bir satırlık yüksekliği var. */}
      <div
        ref={listRef}
        data-column={value}
        style={{ display: "flex", flexDirection: "column", gap: 6, minHeight: 44 }}
      >
        {children}
      </div>
      {count === 0 && <span style={{ fontSize: 12, color: c.textSecondary, padding: "0 2px" }}>Buraya sürükle</span>}
    </div>
  );
}
