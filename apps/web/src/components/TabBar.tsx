import { colors } from "../theme/colors";
import { useIsDesktop } from "../lib/useIsDesktop";

export interface TabBarItem {
  key: string;
  label: string;
  /** Yeni gelen sekmenin tek seferlik işareti (bkz. moduleLayout.ts). */
  isNew?: boolean;
}

interface Props {
  tabs: TabBarItem[];
  active: string;
  onChange: (key: string) => void;
  style?: React.CSSProperties;
}

/**
 * Proje / iş / departman / organizasyon sekme çubuğu.
 *
 * Dört ekran aynı çubuğu ayrı ayrı kopyalamıştı; sekme sayısı sabit olmadığı
 * için (modül sekmeleri sonradan ekleniyor) kopyaların hepsinde aynı taşma
 * sorunu vardı. Tek yerde toplandı.
 *
 * Yerleşim kuralı: sabit sütun sayısı YOK. Sütunlar en az `MIN_TAB` genişliğinde
 * olacak şekilde sığdığı kadar yan yana dizilir, sığmayan alt satıra iner.
 * Önceki hâl mobilde 3 sütuna sabitliyordu: dar telefonda ya da kullanıcı yazı
 * ölçeğini büyüttüğünde (bkz. lib/fontScale.ts) etiketler hücreden taşıyordu.
 * Şimdi taşma yerine satır artıyor.
 */
export default function TabBar({ tabs, active, onChange, style }: Props) {
  const c = colors.light;
  const isDesktop = useIsDesktop();
  // Masaüstünde daha geniş bir taban: sekmeler tek satırda kalmayı denesin ama
  // sıkışıp okunmaz hale gelmesin. Mobilde eşik düşük, çünkü orada iki-üç satır
  // normal.
  const minTab = isDesktop ? 118 : 92;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fit, minmax(${minTab}px, 1fr))`,
        gap: 4,
        background: c.surface,
        border: `1px solid ${c.border}`,
        borderRadius: 10,
        padding: 4,
        marginBottom: 16,
        ...style,
      }}
    >
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 5,
            padding: "8px 4px",
            lineHeight: 1.25,
            // Hücreye sığmayan uzun etiket taşmak yerine bölünsün. overflowWrap
            // tek başına "Görev/Çıktı" gibi bölünme noktası olmayan sözcükleri
            // her tarayıcıda kırmıyordu.
            overflowWrap: "anywhere",
            wordBreak: "break-word",
            textAlign: "center",
            borderRadius: 7,
            border: "none",
            background: active === t.key ? c.primary : "transparent",
            color: active === t.key ? "#fff" : c.textSecondary,
            fontSize: isDesktop ? 16 : 15,
            fontWeight: 500,
            cursor: "pointer",
            transition: "background 0.12s ease, color 0.12s ease",
          }}
        >
          {t.label}
          {t.isNew && (
            <span
              title="Sık kullandığın için üste alındı"
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                flexShrink: 0,
                background: active === t.key ? "#fff" : c.accent,
              }}
            />
          )}
        </button>
      ))}
    </div>
  );
}
