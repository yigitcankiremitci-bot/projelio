/**
 * Ekip Hesapları modülünün küçük yardımcıları (bkz. migration 130).
 *
 * Modül kendi tablolarına yazar, bu yüzden moduleConfigs altındaki alan
 * tanımı sözleşmesine tabi değil (Hesaplar'la aynı düzen).
 */

export const EKIP_HESAPLARI_MODULE_KEY = "ekip_hesaplari";

export function isEkipHesaplariModule(moduleKey: string): boolean {
  return moduleKey === EKIP_HESAPLARI_MODULE_KEY;
}

// Karışan karakterler (0/O, 1/l/I) bilerek yok: şifre yöneticiden çalışana
// çoğu zaman sesli ya da el yazısıyla geçiyor.
const HARFLER = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ISARETLER = "!@#$%*?";

/**
 * Güçlü, okunabilir bir başlangıç şifresi: 12 harf/rakam + 2 işaret.
 * `crypto.getRandomValues` — Math.random tahmin edilebilir.
 */
export function sifreUret(uzunluk = 14): string {
  const rastgele = new Uint32Array(uzunluk);
  crypto.getRandomValues(rastgele);
  const karakterler = Array.from(rastgele, (n, i) => {
    const kaynak = i === 4 || i === 9 ? ISARETLER : HARFLER;
    return kaynak[n % kaynak.length];
  });
  return karakterler.join("");
}
