import { useEffect, useRef, useState } from "react";
import type { MailMessageDetail } from "@projelio/shared";
import { mailboxApi } from "../api/mailbox";
import { useThemeColors } from "../theme/useThemeColors";
import Modal from "./Modal";
import { IconExternalLink, IconSparkle } from "./icons";
import { useT } from "../lib/i18n";

interface Props {
  accountId: string;
  message: MailMessageDetail;
  canWrite: boolean;
  onClose: () => void;
  /** Yanıt gönderildiğinde panele haber verir (şerit göstermek için). */
  onSent: (text: string) => void;
}

type ReplyMode = "reply" | "replyAll" | "forward";

const MODE_LABELS: Record<ReplyMode, string> = {
  reply: "Yanıtla",
  replyAll: "Tümünü yanıtla",
  forward: "İlet",
};

/**
 * Bir e-postayı okuma ve yanıtlama ekranı.
 *
 * NEDEN MODAL: okuma alanı önce modül sayfasının üçüncü sütunundaydı ve orası
 * hem gövde hem yanıt için dardı — e-posta yazmak bir "kenar çubuğu" işi değil,
 * odaklanılan bir iş. Modal ekranın tamamına yakınını kullanır, arkadaki liste
 * yerinde kalır (kapatınca aynı yere dönülür) ve dar ekranda tam sayfa açılır.
 *
 * YAZMA ALANI: yanıt kutusu sabit ve büyük (min 260px) ve yazdıkça KENDİ
 * BÜYÜR. Sekiz satırlık bir kutuda uzun bir yanıt yazmak, metni bir delikten
 * okumaya benziyordu.
 *
 * GÖVDE SANDBOX'LI IFRAME'DE: gelen e-posta güvenilmeyen HTML'dir; doğrudan
 * sayfaya koymak gönderene script çalıştırma imkânı verirdi.
 */
