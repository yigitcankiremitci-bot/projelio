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

/**
 * Tavanın yetmediği listeler için: satırları sayfa sayfa çekip birleştirir.
 *
 * NEDEN VAR: LISTE_TAVANI bir güvenlik ağıdır, sayfalama değil — ve ağa DAYANAN
 * bir uç sessizce veri kaybeder. Proje görev listesi tam olarak buna düştü:
 * projede 541 görev birikince uç 500'ünü döndürdü, `sort_order` artan sıralama
 * yüzünden kesilen 41 satırın hepsi tek bir görevin alt görevleriydi. Kullanıcı
 * yeni eklediği alt görevleri sayfayı yenileyince göremiyordu ve "kaydetmiyor"
 * sanıyordu; oysa kayıtlar veritabanındaydı.
 *
 * Buradaki döngü sunucu tarafında kalıyor: istemci yine tek dizi alıyor, API
 * sözleşmesi değişmiyor. Yine de sınırsız değil — GETIRME_TAVANI bir kopyayı
 * değil, kaçak bir sorguyu durdurmak için duruyor.
 */
export const SAYFA_BOYU = 1000;
export const GETIRME_TAVANI = 20_000;

export async function tumSayfalar<T>(
  sayfaGetir: (baslangic: number, bitis: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  tavan: number = GETIRME_TAVANI,
  sayfaBoyu: number = SAYFA_BOYU
): Promise<T[]> {
  const tumu: T[] = [];
  for (let baslangic = 0; baslangic < tavan; baslangic += sayfaBoyu) {
    const bitis = Math.min(baslangic + sayfaBoyu, tavan) - 1;
    const { data, error } = await sayfaGetir(baslangic, bitis);
    if (error) throw error;
    const satirlar = data ?? [];
    tumu.push(...satirlar);
    // Eksik dolu sayfa = son sayfa. Tam dolu gelirse bir sonrakine bakılır.
    if (satirlar.length < bitis - baslangic + 1) break;
  }
  return tumu;
}
