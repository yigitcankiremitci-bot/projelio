import { useCallback, useEffect, useState } from "react";
import { useThemeColors } from "../theme/useThemeColors";
import { aiChat } from "../api/aiChat";
import type { AiCredits as AiCreditsData, AiCreditTransaction } from "../api/aiChat";
import { IconSparkle } from "../components/icons";
import AiCreditTopUp from "../components/AiCreditTopUp";

const TYPE_LABELS: Record<AiCreditTransaction["type"], string> = {
  topup: "Kredi yüklemesi",
  usage: "AI kullanımı",
  refund: "İade",
  adjustment: "Düzeltme",
  welcome: "Hoş geldin kredisi",
};

export default function AiCreditsPage() {
  const c = useThemeColors();
  const [credits, setCredits] = useState<AiCreditsData | null>(null);
  const [transactions, setTransactions] = useState<AiCreditTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Sipariş oluşturulunca da çağrılır: ödeme entegrasyonu bağlandığında kredi
  // anında yükleneceği için bakiyenin tazelenmesi gerekir.
  const reload = useCallback(() => {
    Promise.all([aiChat.getCredits(), aiChat.getTransactions(100)])
      .then(([balance, txs]) => {
        setCredits(balance);
        setTransactions(txs);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const isLow = !!credits && credits.balance < (credits.minBalanceToStart || 20);

  return (
    <div style={{ minHeight: "100vh", background: c.background, padding: 28 }}>
      <h1 style={{ fontSize: 22, fontWeight: 500, color: c.textPrimary, margin: "0 0 20px" }}>AI Kredilerim</h1>

      {/* Bakiye kartı */}
      <div
        style={{
          maxWidth: 480,
          background: c.primaryDark,
          borderRadius: 14,
          padding: 22,
          color: "#fff",
          marginBottom: 22,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 9, opacity: 0.8, fontSize: 13 }}>
          <IconSparkle size={16} color={c.accent} />
          Kullanılabilir bakiye
        </div>
        <div style={{ fontSize: 38, fontWeight: 600, margin: "8px 0 2px", letterSpacing: -0.5 }}>
          {loading ? "…" : Math.round(credits?.balance ?? 0).toLocaleString("tr-TR")}
        </div>
        <div style={{ fontSize: 13, opacity: 0.75 }}>Projelio Kredisi</div>

        {credits && (
          <div style={{ display: "flex", gap: 22, marginTop: 18, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.15)" }}>
            <Stat label="Toplam yüklenen" value={credits.lifetimePurchased} />
            <Stat label="Toplam harcanan" value={credits.lifetimeSpent} />
          </div>
        )}
      </div>

      {isLow && (
        <div
          style={{
            maxWidth: 480,
            marginBottom: 22,
            padding: "12px 14px",
            borderRadius: 10,
            background: "rgba(192,129,63,0.10)",
            border: `1px solid ${c.warning}`,
            color: c.accentDark,
            fontSize: 14,
            lineHeight: 1.5,
          }}
        >
          Krediniz azaldı. Asistanı kesintisiz kullanmak için aşağıdan kredi yükleyebilirsiniz.
        </div>
      )}

      <AiCreditTopUp onChanged={reload} />

      <h2 style={{ fontSize: 15, fontWeight: 500, color: c.textSecondary, margin: "0 0 10px", maxWidth: 480 }}>
        Hareketler
      </h2>

      <div
        style={{
          maxWidth: 480,
          background: c.surface,
          border: `1px solid ${c.border}`,
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        {loading ? (
          <p style={{ padding: 16, margin: 0, fontSize: 14, color: c.textSecondary }}>Yükleniyor…</p>
        ) : transactions.length === 0 ? (
          <p style={{ padding: 16, margin: 0, fontSize: 14, color: c.textSecondary }}>Henüz hareket yok.</p>
        ) : (
          transactions.map((tx, i) => {
            const positive = tx.credits > 0;
            return (
              <div
                key={tx.id}
                style={{
                  padding: "13px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  borderTop: i === 0 ? "none" : `1px solid ${c.border}`,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, color: c.textPrimary }}>{TYPE_LABELS[tx.type] ?? tx.type}</div>
                  <div style={{ fontSize: 12, color: c.textSecondary, marginTop: 2 }}>
                    {new Date(tx.createdAt).toLocaleString("tr-TR", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {tx.description ? ` · ${tx.description}` : ""}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: positive ? c.success : c.textPrimary,
                    whiteSpace: "nowrap",
                  }}
                >
                  {positive ? "+" : ""}
                  {Math.round(tx.credits).toLocaleString("tr-TR")}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div style={{ fontSize: 11, opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 600, marginTop: 2 }}>
        {Math.round(value).toLocaleString("tr-TR")}
      </div>
    </div>
  );
}
