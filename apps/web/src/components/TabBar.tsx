import { useEffect, useRef, useState } from "react";
import { colors } from "../theme/colors";
import { useIsDesktop } from "../lib/useIsDesktop";
import { IconChevronLeft, IconChevronRight } from "./icons";

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
  /**
   * Sekmeler alt satıra sarmak yerine tek satırda kalıp yana kaydırılır.
   * Kaydırınca tepede beliren sabit şeritte (bkz. App.tsx CoverStickyHeader)
   * kullanılıyor: orada iki satırlık sekme çubuğu ekranın yarısını yiyordu.
   */
  scrollable?: boolean;
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
 * Şimdi taşma yerine satır artıyor. `scrollable` verildiğinde ise satır artmaz,
 * çubuk yana kaydırılır (bkz. ScrollableTabBar).
 */
export default function TabBar({ tabs, active, onChange, style, scrollable }: Props) {
  const c = colors.light;
  const isDesktop = useIsDesktop();
  // Masaüstünde daha geniş bir taban: sekmeler tek satırda kalmayı denesin ama
  // sıkışıp okunmaz hale gelmesin. Mobilde eşik düşük, çünkü orada iki-üç satır
  // normal.
  const minTab = isDesktop ? 118 : 92;

  // Mobilde her zaman tek satır + yana kaydırma: 6 sekme dar ekranda iki-üç
  // satıra sarıyor ve ekranın üçte birini yiyordu. Masaüstünde sarma sorunu yok,
  // orada sekmeler genişliği paylaşan ızgara olarak daha okunaklı — tek istisna,
  // sabit şeritteki kopya (`scrollable`), çünkü o bandın yüksekliği sabit.
  // Mobilde her zaman tek satır + yana kaydırma.
  if (!isDesktop) {
    return <ScrollableTabBar tabs={tabs} active={active} onChange={onChange} style={style} />;
  }

  // Masaüstünde sabit şeritteki kopya (`scrollable`): satır yüksekliği sabit
  // olduğu için sarmamalı, ama yana kaydırmalı da olmamalı. Şeridin ortasındaki
  // bant (sidebar ile bildirim çanı arasında ~970px) altı sekmeyi rahat
  // taşıyor; kaydırmalı hâl o genişliği kullanmayıp sekmeleri sola sıkıştırıyor,
  // kalanı da ok düğmesinin arkasına saklıyordu.
  if (scrollable) {
    return <FittedTabBar tabs={tabs} active={active} onChange={onChange} style={style} />;
  }

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

/**
 * Tek satır, kaydırmasız: sekmeler mevcut genişliği eşit paylaşır.
 *
 * Izgara hâlinden farkı sarmaması (`auto-fit` sığmayanı alt satıra indiriyor,
 * sabit yükseklikli şeritte bu taşma demek), ScrollableTabBar'dan farkı da
 * genişliği sonuna kadar kullanması. Çok dar bir bantta etiketler kesilir —
 * kaybolmaktansa kısalsınlar.
 */
function FittedTabBar({ tabs, active, onChange, style }: Props) {
  const c = colors.light;
  return (
    <div
      style={{
        display: "flex",
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
          title={t.label}
          style={{
            flex: "1 1 0",
            // Varsayılan `min-width: auto` uzun etiketin düğmeyi germesine izin
            // verir; o da satırı taşırır (bkz. StatGrid'deki aynı tuzak).
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 5,
            padding: "8px 6px",
            borderRadius: 7,
            border: "none",
            background: active === t.key ? c.primary : "transparent",
            color: active === t.key ? "#fff" : c.textSecondary,
            fontSize: 15,
            fontWeight: 500,
            cursor: "pointer",
            transition: "background 0.12s ease, color 0.12s ease",
          }}
        >
          <span style={{ minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {t.label}
          </span>
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

/**
 * Tek satırlık, yana kaydırılan sekme çubuğu.
 *
 * İki uçta da sekmelerin üzerine binen küçük birer ok var; her biri hem "bu
 * yönde devamı var" işareti hem de kaydırma düğmesidir ve o uca gelindiğinde
 * kaybolur. Ok olmadan dokunmatikte çubuğun kaydırılabildiği hiç anlaşılmıyordu
 * — kaydırma çubuğu gizli, taşan sekmeler de ekran dışında kalıyor.
 */
function ScrollableTabBar({ tabs, active, onChange, style }: Props) {
  const c = colors.light;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ atStart: true, atEnd: true });

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    // 4px pay: tarayıcılar kesirli piksel genişliklerinde scrollLeft'i tam
    // yuvarlamıyor, uca gelindiği halde ok bir türlü kaybolmuyordu.
    const update = () => {
      const next = {
        atStart: el.scrollLeft <= 4,
        atEnd: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4,
      };
      setEdges((prev) => (prev.atStart === next.atStart && prev.atEnd === next.atEnd ? prev : next));
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [tabs.length]);

  // Aktif sekme ekran dışında kalmışsa (ör. kullanıcı "Süreç"teyken şerit
  // açıldığında) görünür alana getirilir.
  useEffect(() => {
    scrollerRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [active]);

  return (
    // marginBottom ızgara hâliyle aynı: akıştaki çubuk altındaki panelden
    // ayrılsın (şerittekiler style ile 0'a çeker).
    <div style={{ position: "relative", minWidth: 0, marginBottom: 16, ...style }}>
      <div
        ref={scrollerRef}
        style={{
          display: "flex",
          gap: 4,
          overflowX: "auto",
          scrollbarWidth: "none",
          background: c.surface,
          border: `1px solid ${c.border}`,
          borderRadius: 10,
          padding: 4,
          // Okların altında kalan sekmeye dokunulabilsin diye o uçta yer açılır.
          paddingLeft: edges.atStart ? 4 : 30,
          paddingRight: edges.atEnd ? 4 : 30,
        }}
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            data-active={active === t.key}
            onClick={() => onChange(t.key)}
            style={{
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "8px 14px",
              whiteSpace: "nowrap",
              borderRadius: 7,
              border: "none",
              background: active === t.key ? c.primary : "transparent",
              color: active === t.key ? "#fff" : c.textSecondary,
              fontSize: 15,
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

      {!edges.atStart && (
        <button
          type="button"
          aria-label="Sekmeleri sola kaydır"
          onClick={() => scrollerRef.current?.scrollBy({ left: -140, behavior: "smooth" })}
          style={{
            position: "absolute",
            top: 1,
            bottom: 1,
            left: 1,
            width: 30,
            border: "none",
            borderRadius: "9px 0 0 9px",
            // Sekmeleri sert bir çizgiyle kesmesin diye zeminden saydama geçiş.
            background: `linear-gradient(to left, ${c.surface}00, ${c.surface} 55%)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            paddingLeft: 4,
            cursor: "pointer",
          }}
        >
          <IconChevronLeft size={16} color={c.textSecondary} />
        </button>
      )}

      {!edges.atEnd && (
        <button
          type="button"
          aria-label="Sekmeleri sağa kaydır"
          onClick={() => scrollerRef.current?.scrollBy({ left: 140, behavior: "smooth" })}
          style={{
            position: "absolute",
            top: 1,
            bottom: 1,
            right: 1,
            width: 30,
            border: "none",
            borderRadius: "0 9px 9px 0",
            // Sekmeleri sert bir çizgiyle kesmesin diye saydamdan zemine geçiş.
            background: `linear-gradient(to right, ${c.surface}00, ${c.surface} 55%)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            paddingRight: 4,
            cursor: "pointer",
          }}
        >
          <IconChevronRight size={16} color={c.textSecondary} />
        </button>
      )}
    </div>
  );
}
