import { useMemo, useState } from "react";
import { api } from "../api/client";
import { colors } from "../theme/colors";
import { CURRENCY_OPTIONS, type ModuleFieldConfig } from "../lib/moduleConfigs";
import { referenceOptionsFor, type ReferenceSource } from "../lib/moduleReferences";
import { isReferenceValue } from "../lib/moduleConfigs";

interface Props {
  field: ModuleFieldConfig;
  form: Record<string, string>;
  setValue: (key: string, value: string) => void;
  references: ReferenceSource;
  /** Yeni müşteri açılabilmesi için (entity_ref + creatable). */
  createPartyPath?: string;
}

/**
 * Tek bir modül alanının form kontrolü.
 *
 * ModuleRecordsPanel'den ayrıldı çünkü alan tipi sayısı 5'ten 10'a çıktı ve
 * panelin render'ı okunamaz hale geliyordu. Yeni bir alan tipi eklemek artık
 * yalnızca bu dosyaya dokunmayı gerektiriyor.
 */
export default function ModuleFieldInput({ field, form, setValue, references, createPartyPath }: Props) {
  const c = colors.light;
  const value = form[field.key] ?? "";
  const inputStyle = { width: "100%" } as const;

  switch (field.type) {
    case "select":
      return (
        <select value={value} onChange={(e) => setValue(field.key, e.target.value)} style={inputStyle}>
          {!field.required && <option value="">—</option>}
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );

    case "textarea":
      return (
        <textarea
          value={value}
          onChange={(e) => setValue(field.key, e.target.value)}
          placeholder={field.placeholder}
          rows={2}
          style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
        />
      );

    case "longtext":
      // A1 form modüllerinin gövdesi: vizyon, misyon, konumlandırma. textarea
      // ile aynı kontrol, yalnızca daha yüksek — bu alanlar paragraf taşır ve
      // 2 satırlık bir kutuda yazılamıyor.
      return (
        <textarea
          value={value}
          onChange={(e) => setValue(field.key, e.target.value)}
          placeholder={field.placeholder}
          rows={5}
          style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }}
        />
      );

    case "tags":
      return <TagsInput value={value} onChange={(v) => setValue(field.key, v)} placeholder={field.placeholder} />;

    case "currency":
      // Tek kontrol, iki anahtar: tutar kendi anahtarına, para birimi
      // field.currencyKey'e yazılır — veri şekli eskisiyle aynı kalır.
      return (
        <div style={{ display: "flex", gap: 6 }}>
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(field.key, e.target.value)}
            placeholder={field.placeholder}
            style={{ flex: 1 }}
          />
          <select
            value={form[field.currencyKey ?? "currency"] ?? "TRY"}
            onChange={(e) => setValue(field.currencyKey ?? "currency", e.target.value)}
            style={{ width: 80 }}
            aria-label="Para birimi"
          >
            {(field.options ?? CURRENCY_OPTIONS).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      );

    case "multiselect":
      return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {field.options?.map((o) => {
            const selected = value.split(",").filter(Boolean).includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  const current = value.split(",").filter(Boolean);
                  const next = selected ? current.filter((v) => v !== o.value) : [...current, o.value];
                  setValue(field.key, next.join(","));
                }}
                style={{
                  fontSize: 12,
                  padding: "3px 10px",
                  borderRadius: 6,
                  cursor: "pointer",
                  border: `1px solid ${selected ? c.primary : c.border}`,
                  background: selected ? `${c.primary}18` : "transparent",
                  color: selected ? c.primary : c.textSecondary,
                }}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      );

    case "formula": {
      // Salt okunur: kullanıcı giremez, diğer alanlardan hesaplanır.
      const computed = field.compute?.(form);
      return (
        <div style={{ fontSize: 14, color: c.textSecondary, padding: "6px 0" }}>
          {computed === undefined || computed === "" ? "—" : String(computed)}
        </div>
      );
    }

    case "entity_ref":
    case "user_ref":
      return (
        <ReferencePicker
          field={field}
          value={value}
          setValue={(v) => setValue(field.key, v)}
          references={references}
          createPartyPath={field.type === "entity_ref" ? createPartyPath : undefined}
        />
      );

    default:
      return (
        <input
          type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
          value={value}
          onChange={(e) => setValue(field.key, e.target.value)}
          placeholder={field.placeholder}
          style={inputStyle}
        />
      );
  }
}

/**
 * Serbest etiket girişi.
 *
 * multiselect ile aynı veri biçimini kullanır (virgülle ayrılmış tek metin) —
 * fark, seçeneklerin önceden tanımlı olmaması. Değerler virgülle ayrıldığı için
 * etiketin kendisi virgül içeremez; girilen virgüller ayırıcı sayılır.
 */
function TagsInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const c = colors.light;
  const [draft, setDraft] = useState("");
  const tags = value.split(",").map((t) => t.trim()).filter(Boolean);

  const add = () => {
    const parts = draft
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      // Aynı etiket iki kez eklenmesin; büyük/küçük harf Türkçe kurallarıyla.
      .filter((t) => !tags.some((x) => x.toLocaleLowerCase("tr") === t.toLocaleLowerCase("tr")));
    if (parts.length === 0) {
      setDraft("");
      return;
    }
    onChange([...tags, ...parts].join(","));
    setDraft("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {tags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {tags.map((t) => (
            <span
              key={t}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                padding: "3px 8px",
                borderRadius: 6,
                border: `1px solid ${c.primary}`,
                background: `${c.primary}18`,
                color: c.primary,
              }}
            >
              {t}
              <button
                type="button"
                onClick={() => onChange(tags.filter((x) => x !== t).join(","))}
                aria-label={`${t} etiketini kaldır`}
                style={{ background: "transparent", border: "none", cursor: "pointer", color: c.primary, padding: 0 }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={add}
        onKeyDown={(e) => {
          // Enter form göndermesin: bu alan formun içinde yaşıyor.
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          }
        }}
        placeholder={placeholder ?? "Yaz ve Enter'a bas"}
        style={{ width: "100%" }}
      />
    </div>
  );
}

/**
 * Referans seçici: aranabilir liste + (izin varsa) satır içi yeni kayıt açma.
 *
 * Eski kayıtlarda bu alanda ham ad duruyor olabilir. O değer listede yoksa
 * seçici "serbest metin" kipinde açılır ve mevcut değeri gösterir — kullanıcı
 * isterse listeden gerçek kaydı seçip bağlar, istemezse eski değer korunur.
 */
function ReferencePicker({
  field,
  value,
  setValue,
  references,
  createPartyPath,
}: {
  field: ModuleFieldConfig;
  value: string;
  setValue: (v: string) => void;
  references: ReferenceSource;
  createPartyPath?: string;
}) {
  const c = colors.light;
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const options = referenceOptionsFor(field, references);

  const selected = options.find((o) => o.id === value);
  // UUID ama listede yok: silinmiş ya da başka kapsamdan gelen kayıt.
  const legacyText = value && !isReferenceValue(value) ? value : undefined;

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr");
    if (!q) return options.slice(0, 8);
    return options.filter((o) => o.label.toLocaleLowerCase("tr").includes(q)).slice(0, 8);
  }, [options, query]);

  const createParty = async () => {
    if (!createPartyPath || !query.trim()) return;
    setCreating(true);
    try {
      const created = await api.post<{ id: string }>(createPartyPath, {
        displayName: query.trim(),
        ...(field.entityRole ? { roles: [field.entityRole] } : {}),
      });
      setValue(created.id);
      setQuery("");
      references.reload();
    } finally {
      setCreating(false);
    }
  };

  if (selected || legacyText) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span
          style={{
            flex: 1,
            fontSize: 14,
            color: c.textPrimary,
            padding: "6px 8px",
            background: c.surface,
            border: `1px solid ${c.border}`,
            borderRadius: 6,
          }}
        >
          {selected?.label ?? legacyText}
          {legacyText && (
            // Bağlanmamış eski değer: veri duruyor ama kayda bağlı değil.
            <span style={{ fontSize: 11, color: c.textSecondary }}> · bağlı değil</span>
          )}
        </span>
        <button
          type="button"
          onClick={() => setValue("")}
          style={{ fontSize: 12, color: c.primary, background: "transparent", border: "none", cursor: "pointer" }}
        >
          Değiştir
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={references.loading ? "Yükleniyor…" : field.placeholder ?? "Aramak için yaz…"}
        style={{ width: "100%" }}
      />
      {query.trim() && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            border: `1px solid ${c.border}`,
            borderRadius: 6,
            overflow: "hidden",
          }}
        >
          {filtered.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => {
                setValue(o.id);
                setQuery("");
              }}
              style={{
                textAlign: "left",
                padding: "6px 8px",
                fontSize: 13,
                background: "transparent",
                border: "none",
                borderBottom: `1px solid ${c.border}`,
                cursor: "pointer",
                color: c.textPrimary,
              }}
            >
              {o.label}
              {o.hint && <span style={{ fontSize: 11, color: c.textSecondary }}> · {o.hint}</span>}
            </button>
          ))}
          {filtered.length === 0 && !createPartyPath && (
            <span style={{ padding: "6px 8px", fontSize: 12, color: c.textSecondary }}>Eşleşme yok.</span>
          )}
          {createPartyPath && !filtered.some((o) => o.label.toLocaleLowerCase("tr") === query.trim().toLocaleLowerCase("tr")) && (
            <button
              type="button"
              onClick={createParty}
              disabled={creating}
              style={{
                textAlign: "left",
                padding: "6px 8px",
                fontSize: 13,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: c.primary,
              }}
            >
              {creating ? "Ekleniyor…" : `"${query.trim()}" adıyla yeni kayıt aç`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
