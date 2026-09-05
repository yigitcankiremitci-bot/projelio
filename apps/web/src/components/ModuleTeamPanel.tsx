import { useEffect, useState } from "react";
import type { DepartmentMember, JobMember, ModuleAccess, ModuleMember, ModuleMemberRole } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import { FAB_PRIORITY, useFabAvailable, useProjectFabAction } from "../lib/projectFab";
import { IconX } from "./icons";
import { useT } from "../lib/i18n";

// Kayıtların sahibi module_records ile aynı desende iki türlü olabilir: bir
// organizasyon (departman modülleri) ya da bir iş (serbest çalışan modülleri).
interface Props {
  organizationId?: string;
  departmentId?: string;
  jobId?: string;
  moduleKey: string;
  // Yetki üst bileşende zaten çözülmüşse tekrar sorgulamamak için verilebilir.
  access?: ModuleAccess;
}

const ROLE_LABELS: Record<ModuleMemberRole, string> = {
  manager: "Modül yöneticisi",
  employee: "Çalışan",
  subcontractor: "Dış kaynak",
};

const ROLE_HINTS: Record<ModuleMemberRole, string> = {
  manager: "Kayıtları ve modül ekibini yönetir",
  employee: "Kayıt ekler ve düzenler",
  subcontractor: "Kayıt ekler ve düzenler, ekibi göremez",
};

function displayName(m: { fullName?: string; username?: string; email?: string; inviteEmail?: string }): string {
  return m.fullName ?? m.username ?? m.email ?? m.inviteEmail ?? "İsimsiz";
}

/**
 * Modül ekibi: bir modüle atanmış kişiler ve rolleri.
 *
 * Bu panel eklenene kadar modüle kayıt girme yetkisi yalnızca organizasyon
 * sahibinde ve departman yöneticisindeydi; "modüle atanan kişiler o modülde
 * çalışmaya başlar" vaadinin arayüz karşılığı yoktu.
 * Bkz. database/migrations/042_module_members.sql
 */
