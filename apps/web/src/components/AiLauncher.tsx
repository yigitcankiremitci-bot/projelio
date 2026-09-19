import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useLocation } from "react-router-dom";
import { LIO_LAUNCHER, Z, lioBottomCss, lioKucukMu, lioLauncherSize } from "../lib/layout";
import { setLioCompact, setLioLift, useLioLift, useLioModalAcik } from "../lib/lioBalon";
import { useIsDesktop } from "../lib/useIsDesktop";
import { onAskLio } from "../lib/askLio";
import { setLioPanelOpen } from "../lib/lioPanel";
import type { AskLioRequest } from "../lib/askLio";
import { tourAnchor } from "../lib/tour/types";
import { useT } from "../lib/i18n";
import AiAssistantPanel from "./AiAssistantPanel";

// Lio'nun düğme boyutu ve ekrandaki yeri artık layout.ts'te (bkz. LIO_LAUNCHER):
// bildirim şeridi balonun ÜSTÜNE konumlanmak için aynı ölçüleri okuyor.
const HOVER_SCALE = 1.28;
const EYES_CLOSED_DURATION = 300;
const IDLE_BLINK_RANGE: [number, number] = [10000, 12000];
const HOVER_BLINK_RANGE: [number, number] = [4000, 6000];
/**
 * Bu kadar pikselden az kayan basış sürükleme değil tıklamadır. Eşik olmasa
 * elin titremesi bile tıklamayı yutup paneli açılmaz hale getirirdi.
 */
const DRAG_THRESHOLD = 5;
/** Balon yukarı taşınırken üst bantta (çan, yardım düğmesi) bırakılacak pay. */
const TOP_CLEARANCE = 96;

/**
 * Lio'nun (Projelio AI asistanı) uygulama genelindeki giriş noktası: sağ altta
 * duran maskot düğmesi + sağdan açılan sohbet paneli.
 *
 * Taban görsel her zaman gözleri kapalı Lio'dur; gözlerin bulunduğu görsel
 * varsayılan olarak üstte açık durur, ara sıra kısa süreliğine kaybolup
 * (göz kırpma) geri gelir.
 *
 * Klavye kısayolu: Cmd/Ctrl + K
 */
