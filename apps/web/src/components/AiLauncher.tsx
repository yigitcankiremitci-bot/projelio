import { useEffect, useState } from "react";
import { colors } from "../theme/colors";
import { IconSparkle } from "./icons";
import { useIsDesktop } from "../lib/useIsDesktop";
import AiAssistantPanel from "./AiAssistantPanel";

/**
 * Projelio AI'ın uygulama genelindeki giriş noktası: her ekranda duran tetikleyici
 * düğme + sağdan açılan asistan paneli.
 *
 * Klavye kısayolu: Cmd/Ctrl + K
 */
export default function AiLauncher() {
  const c = colors.light;
  const isDesktop = useIsDesktop();
  const [open, setOpen] = useState(false);

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

  // Mobilde alt menünün üstünde kalsın; masaüstünde ekranın sağ altına otursun.
  const bottom = isDesktop ? 22 : 96;

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Projelio AI'ı aç"
          title="Projelio AI (⌘K)"
          style={{
            position: "fixed",
            right: 18,
            bottom,
            height: 48,
            paddingLeft: 14,
            paddingRight: isDesktop ? 18 : 14,
            borderRadius: 999,
            border: "none",
            background: c.primaryDark,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            gap: 9,
            boxShadow: "0 6px 20px rgba(26,31,41,0.30)",
            zIndex: 45,
            cursor: "pointer",
          }}
        >
          <IconSparkle size={20} color={c.accent} />
          {isDesktop && <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: 0.2 }}>Projelio AI</span>}
        </button>
      )}

      <AiAssistantPanel open={open} onClose={() => setOpen(false)} />
    </>
  );
}
