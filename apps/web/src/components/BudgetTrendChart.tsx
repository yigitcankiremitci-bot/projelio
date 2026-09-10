import { useMemo } from "react";
import type { KasaHareketi } from "../lib/butceOzeti";
import { aylikOzet } from "../lib/butceOzeti";
import { useThemeColors } from "../theme/useThemeColors";
import { useT } from "../lib/i18n";

interface Props {
  transactions: KasaHareketi[];
  aySayisi?: number;
  /**
   * Tutar biçimlendirici. Şirket kasasının defteri çok para birimli; oradaki
   * panel kendi biçimlendiricisini geçiyor, diğerleri ₺ ile yetiniyor.
   * `kisa` istendiğinde tavan etiketi için kısaltılmış biçim beklenir —
   * çubukların üstündeki dar şeride tam rakam sığmıyor.
   */
  formatla?: (amount: number, kisa?: boolean) => string;
  /** Başlığın yanında para birimini yazar (çok para birimli defterde). */
  baslikEki?: string;
}

/** Eksen etiketi için kısa tutar: "12,5 B ₺". Uzun rakam çubukların arasına sığmıyor. */
function kisaTutar(amount: number): string {
  try {
    return `${new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 }).format(amount)} ₺`;
  } catch {
    return `${Math.round(amount)} ₺`;
  }
}

function varsayilanTutar(amount: number): string {
  return `${amount.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} ₺`;
}

const ALAN_YUKSEKLIGI = 128;

/**
 * Son ayların gelir/gider çubukları.
 *
 * SVG değil, kutu düzeni: yükseklikler yüzde olduğu için grafik kapsayıcısıyla
 * birlikte esniyor ve yazılar ekran genişledikçe büyümüyor (viewBox ölçeklenen
 * bir SVG'de büyürdü). Yeni bağımlılık da gerekmiyor.
 *
 * Veri kaynağı /budget/transactions: sunucu son 200 hareketi döner (bkz.
 * findAllForUser). Grafik trendi gösterir, muhasebe toplamı değil — kesin
 * toplamlar üstteki özet şeridinde, /budget/overview'dan geliyor.
 */
export default function BudgetTrendChart({ transactions, aySayisi = 6, formatla, baslikEki }: Props) {
  const c = useThemeColors();
  const t = useT();
  const tamTutar = formatla ?? varsayilanTutar;
  const aylar = useMemo(() => aylikOzet(transactions, aySayisi), [transactions, aySayisi]);
  const tavan = Math.max(...aylar.map((ay) => Math.max(ay.gelir, ay.gider)), 0);

  const toplamGelir = aylar.reduce((toplam, ay) => toplam + ay.gelir, 0);
  const toplamGider = aylar.reduce((toplam, ay) => toplam + ay.gider, 0);
  const net = toplamGelir - toplamGider;

  return (
    <div style={{ border: `1px solid ${c.border}`, borderRadius: 12, background: c.surface, padding: "14px 16px 10px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: c.textPrimary }}>
          {t("Son {n} ay", { n: aySayisi })}
          {baslikEki ? ` (${baslikEki})` : ""}
        </span>
        <span style={{ fontSize: 13, color: net < 0 ? c.danger : c.success }}>
          {t("net")} {net < 0 ? "−" : "+"}
          {tamTutar(Math.abs(net))}
        </span>
        <span style={{ flex: 1 }} />
        <Legend renk={c.success} label={t("Gelir")} />
        <Legend renk={c.danger} label={t("Gider")} />
      </div>

      {tavan === 0 ? (
        <p style={{ fontSize: 13, color: c.textSecondary, margin: "0 0 8px" }}>
          {t("Bu dönemde kayıtlı bir hareket yok.")}
        </p>
      ) : (
        <div style={{ position: "relative", height: ALAN_YUKSEKLIGI, marginBottom: 6 }}>
          {/* Tavan çizgisi: çubukların hangi ölçeğe göre çizildiğini gösterir,
              yoksa "yarısı kadar" gibi okumalar dayanaksız kalıyor. */}
          <div style={{ position: "absolute", left: 0, right: 0, top: 0, borderTop: `1px dashed ${c.border}` }} />
          {/* Tavan değeri SOLDA duruyor: sağ üst köşe başlıktaki gösterge
              kutucuklarının hemen altına düşüyor ve ikisi tek bir küme gibi
              okunuyordu. */}
          <span
            style={{
              position: "absolute",
              left: 0,
              top: -8,
              fontSize: 11,
              color: c.textSecondary,
              background: c.surface,
              padding: "0 4px 0 0",
            }}
          >
            {formatla ? formatla(tavan, true) : kisaTutar(tavan)}
          </span>

          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: "100%" }}>
            {aylar.map((ay) => (
              <div key={ay.anahtar} style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 3, height: "100%" }}>
                <Cubuk oran={ay.gelir / tavan} renk={c.success} baslik={`${ay.etiket} · ${t("Gelir")} ${tamTutar(ay.gelir)}`} />
                <Cubuk oran={ay.gider / tavan} renk={c.danger} baslik={`${ay.etiket} · ${t("Gider")} ${tamTutar(ay.gider)}`} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, borderTop: `1px solid ${c.border}`, paddingTop: 6 }}>
        {aylar.map((ay, i) => (
          <span
            key={ay.anahtar}
            style={{
              flex: 1,
              textAlign: "center",
              fontSize: 11,
              // İçinde bulunulan ay (dizinin sonu) vurgulu: "bu ay nerede?"
              // sorusunun cevabı grafiğe bakan herkesin ilk aradığı şey.
              color: i === aylar.length - 1 ? c.textPrimary : c.textSecondary,
              fontWeight: i === aylar.length - 1 ? 500 : 400,
            }}
          >
            {ay.etiket}
          </span>
        ))}
      </div>
    </div>
  );
}

function Cubuk({ oran, renk, baslik }: { oran: number; renk: string; baslik: string }) {
  return (
    <div
      title={baslik}
      style={{
        flex: 1,
        // Sıfır bile ince bir iz bırakır: tamamen kaybolan çubuk "veri yok" ile
        // "o ay sıfır" arasındaki farkı siliyordu.
        height: `${Math.max(oran * 100, oran > 0 ? 3 : 1.5)}%`,
        background: renk,
        opacity: oran > 0 ? 1 : 0.25,
        borderRadius: "3px 3px 0 0",
      }}
    />
  );
}

function Legend({ renk, label }: { renk: string; label: string }) {
  const c = useThemeColors();
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: c.textSecondary }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: renk }} />
      {label}
    </span>
  );
}
