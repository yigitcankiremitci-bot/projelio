import { useEffect, useRef, useState } from "react";
import type { ProjectMember, User } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import Modal from "./Modal";

interface Props {
  projectId: string;
  existingUserIds: string[];
  onClose: () => void;
  onAdded: (member: ProjectMember) => void;
}

export default function AddMemberModal({ projectId, existingUserIds, onClose, onAdded }: Props) {
  const c = useThemeColors();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [title, setTitle] = useState("");
  const [isSubcontractor, setIsSubcontractor] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const term = query.trim().replace(/^@/, "");
    if (!term) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      api
        .get<User[]>(`/users/search?q=${encodeURIComponent(term)}`)
        .then((users) => setResults(users.filter((u) => !existingUserIds.includes(u.id))))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setSaving(true);
    setError("");
    try {
      const created = await api.post<ProjectMember>(`/projects/${projectId}/members`, {
        userId: selectedUser.id,
        role: isSubcontractor ? "subcontractor" : "member",
        title: title.trim() || undefined,
      });
      onAdded(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Üye eklenemedi. Tekrar dene.");
      setSaving(false);
    }
  };

  return (
    <Modal title="Ekibe üye ekle" onClose={onClose} maxWidth={380}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Kullanıcı</label>

          {selectedUser ? (
            <div
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
                <div style={{ fontSize: 16, color: c.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {selectedUser.fullName}
                </div>
                <div style={{ fontSize: 13, color: c.textSecondary }}>
                  @{selectedUser.username} · {selectedUser.email}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedUser(null);
                  setQuery("");
                }}
                style={{ background: "transparent", border: "none", color: c.textSecondary, fontSize: 14 }}
              >
                Değiştir
              </button>
            </div>
          ) : (
            <>
              <input
                type="text"
                placeholder="Kullanıcı adı (@) veya e-posta ile ara…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
                style={{ width: "100%" }}
              />
              {query.trim() && (
                <div style={{ border: `1px solid ${c.border}`, borderRadius: 8, maxHeight: 200, overflowY: "auto" }}>
                  {searching ? (
                    <p style={{ fontSize: 14, color: c.textSecondary, margin: 0, padding: "10px 12px" }}>Aranıyor…</p>
                  ) : results.length === 0 ? (
                    <p style={{ fontSize: 14, color: c.textSecondary, margin: 0, padding: "10px 12px" }}>
                      Sonuç bulunamadı.
                    </p>
                  ) : (
                    results.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          setSelectedUser(u);
                          setResults([]);
                        }}
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          padding: "8px 12px",
                          background: "transparent",
                          border: "none",
                          borderBottom: `1px solid ${c.border}`,
                        }}
                      >
                        <div style={{ fontSize: 15, color: c.textPrimary }}>{u.fullName}</div>
                        <div style={{ fontSize: 13, color: c.textSecondary }}>
                          @{u.username} · {u.email}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Görev / Unvan</label>
          <input
            type="text"
            placeholder="Örn. Elektrik taşeronu, Grafik tasarımcı…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, color: c.textPrimary }}>
          <input type="checkbox" checked={isSubcontractor} onChange={(e) => setIsSubcontractor(e.target.checked)} />
          Taşeron olarak ekle (projede sadece kendisine atanan görev/alt görevleri görür)
        </label>

        {error && <p style={{ color: c.danger, fontSize: 16, margin: 0 }}>{error}</p>}

        <button
          type="submit"
          disabled={saving || !selectedUser}
          style={{ background: c.primary, color: "#fff", padding: "10px 0", borderRadius: 8, border: "none", fontSize: 17, fontWeight: 500 }}
        >
          {saving ? "Ekleniyor…" : "Ekle"}
        </button>
      </form>
    </Modal>
  );
}
