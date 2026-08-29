import { useCallback, useEffect, useMemo, useState } from "react";
import type { PlanCalendarView, PlanPeriodKind, PlanTimeBlock } from "@projelio/shared";
import { useThemeColors } from "../theme/useThemeColors";
import { planning, type PlanSuggestionResult } from "../api/planning";
import { useIsDesktop } from "../lib/useIsDesktop";
import { useSwipeNavigate } from "../lib/useSwipeNavigate";
import { askLio } from "../lib/askLio";
import { useProjectFabAction } from "../lib/projectFab";
import {
  addDays,
  addMonths,
  formatDuration,
  longDayLabel,
  monthLabel,
  shortDayLabel,
  startOfMonth,
  startOfWeek,
  timeToMinutes,
  minutesToTime,
  todayStr,
  type DraggedItem,
} from "../lib/planGrid";
import PlanGrid from "../components/plan/PlanGrid";
import PlanMonthGrid from "../components/plan/PlanMonthGrid";
import PlanProgressPanel from "../components/plan/PlanProgressPanel";
import PlanTargetsModal from "../components/plan/PlanTargetsModal";
import PlanBlockModal from "../components/plan/PlanBlockModal";
import RitualCard from "../components/plan/RitualCard";
import SchedulePickerPanel from "../components/plan/SchedulePickerPanel";

type ViewMode = PlanPeriodKind;

const VIEW_LABELS: Record<ViewMode, string> = { day: "Günlük", week: "Haftalık", month: "Aylık" };

/**
 * Takvim — Projelio'nun kişisel planlama sayfası.
 *
 * Sayfanın kurduğu zincir dört halkalı ve her ölçekte aynı: dönemin NİYETİ →
 * niyetin odak alanlarına YÜZDEYLE dağılımı → dağılımın takvimdeki SAAT
 * BLOKLARI → gerçekleşenin hedefle KARŞILAŞTIRMASI.
 *
 * Üç görünüm bu zincirin farklı halkalarına yakınlaşır:
 *   Gün    — saat saat ne yapacağım (bloklar)
 *   Hafta  — haftanın nasıl bölündüğü (bloklar + dağılım)
 *   Ay     — ayın nerelerinde yığılma var (yük özeti + sonuç hedefleri)
 *
 * Ekip takvimi bilinçli olarak burada DEĞİL: bu sayfa kullanıcının kimseye
 * göstermediği planıdır. Ekibe atanmış görevler sağdaki "planlanmamış işler"
 * sütunundan takvime çekilir, ama kimin ne zaman çalıştığı burada paylaşılmaz.
 */
