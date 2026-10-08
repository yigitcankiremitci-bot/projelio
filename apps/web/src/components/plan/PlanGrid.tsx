import { useMemo, useRef, useState } from "react";
import type { GoogleTakvimEtkinligi, PlanTimeBlock } from "@projelio/shared";
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
import { useT } from "../../lib/i18n";
import { etkinlikleriGunlereDagit, type EtkinlikParcasi } from "../../lib/googleTakvimGorunum";
import { IconCheck } from "../icons";

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
  /** Google Takvim etkinlikleri (bağlıysa). Salt okunur: sürüklenmez, tıklanınca açılır. */
  etkinlikler?: GoogleTakvimEtkinligi[];
  onOpenEtkinlik?: (e: GoogleTakvimEtkinligi) => void;
  /** Google Takvim'e de gönderilmiş blokların id'leri — kutuda küçük bir işaret çıkar. */
  googleBloklari?: Set<string>;
  /** Hafta görünümünde gün başlığına tıklanınca o günün günlük görünümünü açar. */
  onSelectDay?: (day: string) => void;
  /**
   * Bloklarda "tamamlandı" kutusu çizilmez. Proje takvimi ızgarayı ortak
   * etkinlikler için kullanıyor (bkz. components/projeTakvimi): toplantının
   * "bitti" işareti yok, kutu orada yalnızca yanlışlıkla tıklanacak bir şey olurdu.
   */
  onayKutusuYok?: boolean;
}

/** Tüm gün şeridinde gün başına en fazla kaç satır; fazlası "+n" olur. */
const TUM_GUN_SATIRI = 3;
const TUM_GUN_SATIR_YUKSEKLIGI = 20;

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
  etkinlikler,
  onOpenEtkinlik,
  googleBloklari,
  onSelectDay,
  onayKutusuYok,
}: Props) {
  const c = useThemeColors();
  const days = useMemo(() => eachDay(from, to), [from, to]);
  const gunluk = useMemo(() => etkinlikleriGunlereDagit(etkinlikler ?? []), [etkinlikler]);
  // Izgaranın saat aralığı toplantıları da kapsar: 08:00'deki toplantı,
  // mesai 09:00'da başlıyor diye görünmez kalmasın.
  const gorunenParcalar = useMemo(
    () => days.flatMap((d) => gunluk.get(d)?.saatli ?? []),
    [days, gunluk]
  );
  const { startHour, endHour } = useMemo(
    () => gridRange([...blocks, ...gorunenParcalar], dayStart, dayEnd),
    [blocks, gorunenParcalar, dayStart, dayEnd]
  );
  // Tüm gün şeridi yalnızca görünen günlerde tüm gün etkinlik varsa açılır;
  // her sütunda aynı yükseklikte, yoksa saat çizgileri kayardı.
  const tumGunSatiri = Math.min(
    TUM_GUN_SATIRI,
    Math.max(0, ...days.map((d) => gunluk.get(d)?.tumGun.length ?? 0))
  );
  const tumGunYuksekligi = tumGunSatiri ? tumGunSatiri * TUM_GUN_SATIR_YUKSEKLIGI + 6 : 0;
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
      <div style={{ width: 52, flexShrink: 0, borderRight: `1px solid ${c.border}`, paddingTop: HEADER_HEIGHT + tumGunYuksekligi }}>
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
            parcalar={gunluk.get(day)?.saatli ?? []}
            tumGunler={gunluk.get(day)?.tumGun ?? []}
            tumGunYuksekligi={tumGunYuksekligi}
            onOpenEtkinlik={onOpenEtkinlik}
            googleBloklari={googleBloklari}
            onSelectDay={onSelectDay}
            onayKutusuYok={onayKutusuYok}
          />
        ))}
      </div>
    </div>
  );
}

