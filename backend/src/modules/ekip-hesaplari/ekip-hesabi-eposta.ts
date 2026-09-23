import type { Locale } from "@projelio/shared";
import { cevirmen } from "../../common/i18n";
import { epostaKabugu, kacir, MARKA } from "../auth/email-shell";

/**
 * "Senin için bir Projelio hesabı açıldı" e-postası.
 *
 * SERVİSTEN AYRI: gövde üretmek saf bir iş (girdi → dize); cümleyi test etmek
 * için Supabase ve Resend taklidi kurmak gerekmesin (demo-randevu-eposta.ts ile
 * aynı karar).
 *
 * ŞİFRE BU E-POSTADA YOK — bilerek. E-posta düz metin olarak sunucular
 * arasında dolaşıyor ve yıllarca gelen kutusunda duruyor; şifreyi oraya
 * yazmak onu herkesin okuyabileceği bir yere bırakmak olurdu. İçeri girmenin
 * yolu tek kullanımlık bağlantı; yöneticinin belirlediği şifreyi kişiye
 * yönetici kendisi iletir (ya da kişi ilk girişte kendi şifresini seçer).
 */

export interface EkipHesabiEpostasi {
  alici: { ad: string; kullaniciAdi: string; eposta: string };
  yoneticiAdi: string;
  sirketAdi: string;
  departmanlar: string[];
  girisUrl: string;
  sifreDegistirmeli: boolean;
  not?: string | null;
  dil: Locale;
}

export function ekipHesabiEpostasi(e: EkipHesabiEpostasi): { subject: string; html: string; text: string } {
  const t = cevirmen(e.dil);
  const baslik = t("{sirket} ekibine eklendin", { sirket: e.sirketAdi });
  const giris = t("{yonetici}, seni Projelio'da {sirket} ekibine ekledi ve senin için bir hesap açtı.", {
    yonetici: e.yoneticiAdi,
    sirket: e.sirketAdi,
  });
  const gecerlilik = t("Bu bağlantı 7 gün geçerli ve tek kullanımlık. Sonrasında e-posta adresin ve şifrenle giriş yapabilirsin.");
  const sifreNotu = e.sifreDegistirmeli
    ? t("İlk girişte kendi şifreni belirlemen istenecek.")
    : t("Şifreni yöneticinden alabilir ya da giriş ekranındaki “Şifremi unuttum” ile kendin belirleyebilirsin.");
  const uyari = t("Bu kişiyi tanımıyorsan ya da bu e-postayı beklemiyorsan bağlantıya tıklama.");

  const satirlar: [string, string][] = [
    [t("E-posta"), e.alici.eposta],
    [t("Kullanıcı adı"), `@${e.alici.kullaniciAdi}`],
  ];
  if (e.departmanlar.length) satirlar.push([t("Departman"), e.departmanlar.join(", ")]);

  const bilgiHtml = satirlar
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:${MARKA.yaziSoluk};font-size:13px;white-space:nowrap;">${kacir(k)}</td>` +
        `<td style="padding:4px 0;color:${MARKA.yaziKoyu};font-size:14px;">${kacir(v)}</td></tr>`
    )
    .join("");

  const notHtml = e.not?.trim()
    ? `<div style="margin:0 0 20px;padding:12px 14px;border-left:3px solid ${MARKA.vurgu};background:${MARKA.zemin};border-radius:6px;color:${MARKA.yaziKoyu};font-size:14px;line-height:1.5;white-space:pre-wrap;">${kacir(e.not.trim())}<div style="margin-top:6px;color:${MARKA.yaziSoluk};font-size:12px;">— ${kacir(e.yoneticiAdi)}</div></div>`
    : "";

  const html = epostaKabugu(
    e.dil,
    `          <h1 style="margin:0 0 12px;font-size:20px;color:${MARKA.yaziKoyu};">${kacir(baslik)}</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:${MARKA.yaziOrta};">${kacir(giris)}</p>
          ${notHtml}
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">${bilgiHtml}</table>
          <p style="margin:0 0 24px;text-align:center;">
            <a href="${kacir(e.girisUrl)}" style="display:inline-block;background:${MARKA.vurgu};color:${MARKA.kart};text-decoration:none;font-weight:600;font-size:15px;padding:12px 26px;border-radius:10px;">${kacir(t("Hesabına gir"))}</a>
          </p>
          <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:${MARKA.yaziOrta};">${kacir(gecerlilik)} ${kacir(sifreNotu)}</p>
          <p style="margin:0;font-size:12px;line-height:1.5;color:${MARKA.yaziSoluk};">${kacir(uyari)}</p>`
  );

  const text = [
    baslik,
    "",
    giris,
    ...(e.not?.trim() ? ["", e.not.trim(), `— ${e.yoneticiAdi}`] : []),
    "",
    ...satirlar.map(([k, v]) => `${k}: ${v}`),
    "",
    `${t("Hesabına gir")}:`,
    e.girisUrl,
    "",
    gecerlilik,
    sifreNotu,
    uyari,
  ].join("\n");

  return { subject: baslik, html, text };
}
