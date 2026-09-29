import type { Dict } from "@/i18n";
import { waLink } from "@/lib/site";
import { WhatsApp } from "./Icons";

/**
 * Sağ altta sabit "Lio ile WhatsApp'tan konuş" düğmesi.
 *
 * Numaraya önceden yazılmış bir mesajla gider: kişi yalnızca "Gönder"e basar
 * ve Lio'nun karşılama akışı (backend whatsapp-pazarlama.ts) başlar. Numara
 * boşsa (waLink "#" döner) düğme hiç çizilmez — kırık link olmaz.
 */
export default function WhatsappLio({ dict }: { dict: Dict }) {
  const href = waLink(dict.common.whatsappLioText);
  if (href === "#") return null;
  return (
    <a
      className="wa-lio"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={dict.common.whatsappLioAria}
    >
      <span className="wa-lio-ikon">
        <WhatsApp size={22} />
      </span>
      <span className="wa-lio-yazi">{dict.common.whatsappLio}</span>
    </a>
  );
}
