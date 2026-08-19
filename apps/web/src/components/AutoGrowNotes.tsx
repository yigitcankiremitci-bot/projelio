import type { CSSProperties } from "react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  maxLength?: number;
  /** Boşken kaç satır görünsün. */
  rows?: number;
  fontSize?: number;
  style?: CSSProperties;
}

/**
 * Çok satırlı not/açıklama alanı: verilen satır sayısı kadar yer kaplar,
 * metin uzadıkça AŞAĞI BÜYÜR ve tamamı görünür.
 *
 * AutoGrowTextarea'dan farkı: o, adı yerine geçen TEK SATIRLIK bir alandır —
 * Enter kaydeder, yapıştırılan satır sonları boşluğa çevrilir. Burada metnin
 * kendisi çok satırlı; Enter yeni satır açar ve satır sonları korunur.
 *
 * Yükseklik burada değil CSS'te hesaplanıyor: sarmalayıcı bir ızgara ve
 * textarea ile aynı metnin görünmez bir kopyası aynı gözü paylaşıyor
 * (bkz. index.css `.autogrow`) — bu yüzden bileşende hiçbir ölçüm/effect yok.
 *
 * Neden sabit `rows` + `resize: vertical` değil: sabit yükseklikte uzun not
 * kendi içinde kayan bir kutuya hapsoluyor, kullanıcı yazdığının tamamını
 * ancak elle büyüterek görebiliyordu.
 */
export default function AutoGrowNotes({
  value,
  onChange,
  placeholder,
  ariaLabel,
  maxLength,
  rows = 4,
  fontSize = 16,
  style,
}: Props) {
  // fontSize en az 16: iOS Safari daha küçük alanlara odaklanınca sayfayı
  // otomatik yakınlaştırıyor (bkz. AutoGrowTextarea).
  const size = Math.max(fontSize, 16);
  // .autogrow'daki dikey ölçüler: satır yüksekliği 1.35, dolgu 6+6, kenarlık 1+1.
  const minHeight = Math.round(size * 1.35 * rows) + 14;

  return (
    <div
      className="autogrow"
      // Görünmez kopyanın metni. Yükseklik bundan doğuyor; sondaki boşluk
      // (bkz. index.css) metin yeni satırla bitse bile son satırı ayakta tutar.
      data-replica={value}
      style={{ fontSize: size, minHeight, ...style }}
    >
      <textarea
        value={value}
        rows={1}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        maxLength={maxLength}
      />
    </div>
  );
}
