import type { Locale } from "@projelio/shared";
import { cevirmen } from "../../common/i18n";
import { epostaKabugu, kacir, MARKA } from "../auth/email-shell";

/**
 * İndirme linki e-postalarının metinleri.
 *
 * SERVİSTEN AYRI: gövde üretmek saf bir iş (girdi → dize) ve testi de öyle
 * yazılabiliyor. Servisin içinde kalsaydı, tek bir cümleyi doğrulamak için
 * Supabase ve Resend'in taklidini kurmak gerekirdi.
 *
 * DİL: alıcı Projelio kullanıcısı DEĞİL — dili bilinmiyor, `users.locale` diye
 * bir satırı yok. Bu yüzden paylaşım e-postasının dilini GÖNDEREN seçiyor
 * (pencerede "E-posta dili", varsayılanı kendi dili): alıcısını tanıyan o.
 * Tahmin etmeye çalışmak (alan adından, adresten) yabancı müşteriye Türkçe ya
 * da Türk muhasebeciye İngilizce mesaj demekti. "İndirildi" bildirimi ise
 * gönderene gidiyor ve Türkçe kaldı.
 */

interface PaylasimParams {
  /** Mesajın dili. Verilmezse Türkçe (eski davranış). */
  dil?: Locale;
  dosyaAdi: string;
  /**
   * Çok dosyalı bağlantıda dosyaların adları (bkz. migration 121). Doluysa
   * kutuda tek ad yerine liste çizilir: alıcı "hepsi geldi mi" sorusunu
   * bağlantıyı açmadan cevaplayabilsin.
   */
  dosyaAdlari?: string[];
  /** Paylaşan kişinin adı. Boşsa cümle kişisiz kurulur. */
  paylasanAdi?: string;
  /** Gönderenin yazdığı serbest not. Boş olabilir. */
  not?: string;
  url: string;
  boyutMetni?: string;
  /**
   * Doluysa bu e-posta GÖNDERENİN KENDİ KOPYASI: üstte "kime gitti" şeridiyle
   * çizilir. Gönderen, alıcının gördüğü mesajın aynısını görmeli — ayrı bir
   * "gönderdiniz" özeti yazmak, asıl sorunun ("ne gitti?") cevabını vermezdi.
   * Bu yüzden şerit de alıcının mesajıyla AYNI dilde.
   */
  kopyaAlicilari?: string[];
}

export function paylasimKonusu(params: {
  dosyaAdi: string;
  paylasanAdi?: string;
  dosyaSayisi?: number;
  dil?: Locale;
}): string {
  const t = cevirmen(params.dil ?? "tr");
  const paket = (params.dosyaSayisi ?? 1) > 1;
  if (params.paylasanAdi) {
    return paket
      ? t("{ad} sizinle {sayi} dosya paylaştı: {dosya}", {
          ad: params.paylasanAdi,
          sayi: params.dosyaSayisi,
          dosya: params.dosyaAdi,
        })
      : t("{ad} sizinle bir dosya paylaştı: {dosya}", { ad: params.paylasanAdi, dosya: params.dosyaAdi });
  }
  return paket
    ? t("Sizinle {sayi} dosya paylaşıldı: {dosya}", { sayi: params.dosyaSayisi, dosya: params.dosyaAdi })
    : t("Sizinle bir dosya paylaşıldı: {dosya}", { dosya: params.dosyaAdi });
}

/** Gönderenin kendi kopyasının konusu — gelen kutusunda alıcının mesajıyla karışmasın. */
export function kopyaKonusu(dosyaAdi: string, dil: Locale = "tr"): string {
  return cevirmen(dil)("Kopya: {dosya} paylaşıldı", { dosya: dosyaAdi });
}

/**
 * Metnin dile ve dosya sayısına göre değişen parçaları — HTML ve düz metin
 * sürümü aynı cümleleri kullansın diye tek yerde.
 */
