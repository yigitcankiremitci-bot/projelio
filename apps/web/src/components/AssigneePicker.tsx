import { useEffect, useRef, useState } from "react";
import type { DepartmentMember, ProjectMember } from "@projelio/shared";
import { api } from "../api/client";
import { colors } from "../theme/colors";

// Hem proje ekibi hem departman kadrosu için ortak, minimal görüntü şekli.
interface PickableMember {
  userId: string;
  fullName?: string;
  username?: string;
}

interface Props {
  // İkisinden biri verilmeli: proje görevleri için projectId, departman
  // görevleri için departmentId.
  projectId?: string;
  departmentId?: string;
  value: string; // seçili kullanıcı id'si ("" = atanmamış)
  onChange: (userId: string, name?: string) => void;
  placeholder?: string;
  /**
   * Çoklu atama kipi (bkz. migration 053). Açıkken `values`/`onChangeValues`
   * kullanılır; `value`/`onChange` yok sayılır. Ayrı bir bileşen yazmak yerine
   * aynı seçiciyi genişletiyoruz: ekip listesini çekme, arama ve dışarı tıklayınca
   * kapanma davranışı ikisinde de birebir aynı olmalı.
   */
  multiple?: boolean;
  values?: string[];
  onChangeValues?: (userIds: string[]) => void;
}

/**
 * Görev atama seçici: tüm kullanıcıları listeleyen açılır kutu yerine, yalnızca
 * ilgili projenin ekibini (sahip + üyeler) ya da departmanın kadrosunu gösterir
 * ve ada/kullanıcı adına göre yazarak arama yapılmasını sağlar.
 */
