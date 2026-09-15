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
  /** Paylaşan kişinin adı. Boşsa cümle kişisiz kurulur. */
  paylasanAdi?: string;
  /** Gönderenin yazdığı serbest not. Boş olabilir. */
  not?: string;
  url: string;
  boyutMetni?: string;
}

export function paylasimKonusu(params: { dosyaAdi: string; paylasanAdi?: string }): string {
  return params.paylasanAdi
    ? `${params.paylasanAdi} sizinle bir dosya paylaştı: ${params.dosyaAdi}`
    : `Sizinle bir dosya paylaşıldı: ${params.dosyaAdi}`;
}

export function paylasimHtml(p: PaylasimParams): string {
  const kim = p.paylasanAdi ? `<strong>${kacir(p.paylasanAdi)}</strong>` : "Bir Projelio kullanıcısı";
  const boyut = p.boyutMetni ? ` · ${kacir(p.boyutMetni)}` : "";
  return epostaKabugu(
    "tr",
    `
<h1 style="margin:0 0 16px;font-size:20px;color:${MARKA.yaziKoyu};">Sizinle bir dosya paylaşıldı</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:${MARKA.yaziOrta};">
  ${kim} sizinle bir dosya paylaştı. Aşağıdaki bağlantıdan önizleyebilir ve indirebilirsiniz.
</p>
<div style="margin:0 0 20px;padding:14px 16px;border:1px solid ${MARKA.cizgi};border-radius:10px;">
  <div style="font-size:15px;color:${MARKA.yaziKoyu};font-weight:600;">${kacir(p.dosyaAdi)}</div>
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
  <a href="${p.url}" style="display:inline-block;background:${MARKA.vurgu};color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:15px;font-weight:600;">Dosyayı aç</a>
</p>
<p style="margin:0;font-size:12px;line-height:1.6;color:${MARKA.yaziSoluk};">
  Bu bağlantı yalnızca bu dosya içindir; paylaşan kişi istediği an kapatabilir.
  Bağlantı çalışmıyorsa adresi tarayıcınıza yapıştırın:<br />${p.url}
</p>`
  );
}

export function paylasimMetni(p: PaylasimParams): string {
  return [
    p.paylasanAdi ? `${p.paylasanAdi} sizinle bir dosya paylaştı.` : "Sizinle bir dosya paylaşıldı.",
    "",
    p.dosyaAdi + (p.boyutMetni ? ` (${p.boyutMetni})` : ""),
    ...(p.not ? ["", p.not] : []),
    "",
    p.url,
    "",
    "Bu bağlantı yalnızca bu dosya içindir; paylaşan kişi istediği an kapatabilir.",
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