function paylasimMetinleri(p: PaylasimParams) {
  const dil = p.dil ?? "tr";
  const t = cevirmen(dil);
  const paket = (p.dosyaAdlari?.length ?? 0) > 1;
  const sayi = p.dosyaAdlari?.length ?? 1;
  return {
    dil,
    paket,
    baslik: paket ? t("Sizinle {sayi} dosya paylaşıldı", { sayi }) : t("Sizinle bir dosya paylaşıldı"),
    giris: (ad?: string) =>
      ad
        ? paket
          ? t("{ad} sizinle {sayi} dosya paylaştı.", { ad, sayi })
          : t("{ad} sizinle bir dosya paylaştı.", { ad })
        : paket
        ? t("Bir Projelio kullanıcısı sizinle {sayi} dosya paylaştı.", { sayi })
        : t("Bir Projelio kullanıcısı sizinle bir dosya paylaştı."),
    onizle: t("Aşağıdaki bağlantıdan önizleyebilir ve indirebilirsiniz."),
    kaynak: t("Projelio üzerinden paylaşıldı"),
    toplam: (boyut: string) => t("Toplam {boyut}", { boyut }),
    dugme: paket ? t("Dosyaları aç") : t("Dosyayı aç"),
    kapsam: paket
      ? t("Bu bağlantı yalnızca bu dosyalar içindir; paylaşan kişi istediği an kapatabilir.")
      : t("Bu bağlantı yalnızca bu dosya içindir; paylaşan kişi istediği an kapatabilir."),
    yapistir: t("Bağlantı çalışmıyorsa adresi tarayıcınıza yapıştırın:"),
    kopyaBaslik: t("Bu sizin kopyanız."),
    kopyaAciklama: t("Aşağıdaki mesaj şu adreslere gönderildi:"),
  };
}

/**
 * Adın yerine önce konan işaret. Ad KALIN yazılsın diye cümle yer tutucuyla
 * çevrilip kaçırılıyor, sonra işaretin yerine `<strong>` konuyor: HTML'i
 * çeviri anahtarına gömmek, her dilde etiketi korumayı çevirmene bırakmak
 * olurdu. `kacir` bu karakterlere dokunmuyor.
 */
const AD_ISARETI = "@@PAYLASAN@@";

export function paylasimHtml(p: PaylasimParams): string {
  const m = paylasimMetinleri(p);
  const giris = kacir(m.giris(p.paylasanAdi ? AD_ISARETI : undefined)).replace(
    AD_ISARETI,
    `<strong>${kacir(p.paylasanAdi ?? "")}</strong>`
  );
  const boyut = p.boyutMetni ? ` · ${kacir(p.boyutMetni)}` : "";
  const kopyaSeridi = p.kopyaAlicilari?.length
    ? `<div style="margin:0 0 18px;padding:10px 12px;border-radius:9px;background:${MARKA.zemin};font-size:13px;line-height:1.6;color:${MARKA.yaziOrta};">
  <strong style="color:${MARKA.yaziKoyu};">${kacir(m.kopyaBaslik)}</strong> ${kacir(m.kopyaAciklama)}<br />${kacir(
        p.kopyaAlicilari.join(", ")
      )}
</div>`
    : "";
  const adKutusu = m.paket
    ? p
        .dosyaAdlari!.map(
          (ad) => `<div style="font-size:14px;color:${MARKA.yaziKoyu};font-weight:600;padding:2px 0;">${kacir(ad)}</div>`
        )
        .join("")
    : `<div style="font-size:15px;color:${MARKA.yaziKoyu};font-weight:600;">${kacir(p.dosyaAdi)}</div>`;

  return epostaKabugu(
    m.dil,
    `${kopyaSeridi}
<h1 style="margin:0 0 16px;font-size:20px;color:${MARKA.yaziKoyu};">${kacir(m.baslik)}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:${MARKA.yaziOrta};">
  ${giris} ${kacir(m.onizle)}
</p>
<div style="margin:0 0 20px;padding:14px 16px;border:1px solid ${MARKA.cizgi};border-radius:10px;">
  ${adKutusu}
  <div style="font-size:13px;color:${MARKA.yaziSoluk};margin-top:4px;">${kacir(m.kaynak)}${boyut}</div>
</div>
${
  p.not
    ? `<p style="margin:0 0 20px;padding:12px 14px;background:${MARKA.zemin};border-radius:10px;font-size:14px;line-height:1.6;color:${MARKA.yaziOrta};white-space:pre-wrap;">${kacir(
        p.not
      )}</p>`
    : ""
}
<p style="margin:0 0 24px;">
  <a href="${p.url}" style="display:inline-block;background:${MARKA.vurgu};color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:15px;font-weight:600;">${kacir(m.dugme)}</a>
</p>
<p style="margin:0;font-size:12px;line-height:1.6;color:${MARKA.yaziSoluk};">
  ${kacir(m.kapsam)}
  ${kacir(m.yapistir)}<br />${p.url}
</p>`
  );
}

