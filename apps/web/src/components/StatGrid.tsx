import { useEffect, useState } from "react";
import { colors } from "../theme/colors";
import { useIsDesktop, useIsWide } from "../lib/useIsDesktop";
import { IconChevronDown, IconChevronUp } from "./icons";

export interface StatItem {
  /**
   * Tek kelimelik etiket: "Bekleyen", "Rutin".
   *
   * Önceden "Bekleyen görev" / "Tamamlanmış görev" gibi tam etiketlerdi ve
   * ayrıca kapalı cümle için `short` diye ikinci bir alan taşınıyordu. İki alan
   * birbirinden ayrı düşebiliyordu; dahası uzun etiket her üç yerleşimde de
   * sıkıntıydı — ızgarada iki satıra sarıyor, kapak şeridini geniş tutuyor,
   * cümleyi üç noktaya zorluyordu. Sayfa bağlamı ("Pist Development" işi,
   * Projeler sekmesi) hangi görev olduğunu zaten söylüyor.
   *
   * Kapalı cümlede küçük harfe çevrilir (`tr` yerel ayarıyla: I/İ doğru dönsün).
   */
  label: string;
  value: string | number;
  /** Dikkat çekmesi gereken sayı (kaçırılan tekrar gibi) için renk. */
  tone?: string;
}

/**
 * ÖZET SAYILARIN ÜÇ HÂLİ — hangisinin çizileceğini ekran genişliği belirler.
 *
 * | Genişlik | Nerede | Neden |
 * |---|---|---|
 * | < 880 (telefon) | akışta, KAPALI tek satır; dokununca 2×2 ızgara | dört kutu ilk ekranın yarısını yiyordu |
 * | 880–1179 | akışta, dört sütunlu ızgara | kapak bu genişlikte özeti taşıyamaz (bkz. useIsWide) |
 * | ≥ 1180 | KAPAĞIN sağ alt boşluğunda | kapak zaten orada boş; akıştan 104px kazanılır |
 *
 * Sayfa her iki bileşeni de yerleştirir, aynı `items` dizisiyle; hangisinin
 * görüneceğine bileşenler kendi karar verir. Böylece "üç hâl" mantığı çağıran
 * sayfalara dağılmıyor:
 *
 *   <EntityCover … stats={<CoverStats items={stats} />} />
 *   <StatSummary items={stats} />
 */

/** Tercih cihazda tutuluyor; hesaba bağlı değil (bkz. lib/homeTarget.ts, aynı desen). */
const STORAGE_KEY = "projelio_stats_open";

function readOpen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Akıştaki özet. Geniş ekranda hiç çizilmez — orada sayılar kapağın içinde
 * (bkz. CoverStats).
 */
export function StatSummary({ items }: { items: StatItem[] }) {
  const c = colors.light;
  const isDesktop = useIsDesktop();
  const isWide = useIsWide();
  const [open, setOpen] = useState(readOpen);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, open ? "1" : "0");
    } catch {
      // Gizli sekmede localStorage yazımı hata verebilir; tercih o oturumda
      // hatırlanmaz, özelliğin kendisi çalışmaya devam eder.
    }
  }, [open]);

  if (isWide) return null;

  const grid = (
    <div
      style={{
        display: "grid",
        // TAŞMA TUZAĞI: burası eskiden `repeat(4, 1fr)` idi. `1fr`in alt sınırı
        // `auto`, yani hücre kendi min-content genişliğinden dar olamaz;
        // "Tamamlanmış görev" dört sütuna sığmayınca ızgara kabından taşıyor ve
        // BELGEYİ yatay kaydırılır hale getiriyordu — kapak ve sekme çubuğu da
        // onunla kayıyordu. Üç parça da gerekli: auto-fit, min(148px, 100%) ve
        // hücredeki minWidth: 0.
        gridTemplateColumns: "repeat(auto-fit, minmax(min(148px, 100%), 1fr))",
        gap: 14,
        marginBottom: 20,
      }}
    >
      {items.map((it) => (
        <StatCard key={it.label} {...it} />
      ))}
    </div>
  );

  if (isDesktop) return grid;

  return (
    <div style={{ marginBottom: open ? 0 : 16 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "Özeti kapat" : "Özeti aç"}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: c.surface,
          border: `1px solid ${c.border}`,
          borderRadius: 12,
          padding: "11px 14px",
          marginBottom: open ? 14 : 0,
          fontFamily: "inherit",
          fontSize: 13,
          color: c.textSecondary,
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        {/* Sayılar kapalıyken de okunuyor: satır bir "aç" düğmesi değil,
            özetin kendisi. Sığmayan kuyruk üç noktayla kesilir; bu yüzden
            önemli olan dizide başta olmalı. */}
        <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {items.map((it, i) => (
            <span key={it.label}>
              {i > 0 && <span style={{ color: c.border }}> · </span>}
              <strong style={{ color: it.tone ?? c.textPrimary, fontWeight: 600 }}>{it.value}</strong>{" "}
              {it.label.toLocaleLowerCase("tr")}
            </span>
          ))}
        </span>
        {open ? (
          <IconChevronUp size={16} color={c.textSecondary} />
        ) : (
          <IconChevronDown size={16} color={c.textSecondary} />
        )}
      </button>

      {open && grid}
    </div>
  );
}

