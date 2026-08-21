import { useMemo, useRef, useState } from "react";
import type { PlanTimeBlock } from "@projelio/shared";
import { useThemeColors } from "../../theme/useThemeColors";
import {
  DRAG_BLOCK,
  DRAG_ITEM,
  HOUR_HEIGHT,
  blockGeometry,
  eachDay,
  formatDuration,
  gridRange,
  layoutColumns,
  minutesToTime,
  offsetToTime,
  shortDayLabel,
  timeToMinutes,
  todayStr,
  WEEKDAY_LABELS,
  weekdayOf,
  type DraggedItem,
} from "../../lib/planGrid";

interface Props {
  from: string;
  to: string;
  blocks: PlanTimeBlock[];
  dayStart: string;
  dayEnd: string;
  workdays: number[];
  defaultBlockMinutes: number;
  onOpenBlock: (block: PlanTimeBlock) => void;
  onToggleDone: (block: PlanTimeBlock) => void;
  /** Boş bir yere tıklandığında o saatte yeni blok açar. */
  onCreateAt: (blockDate: string, startsAt: string, endsAt: string) => void;
  onMoveBlock: (blockId: string, blockDate: string, startsAt: string) => void;
  onDropItem: (item: DraggedItem, blockDate: string, startsAt: string, endsAt: string) => void;
}

/**
 * Gün ve hafta görünümünün saat gridi.
 *
 * İkisi tek bileşen çünkü aralarındaki fark yalnızca sütun sayısı: gün
 * görünümü tek sütunlu bir haftadır. Ayrı yazılsalardı sürükle-bırak, çakışma
 * yerleşimi ve "şu an" çizgisi iki kez bakım isterdi.
 */
export default function PlanGrid({
  from,
  to,
  blocks,
  dayStart,
  dayEnd,
  workdays,
  defaultBlockMinutes,
  onOpenBlock,
  onToggleDone,
  onCreateAt,
  onMoveBlock,
  onDropItem,
}: Props) {
  const c = useThemeColors();
  const days = useMemo(() => eachDay(from, to), [from, to]);
  const { startHour, endHour } = useMemo(() => gridRange(blocks, dayStart, dayEnd), [blocks, dayStart, dayEnd]);
  const hours = useMemo(
    () => Array.from({ length: endHour - startHour }, (_, i) => startHour + i),
    [startHour, endHour]
  );
  const today = todayStr();

  // Sürüklenirken hedef sütunda gösterilen hayalet blok. Kullanıcı bıraktığı
  // yerin hangi saate denk geldiğini önceden görmezse her seferinde deneme
  // yanılma yapıyor.
  const [ghost, setGhost] = useState<{ day: string; startsAt: string; minutes: number } | null>(null);

  const blocksByDay = useMemo(() => {
    const map = new Map<string, PlanTimeBlock[]>();
    for (const b of blocks) {
      const list = map.get(b.blockDate);
      if (list) list.push(b);
      else map.set(b.blockDate, [b]);
    }
    return map;
  }, [blocks]);

  const gridHeight = hours.length * HOUR_HEIGHT;

  return (
    <div style={{ display: "flex", background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, overflow: "hidden" }}>
      {/* Saat cetveli */}
      <div style={{ width: 52, flexShrink: 0, borderRight: `1px solid ${c.border}`, paddingTop: HEADER_HEIGHT }}>
        {hours.map((h) => (
          <div
            key={h}
            style={{
              height: HOUR_HEIGHT,
              fontSize: 11,
              color: c.textSecondary,
              textAlign: "right",
              paddingRight: 6,
              // Etiket, ait olduğu çizginin hizasında dursun.
              transform: "translateY(-6px)",
            }}
          >
            {String(h).padStart(2, "0")}:00
          </div>
        ))}
      </div>

      {/* Gün sütunları */}
      <div style={{ display: "flex", flex: 1, minWidth: 0 }}>
        {days.map((day) => (
          <DayColumn
            key={day}
            day={day}
            isToday={day === today}
            isWorkday={workdays.includes(weekdayOf(day))}
            single={days.length === 1}
            blocks={blocksByDay.get(day) ?? []}
            hours={hours}
            startHour={startHour}
            gridHeight={gridHeight}
            defaultBlockMinutes={defaultBlockMinutes}
            ghost={ghost?.day === day ? ghost : null}
            setGhost={setGhost}
            onOpenBlock={onOpenBlock}
            onToggleDone={onToggleDone}
            onCreateAt={onCreateAt}
            onMoveBlock={onMoveBlock}
            onDropItem={onDropItem}
          />
        ))}
      </div>
    </div>
  );
}

