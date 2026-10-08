import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { GoogleTakvimEtkinligi, PlanTimeBlock, Project, ProjeEtkinligi, ProjeTakvimGorunumu, Task } from "@projelio/shared";
import {
  PROJE_ETKINLIK_TURLERI,
  PROJE_ETKINLIK_TURU_ETIKETI,
  gorevBitisiniTakvimOgesine,
  planBlogunuTakvimOgesine,
  projeEtkinligiAraliktaMi,
  projeEtkinlikRengi,
  projeEtkinliginiTakvimOgesine,
} from "@projelio/shared";
import { projeTakvimiApi } from "../../api/projeTakvimi";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";
import { useSwipeNavigate } from "../../lib/useSwipeNavigate";
import {
  addDays,
  addMonths,
  longDayLabel,
  minutesToTime,
  monthLabel,
  shortDayLabel,
  startOfMonth,
  startOfWeek,
  timeToMinutes,
  todayStr,
} from "../../lib/planGrid";
import PlanGrid from "../plan/PlanGrid";
import PlanMonthGrid from "../plan/PlanMonthGrid";
import ProjeEtkinlikModal from "./ProjeEtkinlikModal";

type Gorunum = "day" | "week" | "month";

const GORUNUM_ETIKETI: Record<Gorunum, string> = { day: "Günlük", week: "Haftalık", month: "Aylık" }; // dil:anahtar

/**
 * Projenin ortak çalışma saatleri yok (herkesin mesaisi kendi plan
 * tercihinde). Izgara bu aralıkla açılır, dışına düşen etkinlik varsa
 * kendiliğinden genişler (bkz. lib/planGrid gridRange).
 */
const GUN_BASI = "08:00";
const GUN_SONU = "19:00";
const IS_GUNLERI = [1, 2, 3, 4, 5];
const VARSAYILAN_SURE = 60;

interface Props {
  project: Project;
  tasks: Task[];
  onEditTask: (task: Task) => void;
  /** Açılışta gösterilecek gün (?tarih=); bildirimden gelen bağlantı kullanır. */
  baslangicTarihi?: string;
}

/**
 * Proje takvimi — Süreç sekmesinin takvim görünümü.
 *
 * Kişisel Takvim'in ızgarasını (PlanGrid / PlanMonthGrid) kullanır ama
 * içeriği farklıdır: projenin ORTAK etkinlikleri (toplantı, kilometre taşı,
 * teslim), görevlerin bitiş günleri ve — yalnızca bakan kişiye — onun bu
 * projenin görevlerine ayırdığı kendi plan blokları. İki takvimin ilişkisi
 * packages/shared/src/projeTakvimi.ts başında anlatılıyor.
 *
 * Saatli etkinlikler ızgarada "blok" olarak çizilir ki sürüklenerek
 * taşınabilsin; tüm gün etkinlikler, görev bitişleri ve plan blokları salt
 * okunur kutulardır (tıklanınca açılırlar).
 */
