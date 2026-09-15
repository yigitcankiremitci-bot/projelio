import { adresiAyikla } from "../auth/destek-gondereni";

/**
 * Dosya indirme linklerinin GÖNDEREN adresi: "Projelio <link@projelio.app>".
 *
 * NEDEN bildirim@ DEĞİL: bu e-posta bir bildirim değil, kişiye gönderilen bir
 * dosya paylaşımı. Alıcı çoğu zaman Projelio'yu hiç duymamış biri; gelen
 * kutusunda "link@" adresi, mesajın ne olduğunu konu satırından önce söylüyor.
 * Ayrı adres aynı zamanda gönderen itibarını ayırıyor: toplu bildirimler
 * yüzünden bir filtreye takılsa bile dosya paylaşımları etkilenmiyor.
 *
 * `replyTo` BURADA ÜRETİLMEZ: yanıtın gitmesi gereken yer paylaşan kişinin
 * kendi adresi, servisin bilmediği bir şey değil ama sabit de değil
 * (bkz. FileDownloadLinksService.sendByEmail). destekGondereni'nden ayrılan tek
 * nokta bu.
 *
 * Öncelik:
 *   1. EMAIL_FROM_LINK tanımlıysa o.
 *   2. EMAIL_FROM doğrulanmış bir alan adındaysa aynı alan adında link@.
 *   3. Hiçbiri yoksa null — çağıran varsayılan gönderene düşer. EMAIL_FROM
 *      Resend kum havuzundaysa (resend.dev) orada link@ diye bir adres yok;
 *      uydurmak her gönderimi 403'e çevirirdi.
 */
export function linkGondereni(
  emailFrom: string | undefined,
  emailFromLink: string | undefined
): string | null {
  const acik = emailFromLink?.trim();
  if (acik) return adresiAyikla(acik) ? acik : null;

  const temel = adresiAyikla(emailFrom?.trim() ?? "");
  if (!temel) return null;
  const alan = temel.split("@")[1]?.toLowerCase();
  if (!alan || alan === "resend.dev" || alan.endsWith(".resend.dev")) return null;
  return `Projelio <link@${alan}>`;
}
