import { useEffect, useMemo, useState } from "react";
import { kalanTutar, siparisDurumu, type MusteriSiparisi, type Party } from "@projelio/shared";
import { siparisApi } from "../../api/party";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";
import { fmtPara, fmtTarih } from "../butce/butceBicim";
import { bugunYerel } from "./siparisOrtak";

/**
 * Müşteri kartının açılır kısmının tepesindeki künye: kimlik, iletişim,
 * adres, vergi ve (Müşteriler'de) sipariş özeti.
 *
 * Önceden açılır kısım yalnızca not ve sekmelerden oluşuyordu; telefon, e-posta,
 * adres, web sitesi görmek için kartı düzenleme formunda açmak gerekiyordu
 * (kullanıcı isteği, 2026-10-20). Künye salt okunur: değiştirmek yine
 * Düzenle'den — iki ayrı düzenleme kapısı olmasın.
 *
 * Boş alan gösterilmez ("Telefon: —" satırları künyeyi şişirir); hiçbir
 * iletişim bilgisi yoksa bunu söyleyen tek satır çıkar.
 */
export default function MusteriKunyesi({ party, siparisOzetiGoster }: { party: Party; siparisOzetiGoster: boolean }) {
  const c = useThemeColors();
  const t = useT();

  const [siparisler, setSiparisler] = useState<MusteriSiparisi[] | null>(null);
  useEffect(() => {
    if (!siparisOzetiGoster) return;
    let iptal = false;
    siparisApi
      .musterininkiler(party.id)
      .then((l) => !iptal && setSiparisler(l))
      .catch(() => !iptal && setSiparisler(null));
    return () => {
      iptal = true;
    };
  }, [party.id, siparisOzetiGoster]);

  // Para birimi başına (kur dönüşümü yok, bkz. butceToplama.ts).
  const ozet = useMemo(() => {
    if (!siparisler || siparisler.length === 0) return null;
    const bugun = bugunYerel();
    const para = new Map<string, { toplam: number; kalan: number; geciken: number }>();
    for (const s of siparisler) {
      const k = para.get(s.paraBirimi) ?? { toplam: 0, kalan: 0, geciken: 0 };
      k.toplam += Number(s.tutar);
      const kalan = kalanTutar(s);
      k.kalan += kalan;
      if (kalan > 0 && siparisDurumu(s, bugun) === "gecikti") k.geciken += kalan;
      para.set(s.paraBirimi, k);
    }
    const son = siparisler.reduce((a, s) => (s.siparisTarihi > a ? s.siparisTarihi : a), "");
    return { sayi: siparisler.length, son, para: Array.from(para.entries()) };
  }, [siparisler]);

  const adres = party.address;
  const sehir = [adres?.district, adres?.city].filter(Boolean).join(" / ");
  const acikAdres = [adres?.line, adres?.postalCode, adres?.country && adres.country !== "TR" ? adres.country : undefined]
    .filter(Boolean)
    .join(", ");
  const webAdresi = party.website?.trim();
  const webHref = webAdresi && !/\s/.test(webAdresi) ? (/^https?:\/\//i.test(webAdresi) ? webAdresi : `https://${webAdresi}`) : undefined;
  const telHref = party.phone ? `tel:${party.phone.replace(/[^\d+]/g, "")}` : undefined;

  const alanlar: { etiket: string; deger: string; href?: string; simge: JSX.Element }[] = [];
  if (party.phone) alanlar.push({ etiket: t("Telefon"), deger: party.phone, href: telHref, simge: <SimgeTelefon /> });
  if (party.email) alanlar.push({ etiket: t("E-posta"), deger: party.email, href: `mailto:${party.email}`, simge: <SimgePosta /> });
  if (webAdresi) alanlar.push({ etiket: t("Web sitesi"), deger: webAdresi.replace(/^https?:\/\//i, "").replace(/\/$/, ""), href: webHref, simge: <SimgeKure /> });
  if (sehir) alanlar.push({ etiket: t("Şehir"), deger: sehir, simge: <SimgeKonum /> });
  if (acikAdres) alanlar.push({ etiket: t("Adres"), deger: acikAdres, simge: <SimgeEv /> });
  if (party.taxNumber || party.taxOffice) {
    alanlar.push({
      etiket: t("Vergi"),
      deger: [party.taxOffice, party.taxNumber].filter(Boolean).join(" · "),
      simge: <SimgeBelge />,
    });
  }
  if (party.partyType === "person" && (party.kurum || party.unvan)) {
    alanlar.push({ etiket: t("Kurum"), deger: [party.unvan, party.kurum].filter(Boolean).join(" · "), simge: <SimgeBina /> });
  }

  const altBilgi = [
    party.ownerName ? t("Sorumlu: {ad}", { ad: party.ownerName }) : undefined,
    party.source ? t("Kaynak: {kaynak}", { kaynak: party.source }) : undefined,
    party.createdAt ? t("Eklendi: {tarih}", { tarih: fmtTarih(party.createdAt.slice(0, 10)) }) : undefined,
    party.lastActivityAt ? t("Son hareket: {tarih}", { tarih: fmtTarih(party.lastActivityAt.slice(0, 10)) }) : undefined,
  ].filter(Boolean);

  const basHarfler = party.displayName
    .split(/\s+/)
    .filter((w) => /\p{L}/u.test(w))
    .slice(0, 2)
    .map((w) => w.charAt(0).toLocaleUpperCase("tr"))
    .join("");

  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 14,
        borderRadius: 10,
        background: c.surface,
        border: `1px solid ${c.border}`,
        borderLeft: `3px solid ${c.accent}`,
        boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <span
          aria-hidden
          style={{
            width: 40,
            height: 40,
            borderRadius: 999,
            background: c.accent,
            color: c.onPrimary,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 15,
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          {basHarfler || "?"}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: c.textPrimary, overflowWrap: "anywhere" }}>{party.displayName}</div>
          {party.legalName && party.legalName !== party.displayName && (
            <div style={{ fontSize: 12, color: c.textSecondary, overflowWrap: "anywhere" }}>{party.legalName}</div>
          )}
        </div>
      </div>

      {alanlar.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: "10px 16px" }}>
          {alanlar.map((a) => (
            <div key={a.etiket} style={{ display: "flex", gap: 8, alignItems: "flex-start", minWidth: 0 }}>
              <span style={{ color: c.accent, flexShrink: 0, marginTop: 2, display: "inline-flex" }}>{a.simge}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, color: c.textSecondary }}>{a.etiket}</div>
                {a.href ? (
                  <a
                    href={a.href}
                    target={a.href.startsWith("http") ? "_blank" : undefined}
                    rel={a.href.startsWith("http") ? "noopener noreferrer" : undefined}
                    style={{ fontSize: 13, color: c.primary, textDecoration: "none", overflowWrap: "anywhere" }}
                  >
                    {a.deger}
                  </a>
                ) : (
                  <div style={{ fontSize: 13, color: c.textPrimary, overflowWrap: "anywhere" }}>{a.deger}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <span style={{ fontSize: 12, color: c.textSecondary }}>
          {t("Telefon, e-posta ya da adres girilmemiş. Düzenle ile ekleyebilirsin.")}
        </span>
      )}

      {ozet && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <OzetKutusu etiket={t("Sipariş")} deger={String(ozet.sayi)} />
          {ozet.para.map(([para, k]) => (
            <OzetKutusu key={`t${para}`} etiket={t("Toplam satış")} deger={fmtPara(k.toplam, para)} />
          ))}
          {ozet.para
            .filter(([, k]) => k.kalan >= 0.01)
            .map(([para, k]) => (
              <OzetKutusu
                key={`k${para}`}
                etiket={t("Açık alacak")}
                deger={fmtPara(k.kalan, para)}
                renk={k.geciken >= 0.01 ? c.danger : undefined}
              />
            ))}
          {ozet.son && <OzetKutusu etiket={t("Son sipariş")} deger={fmtTarih(ozet.son)} />}
        </div>
      )}

      {altBilgi.length > 0 && (
        <div style={{ fontSize: 11, color: c.textSecondary, display: "flex", flexWrap: "wrap", gap: "2px 12px" }}>
          {altBilgi.map((x) => (
            <span key={x}>{x}</span>
          ))}
        </div>
      )}
    </section>
  );
}

function OzetKutusu({ etiket, deger, renk }: { etiket: string; deger: string; renk?: string }) {
  const c = useThemeColors();
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        padding: "6px 12px",
        borderRadius: 8,
        background: c.background,
        border: `1px solid ${c.border}`,
        minWidth: 96,
      }}
    >
      <span style={{ fontSize: 11, color: c.textSecondary }}>{etiket}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: renk ?? c.textPrimary }}>{deger}</span>
    </div>
  );
}

// Künyenin küçük simgeleri — yalnızca burada kullanılıyor, icons.tsx'i şişirmesin.
const svg = (children: JSX.Element | JSX.Element[]) => (
  <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);
const SimgeTelefon = () =>
  svg(<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />);
const SimgePosta = () => svg([<rect key="r" x="3" y="5" width="18" height="14" rx="2" />, <path key="p" d="m3 7 9 6 9-6" />]);
const SimgeKure = () =>
  svg([<circle key="c" cx="12" cy="12" r="9" />, <path key="p" d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />]);
const SimgeKonum = () => svg([<path key="p" d="M12 21s-7-6.3-7-11a7 7 0 0 1 14 0c0 4.7-7 11-7 11z" />, <circle key="c" cx="12" cy="10" r="2.5" />]);
const SimgeEv = () => svg([<path key="a" d="M3 10.5 12 3l9 7.5" />, <path key="b" d="M5 9.5V21h14V9.5" />]);
const SimgeBelge = () => svg([<path key="a" d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" />, <path key="b" d="M14 3v5h5M8 13h8M8 17h5" />]);
const SimgeBina = () => svg([<rect key="a" x="4" y="3" width="16" height="18" rx="1" />, <path key="b" d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" />]);
