import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TURKIYE_ILLERI, ilSayimi, potansiyelMusteriMi, type Party } from "@projelio/shared";
import { api } from "../../api/client";
import { partyApi } from "../../api/party";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";
import { TURKIYE_IL_YOLLARI, TURKIYE_VIEWBOX } from "../../lib/harita/turkiyeIlYollari";
import { Sayi, SekmeCipleri, SonListe } from "./gorselOzet";
import { PartyListesi } from "./ModulSekmeKartlari";

type Katman = "musteri" | "baglanti";
/** Kartın üstündeki sekmeler: harita ya da modülün listelerinden biri (kullanıcı isteği, 2026-11-09). */
type Sekme = "harita" | "musteriler" | "potansiyel" | "baglantilar";

/**
 * Müşterilerin ve bağlantıların il il dağılımı, ayrı katmanlar hâlinde: rakip ya
 * da fuar kişisi müşteri sayılmasın. Tam harita (ilçeler, liste) modülün içinde,
 * karttaki haritaya tıklayınca doğrudan o açılır (?harita=1, bkz. CustomersPanel);
 * bir ile tıklanınca o ilin ilçe görünümü açılır (&il=<plaka>). Üzerine gelince
 * ilin adı ve sayısı imlecin yanında yazar — <title> geç çıkıyor, dokunmatikte hiç.
 *
 * Hangi modül açıksa onun hedefi gelir; yalnızca biri açıksa düğme çıkmaz.
 * Ayrı dosya ve tembel yükleniyor: 81 ilin yolları ana pakete binmesin.
 */
