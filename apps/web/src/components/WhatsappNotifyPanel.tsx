import { useState } from "react";
import type { WhatsappLinkCode, WhatsappOrganizationView } from "@projelio/shared";
import { whatsappApi } from "../api/whatsapp";
import { useThemeColors } from "../theme/useThemeColors";

/**
 * Kullanıcının kendi WhatsApp bildirim paneli.
 *
 * Akış tersine kurulu: ilk mesajı kullanıcı atar. Kod alır, wa.me
 * bağlantısına tıklar, hazır gelen "PROJELIO-XXXX" mesajını gönderir; sunucu
 * kodu tanıyıp numarayı hesaba bağlar. Neden biz yazmıyoruz: WhatsApp'ın
 * tanımadığı kişiye yazma kısıtı ve ban riski (docs/whatsapp-qr-plan.md §5.3).
 */
export default function WhatsappNotifyPanel({
  org,
  onChanged,
}: {
  org: WhatsappOrganizationView;
  onChanged: () => void;
}) {
  const c = useThemeColors();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState<WhatsappLinkCode | null>(null);

  const state = org.me.optInState;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e: any) {
      setError(e?.message ?? "İşlem başarısız.");
    } finally {
      setBusy(false);
    }
  };

  const primaryButton = {
    padding: "9px 16px",
    borderRadius: 9,
    border: "none",
    background: c.primary,
    color: c.onPrimary,
    fontSize: 15,
    fontWeight: 500,
    cursor: busy ? "wait" : "pointer",
    textDecoration: "none",
    display: "inline-block",
  } as const;

  const ghostButton = {
    padding: "8px 14px",
    borderRadius: 8,
    border: `1px solid ${c.border}`,
    background: "transparent",
    fontSize: 15,
    cursor: "pointer",
  } as const;

  if (state === "opted_in") {
    return (
      <div>
        <div style={{ fontSize: 15, color: c.textPrimary, marginBottom: 8 }}>
          Bildirimleriniz <strong style={{ fontWeight: 500 }}>{org.me.phoneMasked}</strong> numarasına gidiyor.
        </div>
        <button
          onClick={() =>
            run(async () => {
              await whatsappApi.optOut(org.organizationId);
              onChanged();
            })
          }
          disabled={busy}
          style={{ ...ghostButton, color: c.danger }}
        >
          Bildirimleri durdur
        </button>
        {error && <p style={{ fontSize: 14, color: c.danger, margin: "8px 0 0" }}>{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <p style={{ fontSize: 15, color: c.textSecondary, margin: "0 0 12px", lineHeight: 1.5 }}>
        {state === "opted_out"
          ? "WhatsApp bildirimleriniz durdurulmuş. Yeniden açmak için kod alıp numaraya gönderin ya da WhatsApp'tan BAŞLAT yazın."
          : "Bildirimleri WhatsApp'tan almak için bir kod alın ve aşağıdaki bağlantıyla organizasyonun numarasına gönderin. Numaranız bu mesajla eşleşir."}
      </p>

      {link ? (
        <div>
          <div style={{ fontSize: 20, fontWeight: 500, letterSpacing: 2, color: c.textPrimary, marginBottom: 10 }}>{link.code}</div>
          <a href={link.url} target="_blank" rel="noreferrer" style={primaryButton}>
            WhatsApp'ta gönder
          </a>
          <p style={{ fontSize: 14, color: c.textSecondary, margin: "10px 0 0", lineHeight: 1.5 }}>
            Bağlantı telefonunuzda ya da WhatsApp Web'de açılır; mesaj hazır yazılı gelir, yalnızca gönderin. Gönderdikten
            sonra bu sayfa kendiliğinden güncellenir. Kod {new Date(link.expiresAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}'e kadar geçerli.
          </p>
        </div>
      ) : (
        <button
          onClick={() => run(async () => setLink(await whatsappApi.linkCode(org.organizationId)))}
          disabled={busy}
          style={primaryButton}
        >
          {busy ? "Kod alınıyor…" : "Kod al"}
        </button>
      )}

      {error && <p style={{ fontSize: 14, color: c.danger, margin: "8px 0 0" }}>{error}</p>}
    </div>
  );
}
