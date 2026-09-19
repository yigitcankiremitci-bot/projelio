import type { Locale } from "@projelio/shared";
import { cevirmen } from "../../common/i18n";
import { epostaKabugu, kacir, MARKA } from "../auth/email-shell";
import type { BildirimEpostasi } from "./notification-email.template";
import type { Ipucu } from "./ipucu.icerik";

/**
 * İpucu ve yönetici e-postalarının (toplu/tekil) ortak görünümü.
 *
 * Bildirim şablonundan AYRI, çünkü biçimi bambaşka: orada bir liste var,
 * burada tek bir fikir, birkaç paragraf ve tek bir düğme. Ortak olan kabuk
 * (auth/email-shell.ts) ve List-Unsubscribe çifti.
 *
 * METİN ZATEN HAZIR GELİR: çeviri (koddaki ipucu) ya da Lio'nun yeniden
 * yazımı çağıran tarafta yapılıyor. Burada yalnızca biçim var — böylece
 * yönetici metni, Lio metni ve koddaki ipucu aynı yoldan geçiyor.
 *
 * ABONELİKTEN ÇIKIŞ İPUCU/DUYURUYA ÖZGÜ: "aboneliği bırak" yalnızca ipucu ve
 * duyuruları kapatır. Bildirim e-postalarını da kapatsaydı, "ipucu
 * istemiyorum" diyen kişi görev atamalarından habersiz kalırdı.
 */

export interface HazirMetin {
  konu: string;
  baslik: string;
  govde: string;
  dugme?: string;
}

function tamAdres(webUrl: string, link: string): string {
  if (/^https?:\/\//i.test(link)) return link;
  return `${webUrl}${link.startsWith("/") ? "" : "/"}${link}`;
}

export function bilgiEpostasiOlustur(params: {
  locale: Locale;
  metin: HazirMetin;
  /** Başlığın üstündeki küçük etiket ("İpucu 3/14"). */
  ustEtiket?: string;
  link?: string;
  webUrl: string;
  /** Selam satırı. Lio metni kendi selamını yazıyorsa verilmez. */
  ad?: string;
  /** Alttaki açıklama; yoksa yalnızca ayar bağlantısı görünür. */
  altNot?: string;
  abonelikAdresi?: string;
}): BildirimEpostasi {
  const t = cevirmen(params.locale);
  const { metin } = params;
  const paragraflar = metin.govde
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const adres = params.link ? tamAdres(params.webUrl, params.link) : null;
  const selamHtml = params.ad ? t("Merhaba {ad},", { ad: kacir(params.ad) }) : "";
  const selamMetin = params.ad ? t("Merhaba {ad},", { ad: params.ad }) : "";
  const ayarAdresi = `${params.webUrl}/settings?sekme=yardimcilar`;
  const kapatBagi = params.abonelikAdresi
    ? ` &nbsp;·&nbsp; <a href="${kacir(params.abonelikAdresi)}" style="color:${MARKA.yaziSoluk};">${t("İpuçlarını artık gönderme")}</a>`
    : "";

  // Metin HTML değil düz metin: kaçırılıyor, tek satır sonları <br> oluyor.
  const paragrafHtml = paragraflar
    .map(
      (p) =>
        `          <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:${MARKA.yaziOrta};">${kacir(p).replace(/\n/g, "<br>")}</p>`
    )
    .join("\n");
  const dugmeHtml =
    adres && metin.dugme
      ? `          <p style="margin:8px 0 0;">
            <a href="${kacir(adres)}"
               style="display:inline-block;background:${MARKA.yaziKoyu};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px;font-weight:500;">
              ${kacir(metin.dugme)}
            </a>
          </p>`
      : "";

  const html = epostaKabugu(
    params.locale,
    `${params.ustEtiket ? `          <div style="margin:0 0 6px;font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${MARKA.vurgu};">${kacir(params.ustEtiket)}</div>\n` : ""}          <h1 style="margin:0 0 14px;font-size:22px;font-weight:600;color:${MARKA.yaziKoyu};">${kacir(metin.baslik)}</h1>
${selamHtml ? `          <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${MARKA.yaziOrta};">${selamHtml}</p>\n` : ""}${paragrafHtml}
${dugmeHtml}
          <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:${MARKA.yaziSoluk};border-top:1px solid ${MARKA.cizgi};padding-top:16px;">
            ${params.altNot ? `${kacir(params.altNot)}<br>` : ""}
            <a href="${kacir(ayarAdresi)}" style="color:${MARKA.vurgu};">${t("E-posta ayarları")}</a>${kapatBagi}
          </p>`,
    560
  );

  const satirlar: string[] = [];
  if (params.ustEtiket) satirlar.push(params.ustEtiket);
  satirlar.push(metin.baslik, "");
  if (selamMetin) satirlar.push(selamMetin, "");
  for (const p of paragraflar) satirlar.push(p, "");
  if (adres && metin.dugme) satirlar.push(`${metin.dugme}: ${adres}`, "");
  if (params.altNot) satirlar.push(params.altNot);
  satirlar.push(ayarAdresi);
  if (params.abonelikAdresi) satirlar.push("", `${t("İpuçlarını artık gönderme")}: ${params.abonelikAdresi}`);

  const headers = params.abonelikAdresi
    ? {
        "List-Unsubscribe": `<${params.abonelikAdresi}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      }
    : undefined;

  return { subject: metin.konu, html, text: satirlar.join("\n"), headers };
}

/**
 * Koddaki (ya da yöneticinin yazdığı) ipucunu kullanıcının diline çevirip
 * hazır metne dönüştürür. Yönetici metni sözlükte yoksa olduğu gibi kalır.
 */
export function ipucuMetni(locale: Locale, ipucu: Pick<Ipucu, "baslik" | "govde" | "dugme">): HazirMetin {
  const t = cevirmen(locale);
  const baslik = t(ipucu.baslik);
  return { konu: t("Projelio ipucu: {baslik}", { baslik }), baslik, govde: t(ipucu.govde), dugme: t(ipucu.dugme) };
}

export function ipucuEpostasiOlustur(params: {
  locale: Locale;
  ipucu: Ipucu;
  /** Lio'nun bu kişi için yazdığı metin; yoksa ipucunun kendisi (çevrilmiş). */
  metin?: HazirMetin;
  /** 1'den başlayan sıra — "3/14" göstergesi için. */
  sira: number;
  toplam: number;
  webUrl: string;
  ad?: string;
  abonelikAdresi?: string;
}): BildirimEpostasi {
  const t = cevirmen(params.locale);
  return bilgiEpostasiOlustur({
    locale: params.locale,
    metin: params.metin ?? ipucuMetni(params.locale, params.ipucu),
    ustEtiket: t("İpucu {sira}/{toplam}", { sira: params.sira, toplam: params.toplam }),
    link: params.ipucu.link,
    webUrl: params.webUrl,
    // Lio metni kendi selamını yazıyor; üstüne ikinci bir "Merhaba" eklenmez.
    ad: params.metin ? undefined : params.ad,
    altNot: t(
      "Bu e-postaları Projelio'yu yeni kullanmaya başlayanlara, günde bir tane olmak üzere gönderiyoruz. Dizi {toplam} ipucunda biter.",
      { toplam: params.toplam }
    ),
    abonelikAdresi: params.abonelikAdresi,
  });
}
