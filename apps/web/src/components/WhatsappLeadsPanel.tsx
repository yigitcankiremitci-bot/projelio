import { useCallback, useEffect, useRef, useState } from "react";
import type { WhatsappLead, WhatsappMessage } from "@projelio/shared";
import { whatsappApi } from "../api/whatsapp";
import { getSocket } from "../lib/liveRoom";
import { useThemeColors } from "../theme/useThemeColors";
import { useT } from "../lib/i18n";
import { bicimDili } from "../lib/i18n/depo";
import { IconWhatsapp } from "./icons";

/**
 * Yönetici: Lio'ya WhatsApp'tan yazan, henüz üye olmamış yabancılar.
 *
 * Bu konuşmaların sahibi yok (bkz. whatsapp-pazarlama.ts), o yüzden hiçbir
 * kullanıcının Ayarlar sayfasında görünmezler — yönetici bildirimi geldiğinde
 * bakılacak yer burası. Satıra tıklamak konuşmanın tamamını açar.
 */
export default function WhatsappLeadsPanel() {
  const c = useThemeColors();
  const t = useT();
  const [leads, setLeads] = useState<WhatsappLead[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [messages, setMessages] = useState<WhatsappMessage[] | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");

  const reload = useCallback(() => {
    return whatsappApi.admin
      .leads()
      .then((l) => {
        setLeads(l);
        setError("");
      })
      .catch((e: any) => setError(e?.message ?? t("Liste alınamadı.")));
  }, [t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Canlı güncelleme: sunucu bir yabancı konuşmasında mesaj olunca haber verir.
  // Açık konuşmayı "yükleniyor"a çevirmeden sessizce tazeliyoruz; yoksa yazarken
  // gelen her mesaj kutuyu yanıp söndürürdü.
  const openRef = useRef<string | null>(null);
  openRef.current = open;
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handler = (e: { threadId: string }) => {
      void reload();
      if (openRef.current === e.threadId) {
        whatsappApi
          .messages(e.threadId, 100)
          .then((m) => setMessages([...m].reverse()))
          .catch(() => {});
      }
    };
    socket.on("whatsapp-leads", handler);
    return () => {
      socket.off("whatsapp-leads", handler);
    };
  }, [reload]);

  const toggle = (threadId: string) => {
    if (open === threadId) {
      setOpen(null);
      return;
    }
    setOpen(threadId);
    setDraft("");
    setSendError("");
    loadMessages(threadId);
  };

  const loadMessages = (threadId: string) => {
    setMessages(null);
    whatsappApi
      .messages(threadId, 100)
      .then((m) => setMessages([...m].reverse()))
      .catch(() => setMessages([]));
  };

  // Cevap Lio'nun numarasından, kuyruk ve hız sınırıyla gider (birkaç dakika
  // sürebilir). Elle yazılan mesajdan sonra Lio bu kişiye şablon göndermez.
  const send = async (threadId: string) => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setSendError("");
    try {
      await whatsappApi.send(threadId, text);
      setDraft("");
      loadMessages(threadId);
      void reload();
    } catch (e: any) {
      setSendError(e?.message ?? t("Mesaj gönderilemedi."));
    } finally {
      setSending(false);
    }
  };

  const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString(bicimDili(), { dateStyle: "short", timeStyle: "short" }) : "—");

  return (
    <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, padding: "18px 20px", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <IconWhatsapp size={22} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 500, color: c.textPrimary }}>
            {t("Lio'ya yazanlar")} <span style={{ color: c.textSecondary, fontWeight: 400 }}>({leads?.length ?? 0})</span>
          </div>
          <div style={{ fontSize: 14, color: c.textSecondary }}>
            {t("WhatsApp'tan Lio'ya yazan, henüz üye olmamış kişiler. Üye olup kodu gönderenler bu listeden düşer.")}
          </div>
        </div>
        <button
          onClick={() => void reload()}
          style={{ padding: "7px 12px", borderRadius: 9, border: `1px solid ${c.border}`, background: "transparent", color: c.textPrimary, fontSize: 14, cursor: "pointer" }}
        >
          {t("Yenile")}
        </button>
      </div>

      {error && <p style={{ fontSize: 14, color: c.danger, margin: "0 0 10px" }}>{error}</p>}
      {leads && leads.length === 0 && (
        <p style={{ fontSize: 15, color: c.textSecondary, margin: 0 }}>{t("Henüz Lio'ya yazan yabancı yok.")}</p>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        {leads?.map((l) => (
          <div key={l.threadId} style={{ border: `1px solid ${c.border}`, borderRadius: 10, overflow: "hidden" }}>
            <button
              onClick={() => toggle(l.threadId)}
              style={{ width: "100%", textAlign: "left", padding: "10px 12px", background: "transparent", border: "none", cursor: "pointer", color: c.textPrimary }}
            >
              <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                <span style={{ fontSize: 15, fontWeight: 500 }}>{l.displayName ?? l.phone}</span>
                {l.displayName && <span style={{ fontSize: 13, color: c.textSecondary }}>{l.phone}</span>}
                {l.optedOut && <span style={{ fontSize: 12, color: c.danger }}>{t("ilgilenmiyor")}</span>}
                <span style={{ marginLeft: "auto", fontSize: 12, color: c.textSecondary }}>
                  {fmt(l.lastInboundAt ?? l.firstAt)} · {l.inboundCount}↓ {l.outboundCount}↑
                </span>
              </div>
              {l.lastInbound && (
                <div style={{ fontSize: 13, color: c.textSecondary, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {l.lastInbound}
                </div>
              )}
            </button>
            {open === l.threadId && (
              <div style={{ borderTop: `1px solid ${c.border}`, padding: "10px 12px", display: "grid", gap: 6, background: c.background }}>
                {messages === null && <span style={{ fontSize: 13, color: c.textSecondary }}>…</span>}
                {messages?.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      justifySelf: m.direction === "inbound" ? "start" : "end",
                      maxWidth: "85%",
                      padding: "6px 10px",
                      borderRadius: 10,
                      fontSize: 14,
                      whiteSpace: "pre-wrap",
                      background: m.direction === "inbound" ? c.surface : c.primary,
                      color: m.direction === "inbound" ? c.textPrimary : c.onPrimary,
                    }}
                  >
                    {m.body}
                  </div>
                ))}
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void send(l.threadId)}
                    placeholder={t("Lio numarasından cevap yazın…")}
                    style={{ flex: 1, minWidth: 0, padding: "8px 10px", borderRadius: 9, border: `1px solid ${c.border}`, background: c.surface, color: c.textPrimary, fontSize: 14 }}
                  />
                  <button
                    onClick={() => void send(l.threadId)}
                    disabled={sending || !draft.trim()}
                    style={{ padding: "8px 14px", borderRadius: 9, border: "none", background: c.primary, color: c.onPrimary, fontSize: 14, fontWeight: 500, cursor: sending ? "wait" : "pointer", opacity: !draft.trim() ? 0.6 : 1 }}
                  >
                    {t("Gönder")}
                  </button>
                </div>
                {sendError && <span style={{ fontSize: 13, color: c.danger }}>{sendError}</span>}
                <span style={{ fontSize: 12, color: c.textSecondary }}>
                  {t("Mesaj birkaç dakika içinde gider. Elle cevap yazınca Lio bu kişiye otomatik şablon göndermeyi bırakır.")}
                </span>
                {!l.phone.startsWith("gizli") && (
                  <a
                    href={`https://wa.me/${l.phone.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 13, color: c.primary, marginTop: 4 }}
                  >
                    {t("WhatsApp'ta aç")}
                  </a>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
