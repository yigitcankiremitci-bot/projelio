import type { Locale } from "@projelio/shared";
import { cevirmen } from "../../common/i18n";
import { epostaKabugu, kacir, MARKA } from "../auth/email-shell";

/**
 * PayTR abonelik e-postalarının metinleri (saf: girdi → konu/html/metin).
 *
 * NEDEN BU E-POSTALAR VAR: PayTR'ye "müşteri her çekimden sonra e-postayla
 * bilgilendirilecek" diye söz verildi (2026-09-23 destek talebi). Non3D
 * çekimde müşteri ekran başında değil; habersiz çekim banka itirazına döner
 * ve 3D'siz işlemde ispat yükü bizde.
 *
 * Alıcının dilinde (users.locale), tutar TL biçiminde.
 */

export interface HazirEposta {
  subject: string;
  html: string;
  text: string;
}

function tutarMetni(tutar: number, dil: Locale): string {
  return `${tutar.toLocaleString(dil === "en" ? "en-GB" : "tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;
}

function tarihMetni(tarih: Date, dil: Locale): string {
  return tarih.toLocaleDateString(dil === "en" ? "en-GB" : "tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Istanbul",
  });
}

/** Başlık + paragraflar + isteğe bağlı düğme — beş e-postanın ortak iskeleti. */
function kur(dil: Locale, konu: string, baslik: string, paragraflar: string[], dugme?: { etiket: string; url: string }): HazirEposta {
  const html = epostaKabugu(
    dil,
    `<h1 style="margin:0 0 16px;font-size:20px;color:${MARKA.yaziKoyu};">${kacir(baslik)}</h1>
${paragraflar
  .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${MARKA.yaziOrta};">${kacir(p)}</p>`)
  .join("\n")}${
      dugme
        ? `
<a href="${kacir(dugme.url)}" style="display:inline-block;background:${MARKA.vurgu};color:#fff;text-decoration:none;padding:10px 16px;border-radius:10px;font-size:14px;font-weight:600;margin-top:6px;">${kacir(dugme.etiket)}</a>`
        : ""
    }`
  );
  const text = [baslik, "", ...paragraflar, ...(dugme ? ["", `${dugme.etiket}: ${dugme.url}`] : [])].join("\n");
  return { subject: konu, html, text };
}

export interface MakbuzBilgisi {
  dil: Locale;
  planAdi: string;
  yillik: boolean;
  tutar: number;
  kartSon4: string | null;
  sonrakiVade: Date;
  paketlerUrl: string;
  /** İlk ödeme mi, yenileme mi — başlık değişiyor. */
  ilk: boolean;
}

export function makbuzEpostasi(b: MakbuzBilgisi): HazirEposta {
  const t = cevirmen(b.dil);
  const donem = b.yillik ? t("yıllık") : t("aylık");
  const kart = b.kartSon4 ? t("•••• {son4} ile biten kartından", { son4: b.kartSon4 }) : t("kayıtlı kartından");
  return kur(
    b.dil,
    b.ilk ? t("Projelio aboneliğin başladı") : t("Projelio aboneliğin yenilendi"),
    b.ilk ? t("Aboneliğin başladı") : t("Aboneliğin yenilendi"),
    [
      t("{plan} paketinin {donem} ödemesi olan {tutar}, {kart} tahsil edildi.", {
        plan: b.planAdi,
        donem,
        tutar: tutarMetni(b.tutar, b.dil),
        kart,
      }),
      t("Bir sonraki yenileme {tarih} tarihinde aynı karttan otomatik yapılacak. Aboneliğini Paketler ekranından istediğin zaman iptal edebilirsin; erişimin ödediğin dönemin sonuna kadar sürer.", {
        tarih: tarihMetni(b.sonrakiVade, b.dil),
      }),
    ],
    { etiket: t("Paketlerim"), url: b.paketlerUrl }
  );
}

export function kartDegistiEpostasi(b: { dil: Locale; kartSon4: string | null; iadeEdildi: boolean; paketlerUrl: string }): HazirEposta {
  const t = cevirmen(b.dil);
  return kur(
    b.dil,
    t("Projelio ödeme kartın güncellendi"),
    t("Ödeme kartın güncellendi"),
    [
      b.kartSon4
        ? t("Aboneliğin bundan sonra •••• {son4} ile biten kartından yenilenecek.", { son4: b.kartSon4 })
        : t("Aboneliğin bundan sonra yeni kartından yenilenecek."),
      b.iadeEdildi
        ? t("Kartı doğrulamak için çekilen 1 ₺ iade edildi; bankana göre hesabına birkaç gün içinde yansır.")
        : t("Kartı doğrulamak için çekilen 1 ₺ en kısa sürede iade edilecek."),
    ],
    { etiket: t("Paketlerim"), url: b.paketlerUrl }
  );
}

export function odemeAlinamadiEpostasi(b: {
  dil: Locale;
  planAdi: string;
  tutar: number;
  kartSon4: string | null;
  sonTarih: Date;
  paketlerUrl: string;
}): HazirEposta {
  const t = cevirmen(b.dil);
  return kur(
    b.dil,
    t("Projelio abonelik ödemen alınamadı"),
    t("Abonelik ödemen alınamadı"),
    [
      b.kartSon4
        ? t("{plan} paketinin {tutar} tutarındaki yenileme ödemesi •••• {son4} ile biten kartından alınamadı.", {
            plan: b.planAdi,
            tutar: tutarMetni(b.tutar, b.dil),
            son4: b.kartSon4,
          })
        : t("{plan} paketinin {tutar} tutarındaki yenileme ödemesi alınamadı.", {
            plan: b.planAdi,
            tutar: tutarMetni(b.tutar, b.dil),
          }),
      t("Paketin açık kalmaya devam ediyor. Ödemeyi birkaç kez daha deneyeceğiz; {tarih} tarihine kadar alınamazsa paketin sona erer.", {
        tarih: tarihMetni(b.sonTarih, b.dil),
      }),
      t("Kartını değiştirmek ya da ödemeyi hemen yapmak için Paketler ekranını aç."),
    ],
    { etiket: t("Ödemeyi yap"), url: b.paketlerUrl }
  );
}

export function sonaErdiEpostasi(b: { dil: Locale; planAdi: string; paketlerUrl: string }): HazirEposta {
  const t = cevirmen(b.dil);
  return kur(
    b.dil,
    t("Projelio aboneliğin sona erdi"),
    t("Aboneliğin sona erdi"),
    [
      t("{plan} paketinin ödemesi birkaç denemeye rağmen alınamadığı için aboneliğin sona erdi. Hesabın ve içeriğin duruyor; ücretsiz pakete geçtin.", {
        plan: b.planAdi,
      }),
      t("İstediğin zaman Paketler ekranından yeniden abone olabilirsin."),
    ],
    { etiket: t("Paketler"), url: b.paketlerUrl }
  );
}

export function hatirlatmaEpostasi(b: {
  dil: Locale;
  tur: "yillik" | "fiyat";
  planAdi: string;
  vade: Date;
  tutar: number;
  eskiTutar: number | null;
  kartSon4: string | null;
  paketlerUrl: string;
}): HazirEposta {
  const t = cevirmen(b.dil);
  const tarih = tarihMetni(b.vade, b.dil);
  const tutar = tutarMetni(b.tutar, b.dil);
  const fiyatDegisti = b.eskiTutar !== null && b.eskiTutar !== b.tutar;
  const paragraflar = [
    b.tur === "yillik"
      ? t("{plan} paketinin yıllık aboneliği {tarih} tarihinde {tutar} karşılığında otomatik yenilenecek.", {
          plan: b.planAdi,
          tarih,
          tutar,
        })
      : t("{plan} paketinin aylık abonelik ücreti {tarih} tarihindeki yenilemeden itibaren {tutar} olacak.", {
          plan: b.planAdi,
          tarih,
          tutar,
        }),
    ...(fiyatDegisti ? [t("Bir önceki dönemde {eski} ödemiştin.", { eski: tutarMetni(b.eskiTutar!, b.dil) })] : []),
    b.kartSon4
      ? t("Ödeme •••• {son4} ile biten kartından alınacak.", { son4: b.kartSon4 })
      : t("Ödeme kayıtlı kartından alınacak."),
    t("Yenilenmesini istemiyorsan bu tarihten önce Paketler ekranından iptal edebilirsin."),
  ];
  return kur(
    b.dil,
    b.tur === "yillik" ? t("Projelio aboneliğin {tarih} tarihinde yenilenecek", { tarih }) : t("Projelio abonelik ücretin değişiyor"),
    b.tur === "yillik" ? t("Aboneliğin yakında yenilenecek") : t("Abonelik ücretin değişiyor"),
    paragraflar,
    { etiket: t("Paketlerim"), url: b.paketlerUrl }
  );
}
