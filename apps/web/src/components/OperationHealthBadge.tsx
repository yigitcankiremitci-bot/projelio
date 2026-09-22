import type { OperationHealth, OperationStatus } from "@projelio/shared";
import { useThemeColors } from "../theme/useThemeColors";
import { useT } from "../lib/i18n";

// Rutinde "% tamamlandı" anlamsızdır (bitiş yok, payda sonsuz). Onun yerine
// uyum oranından türeyen bir sağlık durumu gösterilir.
const healthStyle: Record<OperationHealth, { label: string; bg: string; text: string }> = {
  healthy: { label: "Düzenli", bg: "#E1F3E8", text: "#1B6B3C" }, // dil:anahtar
  at_risk: { label: "Aksıyor", bg: "#F6E8D6", text: "#8C5A28" }, // dil:anahtar
  failing: { label: "Bozuldu", bg: "#F9E3E3", text: "#8E2C2C" }, // dil:anahtar
  idle: { label: "Rutin yok", bg: "#ECEEF2", text: "#5B6373" }, // dil:anahtar
};

const statusStyle: Record<OperationStatus, { label: string; bg: string; text: string }> = {
  active: { label: "Çalışıyor", bg: "#E1F3E8", text: "#1B6B3C" }, // dil:anahtar
  paused: { label: "Duraklatıldı", bg: "#F6E8D6", text: "#8C5A28" }, // dil:anahtar
  ended: { label: "Kapatıldı", bg: "#ECEEF2", text: "#5B6373" }, // dil:anahtar
};

interface Props {
  status: OperationStatus;
  health?: OperationHealth;
}

// Rutin duraklatılmış/kapatılmışsa sağlık oranı yanıltıcı olur (tekrar üretilmiyor),
// bu yüzden o durumda doğrudan rutinin durumu gösterilir.
export default function OperationHealthBadge({ status, health }: Props) {
  const t = useT();
  const s = status !== "active" ? statusStyle[status] : healthStyle[health ?? "idle"];
  return (
    <span
      style={{
        fontSize: 13,
        fontWeight: 500,
        padding: "3px 9px",
        borderRadius: 20,
        background: s.bg,
        color: s.text,
        whiteSpace: "nowrap",
      }}
    >
      {t(s.label)}
    </span>
  );
}

// Rutinin son N tekrarını nokta ızgarası olarak gösterir: ilerleme çubuğunun
// rutindeki karşılığı budur — "ne kadarı bitti" değil, "ne kadar düzenli".
export function AdherenceDots({
  results,
  size = 8,
}: {
  results: ("done" | "missed" | "skipped" | "pending")[];
  size?: number;
}) {
  const c = useThemeColors();
  const tone: Record<string, string> = {
    done: c.accentDark,
    missed: c.danger,
    skipped: c.border,
    pending: c.border,
  };
  return (
    <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
      {results.map((r, i) => (
        <span
          key={i}
          title={r}
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            background: r === "pending" ? "transparent" : tone[r],
            border: r === "pending" ? `1px solid ${c.border}` : "none",
            display: "inline-block",
          }}
        />
      ))}
    </div>
  );
}
