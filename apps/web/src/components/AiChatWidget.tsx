import { useEffect, useRef, useState } from "react";
import { colors } from "../theme/colors";
import { IconMessageCircle, IconX } from "./icons";
import { aiChat } from "../api/aiChat";
import type { AiChatMessage } from "../api/aiChat";
import ConfirmDialog from "./ConfirmDialog";
import { useIsDesktop } from "../lib/useIsDesktop";

const GREETING = "Merhaba! Görev, proje, iş ve bütçe konularında sana yardımcı olabilirim. Örneğin: \"Galata projesine yarına teslim 'logo tasarımı' görevi ekle\".";

interface PendingConfirmation {
  actionId: string;
  summary: string;
}

export default function AiChatWidget() {
  const c = colors.light;
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmation, setConfirmation] = useState<PendingConfirmation | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Mobilde alt menünün üstünde durması için yukarıda bırakılıyor; masaüstünde
  // alt menü olmadığı için ekranın altına daha yakın oturabilir.
  const isDesktop = useIsDesktop();
  const fabBottom = isDesktop ? 20 : 96;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open, confirmation]);

  const appendAssistant = (text: string) => setMessages((prev) => [...prev, { role: "assistant", content: text }]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    const nextMessages: AiChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setSending(true);
    try {
      const result = await aiChat.send(nextMessages);
      if (result.type === "confirmation") {
        if (result.text) appendAssistant(result.text);
        setConfirmation({ actionId: result.actionId, summary: result.summary });
      } else {
        appendAssistant(result.text);
      }
    } catch (err: any) {
      appendAssistant(`Bir sorun oluştu: ${err?.message ?? "bilinmeyen hata"}`);
    } finally {
      setSending(false);
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmation) return;
    const res = await aiChat.confirm(confirmation.actionId, true);
    appendAssistant(res.text);
    setConfirmation(null);
  };

  const handleCancelAction = () => {
    const pending = confirmation;
    setConfirmation(null);
    if (!pending) return;
    aiChat
      .confirm(pending.actionId, false)
      .then((res) => appendAssistant(res.text))
      .catch(() => {});
  };

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="AI Asistan"
        style={{
          position: "fixed",
          right: 16,
          bottom: fabBottom,
          width: 52,
          height: 52,
          borderRadius: "50%",
          border: "none",
          background: c.primaryDark,
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 14px rgba(26,31,41,0.28)",
          zIndex: 45,
          cursor: "pointer",
        }}
      >
        {open ? <IconX size={22} color="#fff" /> : <IconMessageCircle size={22} color="#fff" />}
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            right: 16,
            bottom: fabBottom + 60,
            width: "min(360px, calc(100vw - 32px))",
            height: "min(520px, calc(100vh - 220px))",
            background: c.surface,
            border: `1px solid ${c.border}`,
            borderRadius: 16,
            boxShadow: "0 12px 32px rgba(26,31,41,0.22)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            zIndex: 46,
          }}
        >
          <div
            style={{
              padding: "14px 16px",
              borderBottom: `1px solid ${c.border}`,
              background: c.primaryDark,
              color: "#fff",
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 600 }}>Projelio Asistan</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Yazarak görev, proje, iş ve bütçe işlemleri yap</div>
          </div>

          <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <ChatBubble role="assistant" text={GREETING} />
            {messages.map((m, i) => (
              <ChatBubble key={i} role={m.role} text={m.content} />
            ))}
            {sending && <ChatBubble role="assistant" text="…" muted />}
          </div>

          <div style={{ padding: 10, borderTop: `1px solid ${c.border}`, display: "flex", gap: 8 }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder="Ne yapmak istersin?"
              disabled={sending}
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRadius: 10,
                border: `1px solid ${c.border}`,
                fontSize: 14,
                color: c.textPrimary,
                background: c.background,
              }}
            />
            <button
              onClick={() => void handleSend()}
              disabled={sending || !input.trim()}
              style={{
                padding: "0 16px",
                borderRadius: 10,
                border: "none",
                background: c.accent,
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                cursor: sending ? "default" : "pointer",
                opacity: sending || !input.trim() ? 0.6 : 1,
              }}
            >
              Gönder
            </button>
          </div>
        </div>
      )}

      {confirmation && (
        <ConfirmDialog
          title="Onay gerekiyor"
          message={confirmation.summary}
          confirmLabel="Onayla"
          cancelLabel="Vazgeç"
          danger
          onConfirm={handleConfirmAction}
          onCancel={handleCancelAction}
        />
      )}
    </>
  );
}

function ChatBubble({ role, text, muted }: { role: "user" | "assistant"; text: string; muted?: boolean }) {
  const c = colors.light;
  const isUser = role === "user";
  return (
    <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}>
      <div
        style={{
          maxWidth: "85%",
          padding: "9px 12px",
          borderRadius: 12,
          borderBottomRightRadius: isUser ? 4 : 12,
          borderBottomLeftRadius: isUser ? 12 : 4,
          background: isUser ? c.primaryDark : c.background,
          color: isUser ? "#fff" : c.textPrimary,
          fontSize: 14,
          lineHeight: 1.45,
          opacity: muted ? 0.6 : 1,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {text}
      </div>
    </div>
  );
}
