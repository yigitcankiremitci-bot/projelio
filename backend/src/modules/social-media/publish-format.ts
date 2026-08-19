/**
 * Yayının saf kuralları: metin nasıl birleşir, medya hangi sırayla gider,
 * Meta'nın hata gövdesinden kullanıcıya ne gösterilir.
 *
 * Servislerden AYRI bir dosyada, çünkü burası veritabanı ya da HTTP taklidi
 * gerektirmeden test edilebilmeli — module-access.ts ile aynı gerekçe. (Node'un
 * yerleşik test koşucusu Nest'in "parameter property" sözdizimini de
 * çalıştıramıyor; saf dosyalar bu yüzden ayrı duruyor.)
 */

/**
 * Yayımlanacak metin.
 *
 * Kanala özel metin varsa o kazanır; yoksa ortak metin + etiketler. Etiketler
 * ayrı alanda duruyor ama Instagram'da aynı gönderinin gövdesinde yayımlanıyor,
 * bu yüzden burada birleşiyorlar.
 *
 * NOT: "ilk yorum" alanı otomatik eklenmiyor — yorum yazmak ayrı bir Meta izni
 * (instagram_business_manage_comments) istiyor ve o izin bu turun kapsamında
 * değil. Alan formda duruyor, kullanıcı elle yapıştırıyor.
 */
export function buildCaption(
  post: { caption?: string | null; hashtags?: string | null },
  target: { caption_override?: string | null }
): string {
  if (target.caption_override?.trim()) return target.caption_override.trim();
  return [post.caption?.trim(), post.hashtags?.trim()].filter(Boolean).join("\n\n");
}

/**
 * Gönderinin medyası, kullanıcının verdiği sırayla.
 *
 * Karusel'de sıra içeriğin kendisidir: ilk görsel hem kapak hem de bütün
 * karuselin kırpma oranını belirler.
 */
export function mediaFileIds(post: { social_post_media?: { file_id: string; sort_order?: number }[] }): string[] {
  return [...(post.social_post_media ?? [])]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((m) => m.file_id);
}

/**
 * Meta'nın hata gövdesinden okunabilir cümleyi çıkarır.
 *
 * Ham gövde ({"error":{"message":"Error validating access token: Session has
 * expired","type":"OAuthException","code":190}}) kullanıcıya gösterilecek bir
 * metin değil; ama tamamen yutmak da hata ayıklamayı imkânsız kılıyor. Meta
 * kullanıcıya dönük bir mesaj verdiyse (error_user_msg) o tercih edilir,
 * yoksa teknik mesaj kullanılır, o da yoksa genel bir cümle.
 */
export function extractMetaError(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string; error_user_msg?: string } };
    return parsed.error?.error_user_msg || parsed.error?.message || "Instagram isteği reddedildi.";
  } catch {
    return "Instagram isteği reddedildi.";
  }
}
