import { useEffect, useState } from "react";
import type { ThemeColors } from "@projelio/shared";
import { useThemeColors } from "../theme/useThemeColors";
import AiCreditOrdersAdmin from "./AiCreditOrdersAdmin";
import { api } from "../api/client";
import { aiChat, type AiHealth, type AiProviderBalance, type AiUserBalanceRow } from "../api/aiChat";
import { IconSparkle } from "./icons";
import { useIsDesktop } from "../lib/useIsDesktop";

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
  const c = useThemeColors();
  const isDesktop = useIsDesktop();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserRow[]>([]);
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [amount, setAmount] = useState("10000");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [margin, setMargin] = useState<MarginReport | null>(null);
  const [health, setHealth] = useState<AiHealth | null>(null);

  const [providerBalance, setProviderBalance] = useState<AiProviderBalance | null>(null);
  const [topupAmount, setTopupAmount] = useState("50");
  const [topupNote, setTopupNote] = useState("");
  const [topupSaving, setTopupSaving] = useState(false);
  const [topupFeedback, setTopupFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const [checkpointAmount, setCheckpointAmount] = useState("");
  const [checkpointSaving, setCheckpointSaving] = useState(false);
  const [checkpointFeedback, setCheckpointFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const loadProviderBalance = () => {
    aiChat
      .getProviderBalance()
      .then(setProviderBalance)
      .catch(() => {});
  };

  const [userBalances, setUserBalances] = useState<AiUserBalanceRow[] | null>(null);
  const [userBalancesError, setUserBalancesError] = useState<string | null>(null);
  const [userListFilter, setUserListFilter] = useState("");

  const loadUserBalances = () => {
    aiChat
      .getUsersCredits()
      .then((rows) => {
        setUserBalances(rows);
        setUserBalancesError(null);
      })
      .catch((err: any) => setUserBalancesError(err?.message ?? "Kullanıcı listesi yüklenemedi."));
  };

  useEffect(() => {
    aiChat
      .getMarginReport(30)
      .then((r) => setMargin(r as unknown as MarginReport))
      .catch(() => {});
    loadProviderBalance();
    loadUserBalances();
    // Sağlayıcı durumu: hangi AI sağlayıcıları açık. Hata yutulur — bu bölüm
    // bilgilendirme amaçlı, yüklenemezse panelin geri kalanı çalışmaya devam etsin.
    aiChat
      .getHealth()
      .then(setHealth)
      .catch(() => {});
  }, []);

  const filteredUserBalances = (userBalances ?? []).filter((u) => {
    const q = userListFilter.trim().toLowerCase();
    if (!q) return true;
    return (
      u.fullName.toLowerCase().includes(q) ||
      u.username?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q)
    );
  });

  const handleProviderTopUp = async () => {
    const amountUsd = Number(topupAmount);
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      setTopupFeedback({ ok: false, text: "Geçerli bir tutar gir." });
      return;
    }
    setTopupSaving(true);
    setTopupFeedback(null);
    try {
      const result = await aiChat.topUpProviderBalance(amountUsd, topupNote.trim() || undefined);
      setProviderBalance(result);
      setTopupFeedback({
        ok: true,
        text: `$${amountUsd.toFixed(2)} kaydedildi. Kalan bakiye: ${result.remainingCredits.toLocaleString("tr-TR")} kredi karşılığı.`,
      });
      setTopupNote("");
    } catch (err: any) {
      setTopupFeedback({ ok: false, text: err?.message ?? "Kaydedilemedi." });
    } finally {
      setTopupSaving(false);
    }
  };

  const handleSetCheckpoint = async () => {
    const amountUsd = Number(checkpointAmount);
    if (!Number.isFinite(amountUsd) || amountUsd < 0) {
      setCheckpointFeedback({ ok: false, text: "Geçerli bir tutar gir (Console > Cost sayfasındaki toplam)." });
      return;
    }
    setCheckpointSaving(true);
    setCheckpointFeedback(null);
    try {
      const result = await aiChat.setProviderCostCheckpoint(amountUsd);
      setProviderBalance(result);
      setCheckpointFeedback({ ok: true, text: `Referans nokta $${amountUsd.toFixed(2)} olarak kaydedildi.` });
      setCheckpointAmount("");
    } catch (err: any) {
      setCheckpointFeedback({ ok: false, text: err?.message ?? "Kaydedilemedi." });
    } finally {
      setCheckpointSaving(false);
    }
  };

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
      loadUserBalances();
    } catch (err: any) {
      setFeedback({ ok: false, text: err?.message ?? "Kredi yüklenemedi." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section style={{ maxWidth: isDesktop ? 1280 : 560, width: "100%" }}>
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

      {/* Marj raporu + Anthropic bakiyesi: masaüstünde yan yana, mobilde alt alta. */}
      <div
        style={{
          display: isDesktop ? "grid" : "block",
          gridTemplateColumns: isDesktop ? "1fr 1fr" : undefined,
          gap: isDesktop ? 18 : 0,
          alignItems: "start",
        }}
      >
      {margin && (
        <div
          style={{
            background: c.surface,
            border: `1px solid ${c.border}`,
            borderRadius: 12,
            padding: 16,
            marginBottom: isDesktop ? 0 : 18,
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

      {/* Anthropic bakiyesi: gerçekten yüklenen para ile şimdiye kadarki gerçek maliyet
          karşılaştırılıp "elimde ne kadar kaldı" tahmini gösterilir. Anthropic bakiyeyi
          okuyabileceğimiz bir API sunmadığı için admin, console.anthropic.com'a bakiye
          yükledikçe bunu aşağıdaki formla burada da kaydeder. */}
      {providerBalance && (
        <div
          style={{
            background: c.surface,
            border: `1px solid ${c.border}`,
            borderRadius: 12,
            padding: 16,
            marginBottom: isDesktop ? 0 : 18,
          }}
        >
          <div style={{ fontSize: 13, color: c.textSecondary, marginBottom: 10 }}>Anthropic bakiyesi</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 20, marginBottom: 14 }}>
            <Metric label="Yüklenen (ömür boyu)" value={`$${providerBalance.toppedUpUsd.toFixed(2)}`} />
            <Metric label="Kullanılan (gerçek maliyet)" value={`$${providerBalance.spentUsd.toFixed(2)}`} />
            <Metric
              label="Kalan kredi"
              value={providerBalance.remainingCredits.toLocaleString("tr-TR")}
              highlight={providerBalance.remainingCredits < 20000 ? c.danger : c.success}
            />
          </div>
          <p style={{ fontSize: 11.5, color: c.textSecondary, margin: "0 0 6px", lineHeight: 1.5 }}>
            "Kalan kredi", Anthropic'e yüklediğin gerçek bakiyenin ne kadarının kaldığını, aşağıdaki
            kullanıcı kredisi ile aynı birimde gösterir — kullanıcılara ne kadar kredi dağıtabileceğine
            karar vermek için buna bak. Anthropic konsolunda bakiye yükledikçe aşağıdan buraya ekle.
          </p>
          <p style={{ fontSize: 11.5, color: c.textSecondary, margin: "0 0 14px", lineHeight: 1.5 }}>
            {providerBalance.spentUsdSource === "manual_checkpoint" ? (
              <>
                "Kullanılan" rakamı, {providerBalance.lastCheckpoint &&
                  new Date(providerBalance.lastCheckpoint.createdAt).toLocaleDateString("tr-TR")}{" "}
                tarihinde Console'dan girdiğin ${providerBalance.lastCheckpoint?.amountUsd.toFixed(2)} referans
                noktası + o tarihten sonraki kendi tahminimiz. Yeni bir referans noktası girersen bunun
                üzerine yazılır.
              </>
            ) : providerBalance.spentUsdSource === "anthropic_api" ? (
              <>
                "Kullanılan" rakamı doğrudan Anthropic'in Cost Report API'sinden geliyor (gerçek fatura).
                Kendi token bazlı tahminimiz: ${providerBalance.internalEstimateUsd.toFixed(2)}.
              </>
            ) : (
              <>
                "Kullanılan" rakamı şu an kendi token bazlı tahminimiz (${providerBalance.internalEstimateUsd.toFixed(2)}) —
                Anthropic'in gerçek verisine bağlanmak için backend/.env'e <code>ANTHROPIC_ADMIN_API_KEY</code> eklenmeli,
                ya da aşağıdan Console'daki gerçek rakamla elle eşitleyebilirsin.
              </>
            )}
          </p>

          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 14 }}>
            <div style={{ flex: "1 1 160px" }}>
              <label style={labelStyle(c)}>Console'daki gerçek "Total cost" ($)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={checkpointAmount}
                onChange={(e) => setCheckpointAmount(e.target.value)}
                placeholder="Ör. 0.55"
                style={inputStyle(c)}
              />
            </div>
            <button
              onClick={handleSetCheckpoint}
              disabled={checkpointSaving}
              style={{
                padding: "9px 16px",
                borderRadius: 9,
                border: `1px solid ${c.border}`,
                background: "transparent",
                color: c.accent,
                fontSize: 14,
                fontWeight: 600,
                cursor: checkpointSaving ? "default" : "pointer",
                opacity: checkpointSaving ? 0.6 : 1,
                whiteSpace: "nowrap",
              }}
            >
              {checkpointSaving ? "Kaydediliyor…" : "Bu rakamla eşitle"}
            </button>
          </div>
          {checkpointFeedback && (
            <p
              style={{
                margin: "0 0 14px",
                fontSize: 13.5,
                lineHeight: 1.5,
                color: checkpointFeedback.ok ? c.success : c.danger,
              }}
            >
              {checkpointFeedback.text}
            </p>
          )}

          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 120px" }}>
              <label style={labelStyle(c)}>Yüklenen tutar (USD)</label>
              <input
                type="number"
                min={0.01}
                step="0.01"
                value={topupAmount}
                onChange={(e) => setTopupAmount(e.target.value)}
                style={inputStyle(c)}
              />
            </div>
            <div style={{ flex: "2 1 160px" }}>
              <label style={labelStyle(c)}>Not (opsiyonel)</label>
              <input
                value={topupNote}
                onChange={(e) => setTopupNote(e.target.value)}
                placeholder="Ör. Ağustos yüklemesi"
                style={inputStyle(c)}
              />
            </div>
            <button
              onClick={handleProviderTopUp}
              disabled={topupSaving}
              style={{
                padding: "9px 16px",
                borderRadius: 9,
                border: "none",
                background: c.primaryDark,
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                cursor: topupSaving ? "default" : "pointer",
                opacity: topupSaving ? 0.6 : 1,
                whiteSpace: "nowrap",
              }}
            >
              {topupSaving ? "Kaydediliyor…" : "Anthropic'e yükledim"}
            </button>
          </div>
          {topupFeedback && (
            <p
              style={{
                margin: "10px 0 0",
                fontSize: 13.5,
                lineHeight: 1.5,
                color: topupFeedback.ok ? c.success : c.danger,
              }}
            >
              {topupFeedback.text}
            </p>
          )}
        </div>
      )}
      </div>

      <div style={{ height: isDesktop ? 18 : 0 }} />

      {/* AI sağlayıcıları: Lio çok sağlayıcılıdır (Anthropic, MiniMax, z.ai).
          Hangilerinin açık olduğu ve öncelik sırası SUNUCU ayarıdır (AI_PROVIDERS);
          burada yalnızca gösterilir. Arayüzden açıp kapatmak bilinçli olarak yok:
          hangi sağlayıcıya müşteri verisi gittiği tek tıkla değişmemeli. */}
      {health && (
        <div
          style={{
            background: c.surface,
            border: `1px solid ${c.border}`,
            borderRadius: 12,
            padding: 16,
            marginBottom: 18,
          }}
        >
          <div style={{ fontSize: 13, color: c.textSecondary, marginBottom: 10 }}>AI sağlayıcıları</div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 20, marginBottom: 14 }}>
            <Metric label="Kullanılan model" value={health.model} />
            <Metric
              label="Birincil sağlayıcı"
              value={health.providers.find((p) => p.id === health.provider)?.label ?? "—"}
            />
            <Metric
              label="Erişim"
              value={health.reachable ? "Çalışıyor" : "Ulaşılamıyor"}
              highlight={health.reachable ? c.success : c.danger}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {health.providers.map((p) => {
              // Üç durum var ve ayrımı önemli: etkin (kullanılıyor), anahtarı var
              // ama listede yok (kapalı), anahtarı bile yok (kurulmamış).
              const durum = p.active
                ? { metin: "Etkin", renk: c.success }
                : p.configured
                  ? { metin: "Kapalı", renk: c.textSecondary }
                  : { metin: "Anahtar yok", renk: c.textSecondary };
              return (
                <div
                  key={p.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flexWrap: "wrap",
                    padding: "8px 10px",
                    borderRadius: 8,
                    background: p.active ? `${c.success}14` : "transparent",
                    border: `1px solid ${p.active ? `${c.success}55` : c.border}`,
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: 14, color: c.textPrimary }}>{p.label}</span>
                  <span style={{ fontSize: 12, color: durum.renk, fontWeight: 600 }}>{durum.metin}</span>
                  <span style={{ fontSize: 12, color: c.textSecondary }}>
                    {p.models.length} model
                    {p.active && p.models.some((m) => m.vision) ? " · görsel okuyabilir" : ""}
                  </span>
                </div>
              );
            })}
          </div>

          <div style={{ fontSize: 12, color: c.textSecondary, marginTop: 12, lineHeight: 1.5 }}>
            Sıra öncelik demektir: birincil sağlayıcı geçici olarak yanıt vermezse (hız
            sınırı, sunucu hatası, bağlantı) istek sıradakine devredilir ve kredi
            gerçekten kullanılan modelin fiyatından kesilir. Sağlayıcı açıp kapatmak ya da
            sırayı değiştirmek için sunucudaki <code>AI_PROVIDERS</code> değişkenini düzenle.
          </div>
        </div>
      )}

      {/* Self-servis kredi siparişleri: ödemesi alınanları onaylayıp krediyi yükler.
          Onay sonrası kullanıcı bakiyeleri listesi de tazelenmeli. */}
      <AiCreditOrdersAdmin onCredited={loadUserBalances} />

      {/* Kullanıcılar (geniş) + kredi yükleme formu (yan panel): masaüstünde yan yana. */}
      <div
        style={{
          display: isDesktop ? "grid" : "block",
          gridTemplateColumns: isDesktop ? "1.7fr 1fr" : undefined,
          gap: isDesktop ? 18 : 0,
          alignItems: "start",
        }}
      >

      {/* Kullanıcılar ve kredi bakiyeleri */}
      <div
        style={{
          background: c.surface,
          border: `1px solid ${c.border}`,
          borderRadius: 12,
          padding: 16,
          marginBottom: isDesktop ? 0 : 18,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 10 }}>
          <div style={{ fontSize: 13, color: c.textSecondary }}>
            Kullanıcılar {userBalances ? `(${userBalances.length})` : ""}
          </div>
          <input
            value={userListFilter}
            onChange={(e) => setUserListFilter(e.target.value)}
            placeholder="Ada, kullanıcı adına veya e-postaya göre filtrele…"
            style={{ ...inputStyle(c), width: "auto", flex: 1, maxWidth: 280, padding: "6px 10px", fontSize: 13 }}
          />
        </div>

        {userBalancesError && <p style={{ fontSize: 13, color: c.danger, margin: 0 }}>{userBalancesError}</p>}

        {!userBalancesError && !userBalances && (
          <p style={{ fontSize: 13, color: c.textSecondary, margin: 0 }}>Yükleniyor…</p>
        )}

        {!userBalancesError && userBalances && (
          <div
            style={{
              maxHeight: isDesktop ? 480 : 340,
              overflowY: "auto",
              borderRadius: 9,
              border: `1px solid ${c.border}`,
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
              <thead>
                <tr style={{ background: c.background, position: "sticky", top: 0 }}>
                  <th style={thStyle(c)}>Kullanıcı</th>
                  <th style={thStyle(c, "right")}>Bakiye</th>
                  <th style={thStyle(c, "right")}>Ömür boyu yüklenen</th>
                  <th style={thStyle(c, "right")}>Ömür boyu harcanan</th>
                  <th style={thStyle(c, "right")}></th>
                </tr>
              </thead>
              <tbody>
                {filteredUserBalances.map((u) => (
                  <tr key={u.userId} style={{ borderTop: `1px solid ${c.border}` }}>
                    <td style={tdStyle(c)}>
                      <div style={{ color: c.textPrimary }}>{u.fullName}</div>
                      <div style={{ fontSize: 11.5, color: c.textSecondary }}>
                        {u.username ? `@${u.username}` : u.email}
                      </div>
                    </td>
                    <td style={{ ...tdStyle(c), textAlign: "right", fontWeight: 600, color: u.balance <= 0 ? c.danger : c.textPrimary }}>
                      {Math.round(u.balance).toLocaleString("tr-TR")}
                    </td>
                    <td style={{ ...tdStyle(c), textAlign: "right", color: c.textSecondary }}>
                      {Math.round(u.lifetimePurchased).toLocaleString("tr-TR")}
                    </td>
                    <td style={{ ...tdStyle(c), textAlign: "right", color: c.textSecondary }}>
                      {Math.round(u.lifetimeSpent).toLocaleString("tr-TR")}
                    </td>
                    <td style={{ ...tdStyle(c), textAlign: "right" }}>
                      <button
                        onClick={() => {
                          setSelected({ id: u.userId, fullName: u.fullName, username: u.username, email: u.email });
                          setQuery("");
                          setResults([]);
                          setFeedback(null);
                        }}
                        style={{
                          background: "transparent",
                          border: `1px solid ${c.border}`,
                          borderRadius: 7,
                          padding: "4px 9px",
                          fontSize: 12,
                          color: c.accent,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Kredi yükle
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredUserBalances.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ ...tdStyle(c), textAlign: "center", color: c.textSecondary }}>
                      Sonuç yok.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
      </div>
    </section>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: string }) {
  const c = useThemeColors();
  return (
    <div>
      <div style={{ fontSize: 11.5, color: c.textSecondary }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: highlight ?? c.textPrimary, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function labelStyle(c: ThemeColors): React.CSSProperties {
  return { display: "block", fontSize: 13, color: c.textSecondary, marginBottom: 5 };
}

function thStyle(c: ThemeColors, align: "left" | "right" = "left"): React.CSSProperties {
  return {
    textAlign: align,
    padding: "8px 12px",
    fontSize: 11.5,
    fontWeight: 600,
    color: c.textSecondary,
    whiteSpace: "nowrap",
  };
}

function tdStyle(c: ThemeColors): React.CSSProperties {
  return { padding: "8px 12px", color: c.textPrimary, verticalAlign: "middle" };
}

function inputStyle(c: ThemeColors): React.CSSProperties {
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