export function paylasimMetni(p: PaylasimParams): string {
  const m = paylasimMetinleri(p);
  return [
    ...(p.kopyaAlicilari?.length ? [`${m.kopyaBaslik} ${m.kopyaAciklama} ${p.kopyaAlicilari.join(", ")}`, ""] : []),
    m.giris(p.paylasanAdi),
    "",
    ...(m.paket
      ? [...p.dosyaAdlari!.map((ad) => `- ${ad}`), ...(p.boyutMetni ? [m.toplam(p.boyutMetni)] : [])]
      : [p.dosyaAdi + (p.boyutMetni ? ` (${p.boyutMetni})` : "")]),
    ...(p.not ? ["", p.not] : []),
    "",
    p.url,
    "",
    m.kapsam,
  ].join("\n");
}

interface IndirildiParams {
  dosyaAdi: string;
  /** Kapının ardındaki adres varsa kim indirdiğini söyleyebiliyoruz. */
  alaniAcanEposta?: string;
  indirmeSayisi: number;
  yonetimUrl: string;
}

export function indirildiKonusu(dosyaAdi: string): string {
  return `İndirildi: ${dosyaAdi}`;
}

/**
 * "Dosyanız indirildi" bildirimi — linki OLUŞTURANA gider.
 *
 * KİM İNDİRDİ sorusunun cevabı çoğu zaman YOK ve uydurulmuyor: linkte e-posta
 * kapısı varsa kapıyı geçen adres yazılır, yoksa "bilinmiyor" denir. IP ya da
 * tarayıcı bilgisi TUTULMUYOR (bkz. migration 114): linki açan kişi Projelio
 * kullanıcısı değil ve onun hakkında veri biriktirmenin gerekçesi yok.
 */
export function indirildiHtml(p: IndirildiParams): string {
  return epostaKabugu(
    "tr",
    `
<h1 style="margin:0 0 16px;font-size:20px;color:${MARKA.yaziKoyu};">Paylaştığınız dosya indirildi</h1>
<div style="margin:0 0 20px;padding:14px 16px;border:1px solid ${MARKA.cizgi};border-radius:10px;">
  <div style="font-size:15px;color:${MARKA.yaziKoyu};font-weight:600;">${kacir(p.dosyaAdi)}</div>
  <div style="font-size:13px;color:${MARKA.yaziSoluk};margin-top:4px;">
    ${p.alaniAcanEposta ? `İndiren: ${kacir(p.alaniAcanEposta)}` : "İndiren kişi bilinmiyor (bağlantıda e-posta sorulmuyor)"}
    · Toplam ${p.indirmeSayisi} indirme
  </div>
</div>
<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:${MARKA.yaziOrta};">
  Bağlantıyı kapatmak, indirmeyi durdurmak ya da bu bildirimleri kapatmak için dosyanın bağlantı penceresini açın.
</p>
<p style="margin:0 0 24px;">
  <a href="${p.yonetimUrl}" style="display:inline-block;background:${MARKA.vurgu};color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:15px;font-weight:600;">Projelio'yu aç</a>
</p>`
  );
}

export function indirildiMetni(p: IndirildiParams): string {
  return [
    "Paylaştığınız dosya indirildi.",
    "",
    p.dosyaAdi,
    p.alaniAcanEposta ? `İndiren: ${p.alaniAcanEposta}` : "İndiren kişi bilinmiyor.",
    `Toplam ${p.indirmeSayisi} indirme`,
    "",
    p.yonetimUrl,
  ].join("\n");
}
