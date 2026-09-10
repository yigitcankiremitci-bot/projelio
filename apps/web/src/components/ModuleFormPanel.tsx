import { useEffect, useMemo, useState } from "react";
import type { ModuleRecord, ModuleRecordVersion, Product } from "@projelio/shared";
import { api } from "../api/client";
import type { UploadTarget } from "../api/files";
import { useThemeColors } from "../theme/useThemeColors";
import {
  attachmentKey,
  changedFields,
  missingForApproval,
  type ModuleFormConfig,
  type ModuleFormFieldConfig,
} from "../lib/moduleForms";
import { useModuleReferences } from "../lib/moduleReferences";
import ModuleFieldInput from "./ModuleFieldInput";
import ModuleFormAttachments from "./ModuleFormAttachments";
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
// YERLEŞİM: bölümler kart, kısa alanlar İKİ SÜTUN. Tek sütunlu eski hâlde
// 40 alanlık bir doküman (marka kimliği) uçsuz bir şerit oluyordu ve tarih ya
// da renk kodu gibi üç karakterlik bir cevap, yanındaki paragrafla aynı
// genişliği kaplayarak aynı ağırlıkta görünüyordu. Uzun metin, etiket listesi
// ve eki olan alanlar satırın tamamını alır (bkz. tamGenislik).
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

/**
 * Alanın form durumunda tuttuğu anahtarlar.
 *
 * Ek dosyalar cevabın parçası olduğu için forma da girer: kaydet düğmesi
 * `form`u olduğu gibi `data` olarak yazıyor, ek anahtarı burada üretilmezse
 * kullanıcının yüklediği dosya ilk kaydetmede sessizce kaybolurdu.
 */
function keysOf(field: ModuleFormFieldConfig): string[] {
  return field.attachments ? [field.key, attachmentKey(field.key)] : [field.key];
}

function emptyForm(fields: ModuleFormFieldConfig[]): Record<string, string> {
  const f: Record<string, string> = {};
  for (const field of fields) {
    for (const key of keysOf(field)) f[key] = key === field.key ? field.defaultValue ?? "" : "";
  }
  return f;
}

