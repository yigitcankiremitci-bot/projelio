import { useRef, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Operation, OperationOccurrence, OperationRoutine, OperationStatus, Task, ThemeColors } from "@projelio/shared";
import { api } from "../api/client";
import { useLiveRoom } from "../lib/liveRoom";
import Modal from "../components/Modal";
import RoutineModal from "../components/RoutineModal";
import EditOperationModal from "../components/EditOperationModal";
import TaskEditModal from "../components/TaskEditModal";
import OperationHealthBadge, { AdherenceDots } from "../components/OperationHealthBadge";
import EntityCover, { CoverBackLink, coverActionButton } from "../components/EntityCover";
import { useCoverTheme } from "../theme/useCoverTheme";
import TaskAttachmentBadges from "../components/TaskAttachmentBadges";
import { useThemeColors } from "../theme/useThemeColors";
import { IconCalendar, IconCheck, IconEdit, IconSettings, IconUser } from "../components/icons";
import { useProjectFabAction } from "../lib/projectFab";
import { usePageHeader } from "../lib/pageHeader";
import { useCurrentUser } from "../lib/useCurrentUser";
import { useIsDesktop } from "../lib/useIsDesktop";
import { pageGutter } from "../lib/layout";
import { CoverStats, StatSummary, type StatItem } from "../components/StatGrid";

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
  // Aynı sayfadaki kullanıcılar: canlı tazeleme + "kim burada" (bkz. lib/liveRoom.ts).
  useLiveRoom(id ? `operation:${id}` : null);
  const navigate = useNavigate();
  const c = useThemeColors();
  const cover = useCoverTheme();
  const isDesktop = useIsDesktop();
  const gutter = pageGutter(isDesktop);

  const [operation, setOperation] = useState<Operation | null>(null);
  const { user: currentUser } = useCurrentUser();
  const [routines, setRoutines] = useState<OperationRoutine[]>([]);
  const [occurrences, setOccurrences] = useState<OperationOccurrence[]>([]);
  const [routineModal, setRoutineModal] = useState<{ routine?: OperationRoutine } | null>(null);
  const [statusPrompt, setStatusPrompt] = useState<OperationStatus | null>(null);
  const [editing, setEditing] = useState(false);
  // Açık tekrarın TAM görev kaydı: tekrarlar birer görev olduğu için düzenleme
  // ortak TaskEditModal ile yapılır (bkz. 060 — ayrı bir "tekrar modalı" yok).
  const [openOccurrence, setOpenOccurrence] = useState<Task | null>(null);
  // Geçmiş bölümü uzun olabilir; varsayılan kapalı.
  const [historyOpen, setHistoryOpen] = useState(false);

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

  // Tamamlanan/atlanan/kaçırılan tüm geçmiş tekrarlar, en yeniden eskiye.
  // Önceden yalnızca son 12 tekrarın nokta ızgarası vardı: "yapıldı mı"
  // görünüyor, NE yapıldığı görünmüyordu (bkz. ekler).
  const history = useMemo(
    () =>
      occurrences
        .filter((o) => new Date(o.occurrenceOn) < today || o.status === "completed" || o.skippedAt)
        .sort((a, b) => b.occurrenceOn.localeCompare(a.occurrenceOn)),
    [occurrences]
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

  /**
   * Tekrarın tam görev kaydını çekip düzenleme modalını açar. Listedeki
   * OperationOccurrence kısmi bir görünüm; modalı onunla açmak kaydederken
   * bütçe/süre gibi alanları sıfırlardı (bkz. TasksOverview'daki aynı desen).
   */
  const openOccurrenceModal = (occurrenceId: string) => {
    api
      .get<Task>(`/tasks/${occurrenceId}`)
      .then(setOpenOccurrence)
      .catch(() => setOpenOccurrence(null));
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
  // Akıştaki geri bağlantısının DOM öğesi: şerittekiler ancak bu kaybolunca belirir.
  const backRef = useRef<HTMLDivElement>(null);
  usePageHeader(operation?.title, coverRef, [operation?.title, operation?.jobId], {
    to: operation ? `/jobs/${operation.jobId}?tab=programs` : "/",
    label: "Rutinler",
    sourceRef: backRef,
  });

  if (!id) return null;

  // Tek dizi, iki yerleşim: geniş ekranda kapağın içinde, dar ekranda akışta
  // (bkz. StatGrid).
  const stats: StatItem[] = [
    { label: "Uyum", value: operation?.adherencePct != null ? `%${operation.adherencePct}` : "—" },
    { label: "Rutin", value: operation?.activeRoutineCount ?? 0 },
    { label: "Kaçırılan", value: overdue.length, tone: overdue.length > 0 ? c.danger : undefined },
    { label: "Yaklaşan", value: upcoming.length },
  ];

  return (
    <div style={{ minHeight: "100vh", background: c.background }}>
      <EntityCover
        coverRef={coverRef}
        // ?tab=programs: geri dönünce işin varsayılan sekmesi (Projeler) değil,
        // geldiğimiz Rutinler sekmesi açılsın (bkz. JobTabs "programs").
        back={
          <div ref={backRef}>
            <CoverBackLink to={operation ? `/jobs/${operation.jobId}?tab=programs` : "/"} label="Rutinler" />
          </div>
        }
        coverImageUrl={operation?.coverImageUrl}
        // Masaüstünde 290 idi; özet kapağın içine girince o boşluk doldu.
        height={260}
        title={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            {operation?.title ?? "…"}
            {operation && <OperationHealthBadge status={operation.status} health={operation.health} />}
          </span>
        }
        lioSubject={operation ? { kind: "rutin", title: operation.title, id: operation.id } : undefined}
        description={operation?.description}
        meta={
          operation && (
            <>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <IconCalendar size={12} color={cover.secondary} />
                {new Date(operation.startedOn).toLocaleDateString("tr-TR")} başladı
                {/* Rutinin bitiş tarihi yoktur; kapatılana kadar çalışır. */}
                {operation.endedOn && ` · ${new Date(operation.endedOn).toLocaleDateString("tr-TR")} kapandı`}
              </span>
              <span style={{ color: c.accentDark, fontWeight: 500 }}>
                {operation.budgetPerPeriod.toLocaleString("tr-TR")} ₺/{periodLabel[operation.budgetPeriod] ?? "ay"}
              </span>
            </>
          )
        }
        stats={<CoverStats items={stats} />}
        action={
          // Rutini yalnızca kuran kişi düzenleyebilir (OperationsService.assertCanManage).
          operation && currentUser?.id === operation.ownerId ? (
            <button onClick={() => setEditing(true)} aria-label="Rutini düzenle" style={coverActionButton(c)}>
              <IconSettings size={20} color={c.textSecondary} />
            </button>
          ) : undefined
        }
      />

      <div style={{ padding: `12px ${gutter}px 28px` }}>
        {/* Rutinde ilerleme yüzdesi yerine düzen ölçülür. */}
        <StatSummary items={stats} />

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
                Rutini kapat
              </button>
            )}
          </div>
        )}

        {/* ---- Rutinler ---- */}
        <SectionTitle>Rutinler</SectionTitle>
        {routines.length === 0 ? (
          <EmptyBox>
            Bu rutinde henüz tanımlı rutin yok. Rutini ayakta tutan tekrarlayan işleri buraya ekle —
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
              : "Yaklaşan tekrar yok. Rutin duraklatılmış olabilir."}
          </EmptyBox>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {upcoming.map((o) => (
              <OccurrenceRow
                key={o.id}
                occurrence={o}
                onComplete={() => setOccurrenceStatus(o.id, true)}
                onSkip={() => skipOccurrence(o.id, true)}
                onOpen={() => openOccurrenceModal(o.id)}
              />
            ))}
          </div>
        )}

        {/* ---- Geçmiş tekrarlar ----
            Nokta ızgarası "yapıldı mı" sorusunu cevaplıyor ama kayıtlara
            erişilemiyordu. Liste uzayabildiği için varsayılan kapalı. */}
        {history.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <button
              type="button"
              onClick={() => setHistoryOpen((v) => !v)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
                fontSize: 17,
                fontWeight: 500,
                color: c.textPrimary,
              }}
            >
              Geçmiş
              <span style={{ fontSize: 13, color: c.textSecondary, fontWeight: 400 }}>
                {history.length} tekrar · {historyOpen ? "gizle" : "göster"}
              </span>
            </button>

            {historyOpen && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                {history.map((o) => (
                  <OccurrenceRow
                    key={o.id}
                    occurrence={o}
                    onComplete={() => setOccurrenceStatus(o.id, o.status !== "completed")}
                    onSkip={() => skipOccurrence(o.id, !o.skippedAt)}
                    onOpen={() => openOccurrenceModal(o.id)}
                  />
                ))}
              </div>
            )}
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

      {editing && operation && (
        <EditOperationModal operation={operation} onClose={() => setEditing(false)} onSaved={reload} />
      )}

      {openOccurrence && (
        <TaskEditModal
          task={openOccurrence}
          // Tekrarın projesi yok; dosya bağlamı rutinin bağlı olduğu iştir.
          fileJobId={operation?.jobId}
          onClose={() => setOpenOccurrence(null)}
          // Ek eklendiğinde satırdaki rozet modal kapanmadan belirsin. Tekrar
          // bir görev satırı olduğu için gelen yama doğrudan uygulanabiliyor.
          onTaskPatched={(updated) =>
            setOccurrences((prev) =>
              prev.map((o) =>
                o.id === updated.id ? { ...o, attachments: updated.attachments, files: updated.files } : o
              )
            )
          }
          onSaved={() => {
            setOpenOccurrence(null);
            reload();
          }}
        />
      )}

      {statusPrompt && (
        <Modal
          title={statusPrompt === "paused" ? "Rutini duraklat" : "Rutini kapat"}
          onClose={() => setStatusPrompt(null)}
        >
          <p style={{ fontSize: 16, color: c.textSecondary, margin: "0 0 18px", lineHeight: 1.5 }}>
            {statusPrompt === "paused"
              ? "Gelecekteki, henüz üzerinde çalışılmamış tekrarlar geri çekilir. Geçmiş kayıtlar ve tamamlanmış görevler olduğu gibi kalır. İstediğin zaman devam ettirebilirsin."
              : "Rutin kapatılır ve yeni tekrar üretilmez. Bir proje gibi \"tamamlanmaz\" — sadece durdurulur. Geçmiş kayıtlar korunur."}
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => setStatusPrompt(null)} style={ghostButton(c)}>
              Vazgeç
            </button>
            <button data-primary onClick={() => changeStatus(statusPrompt)} style={primaryButton(c)}>
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
  onOpen,
}: {
  occurrence: OperationOccurrence;
  overdue?: boolean;
  onComplete: () => void;
  onSkip: () => void;
  /** Verilirse satır başlığı tıklanabilir olur ve tekrarın detay modalını açar. */
  onOpen?: () => void;
}) {
  const c = useThemeColors();
  const links = occurrence.attachments ?? [];
  const files = occurrence.files ?? [];
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
        {/* Başlık tıklanınca tekrarın kendi modalı açılır: tekrar bir görev
            olduğu için düzenleme, atama, saat ve ekler orada (bkz. 060). */}
        <div
          onClick={onOpen}
          role={onOpen ? "button" : undefined}
          title={onOpen ? "Tekrarı aç: düzenle, link/dosya ekle" : undefined}
          style={{ fontSize: 15, color: c.textPrimary, cursor: onOpen ? "pointer" : "default" }}
        >
          {occurrence.title}
        </div>
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

      {/* Ek rozetleri görev kartlarıyla ORTAK bileşende: tekrarlar da birer
          görev ve iki yerde iki farklı tıklama davranışı oluşmasın. */}
      <TaskAttachmentBadges taskId={occurrence.id} links={links} files={files} onOpenDetail={onOpen} />

      {/* Düzenleme kalemi: modal yalnızca başlığa tıklayarak açılıyordu ve
          kimse fark etmiyordu. Rutin kartlarındaki kalemle aynı simge —
          "buradan düzenlenir" işareti uygulamada tek ve tanıdık kalsın. */}
      {onOpen && (
        <button
          onClick={onOpen}
          aria-label="Tekrarı düzenle"
          title="Düzenle: başlık, açıklama, saat, link ve dosya"
          style={{
            background: "transparent",
            border: "none",
            padding: 4,
            display: "flex",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <IconEdit size={15} color={c.textSecondary} />
        </button>
      )}

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
  const c = useThemeColors();
  return (
    <h2 style={{ fontSize: 16, fontWeight: 500, color: c.textPrimary, margin: "0 0 12px" }}>{children}</h2>
  );
}

function EmptyBox({ children }: { children: React.ReactNode }) {
  const c = useThemeColors();
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


const primaryButton = (c: ThemeColors) => ({
  padding: "8px 14px",
  borderRadius: 8,
  border: "none",
  background: c.primary,
  color: "#fff",
  fontSize: 15,
  fontWeight: 500,
  cursor: "pointer",
});

const ghostButton = (c: ThemeColors) => ({
  padding: "8px 14px",
  borderRadius: 8,
  border: `1px solid ${c.border}`,
  background: "transparent",
  color: c.textPrimary,
  fontSize: 15,
  cursor: "pointer",
});
