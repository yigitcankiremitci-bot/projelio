import type { Locale } from "@projelio/shared";
import { cevirmen } from "../../common/i18n";
import { epostaKabugu, kacir, MARKA } from "../auth/email-shell";

/**
 * Yöneticinin kullanıcıya yazdığı e-postanın şablonu.
 *
 * Başlık ve mesaj YÖNETİCİNİN yazdığı metin: çevrilmez, olduğu gibi gider.
 * Çevrilen yalnızca çerçeve (selam, alt not, düğme) — alıcının dilinde.
 *
 * KAÇIRMA: başlık, mesaj, ad ve bağlantı kullanıcı verisi sayılır ve HER ZAMAN
 * kaçırılır. Yönetici kendi paneli olsa da `<` içeren bir metin (ör. "<3 aylık
 * plan") kaçırılmazsa e-postanın kalanını bozar.
 *
 * Bildirim e-postalarındaki "aboneliği bırak" bağlantısı burada YOK: bu bir
 * hizmet mesajı (hesapla ilgili bilgilendirme), bildirim özeti değil. Pazarlama
 * amaçlı toplu gönderim için alıcıdan ayrıca izin gerekir (ETK/İYS) — bu araç
 * onun yerine geçmez; arayüzde de yazıyor.
 */
export function adminMesajEpostasiOlustur(params: {
  locale: Locale;
  baslik: string;
  mesaj: string;
  webUrl: string;
  /** Uygulama içi yol ya da https adresi (doğrulanmış). */
  link?: string;
  ad?: string;
}): { subject: string; html: string; text: string } {
  const t = cevirmen(params.locale);
  const adres = params.link ? tamAdres(params.webUrl, params.link) : params.webUrl;

  // Paragraflar boş satırla ayrılır; paragraf içindeki tek satır sonu korunur.
  const paragraflar = params.mesaj
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `          <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${MARKA.yaziOrta};">${kacir(p).replace(/\n/g, "<br>")}</p>`
    )
    .join("\n");

  const selamHtml = params.ad
    ? `          <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${MARKA.yaziOrta};">${t("Merhaba {ad},", { ad: kacir(params.ad) })}</p>\n`
    : "";
  const dugmeEtiketi = params.link ? t("Bağlantıyı aç") : t("Projelio'yu aç");
  const altNot = t("Bu mesaj Projelio yönetimi tarafından hesabınla ilgili olarak gönderildi.");

  const html = epostaKabugu(
    params.locale,
    `          <h1 style="margin:0 0 16px;font-size:22px;font-weight:600;color:${MARKA.yaziKoyu};">${kacir(params.baslik)}</h1>
${selamHtml}${paragraflar}
          <p style="margin:22px 0 0;">
            <a href="${kacir(adres)}"
               style="display:inline-block;background:${MARKA.yaziKoyu};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px;font-weight:500;">
              ${dugmeEtiketi}
            </a>
          </p>
          <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:${MARKA.yaziSoluk};border-top:1px solid ${MARKA.cizgi};padding-top:16px;">
            ${altNot}
          </p>`,
    560
  );

  const text = [
    params.baslik,
    "",
    params.ad ? t("Merhaba {ad},", { ad: params.ad }) : "",
    params.ad ? "" : null,
    params.mesaj,
    "",
    `${dugmeEtiketi}: ${adres}`,
    "",
    "—",
    altNot,
  ]
    .filter((satir) => satir !== null)
    .join("\n");

  // Konu satırı düz metin: kaçırma yok, ama satır sonu başlık enjeksiyonuna
  // (ek e-posta başlığı) yol açabileceği için boşluğa çevrilir.
  return { subject: `Projelio — ${params.baslik.replace(/[\r\n]+/g, " ")}`, html, text };
}

function tamAdres(webUrl: string, link: string): string {
  if (/^https:\/\//i.test(link)) return link;
  return `${webUrl}${link.startsWith("/") ? "" : "/"}${link}`;
}
