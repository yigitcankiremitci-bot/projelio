/**
 * Liste uçlarının savunma tavanı.
 *
 * NEDEN VAR: kod tabanında gerçek sayfalama (`.range()`) hiç kullanılmıyor;
 * liste uçları eşleşen HER satırı döndürüyor. Bugün tablolar küçük olduğu için
 * sorun görünmüyor, ama bu sessizce büyüyen bir borç:
 *
 *   · Bir projede 5.000 görev birikince yanıt onlarca MB'a çıkar, backend
 *     hepsini belleğe alıp JSON'a çevirir, mobil istemcide arayüz donar.
 *   · Akış (project_posts) en hızlı büyüyen tablo; bir organizasyonda yıllar
 *     içinde on binlerce gönderi olur ve uç hepsini döndürür.
 *
 * Bu tavan GERÇEK SAYFALAMA DEĞİL — onun yerine geçmez. Yaptığı tek şey,
 * kopmayı önlemek: veri beklenmedik biçimde büyüdüğünde uç yavaşlar ama ayakta
 * kalır. API sözleşmesini bozmaz (istemci zaten dizi bekliyor).
 *
 * Sayfalama gerçekten gerektiğinde doğru çözüm keyset (imleç) tabanlı olmalı:
 * `created_at DESC, id` üzerinden. Derin `offset` Postgres'te yine tam tarama
 * demek olduğu için `.range()` ile sayfalama aldatıcıdır.
 *
 * Tavana DAYANAN bir uç görürsen (dönen satır sayısı sürekli tam bu değerse)
 * orası artık gerçek sayfalama istiyor demektir.
 */
export const LISTE_TAVANI = 500;

/**
 * Akış benzeri, doğal olarak hızlı büyüyen listeler için daha dar tavan.
 * Kullanıcı zaten en yenileri görüyor; eskisine gitmek için sayfalama gerekir.
 */
export const AKIS_TAVANI = 200;
