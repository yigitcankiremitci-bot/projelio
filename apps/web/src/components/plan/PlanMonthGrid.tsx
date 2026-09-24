import { useMemo } from "react";
import type { GoogleTakvimEtkinligi, PlanTimeBlock } from "@projelio/shared";
import { useThemeColors } from "../../theme/useThemeColors";
import {
  DRAG_ITEM,
  addDays,
  dayOfMonth,
  eachDay,
  formatDuration,
  startOfWeek,
  todayStr,
  WEEKDAY_LABELS,
  weekdayOf,
  type DraggedItem,
} from "../../lib/planGrid";
import { useT } from "../../lib/i18n";
import { etkinlikleriGunlereDagit } from "../../lib/googleTakvimGorunum";

interface Props {
  from: string;
  to: string;
  blocks: PlanTimeBlock[];
  workdays: number[];
  defaultBlockMinutes: number;
  dayStart: string;
  onSelectDay: (day: string) => void;
  onDropItem: (item: DraggedItem, blockDate: string, startsAt: string, endsAt: string) => void;
  /** Google Takvim etkinlikleri: gün hücresinde ilk ikisinin başlığı, fazlası "+n". */
  etkinlikler?: GoogleTakvimEtkinligi[];
  onOpenEtkinlik?: (e: GoogleTakvimEtkinligi) => void;
}

/**
 * Ay görünümü.
 *
 * Ay ölçeğinde saat gridi çizilmiyor — 30 günün her saatini aynı ekrana
 * sığdırmak okunamaz bir duvar üretiyor. Onun yerine her gün, o günün YÜKÜNÜ
 * özetliyor: kaç saat planlanmış, ne kadarı bitmiş, hangi odak alanları var.
 * Ay görünümünün cevapladığı soru "saat kaçta ne yapıyorum" değil, "bu ay
 * nerelerde yığılma var" sorusudur.
 */