// Başlık iki satır taşıyor: gün (ad + numara) ve o günün planlı süresi.
// Süre başlıkta durmasa hafta görünümünde "hangi gün dolu" sorusunu yanıtlamak
// için blokları tek tek toplamak gerekiyordu.
const HEADER_HEIGHT = 58;

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
  parcalar: EtkinlikParcasi[];
  tumGunler: GoogleTakvimEtkinligi[];
  tumGunYuksekligi: number;
  onOpenEtkinlik?: (e: GoogleTakvimEtkinligi) => void;
  googleBloklari?: Set<string>;
  onSelectDay?: (day: string) => void;
  onayKutusuYok?: boolean;
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
  parcalar,
  tumGunler,
  tumGunYuksekligi,
  onOpenEtkinlik,
  googleBloklari,
  onSelectDay,
  onayKutusuYok,
}: ColumnProps) {
  const t = useT();
  const c = useThemeColors();
  const bodyRef = useRef<HTMLDivElement>(null);
  const layout = useMemo(() => layoutColumns([...blocks, ...parcalar]), [blocks, parcalar]);

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
        // Bugünün sütunu hafifçe tonlanır; "şu an" çizgisi yalnızca mesai
        // saatleri içinde görünüyor, akşam bakınca bugünü ayırt eden şey kalmıyordu.
        backgroundImage: isToday ? `linear-gradient(${c.accent}0D, ${c.accent}0D)` : undefined,
      }}
    >
      {/* Hafta görünümünde başlık, o günün günlük görünümüne açılır. Gün
          görünümünde (single) zaten o gündeyiz, başlık tıklanmaz. */}
      <div
        onClick={!single && onSelectDay ? () => onSelectDay(day) : undefined}
        role={!single && onSelectDay ? "button" : undefined}
        title={!single && onSelectDay ? t("Günlük görünümde aç") : undefined}
        className={!single && onSelectDay ? "plan-gun-basligi" : undefined}
        style={{
          height: HEADER_HEIGHT,
          cursor: !single && onSelectDay ? "pointer" : undefined,
          flexDirection: "column",
          gap: 2,
          borderBottom: `1px solid ${c.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
          fontWeight: isToday ? 600 : 500,
          color: isToday ? c.accent : c.textPrimary,
          overflow: "hidden",
        }}
      >
        {single ? (
          <span>{shortDayLabel(day)}</span>
        ) : (
          // Gün adı ÜSTTE, yalnızca gün numarası ALTTA. Yan yana "Pzt 28 Eyl"
          // telefonda (sütun ~45 px) sığmıyor, metinler komşu sütuna taşıp
          // birbirinin üstüne biniyordu. Ay zaten üstteki aralık başlığında yazılı.
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1, lineHeight: 1.1, minWidth: 0 }}>
            <span style={{ fontSize: 11, color: isToday ? c.accent : c.textSecondary, fontWeight: 500, whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: 0.4 }}>
              {t(WEEKDAY_LABELS[weekdayOf(day)])}
            </span>
            {/* Bugün numarası dolu daire içinde: sütunlar daraldığında yalnızca
                renk farkı gözden kaçıyordu. */}
            <span
              style={{
                fontSize: 15,
                fontVariantNumeric: "tabular-nums",
                minWidth: 22,
                height: 22,
                borderRadius: 11,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: isToday ? c.accent : "transparent",
                color: isToday ? c.onPrimary : c.textPrimary,
              }}
            >
              {Number(day.slice(8, 10))}
            </span>
          </div>
        )}
        <GunOzeti blocks={blocks} />
      </div>

      {tumGunYuksekligi > 0 && (
        <div
          style={{
            height: tumGunYuksekligi,
            borderBottom: `1px solid ${c.border}`,
            padding: "3px 3px 0",
            display: "flex",
            flexDirection: "column",
            gap: 2,
            overflow: "hidden",
          }}
        >
          {tumGunler.slice(0, tumGunler.length > TUM_GUN_SATIRI ? TUM_GUN_SATIRI - 1 : TUM_GUN_SATIRI).map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => onOpenEtkinlik?.(e)}
              title={e.baslik}
              style={{
                height: TUM_GUN_SATIR_YUKSEKLIGI - 2,
                flexShrink: 0,
                borderRadius: 5,
                border: `1px solid ${c.border}`,
                borderLeft: `3px solid ${e.takvimRengi ?? c.accent}`,
                background: c.background,
                color: c.textPrimary,
                fontSize: 11,
                textAlign: "left",
                padding: "0 5px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                cursor: "pointer",
              }}
            >
              {e.baslik}
            </button>
          ))}
          {tumGunler.length > TUM_GUN_SATIRI && (
            <span style={{ fontSize: 11, color: c.textSecondary, paddingLeft: 5 }}>
              {t("+{n} etkinlik", { n: tumGunler.length - (TUM_GUN_SATIRI - 1) })}
            </span>
          )}
        </div>
      )}

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
          >
            {/* Yarım saat çizgisi: geniş sütunda 14:30'u gözle bulmak zordu. */}
            <div style={{ position: "absolute", top: HOUR_HEIGHT / 2, left: 0, right: 0, borderTop: `1px dashed ${c.border}`, opacity: 0.7 }} />
          </div>
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
            googleda={googleBloklari?.has(block.id) ?? false}
            onayKutusuYok={onayKutusuYok}
          />
        ))}

        {parcalar.map((p) => (
          <EtkinlikKutusu
            key={p.id}
            parca={p}
            startHour={startHour}
            layout={layout.get(p.id) ?? { column: 0, columns: 1 }}
            onOpen={() => onOpenEtkinlik?.(p.etkinlik)}
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
  googleda,
  onayKutusuYok,
}: {
  block: PlanTimeBlock;
  startHour: number;
  layout: { column: number; columns: number };
  onOpen: () => void;
  onToggleDone: () => void;
  googleda: boolean;
  onayKutusuYok?: boolean;
}) {
  const t = useT();
  const c = useThemeColors();
  const { top, height } = blockGeometry(block, startHour);
  const etiketler = block.labels ?? [];
  // Etiket bloğun RENGİNİ belirler (nokta ya da hap olarak eklenmez). Birden
  // çok etiket varsa etiket listesindeki sırayla ilki (önce oluşturulan)
  // kazanır; bloğun rengi hangi etiketi seçtiğin sıraya göre zıplamasın.
  const etiketRengi = etiketler[0]?.color;
  const accent = etiketRengi ?? block.focusAreaColor ?? block.color ?? c.primary;
  const done = block.status === "done";
  const skipped = block.status === "skipped";

  const width = `calc(${100 / layout.columns}% - 6px)`;
  const left = `calc(${(100 / layout.columns) * layout.column}% + 3px)`;

  const label = block.title ?? block.linkedTitle ?? block.focusAreaName ?? t("Blok");
  // Başlık sığdığı kadar satıra yayılır. Tek satıra kesildiğinde hafta
  // görünümünün dar sütunlarında yalnızca ilk kelime okunabiliyordu.
  const detayVar = height > 40;
  const baslikSatiri = Math.max(1, Math.floor((height - 8 - (detayVar ? 14 : 0)) / 17));

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
      title={`${block.startsAt}–${block.endsAt} · ${label}${etiketler.length ? ` · ${etiketler.map((l) => l.name).join(", ")}` : ""}`}
      className="plan-blok"
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
        // Etiketli blok etiketin renginde tonlanır; etiketsizde eski görünüm
        // (bitmiş = yeşil ton). Etiketli bitmiş blokta yeşile dönmüyoruz:
        // renk etiketi anlatıyor, bitmişliği onay kutusu ve üstü çizili başlık.
        background: skipped
          ? c.background
          : etiketRengi
            ? `${etiketRengi}${done ? "24" : "38"}`
            : done
              ? "rgba(46,158,91,0.10)"
              : c.surface,
        boxShadow: "0 1px 2px rgba(26,31,41,0.06)",
        padding: "3px 6px",
        overflow: "hidden",
        cursor: "pointer",
        opacity: skipped ? 0.55 : 1,
        zIndex: 2,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
        {/* Görünen kutu 18 px, tıklama alanı 30 px: eskiden 13 px'lik kutuyu
            ıskalayan her tık bloğun penceresini açıyordu. Negatif kenar
            boşluğu büyük alanın kartın düzenini itmemesi için. Iskalanan
            tıklar için pencerede ayrıca "Tamamlandı" düğmesi var. */}
        {!onayKutusuYok && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleDone();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          draggable={false}
          aria-label={done ? t("Tamamlandı işaretini kaldır") : t("Tamamlandı işaretle")}
          title={done ? t("Tamamlandı işaretini kaldır") : t("Tamamlandı işaretle")}
          className="plan-blok-onay"
          style={{
            width: 30,
            height: 30,
            margin: "-6px -4px -6px -7px",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "none",
            background: "transparent",
            padding: 0,
            cursor: "pointer",
          }}
        >
          <span
            style={{
              width: 18,
              height: 18,
              borderRadius: 5,
              border: `2px solid ${done ? c.completed : c.textSecondary}`,
              background: done ? c.completed : c.surface,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxSizing: "border-box",
            }}
          >
            {done && <IconCheck size={12} color={c.onPrimary} />}
          </span>
        </button>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            className="plan-blok-baslik"
            style={{
              fontSize: 12,
              lineHeight: "17px",
              fontWeight: 500,
              color: done ? c.completed : c.textPrimary,
              textDecoration: done ? "line-through" : undefined,
              overflow: "hidden",
              display: "-webkit-box",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: baslikSatiri,
            }}
          >
            {label}
          </div>
          {detayVar && (
            <div style={{ fontSize: 10, color: c.textSecondary, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {block.startsAt}–{block.endsAt} · {formatDuration(block.plannedMinutes)}
              {block.source === "lio" && block.status === "planned" ? " · Lio" : ""}
              {googleda ? ` · ${t("Google")}` : ""}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Google Takvim etkinliği. Plan bloğundan bilerek FARKLI görünür (soluk zemin,
 * takvim renginde şerit, onay kutusu yok): blok kullanıcının kendine ayırdığı
 * zamandır, etkinlik dışarıya verilmiş bir söz. İkisi karışırsa "bunu ben mi
 * planladım, toplantı mı" sorusu doğuyor.
 */
function EtkinlikKutusu({
  parca,
  startHour,
  layout,
  onOpen,
}: {
  parca: EtkinlikParcasi;
  startHour: number;
  layout: { column: number; columns: number };
  onOpen: () => void;
}) {
  const t = useT();
  const c = useThemeColors();
  const { top, height } = blockGeometry(parca, startHour);
  const e = parca.etkinlik;
  const width = `calc(${100 / layout.columns}% - 6px)`;
  const left = `calc(${(100 / layout.columns) * layout.column}% + 3px)`;
  const islendi = e.isleme === "gorev";

  return (
    <div
      onClick={(ev) => {
        ev.stopPropagation();
        onOpen();
      }}
      onDoubleClick={(ev) => ev.stopPropagation()}
      title={`${parca.startsAt}–${parca.endsAt} · ${e.baslik}`}
      style={{
        position: "absolute",
        top,
        left,
        width,
        height,
        borderRadius: 7,
        border: `1px dashed ${c.border}`,
        borderLeft: `3px solid ${e.takvimRengi ?? c.accent}`,
        background: c.background,
        padding: "3px 6px",
        overflow: "hidden",
        cursor: "pointer",
        opacity: e.isleme === "yoksay" ? 0.6 : 1,
        zIndex: 2,
      }}
    >
      <div
        style={{
          fontSize: 12,
          lineHeight: "15px",
          color: c.textPrimary,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {e.baslik}
      </div>
      {height > 40 && (
        <div style={{ fontSize: 10, color: c.textSecondary, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {parca.startsAt}–{parca.endsAt}
          {islendi ? ` · ${t("görev")}` : ""}
        </div>
      )}
    </div>
  );
}

/**
 * Gün başlığındaki özet: planlı toplam süre ve kaç bloğun bittiği. Atlanan
 * bloklar sayılmaz — "bugün 6 saat planladım" derken vazgeçilen iş o
 * rakamı şişirmemeli.
 */
function GunOzeti({ blocks }: { blocks: PlanTimeBlock[] }) {
  const c = useThemeColors();
  const sayilan = blocks.filter((b) => b.status !== "skipped");
  if (sayilan.length === 0) {
    return <span style={{ fontSize: 10, color: c.textSecondary, opacity: 0.6 }}>—</span>;
  }
  const toplam = sayilan.reduce((s, b) => s + b.plannedMinutes, 0);
  const biten = sayilan.filter((b) => b.status === "done").length;
  return (
    <span
      style={{
        fontSize: 10,
        color: c.textSecondary,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        maxWidth: "100%",
        padding: "0 4px",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {formatDuration(toplam)}
      <span style={{ color: biten === sayilan.length ? c.completed : undefined }}> · {biten}/{sayilan.length}</span>
    </span>
  );
}