export default function AiLauncher() {
  const t = useT();
  const isDesktop = useIsDesktop();
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [eyesClosed, setEyesClosed] = useState(false);
  // Başka bir sayfadan (ör. Takvim'deki "Lio ile planla", kartlardaki Lio
  // simgesi) gelen açılış isteği. Panel bunu işledikten sonra sıfırlar, aksi
  // halde panel her açıldığında aynı mesaj tekrar gelirdi.
  const [pendingRequest, setPendingRequest] = useState<AskLioRequest | null>(null);
  const hoveredRef = useRef(hovered);
  const location = useLocation();
  const modalAcik = useLioModalAcik();
  // Çalışma alanlarında ve bir pencere açıkken küçük (bkz. lioKucukMu, lib/lioBalon).
  const compact = modalAcik || lioKucukMu(location.pathname);
  const lift = useLioLift();
  /**
   * Sürükleme durumu. Ref'te: her pointermove'da render tetiklemesin, yalnızca
   * yükseklik (depo) değişsin. `moved` bırakıştan sonraki click'i yutmak için —
   * yoksa balonu taşıyan her kullanıcı paneli de açardı.
   */
  const drag = useRef<{
    startY: number;
    startLift: number;
    /** Son uygulanan yükseklik: bırakış bu değeri kaydeder (bkz. endDrag). */
    lastLift: number;
    moved: boolean;
    pointerId: number;
  } | null>(null);
  const suppressClick = useRef(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    setLioCompact(compact);
  }, [compact]);
  useEffect(() => () => setLioCompact(false), []);

  useEffect(() => {
    hoveredRef.current = hovered;
  }, [hovered]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Panelin açık olduğunu uygulamanın geri kalanına duyur: Lio'nun iş bildirimi
  // şeridi yerini buna göre seçiyor (bkz. lib/lioPanel.ts, AiLiveActivity).
  useEffect(() => {
    setLioPanelOpen(open);
    return () => setLioPanelOpen(false);
  }, [open]);

  useEffect(
    () =>
      onAskLio((request) => {
        setPendingRequest(request);
        setOpen(true);
      }),
    []
  );

  // Lio arada bir göz kırpar: normalde 10-12sn'de bir, üzerine gelinince
  // ilgisi artmış gibi 4-6sn'de bir — her seferinde 0.3sn'liğine gözler kapanır.
  useEffect(() => {
    let reopenTimeout: ReturnType<typeof setTimeout>;
    let scheduleTimeout: ReturnType<typeof setTimeout>;

    const scheduleNext = () => {
      const [min, max] = hoveredRef.current ? HOVER_BLINK_RANGE : IDLE_BLINK_RANGE;
      const delay = min + Math.random() * (max - min);
      scheduleTimeout = setTimeout(() => {
        setEyesClosed(true);
        reopenTimeout = setTimeout(() => {
          setEyesClosed(false);
          scheduleNext();
        }, EYES_CLOSED_DURATION);
      }, delay);
    };

    scheduleNext();
    return () => {
      clearTimeout(scheduleTimeout);
      clearTimeout(reopenTimeout);
    };
  }, []);

  // Mobilde alt menünün üstünde kalsın; masaüstünde ekranın sağ altına otursun.
  // Sayı değil CSS: çentikli telefonlarda menü güvenli alan kadar büyüyor ve
  // düz 96 px'te duran balon menünün üstüne biniyordu (bkz. lioBottomCss).
  const size = lioLauncherSize(isDesktop, compact);
  // Pencere küçülünce balon ekranın dışında kalmasın: taşıma payı her çizimde
  // o anki yüksekliğe göre kırpılır (kayıtlı değer değişmez).
  const maxLift = () => Math.max(0, window.innerHeight - size - TOP_CLEARANCE - LIO_LAUNCHER.bottomMobile);
  const effectiveLift = Math.min(lift, maxLift());
  const bottom = lioBottomCss(isDesktop, effectiveLift);

  // Tut-taşı: yalnızca dikey. Balonun altında kalan kartın düğmesine ulaşmak
  // için onu biraz yukarı itmek yetiyor; serbest konum ise "Lio nerede?"
  // sorusunu doğururdu. Konum cihazda hatırlanır.
  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    drag.current = {
      startY: e.clientY,
      startLift: effectiveLift,
      lastLift: effectiveLift,
      moved: false,
      pointerId: e.pointerId,
    };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dy = e.clientY - d.startY;
    if (!d.moved) {
      if (Math.abs(dy) < DRAG_THRESHOLD) return;
      d.moved = true;
      // Parmak/imleç balondan çıksa da olaylar gelmeye devam etsin.
      e.currentTarget.setPointerCapture(e.pointerId);
      setHovered(false);
      setDragging(true);
    }
    d.lastLift = Math.min(maxLift(), Math.max(0, d.startLift - dy));
    setLioLift(d.lastLift);
  };
  const endDrag = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    if (!d.moved) return;
    setDragging(false);
    suppressClick.current = true;
    // Bırakışın koordinatına BAKILMAZ, son harekette uygulanan değer kaydedilir.
    // AYIKLANAN HATA: yükseklik bırakış olayındaki clientY'den yeniden
    // hesaplanıyordu. Tarayıcı sürüklemeyi iptal ettiğinde (pointercancel)
    // clientY 0 geliyor; balon ekranın tepesine fırlayıp orada kaydediliyor,
    // bir daha aşağı indirilemiyordu.
    setLioLift(d.lastLift, true);
  };

  return (
    <>
      {!open && (
        <button
          {...tourAnchor("lio-launcher")}
          onClick={() => {
            if (suppressClick.current) {
              suppressClick.current = false;
              return;
            }
            setOpen(true);
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          // Görseller tarayıcının kendi "resmi sürükle" davranışına kapalı:
          // açıkken sürükleme bizim yerimize tarayıcının resim sürüklemesine
          // dönüşüyor, hayalet görsel yalnızca üstteki göz katmanı oluyor ve
          // masaüstüne bırakılınca göz görseli iniyordu. O sürükleme başlayınca
          // tarayıcı bizimkini de iptal ediyordu (bkz. endDrag).
          onDragStart={(e) => e.preventDefault()}
          onMouseEnter={() => {
            if (!drag.current?.moved) setHovered(true);
          }}
          onMouseLeave={() => setHovered(false)}
          aria-label={t("Lio'yu aç")}
          title={t("Lio (⌘K) · yukarı-aşağı sürükleyerek taşıyabilirsin")}
          style={{
            position: "fixed",
            right: LIO_LAUNCHER.right,
            bottom,
            width: size,
            height: size,
            padding: 0,
            border: "none",
            background: "transparent",
            overflow: "visible",
            zIndex: Z.aiLauncher,
            cursor: dragging ? "grabbing" : "pointer",
            // Dokunmatikte basılı tutup kaydırmak sayfayı değil balonu taşısın.
            touchAction: "none",
            userSelect: "none",
            WebkitUserSelect: "none",
            // Boy değişimi (çalışma alanına girip çıkarken) ve bırakış yumuşak;
            // sürüklerken geçiş kapalı, yoksa balon parmağın gerisinde kalır.
            transition: dragging ? "none" : "width 0.25s ease, height 0.25s ease, bottom 0.2s ease",
          }}
        >
          <div
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              transform: `scale(${hovered ? HOVER_SCALE : 1})`,
              transformOrigin: "bottom right",
              transition: "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
              filter: "drop-shadow(0 4px 10px rgba(26,31,41,0.28))",
            }}
          >
            <img
              src="/lio-base.png"
              alt="Lio"
              draggable={false}
              style={{
                pointerEvents: "none",
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                display: "block",
                objectFit: "contain",
              }}
            />
            <img
              src="/lio-eyes.png"
              alt=""
              aria-hidden="true"
              draggable={false}
              style={{
                pointerEvents: "none",
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                display: "block",
                objectFit: "contain",
                opacity: eyesClosed ? 0 : 1,
                transition: "opacity 0.15s ease-in-out",
              }}
            />
          </div>
        </button>
      )}

      <AiAssistantPanel
        open={open}
        onClose={() => setOpen(false)}
        initialMessage={pendingRequest?.message ?? null}
        initialAutoSend={pendingRequest?.autoSend ?? true}
        onInitialMessageSent={() => setPendingRequest(null)}
      />
    </>
  );
}
