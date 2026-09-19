import { demoIcsOlustur, demoOnaylandiMi, googleTakvimUrl, type DemoRandevuDurumu, type Locale } from "@projelio/shared";
import { cevirmen } from "../../common/i18n";
import { epostaKabugu, kacir, MARKA } from "../auth/email-shell";

/**
 * Demo randevusu e-postalarının metinleri.
 *
 * SERVİSTEN AYRI: gövde üretmek saf bir iş (girdi → dize); cümleyi doğrulamak
 * için Supabase ve Resend taklidi kurmak gerekmesin (aynı karar için bkz.
 * file-download-links/indirme-linki-eposta.ts).
 *
 * İKİ KİTLE, İKİ DİL KURALI:
 *   · Katılımcıya giden e-posta randevuyu aldığı dilde (demo_randevulari.dil).
 *   · Yöneticiye ve sunucuya giden e-posta Türkçe — iç ekip, Pist çalışanları.
 */

export interface DemoEpostaRandevusu {
  id: string;
  baslangic: string;
  bitis: string;
  ad: string;
  eposta: string;
  telefon: string | null;
  sirket: string | null;
  ekipBuyuklugu: string | null;
  not: string | null;
  dil: Locale;
  saatDilimi: string;
  toplantiLinki: string | null;
  sunucuAdi: string | null;
  takvimSirasi: number;
  uye: boolean;
  durum: DemoRandevuDurumu;
}

export interface DemoEpostaAdresleri {
  /** Herkese açık yönetim sayfası: /demo-randevu/:token */
  yonetimUrl: string;
  /** Apple Takvim: sunucunun ürettiği .ics dosyası */
  icsUrl: string;
  /** Hesap açma sayfası (üye olmayana) */
  kayitUrl: string;
  /** Admin paneli randevu sekmesi */
  adminUrl: string;
}

export type DemoKatilimciOlayi = "alindi" | "kesinlesti" | "degisti" | "iptal" | "hatirlatma_gun" | "hatirlatma_saat";

/** Takvimdeki etkinliğin UID'si — değişiklikte ve iptalde AYNI kalmalı. */
export function demoTakvimUid(id: string): string {
  return `demo-${id}@projelio.app`;
}