export default function ProjeTakvimi({ project, tasks, onEditTask, baslangicTarihi }: Props) {
  const c = useThemeColors();
  const t = useT();
  const navigate = useNavigate();

  const [gorunum, setGorunum] = useState<Gorunum>("week");
  const [capa, setCapa] = useState<string>(() => baslangicTarihi ?? todayStr());
  const [kayma, setKayma] = useState<0 | 1 | -1>(0);
  const [veri, setVeri] = useState<ProjeTakvimGorunumu | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [gorevleriGoster, setGorevleriGoster] = useState(true);
  const [bloklariGoster, setBloklariGoster] = useState(true);

  const [acikEtkinlik, setAcikEtkinlik] = useState<ProjeEtkinligi | null>(null);
  const [taslak, setTaslak] = useState<{ tarih: string; baslangic?: string; bitis?: string; tumGun?: boolean } | null>(null);

  // Görünen aralık. Ay görünümü tam haftalarla çizildiği için veri aralığı
  // ayın başındaki ve sonundaki haftaya taşırılıyor.
  const { from, to, veriFrom, veriTo } = useMemo(() => {
    if (gorunum === "day") return { from: capa, to: capa, veriFrom: capa, veriTo: capa };
    if (gorunum === "week") {
      const bas = startOfWeek(capa);
      return { from: bas, to: addDays(bas, 6), veriFrom: bas, veriTo: addDays(bas, 6) };
    }
    const bas = startOfMonth(capa);
    const son = addDays(addMonths(bas, 1), -1);
    return { from: bas, to: son, veriFrom: startOfWeek(bas), veriTo: addDays(startOfWeek(son), 6) };
  }, [gorunum, capa]);

  const yukle = useCallback(() => {
    setHata(null);
    projeTakvimiApi
      .gorunum(project.id, veriFrom, veriTo)
      .then(setVeri)
      .catch((err) => setHata(String(err?.message ?? t("Takvim yüklenemedi."))));
  }, [project.id, veriFrom, veriTo]);

  useEffect(yukle, [yukle]);

  const adim = (yon: 1 | -1) => {
    setKayma(yon);
    setCapa((cur) => (gorunum === "day" ? addDays(cur, yon) : gorunum === "week" ? addDays(cur, 7 * yon) : addMonths(startOfMonth(cur), yon)));
  };
  const swipe = useSwipeNavigate(adim);

  const gorunumDegistir = (yeni: Gorunum) => {
    setKayma(0);
    setGorunum(yeni);
  };

  const etkinlikler = useMemo(
    () => (veri?.events ?? []).filter((e) => projeEtkinligiAraliktaMi(e, veriFrom, veriTo)),
    [veri, veriFrom, veriTo]
  );

  // Saatli etkinlikler gün/hafta ızgarasında sürüklenebilir blok olarak.
  const bloklar = useMemo<PlanTimeBlock[]>(
    () =>
      gorunum === "month"
        ? []
        : etkinlikler
            .filter((e) => !e.allDay && e.startsAt && e.endsAt)
            .map((e) => ({
              id: e.id,
              blockDate: e.eventDate,
              startsAt: e.startsAt!,
              endsAt: e.endsAt!,
              plannedMinutes: timeToMinutes(e.endsAt!) - timeToMinutes(e.startsAt!),
              title: e.title,
              note: e.note,
              color: projeEtkinlikRengi(e),
              source: "manual",
              status: "planned",
              sortOrder: 0,
              labels: [],
            })),
    [etkinlikler, gorunum]
  );

  // Salt okunur kutular: tüm gün etkinlikler (ay görünümünde hepsi), görev
  // bitişleri ve bakanın kendi plan blokları.
  const kutular = useMemo<GoogleTakvimEtkinligi[]>(() => {
    const liste: GoogleTakvimEtkinligi[] = etkinlikler
      .filter((e) => gorunum === "month" || e.allDay)
      .map(projeEtkinliginiTakvimOgesine);
    if (gorevleriGoster) {
      for (const g of tasks) {
        if (!g.deadline) continue;
        const gun = g.deadline.slice(0, 10);
        if (gun < veriFrom || gun > veriTo) continue;
        const oge = gorevBitisiniTakvimOgesine(g);
        if (oge) liste.push(oge);
      }
    }
    if (bloklariGoster) for (const b of veri?.myBlocks ?? []) liste.push(planBlogunuTakvimOgesine(b));
    return liste;
  }, [etkinlikler, gorunum, tasks, gorevleriGoster, bloklariGoster, veri, veriFrom, veriTo]);

  const kutuyuAc = (oge: GoogleTakvimEtkinligi) => {
    if (oge.kaynak === "proje") {
      const e = etkinlikler.find((x) => x.id === oge.projeEtkinlikId);
      if (e) setAcikEtkinlik(e);
    } else if (oge.kaynak === "gorev") {
      const g = tasks.find((x) => x.id === oge.gorevId);
      if (g) onEditTask(g);
    } else if (oge.kaynak === "plan") {
      // Plan bloğu kişisel takvimin kaydı; düzenlemesi orada.
      navigate("/calendar");
    }
  };

  const tasi = async (id: string, gun: string, baslangic: string) => {
    const e = etkinlikler.find((x) => x.id === id);
    if (!e || !e.startsAt || !e.endsAt) return;
    if (!e.duzenlenebilir) {
      setHata(t("Bu etkinliği yalnızca ekleyen kişi ya da proje sahibi taşıyabilir."));
      return;
    }
    const sure = timeToMinutes(e.endsAt) - timeToMinutes(e.startsAt);
    const bitisDk = timeToMinutes(baslangic) + sure;
    // Gün sınırını aşan taşıma etkinliği kısaltırdı; reddediyoruz.
    if (bitisDk > 23 * 60 + 59) {
      setHata(t("Etkinlik gün sonunu aşacak şekilde taşınamaz."));
      return;
    }
    try {
      await projeTakvimiApi.duzenle(id, { eventDate: gun, startsAt: baslangic, endsAt: minutesToTime(bitisDk) });
      yukle();
    } catch (err: any) {
      setHata(String(err?.message ?? t("İşlem tamamlanamadı.")));
    }
  };

  const donemEtiketi =
    gorunum === "day" ? longDayLabel(from) : gorunum === "week" ? `${shortDayLabel(from)} – ${shortDayLabel(to)}` : monthLabel(from);
  const kaymaSinifi = kayma === 1 ? "plan-slide-next" : kayma === -1 ? "plan-slide-prev" : undefined;

  const dugme = (secili: boolean) => ({
    padding: "6px 13px",
    borderRadius: 8,
    fontSize: 14,
    border: `1px solid ${secili ? c.primary : c.border}`,
    background: secili ? c.primary : c.surface,
    color: secili ? "#fff" : c.textPrimary,
    cursor: "pointer",
  });

  return (
    <div>
      {/* ------------------------------------------------ Kontrol şeridi */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 4 }}>
          {(["day", "week", "month"] as Gorunum[]).map((g) => (
            <button key={g} onClick={() => gorunumDegistir(g)} style={dugme(gorunum === g)}>
              {t(GORUNUM_ETIKETI[g])}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button onClick={() => adim(-1)} aria-label={t("Önceki")} style={{ ...dugme(false), padding: "6px 10px" }}>
            ‹
          </button>
          <button
            onClick={() => {
              setKayma(0);
              setCapa(todayStr());
            }}
            style={{ ...dugme(false), fontSize: 13 }}
          >
            {t("Bugün")}
          </button>
          <button onClick={() => adim(1)} aria-label={t("Sonraki")} style={{ ...dugme(false), padding: "6px 10px" }}>
            ›
          </button>
        </div>
        <span style={{ fontSize: 16, fontWeight: 500, color: c.textPrimary }}>{donemEtiketi}</span>
        <button
          onClick={() => setTaslak({ tarih: gorunum === "day" ? capa : todayStr() })}
          style={{
            marginLeft: "auto",
            padding: "6px 13px",
            borderRadius: 8,
            fontSize: 14,
            border: "none",
            background: c.accent,
            color: "#fff",
            cursor: "pointer",
          }}
        >
          {t("+ Etkinlik")}
        </button>
      </div>

      {/* --------------------------------------------- Lejant + süzgeçler */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 12, fontSize: 12, color: c.textSecondary }}>
        {PROJE_ETKINLIK_TURLERI.map((k) => (
          <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: projeEtkinlikRengi({ kind: k }) }} />
            {t(PROJE_ETKINLIK_TURU_ETIKETI[k])}
          </span>
        ))}
        <label style={{ display: "inline-flex", alignItems: "center", gap: 5, marginLeft: "auto", cursor: "pointer" }}>
          <input type="checkbox" checked={gorevleriGoster} onChange={(e) => setGorevleriGoster(e.target.checked)} />
          {t("Görev bitişleri")}
        </label>
        <label
          style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer" }}
          title={t("Bu projenin görevleri için kişisel Takvim'ine koyduğun bloklar. Yalnızca sen görürsün.")}
        >
          <input type="checkbox" checked={bloklariGoster} onChange={(e) => setBloklariGoster(e.target.checked)} />
          {t("Benim plan bloklarım")}
        </label>
      </div>

      {hata && (
        <div
          style={{
            fontSize: 13,
            color: c.danger,
            background: "rgba(193,52,52,0.07)",
            border: `1px solid rgba(193,52,52,0.25)`,
            borderRadius: 9,
            padding: "9px 12px",
            marginBottom: 12,
          }}
        >
          {hata}
        </div>
      )}

      {!veri && !hata && <p style={{ color: c.textSecondary, fontSize: 14 }}>{t("Takvim yükleniyor…")}</p>}

      {veri && (
        <div {...swipe.handlers} style={{ overflowX: "hidden", ...swipe.handlers.style }}>
          <div ref={swipe.contentRef} key={`${gorunum}-${from}`} className={kaymaSinifi}>
            {gorunum === "month" ? (
              <PlanMonthGrid
                from={from}
                to={to}
                blocks={[]}
                workdays={IS_GUNLERI}
                defaultBlockMinutes={VARSAYILAN_SURE}
                dayStart={GUN_BASI}
                onSelectDay={(gun) => {
                  setKayma(0);
                  setCapa(gun);
                  setGorunum("day");
                }}
                onDropItem={() => undefined}
                etkinlikler={kutular}
                onOpenEtkinlik={kutuyuAc}
              />
            ) : (
              <PlanGrid
                from={from}
                to={to}
                blocks={bloklar}
                dayStart={GUN_BASI}
                dayEnd={GUN_SONU}
                workdays={IS_GUNLERI}
                defaultBlockMinutes={VARSAYILAN_SURE}
                onOpenBlock={(b) => {
                  const e = etkinlikler.find((x) => x.id === b.id);
                  if (e) setAcikEtkinlik(e);
                }}
                onToggleDone={() => undefined}
                onCreateAt={(tarih, baslangic, bitis) => setTaslak({ tarih, baslangic, bitis })}
                onMoveBlock={tasi}
                onDropItem={() => undefined}
                etkinlikler={kutular}
                onOpenEtkinlik={kutuyuAc}
                onSelectDay={(gun) => {
                  setKayma(0);
                  setCapa(gun);
                  setGorunum("day");
                }}
                onayKutusuYok
              />
            )}
          </div>
        </div>
      )}

      <p style={{ fontSize: 12, color: c.textSecondary, margin: "10px 0 0", lineHeight: 1.5 }}>
        {t("Boş bir saate çift tıklayarak etkinlik ekleyebilir, sürükleyerek taşıyabilirsin. Etkinlikler katılımcıların kişisel Takvim'inde de görünür.")}
      </p>

      {(acikEtkinlik || taslak) && (
        <ProjeEtkinlikModal
          projectId={project.id}
          etkinlik={acikEtkinlik ?? undefined}
          taslak={taslak ?? undefined}
          onClose={() => {
            setAcikEtkinlik(null);
            setTaslak(null);
          }}
          onSaved={yukle}
        />
      )}
    </div>
  );
}
