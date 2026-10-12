import { useEffect, useRef, useState } from "react";
import type { MailAccount } from "@projelio/shared";
import { mailboxApi } from "../api/mailbox";
import { useThemeColors } from "../theme/useThemeColors";
import Modal from "./Modal";
import { useT } from "../lib/i18n";

interface Props {
  account: MailAccount;
  /** Kişi kartından gelindiyse alıcı hazır dolu (bkz. EpostaGonderSecimi). */
  initialTo?: string;
  onClose: () => void;
  onSent: (text: string) => void;
}

/** Sunucudaki GONDERIM_EK_TAVANI ile aynı: ekler toplamı 25 MB. */
const EK_TAVANI = 25 * 1024 * 1024;

function boyutYaz(bayt: number): string {
  if (bayt < 1024 * 1024) return `${Math.max(1, Math.round(bayt / 1024))} KB`;
  return `${(bayt / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * @projelio.app kutusundan yeni e-posta.
 *
 * Gövde DÜZ METİN: HTML'e sunucu çevirir ve imzayı ekler (Outlook yanıtındaki
 * gerekçe — istemcinin HTML üretmesine izin vermiyoruz, bkz. mail-format.ts).
 * Ek tavanı burada da denetleniyor ki kullanıcı 30 MB'ı yükleyip ancak
 * sunucudan "olmadı" yanıtı almasın.
 */
export default function ProjelioYeniEpostaModal({ account, initialTo, onClose, onSent }: Props) {
  const c = useThemeColors();
  const t = useT();
  const [to, setTo] = useState(initialTo ?? "");
  const [cc, setCc] = useState("");
  const [ccAcik, setCcAcik] = useState(false);
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null);
  const dosyaGirdisi = useRef<HTMLInputElement>(null);

  // MailMessageModal'daki gibi: kutu içeriğe göre büyür.
  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 240)}px`;
  }, [text]);

  const toplam = files.reduce((n, f) => n + f.size, 0);

  const dosyaEkle = (liste: FileList | null) => {
    if (!liste?.length) return;
    const yeni = [...files, ...Array.from(liste)].slice(0, 10);
    if (yeni.reduce((n, f) => n + f.size, 0) > EK_TAVANI) {
      setError(t("Eklerin toplamı 25 MB'ı geçemez"));
      return;
    }
    setError("");
    setFiles(yeni);
  };

  const send = async () => {
    if (!to.trim()) return setError(t("En az bir alıcı gerekli"));
    if (!subject.trim()) return setError(t("Konu boş olamaz"));
    if (!text.trim()) return setError(t("E-posta metni boş olamaz"));
    setSending(true);
    setError("");
    try {
      await mailboxApi.compose(account.id, { to, cc, subject, text, files });
      onSent(t("E-posta gönderildi."));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("E-posta gönderilemedi"));
    } finally {
      setSending(false);
    }
  };

  const requestClose = () => {
    if ((text.trim() || subject.trim()) && !window.confirm(t("Yazdığınız e-posta kaybolacak. Kapatılsın mı?"))) return;
    onClose();
  };

  const girdi = { fontSize: 14, padding: "8px 10px", borderRadius: 8, border: `1px solid ${c.border}` } as const;

  return (
    <Modal title={t("Yeni e-posta")} onClose={requestClose} maxWidth={820} mobileFullScreen>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={{ fontSize: 12, color: c.textSecondary }}>
          {t("Gönderen: {adres}", {
            adres: account.displayName ? `${account.displayName} <${account.address}>` : account.address,
          })}
        </span>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder={t("Kime (virgülle ayırın)")}
            style={{ ...girdi, flex: 1 }}
            autoFocus={!initialTo}
          />
          {!ccAcik && (
            <button
              onClick={() => setCcAcik(true)}
              style={{ fontSize: 12, color: c.primary, background: "transparent", border: "none", cursor: "pointer" }}
            >
              {t("Bilgi (CC)")}
            </button>
          )}
        </div>
        {ccAcik && (
          <input value={cc} onChange={(e) => setCc(e.target.value)} placeholder={t("Bilgi (CC)")} style={girdi} />
        )}
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={t("Konu")}
          style={girdi}
          autoFocus={Boolean(initialTo)}
        />

        <textarea
          ref={textarea}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("E-postanızı yazın…")}
          style={{
            fontSize: 14,
            padding: "12px 14px",
            lineHeight: 1.6,
            minHeight: 240,
            resize: "vertical",
            overflow: "hidden",
            borderRadius: 8,
            border: `1px solid ${c.border}`,
            fontFamily: "inherit",
          }}
        />
        {account.signature && (
          <span style={{ fontSize: 11, color: c.textSecondary }}>{t("Kutunun imzası sona kendiliğinden eklenir.")}</span>
        )}

        {/* ---------------------------------------------------- Ekler */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <input
            ref={dosyaGirdisi}
            type="file"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              dosyaEkle(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => dosyaGirdisi.current?.click()}
            disabled={files.length >= 10}
            style={{
              fontSize: 13,
              padding: "6px 12px",
              borderRadius: 8,
              border: `1px solid ${c.border}`,
              background: "transparent",
              color: c.textPrimary,
              cursor: "pointer",
            }}
          >
            📎 {t("Dosya ekle")}
          </button>
          {files.map((f, i) => (
            <span
              key={`${f.name}-${i}`}
              style={{
                fontSize: 12,
                padding: "3px 8px",
                borderRadius: 999,
                border: `1px solid ${c.border}`,
                color: c.textPrimary,
                display: "inline-flex",
                gap: 6,
                alignItems: "center",
              }}
            >
              {f.name} · {boyutYaz(f.size)}
              <button
                onClick={() => setFiles((l) => l.filter((_, j) => j !== i))}
                aria-label={t("Eki kaldır")}
                style={{ background: "transparent", border: "none", cursor: "pointer", color: c.textSecondary, padding: 0 }}
              >
                ×
              </button>
            </span>
          ))}
          {files.length > 0 && (
            <span style={{ fontSize: 11, color: c.textSecondary }}>
              {t("Toplam {boyut} / 25 MB", { boyut: boyutYaz(toplam) })}
            </span>
          )}
        </div>

        {error && <span style={{ fontSize: 12, color: c.danger }}>{error}</span>}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={requestClose}
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
            disabled={sending}
            style={{
              fontSize: 14,
              padding: "8px 22px",
              background: c.primary,
              color: c.onPrimary,
              border: "none",
              borderRadius: 8,
              cursor: sending ? "default" : "pointer",
              opacity: sending ? 0.6 : 1,
            }}
          >
            {sending ? t("Gönderiliyor…") : t("Gönder")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
