import { useRef, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Operation, OperationOccurrence, OperationRoutine, OperationStatus } from "@projelio/shared";
import { api } from "../api/client";
import Modal from "../components/Modal";
import RoutineModal from "../components/RoutineModal";
import OperationHealthBadge, { AdherenceDots } from "../components/OperationHealthBadge";
import { colors } from "../theme/colors";
import { IconCalendar, IconCheck, IconEdit, IconUser } from "../components/icons";
import { useProjectFabAction } from "../lib/projectFab";
import { usePageHeader } from "../lib/pageHeader";

const periodLabel: Record<string, string> = { weekly: "hafta", monthly: "ay", yearly: "yıl" };

// Bir tekrarın o anki hali. "missed" yalnızca vade + tolerans geçtiğinde oluşur;
// bilinçli atlananlar (skipped) kaçırılmış sayılmaz.
type OccurrenceState = "done" | "missed" | "skipped" | "pending";

function occurrenceState(o: OperationOccurrence, graceDays: number): OccurrenceState {
  if (o.status === "completed") return "done";
  if (o.skippedAt) return "skipped";
  const due = new Date(o.occurrenceOn);
  due.setDate(due.getDate() + graceDays);
  return due < new Date(new Date().toDateString()) ? "missed" : "pending";
}

export default function OperationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const c = colors.light;

  const [operation, setOperation] = useState<Operation | null>(null);
  const [routines, setRoutines] = useState<OperationRoutine[]>([]);
  const [occurrences, setOccurrences] = useState<OperationOccurrence[]>([]);
  const [routineModal, setRoutineModal] = useState<{ routine?: OperationRoutine } | null>(null);
  const [statusPrompt, setStatusPrompt] = useState<OperationStatus | null>(null);

  const reload = () => {
    if (!id) return;
    api.get<Operation>(`/operations/${id}`).then(setOperation).catch(() => setOperation(null));
    api.get<OperationRoutine[]>(`/operations/${id}/routines`).then(setRoutines).catch(() => setRoutines([]));
    api.get<OperationOccurrence[]>(`/operations/${id}/occurrences`).then(setOccurrences).catch(() => setOccurrences([]));
  };

  useEffect(reload, [id]);

  useEffect(() => {
    if (operation?.title) document.title = `${operation.title} · Projelio`;
    return () => {
      document.title = "Projelio";
    };
  }, [operation?.title]);

  // Alt navigasyondaki "+" butonu bu sayfada doğrudan rutin ekler.
  useProjectFabAction(
    operation ? { label: "Yeni rutin", onClick: () => setRoutineModal({}) } : null,
    [operation]
  );

  const graceById = useMemo(
    () => new Map(routines.map((r) => [r.id, r.graceDays ?? 0])),
    [routines]
  );

  const today = new Date(new Date().toDateString());

  const upcoming = useMemo(
    () =>
      occurrences
        .filter((o) => new Date(o.occurrenceOn) >= today && o.status !== "completed" && !o.skippedAt)
        .slice(0, 20),
    [occurrences]
  );

  const overdue = useMemo(
    () =>
      occurrences.filter(
        (o) => occurrenceState(o, graceById.get(o.routineId) ?? 0) === "missed"
      ),
    [occurrences, graceById]
  );

  // Rutin kartındaki nokta ızgarası için son 12 tekrarın sonucu.
  const recentByRoutine = useMemo(() => {
    const map = new Map<string, OccurrenceState[]>();
    for (const r of routines) {
      const list = occurrences
        .filter((o) => o.routineId === r.id && new Date(o.occurrenceOn) <= today)
        .sort((a, b) => a.occurrenceOn.localeCompare(b.occurrenceOn))
        .slice(-12)
        .map((o) => occurrenceState(o, r.graceDays ?? 0));
      map.set(r.id, list);
    }
    return map;
  }, [routines, occurrences]);

  const setOccurrenceStatus = (occurrenceId: string, completed: boolean) => {
    setOccurrences((prev) =>
      prev.map((o) => (o.id === occurrenceId ? { ...o, status: completed ? "completed" : "todo" } : o))
    );
    api
      .patch(`/occurrences/${occurrenceId}/status`, { status: completed ? "completed" : "todo" })
      .then(reload)
      .catch(reload);
  };

  const skipOccurrence = (occurrenceId: string, skipped: boolean) => {
    api.patch(`/occurrences/${occurrenceId}/skip`, { skipped }).then(reload).catch(reload);
  };

  const changeStatus = (status: OperationStatus) => {
    api.patch(`/operations/${id}`, { status }).then(reload).catch(reload);
    setStatusPrompt(null);
  };

  // Kaydırınca tepede beliren sabit başlık için (bkz. App.tsx / lib/pageHeader).
  const coverRef = useRef<HTMLDivElement>(null);
  usePageHeader(operation?.title, coverRef, [operation?.title]);

  if (!id) return null;

  return (
    <div style={{ minHeight: "100vh", background: c.background }}>
      <div
        ref={coverRef}
        style={{
          position: "relative",
          height: 290,
          background: operation?.coverImageUrl
            ? `linear-gradient(rgba(255,255,255,0.18), rgba(255,255,255,0.95)), center/cover url(${operation.coverImageUrl})`
            : `linear-gradient(135deg, ${c.primary}, ${c.primaryDark})`,
          padding: "20px 28px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
        }}
      >
        <div style={{ paddingRight: 64 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <h1 style={{ fontSize: 22, fontWeight: 500, color: c.textPrimary, margin: 0 }}>
              {operation?.title ?? "…"}
            </h1>
            {operation && <OperationHealthBadge status={operation.status} health={operation.health} />}
          </div>
          {operation?.description && (
            <p style={{ fontSize: 16, color: c.textSecondary, margin: "0 0 8px" }}>{operation.description}</p>
          )}
          {operation && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontSize: 15, color: c.textSecondary }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <IconCalendar size={12} color={c.textSecondary} />
                {new Date(operation.startedOn).toLocaleDateString("tr-TR")} başladı
                {/* Programın bitiş tarihi yoktur; kapatılana kadar çalışır. */}
                {operation.endedOn && ` · ${new Date(operation.endedOn).toLocaleDateString("tr-TR")} kapandı`}
              </span>
              <span style={{ color: c.accentDark, fontWeight: 500 }}>
                {operation.budgetPerPeriod.toLocaleString("tr-TR")} ₺/{periodLabel[operation.budgetPeriod] ?? "ay"}
              </span>
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: "0 28px 28px" }}>
        <Link
          to={operation ? `/jobs/${operation.jobId}` : "/"}
          style={{ fontSize: 15, color: c.textSecondary, display: "inline-block", margin: "14px 0" }}
        >
          ← İşe dön
        </Link>

        {/* Programda ilerleme yüzdesi yerine düzen ölçülür. */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
          <SummaryCard label="Uyum oranı" value={operation?.adherencePct != null ? `%${operation.adherencePct}` : "—"} />
          <SummaryCard label="Aktif rutin" value={operation?.activeRoutineCount ?? 0} />
          <SummaryCard label="Kaçırılan" value={overdue.length} tone={overdue.length > 0 ? c.danger : undefined} />
          <SummaryCard label="Yaklaşan" value={upcoming.length} />
        </div>

        {operation && (
          <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
            <button onClick={() => setRoutineModal({})} style={primaryButton(c)}>
              Yeni rutin
            </button>
            {operation.status === "active" ? (
              <button onClick={() => setStatusPrompt("paused")} style={ghostButton(c)}>
                Duraklat
              </button>
            ) : (
              <button onClick={() => changeStatus("active")} style={ghostButton(c)}>
                Devam ettir
              </button>
            )}
            {operation.status !== "ended" && (
              <button onClick={() => setStatusPrompt("ended")} style={ghostButton(c)}>
                Programı kapat
              </button>
            )}
          </div>
        )}

        {/* ---- Rutinler ---- */}
        <SectionTitle>Rutinler</SectionTitle>
        {routines.length === 0 ? (
          <EmptyBox>
            Bu programda henüz rutin yok. Programı ayakta tutan tekrarlayan işleri buraya ekle —
            görevler bu kurallardan otomatik açılır.
          </EmptyBox>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14, marginBottom: 24 }}>
            {routines.map((r) => (
              <div key={r.id} style={{ border: `1px solid ${c.border}`, borderRadius: 12, background: c.surface, padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 500, color: c.textPrimary }}>
                    {r.title}
                    {!r.active && <span style={{ fontSize: 13, color: c.textSecondary, fontWeight: 400 }}> · pasif</span>}
                  </h3>
                  <button
                    onClick={() => setRoutineModal({ routine: r })}
                    aria-label="Rutini düzenle"
                    style={{ background: "transparent", border: "none", padding: 4, cursor: "pointer" }}
                  >
                    <IconEdit size={15} color={c.textSecondary} />
                  </button>
                </div>

                <div style={{ fontSize: 14, color: c.textSecondary, marginBottom: 10 }}>{describeRoutine(r)}</div>

                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <AdherenceDots results={recentByRoutine.get(r.id) ?? []} />
                  {r.currentStreak != null && r.currentStreak > 0 && (
                    <span style={{ fontSize: 13, color: c.accentDark, fontWeight: 500 }}>{r.currentStreak} seri</span>
                  )}
                </div>

                <div style={{ display: "flex", gap: 12, fontSize: 13, color: c.textSecondary, paddingTop: 10, borderTop: `1px solid ${c.border}` }}>
                  <span>{r.adherencePct != null ? `%${r.adherencePct} uyum` : "veri yok"}</span>
                  {(r.missedCount ?? 0) > 0 && <span style={{ color: c.danger }}>{r.missedCount} kaçırıldı</span>}
                  {r.nextDueOn && <span>Sıradaki {new Date(r.nextDueOn).toLocaleDateString("tr-TR")}</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ---- Kaçırılanlar ---- */}
        {overdue.length > 0 && (
          <>
            <SectionTitle>Kaçırılanlar</SectionTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
              {overdue.map((o) => (
                <OccurrenceRow
                  key={o.id}
                  occurrence={o}
                  overdue
                  onComplete={() => setOccurrenceStatus(o.id, true)}
                  onSkip={() => skipOccurrence(o.id, true)}
                />
              ))}
            </div>
          </>
        )}

        {/* ---- Yaklaşan tekrarlar ---- */}
        <SectionTitle>Yaklaşan tekrarlar</SectionTitle>
        {upcoming.length === 0 ? (
          <EmptyBox>
            {routines.length === 0
              ? "Rutin eklediğinde tekrarlar burada otomatik görünecek."
              : "Yaklaşan tekrar yok. Program duraklatılmış olabilir."}
          </EmptyBox>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {upcoming.map((o) => (
              <OccurrenceRow
                key={o.id}
                occurrence={o}
                onComplete={() => setOccurrenceStatus(o.id, true)}
                onSkip={() => skipOccurrence(o.id, true)}
              />
            ))}
          </div>
        )}
      </div>

      {routineModal && (
        <RoutineModal
          operationId={id}
          routine={routineModal.routine}
          onClose={() => setRoutineModal(null)}
          onSaved={reload}
        />
      )}

      {statusPrompt && (
        <Modal
          title={statusPrompt === "paused" ? "Programı duraklat" : "Programı kapat"}
          onClose={() => setStatusPrompt(null)}
        >
          <p style={{ fontSize: 16, color: c.textSecondary, margin: "0 0 18px", lineHeight: 1.5 }}>
            {statusPrompt === "paused"
              ? "Gelecekteki, henüz üzerinde çalışılmamış tekrarlar geri çekilir. Geçmiş kayıtlar ve tamamlanmış görevler olduğu gibi kalır. İstediğin zaman devam ettirebilirsin."
              : "Program kapatılır ve yeni tekrar üretilmez. Bir proje gibi \"tamamlanmaz\" — sadece durdurulur. Geçmiş kayıtlar korunur."}
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => setStatusPrompt(null)} style={ghostButton(c)}>
              Vazgeç
            </button>
            <button onClick={() => changeStatus(statusPrompt)} style={primaryButton(c)}>
              {statusPrompt === "paused" ? "Duraklat" : "Kapat"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function OccurrenceRow({
  occurrence,
  overdue,
  onComplete,
  onSkip,
}: {
  occurrence: OperationOccurrence;
  overdue?: boolean;
  onComplete: () => void;
  onSkip: () => void;
}) {
  const c = colors.light;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        border: `1px solid ${overdue ? c.danger : c.border}`,
        borderRadius: 10,
        background: c.surface,
        padding: "10px 14px",
      }}
    >
      <button
        onClick={onComplete}
        aria-label="Tamamlandı olarak işaretle"
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          border: `1px solid ${c.border}`,
          background: "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          cursor: "pointer",
        }}
      >
        {occurrence.status === "completed" && <IconCheck size={13} color={c.success} />}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, color: c.textPrimary }}>{occurrence.title}</div>
        <div style={{ display: "flex", gap: 10, fontSize: 13, color: overdue ? c.danger : c.textSecondary }}>
          <span>{new Date(occurrence.occurrenceOn).toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" })}</span>
          {occurrence.assignedToName && (
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <IconUser size={11} color={c.textSecondary} />
              {occurrence.assignedToName}
            </span>
          )}
        </div>
      </div>

      <button
        onClick={onSkip}
        title="Bu tekrarı bilinçli olarak atla — kaçırılmış sayılmaz, seriyi bozmaz"
        style={{
          background: "transparent",
          border: `1px solid ${c.border}`,
          borderRadius: 8,
          padding: "5px 10px",
          fontSize: 13,
          color: c.textSecondary,
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        Atla
      </button>
    </div>
  );
}

// Kuralı kullanıcının okuyabileceği bir cümleye çevirir.
function describeRoutine(r: OperationRoutine): string {
  const dayNames = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
  const every = r.intervalN > 1 ? `${r.intervalN} ` : "";

  if (r.freq === "daily") return `Her ${every}günde bir · ${r.dueTime}`;

  if (r.freq === "weekly") {
    const days = (r.byWeekday ?? []).map((d) => dayNames[d]).join(", ");
    return `Her ${every}haftada bir${days ? ` · ${days}` : ""} · ${r.dueTime}`;
  }

  if (r.freq === "monthly") {
    if (r.bySetPos != null) {
      const pos = r.bySetPos === -1 ? "son" : `${r.bySetPos}.`;
      const day = dayNames[r.byWeekday?.[0] ?? 1];
      return `Her ${every}ayın ${pos} ${day} günü · ${r.dueTime}`;
    }
    const d = r.byMonthDay?.[0];
    const dayText = d === -1 ? "son günü" : `${d ?? 1}. günü`;
    return `Her ${every}ayın ${dayText} · ${r.dueTime}`;
  }

  return `Her ${every}yıl · ${r.dueTime}`;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  const c = colors.light;
  return (
    <h2 style={{ fontSize: 16, fontWeight: 500, color: c.textPrimary, margin: "0 0 12px" }}>{children}</h2>
  );
}

function EmptyBox({ children }: { children: React.ReactNode }) {
  const c = colors.light;
  return (
    <div
      style={{
        border: `1px dashed ${c.border}`,
        borderRadius: 12,
        padding: 32,
        textAlign: "center",
        color: c.textSecondary,
        fontSize: 15,
        lineHeight: 1.5,
        marginBottom: 24,
      }}
    >
      {children}
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  const c = colors.light;
  return (
    <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ color: c.textSecondary, fontSize: 15, marginBottom: 6 }}>{label}</div>
      <div style={{ color: tone ?? c.textPrimary, fontSize: 27, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

const primaryButton = (c: typeof colors.light) => ({
  padding: "8px 14px",
  borderRadius: 8,
  border: "none",
  background: c.primary,
  color: "#fff",
  fontSize: 15,
  fontWeight: 500,
  cursor: "pointer",
});

const ghostButton = (c: typeof colors.light) => ({
  padding: "8px 14px",
  borderRadius: 8,
  border: `1px solid ${c.border}`,
  background: "transparent",
  color: c.textPrimary,
  fontSize: 15,
  cursor: "pointer",
});