export default function ModuleTeamPanel({ organizationId, departmentId, jobId, moduleKey, access }: Props) {
  const c = useThemeColors();
  const t = useT();
  const [members, setMembers] = useState<ModuleMember[]>([]);
  const [resolved, setResolved] = useState<ModuleAccess | undefined>(access);
  const [candidates, setCandidates] = useState<{ userId: string; label: string }[]>([]);
  /**
   * Aday listesi neden boş? Üç ayrı sebep var ve kullanıcıya hepsi "kimse yok"
   * diye görünüyordu:
   *   - istek başarısız oldu (eskiden sessizce yutuluyordu),
   *   - kadro gerçekten boş,
   *   - kadro dolu ama kimse ATANABİLİR değil (daveti kabul etmemiş, hesabı yok,
   *     ya da zaten bu modüle atanmış).
   * Üçü için üç ayrı cümle gerekiyor; yoksa kullanıcı "kadroda kişi var, neden
   * yok diyor" diye takılıp kalıyor.
   */
  const [candidateState, setCandidateState] = useState<{ toplam: number; hata: boolean }>({ toplam: 0, hata: false });
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const scopePath = jobId ? `/jobs/${jobId}` : `/organizations/${organizationId}`;
  const listQuery = `?moduleKey=${encodeURIComponent(moduleKey)}${departmentId ? `&departmentId=${departmentId}` : ""}`;

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<ModuleMember[]>(`${scopePath}/module-members${listQuery}`).catch(() => []),
      access
        ? Promise.resolve(access)
        : api.get<ModuleAccess>(`${scopePath}/module-access${listQuery}`).catch(() => undefined),
    ])
      .then(([list, acc]) => {
        setMembers(list);
        setResolved(acc ?? undefined);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [scopePath, moduleKey, departmentId]);

  // Atanabilecek kişiler: organizasyonda departmanın kadrosu, serbest çalışanda
  // işe alınmış kişiler. Zaten atanmış olanlar listeden düşülür.
  useEffect(() => {
    if (!adding) return;
    const assigned = new Set(members.map((m) => m.userId).filter(Boolean));
    if (jobId) {
      api
        .get<JobMember[]>(`/jobs/${jobId}/members`)
        .then((list) => {
          // Yanıt bekleyen / reddetmiş davetler ekipten sayılmaz — modüle
          // atanacak kişiler yalnızca daveti kabul etmiş olanlardır
          // (departman tarafındaki status === "approved" kuralıyla aynı).
          setCandidates(
            list
              .filter((m) => m.status === "approved" && !assigned.has(m.userId))
              .map((m) => ({ userId: m.userId, label: displayName(m) }))
          );
          setCandidateState({ toplam: list.length, hata: false });
        })
        .catch(() => {
          setCandidates([]);
          setCandidateState({ toplam: 0, hata: true });
        });
      return;
    }
    if (!departmentId) {
      setCandidates([]);
      return;
    }
    api
      .get<DepartmentMember[]>(`/departments/${departmentId}/members`)
      .then((list) => {
        setCandidates(
          list
            .filter((m) => m.userId && m.status === "approved" && !assigned.has(m.userId))
            .map((m) => ({ userId: m.userId as string, label: `${displayName(m)}${m.title ? ` · ${m.title}` : ""}` }))
        );
        setCandidateState({ toplam: list.length, hata: false });
      })
      .catch(() => {
        setCandidates([]);
        setCandidateState({ toplam: 0, hata: true });
      });
  }, [adding, jobId, departmentId, members]);

  const canManage = resolved?.canManageTeam ?? false;

  const assign = async (userId: string, role: ModuleMemberRole) => {
    setError("");
    setBusyId(userId);
    try {
      await api.post(`${scopePath}/module-members`, {
        moduleKey,
        ...(departmentId && !jobId ? { departmentId } : {}),
        userId,
        role,
      });
      setAdding(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Atanamadı");
    } finally {
      setBusyId(null);
    }
  };

  const changeRole = async (id: string, role: ModuleMemberRole) => {
    setError("");
    setBusyId(id);
    try {
      await api.patch(`/module-members/${id}`, { role });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rol değiştirilemedi");
    } finally {
      setBusyId(null);
    }
  };

  // Çıkarma kaydı silmez, "removed" olarak işaretler — kimin ne zaman hangi
  // modülde çalıştığı bilgisi korunur.
  const remove = async (id: string) => {
    setError("");
    setBusyId(id);
    try {
      await api.delete(`/module-members/${id}`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Çıkarılamadı");
    } finally {
      setBusyId(null);
    }
  };

  // Modüle kişi atama da sayfanın "+" düğmesinde: modül sayfasında "+" hem
  // modülün kendi ekleme eylemini hem bunu tek menüde toplar (bkz.
  // lib/projectFab.tsx mergeActions). Modal içinde "+" ulaşılamadığı için
  // başlıktaki "Kişi ata" düğmesi orada geri gelir.
  const fabAvailable = useFabAvailable();
  useProjectFabAction(
    canManage && fabAvailable && !loading && resolved?.role !== "subcontractor"
      ? { label: "Kişi ata", onClick: () => setAdding(true) }
      : null,
    [canManage, fabAvailable, loading, resolved?.role, moduleKey],
    FAB_PRIORITY.panel
  );

  if (loading) return <p style={{ fontSize: 13, color: c.textSecondary, margin: 0 }}>{t("Ekip yükleniyor…")}</p>;

  // Dış kaynak rolündeki kişi ekibi göremez (bkz. 042 rol açıklamaları).
  if (resolved?.role === "subcontractor") return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: c.textPrimary }}>
          Modül ekibi{members.length > 0 ? ` · ${members.length}` : ""}
        </span>
        {canManage && !fabAvailable && (
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            style={{
              background: "transparent",
              border: "none",
              padding: "2px 4px",
              fontSize: 13,
              fontWeight: 500,
              color: c.primary,
              cursor: "pointer",
            }}
          >
            {adding ? "Vazgeç" : "Kişi ata"}
          </button>
        )}
      </div>

      {members.length === 0 ? (
        <p style={{ fontSize: 13, color: c.textSecondary, margin: 0 }}>
          {canManage
            ? "Bu modüle henüz kimse atanmadı. Atanan kişiler burada kayıt oluşturup düzenleyebilir."
            : "Bu modüle henüz kimse atanmadı."}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {members.map((m) => (
            <div
              key={m.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 8px",
                borderRadius: 8,
                background: c.background,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    color: c.textPrimary,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {displayName(m)}
                  {m.status === "invited" && (
                    <span style={{ fontSize: 12, color: c.textSecondary }}> {t("· davet bekliyor")}</span>
                  )}
                </div>
              </div>

              {canManage ? (
                <select
                  value={m.role}
                  disabled={busyId === m.id}
                  onChange={(e) => changeRole(m.id, e.target.value as ModuleMemberRole)}
                  title={ROLE_HINTS[m.role]}
                  style={{
                    fontSize: 12,
                    color: c.textSecondary,
                    background: "transparent",
                    border: `1px solid ${c.border}`,
                    borderRadius: 6,
                    padding: "2px 4px",
                  }}
                >
                  {(Object.keys(ROLE_LABELS) as ModuleMemberRole[]).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              ) : (
                <span style={{ fontSize: 12, color: c.textSecondary }}>{ROLE_LABELS[m.role]}</span>
              )}

              {canManage && (
                <button
                  type="button"
                  onClick={() => remove(m.id)}
                  disabled={busyId === m.id}
                  aria-label={t("Modülden çıkar")}
                  title={t("Modülden çıkar")}
                  style={{ background: "transparent", border: "none", padding: 4, flexShrink: 0, cursor: "pointer" }}
                >
                  <IconX size={13} color={c.textSecondary} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {adding && canManage && (
        <div
          style={{
            border: `1px solid ${c.border}`,
            borderRadius: 8,
            padding: 10,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {candidates.length === 0 ? (
            <p style={{ fontSize: 13, color: candidateState.hata ? c.danger : c.textSecondary, margin: 0 }}>
              {candidateState.hata
                ? "Kadro listesi yüklenemedi. Sayfayı yenileyip tekrar dene."
                : candidateState.toplam === 0
                  ? jobId
                    ? "Bu işin ekibi henüz boş. Önce ekibe kişi ekle."
                    : "Bu departmanın kadrosu henüz boş. Önce kadroya kişi ekle."
                  : "Kadrodaki herkes ya bu modüle zaten atanmış ya da daveti henüz kabul etmemiş. " +
                    "Daveti bekleyenler kabul edince burada görünür."}
            </p>
          ) : (
            candidates.map((p) => (
              <div key={p.userId} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: c.textPrimary }}>{p.label}</span>
                <button
                  type="button"
                  onClick={() => assign(p.userId, "employee")}
                  disabled={busyId === p.userId}
                  style={{
                    fontSize: 12,
                    padding: "4px 10px",
                    borderRadius: 6,
                    border: "none",
                    background: c.primary,
                    color: c.onPrimary,
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  {t("Ata")}
                </button>
              </div>
            ))
          )}
          {/* Vazgeçme listenin içinde: başlıktaki düğme sayfanın "+"ına taşındı. */}
          <button
            type="button"
            onClick={() => setAdding(false)}
            style={{
              alignSelf: "flex-start",
              background: "transparent",
              border: "none",
              padding: 0,
              fontSize: 12,
              color: c.textSecondary,
              cursor: "pointer",
            }}
          >
            {t("Vazgeç")}
          </button>
        </div>
      )}

      {error && <p style={{ color: c.danger, fontSize: 12, margin: 0 }}>{error}</p>}
    </div>
  );
}