/**
 * Kapağın sağ alt köşesindeki özet şeridi — yalnızca geniş ekranda.
 *
 * Kapak, iş ve rutin sayfalarında sağ tarafı boş duran 260px'lik bir bant;
 * özet oraya girince akıştan bir blok tamamen kalkıyor. Şirket sayfasında o
 * köşede kişi kartı var, ama orada özet ızgarası zaten yok — çakışma yok.
 *
 * Yarı saydam beyaz zemin: kapak fotoğrafı koyu da olabilir açık da; perde
 * (bkz. lib/covers.ts COVER_TEXT_VEIL) kapağın yalnızca ALT bandını açıyor,
 * şerit ise üst bandın içine taşabiliyor.
 */
export function CoverStats({ items }: { items: StatItem[] }) {
  const c = colors.light;
  const isWide = useIsWide();
  if (!isWide) return null;

  return (
    <div
      style={{
        display: "flex",
        gap: 26,
        padding: "12px 18px",
        marginBottom: 16,
        borderRadius: 12,
        background: "rgba(255,255,255,0.72)",
        border: "1px solid rgba(26,31,41,0.08)",
        backdropFilter: "blur(2px)",
      }}
    >
      {items.map((it) => (
        // Ortalı: sağa dayalıyken sayı ile etiketin sağ kenarları hizalıydı ama
        // farklı basamak sayıları (4 / 289) soldan tırtıklı bir kenar
        // bırakıyordu. Ortalamada iki satır birbirine göre dengede duruyor.
        <div key={it.label} style={{ textAlign: "center", minWidth: 54 }}>
          <div style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.1, color: it.tone ?? c.textPrimary }}>
            {it.value}
          </div>
          <div style={{ fontSize: 12, color: c.textSecondary, marginTop: 2, whiteSpace: "nowrap" }}>{it.label}</div>
        </div>
      ))}
    </div>
  );
}

/**
 * Tek özet kutusu. JobDetail ve OperationDetail iki ayrı kopya tutuyordu.
 * Dışa açık değil: kutular her zaman StatSummary üzerinden diziliyor.
 */
function StatCard({ label, value, tone }: StatItem) {
  const c = colors.light;
  const isDesktop = useIsDesktop();
  return (
    <div
      style={{
        // Izgara hücresinin varsayılan `min-width: auto` değeri, uzun etiketi
        // olan kartın hücreyi kendi genişliğine germesine izin verir.
        minWidth: 0,
        background: c.surface,
        border: `1px solid ${c.border}`,
        borderRadius: 12,
        padding: isDesktop ? "14px 16px" : "12px 14px",
      }}
    >
      <div style={{ color: c.textSecondary, fontSize: isDesktop ? 15 : 13, lineHeight: 1.3, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ color: tone ?? c.textPrimary, fontSize: isDesktop ? 27 : 23, fontWeight: 600 }}>{value}</div>
    </div>
  );
}
