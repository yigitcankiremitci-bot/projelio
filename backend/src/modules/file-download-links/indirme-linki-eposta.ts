import { epostaKabugu, kacir, MARKA } from "../auth/email-shell";

/**
 * İndirme linki e-postalarının metinleri.
 *
 * SERVİSTEN AYRI: gövde üretmek saf bir iş (girdi → dize) ve testi de öyle
 * yazılabiliyor. Servisin içinde kalsaydı, tek bir cümleyi doğrulamak için
 * Supabase ve Resend'in taklidini kurmak gerekirdi.
 *
 * DİL: alıcı Projelio kullanıcısı DEĞİL — dili bilinmiyor, `users.locale` diye
 * bir satırı yok. Metin sabit Türkçe; belge arşivi e-postasıyla aynı karar
 * (bkz. EmailService.sendBelgeArsivi).
 */

interface PaylasimParams {
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
   */
  kopyaAlicilari?: string[];
}

export function paylasimKonusu(params: { dosyaAdi: string; paylasanAdi?: string; dosyaSayisi?: number }): string {
  const ne = neKadar(params.dosyaSayisi);
  return params.paylasanAdi
    ? `${params.paylasanAdi} sizinle ${ne} paylaştı: ${params.dosyaAdi}`
    : `Sizinle ${ne} paylaşıldı: ${params.dosyaAdi}`;
}

/** "bir dosya" / "3 dosya" — konu ve gövde aynı ifadeyi kullansın. */
function neKadar(sayi?: number): string {
  return sayi && sayi > 1 ? `${sayi} dosya` : "bir dosya";
}

/** Gönderenin kendi kopyasının konusu — gelen kutusunda alıcının mesajıyla karışmasın. */
export function kopyaKonusu(dosyaAdi: string): string {
  return `Kopya: ${dosyaAdi} paylaşıldı`;
}

export function paylasimHtml(p: PaylasimParams): string {
  const kim = p.paylasanAdi ? `<strong>${kacir(p.paylasanAdi)}</strong>` : "Bir Projelio kullanıcısı";
  const boyut = p.boyutMetni ? ` · ${kacir(p.boyutMetni)}` : "";
  const paket = (p.dosyaAdlari?.length ?? 0) > 1;
  const ne = neKadar(p.dosyaAdlari?.length);
  const adKutusu = paket
    ? p
        .dosyaAdlari!.map(
          (ad) => `<div style="font-size:14px;color:${MARKA.yaziKoyu};font-weight:600;padding:2px 0;">${kacir(ad)}</div>`
        )
        .join("")
    : `<div style="font-size:15px;color:${MARKA.yaziKoyu};font-weight:600;">${kacir(p.dosyaAdi)}</div>`;
  const kopyaSeridi = p.kopyaAlicilari?.length
    ? `<div style="margin:0 0 18px;padding:10px 12px;border-radius:9px;background:${MARKA.zemin};font-size:13px;line-height:1.6;color:${MARKA.yaziOrta};">
  <strong style="color:${MARKA.yaziKoyu};">Bu sizin kopyanız.</strong> Aşağıdaki mesaj şu adreslere gönderildi:<br />${kacir(
        p.kopyaAlicilari.join(", ")
      )}
</div>`
    : "";

  return epostaKabugu(
    "tr",
    `${kopyaSeridi}
<h1 style="margin:0 0 16px;font-size:20px;color:${MARKA.yaziKoyu};">Sizinle ${ne} paylaşıldı</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:${MARKA.yaziOrta};">
  ${kim} sizinle ${ne} paylaştı. Aşağıdaki bağlantıdan önizleyebilir ve indirebilirsiniz.
</p>
<div style="margin:0 0 20px;padding:14px 16px;border:1px solid ${MARKA.cizgi};border-radius:10px;">
  ${adKutusu}
  <div style="font-size:13px;color:${MARKA.yaziSoluk};margin-top:4px;">Projelio üzerinden paylaşıldı${boyut}</div>
</div>
${
  p.not
    ? `<p style="margin:0 0 20px;padding:12px 14px;background:${MARKA.zemin};border-radius:10px;font-size:14px;line-height:1.6;color:${MARKA.yaziOrta};white-space:pre-wrap;">${kacir(
        p.not
      )}</p>`
    : ""
}
<p style="margin:0 0 24px;">
  <a href="${p.url}" style="display:inline-block;background:${MARKA.vurgu};color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:15px;font-weight:600;">${paket ? "Dosyaları aç" : "Dosyayı aç"}</a>
</p>
<p style="margin:0;font-size:12px;line-height:1.6;color:${MARKA.yaziSoluk};">
  Bu bağlantı yalnızca ${paket ? "bu dosyalar" : "bu dosya"} içindir; paylaşan kişi istediği an kapatabilir.
  Bağlantı çalışmıyorsa adresi tarayıcınıza yapıştırın:<br />${p.url}
</p>`
  );
}

export function paylasimMetni(p: PaylasimParams): string {
  const paket = (p.dosyaAdlari?.length ?? 0) > 1;
  const ne = neKadar(p.dosyaAdlari?.length);
  return [
    ...(p.kopyaAlicilari?.length
      ? [`Bu sizin kopyanız. Aşağıdaki mesaj şu adreslere gönderildi: ${p.kopyaAlicilari.join(", ")}`, ""]
      : []),
    p.paylasanAdi ? `${p.paylasanAdi} sizinle ${ne} paylaştı.` : `Sizinle ${ne} paylaşıldı.`,
    "",
    ...(paket
      ? [...p.dosyaAdlari!.map((ad) => `- ${ad}`), ...(p.boyutMetni ? [`Toplam ${p.boyutMetni}`] : [])]
      : [p.dosyaAdi + (p.boyutMetni ? ` (${p.boyutMetni})` : "")]),
    ...(p.not ? ["", p.not] : []),
    "",
    p.url,
    "",
    `Bu bağlantı yalnızca ${paket ? "bu dosyalar" : "bu dosya"} içindir; paylaşan kişi istediği an kapatabilir.`,
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
