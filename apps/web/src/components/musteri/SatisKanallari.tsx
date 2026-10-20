import { useEffect, useState } from "react";
import { ODEME_YONTEMI_ETIKET, ODEME_YONTEMLERI, type OdemeYontemi, type SatisKanali, type SatisKanaliTuru } from "@projelio/shared";
import { kanalApi, type SatisKanaliGovdesi } from "../../api/party";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";
import { TAM_GENISLIK } from "./siparisOrtak";

// dil:anahtar-baslangic — etiketler; çeviri kullanım yerinde (t())
const TUR_ETIKET: Record<SatisKanaliTuru, string> = {
  pazaryeri: "Pazaryeri",
  web: "Kendi sitesi",
  eczane: "Eczane",
  doktor: "Doktor",
  bayi: "Bayi / dağıtıcı",
  diger: "Diğer",
};
// dil:anahtar-bitis
const TURLER = Object.keys(TUR_ETIKET) as SatisKanaliTuru[];

/**
 * Satış kanalları (yönetici): siparişin geldiği yer, varsayılan vadesi ve
 * ödeme yöntemi, müşterisiz siparişlerin sorumlusu.
 *
 * Silme YOK, pasife alma var: tek seferlik alıcının siparişi kanalına bağlı
 * yaşar (bkz. backend satis-kanallari.service.ts). Pasif kanal sipariş
 * formunda seçilmez ama geçmiş siparişlerde ve raporda durur.
 *
 * Varsayılan vadeyi değiştirmek mevcut siparişlerin vadesini DEĞİŞTİRMEZ:
 * o vade siparişin kendi koşulu, kanal yalnızca yeni siparişin başlangıcı.
 */
export default function SatisKanallari({
  kapsamYolu,
  sorumluSecenekleri,
  onDegisti,
}: {
  kapsamYolu: string;
  sorumluSecenekleri: { id: string; ad: string }[];
  onDegisti?: () => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const [kanallar, setKanallar] = useState<SatisKanali[] | null>(null);
  const [hata, setHata] = useState("");
  const [yeniAd, setYeniAd] = useState("");

  useEffect(() => {
    let iptal = false;
    kanalApi
      .liste(kapsamYolu)
      .then((l) => !iptal && setKanallar(l))
      .catch((err) => {
        if (iptal) return;
        setKanallar([]);
        setHata(err instanceof Error ? err.message : t("Yüklenemedi"));
      });
    return () => {
      iptal = true;
    };
  }, [kapsamYolu]);

  const guncelle = async (k: SatisKanali, govde: SatisKanaliGovdesi) => {
    setHata("");
    try {
      const y = await kanalApi.guncelle(k.id, govde);
      setKanallar((l) => (l ?? []).map((x) => (x.id === y.id ? y : x)));
      onDegisti?.();
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Kaydedilemedi"));
    }
  };

  const ekle = async () => {
    if (!yeniAd.trim()) return;
    setHata("");
    try {
      const y = await kanalApi.ekle(kapsamYolu, { ad: yeniAd.trim() });
      setKanallar((l) => [...(l ?? []), y]);
      setYeniAd("");
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Kaydedilemedi"));
    }
  };

  if (!kanallar) return <p style={{ fontSize: 12, color: c.textSecondary, margin: 0 }}>{t("Yükleniyor…")}</p>;

  // Seçicide listede olmayan mevcut sorumlu da görünsün (kaydetmek onu silmesin).
  const secenekler = (k: SatisKanali) =>
    k.sorumluUserId && !sorumluSecenekleri.some((s) => s.id === k.sorumluUserId)
      ? [...sorumluSecenekleri, { id: k.sorumluUserId, ad: k.sorumluAdi ?? t("İsimsiz") }]
      : sorumluSecenekleri;

  const hucre: React.CSSProperties = { padding: "4px 6px", verticalAlign: "middle" };

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 8, background: c.background, borderRadius: 10, padding: 10 }}>
      <h6 style={{ fontSize: 13, fontWeight: 500, color: c.textPrimary, margin: 0 }}>{t("Satış kanalları")}</h6>
      <span style={{ fontSize: 12, color: c.textSecondary }}>
        {t("Yeni siparişin vadesi ve ödeme yöntemi kanaldan gelir. Müşteri kartı olmayan tek seferlik alıcıların siparişleri kanalda toplanır; sorumlusu kanalın sorumlusudur.")}
      </span>
      {kanallar.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${c.border}`, color: c.textSecondary, textAlign: "left" }}>
                <th style={hucre}>{t("Kanal")}</th>
                <th style={hucre}>{t("Tür")}</th>
                <th style={hucre}>{t("Vade (gün)")}</th>
                <th style={hucre}>{t("Ödeme yöntemi")}</th>
                <th style={hucre}>{t("Sorumlu")}</th>
                <th style={hucre}>{t("Aktif")}</th>
              </tr>
            </thead>
            <tbody>
              {kanallar.map((k) => (
                <tr key={k.id} style={{ borderBottom: `1px solid ${c.border}`, opacity: k.aktif ? 1 : 0.6 }}>
                  <td style={hucre}>
                    <input
                      defaultValue={k.ad}
                      onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== k.ad && guncelle(k, { ad: e.target.value.trim() })}
                      style={{ ...TAM_GENISLIK, minWidth: 110 }}
                    />
                  </td>
                  <td style={hucre}>
                    <select value={k.tur} onChange={(e) => guncelle(k, { tur: e.target.value as SatisKanaliTuru })}>
                      {TURLER.map((x) => (
                        <option key={x} value={x}>
                          {t(TUR_ETIKET[x])}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={hucre}>
                    <input
                      type="number"
                      min={0}
                      defaultValue={k.varsayilanVadeGun}
                      onBlur={(e) => {
                        const gun = Math.max(0, Math.floor(Number(e.target.value) || 0));
                        if (gun !== k.varsayilanVadeGun) guncelle(k, { varsayilanVadeGun: gun });
                      }}
                      style={{ width: 64 }}
                    />
                  </td>
                  <td style={hucre}>
                    <select
                      value={k.varsayilanOdemeYontemi}
                      onChange={(e) => guncelle(k, { varsayilanOdemeYontemi: e.target.value as OdemeYontemi })}
                    >
                      {ODEME_YONTEMLERI.map((y) => (
                        <option key={y} value={y}>
                          {t(ODEME_YONTEMI_ETIKET[y])}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={hucre}>
                    <select value={k.sorumluUserId ?? ""} onChange={(e) => guncelle(k, { sorumluUserId: e.target.value || null })}>
                      <option value="">{t("Sorumlu yok")}</option>
                      {secenekler(k).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.ad}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={hucre}>
                    <input type="checkbox" checked={k.aktif} onChange={(e) => guncelle(k, { aktif: e.target.checked })} aria-label={t("Aktif")} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={yeniAd}
          onChange={(e) => setYeniAd(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ekle()}
          placeholder={t("Yeni kanal adı (ör. Trendyol)")}
          style={{ flex: 1, minWidth: 0 }}
        />
        <button
          onClick={ekle}
          disabled={!yeniAd.trim()}
          style={{ fontSize: 12, padding: "5px 12px", borderRadius: 8, border: "none", background: c.primary, color: c.onPrimary, cursor: "pointer" }}
        >
          {t("Ekle")}
        </button>
      </div>
      {hata && <p style={{ color: c.danger, fontSize: 12, margin: 0 }}>{hata}</p>}
    </section>
  );
}
