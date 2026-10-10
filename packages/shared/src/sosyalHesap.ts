/**
 * Sosyal medya kullanıcı adının tek biçimi.
 *
 * NEDEN ORTAK DOSYADA: aynı temizliği iki yer yapıyor — composer'daki
 * "katkıda bulunan ekle" kutusu ve sunucunun kayıt/yayın kuralları. İki kopya,
 * biri düzeltilip diğeri unutulduğunda ekranda "eklendi" görünüp sunucuda
 * "zaten var" hatası veren bir alan demekti.
 *
 * Kullanıcılar adı üç biçimde yapıştırıyor: "@pist.istanbul",
 * "pist.istanbul", "https://instagram.com/pist.istanbul/". Üçü de aynı
 * hesap: baştaki "@" ve profil adresi atılır, küçük harfe çevrilir.
 */
export function normalizeSocialHandle(raw: string | null | undefined): string {
  let value = (raw ?? "").trim();
  const fromUrl = value.match(/^https?:\/\/[^/]+\/([^/?#]+)/i);
  if (fromUrl) value = fromUrl[1];
  return value.replace(/^@+/, "").replace(/\/+$/, "").trim().toLocaleLowerCase("en-US");
}

/**
 * Instagram yayın API'sinin tek karuselde kabul ettiği en fazla medya.
 *
 * DİKKAT: Instagram UYGULAMASI 2024'ten beri 20'ye izin veriyor ama içerik
 * yayınlama API'si hâlâ 10 diyor (Meta belgesi, 2026-10-10'da bakıldı:
 * "Carousels are limited to 10 images, videos, or a mix of the two").
 * Kullanıcı 20 görsel planlayıp yayın saatinde hata almıştı; sınır artık
 * planlarken söyleniyor. Meta API'yi 20'ye çıkarırsa yalnızca bu sayı değişir.
 */
export const MAX_INSTAGRAM_CAROUSEL = 10;

/** Karusel sınırı aşıldıysa kullanıcıya gösterilecek cümle; aşılmadıysa null. */
export function instagramKaruselHatasi(medyaSayisi: number): string | null {
  if (medyaSayisi <= MAX_INSTAGRAM_CAROUSEL) return null;
  return `Instagram'a otomatik yayında karusel en fazla ${MAX_INSTAGRAM_CAROUSEL} medya alabilir (uygulamada 20 olsa da Instagram'ın yayın API'si 10 kabul ediyor). Bu içerikte ${medyaSayisi} medya var: fazlasını çıkarın ya da ikinci bir gönderiye bölün.`;
}
