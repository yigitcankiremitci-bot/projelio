import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { colors } from "../theme/colors";
import { IconSparkle, IconX, IconPlus, IconTrash, IconSend } from "./icons";
import { aiChat } from "../api/aiChat";
import type { AiConversation, AiCredits, AiStoredMessage } from "../api/aiChat";
import ConfirmDialog from "./ConfirmDialog";
import { useIsDesktop } from "../lib/useIsDesktop";

interface Props {
  open: boolean;
  onClose: () => void;
  /**
   * Panel açılırken otomatik gönderilecek mesaj (bkz. lib/askLio.ts).
   * Takvim'deki "Lio ile planla" gibi noktalar sohbeti hazır bir soruyla
   * başlatır; kullanıcı ayrıca "gönder"e basmak zorunda kalmaz.
   */
  initialMessage?: string | null;
  /** Mesaj gönderildikten sonra çağrılır; aksi halde her açılışta tekrar giderdi. */
  onInitialMessageSent?: () => void;
}

interface PendingConfirmation {
  actionId: string;
  summary: string;
}

interface ViewMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  creditsCharged?: number;
  pending?: boolean;
}

const SUGGESTIONS = [
  "Durumumu özetle",
  "Geciken görevlerim neler?",
  "Bu hafta neler teslim edilecek?",
  "Bana atanmış açık işleri listele",
];

const GREETING =
  "Merhaba! Ben Lio. Projelerini, görevlerini ve bütçeni buradan yönetebilirsin — yazman yeterli.";

