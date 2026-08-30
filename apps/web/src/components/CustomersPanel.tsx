import { useEffect, useMemo, useState } from "react";
import type { Party, PartyActivity, PartyContact, PartyDuplicate, PartyRole } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import { ALL_ROLES, ROLE_COLORS, ROLE_LABELS, STATUS_LABELS, profileFor } from "../lib/partyProfiles";
import { useUndo } from "../lib/undo";
import { FAB_PRIORITY, useFabAvailable, useProjectFabAction } from "../lib/projectFab";
import { IconTrash, IconX } from "./icons";

interface Props {
  organizationId?: string;
  departmentId?: string;
  // Departman profilini seçmek için (Satış mı, Müşteri İlişkileri mi).
  departmentKey?: string;
  jobId?: string;
  canWrite?: boolean;
}

type FormMode = { kind: "create" } | { kind: "edit"; party: Party } | null;

const TOOLBAR_THRESHOLD = 8;

function emptyForm() {
  return {
    displayName: "",
    partyType: "company",
    role: "lead" as PartyRole,
    email: "",
    phone: "",
    taxNumber: "",
    notes: "",
  };
}

/**
 * Müşteri modülü (crm_musteri) — ortak `party` varlığına açılan pencere.
 *
 * Bu panel module_records'a değil doğrudan party tablosuna yazar. Sebebi:
 * Satış ve Müşteri İlişkileri departmanları AYNI müşteri kaydını görmeli.
 * Önceden iki ayrı modül anahtarı iki ayrı kayıt tutuyordu ve aynı firma
 * iki kere giriliyordu.
 * Bkz. database/migrations/046_party_and_customer_merge.sql
 */
