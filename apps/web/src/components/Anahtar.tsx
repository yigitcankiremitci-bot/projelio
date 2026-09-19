import { useRef, useState } from "react";
import { useThemeColors } from "../theme/useThemeColors";

interface Props {
  checked: boolean;
  onChange: (deger: boolean) => void;
  disabled?: boolean;
  /** Ekran okuyucu etiketi — anahtarın yanındaki yazı görsel, bu metin sesli. */
  label: string;
  /** Küçük (14px yükseklik) hâli sıkışık satırlar için. Varsayılan normal. */
  kucuk?: boolean;
  /** Sayfanın ana aç/kapa'sı için büyük hâl (ör. demo randevu alma). */
  buyuk?: boolean;
}

const OLCU = {
  normal: { g: 46, y: 26, top: 20 },
  kucuk: { g: 36, y: 20, top: 15 },
  buyuk: { g: 64, y: 36, top: 30 },
};

/** Topuzun kenarlardan boşluğu (iç kutu içinde, piksel). */
const IC_BOSLUK = 2;

/**
 * Sağa sola kayan anahtar (toggle).
 *
 * `<input type="checkbox">` YERİNE: kutucuk "bir şey seçiyorum" der, anahtar
 * "bir şeyi açıp kapatıyorum" der. Lio yardımı gibi DAVRANIŞ değiştiren —
 * üstelik para harcatan — bir ayarın kutucuk gibi görünmesi, kullanıcının onu
 * bir filtre sanmasına yol açıyordu.
 *
 * Üç yolla da çalışıyor ve üçü de aynı `onChange`e düşüyor:
 *   * tıklama,
 *   * topuzu sağa/sola SÜRÜKLEME (parmakla en doğal hareket),
 *   * klavye (boşluk/enter; öğe `role="switch"` ve odaklanabilir).
 *
 * Sürükleme sırasında topuz parmağı takip ediyor ama karar BIRAKILDIĞI YERE
 * göre veriliyor: yarıyı geçtiyse durum değişir, geçmediyse eski hâline döner.
 * Hareketsiz bırakılan (yani tıklama olan) sürükleme de anahtarı çeviriyor,
 * yoksa "tıkladım, olmadı" hissi doğuyordu.
 */
export default function Anahtar({ checked, onChange, disabled = false, label, kucuk = false, buyuk = false }: Props) {
  const c = useThemeColors();
  const ref = useRef<HTMLButtonElement>(null);
  const baslangic = useRef<{ x: number; tasindi: boolean } | null>(null);
  // Sürüklerken topuzun anlık konumu (0 = kapalı, 1 = açık). null ise animasyon serbest.
  const [surukleme, setSurukleme] = useState<number | null>(null);

  const { g, y, top } = buyuk ? OLCU.buyuk : kucuk ? OLCU.kucuk : OLCU.normal;
  // Kenarlıklar box-sizing ile ölçünün İÇİNDE: mutlak konumlanan topuz iç
  // kutuya göre yerleşiyor, o yüzden genişlikten iki kenarlık düşülüyor.
  const icGenislik = g - 2;
  const kapaliX = IC_BOSLUK;
  const acikX = icGenislik - top - IC_BOSLUK;

  const oran = surukleme ?? (checked ? 1 : 0);
  const x = kapaliX + (acikX - kapaliX) * oran;

  const pointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    baslangic.current = { x: e.clientX, tasindi: false };
    // Parmak anahtarın dışına çıksa da olayları almaya devam edelim; yoksa
    // hızlı bir kaydırmada topuz yarı yolda takılı kalıyordu.
    ref.current?.setPointerCapture(e.pointerId);
  };

  const pointerMove = (e: React.PointerEvent) => {
    const bas = baslangic.current;
    if (!bas || disabled) return;
    const fark = e.clientX - bas.x;
    if (Math.abs(fark) > 2) bas.tasindi = true;
    const mesafe = acikX - kapaliX;
    const yeni = Math.min(1, Math.max(0, (checked ? 1 : 0) + fark / mesafe));
    setSurukleme(yeni);
  };

  const pointerUp = (e: React.PointerEvent) => {
    const bas = baslangic.current;
    baslangic.current = null;
    ref.current?.releasePointerCapture?.(e.pointerId);
    if (!bas || disabled) return;

    const sonOran = surukleme;
    setSurukleme(null);
    // Taşınmadıysa bu bir tıklamadır: doğrudan çevir.
    if (!bas.tasindi || sonOran === null) {
      onChange(!checked);
      return;
    }
    const yeniDurum = sonOran >= 0.5;
    if (yeniDurum !== checked) onChange(yeniDurum);
  };

  return (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={() => {
        baslangic.current = null;
        setSurukleme(null);
      }}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          if (!disabled) onChange(!checked);
        }
        // Ok tuşları da beklenen davranış: role="switch" için standart.
        if (e.key === "ArrowRight" && !checked) onChange(true);
        if (e.key === "ArrowLeft" && checked) onChange(false);
      }}
      style={{
        position: "relative",
        boxSizing: "border-box",
        width: g,
        height: y,
        flexShrink: 0,
        padding: 0,
        borderRadius: y,
        // Kapalı hâlin rayı zemin rengi DEĞİL: açık temada zemin neredeyse
        // beyaz ve anahtar, beyaz topuzuyla birlikte sayfada kayboluyordu.
        // Kenarlık çizgisi de biraz koyu, yoksa ray yalnızca bir gölge gibi
        // duruyor ve tıklanabilir görünmüyor.
        border: `1px solid ${checked ? c.accent : `${c.textSecondary}55`}`,
        background: checked ? c.accent : c.border,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        // Sürüklerken geçiş kapalı: topuz parmağın gerisinden gelmemeli.
        transition: surukleme === null ? "background 160ms ease, border-color 160ms ease" : "none",
        touchAction: "pan-y",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <span
        style={{
          position: "absolute",
          // Dikey ortalama kutu modelinden BAĞIMSIZ: piksel hesabı yapılsaydı
          // kenarlık kalınlığı değiştiğinde topuz sessizce kayardı.
          top: "50%",
          left: 0,
          width: top,
          height: top,
          borderRadius: "50%",
          // Topuz HER İKİ TEMADA DA beyaz: koyu temada yüzey rengi (#1B2028)
          // kullanılınca bronz rayın üstünde topuz değil DELİK gibi görünüyordu.
          // Açık temada beyaz kalmasın diye ince bir kenarlık var.
          background: "#FFFFFF",
          border: "1px solid rgba(0,0,0,0.12)",
          boxSizing: "border-box",
          boxShadow: "0 1px 3px rgba(0,0,0,0.28)",
          transform: `translate(${x}px, -50%)`,
          transition: surukleme === null ? "transform 180ms cubic-bezier(0.2, 0.9, 0.3, 1)" : "none",
        }}
      />
    </button>
  );
}
