import { useEffect, useMemo, useState } from "react";
import { kalanTutar, tahsilEdilen, type MusteriSiparisListesi } from "@projelio/shared";
import { siparisApi } from "../../api/party";
import { ApiError } from "../../api/client";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";
import { fmtPara } from "../butce/butceBicim";
import SiparisKarti from "./SiparisKarti";

/** Uzun listede tek seferde çizilen sipariş sayısı. */
const SAYFA = 50;

/**
 * Ürün kartının "Satışlar" sekmesi: bu ürünün geçtiği müşteri siparişleri,
 * para birimi başına ciro / tahsil edilen / kalan ve kanal kırılımı.
 *
 * Rakamlar SİPARİŞİN değil bu ürünün KALEMLERİNİN toplamı (migration 168):
 * üç ürünlü bir siparişin tamamını her ürünün cirosuna yazmak aynı satışı
 * üç kez saymaktı. Tahsil edilen pay, siparişe gelen paranın kalemin
 * siparişteki payı kadarıdır — tahsilat sipariş düzeyinde tutuluyor.
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
  const [gosterilen, setGosterilen] = useState(SAYFA);

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
    const m = new Map<string, { toplam: number; tahsil: number; kalan: number; miktar: number; birim?: string; ilk: boolean }>();
    for (const s of veri?.siparisler ?? []) {
      const kalemler = s.kalemler.filter((k) => k.productId === productId);
      if (kalemler.length === 0) continue;
      const tutar = kalemler.reduce((t, k) => t + k.tutar, 0);
      const pay = s.tutar > 0 ? tutar / s.tutar : 0;
      const k = m.get(s.paraBirimi) ?? { toplam: 0, tahsil: 0, kalan: 0, miktar: 0, birim: kalemler[0].birim, ilk: true };
      k.toplam += tutar;
      k.tahsil += tahsilEdilen(s) * pay;
      k.kalan += kalanTutar(s) * pay;
      for (const x of kalemler) {
        k.miktar += x.miktar;
        // Farklı birimlerle girilmiş miktarlar toplanmaz ("3 koli + 5 adet").
        if (!k.ilk && k.birim !== x.birim) k.birim = undefined;
        k.ilk = false;
      }
      m.set(s.paraBirimi, k);
    }
    return [...m];
  }, [veri, productId]);

  // Kanal kırılımı: müşteri kartı olan siparişler kanalı belirtilmemişse "Müşteri kartı" altında.
  const kanallar = useMemo(() => {
    const m = new Map<string, { ad: string; para: string; tutar: number; miktar: number }>();
    for (const s of veri?.siparisler ?? []) {
      const kalemler = s.kalemler.filter((k) => k.productId === productId);
      if (kalemler.length === 0) continue;
      const ad = s.kanalAdi ?? t("Kanalı belirtilmemiş");
      const anahtar = `${ad}|${s.paraBirimi}`;
      const k = m.get(anahtar) ?? { ad, para: s.paraBirimi, tutar: 0, miktar: 0 };
      for (const x of kalemler) {
        k.tutar += x.tutar;
        k.miktar += x.miktar;
      }
      m.set(anahtar, k);
    }
    return Array.from(m.values()).sort((a, b) => b.tutar - a.tutar);
  }, [veri, productId]);

  // Müşteri kartı ya da (müşterisiz siparişte) alıcı — tekil alıcı sayısı.
  const musteriSayisi = useMemo(
    () => new Set((veri?.siparisler ?? []).map((s) => s.partyId ?? `${s.kanalId}|${s.alici?.ad ?? s.id}`)).size,
    [veri]
  );

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
        {t("Bu ürünün geçtiği sipariş yok. Müşteri kartında sipariş eklerken bir kalemde bu ürünü seçtiğinde burada görünür.")}
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
            <span style={{ fontSize: 13, color: c.textSecondary }}>{t("Bu ürünün satışı")}</span>
            <span style={{ fontSize: 20, fontWeight: 600, color: c.textPrimary }}>{fmtPara(k.toplam, para)}</span>
            <span style={{ fontSize: 13, color: c.textSecondary }}>
              {[
                t("Tahsil edilen {tutar}", { tutar: fmtPara(k.tahsil, para) }),
                k.kalan >= 0.01 ? t("Kalan {tutar}", { tutar: fmtPara(k.kalan, para) }) : undefined,
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
      {kanallar.length > 1 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
          {kanallar.map((k) => (
            <div key={`${k.ad}|${k.para}`} style={{ display: "flex", gap: 8, color: c.textPrimary }}>
              <span style={{ flex: 1, minWidth: 0 }}>{k.ad}</span>
              <span style={{ color: c.textSecondary }}>{t("{n} adet", { n: k.miktar })}</span>
              <span style={{ minWidth: 100, textAlign: "right" }}>{fmtPara(k.tutar, k.para)}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {veri.siparisler.slice(0, gosterilen).map((s) => (
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
        {veri.siparisler.length > gosterilen && (
          <button
            onClick={() => setGosterilen((n) => n + SAYFA)}
            style={{ alignSelf: "center", fontSize: 12, color: c.primary, background: "transparent", border: "none", cursor: "pointer" }}
          >
            {t("Daha fazla göster ({n} kaldı)", { n: veri.siparisler.length - gosterilen })}
          </button>
        )}
      </div>
    </div>
  );
}
