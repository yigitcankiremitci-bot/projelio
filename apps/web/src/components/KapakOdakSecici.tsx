import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { kapakDosyaAdresi, VARSAYILAN_KAPAK_ODAGI, type KapakOdagi } from "@projelio/shared";
import { useThemeColors } from "../theme/useThemeColors";
import { useT } from "../lib/i18n";

interface Props {
  /** Fotoğrafın adresi (odak eki varsa yok sayılır) ya da yerel önizleme adresi. */
  src: string;
  odak: KapakOdagi;
  /** Sürüklerken her adımda çağrılır — önizlemeler canlı güncellensin. */
  onChange: (odak: KapakOdagi) => void;
  /**
   * Kullanıcı bıraktığında (parmak/fare kalkınca, ok tuşu, "Ortala") çağrılır.
   * Kaydı hemen sunucuya yazan yüzeyler (departman ayarları) bunu dinler;
   * sürükleme boyunca onlarca istek atılmasın.
   */
  onCommit?: (odak: KapakOdagi) => void;
}

/**
 * Kapak fotoğrafının hangi kısmının görüneceğini seçtiren alan.
 *
 * Fotoğrafın TAMAMI gösterilir, kullanıcı görünmesini istediği yere (genelde
 * yüzlere) dokunur ya da işareti sürükler. Kırpma çerçevesi yerine odak
 * noktası seçtirmenin nedeni: kapak her yüzeyde başka orana kırpılıyor
 * (sayfada ~5:1, kartta 3:1); tek bir çerçeve ancak tek bir oranı doğru
 * gösterirdi. Seçilen nokta ise her oranda kutunun içinde kalır
 * (bkz. packages/shared kapakOdagi). Altındaki iki önizleme bunu gösteriyor.
 */
export default function KapakOdakSecici({ src, odak, onChange, onCommit }: Props) {
  const c = useThemeColors();
  const t = useT();
  const alanRef = useRef<HTMLDivElement>(null);
  const surukleniyor = useRef(false);
  const sonOdak = useRef(odak);
  sonOdak.current = odak;
  const dosya = kapakDosyaAdresi(src);

  const noktadanOdak = (clientX: number, clientY: number): KapakOdagi => {
    const r = alanRef.current!.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * 100;
    const y = ((clientY - r.top) / r.height) * 100;
    return { x: Math.round(Math.min(100, Math.max(0, x))), y: Math.round(Math.min(100, Math.max(0, y))) };
  };

  const basla = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    surukleniyor.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    onChange(noktadanOdak(e.clientX, e.clientY));
  };
  const surukle = (e: PointerEvent<HTMLDivElement>) => {
    if (!surukleniyor.current) return;
    onChange(noktadanOdak(e.clientX, e.clientY));
  };
  const birak = (e: PointerEvent<HTMLDivElement>) => {
    if (!surukleniyor.current) return;
    surukleniyor.current = false;
    const son = noktadanOdak(e.clientX, e.clientY);
    onChange(son);
    onCommit?.(son);
  };

  // Klavyeyle de seçilebilsin: ok tuşları 2'şer, Shift ile 10'ar yüzde.
  const tus = (e: KeyboardEvent<HTMLDivElement>) => {
    const adim = e.shiftKey ? 10 : 2;
    const yon: Record<string, [number, number]> = {
      ArrowLeft: [-adim, 0],
      ArrowRight: [adim, 0],
      ArrowUp: [0, -adim],
      ArrowDown: [0, adim],
    };
    const d = yon[e.key];
    if (!d) return;
    e.preventDefault();
    const yeni = {
      x: Math.min(100, Math.max(0, odak.x + d[0])),
      y: Math.min(100, Math.max(0, odak.y + d[1])),
    };
    onChange(yeni);
    onCommit?.(yeni);
  };

  const konum = `${odak.x}% ${odak.y}%`;
  const onizleme = (oran: string, etiket: string) => (
    <div style={{ flex: oran === "5 / 1" ? 5 : 3, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
      <div
        style={{
          aspectRatio: oran,
          borderRadius: 6,
          border: `1px solid ${c.border}`,
          background: `${konum}/cover no-repeat url(${dosya})`,
        }}
      />
      <span style={{ fontSize: 12, color: c.textSecondary }}>{etiket}</span>
    </div>
  );

  const ortada = odak.x === VARSAYILAN_KAPAK_ODAGI.x && odak.y === VARSAYILAN_KAPAK_ODAGI.y;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 13, color: c.textSecondary }}>
          {t("Görünmesini istediğin yere dokun ya da işareti sürükle — örneğin yüzlere.")}
        </span>
        {!ortada && (
          <button
            type="button"
            onClick={() => {
              onChange(VARSAYILAN_KAPAK_ODAGI);
              onCommit?.(VARSAYILAN_KAPAK_ODAGI);
            }}
            style={{
              flexShrink: 0,
              border: "none",
              background: "transparent",
              color: c.accentDark,
              fontSize: 13,
              padding: 0,
              cursor: "pointer",
            }}
          >
            {t("Ortala")}
          </button>
        )}
      </div>

      {/* Fotoğrafın tamamı: genişlik kutuya, yükseklik tavana göre küçülür.
          Sarmalayıcı görselin kendi ölçüsünde olsun diye inline-block; yoksa
          tıklanan nokta görselin dışındaki boşluğa denk gelebilirdi. */}
      <div style={{ display: "flex", justifyContent: "center", background: c.background, borderRadius: 8, padding: 6 }}>
        <div
          ref={alanRef}
          role="slider"
          tabIndex={0}
          aria-label={t("Kapak odak noktası")}
          aria-valuetext={`${odak.x}%, ${odak.y}%`}
          onPointerDown={basla}
          onPointerMove={surukle}
          onPointerUp={birak}
          onPointerCancel={birak}
          onKeyDown={tus}
          style={{
            position: "relative",
            display: "inline-block",
            lineHeight: 0,
            cursor: "crosshair",
            touchAction: "none",
            userSelect: "none",
            borderRadius: 6,
            overflow: "hidden",
          }}
        >
          <img
            src={dosya}
            alt=""
            draggable={false}
            style={{ display: "block", maxWidth: "100%", maxHeight: 220, pointerEvents: "none" }}
          />
          <span
            aria-hidden
            style={{
              position: "absolute",
              left: `${odak.x}%`,
              top: `${odak.y}%`,
              width: 26,
              height: 26,
              marginLeft: -13,
              marginTop: -13,
              borderRadius: "50%",
              border: "2px solid #fff",
              background: "rgba(26,31,41,0.25)",
              boxShadow: "0 0 0 1px rgba(26,31,41,0.45), 0 2px 8px rgba(0,0,0,0.35)",
              pointerEvents: "none",
            }}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        {onizleme("5 / 1", t("Sayfa kapağında"))}
        {onizleme("3 / 1", t("Kartta"))}
      </div>
    </div>
  );
}
