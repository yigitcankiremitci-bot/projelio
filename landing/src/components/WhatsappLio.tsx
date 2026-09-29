import type { Dict } from "@/i18n";
import { waLink } from "@/lib/site";
import { WhatsApp } from "./Icons";

/**
 * Sağ altta sabit, yalnızca WhatsApp logosu olan yuvarlak düğme (ipucu: "Lio ile WhatsApp'tan konuş").
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
      title={dict.common.whatsappLio}
    >
      <WhatsApp size={30} />
    </a>
  );
}
