import type { Locale } from "@projelio/shared";
import { cevirmen } from "../../common/i18n";
import { epostaKabugu, kacir, MARKA } from "../auth/email-shell";

/**
 * Bildirim e-postasının şablonu.
 *
 * Auth e-postalarından (email.service.ts) AYRI, çünkü biçimi farklı: orada tek
 * bir çağrı ve tek bir düğme var, burada bir LİSTE. Ortak olan yalnızca kabuk
 * (bkz. auth/email-shell.ts) — marka görünümü hâlâ tek yerden geliyor.
 *
 * KAÇIRMA KURALI: sözlükten gelen metin kaçırılmaz (kendi metnimiz, üstelik
 * bazıları bilerek HTML içeriyor), KULLANICI VERİSİ her zaman kaçırılır —
 * bildirim başlığı, gövdesi, görev adı, kişinin adı. `<` içeren bir görev
 * başlığı, kaçırılmazsa e-postanın kalanını bozar.
 */

export interface EpostaBildirimi {
  baslik: string;
  govde: string;
  /** Uygulama içi yol ("/tasks"); e-postada tam adrese çevrilir. */
  link?: string;
}

export interface EpostaGorevi {
  baslik: string;
  /** "14:30" — bitiş saati varsa. */
  saat?: string;
  /**
   * Görevin takvim günü (YYYY-MM-DD). Yalnızca GECİKEN bölümünde gösterilir:
   * bugün/yarın bölümünde tarih zaten başlıkta yazıyor, gecikende ise "ne
   * kadar geciktiği" asıl bilgi ve onsuz liste anlamsız bir yığına dönüyor.
   * Biçimlendirme burada yapılıyor çünkü ay adı DİLE bağlı ("11 Eyl" / "11 Sep")
   * ve aynı görev listesi farklı dillerdeki kullanıcılara gidiyor.
   */
  gun?: string;
}

/** Görevlerin üç bölümü (bkz. notification-email.icerik.ts). */
export interface EpostaGorevBolumleri {
  geciken: EpostaGorevi[];
  bugun: EpostaGorevi[];
  yarin: EpostaGorevi[];
}

export interface BildirimEpostasi {
  subject: string;
  html: string;
  text: string;
  /**
   * List-Unsubscribe çifti. Gmail/Yahoo düzenli gönderenden bunu BEKLİYOR;
   * yokluğu "çıkış yolu olmayan toplu posta" sayılıp spam'e düşmenin en sık
   * sebebi. Şablonla birlikte üretiliyor ki bağlantı ile başlık hiçbir zaman
   * ayrışmasın.
   */
  headers?: Record<string, string>;
}

/**
 * Kaç kalem gösterilecek. Fazlası "ve N tane daha" diye özetlenir: 80
 * bildirimin tamamını listelemek e-postayı okunmaz yapar, üstelik Gmail 102
 * KB'tan sonra mesajı kırpar ve alttaki ayar bağlantısı görünmez olurdu.
 */
const LISTE_SINIRI = 12;

