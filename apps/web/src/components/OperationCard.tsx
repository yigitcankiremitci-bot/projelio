import { Link } from "react-router-dom";
import { coverBackground } from "../lib/covers";
import type { Operation } from "@projelio/shared";
import { useThemeColors } from "../theme/useThemeColors";
import CardDescription from "./CardDescription";
import OperationHealthBadge from "./OperationHealthBadge";
import AskLioButton from "./AskLioButton";

interface Props {
  operation: Operation;
}

const periodLabel: Record<string, string> = {
  weekly: "hafta",
  monthly: "ay",
  yearly: "yıl",
};

export default function OperationCard({ operation }: Props) {
  const c = useThemeColors();
  const adherence = operation.adherencePct;
  const missed = operation.missedCount ?? 0;

  return (
    <Link
      to={`/operations/${operation.id}`}
      draggable={false}
      style={{
        display: "block",
        border: `1px solid ${c.border}`,
        borderRadius: 12,
        overflow: "hidden",
        background: c.surface,
      }}
    >
      {operation.coverImageUrl && (
        <div style={{ aspectRatio: "3 / 1", background: coverBackground(operation.coverImageUrl) }} />
      )}
      <div style={{ padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 500, color: c.textPrimary }}>{operation.title}</h3>
          <span style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <OperationHealthBadge status={operation.status} health={operation.health} />
            <AskLioButton subject={{ kind: "rutin", title: operation.title, id: operation.id }} size={24} />
          </span>
        </div>

        {operation.description && (
          <CardDescription text={operation.description} style={{ margin: "0 0 12px" }} />
        )}

        {/* Projedeki ilerleme çubuğunun yerini uyum oranı alır: rutinin sonu
            olmadığı için "yüzde kaçı bitti" sorusunun cevabı yoktur. */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: c.textSecondary, marginBottom: 5 }}>
            <span>Uyum</span>
            <span>{adherence != null ? `%${adherence}` : "henüz veri yok"}</span>
          </div>
          <div style={{ height: 5, borderRadius: 3, background: c.border, overflow: "hidden" }}>
            <div
              style={{
                width: `${Math.min(100, Math.max(0, adherence ?? 0))}%`,
                height: "100%",
                background: (adherence ?? 0) >= 80 ? c.success : (adherence ?? 0) >= 50 ? c.warning : c.danger,
              }}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: 14, fontSize: 13, color: c.textSecondary, marginBottom: 12 }}>
          <span>{operation.activeRoutineCount ?? 0} rutin</span>
          {missed > 0 && <span style={{ color: c.danger }}>{missed} kaçırıldı</span>}
          {operation.nextDueOn && (
            <span>Sıradaki: {new Date(operation.nextDueOn).toLocaleDateString("tr-TR")}</span>
          )}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 15,
            paddingTop: 10,
            borderTop: `1px solid ${c.border}`,
          }}
        >
          <span style={{ color: c.accentDark, fontWeight: 500 }}>
            {operation.budgetPerPeriod.toLocaleString("tr-TR")} ₺/{periodLabel[operation.budgetPeriod] ?? "ay"}
          </span>
          <span style={{ color: c.textSecondary }}>
            {new Date(operation.startedOn).toLocaleDateString("tr-TR")} başladı
          </span>
        </div>
      </div>
    </Link>
  );
}
