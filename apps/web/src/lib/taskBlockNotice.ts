/**
 * Görev durumu sunucuda reddedildiğinde sebebini kullanıcıya söyler.
 *
 * NEDEN GEREKLİ: panolar durum değişikliğini iyimser uyguluyor — kart önce
 * yeni sütuna geçiyor, istek sonra gidiyor. Reddedilirse liste tazeleniyor ve
 * kart eski yerine "geri sıçrıyor". Bağımlılık kuralı (bkz. migration 094)
 * devreye girdiğinde bu sıçrama tek başına hiçbir şey anlatmıyordu.
 *
 * YALNIZCA 400: ağ kopması, oturum düşmesi ya da sunucu hatası bu akışta zaten
 * başka yerlerde ele alınıyor; onlar için de kutu açmak, geçici bir aksaklığı
 * kullanıcının önüne dikmek olurdu. 400 ise "bunu yapamazsın, sebebi şu"
 * demektir ve tek anlamlı yanıt sebebi göstermek.
 *
 * window.alert bilinçli: uygulamada bu akış için bir bildirim şeridi yok ve
 * aynı desen TaskColumn'daki dönüştürme hatasında da kullanılıyor.
 */
export function gorevDurumHatasiniBildir(err: unknown): void {
  const hata = err as { status?: number; message?: string } | null;
  if (hata?.status !== 400 || !hata.message) return;
  window.alert(hata.message);
}

/**
 * Alt görev kaydedilemediğinde kullanıcıyı uyarır.
 *
 * NEDEN AYRI: durum değişikliğinin aksine burada iyimser bir kart yok — istek
 * düşerse ekranda hiçbir iz kalmaz. Dört ayrı panoda bu hata `catch {}` ile
 * yutuluyordu; kullanıcı yazdığı alt görevin kaybolduğunu görüp "uygulama
 * kaydetmiyor" diyordu, oysa sebebini görebilseydi tekrar deneyebilirdi.
 *
 * 401 dışarıda: oturum sonlanması client.ts'te tek merkezden yönetiliyor,
 * üstüne bir de kutu açmak aynı olayı iki kez anlatmak olurdu.
 */
export function altGorevHatasiniBildir(err: unknown): void {
  const hata = err as { status?: number; message?: string } | null;
  if (hata?.status === 401) return;
  if (hata?.status === 400 && hata.message) {
    window.alert(hata.message);
    return;
  }
  window.alert("Alt görev kaydedilemedi. Lütfen tekrar deneyin.");
}
