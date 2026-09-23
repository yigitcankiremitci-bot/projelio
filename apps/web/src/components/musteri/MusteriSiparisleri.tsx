import { useEffect, useMemo, useState } from "react";
import { kalanTutar, siparisDurumu, type MusteriSiparisi, type Party } from "@projelio/shared";
import { siparisApi } from "../../api/party";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";
import { fmtPara } from "../butce/butceBicim";
import SiparisFormu from "./SiparisFormu";
import SiparisKarti from "./SiparisKarti";
import { bugunYerel } from "./siparisOrtak";

/**
 * Müşteri kartının "Siparişler" sekmesi: bu müşterinin siparişleri, açık
 * alacağı ve yeni sipariş. Veriyi kendisi yükler; sekme sayısı için
 * yukarıya `onSayi` ile bildirir.
 */
export default function MusteriSiparisleri({
  party,
  yazabilir,
  onSayi,
}: {
  party: Party;
  yazabilir: boolean;
  onSayi?: (n: number) => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const [siparisler, setSiparisler] = useState<MusteriSiparisi[] | null>(null);
  const [hata, setHata] = useState("");
  const [yeni, setYeni] = useState(false);

  useEffect(() => {
    let iptal = false;
    siparisApi
      .musterininkiler(party.id)
      .then((s) => !iptal && setSiparisler(s))
      .catch((err) => {
        if (iptal) return;
        setSiparisler([]);
        setHata(err instanceof Error ? err.message : t("Yüklenemedi"));
      });
    return () => {
      iptal = true;
    };
  }, [party.id]);

  useEffect(() => {
    if (siparisler) onSayi?.(siparisler.length);
  }, [siparisler?.length]);

  // Açık alacak para birimi başına: kur dönüşümü yok (bkz. butceToplama.ts).
  const acikAlacak = useMemo(() => {
    const m = new Map<string, { kalan: number; geciken: number }>();
    const bugun = bugunYerel();
    for (const s of siparisler ?? []) {
      const kalan = kalanTutar(s);
      if (kalan <= 0) continue;
      const k = m.get(s.paraBirimi) ?? { kalan: 0, geciken: 0 };
      k.kalan += kalan;
      if (siparisDurumu(s, bugun) === "gecikti") k.geciken += kalan;
      m.set(s.paraBirimi, k);
    }
    return Array.from(m.entries());
  }, [siparisler]);

  const degisti = (s: MusteriSiparisi) => setSiparisler((l) => (l ?? []).map((x) => (x.id === s.id ? s : x)));

  if (!siparisler) return <p style={{ fontSize: 12, color: c.textSecondary, margin: 0 }}>{t("Yükleniyor…")}</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {acikAlacak.length > 0 && (
        <div style={{ fontSize: 12, color: c.textSecondary, display: "flex", flexWrap: "wrap", gap: "2px 12px" }}>
          {acikAlacak.map(([para, v]) => (
            <span key={para}>
              {t("Açık alacak: {tutar}", { tutar: fmtPara(v.kalan, para) })}
              {v.geciken > 0 && (
                <span style={{ color: c.danger }}> · {t("{tutar} gecikmiş", { tutar: fmtPara(v.geciken, para) })}</span>
              )}
            </span>
          ))}
        </div>
      )}

      {yeni ? (
        <SiparisFormu
          partyId={party.id}
          onKaydedildi={(s) => {
            setYeni(false);
            setSiparisler((l) => [s, ...(l ?? [])]);
          }}
          onVazgec={() => setYeni(false)}
        />
      ) : (
        yazabilir && (
          <button
            onClick={() => setYeni(true)}
            style={{ alignSelf: "flex-start", fontSize: 12, color: c.primary, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
          >
            {t("+ Sipariş ekle")}
          </button>
        )
      )}

      {hata && <p style={{ color: c.danger, fontSize: 12, margin: 0 }}>{hata}</p>}
      {siparisler.length === 0 && !yeni ? (
        <p style={{ fontSize: 12, color: c.textSecondary, margin: 0 }}>{t("Henüz sipariş yok.")}</p>
      ) : (
        siparisler.map((s) => (
          <SiparisKarti
            key={s.id}
            siparis={s}
            yazabilir={yazabilir}
            onDegisti={degisti}
            onSilindi={(id) => setSiparisler((l) => (l ?? []).filter((x) => x.id !== id))}
          />
        ))
      )}
    </div>
  );
}
