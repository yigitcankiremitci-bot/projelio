import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

import type { DepartmentMember, DepartmentMemberRole, NotificationPayload, User } from "@projelio/shared";
import { api } from "../api/client";
import { getSocket } from "../lib/liveRoom";
import { useThemeColors } from "../theme/useThemeColors";
import { useFabAvailable } from "../lib/projectFab";
import { IconTrash } from "./icons";

export interface DepartmentMembersListHandle {
  openCreate: () => void;
}

const roleLabel: Record<DepartmentMemberRole, string> = {
  manager: "Departman Yöneticisi",
  employee: "Üretici Çalışan",
  subcontractor: "Taşeron",
};

const statusLabel: Record<string, string> = {
  invited: "Davet gönderildi",
  pending: "Onay bekliyor",
  approved: "Kadroda",
  rejected: "Reddedildi",
};

interface Props {
  departmentId: string;
  onChanged: () => void;
}

type InviteMode = "user" | "email";

// Departmana sorumlu/yönetici veya çalışan ataması iki şekilde yapılabilir:
// sistemde zaten kayıtlı bir kullanıcıyı adı/e-postasıyla arayıp seçerek
// (HireMemberModal ile aynı /users/search deseni), ya da henüz hesabı olmayan
// biri için doğrudan e-posta ile davet göndererek.
const DepartmentMembersList = forwardRef<DepartmentMembersListHandle, Props>(function DepartmentMembersList(
  { departmentId, onChanged },
  ref
) {
  const c = useThemeColors();
  const [members, setMembers] = useState<DepartmentMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);

  useImperativeHandle(ref, () => ({
    openCreate: () => setInviting(true),
  }));
  // Kadroya davet sayfanın "+" düğmesinde (kaydı DepartmentDetail yapıyor,
  // yetkiyi de orada denetliyor). Başlıktaki düğme onun kopyasıydı.
  const fabAvailable = useFabAvailable();
  const [mode, setMode] = useState<InviteMode>("user");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [role, setRole] = useState<DepartmentMemberRole>("employee");
  const [error, setError] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [responding, setResponding] = useState(false);

  useEffect(() => {
    api
      .get<{ id: string } | null>("/auth/me")
      .then((me) => setCurrentUserId(me?.id ?? null))
      .catch(() => setCurrentUserId(null));
  }, []);

  // Bu departmanla ilgili bir bildirim (davet onayı/reddi, yeni kadro daveti…)
  // canlı olarak gelirse listeyi otomatik yenile — böylece bir yönetici bu
  // sayfayı açık tutuyorken, davet ettiği kişi onay verdiği an "onay bekliyor"
  // yazısı sayfayı yenilemeye gerek kalmadan "kadroda"ya döner.
  useEffect(() => {
    if (!currentUserId) return;
    const token = localStorage.getItem("projelio_token");
    if (!token) return;
    // Uygulamanın tek soketi (bkz. lib/liveRoom.ts): kimlik doğrulaması orada
    // bir kez yapılıyor, bağlantı kapatılmaz, yalnızca dinleyici kalkar.
    const socket = getSocket();
    if (!socket) return;
    const onNotification = (notification: NotificationPayload) => {
      if (notification.link === `/departments/${departmentId}`) load();
    };
    socket.on("notification", onNotification);
    return () => {
      socket.off("notification", onNotification);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, departmentId]);

  const load = () => {
    setLoading(true);
    api
      .get<DepartmentMember[]>(`/departments/${departmentId}/members`)
      .then(setMembers)
      .catch(() => setMembers([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, [departmentId]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const term = query.trim().replace(/^@/, "");
    if (!term) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const existingUserIds = members.map((m) => m.userId).filter((v): v is string => !!v);
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

  const resetInviteForm = () => {
    setSelectedUser(null);
    setQuery("");
    setResults([]);
    setEmail("");
    setTitle("");
    setRole("employee");
    setError("");
  };

  const handleInvite = async () => {
    if (mode === "user" && !selectedUser) {
      setError("Bir kullanıcı seç");
      return;
    }
    if (mode === "email" && !email.trim()) {
      setError("E-posta gerekli");
      return;
    }
    setError("");
    try {
      await api.post(`/departments/${departmentId}/members`, {
        userId: mode === "user" ? selectedUser?.id : undefined,
        inviteEmail: mode === "email" ? email.trim() : undefined,
        role,
        title: title.trim() || undefined,
      });
      resetInviteForm();
      setInviting(false);
      load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Davet gönderilemedi");
    }
  };

  const handleRemove = async (id: string) => {
    await api.patch(`/department-members/${id}/remove`, {}).catch(() => {});
    load();
    onChanged();
  };

  /**
   * Kendi kadro kaydım — varsa "Kadrodan ayrıl" düğmesi gösterilir.
   * Kullanıcı bir departmana eklendiği için orada kalmaya mahkûm olmamalı;
   * bugüne kadar ayrılmanın tek yolu org sahibine haber verip çıkarılmayı
   * beklemekti.
   */
  const myMembership = currentUserId
    ? members.find((m) => m.userId === currentUserId && m.status === "approved")
    : undefined;
  const myLeavePending = currentUserId
    ? members.find((m) => m.userId === currentUserId && m.status === "leave_pending")
    : undefined;

  const handleLeave = async () => {
    if (!window.confirm("Bu departmanın kadrosundan ayrılmak istediğine emin misin?")) return;
    // Son yönetici ayrılıyorsa sunucu ayrılmayı hemen uygulamaz, organizasyon
    // sahibinin onayına düşürür (bkz. 061) — kullanıcı beklediğini sanmasın.
    const result = await api
      .patch<{ success: true; pendingApproval: boolean }>(`/departments/${departmentId}/members/me/leave`, {})
      .catch(() => null);
    if (result?.pendingApproval) {
      window.alert(
        "Bu departmanın son yöneticisisin. Ayrılma talebin şirket kurucusuna iletildi; onaylanana kadar yöneticiliğin sürüyor."
      );
    }
    load();
    onChanged();
  };

  /**
   * Bekleyen ayrılma talepleri. Yalnızca organizasyon sahibi yanıtlayabilir;
   * sunucu da aynı kuralı uyguluyor, buradaki liste yalnızca görünürlük için.
   */
  const leaveRequests = members.filter((m) => m.status === "leave_pending");

  const respondToLeave = async (id: string, approve: boolean) => {
    await api.patch(`/department-members/${id}/leave-request/respond`, { approve }).catch(() => {});
    load();
    onChanged();
  };

  // Davet edilen kişi kendi hesabıyla bu sayfayı açtığında ("Kadro Daveti"
  // bildirimindeki link ile) kendi bekleyen davetini burada görüp onaylar/reddeder.
  const myPendingInvite = currentUserId
    ? members.find((m) => m.userId === currentUserId && m.status === "pending")
    : undefined;

  const handleRespond = async (approve: boolean) => {
    if (!myPendingInvite) return;
    setResponding(true);
    try {
      await api.patch(`/department-members/${myPendingInvite.id}/respond`, { approve });
      load();
      onChanged();
    } catch {
      // sessizce yeniden dene bırakılır — buton tekrar tıklanabilir olsun diye
    } finally {
      setResponding(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {myLeavePending && (
        <div style={{ fontSize: 13, color: c.textSecondary, textAlign: "right" }}>
          Ayrılma talebin şirket kurucusunun onayını bekliyor.
        </div>
      )}

      {myMembership && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={handleLeave}
            style={{
              padding: "6px 12px",
              fontSize: 13,
              borderRadius: 8,
              border: `1px solid ${c.border}`,
              background: "transparent",
              color: c.danger,
              cursor: "pointer",
            }}
          >
            Kadrodan ayrıl
          </button>
        </div>
      )}

      {leaveRequests.map((m) => (
        <div
          key={m.id}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            background: `${c.danger}12`,
            border: `1px solid ${c.danger}`,
            borderRadius: 10,
            padding: 12,
          }}
        >
          <div style={{ fontSize: 15, color: c.textPrimary }}>
            <strong>{m.fullName ?? m.inviteEmail ?? "Bir yönetici"}</strong> bu departmanın son yöneticisi ve
            ayrılmak istiyor. Onaylarsan departman yöneticisiz kalır — önce yerine birini atamak isteyebilirsin.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => respondToLeave(m.id, true)}
              style={{ padding: "7px 14px", fontSize: 14, borderRadius: 8, border: "none", background: c.danger, color: "#fff", cursor: "pointer" }}
            >
              Ayrılmasını onayla
            </button>
            <button
              type="button"
              onClick={() => respondToLeave(m.id, false)}
              style={{ padding: "7px 14px", fontSize: 14, borderRadius: 8, border: `1px solid ${c.border}`, background: "transparent", color: c.textSecondary, cursor: "pointer" }}
            >
              Reddet
            </button>
          </div>
        </div>
      ))}

      {myPendingInvite && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            background: `${c.primary}14`,
            border: `1px solid ${c.primary}`,
            borderRadius: 10,
            padding: 12,
          }}
        >
          <div style={{ fontSize: 15, color: c.textPrimary }}>
            Bu departmana{myPendingInvite.title ? ` "${myPendingInvite.title}"` : ""} pozisyonu için davet edildin
            ({roleLabel[myPendingInvite.role]}).
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => handleRespond(true)}
              disabled={responding}
              style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", background: c.primary, color: c.onPrimary, fontSize: 14, fontWeight: 500 }}
            >
              Onayla
            </button>
            <button
              onClick={() => handleRespond(false)}
              disabled={responding}
              style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: `1px solid ${c.border}`, background: "transparent", color: c.textPrimary, fontSize: 14 }}
            >
              Reddet
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h4 style={{ fontSize: 15, fontWeight: 500, color: c.textPrimary, margin: 0 }}>Kadro</h4>
        {!fabAvailable && (
          <button
            onClick={() => {
              setInviting((v) => !v);
              resetInviteForm();
            }}
            style={{ fontSize: 13, color: c.primary, background: "transparent", border: "none" }}
          >
            {inviting ? "Vazgeç" : "+ Kişi davet et"}
          </button>
        )}
      </div>

      {inviting && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, background: c.background, borderRadius: 10, padding: 10 }}>
          <div style={{ display: "flex", gap: 4, background: c.surface, border: `1px solid ${c.border}`, borderRadius: 8, padding: 3 }}>
            <button
              type="button"
              onClick={() => {
                setMode("user");
                setError("");
              }}
              style={{
                flex: 1,
                padding: "6px 0",
                borderRadius: 6,
                border: "none",
                background: mode === "user" ? c.primary : "transparent",
                color: mode === "user" ? "#fff" : c.textSecondary,
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              Sistem kullanıcısı
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("email");
                setError("");
              }}
              style={{
                flex: 1,
                padding: "6px 0",
                borderRadius: 6,
                border: "none",
                background: mode === "email" ? c.primary : "transparent",
                color: mode === "email" ? "#fff" : c.textSecondary,
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              E-posta ile davet
            </button>
          </div>

          {mode === "user" ? (
            selectedUser ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  border: `1px solid ${c.border}`,
                  borderRadius: 8,
                  padding: "8px 10px",
                  background: c.surface,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, color: c.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {selectedUser.fullName}
                  </div>
                  <div style={{ fontSize: 12, color: c.textSecondary }}>
                    @{selectedUser.username} · {selectedUser.email}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedUser(null);
                    setQuery("");
                  }}
                  style={{ background: "transparent", border: "none", color: c.textSecondary, fontSize: 13 }}
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
                  style={{ width: "100%" }}
                />
                {query.trim() && (
                  <div style={{ border: `1px solid ${c.border}`, borderRadius: 8, maxHeight: 180, overflowY: "auto", background: c.surface }}>
                    {searching ? (
                      <p style={{ fontSize: 13, color: c.textSecondary, margin: 0, padding: "8px 10px" }}>Aranıyor…</p>
                    ) : results.length === 0 ? (
                      <p style={{ fontSize: 13, color: c.textSecondary, margin: 0, padding: "8px 10px" }}>Sonuç bulunamadı.</p>
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
                            padding: "7px 10px",
                            background: "transparent",
                            border: "none",
                            borderBottom: `1px solid ${c.border}`,
                          }}
                        >
                          <div style={{ fontSize: 14, color: c.textPrimary }}>{u.fullName}</div>
                          <div style={{ fontSize: 12, color: c.textSecondary }}>
                            @{u.username} · {u.email}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </>
            )
          ) : (
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-posta adresi" style={{ width: "100%" }} />
          )}

          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Pozisyon/unvan (opsiyonel)" style={{ width: "100%" }} />
          <select value={role} onChange={(e) => setRole(e.target.value as DepartmentMemberRole)} style={{ width: "100%" }}>
            <option value="employee">Üretici Çalışan</option>
            <option value="manager">Departman Yöneticisi</option>
            <option value="subcontractor">Taşeron</option>
          </select>
          {error && <p style={{ color: c.danger, fontSize: 13, margin: 0 }}>{error}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleInvite}
              style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", background: c.primary, color: c.onPrimary, fontSize: 14 }}
            >
              Davet gönder
            </button>
            {/* Vazgeçme formun içinde: başlıktaki düğme "+"a taşındı. */}
            <button
              onClick={() => {
                setInviting(false);
                resetInviteForm();
              }}
              style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${c.border}`, background: "transparent", color: c.textSecondary, fontSize: 14 }}
            >
              Vazgeç
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p style={{ fontSize: 14, color: c.textSecondary }}>Yükleniyor…</p>
      ) : members.length === 0 ? (
        <p style={{ fontSize: 14, color: c.textSecondary }}>Bu departmanda henüz kadro yok.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {members.map((m) => (
            <div
              key={m.id}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, background: c.background }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, color: c.textPrimary }}>{m.fullName ?? m.inviteEmail ?? m.email ?? "Davet bekleniyor"}</div>
                <div style={{ fontSize: 12, color: c.textSecondary }}>
                  {m.title ? `${m.title} · ` : ""}
                  {roleLabel[m.role]} · {statusLabel[m.status] ?? m.status}
                </div>
              </div>
              <button onClick={() => handleRemove(m.id)} aria-label="Kadrodan çıkar" style={{ background: "transparent", border: "none" }}>
                <IconTrash size={14} color={c.textSecondary} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

export default DepartmentMembersList;
