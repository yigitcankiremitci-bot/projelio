import type { CSSProperties } from "react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Enter (ve mobil klavyelerin "bitti" tuşu) buna düşer. */
  onSubmit: () => void;
  /** Escape. */
  onCancel: () => void;
  onBlur?: () => void;
  onClick?: (e: React.MouseEvent) => void;
  placeholder?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
  maxLength?: number;
  /** Form doğrulaması için — yerini aldığı input'ta olduğu gibi. */
  required?: boolean;
  /** Boşken kaplayacağı yükseklik — yerini aldığı input ile aynı kalsın diye. */
  minHeight?: number;
  fontSize?: number;
  /** Sarmalayıcıya (ızgaraya) uygulanır: yerleşimde asıl kutu odur. */
  style?: CSSProperties;
  /** Ek sınıf — ölçüleri değiştiren varyantlar için (bkz. .autogrow-inline). */
  className?: string;
}

/**
 * iOS Safari, yazı boyu 16px'in altındaki bir alana odaklanınca sayfayı
 * otomatik yakınlaştırıyor; bu yüzden dokunmatik cihazlarda taban 16'ya
 * çekiliyor. Masaüstünde ise böyle bir sorun yok ve tabanı orada da zorlamak,
 * yerinde düzenleme kutusunu yerini aldığı metinden BÜYÜK gösteriyordu.
 */
const COARSE_POINTER =
  typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches === true;

/**
 * Görev/alt görev başlığı yazarken kullanılan, içerik uzadıkça AŞAĞI BÜYÜYEN
 * giriş alanı.
 *
 * Neden `input` değil: `input` tek satırdır ve satır dolunca metni yatay olarak
 * kaydırır — kullanıcı yazdıkça yazının başı gözden kayboluyor, uzun bir görev
 * adını yazarken ne yazdığını göremiyordu. `textarea` metni sarar.
 *
 * Yükseklik nasıl büyüyor: burada değil, CSS'te — sarmalayıcı bir ızgara ve
 * textarea ile aynı metnin görünmez bir kopyası aynı gözü paylaşıyor
 * (bkz. index.css `.autogrow`). Bu yüzden bileşende hiçbir ölçüm/effect yok;
 * `data-replica` dışında yapacak bir şey kalmıyor.
 *
 * Neden yine de tek "değer" gibi davranıyor: başlık çok satırlı bir metin
 * değil. Enter kaydeder (yeni satır AÇMAZ) ve yapıştırılan metindeki satır
 * sonları boşluğa çevrilir; yani sarma tamamen görsel. Böylece `input` ile aynı
 * anlamı korurken okunabilirliği kazanıyoruz.
 */
export default function AutoGrowTextarea({
  value,
  onChange,
  onSubmit,
  onCancel,
  onBlur,
  onClick,
  placeholder,
  ariaLabel,
  autoFocus,
  maxLength,
  required,
  minHeight = 34,
  fontSize = 16,
  style,
  className,
}: Props) {
  return (
    <div
      className={className ? `autogrow ${className}` : "autogrow"}
      // Görünmez kopyanın metni. Yükseklik bundan doğuyor.
      data-replica={value}
      style={{
        // Yazı ölçüleri sarmalayıcıda: textarea ve kopya ikisini de `inherit`
        // ile alıyor, böylece ikisi kesinlikle aynı sarıyor.
        fontSize: COARSE_POINTER ? Math.max(fontSize, 16) : fontSize,
        minHeight,
        ...style,
      }}
    >
      <textarea
        autoFocus={autoFocus}
        value={value}
        rows={1}
        // Yapıştırılan çok satırlı metin başlığı bozmasın.
        onChange={(e) => onChange(e.target.value.replace(/[\r\n]+/g, " "))}
        onClick={onClick}
        onBlur={onBlur}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
          // Mobil klavyelerin onay tuşu her zaman form submit tetiklemiyor;
          // Enter doğrudan burada yakalanır.
          if (e.key === "Enter") {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        maxLength={maxLength}
        required={required}
        enterKeyHint="done"
      />
    </div>
  );
}