export default function AssigneePicker({
  projectId,
  departmentId,
  value,
  onChange,
  placeholder = "İsim yazarak ara…",
  multiple = false,
  values = [],
  onChangeValues,
}: Props) {
  const c = colors.light;
  const [members, setMembers] = useState<PickableMember[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (departmentId) {
      api
        .get<DepartmentMember[]>(`/departments/${departmentId}/members`)
        .then((list) =>
          setMembers(
            list
              .filter((m) => m.status === "approved" && m.userId)
              .map((m) => ({ userId: m.userId as string, fullName: m.fullName, username: m.username }))
          )
        )
        .catch(() => setMembers([]));
      return;
    }
    if (!projectId) {
      setMembers([]);
      return;
    }
    api
      .get<ProjectMember[]>(`/projects/${projectId}/members`)
      .then((list) =>
        setMembers(
          list
            .filter((m) => m.status === "approved" || m.role === "owner")
            .map((m) => ({ userId: m.userId, fullName: m.fullName, username: m.username }))
        )
      )
      .catch(() => setMembers([]));
  }, [projectId, departmentId]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const selected = members.find((m) => m.userId === value);
  const q = query.trim().toLocaleLowerCase("tr-TR");
  const matches = (m: PickableMember) =>
    !q ||
    (m.fullName ?? "").toLocaleLowerCase("tr-TR").includes(q) ||
    (m.username ?? "").toLocaleLowerCase("tr-TR").includes(q);
  // Çoklu kipte zaten seçilmiş olanlar listeden düşer: aynı kişiyi ikinci kez
  // eklemek diye bir şey yok, listede durması yalnızca kafa karıştırır.
  const filtered = members.filter((m) => matches(m) && !(multiple && values.includes(m.userId)));

  const label = (m?: PickableMember) => m?.fullName ?? m?.username ?? "Seçili kişi";
  const selectedMembers = multiple
    ? values.map((id) => members.find((m) => m.userId === id) ?? { userId: id })
    : [];

  if (multiple) {
    return (
      <div ref={rootRef} style={{ position: "relative" }}>
        {selectedMembers.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
            {selectedMembers.map((m, i) => (
              <span
                key={m.userId}
                // İlk rozet birincil atanan: listelerde tek yüz gösterildiğinde
                // görünen kişi bu (bkz. tasks.assigned_to).
                title={i === 0 ? "Birincil atanan" : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 8px 5px 10px",
                  borderRadius: 999,
                  fontSize: 14,
                  color: c.textPrimary,
                  background: i === 0 ? `${c.primary}14` : c.background,
                  border: `1px solid ${i === 0 ? c.primary : c.border}`,
                }}
              >
                {label(m as PickableMember)}
                <button
                  type="button"
                  onClick={() => onChangeValues?.(values.filter((id) => id !== m.userId))}
                  aria-label={`${label(m as PickableMember)} atamasını kaldır`}
                  style={{ background: "transparent", border: "none", color: c.textSecondary, fontSize: 15, padding: 0, cursor: "pointer" }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={
            members.length === 0
              ? departmentId
                ? "Bu departmanda kadro üyesi yok"
                : "Bu projede ekip üyesi yok"
              : "Kişi eklemek için isim yaz…"
          }
          disabled={members.length === 0}
          style={{ width: "100%", fontSize: 16 }}
        />

        {open && filtered.length > 0 && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              marginTop: 4,
              maxHeight: 200,
              overflowY: "auto",
              background: c.surface,
              border: `1px solid ${c.border}`,
              borderRadius: 10,
              boxShadow: "0 6px 20px rgba(26,31,41,0.14)",
              zIndex: 20,
            }}
          >
            {filtered.map((m) => (
              <button
                key={m.userId}
                type="button"
                onClick={() => {
                  onChangeValues?.([...values, m.userId]);
                  setQuery("");
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  textAlign: "left",
                  padding: "9px 12px",
                  background: "transparent",
                  border: "none",
                  borderBottom: `1px solid ${c.border}`,
                  color: c.textPrimary,
                  fontSize: 16,
                  cursor: "pointer",
                }}
              >
                {m.fullName ?? m.username}
                {m.username && <span style={{ color: c.textSecondary, fontSize: 13 }}>@{m.username}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      {selected ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            minHeight: 42,
            padding: "0 12px",
            borderRadius: 8,
            border: `1px solid ${c.border}`,
            background: c.background,
          }}
        >
          <span style={{ fontSize: 16, color: c.textPrimary }}>
            {selected.fullName ?? selected.username ?? "Seçili kişi"}
            {selected.username && (
              <span style={{ fontSize: 13, color: c.textSecondary, marginLeft: 6 }}>@{selected.username}</span>
            )}
          </span>
          <button
            type="button"
            onClick={() => {
              onChange("", undefined);
              setQuery("");
              setOpen(true);
            }}
            aria-label="Atamayı kaldır"
            style={{ background: "transparent", border: "none", color: c.textSecondary, fontSize: 17, padding: 4 }}
          >
            ×
          </button>
        </div>
      ) : (
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={members.length === 0 ? (departmentId ? "Bu departmanda kadro üyesi yok" : "Bu projede ekip üyesi yok") : placeholder}
          disabled={members.length === 0}
          style={{ width: "100%", fontSize: 16 }}
        />
      )}

      {open && !selected && filtered.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: 4,
            maxHeight: 200,
            overflowY: "auto",
            background: c.surface,
            border: `1px solid ${c.border}`,
            borderRadius: 10,
            boxShadow: "0 6px 20px rgba(26,31,41,0.14)",
            zIndex: 20,
          }}
        >
          {filtered.map((m) => (
            <button
              key={m.userId}
              type="button"
              onClick={() => {
                onChange(m.userId, m.fullName ?? m.username);
                setOpen(false);
                setQuery("");
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                textAlign: "left",
                padding: "9px 12px",
                background: "transparent",
                border: "none",
                borderBottom: `1px solid ${c.border}`,
                color: c.textPrimary,
                fontSize: 16,
              }}
            >
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  background: c.background,
                  border: `1px solid ${c.border}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  fontWeight: 600,
                  color: c.primary,
                  flexShrink: 0,
                }}
              >
                {(m.fullName ?? m.username ?? "?").slice(0, 1).toLocaleUpperCase("tr-TR")}
              </span>
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {m.fullName ?? m.username}
                {m.username && <span style={{ color: c.textSecondary, fontSize: 13, marginLeft: 6 }}>@{m.username}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
