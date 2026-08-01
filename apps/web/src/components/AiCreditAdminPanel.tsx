import { useEffect, useState } from "react";
import { colors } from "../theme/colors";
import { api } from "../api/client";
import { aiChat } from "../api/aiChat";
import { IconSparkle } from "./icons";

interface UserRow {
  id: string;
  fullName: string;
  username?: string;
  email?: string;
}

interface MarginReport {
  days: number;
  requestCount: number;
  creditsSpent: number;
  anthropicCostUsd: number;
  userChargedUsd: number;
  grossProfitUsd: number;
  avgCostPerRequestUsd: number;
  avgCreditsPerRequest: number;
  commissionRate: number;
}

/**
 * Yönetici görünümü: kullanıcılara kredi yükleme ve Projelio'nun AI marj raporu.
 * Ödeme sağlayıcısı entegre edilene kadar bakiye yüklemenin tek yolu burasıdır.
 */
export default function AiCreditAdminPanel() {
  const c = colors.light;

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserRow[]>([]);
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [amount, setAmount] = useState("10000");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [margin, setMargin] = useState<MarginReport | null>(null);

  useEffect(() => {
    aiChat
      .getMarginReport(30)
      .then((r) => setMargin(r as unknown as MarginReport))
      .catch(() => {});
  }, []);

  // Arama kutusu için basit gecikmeli sorgu.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      api
        .get<UserRow[]>(`/users/search?q=${encodeURIComponent(q)}`)
        .then(setResults)
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const handleTopUp = async () => {
    if (!selected) return;
    const credits = Number(amount);
    if (!Number.isFinite(credits) || credits <= 0) {
      setFeedback({ ok: false, text: "Geçerli bir kredi miktarı gir." });
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      const result = await aiChat.topUp(selected.id, credits, note.trim() || undefined);
      setFeedback({
        ok: true,
        text: `${selected.fullName} hesabına ${credits.toLocaleString("tr-TR")} kredi yüklendi. Yeni bakiye: ${Math.round(
          result.balance
        ).toLocaleString("tr-TR")}.`,
      });
      setNote("");
    } catch (err: any) {
      setFeedback({ ok: false, text: err?.message ?? "Kredi yüklenemedi." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section style={{ maxWidth: 560 }}>
      <h2
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: c.textPrimary,
          margin: "0 0 12px",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <IconSparkle size={18} color={c.accent} />
        AI kredi yönetimi
      </h2>

      {/* Marj raporu */}
      {margin && (
        <div
          style={{
            background: c.surface,
            border: `1px solid ${c.border}`,
            borderRadius: 12,
            padding: 16,
            marginBottom: 18,
          }}
        >
          <div style={{ fontSize: 13, color: c.textSecondary, marginBottom: 10 }}>
            Son {margin.days} gün · {margin.requestCount} istek · %
            {Math.round((margin.commissionRate ?? 0.2) * 100)} komisyon
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
            <Metric label="Anthropic maliyeti" value={`$${margin.anthropicCostUsd?.toFixed(2) ?? "0.00"}`} />
            <Metric label="Kullanıcıya yansıyan" value={`$${margin.userChargedUsd?.toFixed(2) ?? "0.00"}`} />
            <Metric
              label="Brüt kâr"
              value={`$${margin.grossProfitUsd?.toFixed(2) ?? "0.00"}`}
              highlight={c.success}
            />
            <Metric label="Harcanan kredi" value={Math.round(margin.creditsSpent ?? 0).toLocaleString("tr-TR")} />
          </div>

          <div
            style={{
              marginTop: 14,
              paddingTop: 12,
              borderTop: `1px solid ${c.border}`,
              display: "flex",
              flexWrap: "wrap",
              gap: 20,
            }}
          >
            <Metric
              label="İstek başı maliyet"
              value={`$${(margin.avgCostPerRequestUsd ?? 0).toFixed(4)}`}
            />
            <Metric
              label="İstek başı kredi"
              value={Math.round(margin.avgCreditsPerRequest ?? 0).toLocaleString("tr-TR")}
            />
          </div>
          <p style={{ fontSize: 11.5, color: c.textSecondary, margin: "10px 0 0", lineHeight: 1.5 }}>
            Bu tutarlar, Anthropic'in her yanıtta bildirdiği gerçek token sayılarından hesaplanır.
            Doğrulamak için console.anthropic.com'daki kullanım ekranıyla karşılaştırın; ciddi bir
            fark varsa fiyat tablosu güncellenmelidir.
          </p>
        </div>
      )}

      {/* Kredi yükleme */}
      <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, padding: 16 }}>
        <label style={labelStyle(c)}>Kullanıcı</label>
        {selected ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "9px 12px",
              borderRadius: 9,
              background: c.background,
              border: `1px solid ${c.border}`,
              marginBottom: 12,
            }}
          >
            <span style={{ flex: 1, fontSize: 15, color: c.textPrimary }}>
              {selected.fullName}
              {selected.username ? ` (@${selected.username})` : ""}
            </span>
            <button
              onClick={() => {
                setSelected(null);
                setQuery("");
              }}
              style={{ background: "transparent", border: "none", color: c.textSecondary, fontSize: 13, cursor: "pointer" }}
            >
              Değiştir
            </button>
          </div>
        ) : (
          <>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="İsim veya kullanıcı adı ara…"
              style={{ ...inputStyle(c), marginBottom: results.length ? 0 : 12 }}
            />
            {results.length > 0 && (
              <div
                style={{
                  border: `1px solid ${c.border}`,
                  borderTop: "none",
                  borderRadius: "0 0 9px 9px",
                  marginBottom: 12,
                  maxHeight: 180,
                  overflowY: "auto",
                }}
              >
                {results.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => {
                      setSelected(u);
                      setResults([]);
                    }}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "9px 12px",
                      border: "none",
                      background: "transparent",
                      fontSize: 14,
                      color: c.textPrimary,
                      cursor: "pointer",
                    }}
                  >
                    {u.fullName}
                    {u.username ? ` (@${u.username})` : ""}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        <label style={labelStyle(c)}>Kredi miktarı</label>
        <input
          type="number"
          min={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          style={{ ...inputStyle(c), marginBottom: 4 }}
        />
        <p style={{ fontSize: 12, color: c.textSecondary, margin: "0 0 12px" }}>
          10.000 kredi ≈ 1 USD satış bedeli (%20 komisyon dahil) ≈ 70 asistan işlemi.
        </p>

        <label style={labelStyle(c)}>Açıklama (opsiyonel)</label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ör. Ocak ayı paketi"
          style={{ ...inputStyle(c), marginBottom: 14 }}
        />

        <button
          onClick={handleTopUp}
          disabled={!selected || saving}
          style={{
            width: "100%",
            padding: "11px 0",
            borderRadius: 9,
            border: "none",
            background: c.accent,
            color: "#fff",
            fontSize: 15,
            fontWeight: 600,
            cursor: !selected || saving ? "default" : "pointer",
            opacity: !selected || saving ? 0.55 : 1,
          }}
        >
          {saving ? "Yükleniyor…" : "Kredi yükle"}
        </button>

        {feedback && (
          <p
            style={{
              margin: "12px 0 0",
              fontSize: 13.5,
              lineHeight: 1.5,
              color: feedback.ok ? c.success : c.danger,
            }}
          >
            {feedback.text}
          </p>
        )}
      </div>
    </section>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: string }) {
  const c = colors.light;
  return (
    <div>
      <div style={{ fontSize: 11.5, color: c.textSecondary }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: highlight ?? c.textPrimary, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function labelStyle(c: typeof colors.light): React.CSSProperties {
  return { display: "block", fontSize: 13, color: c.textSecondary, marginBottom: 5 };
}

function inputStyle(c: typeof colors.light): React.CSSProperties {
  return {
    width: "100%",
    padding: "9px 12px",
    borderRadius: 9,
    border: `1px solid ${c.border}`,
    fontSize: 15,
    color: c.textPrimary,
    background: c.background,
    fontFamily: "inherit",
  };
}