export default function MusteriHaritaOzeti({ organizationId, musteriHedefi, baglantiHedefi }: { organizationId: string; musteriHedefi?: string; baglantiHedefi?: string }) {
  const c = useThemeColors();
  const t = useT();
  const gezin = useNavigate();
  const kap = useRef<HTMLDivElement>(null);
  const [uzerinde, setUzerinde] = useState<{ plaka: number; x: number; y: number } | null>(null);
  const [sekme, setSekme] = useState<Sekme>("harita");
  const [kayitlar, setKayitlar] = useState<Record<Katman, Party[] | null>>({ musteri: null, baglanti: null });
  const [secili, setSecili] = useState<Katman>(musteriHedefi ? "musteri" : "baglanti");
  const musteriVar = Boolean(musteriHedefi);
  const baglantiVar = Boolean(baglantiHedefi);

  useEffect(() => {
    let iptal = false;
    const yaz = (katman: Katman, liste: Party[]) => {
      if (!iptal) setKayitlar((o) => ({ ...o, [katman]: liste.filter((p) => !p.archivedAt) }));
    };
    if (musteriVar) {
      api
        .get<Party[]>(`/organizations/${organizationId}/party`)
        .then((l) => yaz("musteri", l))
        .catch(() => yaz("musteri", []));
    }
    if (baglantiVar) {
      partyApi
        .baglantilarim(`/organizations/${organizationId}`)
        .then((s) => yaz("baglanti", s.baglantilar))
        .catch(() => yaz("baglanti", []));
    }
    return () => {
      iptal = true;
    };
  }, [organizationId, musteriVar, baglantiVar]);

  const katmanlar = [
    { key: "musteri" as const, ad: t("Müşteriler"), hedef: musteriHedefi, renk: c.accent },
    { key: "baglanti" as const, ad: t("Bağlantılar"), hedef: baglantiHedefi, renk: c.primary },
  ].filter((k) => k.hedef);
  const aktif = katmanlar.find((k) => k.key === secili) ?? katmanlar[0];
  const liste = aktif ? kayitlar[aktif.key] : null;
  const haritaAdresi = `${aktif?.hedef ?? ""}?harita=1`;
  const ilAdresi = (plaka: number) => `${haritaAdresi}&il=${plaka}`;

  const { il } = ilSayimi(liste ?? [], (p) => p.address?.city);
  const enCokIller = [...il.entries()].sort((a, b) => b[1] - a[1]);
  // Dağılım çarpık (İstanbul yüzlerce, çoğu il bir-iki): doğrusal ölçek diğer
  // illeri aynı açık tona boğardı, bu yüzden logaritmik.
  const dolgu = (n: number) => (n === 0 ? c.border : `color-mix(in srgb, ${aktif?.renk ?? c.accent} ${Math.min(100, 32 + Math.log2(n) * 14)}%, ${c.surface})`);

  const musteriKartlari = kayitlar.musteri?.filter((p) => !potansiyelMusteriMi(p));
  const potansiyelKartlari = kayitlar.musteri?.filter(potansiyelMusteriMi);
  const sekmeler: { id: Sekme; ad: string; sayi?: number }[] = [
    { id: "harita", ad: t("Harita") },
    ...(musteriVar
      ? [
          { id: "musteriler" as const, ad: t("Müşteriler"), sayi: musteriKartlari?.length },
          { id: "potansiyel" as const, ad: t("Potansiyel"), sayi: potansiyelKartlari?.length },
        ]
      : []),
    ...(baglantiVar ? [{ id: "baglantilar" as const, ad: t("Bağlantılar"), sayi: kayitlar.baglanti?.length }] : []),
  ];
  const listeSekmesi =
    sekme === "musteriler"
      ? { kartlar: musteriKartlari, hedef: `${musteriHedefi}?sekme=musteriler`, bos: t("Henüz müşteri yok.") }
      : sekme === "potansiyel"
        ? { kartlar: potansiyelKartlari, hedef: `${musteriHedefi}?sekme=potansiyel`, bos: t("Potansiyel müşteri yok.") }
        : sekme === "baglantilar"
          ? { kartlar: kayitlar.baglanti ?? undefined, hedef: baglantiHedefi ?? "", bos: t("Bu listede bağlantı yok.") }
          : null;

  return (
    <>
      <SekmeCipleri etiket={t("Modül sekmeleri")} secili={sekme} onSec={setSekme} sekmeler={sekmeler} />
      {listeSekmesi ? (
        <PartyListesi kartlar={listeSekmesi.kartlar} hedef={listeSekmesi.hedef} bos={listeSekmesi.bos} />
      ) : (
        <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <Sayi>{liste ? liste.length.toLocaleString() : "–"}</Sayi>
        {katmanlar.length > 1 && (
          <div className="no-drag" style={{ display: "flex", gap: 4 }}>
            {katmanlar.map((k) => {
              const secik = k.key === aktif?.key;
              return (
                <button key={k.key} type="button" aria-pressed={secik} onClick={() => setSecili(k.key)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 9px", borderRadius: 999, border: `1px solid ${secik ? k.renk : c.border}`, background: "transparent", color: secik ? c.textPrimary : c.textSecondary, fontSize: 13, whiteSpace: "nowrap" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: k.renk }} />
                  {k.ad}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div
        ref={kap}
        role="link"
        tabIndex={0}
        title={uzerinde ? undefined : t("Haritada aç")}
        onClick={() => gezin(haritaAdresi)}
        onKeyDown={(e) => {
          if (e.key === "Enter") gezin(haritaAdresi);
        }}
        onMouseLeave={() => setUzerinde(null)}
        style={{ position: "relative", display: "block", flex: 1, minHeight: 120, maxHeight: 190, margin: "8px 0 2px", cursor: "pointer" }}
      >
        <svg viewBox={TURKIYE_VIEWBOX} width="100%" height="100%" role="img" aria-label={aktif?.ad}>
          {TURKIYE_IL_YOLLARI.map(([plaka, d]) => {
            const n = il.get(plaka) ?? 0;
            const secik = uzerinde?.plaka === plaka;
            return (
              <path
                key={plaka}
                d={d}
                fill={dolgu(n)}
                stroke={secik ? c.textPrimary : c.surface}
                strokeWidth={secik ? 1.6 : 0.8}
                strokeLinejoin="round"
                onMouseMove={(e) => {
                  const r = kap.current?.getBoundingClientRect();
                  if (r) setUzerinde({ plaka, x: e.clientX - r.left, y: e.clientY - r.top });
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  gezin(ilAdresi(plaka));
                }}
              />
            );
          })}
        </svg>
        {uzerinde && kap.current && (
          <div
            style={{
              position: "absolute",
              // Sağ kenara yakınsa ipucu imlecin soluna geçer, kartın dışına taşmasın.
              ...(uzerinde.x > kap.current.clientWidth - 130 ? { right: kap.current.clientWidth - uzerinde.x + 10 } : { left: uzerinde.x + 12 }),
              top: Math.max(0, uzerinde.y - 40),
              pointerEvents: "none",
              padding: "5px 9px",
              borderRadius: 8,
              background: c.surface,
              border: `1px solid ${c.border}`,
              boxShadow: "0 4px 14px rgba(0,0,0,0.12)",
              fontSize: 12,
              whiteSpace: "nowrap",
              zIndex: 2,
            }}
          >
            <div style={{ fontWeight: 600, color: c.textPrimary }}>{TURKIYE_ILLERI[uzerinde.plaka - 1].ad}</div>
            <div style={{ color: c.textSecondary }}>
              {aktif?.key === "baglanti" ? t("{n} bağlantı", { n: il.get(uzerinde.plaka) ?? 0 }) : t("{n} müşteri", { n: il.get(uzerinde.plaka) ?? 0 })}
            </div>
          </div>
        )}
      </div>
      <SonListe ogeler={enCokIller.map(([plaka, n]) => ({ id: String(plaka), ad: TURKIYE_ILLERI[plaka - 1].ad, sag: String(n), hedef: ilAdresi(plaka) }))} />
        </>
      )}
    </>
  );
}
