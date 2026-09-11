import type { Locale } from "@projelio/shared";

/**
 * Tüm Projelio e-postalarının dış kabuğu: gövde rengi, kart, marka paleti.
 *
 * NEDEN AYRI DOSYA: kabuk email.service.ts içindeydi ve oradaki `emailLayout`
 * "başlık + paragraf + tek düğme" biçimine kilitliydi — doğrulama ve şifre
 * sıfırlama için doğru, bildirim özeti için değil (orada bir LİSTE var).
 * İkinci bir şablon yazmak markayı ikiye bölerdi; kabuk ayrılınca iki şablon
 * da aynı kartın içinde duruyor.
 *
 * Renkler README'deki paletten: Slate Navy #3E4858, Bronz Kehribar #C0813F.
 * packages/shared/theme.ts'ten okunmuyor çünkü oradaki palet arayüz için
 * (CSS değişkenleri, koyu tema); e-posta istemcisinin teması yok, tek ve sabit
 * bir aydınlık görünüm gerekiyor.
 *
 * NOT: stiller bilerek satır içi (inline) — e-posta istemcilerinin çoğu
 * <style> bloklarını ve harici CSS'i yok sayar.
 */

/**
 * Marka renkleri. Alan adları `metin` DEĞİL `yazi…`: backend'in çevrilebilir
 * metin tipi `{ metin, params }` biçiminde ve dil denetimi
 * (scripts/dil-denetimi.mjs) `metin:` gören her nesneyi çeviri anahtarı
 * sanıyor — palet "#3E4858 çevrilmemiş" diye rapora düşüyordu.
 */
export const MARKA = {
  yaziKoyu: "#3E4858",
  yaziOrta: "#5A6472",
  yaziSoluk: "#8A929E",
  vurgu: "#C0813F",
  cizgi: "#E6E8EC",
  zemin: "#F4F5F7",
  kart: "#ffffff",
} as const;

export function epostaKabugu(locale: Locale, icerikHtml: string, genislik = 480): string {
  return `<!doctype html>
<html lang="${locale}">
  <body style="margin:0;padding:24px;background:${MARKA.zemin};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:${genislik}px;margin:0 auto;background:${MARKA.kart};border-radius:14px;padding:32px;">
      <tr>
        <td>
${icerikHtml}
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * HTML'e gömülecek kullanıcı metnini kaçırır.
 *
 * ŞART: bildirim e-postasındaki başlıklar kullanıcı verisidir (görev adı, yorum
 * özeti, dosya adı). `<` içeren bir görev başlığı, kaçırılmazsa e-postanın geri
 * kalanını bozar — ve kötü niyetli bir başlık başka bir kullanıcının gelen
 * kutusunda bağlantıya dönüşebilirdi. Auth şablonlarında buna gerek yok:
 * oradaki tek değişken sunucunun ürettiği bağlantı.
 */
export function kacir(metin: string): string {
  return metin
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
