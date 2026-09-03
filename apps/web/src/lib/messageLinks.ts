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
  | { type: "link"; label: string; href: string }
  /**
   * Projelio'daki bir dosya. Yeni sekmeye GİTMEZ, uygulama içinde önizleme
   * penceresini açar (bkz. FilePreviewModal) — pencerede indirme ve
   * "Drive'da düzenle" zaten var, düzenleme yeni sekmeye oradan gidiyor.
   */
  | { type: "file"; label: string; fileId: string }
  /**
   * Lio'nun ÜRETTİĞİ rapor dosyası: `projelio:export/<kimlik>`.
   *
   * Dosya kitaplığındaki bir kayıt değil, sunucuda 30 dakika duran geçici bir
   * çıktı (bkz. backend ai-exports.service.ts). Önizlenecek bir şey yok,
   * tıklanınca doğrudan iner — bu yüzden "file"dan ayrı bir tür.
   */
  | { type: "export"; label: string; exportId: string };

/**
 * Hem `[ad](adres)` hem de çıplak `https://…` yakalanır: modele "adı bağlantı
 * yap" densе de eski sohbetlerde ve bazı yanıtlarda ham adres geçmeye devam
 * ediyor; onu da tıklanabilir yapmak kullanıcı için aynı kazanç.
 */
const LINK_PATTERN = /\[([^\]\n]+)\]\(([^()\s]+)\)|(https?:\/\/[^\s<>[\]()]+)/g;

/**
 * Uygulama içi dosya bağlantısı: `projelio:file/<kimlik>`.
 *
 * Modele Drive adresi yazdırmak yerine kendi şemamızı yazdırıyoruz; böylece
 * tıklama uygulamadan ÇIKMIYOR. Şema hiçbir zaman bir href'e konmuyor — bu
 * parçalar bağlantı değil düğme olarak çiziliyor — yani gezinme yüzeyi de
 * açmıyor. Kimlik UUID biçiminde değilse eşleşme sayılmaz: modelin uydurduğu
 * bir metin, var olmayan bir dosyaya tıklanabilir bir düğme üretmesin.
 */
const FILE_LINK = /^projelio:file\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** Üretilen rapor bağlantısı; kimlik yine UUID olmak zorunda (bkz. FILE_LINK). */
const EXPORT_LINK = /^projelio:export\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

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

    const internal = bare ? null : FILE_LINK.exec(rawHref);
    const exported = bare || internal ? null : EXPORT_LINK.exec(rawHref);
    const href = internal || exported ? null : safeExternalUrl(rawHref);
    if (!internal && !exported && !href) continue;

    const start = match.index;
    // Çıplak adreste kırpılan noktalama METNE geri döner, bu yüzden bitiş
    // eşleşmenin sonu değil adresin sonu.
    const end = bare ? start + rawHref.length : start + match[0].length;

    if (start > cursor) segments.push({ type: "text", value: text.slice(cursor, start) });
    segments.push(
      internal
        ? { type: "file", label, fileId: internal[1] }
        : exported
          ? { type: "export", label, exportId: exported[1] }
          : { type: "link", label, href: href! }
    );
    cursor = end;
    LINK_PATTERN.lastIndex = end;
  }

  if (cursor < text.length) segments.push({ type: "text", value: text.slice(cursor) });
  return segments;
}
