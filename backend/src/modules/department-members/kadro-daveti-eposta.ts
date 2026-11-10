import type { Locale } from "@projelio/shared";
import { cevirmen } from "../../common/i18n";
import { epostaKabugu, kacir, MARKA } from "../auth/email-shell";

/**
 * "Bir departmanın kadrosuna davet edildin" e-postası.
 *
 * NEDEN VAR: kadroya e-postayla davet eskiden yalnızca `invite_email` sütununa
 * yazılıyordu — kişiye hiçbir e-posta gitmiyordu ve davet ancak tesadüfen
 * fark edilebiliyordu (2026-11-10, "mail girdik ama gitmedi").
 *
 * SERVİSTEN AYRI: gövde üretmek saf bir iş (girdi → dize); ekip-hesabi-eposta.ts
 * ile aynı karar.
 */
export interface KadroDavetiEpostasi {
  davetEdenAdi: string;
  departmanAdi: string;
  sirketAdi?: string;
  /** Davetli Projelio'da zaten hesabı olan biri mi — çağrı cümlesi buna göre. */
  hesabiVar: boolean;
  davetUrl: string;
  eposta: string;
  dil: Locale;
}

export function kadroDavetiEpostasi(e: KadroDavetiEpostasi): { subject: string; html: string; text: string } {
  const t = cevirmen(e.dil);
  const yer = e.sirketAdi ? `${e.sirketAdi} · ${e.departmanAdi}` : e.departmanAdi;
  const baslik = t("{yer} kadrosuna davet edildin", { yer });
  const giris = t("{kisi}, seni Projelio'da {yer} kadrosuna davet etti.", { kisi: e.davetEdenAdi, yer });
  const adim = e.hesabiVar
    ? t("Daveti görmek ve onaylamak için Projelio'ya giriş yap.")
    : t("Daveti kabul etmek için Projelio'ya bu e-posta adresiyle ({eposta}) kayıt ol; davet kayıttan sonra departman sayfasında seni bekliyor olacak.", {
        eposta: e.eposta,
      });
  const dugme = t("Daveti gör");
  const uyari = t("Bu kişiyi tanımıyorsan ya da bu e-postayı beklemiyorsan görmezden gelebilirsin.");

  const html = epostaKabugu(
    e.dil,
    `          <h1 style="margin:0 0 12px;font-size:20px;color:${MARKA.yaziKoyu};">${kacir(baslik)}</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:${MARKA.yaziOrta};">${kacir(giris)}</p>
          <p style="margin:0 0 22px;font-size:14px;line-height:1.55;color:${MARKA.yaziOrta};">${kacir(adim)}</p>
          <p style="margin:0 0 24px;text-align:center;">
            <a href="${kacir(e.davetUrl)}" style="display:inline-block;background:${MARKA.vurgu};color:${MARKA.kart};text-decoration:none;font-weight:600;font-size:15px;padding:12px 26px;border-radius:10px;">${kacir(dugme)}</a>
          </p>
          <p style="margin:0;font-size:12px;line-height:1.5;color:${MARKA.yaziSoluk};">${kacir(uyari)}</p>`
  );

  const text = [baslik, "", giris, "", adim, "", `${dugme}:`, e.davetUrl, "", uyari].join("\n");

  return { subject: baslik, html, text };
}
