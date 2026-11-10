import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Project } from "@projelio/shared";
import { api } from "../../api/client";
import ProjectCard from "../ProjectCard";
import CreateProjectModal from "../CreateProjectModal";
import ProjeBolumu from "./ProjeBolumu";
import { useCurrentUser } from "../../lib/useCurrentUser";
import { useSortableList } from "../../lib/useSortableList";
import { useLatestRef, useRefreshOnUndo, useReorderUndo } from "../../lib/undo";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";

export interface SirketProjeleriPanelHandle {
  openCreate: () => void;
}

/**
 * Şirketin Projeler sekmesi (migration 191): şirket proje alanının projeleri.
 *
 * Serbest çalışanın iş sayfasındaki Projeler sekmesiyle AYNI davranış
 * (kullanıcı kararı, 2026-11-10 — "tıpkı serbest çalışan proje yönetimi gibi"):
 * ana ızgarada aktif + beklemedekiler sürüklenerek dizilir, pasif ve biten
 * projeler ayrı bölümlerde, liste kısa aralıklarla tazelenir. Proje sayfası,
 * görevler, çıktılar, dosyalar ve bütçe işteki projeninkiyle aynı yoldan geçer:
 * alan sıradan bir iş satırı, yalnızca arayüzde iş olarak görünmüyor.
 *
 * JobDetail'deki ızgara bilerek buraya taşınmadı: o sayfa rutinleri, görev
 * sayaçlarını ve modül panelini aynı listeden besliyor; ikisini tek bileşende
 * toplamak iş sayfasını yeniden yazmak demekti.
 */
const SirketProjeleriPanel = forwardRef<SirketProjeleriPanelHandle, { jobId: string; alanSahibiId?: string }>(
  function SirketProjeleriPanel({ jobId, alanSahibiId }, ref) {
    const c = useThemeColors();
    const t = useT();
    const { user: currentUser } = useCurrentUser();
    const [projeler, setProjeler] = useState<Project[] | null>(null);
    const [yeniAcik, setYeniAcik] = useState(false);
    const [pasifAcik, setPasifAcik] = useState(false);
    const [bitenAcik, setBitenAcik] = useState(false);
    const gridRef = useRef<HTMLDivElement>(null);
    const projelerRef = useLatestRef(projeler ?? []);
    const registerReorderUndo = useReorderUndo();

    useImperativeHandle(ref, () => ({ openCreate: () => setYeniAcik(true) }), []);

    const yukle = () => {
      api
        .get<Project[]>(`/jobs/${jobId}/projects`)
        .then(setProjeler)
        .catch(() => setProjeler([]));
    };
    useEffect(yukle, [jobId]);
    useRefreshOnUndo(yukle);

    // Canlı görünüm: başka bir çalışan proje eklediğinde sayfa yenilenmeden
    // görünsün (bkz. JobDetail'deki aynı yoklama). Değişiklik yoksa state
    // güncellenmez.
    useEffect(() => {
      const izi = (list: Project[]) =>
        JSON.stringify(list.map((p) => [p.id, p.title, p.status, p.sortOrder, p.coverImageUrl, p.deadline]));
      const timer = setInterval(() => {
        api
          .get<Project[]>(`/jobs/${jobId}/projects`)
          .then((taze) => setProjeler((prev) => (prev && izi(prev) === izi(taze) ? prev : taze)))
          .catch(() => {});
      }, 15000);
      return () => clearInterval(timer);
    }, [jobId]);

    const liste = projeler ?? [];
    const pasif = liste.filter((p) => p.status === "passive");
    const biten = liste.filter((p) => p.status === "completed");
    const ana = liste.filter((p) => p.status !== "passive" && p.status !== "completed");

    useSortableList(
      gridRef,
      {
        onEnd: () => {
          const el = gridRef.current;
          if (!el) return;
          const ids = Array.from(el.children)
            .map((node) => (node as HTMLElement).dataset.id!)
            .filter(Boolean);
          const oncekiIds = projelerRef.current.map((p) => p.id);
          // Izgarada yalnızca ana bölüm var; pasif ve bitenler listeden düşmesin.
          setProjeler((prev) => {
            const onceki = prev ?? [];
            const byId = new Map(onceki.map((p) => [p.id, p]));
            const sirali = new Set(ids);
            return [...ids.map((pid) => byId.get(pid)!).filter(Boolean), ...onceki.filter((p) => !sirali.has(p.id))];
          });
          api.patch("/projects/reorder", { ids }).catch(() => yukle());
          registerReorderUndo("/projects/reorder", oncekiIds, ids, yukle);
        },
      },
      [ana.length === 0, projeler === null]
    );

    // Sunucudaki kuralın aynısı: proje sahibi ya da alanın (şirketin) sahibi.
    const kart = (p: Project) => (
      <ProjectCard
        project={p}
        canManage={Boolean(currentUser && (currentUser.id === p.ownerId || currentUser.id === alanSahibiId))}
        onStatusChanged={(guncel) => setProjeler((prev) => (prev ?? []).map((x) => (x.id === guncel.id ? guncel : x)))}
      />
    );

    return (
      <div>
        {projeler === null ? (
          <p style={{ color: c.textSecondary, fontSize: 15 }}>{t("Yükleniyor…")}</p>
        ) : liste.length === 0 ? (
          <div
            style={{
              border: `1px dashed ${c.border}`,
              borderRadius: 12,
              padding: 40,
              textAlign: "center",
              color: c.textSecondary,
              fontSize: 16,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 14,
            }}
          >
            {t("Şirkette henüz proje yok.")}
            <button
              type="button"
              onClick={() => setYeniAcik(true)}
              style={{ background: c.primary, color: c.onPrimary, border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 15, cursor: "pointer" }}
            >
              {t("Yeni proje")}
            </button>
          </div>
        ) : (
          <>
            {ana.length === 0 ? (
              <div style={{ color: c.textSecondary, fontSize: 15, padding: "8px 0" }}>{t("Aktif ya da beklemede proje yok.")}</div>
            ) : (
              <div ref={gridRef} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
                {ana.map((p) => (
                  <div key={p.id} data-id={p.id}>
                    {kart(p)}
                  </div>
                ))}
              </div>
            )}
            <ProjeBolumu baslik={t("Pasif projeler")} projeler={pasif} acik={pasifAcik} onToggle={() => setPasifAcik((v) => !v)} kart={kart} />
            <ProjeBolumu baslik={t("Tamamlanan projeler")} projeler={biten} acik={bitenAcik} onToggle={() => setBitenAcik((v) => !v)} kart={kart} />
          </>
        )}

        {yeniAcik && <CreateProjectModal jobId={jobId} onClose={() => setYeniAcik(false)} onCreated={yukle} />}
      </div>
    );
  }
);

export default SirketProjeleriPanel;
