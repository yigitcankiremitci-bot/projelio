import { useEffect, useState } from "react";
import type { SupportRequest, User } from "@projelio/shared";
import { support } from "../api/support";
import { useThemeColors } from "../theme/useThemeColors";

/**
 * Ayarlar > Destek — kullanıcının öneri/dilek/şikâyet bıraktığı ve yanıtları
 * okuduğu yer (bkz. backend modules/support).
 *
 * Yanıt İKİ yerden okunabiliyor: gelen bildirime tıklayınca açılan modal ve bu
 * liste. Bildirim kaçırılabilir/silinebilir bir şey; yanıtın kalıcı adresi
 * burasıdır.
 */
export default function SupportPanel({ me }: { me: User | null }) {
  const c = useThemeColors();
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [requests, setRequests] = useState<SupportRequest[]>([]);

  // İsim kutusu hesaptaki adla dolu gelir ama kilitli değil: kullanıcı talebi
  // başkası adına bırakabiliyor (bkz. 065_destek_talepleri.sql).
  useEffect(() => {
    if (me?.fullName) setName((prev) => prev || me.fullName);
  }, [me?.fullName]);

  const load = () => {
    support
      .mine()
      .then(setRequests)
      .catch(() => setRequests([]));
  };

  useEffect(load, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSent(false);
    setSending(true);
    try {
      await support.create({ name: name.trim(), subject: subject.trim(), message: message.trim() });
      setSubject("");
      setMessage("");
      setSent(true);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Talep gönderilemedi.");
    } finally {
      setSending(false);
    }
  };

  const cardStyle: React.CSSProperties = {
    background: c.surface,
    border: `1px solid ${c.border}`,
    borderRadius: 12,
    padding: 16,
  };

  return (
    <>
      <section style={cardStyle}>
        <h3 style={{ fontSize: 16, fontWeight: 500, color: c.textPrimary, margin: 0 }}>Bize yaz</h3>
        <p style={{ fontSize: 13, color: c.textSecondary, margin: "4px 0 0", lineHeight: 1.4 }}>
          Öneri, dilek ya da şikâyetini buradan iletebilirsin. Yanıtladığımızda sana bildirim gelir.
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSent(false);
            }}
            placeholder="İsmin"
            maxLength={80}
            required
            style={{ width: "100%" }}
          />
          <input
            type="text"
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value);
              setSent(false);
            }}
            placeholder="Konu"
            maxLength={120}
            required
            style={{ width: "100%" }}
          />
          <textarea
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              setSent(false);
            }}
            placeholder="Mesajın"
            maxLength={4000}
            required
            rows={5}
            style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
          />
          <button
            type="submit"
            disabled={sending || !name.trim() || !subject.trim() || !message.trim()}
            style={{
              alignSelf: "flex-start",
              background: c.primary,
              color: c.onPrimary,
              padding: "9px 16px",
              borderRadius: 8,
              border: "none",
              fontSize: 15,
              fontWeight: 500,
            }}
          >
            {sending ? "Gönderiliyor…" : "Gönder"}
          </button>
        </form>

        {error && <p style={{ color: c.danger, fontSize: 14, margin: "8px 0 0" }}>{error}</p>}
        {sent && !error && (
          <p style={{ color: c.success, fontSize: 14, margin: "8px 0 0" }}>
            Talebin bize ulaştı. Yanıtladığımızda bildirim göndereceğiz.
          </p>
        )}
      </section>

      {requests.length > 0 && (
        <section style={cardStyle}>
          <h3 style={{ fontSize: 16, fontWeight: 500, color: c.textPrimary, margin: "0 0 12px" }}>Taleplerim</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {requests.map((r) => (
              <div
                key={r.id}
                style={{
                  border: `1px solid ${c.border}`,
                  borderRadius: 10,
                  padding: 12,
                  background: c.background,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 15, color: c.textPrimary, fontWeight: 500, flex: 1, minWidth: 0 }}>
                    {r.subject}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      flexShrink: 0,
                      padding: "2px 9px",
                      borderRadius: 999,
                      background: r.status === "answered" ? "rgba(46,158,91,0.12)" : c.surface,
                      border: `1px solid ${r.status === "answered" ? c.success : c.border}`,
                      color: r.status === "answered" ? c.success : c.textSecondary,
                    }}
                  >
                    {r.status === "answered" ? "Yanıtlandı" : "Bekliyor"}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: c.textSecondary, marginBottom: 8 }}>
                  {new Date(r.createdAt).toLocaleString("tr-TR")}
                </div>
                <p style={{ fontSize: 14, color: c.textSecondary, margin: 0, whiteSpace: "pre-wrap" }}>{r.message}</p>

                {r.reply && (
                  <div
                    style={{
                      marginTop: 10,
                      paddingTop: 10,
                      borderTop: `1px solid ${c.border}`,
                    }}
                  >
                    <div style={{ fontSize: 12, color: c.textSecondary, marginBottom: 4 }}>
                      Projelio ekibi{r.repliedAt ? ` · ${new Date(r.repliedAt).toLocaleString("tr-TR")}` : ""}
                    </div>
                    <p style={{ fontSize: 14, color: c.textPrimary, margin: 0, whiteSpace: "pre-wrap" }}>{r.reply}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
