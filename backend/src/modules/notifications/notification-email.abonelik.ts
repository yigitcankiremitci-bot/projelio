import { createHmac, timingSafeEqual } from "node:crypto";
import { getApiPublicUrl, getJwtSecret } from "../../common/config/env";

/**
 * E-postadaki "tek tık aboneliği bırak" bağlantısının imzası.
 *
 * NEDEN İMZA, OTURUM DEĞİL: bağlantı e-posta istemcisinden açılıyor ve Gmail
 * gibi sağlayıcılar onu KULLANICI ADINA, arka planda POST ederek çağırıyor
 * (List-Unsubscribe-Post). O isteğin oturum çerezi ya da JWT'si yok. Adresin
 * içinde ham bir userId taşımak ise herkesin, istediği kullanıcının
 * bildirimlerini kapatmasına izin verirdi.
 *
 * NEDEN SÜRESİZ: e-posta gelen kutusunda yıllarca durur. Süreli bir imza,
 * "aboneliği bırak" bağlantısı ölmüş bir e-posta demek — spam şikâyetine
 * giden en kısa yol tam olarak budur.
 *
 * Gizli anahtar JWT'ninkiyle aynı: ayrı bir sır üretmek, sunucuda
 * yönetilecek bir değişken daha demekti ve bu imzanın koruduğu şey (bildirim
 * tercihi) oturum jetonundan daha değerli değil.
 */

const AMAC = "bildirim-eposta-abonelik-v1";

export function abonelikImzasi(userId: string): string {
  return createHmac("sha256", getJwtSecret()).update(`${AMAC}:${userId}`).digest("hex").slice(0, 32);
}

export function abonelikImzasiGecerliMi(userId: string, imza: unknown): boolean {
  if (typeof imza !== "string" || imza.length === 0) return false;
  const beklenen = Buffer.from(abonelikImzasi(userId));
  const gelen = Buffer.from(imza);
  // timingSafeEqual farklı uzunlukta fırlatıyor; uzunluk zaten gizli değil.
  if (beklenen.length !== gelen.length) return false;
  return timingSafeEqual(beklenen, gelen);
}

/** E-postaya gömülecek tek tık kapatma adresi. */
export function abonelikKapatmaAdresi(userId: string): string {
  return `${getApiPublicUrl()}/notifications/eposta-kapat?u=${encodeURIComponent(userId)}&i=${abonelikImzasi(userId)}`;
}
