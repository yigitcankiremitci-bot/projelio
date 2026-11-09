import { randomBytes } from "node:crypto";

/**
 * Kayıt yalnızca e-posta + şifre isteyebilsin diye eksik kimlik alanlarını üretir.
 *
 * Kullanıcı adı bilerek rastgele: uygulamada herkese görünen bir tanımlayıcı,
 * e-postanın baş kısmından türetilseydi adresi ekip aramalarında ifşa ederdi.
 * Kişi sonradan Ayarlar'dan değiştirebilir.
 */
export function rastgeleKullaniciAdi(): string {
  return `uye_${randomBytes(5).toString("hex")}`;
}

/** "ayse.demir+is@x.com" → "Ayse Demir". Harf kalmazsa e-postanın kendisi kullanılır. */
export function epostadanAd(email: string): string {
  const yerel = email.split("@")[0].split("+")[0];
  const ad = yerel
    .split(/[._-]+/)
    .map((p) => p.replace(/[^\p{L}]/gu, ""))
    .filter(Boolean)
    .map((p) => p.charAt(0).toLocaleUpperCase("tr") + p.slice(1))
    .join(" ");
  return ad || yerel || email;
}
