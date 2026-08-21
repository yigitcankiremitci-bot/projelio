import { useEffect, useState } from "react";
import type { SupportRequest } from "@projelio/shared";
import { support } from "../api/support";
import { useThemeColors } from "../theme/useThemeColors";

/**
 * Admin > Destek panosu.
 *
 * Sunucu bekleyenleri başa koyuyor (bkz. support.service findAll): pano bir
 * yapılacaklar listesi, yanıtlanmışlar altında arşiv gibi duruyor.
 *
 * Yanıt kutusu her talebin altında satır içi açılır — ayrı bir modal, arka
 * arkaya birkaç talebi yanıtlarken her seferinde aç/kapa gerektiriyordu.
 */
export default function SupportAdminPanel() {
  const c = useThemeColors();
  const [requests, setRequests] = useState<SupportRequest[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = () => {
    support
      .all()
      .then(setRequests)
      .catch(() => setRequests([]));
  };

  useEffect(load, []);

  const sendReply = async (id: string) => {
    const text = draft.trim();
    if (!text) return;
    setError("");
    setSendingId(id);
    try {
      await support.reply(id, text);
      setOpenId(null);
      setDraft("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Yanıt gönderilemedi.");
    } finally {
      setSendingId(null);
    }
  };

  const waiting = (requests ?? []).filter((r) => r.status === "open").length;

  return (
    <section style={{ maxWidth: 760, width: "100%" }}>
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
        Destek panosu
        {waiting > 0 && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 500,
              padding: "2px 9px",
              borderRadius: 999,
              background: c.accent,
              color: "#fff",
            }}
          >
            {waiting} bekliyor
          </span>
        )}
      </h2>

      {error && <p style={{ color: c.danger, fontSize: 14, margin: "0 0 10px" }}>{error}</p>}

      {requests === null && <p style={{ fontSize: 14, color: c.textSecondary }}>Yükleniyor…</p>}

      {requests?.length === 0 && (
        <div
          style={{
            border: `1px dashed ${c.border}`,
            borderRadius: 12,
            padding: 24,
            textAlign: "center",
            fontSize: 14,
            color: c.textSecondary,
          }}
        >
          Henüz destek talebi yok.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {requests?.map((r) => {
          const answered = r.status === "answered";
          return (
            <div
              key={r.id}
              style={{
                background: c.surface,
                border: `1px solid ${answered ? c.border : c.accent}`,
                borderRadius: 12,
                padding: 16,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 16, fontWeight: 500, color: c.textPrimary, flex: 1, minWidth: 0 }}>
                  {r.subject}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    flexShrink: 0,
                    padding: "2px 9px",
                    borderRadius: 999,
                    background: answered ? "rgba(46,158,91,0.12)" : c.background,
                    border: `1px solid ${answered ? c.success : c.accent}`,
                    color: answered ? c.success : c.accentDark,
                  }}
                >
                  {answered ? "Yanıtlandı" : "Bekliyor"}
                </span>
              </div>

              {/* Formdaki ad ile hesap ayrı gösteriliyor: talep başkası adına
                  bırakılmış olabilir (bkz. 065_destek_talepleri.sql). */}
              <div style={{ fontSize: 12, color: c.textSecondary, marginBottom: 10 }}>
                {r.name}
                {r.userFullName && r.userFullName !== r.name ? ` (hesap: ${r.userFullName})` : ""}
                {r.userEmail ? ` · ${r.userEmail}` : ""} · {new Date(r.createdAt).toLocaleString("tr-TR")}
              </div>

              <p style={{ fontSize: 14, color: c.textPrimary, margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                {r.message}
              </p>

              {r.reply && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${c.border}` }}>
                  <div style={{ fontSize: 12, color: c.textSecondary, marginBottom: 4 }}>
                    Yanıtın{r.repliedAt ? ` · ${new Date(r.repliedAt).toLocaleString("tr-TR")}` : ""}
                  </div>
                  <p style={{ fontSize: 14, color: c.textSecondary, margin: 0, whiteSpace: "pre-wrap" }}>{r.reply}</p>
                </div>
              )}

              {openId === r.id ? (
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Yanıtın — kullanıcıya bildirim olarak gider"
                    rows={4}
                    maxLength={4000}
                    autoFocus
                    style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => sendReply(r.id)}
                      disabled={sendingId === r.id || !draft.trim()}
                      style={{
                        background: c.primary,
                        color: "#fff",
                        padding: "8px 15px",
                        borderRadius: 8,
                        border: "none",
                        fontSize: 14,
                        fontWeight: 500,
                      }}
                    >
                      {sendingId === r.id ? "Gönderiliyor…" : "Yanıtla ve bildir"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOpenId(null);
                        setDraft("");
                      }}
                      style={{
                        background: "transparent",
                        color: c.textSecondary,
                        padding: "8px 15px",
                        borderRadius: 8,
                        border: `1px solid ${c.border}`,
                        fontSize: 14,
                      }}
                    >
                      Vazgeç
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setOpenId(r.id);
                    setDraft(r.reply ?? "");
                  }}
                  style={{
                    marginTop: 12,
                    background: "transparent",
                    color: c.textPrimary,
                    padding: "7px 14px",
                    borderRadius: 8,
                    border: `1px solid ${c.border}`,
                    fontSize: 14,
                  }}
                >
                  {answered ? "Yanıtı güncelle" : "Yanıtla"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