export default function CalendarView() {
  const c = useThemeColors();
  const isDesktop = useIsDesktop();

  const [view, setView] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState<string>(() => todayStr());
  /** Son gezinmenin yönü — kayma animasyonunu hangi taraftan oynatacağımız. */
  const [slideDir, setSlideDir] = useState<0 | 1 | -1>(0);
  const [data, setData] = useState<PlanCalendarView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingBlock, setEditingBlock] = useState<PlanTimeBlock | null>(null);
  const [draftBlock, setDraftBlock] = useState<{ blockDate: string; startsAt: string; endsAt: string } | null>(null);
  const [targetsOpen, setTargetsOpen] = useState(false);
  const [suggestion, setSuggestion] = useState<PlanSuggestionResult | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  // Ritüel kartı kapatıldığında bu oturumda tekrar açılmaz. Sunucu tarafında
  // "atlandı" kaydı yalnızca kullanıcı "Şimdi değil" derse yazılır; "kendim
  // yaparım" diyen biri sayfayı yenilediğinde kartı yeniden görebilmeli.
  const [ritualDismissed, setRitualDismissed] = useState(false);

  const load = useCallback(() => {
    setError(null);
    planning
      .getCalendar(view, anchor)
      .then(setData)
      .catch((err) => setError(String(err?.message ?? "Takvim yüklenemedi.")))
      .finally(() => setLoading(false));
  }, [view, anchor]);

  useEffect(load, [load]);

  // Görevler bu sayfanın dışında da değişiyor (biri görevi tamamlar, atama
  // kalkar). Sekmeye dönüldüğünde tazeliyoruz ki eskimiş bir takvime bakılmasın.
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  // Görünüm değişince çapa o görünümün başına çekilir. Aksi halde aydan haftaya
  // geçerken ayın 23'ünde kalınıp "hangi haftadayım" sorusu doğuyordu.
  const changeView = (next: ViewMode) => {
    setSlideDir(0);
    setView(next);
    setAnchor((current) =>
      next === "week" ? startOfWeek(current) : next === "month" ? startOfMonth(current) : current
    );
  };

  const step = (direction: 1 | -1) => {
    setSlideDir(direction);
    setAnchor((current) => {
      if (view === "day") return addDays(current, direction);
      if (view === "week") return addDays(current, 7 * direction);
      return addMonths(startOfMonth(current), direction);
    });
  };

  // İleri giderken yeni dönem sağdan, geri giderken soldan süzülür. 0 =
  // animasyon yok: "Bugün" ve görünüm değişimi bir yöne gitmek değil, sıçramak.
  const slideClass =
    slideDir === 1 ? "plan-slide-next" : slideDir === -1 ? "plan-slide-prev" : undefined;

  // Yana kaydırarak dönem değiştirme: dokunmatikte parmakla, trackpad'de iki
  // parmakla, klavyede ← / → ile (bkz. lib/useSwipeNavigate.ts).
  const swipe = useSwipeNavigate(step);

  const periodLabel = useMemo(() => {
    if (!data) return "";
    if (view === "day") return longDayLabel(data.from);
    if (view === "week") return `${shortDayLabel(data.from)} – ${shortDayLabel(data.to)}`;
    return monthLabel(data.from);
  }, [data, view]);

  // ------------------------------------------------------------------ Eylemler

  const moveBlock = async (blockId: string, blockDate: string, startsAt: string) => {
    // Süre gönderilmiyor: sunucu bloğun mevcut uzunluğunu koruyor. Süreyi
    // burada hesaplasaydık taşıma sırasında yuvarlama farkları birikirdi.
    await planning.moveBlock(blockId, { blockDate, startsAt });
    load();
  };

  const toggleDone = async (block: PlanTimeBlock) => {
    await planning.setBlockStatus(block.id, block.status === "done" ? "planned" : "done");
    load();
  };

  const dropItem = async (item: DraggedItem, blockDate: string, startsAt: string, endsAt: string) => {
    await planning.createBlock({
      blockDate,
      startsAt,
      endsAt,
      title: item.title,
      // Kartın türü bloğun hangi tabloya bağlanacağını belirler: gerçek
      // görevler tasks'a, kişisel görevler personal_todos'a.
      taskId: item.kind === "task" ? item.itemId : undefined,
      personalTodoId: item.kind === "personal" ? item.itemId : undefined,
      source: "manual",
    });
    load();
  };

  const runSuggest = async (apply: boolean) => {
    if (!data) return;
    setSuggesting(true);
    setError(null);
    try {
      const result = await planning.suggest({
        kind: view === "month" ? "week" : view,
        date: data.from,
        apply,
        // Uygularken eski, dokunulmamış öneriler temizlenir; aksi halde her
        // "uygula" bir öncekinin üstüne yığılıp takvimi ikiye katlıyordu.
        replaceExisting: apply,
      });
      setSuggestion(apply ? null : result);
      if (apply) load();
    } catch (err: any) {
      setError(String(err?.message ?? "Dağıtım yapılamadı."));
      setSuggestion(null);
    } finally {
      setSuggesting(false);
    }
  };

  const bumpCount = async (targetId: string, delta: number) => {
    await planning.bumpTargetCount(targetId, delta);
    load();
  };

  // Çalışma ritmi takvim yanıtıyla birlikte geliyor (bkz. PlanCalendarView.preferences).
  // `data` henüz yokken kullanılmayacağı için varsayılanlar yalnızca tip
  // güvenliği içindir; ilk render zaten "yükleniyor" ile geçiliyor.
  const prefs = data?.preferences;
  const dayStart = prefs?.dayStart ?? "09:00";
  const dayEnd = prefs?.dayEnd ?? "18:00";
  const workdays = prefs?.workdays ?? [1, 2, 3, 4, 5];
  const blockMinutes = prefs?.focusBlockMinutes ?? 90;

  // Takvimde "+" yeni bir plan bloğu açar. Eskiden bu sayfa kendi eylemini
  // kaydetmediği için "+" varsayılana düşüyor ve takvimin ortasında "Yeni iş"
  // ekranı açıyordu. Blok, bakılan günün mesai başlangıcına konur; saat zaten
  // modalde değiştirilebiliyor.
  useProjectFabAction(
    {
      label: "Plan bloğu ekle",
      onClick: () =>
        setDraftBlock({
          blockDate: view === "day" ? anchor : todayStr(),
          startsAt: dayStart,
          endsAt: minutesToTime(timeToMinutes(dayStart) + blockMinutes),
        }),
    },
    [view, anchor, dayStart, blockMinutes]
  );

  // -------------------------------------------------------------------- Render

  if (loading && !data) {
    return (
      <div style={{ minHeight: "100vh", background: c.background, padding: 28 }}>
        <p style={{ color: c.textSecondary, fontSize: 15 }}>Takvim yükleniyor…</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: c.background, padding: isDesktop ? 28 : 16 }}>
      {/* --------------------------------------------------------- Başlık */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <h1 style={{ color: c.textPrimary, fontSize: 22, fontWeight: 500, margin: 0, marginRight: 6 }}>Takvim</h1>

        {/* Görünüm seçici ve dönem gezinmesi bu satırda DEĞİL: ikisi de
            takvimin hemen üstünde, ortalanmış kendi şeridinde duruyor
            (bkz. aşağıdaki "Takvim kontrol şeridi"). Kontrolün baktığı
            ızgaraya yakın olması, sayfanın en üstündeki başlık satırına
            karışmasından daha okunur. */}

        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button
            onClick={() => askLio(`${periodLabel} dönemim için planımı gözden geçir ve nerede sapma var söyle.`)}
            style={{
              padding: "6px 13px",
              borderRadius: 8,
              fontSize: 14,
              border: `1px solid ${c.border}`,
              background: c.surface,
              color: c.textPrimary,
              cursor: "pointer",
            }}
          >
            Lio'ya sor
          </button>
          {view !== "month" && (
            <button
              onClick={() => runSuggest(false)}
              disabled={suggesting}
              style={{
                padding: "6px 13px",
                borderRadius: 8,
                fontSize: 14,
                border: "none",
                background: c.accent,
                color: "#fff",
                cursor: suggesting ? "default" : "pointer",
                opacity: suggesting ? 0.6 : 1,
              }}
            >
              {suggesting ? "Hesaplanıyor…" : "Otomatik dağıt"}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div
          style={{
            fontSize: 13,
            color: c.danger,
            background: "rgba(193,52,52,0.07)",
            border: `1px solid rgba(193,52,52,0.25)`,
            borderRadius: 9,
            padding: "9px 12px",
            marginBottom: 14,
          }}
        >
          {error}
        </div>
      )}

      {/* ------------------------------------------------------- Ritüel kartı */}
      {data?.ritual && !ritualDismissed && (
        <div style={{ marginBottom: 16 }}>
          <RitualCard
            ritual={data.ritual}
            onDone={() => {
              setRitualDismissed(true);
              load();
            }}
          />
        </div>
      )}

      {/* ------------------------------------------------ Dağıtım önizlemesi */}
      {suggestion && (
        <SuggestionPreview
          suggestion={suggestion}
          busy={suggesting}
          onApply={() => runSuggest(true)}
          onDismiss={() => setSuggestion(null)}
        />
      )}

      {/* ------------------------------------------------------ Dönemin niyeti */}
      {data && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: c.surface,
            border: `1px solid ${c.border}`,
            borderRadius: 12,
            padding: "12px 16px",
            marginBottom: 16,
          }}
        >
          <span style={{ fontSize: 12, color: c.textSecondary, flexShrink: 0 }}>Bu dönemin niyeti</span>
          <span style={{ fontSize: 15, color: data.progress.period.theme ? c.textPrimary : c.textSecondary, flex: 1, minWidth: 0 }}>
            {data.progress.period.theme ?? "henüz yazılmadı"}
          </span>
          <button
            onClick={() => setTargetsOpen(true)}
            style={{
              padding: "5px 11px",
              fontSize: 13,
              borderRadius: 7,
              border: `1px solid ${c.border}`,
              background: c.surface,
              color: c.textPrimary,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            {data.progress.period.theme ? "Düzenle" : "Yaz"}
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------ Gövde */}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexDirection: isDesktop ? "row" : "column" }}>
        {/* Kaydırma yalnızca ızgaranın üstünde: sağdaki ilerleme sütununda
            yatay kaydırma bir şey ifade etmiyor, orada da yakalarsak
            kullanıcı listeyi kaydırırken dönem değişirdi. */}
        <div style={{ flex: 1, minWidth: 0, width: "100%" }}>
          {/* ------------------------------------------ Takvim kontrol şeridi */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              flexWrap: "wrap",
              marginBottom: 12,
            }}
          >
            <div style={{ display: "flex", gap: 4 }}>
              {(["day", "week", "month"] as ViewMode[]).map((v) => (
                <button
                  key={v}
                  onClick={() => changeView(v)}
                  style={{
                    padding: "6px 13px",
                    borderRadius: 8,
                    fontSize: 14,
                    border: `1px solid ${view === v ? c.primary : c.border}`,
                    background: view === v ? c.primary : c.surface,
                    color: view === v ? "#fff" : c.textPrimary,
                    cursor: "pointer",
                  }}
                >
                  {VIEW_LABELS[v]}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <NavButton label="‹" onClick={() => step(-1)} />
              <button
                onClick={() => {
                  setSlideDir(0);
                  setAnchor(todayStr());
                }}
                style={{
                  padding: "6px 11px",
                  borderRadius: 8,
                  fontSize: 13,
                  border: `1px solid ${c.border}`,
                  background: c.surface,
                  color: c.textPrimary,
                  cursor: "pointer",
                }}
              >
                Bugün
              </button>
              <NavButton label="›" onClick={() => step(1)} />
            </div>

            {/* Hangi dönemdeyiz sorusu kaydırmalı gezinmede daha da önemli:
                okla değil parmakla ilerleyince "kaç hafta gittim" bilgisi
                yalnızca bu etikette kalıyor. */}
            <span style={{ fontSize: 16, fontWeight: 500, color: c.textPrimary }}>{periodLabel}</span>
          </div>

          {/* Kaydırma animasyonu: yeni dönem, gidilen yönün tersinden içeri
              süzülür. Sarmalayıcının overflow'u gizli — animasyon sırasında
              ızgara kenardan taşıp sayfayı yatay kaydırılabilir yapmasın.
              `key` VERİNİN dönemine bağlı, çapaya değil: veri asenkron
              geliyor, çapaya bağlasaydık animasyon eski içerikle oynar,
              yeni veri gelince de içerik yerinde "zıplardı". */}
          {/* Tutup kaydırma yalnızca ızgaranın üstünde: sağdaki ilerleme
              sütununda yatay sürükleme bir şey ifade etmiyor. */}
          <div {...swipe.handlers} style={{ overflowX: "hidden", ...swipe.handlers.style }}>
            <div ref={swipe.contentRef} key={data ? `${view}-${data.from}` : "bos"} className={slideClass}>
          {data && view === "month" && (
            <PlanMonthGrid
              from={data.from}
              to={data.to}
              blocks={data.blocks}
              workdays={workdays}
              defaultBlockMinutes={blockMinutes}
              dayStart={dayStart}
              onSelectDay={(day) => {
                setAnchor(day);
                setView("day");
              }}
              onDropItem={dropItem}
            />
          )}

          {data && view !== "month" && (
            <PlanGrid
              from={data.from}
              to={data.to}
              blocks={data.blocks}
              dayStart={dayStart}
              dayEnd={dayEnd}
              workdays={workdays}
              defaultBlockMinutes={blockMinutes}
              onOpenBlock={setEditingBlock}
              onToggleDone={toggleDone}
              onCreateAt={(blockDate, startsAt, endsAt) => setDraftBlock({ blockDate, startsAt, endsAt })}
              onMoveBlock={moveBlock}
              onDropItem={dropItem}
            />
          )}
            </div>
          </div>
        </div>

        <div style={{ width: isDesktop ? 320 : "100%", flexShrink: 0, display: "flex", flexDirection: "column", gap: 16 }}>
          {data && (
            <PlanProgressPanel
              progress={data.progress}
              onEditTargets={() => setTargetsOpen(true)}
              onBumpCount={bumpCount}
            />
          )}
          {data && <SchedulePickerPanel unscheduled={data.unscheduled} />}
        </div>
      </div>

      {/* ----------------------------------------------------------- Modallar */}
      {data && targetsOpen && (
        <PlanTargetsModal
          period={data.progress.period}
          targets={data.progress.period.targets ?? []}
          focusAreas={data.focusAreas}
          onClose={() => setTargetsOpen(false)}
          onSaved={load}
        />
      )}

      {data && (editingBlock || draftBlock) && (
        <PlanBlockModal
          block={editingBlock ?? undefined}
          draft={draftBlock ?? undefined}
          focusAreas={data.focusAreas}
          onClose={() => {
            setEditingBlock(null);
            setDraftBlock(null);
          }}
          onSaved={load}
        />
      )}
    </div>
  );
}

function NavButton({ label, onClick }: { label: string; onClick: () => void }) {
  const c = useThemeColors();
  return (
    <button
      onClick={onClick}
      aria-label={label === "‹" ? "Önceki" : "Sonraki"}
      style={{
        width: 30,
        height: 30,
        borderRadius: 8,
        border: `1px solid ${c.border}`,
        background: c.surface,
        color: c.textPrimary,
        fontSize: 17,
        lineHeight: "26px",
        padding: 0,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

/**
 * Otomatik dağıtımın önizlemesi.
 *
 * Uygulamadan önce gösteriliyor çünkü takvimi bir düğmeyle baştan kurmak geri
 * alınması can sıkıcı bir işlem. Ayrıca "yerleşemeyen" süre burada açıkça
 * yazılıyor: hedefini kurduğunu sanıp haftanın yarısında eksik kaldığını fark
 * etmek, baştan bilmekten çok daha kötü.
 */
function SuggestionPreview({
  suggestion,
  busy,
  onApply,
  onDismiss,
}: {
  suggestion: PlanSuggestionResult;
  busy: boolean;
  onApply: () => void;
  onDismiss: () => void;
}) {
  const c = useThemeColors();
  return (
    <div
      style={{
        background: c.surface,
        border: `1px solid ${c.accent}`,
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, color: c.textPrimary, marginBottom: 6 }}>
        {suggestion.proposedCount} blok · {formatDuration(suggestion.proposedMinutes)} önerildi
      </div>
      <p style={{ margin: 0, fontSize: 13, color: c.textSecondary, lineHeight: 1.5 }}>
        Hedeflerin çalışma saatlerine göre dağıtıldı. Elle koyduğun bloklara dokunulmadı.
      </p>

      {suggestion.shortfall.length > 0 && (
        <div
          style={{
            marginTop: 10,
            fontSize: 13,
            color: c.danger,
            background: "rgba(193,52,52,0.07)",
            border: `1px solid rgba(193,52,52,0.25)`,
            borderRadius: 8,
            padding: "8px 11px",
            lineHeight: 1.5,
          }}
        >
          Takvimde yer kalmadığı için yerleşemeyen süre:{" "}
          {suggestion.shortfall.map((s) => `${s.focusAreaName ?? "?"} ${formatDuration(s.minutes)}`).join(", ")}.
          Kapasiteyi artırabilir, bir hedefi küçültebilir ya da bir işi sonraki döneme atabilirsin.
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 13 }}>
        <button
          onClick={onApply}
          disabled={busy}
          style={{
            padding: "7px 14px",
            fontSize: 13,
            borderRadius: 8,
            border: "none",
            background: c.accent,
            color: "#fff",
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.6 : 1,
          }}
        >
          Takvime uygula
        </button>
        <button
          onClick={onDismiss}
          style={{
            padding: "7px 14px",
            fontSize: 13,
            borderRadius: 8,
            border: `1px solid ${c.border}`,
            background: c.surface,
            color: c.textPrimary,
            cursor: "pointer",
          }}
        >
          Vazgeç
        </button>
      </div>
    </div>
  );
}

