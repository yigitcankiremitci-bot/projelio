import { useEffect, useRef, useState } from "react";
import { Z } from "../lib/layout";
import { useLocation, useNavigate } from "react-router-dom";
import type { LioActivityPayload } from "@projelio/shared";
import { onLioActivity } from "../lib/liveRoom";
import { useThemeColors } from "../theme/useThemeColors";
import { IconSparkle } from "./icons";

/** Bildirim şeridinin ekranda kalma süresi. */
const VISIBLE_MS = 4000;

/**
 * Lio çalışırken yaptığı işi kullanıcının ekranına taşır.
 *
 * NEDEN: Lio "görevleri oluşturdum" dediğinde kullanıcının bunu doğrulamak için
 * sohbeti kapatıp doğru sayfayı kendisi bulması gerekiyordu. Artık sayfa kendi
 * gidiyor ve kayıt orada belirir; "yaptım" cümlesine güvenmek yerine sonuç
 * görülüyor.
 *
 * Sayfa değişimi YALNIZCA hedef farklıysa yapılır: bir Excel'den 30 görev
 * eklenirken her kalemde aynı sayfaya yeniden gitmek, kullanıcının kaydırdığı
 * yeri sürekli başa atardı. Aynı sayfadaysak zaten oda sinyali (room-changed)
 * listeyi tazeliyor.
 *
 * Panelin altında değil uygulama kökünde duruyor: gezinme kararını sohbet
 * penceresi değil uygulama vermeli, panel kapansa bile son işlem görünsün.
 */
export default function AiLiveActivity() {
  const c = useThemeColors();
  const navigate = useNavigate();
  const location = useLocation();
  const [activity, setActivity] = useState<LioActivityPayload | null>(null);

  // Gezinme kararı için son konum; efekt bağımlılığına koymak aboneliği her
  // sayfa değişiminde yeniden kurardı.
  const pathRef = useRef(location.pathname);
  useEffect(() => {
    pathRef.current = location.pathname;
  }, [location.pathname]);

  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const stop = onLioActivity((payload) => {
      setActivity(payload);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setActivity(null), VISIBLE_MS);

      if (payload.path && payload.path !== pathRef.current) {
        pathRef.current = payload.path;
        navigate(payload.path);
      }
    });
    return () => {
      stop();
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [navigate]);

  if (!activity) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        top: 72,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: Z.aiActivity,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 14px",
        borderRadius: 999,
        background: c.surface,
        border: `1px solid ${c.accent}`,
        boxShadow: "0 6px 20px rgba(26,31,41,0.18)",
        fontSize: 13,
        color: c.textPrimary,
        maxWidth: "min(90vw, 460px)",
        animation: "projelioAiFade .18s ease",
      }}
    >
      <IconSparkle size={15} color={c.accent} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {activity.label}
      </span>
    </div>
  );
}
