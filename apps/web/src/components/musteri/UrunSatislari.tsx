import { useEffect, useMemo, useState } from "react";
import { kalanTutar, tahsilEdilen, type MusteriSiparisListesi } from "@projelio/shared";
import { siparisApi } from "../../api/party";
import { ApiError } from "../../api/client";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";
import { fmtPara } from "../butce/butceBicim";
import SiparisKarti from "./SiparisKarti";

/**
 * Ürün kartının "Satışlar" sekmesi: bu ürüne bağlanmış müşteri siparişleri,
 * para birimi başına toplam / tahsil edilen / kalan.
 *
 * Salt okunur: sipariş ve tahsilat müşteri kartında yönetilir, burada
 * düzenlenseydi aynı işin ikinci bir kapısı olurdu. Yetki müşteri
 * defterinden gelir — çalışan yalnızca kendi müşterilerine yapılan satışı
 * görür (bkz. SiparisService.urununkiler).
 */
export default function UrunSatislari({ productId }: { productId: string }) {
  const c = useThemeColors();
  const t = useT();
  const [veri, setVeri] = useState<MusteriSiparisListesi | null>(null);
  const [hata, setHata] = useState("");

  useEffect(() => {
    let iptal = false;
    siparisApi
      .urununkiler(productId)
      .then((v) => !iptal && setVeri(v))
      .catch((err) => {
        if (iptal) return;
        setVeri({ yonetici: false, siparisler: [] });
        setHata(
          err instanceof ApiError && err.status === 403
            ? t("Satışları görmek için Müşteriler modülüne erişimin olmalı.")
            : err instanceof Error
              ? err.message
              : t("Yüklenemedi")
        );
      });
    return () => {
      iptal = true;
    };
  }, [productId]);

  // Para birimi başına: kur dönüşümü yok (bkz. butceToplama.ts).
  const toplamlar = useMemo(() => {
    const m = new Map<string, { toplam: number; tahsil: number; kalan: number; miktar: number; birim?: string }>();
    for (const s of veri?.siparisler ?? []) {
      const k = m.get(s.paraBirimi) ?? { toplam: 0, tahsil: 0, kalan: 0, miktar: 0, birim: s.birim };
      k.toplam += s.tutar;
      k.tahsil += tahsilEdilen(s);
      k.kalan += kalanTutar(s);
      k.miktar += s.miktar ?? 0;
      // Farklı birimlerle girilmiş miktarlar toplanmaz ("3 koli + 5 adet").
      if (k.birim !== s.birim) k.birim = undefined;
      m.set(s.paraBirimi, k);
    }
    return [...m];
  }, [veri]);

  const musteriSayisi = useMemo(() => new Set((veri?.siparisler ?? []).map((s) => s.partyId)).size, [veri]);

  const kutuStili: React.CSSProperties = {
    padding: 20,
    borderRadius: 12,
    border: `1px dashed ${c.border}`,
    color: c.textSecondary,
    fontSize: 15,
    lineHeight: 1.6,
  };

  if (!veri) return <div style={kutuStili}>{t("Yükleniyor…")}</div>;
  if (hata) return <div style={kutuStili}>{hata}</div>;
  if (veri.siparisler.length === 0) {
    return (
      <div style={kutuStili}>
        {t("Bu ürüne bağlı sipariş yok. Müşteri kartında sipariş eklerken \"Ürün / hizmet\" alanından bu ürünü seçtiğinde burada görünür.")}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {toplamlar.map(([para, k]) => (
          <div
            key={para}
            style={{ flex: "1 1 220px", border: `1px solid ${c.border}`, borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 4 }}
          >
            <span style={{ fontSize: 13, color: c.textSecondary }}>{t("Satış toplamı")}</span>
            <span style={{ fontSize: 20, fontWeight: 600, color: c.textPrimary }}>{fmtPara(k.toplam, para)}</span>
            <span style={{ fontSize: 13, color: c.textSecondary }}>
              {[
                t("Tahsil edilen {tutar}", { tutar: fmtPara(k.tahsil, para) }),
                k.kalan > 0 ? t("Kalan {tutar}", { tutar: fmtPara(k.kalan, para) }) : undefined,
                k.miktar > 0 && k.birim ? `${k.miktar} ${k.birim}` : undefined,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
        ))}
      </div>
      <p style={{ margin: 0, fontSize: 13.5, color: c.textSecondary, lineHeight: 1.5 }}>
        {t("{siparis} sipariş · {musteri} müşteri", { siparis: veri.siparisler.length, musteri: musteriSayisi })}
        {!veri.yonetici && ` · ${t("Yalnızca sana atanmış müşteriler gösteriliyor.")}`}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {veri.siparisler.map((s) => (
          <SiparisKarti
            key={s.id}
            siparis={s}
            yazabilir={false}
            musteriAdiGoster
            sorumluGoster={veri.yonetici}
            onDegisti={() => undefined}
            onSilindi={() => undefined}
          />
        ))}
      </div>
    </div>
  );
}