export default function CustomersPanel({
  organizationId,
  departmentId,
  departmentKey,
  jobId,
  canWrite = true,
}: Props) {
  const c = useThemeColors();
  const profile = profileFor(departmentKey);

  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [duplicates, setDuplicates] = useState<PartyDuplicate[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<PartyRole | "">(profile.defaultRole ?? "");
  const [openPartyId, setOpenPartyId] = useState<string | null>(null);
  const { pushUndo } = useUndo();

  const scopePath = jobId ? `/jobs/${jobId}/party` : `/organizations/${organizationId}/party`;

  const load = () => {
    setLoading(true);
    api
      .get<Party[]>(scopePath)
      .then(setParties)
      .catch(() => setParties([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, [scopePath]);

  // Departman değişince o departmanın varsayılan rol filtresi uygulanır.
  useEffect(() => setRoleFilter(profile.defaultRole ?? ""), [profile.defaultRole]);

  const visible = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr");
    return parties.filter((p) => {
      if (roleFilter && !p.roles.includes(roleFilter)) return false;
      if (!q) return true;
      return [p.displayName, p.legalName, p.email, p.phone, p.taxNumber]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("tr")
        .includes(q);
    });
  }, [parties, search, roleFilter]);

  const hasActiveFilter = search.trim() !== "" || roleFilter !== (profile.defaultRole ?? "");
  const showToolbar = parties.length > TOOLBAR_THRESHOLD || hasActiveFilter;

  const stats = useMemo(
    () => [
      { label: "Toplam", value: String(parties.length) },
      { label: "Müşteri", value: String(parties.filter((p) => p.roles.includes("customer")).length) },
      { label: "Potansiyel", value: String(parties.filter((p) => p.roles.includes("lead")).length) },
    ],
    [parties]
  );

  // ============================================================ Eylemler

  const openCreate = () => {
    setForm({ ...emptyForm(), role: profile.defaultRole ?? "lead" });
    setDuplicates([]);
    setError("");
    setFormMode({ kind: "create" });
  };

  const openEdit = (p: Party) => {
    setForm({
      displayName: p.displayName,
      partyType: p.partyType,
      role: p.roles[0] ?? "lead",
      email: p.email ?? "",
      phone: p.phone ?? "",
      taxNumber: p.taxNumber ?? "",
      notes: p.notes ?? "",
    });
    setDuplicates([]);
    setError("");
    setFormMode({ kind: "edit", party: p });
  };

  const closeForm = () => {
    setFormMode(null);
    setDuplicates([]);
    setError("");
  };

  // Ekleme sayfanın "+" düğmesinden. Panelin başlığındaki ikinci düğme kalktı;
  // modal içinde (bkz. Modal.tsx) "+" ulaşılamadığı için orada geri gelir.
  const fabAvailable = useFabAvailable();
  useProjectFabAction(
    canWrite && fabAvailable ? { label: "Müşteri ekle", onClick: openCreate } : null,
    [canWrite, fabAvailable, organizationId, departmentId, jobId],
    FAB_PRIORITY.panel
  );

  /**
   * Ada göre kopya kontrolü, kullanıcı adı yazmayı bitirdiğinde çalışır.
   * Engelleyici değil: "ABC Ltd" iki ayrı şube olabilir, karar kullanıcınındır.
   */
  const checkDuplicates = async () => {
    if (!form.displayName.trim() && !form.taxNumber.trim() && !form.email.trim()) return;
    try {
      const found = await api.post<PartyDuplicate[]>(`${scopePath}/check-duplicates`, {
        displayName: form.displayName,
        taxNumber: form.taxNumber || undefined,
        email: form.email || undefined,
        excludeId: formMode?.kind === "edit" ? formMode.party.id : undefined,
      });
      setDuplicates(found);
    } catch {
      setDuplicates([]);
    }
  };

  const handleSave = async () => {
    if (!form.displayName.trim()) {
      setError("Ad gerekli");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const payload = {
        displayName: form.displayName.trim(),
        partyType: form.partyType,
        roles: [form.role],
        email: form.email || undefined,
        phone: form.phone || undefined,
        taxNumber: form.taxNumber || undefined,
        notes: form.notes || undefined,
        ...(departmentId && !jobId ? { departmentId } : {}),
      };
      if (formMode?.kind === "edit") {
        // Düzenlemede roller korunur: mevcut rollerin üzerine seçilen eklenir,
        // hiçbiri silinmez (bkz. party-dedup.ts addRole).
        const merged = Array.from(new Set([...formMode.party.roles, form.role]));
        await api.patch(`/party/${formMode.party.id}`, { ...payload, roles: merged });
      } else {
        await api.post(scopePath, payload);
      }
      closeForm();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (p: Party) => {
    await api.delete(`/party/${p.id}`).catch(() => {});
    if (openPartyId === p.id) setOpenPartyId(null);
    load();
    pushUndo({
      label: "Müşteri arşivleme",
      run: async () => {
        await api.patch(`/party/${p.id}/restore`, {});
        load();
      },
      redo: async () => {
        await api.delete(`/party/${p.id}`);
        load();
      },
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
          <h5 style={{ fontSize: 14, fontWeight: 500, color: c.textPrimary, margin: 0 }}>Müşteriler</h5>
          {profile.key !== "base" && (
            <span style={{ fontSize: 12, color: c.textSecondary }}>{profile.label}</span>
          )}
        </div>
        {!canWrite ? (
          <span style={{ fontSize: 12, color: c.textSecondary }}>Salt görüntüleme</span>
        ) : (
          !fabAvailable && (
            <button
              onClick={() => (formMode ? closeForm() : openCreate())}
              style={{ fontSize: 13, color: c.primary, background: "transparent", border: "none", cursor: "pointer" }}
            >
              {formMode ? "Vazgeç" : "+ Müşteri ekle"}
            </button>
          )
        )}
      </div>

      {!loading && parties.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {stats.map((s) => (
            <div
              key={s.label}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 2,
                padding: "6px 12px",
                borderRadius: 8,
                background: c.background,
                border: `1px solid ${c.border}`,
                minWidth: 84,
              }}
            >
              <span style={{ fontSize: 11, color: c.textSecondary }}>{s.label}</span>
              <span style={{ fontSize: 15, fontWeight: 500, color: c.textPrimary }}>{s.value}</span>
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
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as PartyRole | "")}
            style={{ fontSize: 13, padding: "5px 6px" }}
          >
            <option value="">Rol: tümü</option>
            {ALL_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          {hasActiveFilter && (
            <button
              onClick={() => {
                setSearch("");
                setRoleFilter(profile.defaultRole ?? "");
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

          <Field label="Ad / Unvan *">
            <input
              value={form.displayName}
              onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
              onBlur={checkDuplicates}
              placeholder="Örn. ABC Yazılım Ltd. Şti."
              style={{ width: "100%" }}
            />
          </Field>

          <div style={{ display: "flex", gap: 8 }}>
            <Field label="Tür" style={{ flex: 1 }}>
              <select
                value={form.partyType}
                onChange={(e) => setForm((f) => ({ ...f, partyType: e.target.value }))}
                style={{ width: "100%" }}
              >
                <option value="company">Kurum</option>
                <option value="person">Kişi</option>
              </select>
            </Field>
            <Field label="Rol" style={{ flex: 1 }}>
              <select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as PartyRole }))}
                style={{ width: "100%" }}
              >
                {ALL_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <Field label="E-posta" style={{ flex: 1 }}>
              <input
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                onBlur={checkDuplicates}
                style={{ width: "100%" }}
              />
            </Field>
            <Field label="Telefon" style={{ flex: 1 }}>
              <input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                style={{ width: "100%" }}
              />
            </Field>
          </div>

          <Field label="Vergi / TC No">
            <input
              value={form.taxNumber}
              onChange={(e) => setForm((f) => ({ ...f, taxNumber: e.target.value }))}
              onBlur={checkDuplicates}
              placeholder="Fatura kesilecekse gerekli"
              style={{ width: "100%" }}
            />
          </Field>

          <Field label="Not">
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
            />
          </Field>

          {duplicates.length > 0 && (
            <div
              style={{
                fontSize: 12,
                color: c.textSecondary,
                background: c.surface,
                border: `1px solid ${c.border}`,
                borderRadius: 8,
                padding: "8px 10px",
              }}
            >
              <strong style={{ color: c.textPrimary }}>Bu kaydı daha önce girmiş olabilirsin:</strong>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {duplicates.map((d) => (
                  <li key={d.party.id}>
                    {d.party.displayName}
                    {d.severity === "block" ? " — aynı vergi numarası, kayıt açılamaz" : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {error && <p style={{ color: c.danger, fontSize: 13, margin: 0 }}>{error}</p>}
          {/* Vazgeçme yolu formun İÇİNDE: eskiden başlıktaki ekleme düğmesi
              "Vazgeç"e dönüşüyordu, o düğme "+"a taşınınca formu kapatmanın
              yolu kalmıyordu. */}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", background: c.primary, color: c.onPrimary, fontSize: 14 }}
            >
              {saving ? "Kaydediliyor…" : formMode.kind === "edit" ? "Güncelle" : "Kaydet"}
            </button>
            <button
              onClick={closeForm}
              style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${c.border}`, background: "transparent", color: c.textSecondary, fontSize: 14 }}
            >
              Vazgeç
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p style={{ fontSize: 13, color: c.textSecondary, margin: 0 }}>Yükleniyor…</p>
      ) : parties.length === 0 ? (
        <p style={{ fontSize: 13, color: c.textSecondary, margin: 0 }}>
          Henüz müşteri kaydı yok. Satış ve Müşteri İlişkileri aynı listeyi görür.
          {canWrite && fabAvailable ? ' Eklemek için sayfadaki "+" düğmesini kullan.' : ""}
        </p>
      ) : visible.length === 0 ? (
        <p style={{ fontSize: 13, color: c.textSecondary, margin: 0 }}>Aramanla eşleşen kayıt yok.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {hasActiveFilter && (
            <span style={{ fontSize: 12, color: c.textSecondary }}>
              {visible.length} / {parties.length} kayıt
            </span>
          )}
          {visible.map((p) => (
            <div key={p.id} style={{ display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: c.background,
                }}
              >
                <button
                  type="button"
                  onClick={() => setOpenPartyId(openPartyId === p.id ? null : p.id)}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    textAlign: "left",
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, color: c.textPrimary }}>{p.displayName}</span>
                    {p.roles.map((r) => (
                      <span
                        key={r}
                        style={{
                          fontSize: 10,
                          padding: "1px 6px",
                          borderRadius: 6,
                          color: ROLE_COLORS[r],
                          border: `1px solid ${ROLE_COLORS[r]}40`,
                        }}
                      >
                        {ROLE_LABELS[r]}
                      </span>
                    ))}
                  </div>
                  {profile.detail(p) && (
                    <div style={{ fontSize: 12, color: c.textSecondary, marginTop: 2 }}>{profile.detail(p)}</div>
                  )}
                </button>
                {canWrite && (
                  <>
                    <button
                      onClick={() => openEdit(p)}
                      style={{ fontSize: 12, color: c.primary, background: "transparent", border: "none", cursor: "pointer" }}
                    >
                      Düzenle
                    </button>
                    <button
                      onClick={() => handleArchive(p)}
                      aria-label="Arşivle"
                      title="Arşivle"
                      style={{ background: "transparent", border: "none", cursor: "pointer" }}
                    >
                      <IconTrash size={14} color={c.textSecondary} />
                    </button>
                  </>
                )}
              </div>

              {openPartyId === p.id && <PartyDetail party={p} canWrite={canWrite} profile={profile.primaryActionLabel} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
  style,
}: {
  label: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const c = useThemeColors();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, ...style }}>
      <label style={{ fontSize: 12, color: c.textSecondary }}>{label}</label>
      {children}
    </div>
  );
}

/**
 * Müşteri kartının altı: temas geçmişi ve kurumdaki kişiler.
 *
 * Geçmiş akışına diğer modüller de yazar (fatura kesildi, destek talebi
 * açıldı) — "modüller birbirini besliyor" tezinin görünür yüzü burasıdır.
 */
function PartyDetail({ party, canWrite, profile }: { party: Party; canWrite: boolean; profile: string }) {
  const c = useThemeColors();
  const [tab, setTab] = useState<"activity" | "contacts">("activity");
  const [activities, setActivities] = useState<PartyActivity[]>([]);
  const [contacts, setContacts] = useState<PartyContact[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.get<PartyActivity[]>(`/party/${party.id}/activities`).then(setActivities).catch(() => setActivities([]));
    api.get<PartyContact[]>(`/party/${party.id}/contacts`).then(setContacts).catch(() => setContacts([]));
  };

  useEffect(load, [party.id]);

  const addActivity = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      await api.post(`/party/${party.id}/activities`, { type: "not", summary: draft.trim() });
      setDraft("");
      load();
    } finally {
      setBusy(false);
    }
  };

  const addContact = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      await api.post(`/party/${party.id}/contacts`, { name: draft.trim() });
      setDraft("");
      load();
    } finally {
      setBusy(false);
    }
  };

  const tabStyle = (active: boolean) => ({
    fontSize: 12,
    padding: "3px 8px",
    borderRadius: 6,
    border: "none",
    cursor: "pointer",
    background: active ? c.primary : "transparent",
    color: active ? "#fff" : c.textSecondary,
  });

  return (
    <div
      style={{
        margin: "4px 0 2px 10px",
        padding: "10px 12px",
        borderLeft: `2px solid ${c.border}`,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={() => setTab("activity")} style={tabStyle(tab === "activity")}>
          Geçmiş {activities.length > 0 && `(${activities.length})`}
        </button>
        <button onClick={() => setTab("contacts")} style={tabStyle(tab === "contacts")}>
          Kişiler {contacts.length > 0 && `(${contacts.length})`}
        </button>
      </div>

      {canWrite && (
        <div style={{ display: "flex", gap: 6 }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={tab === "activity" ? profile : "Kişi adı"}
            onKeyDown={(e) => e.key === "Enter" && (tab === "activity" ? addActivity() : addContact())}
            style={{ flex: 1, fontSize: 13, padding: "5px 8px" }}
          />
          <button
            onClick={tab === "activity" ? addActivity : addContact}
            disabled={busy || !draft.trim()}
            style={{
              fontSize: 12,
              padding: "5px 12px",
              borderRadius: 6,
              border: "none",
              background: c.primary,
              color: c.onPrimary,
              cursor: "pointer",
            }}
          >
            Ekle
          </button>
        </div>
      )}

      {tab === "activity" ? (
        activities.length === 0 ? (
          <p style={{ fontSize: 12, color: c.textSecondary, margin: 0 }}>Henüz temas kaydı yok.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {activities.map((a) => (
              <div key={a.id} style={{ fontSize: 12, color: c.textPrimary }}>
                <span style={{ color: c.textSecondary }}>{a.occurredAt.slice(0, 10)} · </span>
                {a.summary}
                {a.userName && <span style={{ color: c.textSecondary }}> — {a.userName}</span>}
              </div>
            ))}
          </div>
        )
      ) : contacts.length === 0 ? (
        <p style={{ fontSize: 12, color: c.textSecondary, margin: 0 }}>Henüz kişi eklenmemiş.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {contacts.map((ct) => (
            <div key={ct.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <span style={{ flex: 1, color: c.textPrimary }}>
                {ct.name}
                {ct.title && <span style={{ color: c.textSecondary }}> · {ct.title}</span>}
                {ct.isPrimary && <span style={{ color: c.primary }}> · birincil</span>}
              </span>
              {canWrite && (
                <button
                  onClick={async () => {
                    await api.delete(`/party-contacts/${ct.id}`);
                    load();
                  }}
                  aria-label="Kişiyi çıkar"
                  style={{ background: "transparent", border: "none", cursor: "pointer", padding: 2 }}
                >
                  <IconX size={12} color={c.textSecondary} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