export default function MailMessageModal({ accountId, message, canWrite, onClose, onSent }: Props) {
  const c = useThemeColors();
  const t = useT();
  const [replyMode, setReplyMode] = useState<ReplyMode | null>(null);
  const [replyText, setReplyText] = useState("");
  const [forwardTo, setForwardTo] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null);

  /**
   * Kutu içeriğe göre büyür.
   *
   * `rows` ile sabit bir yükseklik vermek, uzun yanıtta kaydırma çubuğuna
   * mahkûm ediyordu. Yükseklik önce sıfırlanıp `scrollHeight`'a ayarlanıyor:
   * sıfırlamadan ölçüm alınırsa kutu yalnızca büyür, silince küçülmez.
   */
  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 260)}px`;
  }, [replyText, replyMode]);

  // Yanıt açıldığında imleç doğrudan metne gitsin.
  useEffect(() => {
    if (replyMode) textarea.current?.focus();
  }, [replyMode]);

  const askLio = async () => {
    setDrafting(true);
    setError("");
    try {
      // Kullanıcı bir şeyler yazdıysa o niyet olarak gider: "fiyat veremem,
      // önce toplantı isteyelim" gibi bir not taslağı işe yarar hale getiriyor.
      const { text } = await mailboxApi.draft(accountId, message.id, {
        instruction: replyText.trim() || undefined,
      });
      setReplyText(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Taslak üretilemedi");
    } finally {
      setDrafting(false);
    }
  };

  const send = async () => {
    if (!replyMode) return;
    if (!replyText.trim()) {
      setError("Yanıt metni boş olamaz");
      return;
    }
    setSending(true);
    setError("");
    try {
      await mailboxApi.reply(accountId, message.id, {
        text: replyText,
        mode: replyMode,
        to: replyMode === "forward" ? forwardTo.split(/[,;\s]+/).filter(Boolean) : undefined,
      });
      onSent(`${MODE_LABELS[replyMode]} işlemi tamamlandı.`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Yanıt gönderilemedi");
    } finally {
      setSending(false);
    }
  };

  /**
   * Yanıt yazarken kapatma kazası.
   *
   * Modal'ın kendi kapatma yolları (Escape, karartmaya tıklama) yazılmış bir
   * metni sessizce çöpe atıyordu. Boş kutuda soru sorulmaz.
   */
  const requestClose = () => {
    if (replyText.trim() && !window.confirm("Yazdığınız yanıt kaybolacak. Kapatılsın mı?")) return;
    onClose();
  };

  /**
   * Okuma alanının yüksekliği.
   *
   * Sabit piksel yerine ekran yüksekliğinin oranı: 13" bir dizüstünde 420px
   * makul görünürken 27" bir ekranda modalın yarısı boş kalıyordu. `minHeight`
   * küçük ekranda tabanı korur.
   *
   * Yanıt açılınca küçülür — odak yazmaya geçer ama gelen metin görünür kalır;
   * kimse alıntıya bakmadan yanıt yazmıyor.
   */
  const bodyHeight = replyMode ? "28vh" : "62vh";
  const bodyMinHeight = replyMode ? 200 : 380;

  return (
    <Modal title={message.subject} onClose={requestClose} maxWidth={1040} mobileFullScreen>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* ---------------------------------------------------- Başlık bilgileri */}
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: c.textPrimary }}>
              {message.from?.name || message.from?.address || "(gönderen yok)"}
            </span>
            <span style={{ fontSize: 12, color: c.textSecondary }}>&lt;{message.from?.address}&gt;</span>
            <span style={{ fontSize: 12, color: c.textSecondary, marginLeft: "auto" }}>
              {new Date(message.receivedAt).toLocaleString("tr-TR")}
            </span>
            {message.webLink && (
              <a href={message.webLink} target="_blank" rel="noreferrer" title={t("Outlook'ta aç")} style={{ display: "flex" }}>
                <IconExternalLink size={13} color={c.textSecondary} />
              </a>
            )}
          </div>
          <span style={{ fontSize: 11, color: c.textSecondary }}>
            Kime: {message.to.map((t) => t.address).join(", ") || "—"}
            {message.cc.length > 0 && ` · CC: ${message.cc.map((t) => t.address).join(", ")}`}
          </span>
          {message.attachments.length > 0 && (
            <span style={{ fontSize: 11, color: c.textSecondary }}>
              📎 {message.attachments.map((a) => a.name).join(", ")} — indirmek için Outlook'ta açın
            </span>
          )}
        </div>

        {/* ---------------------------------------------------- Gövde */}
        {message.bodyHtml ? (
          <iframe
            title={t("E-posta gövdesi")}
            sandbox=""
            srcDoc={message.bodyHtml}
            style={{
              width: "100%",
              height: bodyHeight,
              minHeight: bodyMinHeight,
              border: `1px solid ${c.border}`,
              borderRadius: 8,
              background: "#fff",
            }}
          />
        ) : (
          <pre
            style={{
              whiteSpace: "pre-wrap",
              fontFamily: "inherit",
              fontSize: 13,
              color: c.textPrimary,
              margin: 0,
              lineHeight: 1.6,
              maxHeight: bodyHeight,
              minHeight: bodyMinHeight,
              overflowY: "auto",
            }}
          >
            {message.bodyText}
          </pre>
        )}

        {/* ---------------------------------------------------- Eylemler */}
        {canWrite && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(Object.keys(MODE_LABELS) as ReplyMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setReplyMode(replyMode === mode ? null : mode)}
                style={{
                  fontSize: 13,
                  padding: "6px 14px",
                  borderRadius: 8,
                  cursor: "pointer",
                  border: `1px solid ${replyMode === mode ? c.primary : c.border}`,
                  background: replyMode === mode ? `${c.primary}14` : "transparent",
                  color: replyMode === mode ? c.primary : c.textPrimary,
                }}
              >
                {MODE_LABELS[mode]}
              </button>
            ))}
          </div>
        )}

        {/* ---------------------------------------------------- Yazma alanı */}
        {replyMode && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {replyMode === "forward" && (
              <input
                value={forwardTo}
                onChange={(e) => setForwardTo(e.target.value)}
                placeholder={t("Alıcılar (virgülle ayırın)")}
                style={{ fontSize: 14, padding: "8px 10px" }}
              />
            )}

            <textarea
              ref={textarea}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder={t("Yanıtınızı yazın… ya da ne söylemek istediğinizi kısaca yazıp Lio'dan taslak isteyin.")}
              style={{
                fontSize: 14,
                padding: "12px 14px",
                lineHeight: 1.6,
                minHeight: 260,
                // Kendi kendine büyüdüğü için dikey kaydırma çubuğu görünmesin;
                // yine de kullanıcı isterse köşeden çekebilsin.
                resize: "vertical",
                overflow: "hidden",
                borderRadius: 8,
                border: `1px solid ${c.border}`,
                fontFamily: "inherit",
              }}
            />

            <span style={{ fontSize: 11, color: c.textSecondary }}>
              Gönderdiğinizde Outlook orijinal iletiyi altına kendisi alıntılar; siz yalnızca üstte
              görünecek metni yazıyorsunuz.
            </span>

            {error && <span style={{ fontSize: 12, color: c.danger }}>{error}</span>}

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button
                onClick={askLio}
                disabled={drafting || sending}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 13,
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: `1px solid ${c.border}`,
                  background: "transparent",
                  cursor: drafting ? "default" : "pointer",
                  color: c.textPrimary,
                }}
              >
                <IconSparkle size={14} color={c.accent} />
                {drafting ? "Lio yazıyor…" : "Lio ile taslak"}
              </button>
              <span style={{ fontSize: 11, color: c.textSecondary, flex: "1 1 200px" }}>
                {t("Lio taslak yazar, göndermez — okuyup düzelttikten sonra siz gönderirsiniz.")}
              </span>
              <button
                onClick={() => {
                  setReplyMode(null);
                  setReplyText("");
                }}
                style={{
                  fontSize: 13,
                  padding: "8px 14px",
                  background: "transparent",
                  border: `1px solid ${c.border}`,
                  borderRadius: 8,
                  cursor: "pointer",
                  color: c.textSecondary,
                }}
              >
                {t("Vazgeç")}
              </button>
              <button
                onClick={send}
                disabled={sending || drafting}
                style={{
                  fontSize: 14,
                  padding: "8px 22px",
                  background: c.primary,
                  color: c.onPrimary,
                  border: "none",
                  borderRadius: 8,
                  cursor: sending ? "default" : "pointer",
                  opacity: sending || drafting ? 0.6 : 1,
                }}
              >
                {sending ? "Gönderiliyor…" : "Gönder"}
              </button>
            </div>
          </div>
        )}

        {!replyMode && error && <span style={{ fontSize: 12, color: c.danger }}>{error}</span>}
      </div>
    </Modal>
  );
}
