import { site } from "./site";

/**
 * İletişim formundan çıkan iki e-posta:
 *  1. notificationEmail — size gelen bildirim (ham veri, sade)
 *  2. autoReplyEmail    — gönderene giden "mesajınızı aldık" yanıtı (markalı)
 *
 * Metinleri değiştirmek için aşağıdaki `copy` nesnesini düzenlemeniz yeterli.
 */

const NAVY = "#3e4858";
const NAVY_DEEP = "#232a34";
const BRONZE = "#c0813f";
const PAPER = "#fbfaf8";
const TEXT = "#1b2029";
const SOFT = "#5a6472";
const LINE = "#e6e2dc";

export type ContactData = {
  name: string;
  email: string;
  company?: string;
  phone?: string;
  subject?: string;
  message: string;
  locale: string;
};

const copy = {
  tr: {
    subject: "Mesajınızı aldık — Projelio",
    preheader: "Mesajınız bize ulaştı. Hafta içi genelde aynı gün dönüyoruz.",
    greeting: (name: string) => `Merhaba ${name},`,
    body: [
      "Projelio'ya yazdığınız için teşekkürler. Mesajınız ekibimize ulaştı.",
      "Hafta içi mesajlara genelde aynı gün, en geç bir iş günü içinde dönüyoruz. Acil bir konuysa bu e-postayı doğrudan yanıtlayabilirsiniz.",
    ],
    summaryTitle: "Bize ilettiğiniz mesaj",
    labels: { subject: "Konu", message: "Mesajınız" },
    ctaTitle: "Beklerken bakabilirsiniz",
    links: [
      { label: "Lio'yu deneyin", href: `${site.url}/tr#demo` },
      { label: "Paketler ve fiyatlar", href: `${site.url}/tr/pricing` },
      { label: "Sık sorulan sorular", href: `${site.url}/tr/faq` },
    ],
    signature: "Projelio ekibi",
    footerNote:
      "Bu e-posta, projelio.app üzerindeki iletişim formunu doldurduğunuz için gönderildi. Formu siz doldurmadıysanız bu mesajı yok sayabilirsiniz.",
  },
  en: {
    subject: "We got your message — Projelio",
    preheader: "Your message reached us. On weekdays we usually reply the same day.",
    greeting: (name: string) => `Hi ${name},`,
    body: [
      "Thanks for writing to Projelio. Your message has reached our team.",
      "On weekdays we usually reply the same day, and within one business day at the latest. If it's urgent, you can reply directly to this email.",
    ],
    summaryTitle: "What you sent us",
    labels: { subject: "Subject", message: "Your message" },
    ctaTitle: "While you wait",
    links: [
      { label: "Try Lio", href: `${site.url}/en#demo` },
      { label: "Plans and pricing", href: `${site.url}/en/pricing` },
      { label: "Frequently asked questions", href: `${site.url}/en/faq` },
    ],
    signature: "The Projelio team",
    footerNote:
      "You're receiving this because you filled in the contact form on projelio.app. If that wasn't you, please ignore this message.",
  },
};

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const nl2br = (s: string) => esc(s).replace(/\n/g, "<br />");

