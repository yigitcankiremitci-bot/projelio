import { safeExternalUrl } from "@projelio/shared";

/**
 * Lio'nun yanıtındaki bağlantıları tıklanabilir parçalara ayırır.
 *
 * NEDEN GEREKLİ: sohbet balonu metni `white-space: pre-wrap` ile düz metin
 * olarak basıyor. Lio bir dosya paylaştığında ekranda yan yana iki çirkinlik
 * çıkıyordu — ham Drive adresi satırı taşırıyor, kullanıcı da adresi elle
 * seçip kopyalamak zorunda kalıyordu. Oysa tıklanacak şey dosyanın ADI olmalı.
 *
 * NEDEN MARKDOWN KÜTÜPHANESİ DEĞİL: ihtiyaç tek bir şey — bağlantı. Bütün bir
 * markdown motoru (ve onun HTML üreten yüzeyi) hem bağımlılık hem de XSS için
 * yeni bir kapı demek. Burada HTML hiç üretilmiyor: sonuç React'in kendisi
 * kaçırdığı düz metin parçaları ve href'i doğrulanmış bağlantılardan ibaret.
 *
 * Adresler `safeExternalUrl`den geçer: modelin ürettiği (ya da bir dosya adına
 * gizlenmiş) `javascript:` adresi tıklandığında sayfanın kendi kökeninde kod
 * çalıştırırdı — jeton localStorage'da durduğu için sonuç hesap ele geçirmedir.
 * Doğrulamadan geçmeyen adres bağlantıya çevrilmez, olduğu gibi metin kalır.
 */
export type MessageSegment =
  | { type: "text"; value: string }
  | { type: "link"; label: string; href: string };

/**
 * Hem `[ad](adres)` hem de çıplak `https://…` yakalanır: modele "adı bağlantı
 * yap" densе de eski sohbetlerde ve bazı yanıtlarda ham adres geçmeye devam
 * ediyor; onu da tıklanabilir yapmak kullanıcı için aynı kazanç.
 */
const LINK_PATTERN = /\[([^\]\n]+)\]\(([^()\s]+)\)|(https?:\/\/[^\s<>[\]()]+)/g;

/**
 * Çıplak adresin sonuna yapışan noktalama.
 *
 * "…/view?usp=drivesdk." cümlesinde nokta adrese ait değil cümleye ait; adrese
 * dahil edilirse bağlantı kırılır.
 */
const TRAILING_PUNCTUATION = /[.,;:!?'")\]]+$/;

export function parseMessageLinks(text: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  LINK_PATTERN.lastIndex = 0;
  while ((match = LINK_PATTERN.exec(text)) !== null) {
    const bare = match[3];
    const rawHref = bare ? bare.replace(TRAILING_PUNCTUATION, "") : match[2];
    const label = bare ? rawHref : match[1];
    const href = safeExternalUrl(rawHref);
    if (!href) continue;

    const start = match.index;
    // Çıplak adreste kırpılan noktalama METNE geri döner, bu yüzden bitiş
    // eşleşmenin sonu değil adresin sonu.
    const end = bare ? start + rawHref.length : start + match[0].length;

    if (start > cursor) segments.push({ type: "text", value: text.slice(cursor, start) });
    segments.push({ type: "link", label, href });
    cursor = end;
    LINK_PATTERN.lastIndex = end;
  }

  if (cursor < text.length) segments.push({ type: "text", value: text.slice(cursor) });
  return segments;
}
