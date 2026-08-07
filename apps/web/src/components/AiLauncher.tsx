import { useEffect, useRef, useState } from "react";
import { useIsDesktop } from "../lib/useIsDesktop";
import AiAssistantPanel from "./AiAssistantPanel";

// Lio'nun düğme boyutu. Dar ekranda hem ekranın çok büyük bir kısmını kaplıyor
// hem de alt menüye ve içeriğe fazla yaklaşıyordu; masaüstünde olduğu gibi kalıyor.
const BASE_SIZE_DESKTOP = 132;
const BASE_SIZE_MOBILE = 88;
const HOVER_SCALE = 1.28;
const EYES_CLOSED_DURATION = 300;
const IDLE_BLINK_RANGE: [number, number] = [10000, 12000];
const HOVER_BLINK_RANGE: [number, number] = [4000, 6000];

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
  const isDesktop = useIsDesktop();
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [eyesClosed, setEyesClosed] = useState(false);
  const hoveredRef = useRef(hovered);

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
  const bottom = isDesktop ? 22 : 96;
  const size = isDesktop ? BASE_SIZE_DESKTOP : BASE_SIZE_MOBILE;

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          aria-label="Lio'yu aç"
          title="Lio (⌘K)"
          style={{
            position: "fixed",
            right: 18,
            bottom,
            width: size,
            height: size,
            padding: 0,
            border: "none",
            background: "transparent",
            overflow: "visible",
            zIndex: 45,
            cursor: "pointer",
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
              style={{
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
              style={{
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

      <AiAssistantPanel open={open} onClose={() => setOpen(false)} />
    </>
  );
}
