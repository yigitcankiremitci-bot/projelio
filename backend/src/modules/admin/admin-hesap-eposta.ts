import type { Locale } from "@projelio/shared";
import { cevirmen } from "../../common/i18n";
import { epostaKabugu, kacir, MARKA } from "../auth/email-shell";

/**
 * Admin panelinden açılan hesaba giden "Projelio hesabın hazır" e-postası.
 *
 * Ekip hesabı e-postasından (ekip-hesabi-eposta.ts) ayrı çünkü ortada bir
 * şirket ya da yönetici yok: kişiyi bir ekibe değil, Projelio'ya alıyoruz.
 * Bağlantı ve güvenlik sözleşmesi aynı (GirisBaglantisiService).
 *
 * ŞİFRE BU E-POSTADA YOK — gerekçe ekip-hesabi-eposta.ts başlığında. Admin
 * geçici bir şifre koyduysa onu kişiye kendisi iletir; kişi ilk girişte
 * kendi şifresini belirlemek zorunda.
 */

export interface AdminHesapEpostasi {
  alici: { ad: string; kullaniciAdi: string; eposta: string };
  girisUrl: string;
  dil: Locale;
}

export function adminHesapEpostasi(e: AdminHesapEpostasi): { subject: string; html: string; text: string } {
  const t = cevirmen(e.dil);
  const baslik = t("Projelio hesabın hazır");
  const selam = t("Merhaba {ad},", { ad: e.alici.ad.split(" ")[0] || e.alici.ad });
  const giris = t("Senin için bir Projelio hesabı açıldı. Aşağıdaki düğmeyle içeri gir, kendi şifreni belirle ve kaldığın yerden devam et.");
  const gecerlilik = t("Bu bağlantı 7 gün geçerli ve tek kullanımlık. Sonrasında e-posta adresin ve şifrenle giriş yapabilirsin.");
  const uyari = t("Bu e-postayı beklemiyorsan bağlantıya tıklama.");

  const satirlar: [string, string][] = [
    [t("E-posta"), e.alici.eposta],
    [t("Kullanıcı adı"), `@${e.alici.kullaniciAdi}`],
  ];
  const bilgiHtml = satirlar
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:${MARKA.yaziSoluk};font-size:13px;white-space:nowrap;">${kacir(k)}</td>` +
        `<td style="padding:4px 0;color:${MARKA.yaziKoyu};font-size:14px;">${kacir(v)}</td></tr>`
    )
    .join("");

  const html = epostaKabugu(
    e.dil,
    `          <h1 style="margin:0 0 12px;font-size:20px;color:${MARKA.yaziKoyu};">${kacir(baslik)}</h1>
          <p style="margin:0 0 8px;font-size:15px;line-height:1.55;color:${MARKA.yaziOrta};">${kacir(selam)}</p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:${MARKA.yaziOrta};">${kacir(giris)}</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">${bilgiHtml}</table>
          <p style="margin:0 0 24px;text-align:center;">
            <a href="${kacir(e.girisUrl)}" style="display:inline-block;background:${MARKA.vurgu};color:${MARKA.kart};text-decoration:none;font-weight:600;font-size:15px;padding:12px 26px;border-radius:10px;">${kacir(t("Hesabına gir"))}</a>
          </p>
          <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:${MARKA.yaziOrta};">${kacir(gecerlilik)}</p>
          <p style="margin:0;font-size:12px;line-height:1.5;color:${MARKA.yaziSoluk};">${kacir(uyari)}</p>`
  );

  const text = [
    baslik,
    "",
    selam,
    giris,
    "",
    ...satirlar.map(([k, v]) => `${k}: ${v}`),
    "",
    `${t("Hesabına gir")}:`,
    e.girisUrl,
    "",
    gecerlilik,
    uyari,
  ].join("\n");

  return { subject: baslik, html, text };
}
