/**
 * Yönetici mesajlarının GÖNDEREN adresi: "Projelio Destek <destek@projelio.app>".
 *
 * NEDEN bildirim@ DEĞİL: yönetici mesajı kişiye yazılmış bir mektup; yanıt
 * gelmesi beklenir. `bildirim@` otomatik özetlerin adresi ve yanıt verilemeyen
 * bir adresten gelen kişisel mesaj Gmail'in gözünde toplu posta gibi durur.
 * Gerçek bir posta kutusundan (Google Workspace) gelen ve yanıtlanan e-posta
 * zamanla gönderen itibarını yükseltir — spam'e düşmemenin DNS kayıtlarından
 * sonraki en etkili yolu bu.
 *
 * Öncelik:
 *   1. EMAIL_FROM_DESTEK tanımlıysa o.
 *   2. EMAIL_FROM doğrulanmış bir alan adındaysa aynı alan adında destek@.
 *   3. Hiçbiri yoksa null — çağıran varsayılan gönderene düşer. EMAIL_FROM
 *      Resend kum havuzundaysa (resend.dev) orada destek@ diye bir adres
 *      yok, uydurmak her gönderimi 403'e çevirirdi.
 */
export function destekGondereni(
  emailFrom: string | undefined,
  emailFromDestek: string | undefined
): { from: string; replyTo: string } | null {
  const acik = emailFromDestek?.trim();
  if (acik) {
    const adres = adresiAyikla(acik);
    return adres ? { from: acik, replyTo: adres } : null;
  }
  const temel = adresiAyikla(emailFrom?.trim() ?? "");
  if (!temel) return null;
  const alan = temel.split("@")[1]?.toLowerCase();
  if (!alan || alan === "resend.dev" || alan.endsWith(".resend.dev")) return null;
  const adres = `destek@${alan}`;
  return { from: `Projelio Destek <${adres}>`, replyTo: adres };
}

/** "Ad <a@b.com>" ya da "a@b.com" → "a@b.com". Geçersizse null. */
export function adresiAyikla(deger: string): string | null {
  const m = deger.match(/<([^<>\s]+@[^<>\s]+)>\s*$/) ?? deger.match(/^([^<>\s]+@[^<>\s]+)$/);
  return m ? m[1] : null;
}
