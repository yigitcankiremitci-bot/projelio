import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Organization } from "@projelio/shared";
import { api } from "../../api/client";
import { sirketIpucuKarari, type SirketIpucuKaydi } from "../../lib/sirketIpucu";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";
import { IconBuilding, IconPlus, IconUser, IconX } from "../icons";

const IPUCU_ANAHTARI = "projelio_sirket_ipucu";

function ipucuOku(): SirketIpucuKaydi {
  try {
    return JSON.parse(localStorage.getItem(IPUCU_ANAHTARI) ?? "{}");
  } catch {
    return {};
  }
}

function ipucuYaz(kayit: SirketIpucuKaydi) {
  try {
    localStorage.setItem(IPUCU_ANAHTARI, JSON.stringify(kayit));
  } catch {
    // Depolama kapalıysa düğme yalnızca bu oturumda kapanır.
  }
}

/**
 * Üstteki Ben / Şirket geçişi. Kişisel pano ile şirket panosu ayrı adreslerde
 * ama aynı yer gibi hissettirmeli: başlık yerine bu duruyor.
 *
 * "Ben" adresi gorunum=ben taşır, çünkü şirket sahibini "/" kendi şirketine
 * yönlendiriyor (bkz. Dashboard redirectTo).
 */
export default function GorunumSecici({ aktif, isSayisi = 0 }: { aktif: string; isSayisi?: number }) {
  const c = useThemeColors();
  const t = useT();
  const [sirketler, setSirketler] = useState<Organization[] | null>(null);
  const [ipucu, setIpucu] = useState(false);

  useEffect(() => {
    let iptal = false;
    api
      .get<Organization[]>("/organizations")
      .then((liste) => {
        if (!iptal) setSirketler(liste);
      })
      .catch(() => {
        if (!iptal) setSirketler(null);
      });
    return () => {
      iptal = true;
    };
  }, []);

  useEffect(() => {
    // Liste okunamadıysa davet çıkmaz: şirketi olan kişiye "kur" denmesin.
    if (!sirketler) return;
    const karar = sirketIpucuKarari({ sirketSayisi: sirketler.length, isSayisi, kayit: ipucuOku(), simdi: Date.now() });
    ipucuYaz(karar.kayit);
    setIpucu(karar.goster);
  }, [sirketler, isSayisi]);

  const hap = (secili: boolean): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    height: 36,
    padding: "0 13px",
    borderRadius: 18,
    border: `1px solid ${secili ? c.accent : c.border}`,
    background: secili ? c.surface : "transparent",
    color: secili ? c.textPrimary : c.textSecondary,
    fontSize: 14,
    whiteSpace: "nowrap",
    flexShrink: 0,
    maxWidth: 190,
  });
  const secenek = (to: string, kimlik: string, ad: string, Icon: typeof IconUser): ReactNode => (
    <Link key={kimlik} to={to} aria-current={aktif === kimlik ? "page" : undefined} style={hap(aktif === kimlik)}>
      <Icon size={15} color={aktif === kimlik ? c.accentDark : c.textSecondary} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{ad}</span>
    </Link>
  );

  return (
    <nav aria-label={t("Görünüm")} style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, overflowX: "auto", scrollbarWidth: "none" }}>
      {secenek("/?gorunum=ben", "ben", t("Ben"), IconUser)}
      {(sirketler ?? []).map((s) => secenek(`/organizations/${s.id}`, s.id, s.name, IconBuilding))}
      {ipucu && (
        <span style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
          <Link to="/organizations" aria-label={t("Şirket kur")} title={t("Şirket kur")} style={{ width: 36, height: 36, borderRadius: "50%", border: `1px solid ${c.accent}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <IconPlus size={17} color={c.accentDark} />
          </Link>
          <button
            type="button"
            aria-label={t("Kapat")}
            title={t("Kapat")}
            onClick={() => {
              ipucuYaz({ ...ipucuOku(), kapandi: Date.now() });
              setIpucu(false);
            }}
            style={{ width: 26, height: 26, padding: 0, border: "none", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <IconX size={13} color={c.textSecondary} />
          </button>
        </span>
      )}
    </nav>
  );
}
