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
