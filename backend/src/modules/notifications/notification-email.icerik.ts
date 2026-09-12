/**
 * Günlük özetin İÇERİĞİ: ne gönderilecek ve gönderilecek bir şey var mı.
 *
 * NEDEN AYRI VE SAF BİR FONKSİYON — yaşanmış hata:
 *
 * Bu karar eskiden İKİ AYRI YERDE, iki farklı ölçüyle veriliyordu. Tur
 * döngüsü ham görev listesine bakıp "dolu" diyordu; gönderim fonksiyonu ise
 * listeyi kullanıcının yerel gününe süzdükten sonra "boş" diyordu. İkisinin
 * ayrıştığı durum gerçekti ve sessizdi:
 *
 *   Kullanıcının ±36 saatlik pencerede 32 görevi var ama hiçbiri BUGÜNE ait
 *   değil (hepsi yarın ve öbür gün), okunmamış bildirimi de yok. Döngü
 *   "gönderilecek şey var" deyip damgalamayı atlıyor, gönderim ise süzdükten
 *   sonra boş kalıp e-posta atmıyor. Sonuç: ne e-posta gidiyor ne gün
 *   damgalanıyor — kullanıcı her 10 dakikada bir yeniden hesaplanıp SONSUZA
 *   KADAR askıda kalıyor ve o günün özetini hiç alamıyor.
 *
 * Süzme ve "boş mu" kararı artık tek bir yerde, tek bir sonuç nesnesinde.
 * İkisinin ayrışması yapısal olarak imkânsız: çağıran taraf aynı nesnenin
 * hem `bos` alanını hem `gorevler` listesini kullanıyor.
 */

/** Yerel gün süzmesi için görevin ait olduğu takvim günü (YYYY-MM-DD). */
export interface GunluGorev {
  gun: string;
}

export interface GunlukIcerik<B, G> {
  bildirimler: B[];
  /** Yalnızca kullanıcının yerel gününe düşenler. */
  gorevler: G[];
  /** Gönderilecek hiçbir şey yok — e-posta atma, ama günü DAMGALA. */
  bos: boolean;
}

export function gunlukOzetIcerigi<B, G extends GunluGorev>(params: {
  bildirimler: B[];
  /** Pencereden gelen ham görevler (birkaç günü birden kapsar). */
  gorevler: G[];
  /** Kullanıcının yerel günü (YYYY-MM-DD). */
  yerelGun: string;
  /** Kullanıcı görev listesini istemiyorsa görevler hiç bakılmadan düşer. */
  gorevlerDahil: boolean;
}): GunlukIcerik<B, G> {
  const gorevler = params.gorevlerDahil ? params.gorevler.filter((gorev) => gorev.gun === params.yerelGun) : [];
  return {
    bildirimler: params.bildirimler,
    gorevler,
    bos: params.bildirimler.length === 0 && gorevler.length === 0,
  };
}