export default function PlanMonthGrid({
  from,
  to,
  blocks,
  workdays,
  defaultBlockMinutes,
  dayStart,
  onSelectDay,
  onDropItem,
  etkinlikler,
  onOpenEtkinlik,
}: Props) {
  const t = useT();
  const c = useThemeColors();
  const gunluk = useMemo(() => etkinlikleriGunlereDagit(etkinlikler ?? []), [etkinlikler]);
  const today = todayStr();

  // Ay, tam haftalar hâlinde çizilir: ilk satır ayın 1'inden önceki
  // pazartesiden, son satır ayın son gününü içeren haftanın pazarına kadar.
  const gridStart = useMemo(() => startOfWeek(from), [from]);
  const gridDays = useMemo(() => {
    const lastWeekStart = startOfWeek(to);
    return eachDay(gridStart, addDays(lastWeekStart, 6));
  }, [gridStart, to]);

  const summary = useMemo(() => {
    const map = new Map<string, { planned: number; done: number; areas: Map<string, string> }>();
    for (const b of blocks) {
      let entry = map.get(b.blockDate);
      if (!entry) {
        entry = { planned: 0, done: 0, areas: new Map() };
        map.set(b.blockDate, entry);
      }
      if (b.status !== "skipped") entry.planned += b.plannedMinutes;
      if (b.status === "done") entry.done += b.actualMinutes ?? b.plannedMinutes;
      const name = b.focusAreaName ?? b.title ?? b.linkedTitle;
      if (name) entry.areas.set(name, b.focusAreaColor ?? b.color ?? c.primary);
    }
    return map;
  }, [blocks, c.primary]);

  const weeks: string[][] = [];
  for (let i = 0; i < gridDays.length; i += 7) weeks.push(gridDays.slice(i, i + 7));

  return (
    <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: `1px solid ${c.border}` }}>
        {/* Başlıklar pazartesiden başlar; hafta pazartesi başlıyor. */}
        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
          <div key={d} style={{ padding: "8px 0", textAlign: "center", fontSize: 12, color: c.textSecondary }}>
            {t(WEEKDAY_LABELS[d])}
          </div>
        ))}
      </div>

      {weeks.map((week) => (
        <div key={week[0]} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
          {week.map((day) => {
            const inMonth = day >= from && day <= to;
            const entry = summary.get(day);
            const isToday = day === today;
            const isWorkday = workdays.includes(weekdayOf(day));

            return (
              <div
                key={day}
                onClick={() => onSelectDay(day)}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const raw = e.dataTransfer.getData(DRAG_ITEM);
                  if (!raw) return;
                  try {
                    const item: DraggedItem = JSON.parse(raw);
                    const minutes = item.minutes ?? defaultBlockMinutes;
                    // Ay görünümünde bırakılan iş, o günün mesai başlangıcına
                    // konur: gün içindeki saati burada seçtirmek anlamsız,
                    // kullanıcı gün görünümünde zaten taşıyabiliyor.
                    const [h, m] = dayStart.split(":").map(Number);
                    const end = h * 60 + m + minutes;
                    onDropItem(
                      item,
                      day,
                      dayStart,
                      `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`
                    );
                  } catch {
                    // Bozuk sürükleme yükü sessizce yok sayılır.
                  }
                }}
                style={{
                  minHeight: 96,
                  padding: 7,
                  borderRight: `1px solid ${c.border}`,
                  borderBottom: `1px solid ${c.border}`,
                  background: !inMonth ? c.background : isWorkday ? c.surface : c.background,
                  opacity: inMonth ? 1 : 0.45,
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: isToday ? 700 : 500,
                      color: isToday ? "#fff" : c.textPrimary,
                      background: isToday ? c.accent : "transparent",
                      borderRadius: 11,
                      minWidth: 22,
                      height: 22,
                      lineHeight: "22px",
                      textAlign: "center",
                    }}
                  >
                    {dayOfMonth(day)}
                  </span>
                  {entry && (
                    <span style={{ fontSize: 11, color: c.textSecondary, marginLeft: "auto" }}>
                      {formatDuration(entry.planned)}
                    </span>
                  )}
                </div>

                {(() => {
                  const g = gunluk.get(day);
                  // Tüm gün etkinlikler önce, saatliler saat sırasıyla.
                  const liste = g ? [...g.tumGun, ...g.saatli.map((p) => p.etkinlik)] : [];
                  if (!liste.length) return null;
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 5 }}>
                      {liste.slice(0, 2).map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          title={e.baslik}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            onOpenEtkinlik?.(e);
                          }}
                          style={{
                            fontSize: 11,
                            lineHeight: "16px",
                            textAlign: "left",
                            padding: "0 4px",
                            borderRadius: 4,
                            border: "none",
                            borderLeft: `3px solid ${e.takvimRengi ?? c.accent}`,
                            background: c.background,
                            color: c.textPrimary,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            cursor: "pointer",
                          }}
                        >
                          {e.baslik}
                        </button>
                      ))}
                      {liste.length > 2 && (
                        <span style={{ fontSize: 11, color: c.textSecondary, paddingLeft: 4 }}>
                          {t("+{n} etkinlik", { n: liste.length - 2 })}
                        </span>
                      )}
                    </div>
                  );
                })()}

                {entry && (
                  <>
                    <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginBottom: 5 }}>
                      {[...entry.areas.entries()].slice(0, 4).map(([name, color]) => (
                        <span
                          key={name}
                          title={name}
                          style={{ width: 7, height: 7, borderRadius: 4, background: color, display: "block" }}
                        />
                      ))}
                    </div>
                    {/* Günün ne kadarının bittiğini gösteren ince çubuk. */}
                    <div style={{ height: 4, borderRadius: 2, background: c.border, overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${entry.planned > 0 ? Math.min(100, (100 * entry.done) / entry.planned) : 0}%`,
                          height: "100%",
                          background: c.success,
                        }}
                      />
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
