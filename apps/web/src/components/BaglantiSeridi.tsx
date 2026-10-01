import { useEffect } from "react";
import { useThemeColors } from "../theme/useThemeColors";
import { useT } from "../lib/i18n";
import { SAFE_TOP, Z } from "../lib/layout";
import { geriGeldiyiKapat, gonderilemeyeniKapat, useCevrimdisiDurum } from "../lib/cevrimdisiDepo";

/** "Bağlantı geri geldi" bu kadar sonra kendiliğinden kaybolur. */
const GERI_GELDI_SURESI_MS = 12_000;

/**
 * Ekranın üstünde, ortada duran küçük bağlantı şeridi (yalnızca mobil kabukta
 * görünür; tarayıcıda çevrimdışı katmanı kapalı, bkz. lib/cevrimdisiDepo.ts).
 *
 * NEDEN GEREKLİ: bağlantı yokken gösterilen liste cihazda saklı olan son
 * hâldir. Kullanıcı bunu bilmezse "görevim neden güncellenmedi" diye düşünür;
 * bekleyen bir değişikliğin henüz gitmediğini bilmezse uygulamayı kapatıp
 * değişikliği kaybettiğini sanır. Dönüşte "Yenile" önerilir çünkü ekranlar
 * saklı veriyle açılmıştı ve kendiliğinden yeniden çekmiyorlar.
 *
 * Üst ortada ve dar: sol üstteki logo ile sağ üstteki çan arasına sığmalı,
 * çevrimdışılık uzun sürebilir ve şerit onları örtmemeli.
 */
export default function BaglantiSeridi() {
  const c = useThemeColors();
  const t = useT();
  const d = useCevrimdisiDurum();

  useEffect(() => {
    if (!d.geriGeldi || d.cevrimdisi) return;
    const z = setTimeout(geriGeldiyiKapat, GERI_GELDI_SURESI_MS);
    return () => clearTimeout(z);
  }, [d.geriGeldi, d.cevrimdisi]);

  let metin: string;
  let renk: string;
  let eylem: { etiket: string; fn: () => void } | null = null;
  let kapat: (() => void) | null = null;

  if (d.gonderilemeyen > 0) {
    metin = t("{n} değişiklik sunucuda kabul edilmedi", { n: d.gonderilemeyen });
    renk = c.danger;
    kapat = gonderilemeyeniKapat;
  } else if (d.cevrimdisi) {
    metin =
      d.bekleyen > 0
        ? t("Çevrimdışı · {n} değişiklik bekliyor", { n: d.bekleyen })
        : t("Çevrimdışı · kayıtlı veriler gösteriliyor");
    renk = c.warning;
  } else if (d.bekleyen > 0) {
    metin = t("{n} değişiklik gönderiliyor…", { n: d.bekleyen });
    renk = c.warning;
  } else if (d.geriGeldi) {
    metin = t("Bağlantı geri geldi");
    renk = c.success;
    eylem = { etiket: t("Yenile"), fn: () => window.location.reload() };
    kapat = geriGeldiyiKapat;
  } else {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        top: `calc(10px + ${SAFE_TOP})`,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: Z.baglantiSeridi,
        maxWidth: "calc(100% - 132px)",
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px 6px 12px",
        borderRadius: 999,
        border: `1px solid ${renk}`,
        background: c.surface,
        color: c.textPrimary,
        fontSize: 12.5,
        lineHeight: 1.3,
        boxShadow: "0 2px 10px rgba(0,0,0,0.12)",
      }}
    >
      <span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", background: renk, flexShrink: 0 }} />
      <span style={{ minWidth: 0 }}>{metin}</span>
      {eylem && (
        <button
          type="button"
          onClick={eylem.fn}
          style={{
            flexShrink: 0,
            border: "none",
            background: "transparent",
            color: c.accent,
            fontSize: 12.5,
            fontWeight: 600,
            padding: 0,
            cursor: "pointer",
          }}
        >
          {eylem.etiket}
        </button>
      )}
      {kapat && (
        <button
          type="button"
          onClick={kapat}
          aria-label={t("Kapat")}
          style={{
            flexShrink: 0,
            border: "none",
            background: "transparent",
            color: c.textSecondary,
            fontSize: 15,
            lineHeight: 1,
            padding: "0 2px",
            cursor: "pointer",
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
