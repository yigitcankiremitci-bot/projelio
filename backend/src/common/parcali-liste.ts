/**
 * Uzun `in (...)` listelerini parçalara böler.
 *
 * NEDEN VAR: Supabase JS istemcisi PostgREST'e HTTP ile gidiyor ve `.in()`
 * filtresindeki her id ADRES SATIRINA yazılıyor. Bir uuid, kaçış karakterleriyle
 * birlikte ~40 bayt; 500 id, 19 KB'lık bir URL demek.
 *
 * Canlıda ölçülen eşik (2026-09-11): 410 id geçiyor, 420 id geçmiyor — yani
 * ~16 KB. Üstüne çıkınca istek "sorgu çok uzun" demiyor; Node'un fetch'i
 * UND_ERR_HEADERS_OVERFLOW ile düşüyor, alttaki yeniden deneme birkaç tur
 * dönüyor ve çağrı ~10 SANİYE sonra anlamsız bir hatayla bitiyor. 519 görevli
 * bir panonun 10 saniye boş kalmasının sebebi tam olarak buydu.
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
