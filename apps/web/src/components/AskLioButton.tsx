import { askLioAbout, lioSubjectLabel } from "../lib/askLio";
import type { LioSubject } from "../lib/askLio";
import { useAppPrefs } from "../lib/appPrefs";
import { useTheme } from "../theme/ThemeProvider";

/**
 * "Lio'ya sor" simgesi. Moda göre İKİ AYRI DOSYA kullanılır:
 *
 *  - aydınlık: /lio-mascot.png — Lio'nun orijinal renkli hâli.
 *  - karanlık: /lio-face.svg   — beyaz yüz.
 *
 * Tek dosyayla olmuyor: beyaz yüz açık zeminde (#F7F8FA) kaybolurken, renkli
 * maskot koyu zeminde sönük kalıyor. İkisi de raster (svg olan bile base64
 * gömülü PNG taşıyor), yani CSS ile renk çevirmek de bir seçenek değil —
 * bu yüzden dosya değiştiriliyor.
 *
 * BOYUT UYARISI: gözler tuvalin yalnızca ~%16'sını kaplıyor; 20 px gibi küçük
 * ölçülerde ayrıntı neredeyse kaybolur. Bilinçli tercih (simge bu görsel
 * olacak); daha okunur bir sonuç istenirse gözleri vektör çizmek gerekir.
 */
export function LioMascotIcon({ size = 16 }: { size?: number }) {
  const { mode } = useTheme();
  return (
    <img
      src={mode === "dark" ? "/lio-face.svg" : "/lio-mascot.png"}
      alt=""
      aria-hidden
      width={size}
      height={size}
      style={{ display: "block" }}
    />
  );
}

interface Props {
  subject: LioSubject;
  /** Düğmenin kenar uzunluğu. Kart köşelerinde 24, başlık satırlarında 30 civarı. */
  size?: number;
  /** Kart zemininin üstünde dursun diye hafif bir daire zemin çizer. */
  withBackground?: boolean;
}

/**
 * "Bunu Lio'ya sor" — herhangi bir varlığın (görev, proje, iş, çıktı…) yanında
 * duran küçük Lio simgesi. Tıklanınca sağ alttaki Lio paneli açılır ve o varlık
 * hakkındaki açılış mesajı otomatik gönderilir (bkz. lib/askLio.ts).
 *
 * KART İÇİNDE KULLANIM: bu düğmelerin çoğu bir <Link> kartının İÇİNDE duruyor.
 * preventDefault + stopPropagation şart — yoksa Lio'yu açmak yerine (ya da
 * açmakla birlikte) karta tıklanmış sayılıp sayfa değişir.
 *
 * Lio Ayarlar > Yardımcılar'dan gizlendiyse bu düğme de çizilmez: AiLauncher
 * mount edilmediği için askLio olayını dinleyen kimse olmaz ve düğme sessizce
 * hiçbir şey yapmayan ölü bir kontrole dönüşürdü.
 */
export default function AskLioButton({ subject, size = 26, withBackground = false }: Props) {
  const { showLio } = useAppPrefs();
  const { mode } = useTheme();
  if (!showLio) return null;

  const dark = mode === "dark";

  const label = `${subject.title} — bu ${lioSubjectLabel(subject.kind)} hakkında Lio'ya sor`;

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        askLioAbout(subject);
      }}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        padding: 0,
        borderRadius: "50%",
        border: "none",
        background: withBackground ? (dark ? "rgba(18,21,27,0.72)" : "rgba(255,255,255,0.82)") : "transparent",
        boxShadow: withBackground
          ? dark
            ? "0 1px 4px rgba(0,0,0,0.4)"
            : "0 1px 4px rgba(26,31,41,0.18)"
          : "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        lineHeight: 0,
      }}
    >
      {/* Çizim, kutunun tamamını kullanır: gözler viewBox'ın ortasında zaten
          boşluklu duruyor, bir de küçültülünce iyice ufalıyordu. */}
      <LioMascotIcon size={size} />
    </button>
  );
}