export default function AiAssistantPanel({ open, onClose, initialMessage, onInitialMessageSent }: Props) {
  const c = colors.light;
  const isDesktop = useIsDesktop();

  const [conversations, setConversations] = useState<AiConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ViewMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [credits, setCredits] = useState<AiCredits | null>(null);
  const [confirmation, setConfirmation] = useState<PendingConfirmation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const refreshCredits = useCallback(() => {
    aiChat
      .getCredits()
      .then(setCredits)
      .catch(() => {});
  }, []);

  // Panel her açıldığında sohbet listesi ve bakiye tazelenir.
  useEffect(() => {
    if (!open) return;
    refreshCredits();
    aiChat
      .listConversations()
      .then(setConversations)
      .catch(() => {});
    setTimeout(() => inputRef.current?.focus(), 80);
  }, [open, refreshCredits]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending, confirmation]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !confirmation) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, confirmation]);

  const openConversation = async (id: string) => {
    setActiveId(id);
    setShowHistory(false);
    setLoadingHistory(true);
    setError(null);
    try {
      const stored: AiStoredMessage[] = await aiChat.getMessages(id);
      setMessages(
        stored.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          creditsCharged: m.creditsCharged || undefined,
        }))
      );
    } catch {
      setError("Sohbet yüklenemedi.");
    } finally {
      setLoadingHistory(false);
    }
  };

  const startNewConversation = () => {
    setActiveId(null);
    setMessages([]);
    setError(null);
    setShowHistory(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await aiChat.deleteConversation(id);
      setConversations((prev) => prev.filter((conv) => conv.id !== id));
      if (activeId === id) startNewConversation();
    } catch {
      setError("Sohbet silinemedi.");
    }
  };

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setError(null);
    setInput("");
    setMessages((prev) => [...prev, { id: `local-${Date.now()}`, role: "user", content: trimmed }]);
    setSending(true);

    try {
      const result = await aiChat.send(trimmed, activeId ?? undefined);

      // Yeni sohbet açıldıysa listeyi tazele ki başlık görünsün.
      if (!activeId) {
        setActiveId(result.conversationId);
        aiChat.listConversations().then(setConversations).catch(() => {});
      }
      setCredits((prev) => (prev ? { ...prev, balance: result.usage.balance } : prev));

      if (result.type === "confirmation") {
        if (result.text) {
          setMessages((prev) => [
            ...prev,
            { id: `a-${Date.now()}`, role: "assistant", content: result.text!, creditsCharged: result.usage.creditsCharged },
          ]);
        }
        setConfirmation({ actionId: result.actionId, summary: result.summary });
      } else {
        setMessages((prev) => [
          ...prev,
          { id: `a-${Date.now()}`, role: "assistant", content: result.text, creditsCharged: result.usage.creditsCharged },
        ]);
      }
    } catch (err: any) {
      const message = String(err?.message ?? "bilinmeyen hata");
      // 402: kredi yetersiz — kullanıcıyı bilgilendir, hata balonu yerine uyarı göster.
      setError(message);
      refreshCredits();
    } finally {
      setSending(false);
    }
  };

  /**
   * Dışarıdan gelen açılış mesajını gönderir (bkz. lib/askLio.ts).
   *
   * `sentInitialRef` React 18'in geliştirme modundaki çift render'ına karşı:
   * o olmadan aynı mesaj iki kez gidip kullanıcıdan iki kez kredi düşerdi.
   */
  const sentInitialRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open || !initialMessage || sending) return;
    if (sentInitialRef.current === initialMessage) return;
    sentInitialRef.current = initialMessage;
    // Yeni bir soru her zaman temiz bir sohbette başlar: takvim planlaması,
    // yarım kalmış bir bütçe konuşmasının altına eklenmemeli.
    setActiveId(null);
    setMessages([]);
    void send(initialMessage);
    onInitialMessageSent?.();
    // `send` her render'da yeniden oluşuyor; bağımlılığa eklemek döngü yapar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialMessage]);

  const handleConfirmAction = async () => {
    if (!confirmation) return;
    const res = await aiChat.confirm(confirmation.actionId, true);
    setMessages((prev) => [...prev, { id: `c-${Date.now()}`, role: "assistant", content: res.text }]);
    setConfirmation(null);
  };

  const handleCancelAction = () => {
    const pending = confirmation;
    setConfirmation(null);
    if (!pending) return;
    aiChat
      .confirm(pending.actionId, false)
      .then((res) => setMessages((prev) => [...prev, { id: `c-${Date.now()}`, role: "assistant", content: res.text }]))
      .catch(() => {});
  };

  const lowBalance = useMemo(
    () => !!credits && credits.balance < (credits.minBalanceToStart || 20),
    [credits]
  );

  const panelWidth = isDesktop ? 460 : undefined;

  return (
    <>
      {/* Arka plan karartması */}
      {open && (
        <div
          onClick={onClose}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(26,31,41,0.35)",
            zIndex: 60,
            animation: "projelioAiFade .18s ease",
          }}
        />
      )}

      <style>{`
        @keyframes projelioAiFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes projelioAiSlide { from { transform: translateX(24px); opacity: .4 } to { transform: translateX(0); opacity: 1 } }
        @keyframes projelioAiPulse { 0%,100% { opacity: .35 } 50% { opacity: 1 } }
      `}</style>

      <aside
        aria-hidden={!open}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: panelWidth ?? "100%",
          maxWidth: "100vw",
          background: c.surface,
          borderLeft: `1px solid ${c.border}`,
          boxShadow: "-8px 0 32px rgba(26,31,41,0.16)",
          zIndex: 61,
          display: open ? "flex" : "none",
          flexDirection: "column",
          animation: "projelioAiSlide .22s ease",
        }}
      >
        {/* Başlık */}
        <header
          style={{
            padding: "16px 18px",
            background: c.primaryDark,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            <img src="/lio-open.png" alt="Lio" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.2 }}>Lio</div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              {credits ? `${formatCredits(credits.balance)} kredi` : "Yükleniyor…"}
            </div>
          </div>

          <HeaderButton title="Sohbet geçmişi" onClick={() => setShowHistory((v) => !v)} active={showHistory}>
            <IconMessagesGlyph color="#fff" />
          </HeaderButton>
          <HeaderButton title="Yeni sohbet" onClick={startNewConversation}>
            <IconPlus size={17} color="#fff" />
          </HeaderButton>
          <HeaderButton title="Kapat" onClick={onClose}>
            <IconX size={17} color="#fff" />
          </HeaderButton>
        </header>

        {/* Sohbet geçmişi çekmecesi */}
        {showHistory && (
          <div
            style={{
              borderBottom: `1px solid ${c.border}`,
              background: c.background,
              maxHeight: 220,
              overflowY: "auto",
              flexShrink: 0,
            }}
          >
            {conversations.length === 0 ? (
              <p style={{ padding: 16, margin: 0, fontSize: 13, color: c.textSecondary }}>Henüz sohbet yok.</p>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => openConversation(conv.id)}
                  style={{
                    padding: "10px 16px",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    cursor: "pointer",
                    background: conv.id === activeId ? c.surface : "transparent",
                    borderBottom: `1px solid ${c.border}`,
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      fontSize: 13,
                      color: c.textPrimary,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {conv.title}
                  </span>
                  <button
                    onClick={(e) => handleDeleteConversation(conv.id, e)}
                    aria-label="Sohbeti sil"
                    style={{ background: "transparent", border: "none", padding: 4, display: "flex", cursor: "pointer" }}
                  >
                    <IconTrash size={14} color={c.textSecondary} />
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* Mesajlar */}
        <div
          ref={scrollRef}
          style={{ flex: 1, overflowY: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 12 }}
        >
          {messages.length === 0 && !loadingHistory && (
            <>
              <Bubble role="assistant" text={GREETING} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => void send(s)}
                    disabled={sending}
                    style={{
                      padding: "7px 12px",
                      borderRadius: 999,
                      border: `1px solid ${c.border}`,
                      background: c.background,
                      color: c.textPrimary,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </>
          )}

          {loadingHistory && <p style={{ fontSize: 13, color: c.textSecondary }}>Sohbet yükleniyor…</p>}

          {messages.map((m) => (
            <Bubble key={m.id} role={m.role} text={m.content} credits={m.creditsCharged} />
          ))}

          {sending && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: c.textSecondary, fontSize: 13 }}>
              <span style={{ animation: "projelioAiPulse 1.2s ease infinite" }}>
                <IconSparkle size={15} color={c.accent} />
              </span>
              Düşünüyor…
            </div>
          )}
        </div>

        {/* Hata / düşük bakiye uyarısı */}
        {(error || lowBalance) && (
          <div
            style={{
              margin: "0 14px 10px",
              padding: "10px 12px",
              borderRadius: 10,
              background: error ? "rgba(193,52,52,0.08)" : "rgba(192,129,63,0.10)",
              border: `1px solid ${error ? c.danger : c.warning}`,
              color: error ? c.danger : c.accentDark,
              fontSize: 13,
              lineHeight: 1.45,
            }}
          >
            {error ?? "AI krediniz azaldı. Kesintisiz kullanım için kredi yükleyin."}
          </div>
        )}

        {/* Yazma alanı */}
        <div style={{ padding: 14, borderTop: `1px solid ${c.border}`, flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              rows={1}
              placeholder="Ne yapmak istersin?"
              disabled={sending}
              style={{
                flex: 1,
                resize: "none",
                maxHeight: 120,
                padding: "11px 13px",
                borderRadius: 12,
                border: `1px solid ${c.border}`,
                fontSize: 14,
                fontFamily: "inherit",
                lineHeight: 1.45,
                color: c.textPrimary,
                background: c.background,
              }}
            />
            <button
              onClick={() => void send(input)}
              disabled={sending || !input.trim()}
              aria-label="Gönder"
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                border: "none",
                background: c.accent,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                cursor: sending || !input.trim() ? "default" : "pointer",
                opacity: sending || !input.trim() ? 0.5 : 1,
              }}
            >
              <IconSend size={19} color="#fff" />
            </button>
          </div>
          <p style={{ margin: "8px 2px 0", fontSize: 11, color: c.textSecondary }}>
            Lio hata yapabilir; önemli işlemleri kontrol edin.
          </p>
        </div>
      </aside>

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

function formatCredits(value: number): string {
  return Math.round(value).toLocaleString("tr-TR");
}

function HeaderButton({
  children,
  onClick,
  title,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        border: "none",
        background: active ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.10)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

function IconMessagesGlyph({ color = "currentColor" }: { color?: string }) {
  return (
    <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5h13v9H8l-4 3V5z" />
      <path d="M20 9v11l-3-2.5" />
    </svg>
  );
}

function Bubble({
  role,
  text,
  credits,
}: {
  role: "user" | "assistant";
  text: string;
  credits?: number;
}) {
  const c = colors.light;
  const isUser = role === "user";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start" }}>
      <div
        style={{
          maxWidth: "88%",
          padding: "10px 13px",
          borderRadius: 14,
          borderBottomRightRadius: isUser ? 4 : 14,
          borderBottomLeftRadius: isUser ? 14 : 4,
          background: isUser ? c.primaryDark : c.background,
          color: isUser ? "#fff" : c.textPrimary,
          fontSize: 14,
          lineHeight: 1.5,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {text}
      </div>
      {!isUser && !!credits && (
        <span style={{ fontSize: 10.5, color: c.textSecondary, margin: "3px 4px 0" }}>
          {Math.round(credits)} kredi
        </span>
      )}
    </div>
  );
}
