import type { Dict } from "@/i18n";
import { site } from "@/lib/site";

/**
 * "Google Play'den indirin" rozeti.
 *
 * Google'ın resmî rozet görselini dosya olarak eklemek yerine aynı düzen
 * (siyah zemin, renkli Play üçgeni, üstte küçük satır, altta "Google Play")
 * CSS ile çiziliyor: dil başına ayrı PNG tutmak gerekmiyor ve metin
 * sözlükten geliyor. "Google Play" adı çevrilmez — marka adı.
 */
export default function GooglePlayBadge({ dict, compact = false }: { dict: Dict; compact?: boolean }) {
  return (
    <a
      className={compact ? "store-badge store-badge-sm" : "store-badge"}
      href={site.googlePlay}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={dict.common.googlePlayAria}
    >
      <svg className="store-badge-icon" viewBox="0 0 24 26" aria-hidden="true">
        <path d="M1.2.6 13.4 12.9 1.2 25.2C.8 24.9.6 24.4.6 23.8V2C.6 1.4.8.9 1.2.6Z" fill="#00d7fe" />
        <path d="m17.5 8.8-4.1 4.1 4.1 4.1 4.6-2.6c1.3-.8 1.3-2.1 0-2.9l-4.6-2.7Z" fill="#ffce00" />
        <path d="M17.5 17 13.4 12.9 1.2 25.2c.5.5 1.2.5 2.1 0L17.5 17Z" fill="#f73448" />
        <path d="M17.5 8.8 3.3.7C2.4.2 1.7.2 1.2.6l12.2 12.3 4.1-4.1Z" fill="#00f076" />
      </svg>
      <span className="store-badge-text">
        <small>{dict.common.googlePlayKicker}</small>
        <strong>Google Play</strong>
      </span>
    </a>
  );
}
