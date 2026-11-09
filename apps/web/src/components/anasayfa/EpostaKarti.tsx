import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { MailAccount, MailMessage, MailMessageDetail } from "@projelio/shared";
import { mailboxApi } from "../../api/mailbox";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";
import { bicimDili } from "../../lib/i18n/depo";
import { IconEdit } from "../icons";
import MailMessageModal from "../MailMessageModal";
import ProjelioYeniEpostaModal from "../ProjelioYeniEpostaModal";
import { Sayi, ozetRengi } from "./gorselOzet";

/** Anasayfa her açıldığında Graph'a gidiyor: çok kutulu şirkette kart siteyi yavaşlatmasın. */
const KUTU_TAVANI = 3;

type Satir = MailMessage & { hesap: MailAccount };

function saat(iso: string): string {
  const tarih = new Date(iso);
  const bugunMu = tarih.toDateString() === new Date().toDateString();
  return bugunMu
    ? tarih.toLocaleTimeString(bicimDili(), { hour: "2-digit", minute: "2-digit" })
    : tarih.toLocaleDateString(bicimDili(), { day: "numeric", month: "short" });
}

/**
 * Gelen kutusu özeti: oku ve yanıtla mevcut iletinin penceresinde, yeni e-posta
 * modülün kendi penceresinde açılır; ikinci bir yazma ekranı tutulmuyor.
 *
 * Yeni e-posta yalnızca @projelio.app kutusundan gönderilebiliyor (Outlook
 * kutularında sunucu yalnızca yanıtlamaya izin veriyor), düğme de ona bağlı.
 */
export default function EpostaKarti({ organizationId, hedef, adet }: { organizationId?: string; hedef: string; adet: number }) {
  const c = useThemeColors();
  const t = useT();
  const [hesaplar, setHesaplar] = useState<MailAccount[] | null>(null);
  const [satirlar, setSatirlar] = useState<Satir[]>([]);
  const [fazlasiVar, setFazlasiVar] = useState(false);
  const [okunan, setOkunan] = useState<{ hesap: MailAccount; ileti: MailMessageDetail } | null>(null);
  const [yaziliyor, setYaziliyor] = useState(false);

  const yukle = useCallback(async () => {
    const hepsi = await (organizationId ? mailboxApi.listAccounts({ organizationId }) : mailboxApi.myAccounts()).catch(() => [] as MailAccount[]);
    const etkin = hepsi.filter((h) => h.active && !h.connectionError);
    setHesaplar(etkin);
    const sayfalar = await Promise.all(
      etkin.slice(0, KUTU_TAVANI).map((hesap) =>
        mailboxApi
          .messages(hesap.id)
          .then((s) => ({ hesap, ...s }))
          .catch(() => ({ hesap, messages: [] as MailMessage[], hasMore: false }))
      )
    );
    setFazlasiVar(sayfalar.some((s) => s.hasMore));
    setSatirlar(sayfalar.flatMap((s) => s.messages.map((m) => ({ ...m, hesap: s.hesap }))).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)));
  }, [organizationId]);

  useEffect(() => {
    void yukle();
  }, [yukle]);

  const ac = async (s: Satir) => {
    try {
      const ileti = await mailboxApi.message(s.hesap.id, s.id);
      setOkunan({ hesap: s.hesap, ileti });
      if (!s.isRead) {
        setSatirlar((l) => l.map((x) => (x.id === s.id ? { ...x, isRead: true } : x)));
        mailboxApi.markRead(s.hesap.id, s.id, true).catch(() => {});
      }
    } catch {
      // Kutu o an yanıt vermediyse modül sayfasından açılabilir; kart bozulmasın.
    }
  };

  const yazmaKutusu = hesaplar?.find((h) => h.provider === "projelio");
  const okunmamis = satirlar.filter((s) => !s.isRead).length;

  if (hesaplar && hesaplar.length === 0) {
    return (
      <Link to={hedef} draggable={false} style={{ fontSize: 14, color: c.textSecondary }}>
        {t("E-posta kutusu bağla")}
      </Link>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span title={t("Okunmamış")}>
          <Sayi>
            {hesaplar ? okunmamis : "–"}
            {fazlasiVar && okunmamis > 0 ? "+" : ""}
          </Sayi>
        </span>
        {yazmaKutusu && (
          <button type="button" className="no-drag" onClick={() => setYaziliyor(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 999, border: "none", background: c.accent, color: c.surface, fontSize: 13 }}>
            <IconEdit size={14} color="currentColor" />
            {t("Yeni e-posta")}
          </button>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        {satirlar.slice(0, adet).map((s) => {
          const ad = s.from?.name || s.from?.address || "?";
          return (
            <button key={`${s.hesap.id}:${s.id}`} type="button" className="no-drag pano-satir" onClick={() => void ac(s)} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, width: "calc(100% + 8px)", border: "none", background: "transparent", textAlign: "left", paddingTop: 4, paddingBottom: 4 }}>
              <span style={{ width: 26, height: 26, borderRadius: "50%", flexShrink: 0, background: ozetRengi(ad), color: c.surface, fontSize: 12, fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {ad.trim().charAt(0).toLocaleUpperCase()}
              </span>
              <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: 13, fontWeight: s.isRead ? 400 : 600, color: c.textPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ad}</span>
                <span style={{ fontSize: 12, color: c.textSecondary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.subject}</span>
              </span>
              <span style={{ flexShrink: 0, fontSize: 12, color: c.textSecondary }}>{saat(s.receivedAt)}</span>
            </button>
          );
        })}
      </div>

      {okunan && (
        <MailMessageModal
          accountId={okunan.hesap.id}
          message={okunan.ileti}
          canWrite
          provider={okunan.hesap.provider}
          onClose={() => setOkunan(null)}
          onSent={() => setOkunan(null)}
          onChanged={() => void yukle()}
        />
      )}
      {yaziliyor && yazmaKutusu && (
        <ProjelioYeniEpostaModal
          account={yazmaKutusu}
          onClose={() => setYaziliyor(false)}
          onSent={() => {
            setYaziliyor(false);
            void yukle();
          }}
        />
      )}
    </div>
  );
}
