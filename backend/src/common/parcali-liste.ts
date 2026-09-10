/**
 * Uzun `in (...)` listelerini parçalara böler.
 *
 * NEDEN VAR: Supabase JS istemcisi PostgREST'e HTTP ile gidiyor ve `.in()`
 * filtresindeki her id ADRES SATIRINA yazılıyor. Bir uuid, kaçış karakterleriyle
 * birlikte ~40 bayt; 300 id, 12 KB'lık bir URL demek. Sunucuların (ve Caddy'nin)
 * istek satırı sınırı bunun çok altında — istek 4xx ile düşüyor ve hata
 * "sorgu çok uzun" değil, anlamsız bir 500 olarak görünüyor.
 *
 * SESSİZ BİR SINIR: küçük hesaplarda hiç görünmüyor, veri büyüdükçe bir gün
 * aniden ortaya çıkıyor. Bu yüzden liste uzunluğuna güvenen her `.in()`
 * çağrısı buradan geçmeli.
 */

/** Tek sorguda taşınacak en fazla id. 40 bayt × 50 ≈ 2 KB — güvenli aralık. */
export const PARCA_BOYUTU = 50;

/** Listeyi en fazla `boyut` uzunluğunda parçalara böler. Boş liste boş dizi döner. */
export function parcalara<T>(liste: T[], boyut = PARCA_BOYUTU): T[][] {
  if (boyut < 1) throw new Error("Parça boyutu en az 1 olmalı");
  const parcalar: T[][] = [];
  for (let i = 0; i < liste.length; i += boyut) parcalar.push(liste.slice(i, i + boyut));
  return parcalar;
}