function formFromData(
  fields: ModuleFormFieldConfig[],
  data: Record<string, unknown>
): Record<string, string> {
  const f: Record<string, string> = {};
  for (const field of fields) {
    for (const key of keysOf(field)) {
      const v = data[key];
      const fallback = key === field.key ? field.defaultValue ?? "" : "";
      f[key] = v === undefined || v === null ? fallback : String(v);
    }
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

/** Okuma görünümünde alanın çizilmesi için bir şey var mı. */
function hasContent(field: ModuleFormFieldConfig, data: Record<string, unknown>): boolean {
  if (displayValue(field, data) !== "") return true;
  if (!field.attachments) return false;
  return String(data[attachmentKey(field.key)] ?? "").trim() !== "";
}

/**
 * Alan iki sütunlu ızgarada satırın tamamını mı alıyor.
 *
 * Ölçüt cevabın uzunluğu: paragraf, etiket listesi ve çoklu seçim yarım
 * sütunda kırpılmış görünüyor; tek satırlık cevap ise tam genişlikte
 * abartılı duruyor. Eki olan alan da tam genişlik alır — dosya satırları
 * yarım sütunda ada yer bırakmıyor.
 */
function tamGenislik(field: ModuleFormFieldConfig): boolean {
  return (
    field.attachments === true ||
    field.type === "longtext" ||
    field.type === "textarea" ||
    field.type === "tags" ||
    field.type === "multiselect"
  );
}

/**
 * Kısa alanların ızgarası.
 *
 * 280px alt sınırı ölçülerek seçildi: modal 900px, kenar boşlukları ve kart
 * dolgusu düşünce içeride ~824px kalıyor ve bu değer tam İKİ sütun veriyor.
 * 240px'te üç sütun oluyordu — etiketin altındaki yardım metni orada üç
 * satıra kırılıyor, alan da girilen değer için dar kalıyordu. Dar ekranda
 * auto-fit kendiliğinden tek sütuna düşer.
 */
const IZGARA = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: "14px 18px",
} as const;

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

  // Ek dosyalar modülün bulunduğu kapsama yüklenir. Şirket kapsamında açılmış
  // bir modül departman sekmesinden geliyorsa dosya o departmanın klasörüne
  // gider — modülün yaşadığı yer neresiyse dosyası da orada aransın.
  const uploadTarget: UploadTarget | null = jobId
    ? { jobId }
    : departmentId
    ? { departmentId }
    : organizationId
    ? { organizationId }
    : null;

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
    const sablon = config.templates?.find((x) => x.key === key);
    if (!sablon) return;
    setForm((f) => {
      const next = { ...f };
      for (const [k, v] of Object.entries(sablon.data)) next[k] = v === undefined || v === null ? "" : String(v);
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

  /** Bölüm kartı: başlık + ipucu + içerik. İki kipte de aynı çerçeve. */
  const bolum = (label: string, hint: string | undefined, icerik: React.ReactNode) => (
    <section
      style={{
        border: `1px solid ${c.border}`,
        borderRadius: 12,
        padding: "14px 16px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <h3
          style={{
            margin: 0,
            fontSize: 14,
            fontWeight: 600,
            color: c.textPrimary,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ width: 3, height: 14, borderRadius: 2, background: c.accent, flexShrink: 0 }} />
          {t(label)}
        </h3>
        {hint && (
          <span style={{ fontSize: 12.5, color: c.textSecondary, lineHeight: 1.45, paddingLeft: 11 }}>
            {t(hint)}
          </span>
        )}
      </div>
      {icerik}
    </section>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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

      {error && <div style={{ fontSize: 13, color: c.danger }}>{error}</div>}

      {/* Onaylanmamış değişiklik uyarısı: okuma görünümü hâlâ ESKİ metni gösterir,
          kullanıcı bunun farkında olmalı. */}
      {pending.length > 0 && mode === "read" && (
        <div
          style={{
            fontSize: 12.5,
            lineHeight: 1.5,
            color: c.textSecondary,
            background: `${c.primary}0d`,
            border: `1px solid ${c.primary}40`,
            borderRadius: 10,
            padding: "10px 12px",
          }}
        >
          <strong style={{ color: c.textPrimary, fontWeight: 600 }}>
            {t("Onaylanmamış değişiklik var")}
          </strong>
          {" — "}
          {pending.join(", ")}.{" "}
          {canApprove ? t("Yayımlamak için Onayla.") : t("Onay için modül yöneticisine iletilmeli.")}
        </div>
      )}

      {mode === "read" && !record && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "8px 0" }}>
          <strong style={{ fontSize: 17, fontWeight: 600, color: c.textPrimary, lineHeight: 1.35 }}>
            {t(config.empty.title)}
          </strong>
          <p style={{ fontSize: 13.5, color: c.textSecondary, margin: 0, lineHeight: 1.6, maxWidth: 620 }}>
            {t(config.empty.body)}
          </p>
          {canWrite && (
            <button
              data-primary
              onClick={startEdit}
              disabled={config.scope === "entity" && !scopeRef}
              style={{ alignSelf: "flex-start", fontSize: 13, marginTop: 2 }}
            >
              {t(config.empty.action)}
            </button>
          )}
        </div>
      )}

      {mode === "read" && record && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {config.groups.map((group) => {
            const filled = config.fields.filter((f) => f.group === group.key && hasContent(f, current));
            if (filled.length === 0) return null;
            return (
              <div key={group.key}>
                {bolum(
                  group.label,
                  undefined,
                  <div style={IZGARA}>
                    {filled.map((f) => (
                      <div
                        key={f.key}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 3,
                          gridColumn: tamGenislik(f) ? "1 / -1" : undefined,
                        }}
                      >
                        <span style={{ fontSize: 12, fontWeight: 500, color: c.textSecondary }}>{t(f.label)}</span>
                        {displayValue(f, current) !== "" && (
                          <span
                            style={{
                              fontSize: 14.5,
                              color: c.textPrimary,
                              lineHeight: 1.6,
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            {displayValue(f, current)}
                          </span>
                        )}
                        {f.attachments && (
                          <ModuleFormAttachments value={String(current[attachmentKey(f.key)] ?? "")} />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {canWrite && (
              <button data-primary onClick={startEdit} style={{ fontSize: 13 }}>
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
              {t("Onay için eksik:")} {missing.join(", ")}
            </span>
          )}
        </div>
      )}

      {mode === "edit" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Şablon kartları yalnızca boş kayıtta: dolu bir dokümanın üstüne
              şablon yüklemek, kullanıcının yazdığını tek tıkla eziyor. */}
          {config.templates && config.templates.length > 0 && !record && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 12.5, color: c.textSecondary }}>
                {t("Şablondan başla — hepsi taslaktır, üstüne yazabilirsin:")}
              </span>
              <div style={IZGARA}>
                {config.templates.map((sablon) => (
                  <button
                    key={sablon.key}
                    type="button"
                    onClick={() => applyTemplate(sablon.key)}
                    style={{
                      textAlign: "left",
                      display: "flex",
                      flexDirection: "column",
                      gap: 3,
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: `1px solid ${c.border}`,
                      background: "transparent",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: c.textPrimary }}>{t(sablon.label)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {config.groups.map((group) => {
            const fields = config.fields.filter((f) => f.group === group.key);
            if (fields.length === 0) return null;
            return (
              <div key={group.key}>
                {bolum(
                  group.label,
                  group.hint,
                  <div style={IZGARA}>
                    {fields.map((f) => (
                      // DİKKAT: burası <label> DEĞİL. Label, üzerine yapılan
                      // tıklamayı içindeki İLK odaklanabilir öğeye yönlendirir
                      // — kutunun boşluğuna tıklamak çoklu seçimde ilk
                      // seçeneği ("Web sitesi") işaretliyor, etiket alanında
                      // ise ilk etiketin × düğmesine basıp kullanıcının
                      // dokunmadığı etiketi siliyordu. Bu alanların çoğu tek
                      // bir <input> değil (düğme ızgarası, etiket listesi,
                      // ek dosyalar); label'ın tarif ettiği "tek kontrol"
                      // ilişkisi burada zaten yok.
                      <div
                        key={f.key}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 5,
                          gridColumn: tamGenislik(f) ? "1 / -1" : undefined,
                        }}
                      >
                        <span style={{ fontSize: 12, fontWeight: 500, color: c.textPrimary }}>
                          {t(f.label)}
                          {f.requiredForApproval && (
                            <span style={{ color: c.textSecondary, fontWeight: 400 }}>
                              {" "}
                              {t("· onay için gerekli")}
                            </span>
                          )}
                        </span>
                        <ModuleFieldInput field={f} form={form} setValue={setValue} references={references} />
                        {f.help && (
                          <span style={{ fontSize: 12, color: c.textSecondary, lineHeight: 1.45 }}>{t(f.help)}</span>
                        )}
                        {f.attachments && (
                          <ModuleFormAttachments
                            value={form[attachmentKey(f.key)] ?? ""}
                            onChange={(next) => setValue(attachmentKey(f.key), next)}
                            target={uploadTarget}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
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
            <span style={{ fontSize: 12, color: c.textSecondary, lineHeight: 1.45 }}>
              {t("Kaydetmek yayımlamaz: metin onaylanana kadar okuma görünümünde eski hali kalır.")}
            </span>
          </div>
        </div>
      )}

      {mode === "versions" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: c.textPrimary }}>{t("Sürüm geçmişi")}</span>
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
                  borderRadius: 10,
                  padding: "10px 12px",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, color: c.textPrimary }}>
                    {t("{tarih} tarihine kadar yürürlükteydi", {
                      tarih: new Date(v.approvedAt).toLocaleDateString("tr-TR"),
                    })}
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
