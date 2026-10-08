import type { GoogleTakvimEtkinligi } from "@projelio/shared";
import Modal from "../Modal";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";
import { longDayLabel } from "../../lib/planGrid";
import type { GunEtkinlikleri } from "../../lib/googleTakvimGorunum";

/**
 * Bir günün TÜM etkinlikleri — ızgaradaki "+n etkinlik" yazısının açtığı liste.
 *
 * Eskiden o yazı düz metindi: gün hücresine sığmayan etkinlikler hiçbir yoldan
 * açılamıyordu (ay görünümünde güne tıklamak günlük görünüme götürüyor ama
 * tüm gün etkinliklerin şeridi orada da üç satırla sınırlı). Listeden bir
 * etkinliğe tıklamak, ızgaradaki kutusuna tıklamakla aynı yere gider.
 */
export default function GunEtkinlikleriPenceresi({
  gun,
  etkinlikler,
  onOpenEtkinlik,
  onClose,
}: {
  gun: string;
  etkinlikler: GunEtkinlikleri | undefined;
  onOpenEtkinlik?: (e: GoogleTakvimEtkinligi) => void;
  onClose: () => void;
}) {
  const c = useThemeColors();
  const t = useT();
  // Tüm gün olanlar önce, saatliler saat sırasıyla.
  const satirlar = [
    ...(etkinlikler?.tumGun ?? []).map((e) => ({ id: e.id, etkinlik: e, saat: t("Tüm gün") })),
    ...[...(etkinlikler?.saatli ?? [])]
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .map((p) => ({ id: p.id, etkinlik: p.etkinlik, saat: `${p.startsAt}–${p.endsAt}` })),
  ];

  // Modal portal ile çiziliyor ama React olayları portaldan da ağaçtaki
  // atalara kabarcıklanır: ızgaranın kaydırma işleyicileri (useSwipeNavigate)
  // pencerede yapılan sürüklemeyi dönem değiştirme sanar, gün hücresinin
  // tıklaması da günlük görünüme atlardı. Sarmalayıcı bunları burada keser.
  const durdur = (e: { stopPropagation: () => void }) => e.stopPropagation();
  return (
    <div
      style={{ display: "contents" }}
      onClick={durdur}
      onDoubleClick={durdur}
      onPointerDown={durdur}
      onMouseDown={durdur}
      onTouchStart={durdur}
      onWheel={durdur}
    >
    <Modal title={longDayLabel(gun)} onClose={onClose} maxWidth={420}>
      {satirlar.length === 0 ? (
        <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>{t("Bu günde etkinlik yok.")}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {satirlar.map(({ id, etkinlik: e, saat }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                onClose();
                onOpenEtkinlik?.(e);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                textAlign: "left",
                padding: "8px 10px",
                borderRadius: 8,
                border: `1px solid ${c.border}`,
                borderLeft: `3px solid ${e.takvimRengi ?? c.accent}`,
                background: c.surface,
                color: c.textPrimary,
                cursor: onOpenEtkinlik ? "pointer" : "default",
                opacity: e.isleme === "yoksay" ? 0.6 : 1,
              }}
            >
              <span style={{ fontSize: 12, color: c.textSecondary, flexShrink: 0, minWidth: 74, fontVariantNumeric: "tabular-nums" }}>
                {saat}
              </span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: "block", fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {e.baslik}
                </span>
                {e.takvimAdi && (
                  <span style={{ display: "block", fontSize: 12, color: c.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {e.takvimAdi}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </Modal>
    </div>
  );
}