function tamAdres(webUrl: string, link?: string): string {
  if (!link) return webUrl;
  if (/^https?:\/\//i.test(link)) return link;
  return `${webUrl}${link.startsWith("/") ? "" : "/"}${link}`;
}

/** Tek bir bildirim satırı: başlık + gövde, sol kenarında ince vurgu çizgisi. */
function kalemHtml(kalem: EpostaBildirimi, webUrl: string): string {
  const adres = tamAdres(webUrl, kalem.link);
  return `          <tr>
            <td style="padding:0 0 14px;">
              <a href="${kacir(adres)}" style="text-decoration:none;color:inherit;display:block;border-left:3px solid ${MARKA.vurgu};padding-left:12px;">
                <div style="font-size:15px;font-weight:600;color:${MARKA.yaziKoyu};line-height:1.4;">${kacir(kalem.baslik)}</div>
                <div style="font-size:14px;color:${MARKA.yaziOrta};line-height:1.5;margin-top:2px;">${kacir(kalem.govde)}</div>
              </a>
            </td>
          </tr>`;
}

/** "2026-09-11" → "11 Eyl" / "11 Sep". Geçersiz değerde boş döner. */
function kisaTarih(gun: string | undefined, locale: Locale): string {
  if (!gun) return "";
  const tarih = new Date(`${gun}T12:00:00Z`);
  if (Number.isNaN(tarih.getTime())) return "";
  return tarih.toLocaleDateString(locale === "en" ? "en-GB" : "tr-TR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function gorevHtml(gorev: EpostaGorevi, locale: Locale, tarihGoster: boolean): string {
  const ek = [tarihGoster ? kisaTarih(gorev.gun, locale) : "", gorev.saat].filter(Boolean).join(" ");
  const saat = ek ? ` <span style="color:${MARKA.vurgu};">${kacir(ek)}</span>` : "";
  return `          <tr>
            <td style="padding:0 0 8px;font-size:15px;color:${MARKA.yaziKoyu};line-height:1.5;">
              &#8226;&nbsp;${kacir(gorev.baslik)}${saat}
            </td>
          </tr>`;
}

function bolumBasligiHtml(metin: string): string {
  return `          <tr>
            <td style="padding:6px 0 10px;font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${MARKA.yaziSoluk};">
              ${metin}
            </td>
          </tr>`;
}

function solukSatirHtml(metin: string): string {
  return `          <tr><td style="padding:0 0 12px;font-size:13px;color:${MARKA.yaziSoluk};">${metin}</td></tr>`;
}

/**
 * Bildirim e-postasını üretir.
 *
 * `kip` yalnızca konuyu ve giriş cümlesini değiştirir; gövde aynı — böylece
 * "anlık" ve "günlük" iki ayrı şablona bölünmüyor.
 */
export function bildirimEpostasiOlustur(params: {
  locale: Locale;
  kip: "anlik" | "gunluk";
  bildirimler: EpostaBildirimi[];
  gorevler: EpostaGorevBolumleri;
  webUrl: string;
  /** Görüntülenecek ad — e-postayı kişiselleştirir, yoksa selam atlanır. */
  ad?: string;
  /** Tek tık "aboneliği bırak" adresi (bkz. notification-email.abonelik.ts). */
  abonelikAdresi?: string;
}): BildirimEpostasi {
  const t = cevirmen(params.locale);
  const gunluk = params.kip === "gunluk";
  const bildirimler = params.bildirimler.slice(0, LISTE_SINIRI);
  const kalanBildirim = params.bildirimler.length - bildirimler.length;
  // Görev bölümleri sabit sırada: önce kaçırılan, sonra bugün, sonra yarın.
  // Boş bölüm hiç yazılmaz.
  const gorevBolumleri = [
    { baslik: t("Geciken görevlerin"), gorevler: params.gorevler.geciken, tarihGoster: true },
    { baslik: t("Bugün biten görevlerin"), gorevler: params.gorevler.bugun, tarihGoster: false },
    { baslik: t("Yarın biten görevlerin"), gorevler: params.gorevler.yarin, tarihGoster: false },
  ].filter((bolum) => bolum.gorevler.length > 0);
  const gorevSayisi = gorevBolumleri.reduce((toplam, bolum) => toplam + bolum.gorevler.length, 0);
  // Başlık ancak ayrılacak birden fazla liste varsa yazılır; tek liste varsa
  // "BİLDİRİMLER" başlığı gereksiz gürültü.
  const basliklar = gorevBolumleri.length + (bildirimler.length > 0 ? 1 : 0) > 1;
  /**
   * Kırpma TÜM görevleri birlikte sayar, bölüm bölüm değil: üç bölümün her
   * birine 12'şer kalem vermek 36 satırlık bir e-posta demekti ve Gmail
   * 102 KB'tan sonra mesajı kırpıp alttaki kapatma bağlantısını gizliyor.
   */
  let gorevButcesi = LISTE_SINIRI;

  const baslik = gunluk ? t("Bugünkü özetin") : t("Yeni bildirimlerin var");
  const subject = gunluk
    ? t("Projelio — bugünkü özetin")
    : params.bildirimler.length === 1
      ? `Projelio — ${params.bildirimler[0].baslik}`
      : t("Projelio — {n} yeni bildirim", { n: params.bildirimler.length });

  const giris = gunluk
    ? t("Günün özeti aşağıda. Ayrıntı için herhangi bir satıra tıklayabilirsin.")
    : t("Projelio'da senin için yeni bir şeyler oldu.");
  // Ad kullanıcı verisi: HTML sürümünde kaçırılır, düz metinde olduğu gibi kalır.
  const selamHtml = params.ad ? `${t("Merhaba {ad},", { ad: kacir(params.ad) })} ` : "";
  const selamMetin = params.ad ? `${t("Merhaba {ad},", { ad: params.ad })} ` : "";

  const ayarAdresi = `${params.webUrl}/settings?sekme=yardimcilar`;
  const altNot = t(
    "Bu e-postaları ne sıklıkla almak istediğini Ayarlar > Yardımcılar > Bildirim e-postaları bölümünden değiştirebilir, tamamen kapatabilirsin."
  );
  const kapatBagi = params.abonelikAdresi
    ? ` &nbsp;·&nbsp; <a href="${kacir(params.abonelikAdresi)}" style="color:${MARKA.yaziSoluk};">${t("Aboneliği bırak")}</a>`
    : "";

  const satirlar: string[] = [];
  const metinGorevSatirlari: string[] = [];
  if (bildirimler.length > 0) {
    if (basliklar) satirlar.push(bolumBasligiHtml(t("Bildirimler")));
    satirlar.push(...bildirimler.map((kalem) => kalemHtml(kalem, params.webUrl)));
    if (kalanBildirim > 0) satirlar.push(solukSatirHtml(t("ve {n} bildirim daha", { n: kalanBildirim })));
  }
  for (const bolum of gorevBolumleri) {
    if (gorevButcesi <= 0) break;
    const gosterilen = bolum.gorevler.slice(0, gorevButcesi);
    gorevButcesi -= gosterilen.length;
    if (basliklar) {
      satirlar.push(bolumBasligiHtml(bolum.baslik));
      metinGorevSatirlari.push(`${bolum.baslik}:`, "");
    }
    satirlar.push(...gosterilen.map((gorev) => gorevHtml(gorev, params.locale, bolum.tarihGoster)));
    for (const gorev of gosterilen) {
      const ek = [bolum.tarihGoster ? kisaTarih(gorev.gun, params.locale) : "", gorev.saat]
        .filter(Boolean)
        .join(" ");
      metinGorevSatirlari.push(`- ${gorev.baslik}${ek ? ` (${ek})` : ""}`);
    }
    metinGorevSatirlari.push("");
  }
  const kalanGorev = gorevSayisi - (LISTE_SINIRI - Math.max(gorevButcesi, 0));
  if (kalanGorev > 0) {
    satirlar.push(solukSatirHtml(t("ve {n} görev daha", { n: kalanGorev })));
    metinGorevSatirlari.push(t("ve {n} görev daha", { n: kalanGorev }), "");
  }

  const html = epostaKabugu(
    params.locale,
    `          <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:${MARKA.yaziKoyu};">${baslik}</h1>
          <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:${MARKA.yaziOrta};">${selamHtml}${giris}</p>
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
${satirlar.join("\n")}
          </table>
          <p style="margin:22px 0 0;">
            <a href="${kacir(params.webUrl)}"
               style="display:inline-block;background:${MARKA.yaziKoyu};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px;font-weight:500;">
              ${t("Projelio'yu aç")}
            </a>
          </p>
          <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:${MARKA.yaziSoluk};border-top:1px solid ${MARKA.cizgi};padding-top:16px;">
            ${altNot}
            <br>
            <a href="${kacir(ayarAdresi)}" style="color:${MARKA.vurgu};">${t("Bildirim e-postası ayarları")}</a>${kapatBagi}
          </p>`,
    560
  );

  const metinSatirlari: string[] = [baslik, "", `${selamMetin}${giris}`, ""];
  if (bildirimler.length > 0) {
    if (basliklar) metinSatirlari.push(`${t("Bildirimler")}:`, "");
    for (const kalem of bildirimler) {
      metinSatirlari.push(`- ${kalem.baslik}: ${kalem.govde}`, `  ${tamAdres(params.webUrl, kalem.link)}`);
    }
    if (kalanBildirim > 0) metinSatirlari.push(t("ve {n} bildirim daha", { n: kalanBildirim }));
    metinSatirlari.push("");
  }
  metinSatirlari.push(...metinGorevSatirlari);
  metinSatirlari.push(params.webUrl, "", altNot, ayarAdresi);
  if (params.abonelikAdresi) {
    metinSatirlari.push("", `${t("Aboneliği bırak")}: ${params.abonelikAdresi}`);
  }

  // List-Unsubscribe-Post olmadan başlık "tek tık" sayılmaz: sağlayıcı
  // kullanıcıya düğmeyi göstermek yerine adresi açmakla yetinir.
  const headers = params.abonelikAdresi
    ? {
        "List-Unsubscribe": `<${params.abonelikAdresi}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      }
    : undefined;

  return { subject, html, text: metinSatirlari.join("\n"), headers };
}