export function demoZamanMetni(r: Pick<DemoEpostaRandevusu, "baslangic" | "bitis" | "saatDilimi">, dil: Locale): string {
  const yer = dil === "en" ? "en-GB" : "tr-TR";
  const gun = new Intl.DateTimeFormat(yer, {
    timeZone: r.saatDilimi,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(r.baslangic));
  const saat = (iso: string) =>
    new Intl.DateTimeFormat(yer, { timeZone: r.saatDilimi, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  const dilim = r.saatDilimi === "Europe/Istanbul" ? (dil === "en" ? "Türkiye time" : "Türkiye saati") : r.saatDilimi;
  return `${gun}, ${saat(r.baslangic)}–${saat(r.bitis)} (${dilim})`;
}

/** Takvim etkinliğinin başlığı ve açıklaması — e-posta, .ics ve Google bağlantısında aynı. */
export function demoTakvimEtkinligi(r: DemoEpostaRandevusu, yonetimUrl: string, iptal = false) {
  const t = cevirmen(r.dil);
  const aciklama = [
    t("Projelio ekibiyle 40 dakikalık canlı tanıtım görüşmesi."),
    r.toplantiLinki ? `${t("Görüşme bağlantısı")}: ${r.toplantiLinki}` : t("Görüşme bağlantısı görüşmeden önce e-postayla gönderilecek."),
    `${t("Randevuyu yönet")}: ${yonetimUrl}`,
  ].join("\n");
  return {
    uid: demoTakvimUid(r.id),
    baslangic: r.baslangic,
    bitis: r.bitis,
    baslik: t("Projelio canlı demo"),
    aciklama,
    konum: r.toplantiLinki,
    sira: r.takvimSirasi,
    iptal,
  };
}

export function demoIcsDosyasi(r: DemoEpostaRandevusu, yonetimUrl: string, simdi: Date, iptal = false): string {
  return demoIcsOlustur(demoTakvimEtkinligi(r, yonetimUrl, iptal), simdi);
}

function dugme(url: string, metin: string, ikincil = false): string {
  const stil = ikincil
    ? `background:#fff;color:${MARKA.yaziKoyu};border:1px solid ${MARKA.cizgi};`
    : `background:${MARKA.vurgu};color:#fff;border:1px solid ${MARKA.vurgu};`;
  return `<a href="${kacir(url)}" style="display:inline-block;${stil}text-decoration:none;padding:10px 16px;border-radius:10px;font-size:14px;font-weight:600;margin:0 6px 8px 0;">${kacir(
    metin
  )}</a>`;
}

function zamanKutusu(r: DemoEpostaRandevusu, ekSatir?: string): string {
  const t = cevirmen(r.dil);
  return `<div style="margin:0 0 20px;padding:14px 16px;border:1px solid ${MARKA.cizgi};border-radius:10px;">
  <div style="font-size:15px;color:${MARKA.yaziKoyu};font-weight:600;">${kacir(demoZamanMetni(r, r.dil))}</div>
  <div style="font-size:13px;color:${MARKA.yaziSoluk};margin-top:4px;">${kacir(t("40 dakika · Online görüşme"))}${
    r.sunucuAdi ? ` · ${kacir(r.sunucuAdi)}` : ""
  }</div>
  ${ekSatir ?? ""}
</div>`;
}

/**
 * Katılımcıya giden e-posta. Her olayda aynı iskelet: başlık + zaman kutusu +
 * (varsa) görüşme bağlantısı + takvim düğmeleri + yönetim bağlantısı. Olaya
 * göre yalnızca üst cümle değişiyor — kişi hangi e-postayı açarsa açsın
 * randevunun güncel hâlini görüyor.
 */
export function demoKatilimciEpostasi(
  olay: DemoKatilimciOlayi,
  r: DemoEpostaRandevusu,
  a: DemoEpostaAdresleri
): { subject: string; html: string; text: string } {
  const t = cevirmen(r.dil);
  const ad = kacir(r.ad.split(" ")[0] || r.ad);
  const zaman = demoZamanMetni(r, r.dil);

  const metinler: Record<DemoKatilimciOlayi, { konu: string; baslik: string; giris: string }> = {
    alindi: {
      konu: t("Projelio demo talebiniz alındı"),
      baslik: t("Talebiniz alındı"),
      giris: t("Merhaba {ad}, Projelio canlı demo talebinizi aldık. Görüşmeyi yapacak ekip arkadaşımızı atadığımızda onay e-postası göndereceğiz; görüşme bağlantısı ve takvime ekleme o e-postada olacak.", { ad }),
    },
    kesinlesti: {
      konu: t("Projelio demo görüşmeniz kesinleşti"),
      baslik: t("Görüşmeniz kesinleşti"),
      giris: r.sunucuAdi
        ? t("Merhaba {ad}, görüşmenizi <strong>{sunucu}</strong> yapacak. Bağlantı aşağıda.", { ad, sunucu: kacir(r.sunucuAdi) })
        : t("Merhaba {ad}, görüşmeniz kesinleşti. Bağlantı aşağıda.", { ad }),
    },
    degisti: {
      konu: t("Projelio demo randevunuz güncellendi"),
      baslik: t("Randevunuz güncellendi"),
      giris: t("Merhaba {ad}, randevunuzun bilgileri değişti. Güncel hâli aşağıda; takviminize daha önce eklediyseniz yeniden eklemeniz yeterli, eski kaydın üstüne yazılır.", { ad }),
    },
    iptal: {
      konu: t("Projelio demo randevunuz iptal edildi"),
      baslik: t("Randevunuz iptal edildi"),
      giris: t("Merhaba {ad}, aşağıdaki randevu iptal edildi. Dilediğiniz zaman yeni bir saat seçebilirsiniz.", { ad }),
    },
    hatirlatma_gun: {
      konu: t("Yarın: Projelio canlı demo"),
      baslik: t("Görüşmeniz yarın"),
      giris: t("Merhaba {ad}, Projelio canlı demonuz yarın. Aşağıdaki saat size uymuyorsa tek tıkla değiştirebilirsiniz.", { ad }),
    },
    hatirlatma_saat: {
      konu: t("1 saat sonra: Projelio canlı demo"),
      baslik: t("Görüşmeniz 1 saat sonra"),
      giris: t("Merhaba {ad}, görüşmemize bir saat kaldı. Görüşürüz!", { ad }),
    },
  };
  const m = metinler[olay];
  const iptal = olay === "iptal";
  // Takvim düğmeleri ve hesap çağrısı yalnızca ONAYLANMIŞ randevuda: talep
  // anında gitmiyor (bkz. demoOnaylandiMi). Onaysız "değişti" e-postası da
  // takvimsiz — kişi saatin kaydığını öğrenir, etkinliği onaydan sonra ekler.
  const onayli = !iptal && demoOnaylandiMi({ durum: r.durum, toplantiLinki: r.toplantiLinki });

  const baglanti = !iptal && r.toplantiLinki
    ? `<div style="margin-top:10px;font-size:14px;"><a href="${kacir(r.toplantiLinki)}" style="color:${MARKA.vurgu};">${kacir(
        t("Görüşmeye katıl")
      )} →</a></div>`
    : "";

  // Üye olmayan ve hesabını henüz açmamış kişi: görüşmede ekranını paylaşıp
  // kendi hesabında ilerleyebilmesi için hesabın ÖNCEDEN açılmış olması lazım.
  const hesapCagrisi = !iptal && !r.uye
    ? `<div style="margin:0 0 20px;padding:12px 14px;background:${MARKA.zemin};border-radius:10px;font-size:14px;line-height:1.6;color:${MARKA.yaziOrta};">
  <strong style="color:${MARKA.yaziKoyu};">${kacir(t("Görüşmeden önce hesabınızı oluşturun"))}</strong><br />
  ${kacir(t("Demo sırasında kendi hesabınızda birlikte ilerleyeceğiz. Ücretsiz hesabınızı bu e-posta adresiyle şimdiden açarsanız görüşmenin tamamı size ayrılır."))}
  <div style="margin-top:10px;">${dugme(a.kayitUrl, t("Hesabımı oluştur"))}</div>
</div>`
    : "";

  const takvimDugmeleri = iptal
    ? dugme(a.yonetimUrl, t("Yeni saat seç"))
    : onayli
      ? [
          dugme(googleTakvimUrl(demoTakvimEtkinligi(r, a.yonetimUrl)), t("Google Takvim'e ekle"), true),
          dugme(a.icsUrl, t("Apple Takvim'e ekle"), true),
        ].join("")
      : "";

  const html = epostaKabugu(
    r.dil,
    `<h1 style="margin:0 0 16px;font-size:20px;color:${MARKA.yaziKoyu};">${kacir(m.baslik)}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:${MARKA.yaziOrta};">${m.giris}</p>
${zamanKutusu(r, baglanti)}
${hesapCagrisi}
${takvimDugmeleri ? `<div style="margin:0 0 16px;">${takvimDugmeleri}</div>` : ""}
${
  !onayli
    ? ""
    : `<p style="margin:0 0 16px;font-size:12px;line-height:1.6;color:${MARKA.yaziSoluk};">${kacir(
        t("Takvime eklediğinizde 1 gün ve 1 saat önce iki hatırlatma kurulur. Outlook ve diğer takvimler için ekteki .ics dosyasını açabilirsiniz.")
      )}</p>`
}
<p style="margin:0;font-size:13px;line-height:1.6;color:${MARKA.yaziSoluk};">
  ${iptal ? "" : `${kacir(t("Saat uymuyor mu?"))} <a href="${kacir(a.yonetimUrl)}" style="color:${MARKA.vurgu};">${kacir(t("Randevuyu değiştir ya da iptal et"))}</a>`}
</p>`
  );

  const text = [
    m.baslik,
    "",
    m.giris.replace(/<[^>]+>/g, ""),
    "",
    zaman,
    ...(r.toplantiLinki && !iptal ? [`${t("Görüşme bağlantısı")}: ${r.toplantiLinki}`] : []),
    ...(!iptal && !r.uye ? ["", `${t("Hesabımı oluştur")}: ${a.kayitUrl}`] : []),
    "",
    `${t("Randevuyu yönet")}: ${a.yonetimUrl}`,
  ].join("\n");

  return { subject: m.konu, html, text };
}

// ───────────────────────────────────────────── İç ekip (Türkçe)

function kisiTablosu(r: DemoEpostaRandevusu): string {
  const satirlar: [string, string | null][] = [
    ["Ad", r.ad],
    ["E-posta", r.eposta],
    ["Telefon", r.telefon],
    ["Şirket", r.sirket],
    ["Ekip", r.ekipBuyuklugu],
    ["Üyelik", r.uye ? "Projelio üyesi" : "Üye değil"],
    ["Öğrenmek istedikleri", r.not],
  ];
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;font-size:14px;color:${MARKA.yaziOrta};">
${satirlar
  .filter(([, v]) => v)
  .map(
    ([k, v]) =>
      `<tr><td style="padding:4px 12px 4px 0;color:${MARKA.yaziSoluk};vertical-align:top;white-space:nowrap;">${k}</td><td style="padding:4px 0;white-space:pre-wrap;">${kacir(
        v as string
      )}</td></tr>`
  )
  .join("\n")}
</table>`;
}

export type DemoEkipOlayi = "yeni" | "atandi" | "degisti" | "iptal" | "hatirlatma_saat" | "onaysiz";

/** Yöneticilere (yeni randevu) ve atanan sunucuya giden e-posta. */
export function demoEkipEpostasi(
  olay: DemoEkipOlayi,
  r: DemoEpostaRandevusu,
  a: DemoEpostaAdresleri,
  ek?: { iptalNedeni?: string | null }
): { subject: string; html: string; text: string } {
  const zaman = demoZamanMetni(r, "tr");
  const m: Record<DemoEkipOlayi, { konu: string; baslik: string; giris: string }> = {
    yeni: {
      konu: `Yeni demo talebi: ${r.ad} — ${zaman}`,
      baslik: "Yeni demo talebi",
      giris: "Takvimden bir demo bloğu seçildi. Görüşmeyi kendine ya da bir moderatöre atamak için Admin paneline geç.",
    },
    atandi: {
      konu: `Demo görevin: ${r.ad} — ${zaman}`,
      baslik: "Sana bir demo atandı",
      giris: "Aşağıdaki görüşmeyi sen yapacaksın. Katılımcıya bağlantı gönderildi.",
    },
    degisti: {
      konu: `Demo saati değişti: ${r.ad} — ${zaman}`,
      baslik: "Demo randevusu değişti",
      giris: "Katılımcı randevuyu yeni bir saate taşıdı. Güncel bilgiler aşağıda.",
    },
    iptal: {
      konu: `Demo iptal edildi: ${r.ad} — ${zaman}`,
      baslik: "Demo iptal edildi",
      giris: ek?.iptalNedeni ? `Neden: ${kacir(ek.iptalNedeni)}` : "Randevu iptal edildi; blok yeniden açıldı.",
    },
    onaysiz: {
      konu: `Onaylanmamış demo: ${r.ad} — ${zaman}`,
      baslik: "Bu demo henüz onaylanmadı",
      giris:
        "Görüşmeye bir günden az kaldı ama katılımcıya onay gitmedi: sunucu atanmamış ya da görüşme bağlantısı yok. Katılımcının elinde bağlantı olmadan görüşme yapılamaz.",
    },
    hatirlatma_saat: {
      konu: `1 saat sonra demo: ${r.ad}`,
      baslik: "Demon 1 saat sonra",
      giris: "Katılımcıya da hatırlatma gitti.",
    },
  };
  const s = m[olay];
  const baglanti = r.toplantiLinki
    ? `<div style="margin-top:10px;font-size:14px;"><a href="${kacir(r.toplantiLinki)}" style="color:${MARKA.vurgu};">Görüşme bağlantısı →</a></div>`
    : `<div style="margin-top:10px;font-size:13px;color:${MARKA.yaziSoluk};">Görüşme bağlantısı henüz yok.</div>`;

  const html = epostaKabugu(
    "tr",
    `<h1 style="margin:0 0 16px;font-size:20px;color:${MARKA.yaziKoyu};">${s.baslik}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:${MARKA.yaziOrta};">${s.giris}</p>
<div style="margin:0 0 20px;padding:14px 16px;border:1px solid ${MARKA.cizgi};border-radius:10px;">
  <div style="font-size:15px;color:${MARKA.yaziKoyu};font-weight:600;">${kacir(zaman)}</div>
  ${olay === "iptal" ? "" : baglanti}
</div>
${kisiTablosu(r)}
<p style="margin:0;">${dugme(a.adminUrl, olay === "yeni" || olay === "onaysiz" ? "Görevi ata" : "Randevuları aç")}</p>`,
    520
  );

  const text = [
    s.baslik,
    "",
    s.giris.replace(/<[^>]+>/g, ""),
    "",
    zaman,
    `${r.ad} · ${r.eposta}${r.telefon ? ` · ${r.telefon}` : ""}`,
    ...(r.not ? ["", r.not] : []),
    "",
    a.adminUrl,
  ].join("\n");

  return { subject: s.konu, html, text };
}