const HEADER_HEIGHT = 40;

interface ColumnProps {
  day: string;
  isToday: boolean;
  isWorkday: boolean;
  single: boolean;
  blocks: PlanTimeBlock[];
  hours: number[];
  startHour: number;
  gridHeight: number;
  defaultBlockMinutes: number;
  ghost: { startsAt: string; minutes: number } | null;
  setGhost: (g: { day: string; startsAt: string; minutes: number } | null) => void;
  onOpenBlock: (block: PlanTimeBlock) => void;
  onToggleDone: (block: PlanTimeBlock) => void;
  onCreateAt: (blockDate: string, startsAt: string, endsAt: string) => void;
  onMoveBlock: (blockId: string, blockDate: string, startsAt: string) => void;
  onDropItem: (item: DraggedItem, blockDate: string, startsAt: string, endsAt: string) => void;
}

function DayColumn({
  day,
  isToday,
  isWorkday,
  single,
  blocks,
  hours,
  startHour,
  gridHeight,
  defaultBlockMinutes,
  ghost,
  setGhost,
  onOpenBlock,
  onToggleDone,
  onCreateAt,
  onMoveBlock,
  onDropItem,
}: ColumnProps) {
  const c = useThemeColors();
  const bodyRef = useRef<HTMLDivElement>(null);
  const layout = useMemo(() => layoutColumns(blocks), [blocks]);

  /** İmlecin sütun içindeki dikey konumundan saati çıkarır. */
  const timeAt = (clientY: number): string => {
    const rect = bodyRef.current?.getBoundingClientRect();
    if (!rect) return minutesToTime(startHour * 60);
    return offsetToTime(clientY - rect.top, startHour);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setGhost(null);
    const startsAt = timeAt(e.clientY);

    const blockId = e.dataTransfer.getData(DRAG_BLOCK);
    if (blockId) {
      onMoveBlock(blockId, day, startsAt);
      return;
    }

    const raw = e.dataTransfer.getData(DRAG_ITEM);
    if (raw) {
      try {
        const item: DraggedItem = JSON.parse(raw);
        const minutes = item.minutes ?? defaultBlockMinutes;
        onDropItem(item, day, startsAt, minutesToTime(timeToMinutes(startsAt) + minutes));
      } catch {
        // Bozuk bir sürükleme yükü sessizce yok sayılır; kullanıcıya
        // gösterilecek anlamlı bir hata yok.
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    // preventDefault olmadan tarayıcı bırakmaya izin vermez.
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setGhost({ day, startsAt: timeAt(e.clientY), minutes: defaultBlockMinutes });
  };

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        borderRight: `1px solid ${c.border}`,
        // Çalışılmayan günler soluk: takvimde hafta sonunun görsel olarak
        // ayrışması, planın gerçekten kaç güne sığdığını okumayı kolaylaştırıyor.
        background: isWorkday ? c.surface : c.background,
      }}
    >
      <div
        style={{
          height: HEADER_HEIGHT,
          borderBottom: `1px solid ${c.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          fontSize: 13,
          fontWeight: isToday ? 600 : 500,
          color: isToday ? c.accent : c.textPrimary,
        }}
      >
        {single ? (
          <span>{shortDayLabel(day)}</span>
        ) : (
          <>
            <span style={{ color: c.textSecondary, fontWeight: 400 }}>{WEEKDAY_LABELS[weekdayOf(day)]}</span>
            <span>{shortDayLabel(day)}</span>
          </>
        )}
      </div>

      <div
        ref={bodyRef}
        onDragOver={handleDragOver}
        onDragLeave={() => setGhost(null)}
        onDrop={handleDrop}
        onDoubleClick={(e) => {
          // Çift tıklama, tek tıklamayla karışmasın diye tercih edildi:
          // tek tıklama bloğu açıyor, boşluğa tek tıklamak da yanlışlıkla
          // sürekli yeni blok yaratıyordu.
          const startsAt = timeAt(e.clientY);
          onCreateAt(day, startsAt, minutesToTime(timeToMinutes(startsAt) + defaultBlockMinutes));
        }}
        style={{ position: "relative", height: gridHeight }}
      >
        {hours.map((h, i) => (
          <div
            key={h}
            style={{
              position: "absolute",
              top: i * HOUR_HEIGHT,
              left: 0,
              right: 0,
              height: HOUR_HEIGHT,
              borderBottom: `1px solid ${c.border}`,
              opacity: 0.6,
            }}
          />
        ))}

        {isToday && <NowLine startHour={startHour} hours={hours} />}

        {ghost && (
          <div
            style={{
              position: "absolute",
              top: ((timeToMinutes(ghost.startsAt) - startHour * 60) / 60) * HOUR_HEIGHT,
              left: 3,
              right: 3,
              height: (ghost.minutes / 60) * HOUR_HEIGHT,
              borderRadius: 6,
              border: `1px dashed ${c.accent}`,
              background: "rgba(192,129,63,0.10)",
              pointerEvents: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              color: c.accentDark,
            }}
          >
            {ghost.startsAt}
          </div>
        )}

        {blocks.map((block) => (
          <BlockCard
            key={block.id}
            block={block}
            startHour={startHour}
            layout={layout.get(block.id) ?? { column: 0, columns: 1 }}
            onOpen={() => onOpenBlock(block)}
            onToggleDone={() => onToggleDone(block)}
          />
        ))}
      </div>
    </div>
  );
}

/** "Şu an" çizgisi — bugünün sütununda nerede olduğunu gösterir. */
function NowLine({ startHour, hours }: { startHour: number; hours: number[] }) {
  const c = useThemeColors();
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const top = ((minutes - startHour * 60) / 60) * HOUR_HEIGHT;
  if (top < 0 || top > hours.length * HOUR_HEIGHT) return null;

  return (
    <div style={{ position: "absolute", top, left: 0, right: 0, height: 0, pointerEvents: "none", zIndex: 3 }}>
      <div style={{ height: 2, background: c.danger, opacity: 0.75 }} />
      <div
        style={{
          position: "absolute",
          left: -3,
          top: -3,
          width: 8,
          height: 8,
          borderRadius: 4,
          background: c.danger,
        }}
      />
    </div>
  );
}

function BlockCard({
  block,
  startHour,
  layout,
  onOpen,
  onToggleDone,
}: {
  block: PlanTimeBlock;
  startHour: number;
  layout: { column: number; columns: number };
  onOpen: () => void;
  onToggleDone: () => void;
}) {
  const c = useThemeColors();
  const { top, height } = blockGeometry(block, startHour);
  const accent = block.focusAreaColor ?? block.color ?? c.primary;
  const done = block.status === "done";
  const skipped = block.status === "skipped";

  const width = `calc(${100 / layout.columns}% - 6px)`;
  const left = `calc(${(100 / layout.columns) * layout.column}% + 3px)`;

  const label = block.title ?? block.linkedTitle ?? block.focusAreaName ?? "Blok";

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_BLOCK, block.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      title={`${block.startsAt}–${block.endsAt} · ${label}`}
      style={{
        position: "absolute",
        top,
        left,
        width,
        height,
        borderRadius: 7,
        // Sol kenardaki renk şeridi odak alanını metni okumadan ayırt ettirir.
        borderLeft: `3px solid ${accent}`,
        border: `1px solid ${c.border}`,
        borderLeftWidth: 3,
        borderLeftColor: accent,
        background: done ? "rgba(46,158,91,0.10)" : skipped ? c.background : c.surface,
        boxShadow: "0 1px 2px rgba(26,31,41,0.06)",
        padding: "3px 6px",
        overflow: "hidden",
        cursor: "pointer",
        opacity: skipped ? 0.55 : 1,
        zIndex: 2,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleDone();
          }}
          aria-label={done ? "Tamamlandı işaretini kaldır" : "Tamamlandı işaretle"}
          style={{
            width: 13,
            height: 13,
            marginTop: 2,
            flexShrink: 0,
            borderRadius: 4,
            border: `1.5px solid ${done ? c.success : c.border}`,
            background: done ? c.success : "transparent",
            padding: 0,
            cursor: "pointer",
          }}
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 12,
              lineHeight: "15px",
              color: c.textPrimary,
              textDecoration: done ? "line-through" : undefined,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </div>
          {height > 40 && (
            <div style={{ fontSize: 10, color: c.textSecondary, marginTop: 1 }}>
              {block.startsAt}–{block.endsAt} · {formatDuration(block.plannedMinutes)}
              {block.source === "lio" && block.status === "planned" ? " · Lio" : ""}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