/** Gönderene giden otomatik yanıt. */
export function autoReplyEmail(data: ContactData) {
  const t = copy[data.locale === "en" ? "en" : "tr"];
  const firstName = data.name.trim().split(/\s+/)[0] || data.name;

  const html = `<!DOCTYPE html>
<html lang="${data.locale === "en" ? "en" : "tr"}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(t.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${PAPER};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(t.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${LINE};border-radius:16px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

      <tr><td style="background:${NAVY_DEEP};padding:26px 30px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="padding-right:12px;">
            <img src="${site.url}/brand/icon-192.png" width="34" height="34" alt="" style="display:block;border:0;" />
          </td>
          <td style="color:#ffffff;font-size:19px;font-weight:700;letter-spacing:-0.02em;">Projelio</td>
        </tr></table>
      </td></tr>

      <tr><td style="padding:32px 30px 8px;">
        <p style="margin:0 0 18px;font-size:17px;font-weight:600;color:${TEXT};">${esc(t.greeting(firstName))}</p>
        ${t.body
          .map(
            (p) =>
              `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:${SOFT};">${esc(p)}</p>`,
          )
          .join("")}
      </td></tr>

      <tr><td style="padding:14px 30px 4px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};border:1px solid ${LINE};border-radius:12px;">
          <tr><td style="padding:18px 20px;">
            <p style="margin:0 0 12px;font-size:11px;font-weight:700;letter-spacing:0.09em;text-transform:uppercase;color:${BRONZE};">${esc(t.summaryTitle)}</p>
            ${
              data.subject
                ? `<p style="margin:0 0 10px;font-size:13px;color:${SOFT};"><strong style="color:${TEXT};">${esc(t.labels.subject)}:</strong> ${esc(data.subject)}</p>`
                : ""
            }
            <p style="margin:0 0 6px;font-size:13px;color:${TEXT};font-weight:600;">${esc(t.labels.message)}</p>
            <p style="margin:0;font-size:14px;line-height:1.6;color:${SOFT};">${nl2br(data.message)}</p>
          </td></tr>
        </table>
      </td></tr>

      <tr><td style="padding:26px 30px 6px;">
        <p style="margin:0 0 12px;font-size:11px;font-weight:700;letter-spacing:0.09em;text-transform:uppercase;color:${BRONZE};">${esc(t.ctaTitle)}</p>
        ${t.links
          .map(
            (l) =>
              `<p style="margin:0 0 9px;font-size:14px;"><a href="${l.href}" style="color:${NAVY};text-decoration:underline;">${esc(l.label)}</a></p>`,
          )
          .join("")}
      </td></tr>

      <tr><td style="padding:24px 30px 30px;">
        <p style="margin:0;font-size:15px;color:${TEXT};">${esc(t.signature)}</p>
      </td></tr>

      <tr><td style="background:${PAPER};border-top:1px solid ${LINE};padding:18px 30px;">
        <p style="margin:0 0 6px;font-size:12px;color:${SOFT};">
          <a href="${site.url}" style="color:${NAVY};text-decoration:none;font-weight:600;">projelio.app</a>
          &nbsp;·&nbsp;
          <a href="mailto:${site.email}" style="color:${SOFT};text-decoration:none;">${site.email}</a>
        </p>
        <p style="margin:0;font-size:11px;line-height:1.5;color:#8a93a1;">${esc(t.footerNote)}</p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;

  const text = [
    t.greeting(firstName),
    "",
    ...t.body,
    "",
    `${t.summaryTitle}:`,
    data.subject ? `${t.labels.subject}: ${data.subject}` : "",
    data.message,
    "",
    ...t.links.map((l) => `${l.label}: ${l.href}`),
    "",
    t.signature,
    site.url,
  ]
    .filter(Boolean)
    .join("\n");

  return { subject: t.subject, html, text };
}

/** Size gelen bildirim e-postası. */
export function notificationEmail(data: ContactData) {
  const rows: [string, string][] = [
    ["Ad Soyad", data.name],
    ["E-posta", data.email],
    ["Şirket", data.company || "—"],
    ["Telefon", data.phone || "—"],
    ["Konu", data.subject || "—"],
    ["Dil", data.locale],
  ];

  const html = `<!DOCTYPE html><html><body style="margin:0;background:${PAPER};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px;">
 <tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid ${LINE};border-radius:14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;overflow:hidden;">
   <tr><td style="background:${NAVY};color:#fff;padding:16px 22px;font-size:15px;font-weight:600;">
     Yeni iletişim formu mesajı
   </td></tr>
   <tr><td style="padding:20px 22px 6px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
     ${rows
       .map(
         ([k, v]) =>
           `<tr><td style="padding:6px 0;color:${SOFT};width:110px;vertical-align:top;">${esc(k)}</td><td style="padding:6px 0;color:${TEXT};font-weight:600;">${esc(v)}</td></tr>`,
       )
       .join("")}
    </table>
   </td></tr>
   <tr><td style="padding:12px 22px 24px;">
    <div style="background:${PAPER};border:1px solid ${LINE};border-radius:10px;padding:16px 18px;font-size:14px;line-height:1.6;color:${TEXT};">
      ${nl2br(data.message)}
    </div>
    <p style="margin:16px 0 0;font-size:13px;">
      <a href="mailto:${esc(data.email)}" style="color:${BRONZE};font-weight:600;text-decoration:none;">↩︎ Doğrudan yanıtla</a>
    </p>
   </td></tr>
  </table>
 </td></tr>
</table>
</body></html>`;

  const text = [
    ...rows.map(([k, v]) => `${k.padEnd(9)}: ${v}`),
    "",
    data.message,
  ].join("\n");

  return {
    subject: `Projelio iletişim · ${data.subject || "Yeni mesaj"} · ${data.name}`,
    html,
    text,
  };
}
