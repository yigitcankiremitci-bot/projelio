import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { MailAccount } from "@projelio/shared";
import { mailboxApi } from "../api/mailbox";
import { useThemeColors } from "../theme/useThemeColors";
import Modal from "./Modal";
import ProjelioYeniEpostaModal from "./ProjelioYeniEpostaModal";
import { useT } from "../lib/i18n";

type Kutu = MailAccount & { link?: string; scopeName?: string };

interface Props {
  /** Alıcı adresi (müşteri, bağlantı ya da kartındaki kişi). */
  to: string;
  /** Alıcının adı — yalnızca pencere başlığında. */
  ad?: string;
  onClose: () => void;
}

/**
 * Kişi kartındaki "E-posta gönder": nereden gönderileceğini sorar.
 *
 * Önceden simge doğrudan `mailto:` idi ve bilgisayardaki e-posta uygulamasını
 * açıyordu; şirketin @projelio.app kutusu varken yazışma Projelio dışında
 * kalıyor, ekip göremiyordu. Artık önce Projelio kutuları, sonra Gmail ve
 * cihazın kendi uygulaması.
 *
 * Projelio kutusu seçilince E-posta modülüne gidilir ve alıcısı dolu "Yeni
 * e-posta" penceresi orada açılır (MailboxPanel `?yeniEposta=` okur) — yazılan
 * e-posta kutunun Gönderilenler'inde kalsın, yanıt da aynı yere düşsün.
 * Kutunun açılacak bir modül sayfası yoksa (departmansız şirket kutusu)
 * pencere burada açılır.
 */
export default function EpostaGonderSecimi({ to, ad, onClose }: Props) {
  const c = useThemeColors();
  const t = useT();
  const navigate = useNavigate();
  const [kutular, setKutular] = useState<Kutu[] | null>(null);
  const [yerinde, setYerinde] = useState<Kutu | null>(null);

  useEffect(() => {
    mailboxApi
      .myAccounts()
      .then(setKutular)
      .catch(() => setKutular([]));
  }, []);

  const kutuSec = (k: Kutu) => {
    if (!k.link) {
      setYerinde(k);
      return;
    }
    onClose();
    navigate(`${k.link}?yeniEposta=${encodeURIComponent(to)}&kutu=${encodeURIComponent(k.id)}`);
  };

  if (yerinde) {
    return (
      <ProjelioYeniEpostaModal
        account={yerinde}
        initialTo={to}
        onClose={onClose}
        onSent={() => onClose()}
      />
    );
  }

  const secenek = {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 2,
    width: "100%",
    textAlign: "left",
    padding: "10px 12px",
    borderRadius: 10,
    border: `1px solid ${c.border}`,
    background: "transparent",
    color: c.textPrimary,
    cursor: "pointer",
    fontFamily: "inherit",
    textDecoration: "none",
    boxSizing: "border-box",
  } as const;
  const altYazi = { fontSize: 12, color: c.textSecondary } as const;

  return (
    <Modal title={t("E-postayı nereden göndermek istersiniz?")} subtitle={ad ? `${ad} · ${to}` : to} onClose={onClose} maxWidth={480}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {kutular === null && <span style={altYazi}>{t("Kutular yükleniyor…")}</span>}

        {kutular?.map((k) => (
          <button key={k.id} type="button" onClick={() => kutuSec(k)} style={{ ...secenek, borderColor: c.accent }}>
            <span style={{ fontSize: 14 }}>
              {t("Projelio E-posta modülünden")} · <strong>{k.address}</strong>
            </span>
            <span style={altYazi}>
              {k.scopeName ? `${k.scopeName} · ` : ""}
              {t("Yazışma modülde kalır, ekip görür; yanıt aynı kutuya düşer.")}
            </span>
          </button>
        ))}

        <a
          href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}`}
          target="_blank"
          rel="noreferrer"
          onClick={onClose}
          style={secenek}
        >
          <span style={{ fontSize: 14 }}>{t("Gmail'de aç")}</span>
          <span style={altYazi}>{t("Tarayıcıda Gmail'in yeni e-posta penceresi açılır.")}</span>
        </a>

        <a href={`mailto:${to}`} onClick={onClose} style={secenek}>
          <span style={{ fontSize: 14 }}>{t("Bilgisayarımdaki e-posta uygulaması")}</span>
          <span style={altYazi}>{t("Outlook, Apple Mail ya da cihazınızın varsayılan uygulaması.")}</span>
        </a>

        {kutular !== null && kutular.length === 0 && (
          <span style={altYazi}>
            {t("Erişebildiğiniz bir @projelio.app kutusu yok. Kutuyu Projelio yöneticisi E-posta modülünde açar.")}
          </span>
        )}
      </div>
    </Modal>
  );
}
