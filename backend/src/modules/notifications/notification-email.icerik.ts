/**
 * Günlük özetin İÇERİĞİ: hangi görevler girecek ve girecek bir şey var mı.
 *
 * NEDEN AYRI VE SAF BİR FONKSİYON — yaşanmış hata:
 *
 * Bu karar eskiden İKİ AYRI YERDE, iki farklı ölçüyle veriliyordu. Tur
 * döngüsü ham görev listesine bakıp "dolu" diyordu; gönderim fonksiyonu ise
 * listeyi kullanıcının yerel gününe süzdükten sonra "boş" diyordu. İkisinin
 * ayrıştığı durum gerçekti ve sessizdi:
 *
 *   Kullanıcının penceresinde 32 görev vardı ama hiçbiri O GÜNE ait değildi
 *   (hepsi ertesi iki gün), okunmamış bildirimi de yoktu. Döngü "gönderilecek
 *   şey var" deyip damgalamayı atladı, gönderim süzdükten sonra boş kalıp
 *   e-posta atmadı. Sonuç: ne e-posta gitti ne gün damgalandı — kullanıcı her
 *   10 dakikada bir yeniden hesaplanıp o günün özetini hiç alamadan askıda
 *   kaldı.
 *
 * Süzme ve "boş mu" kararı artık tek bir yerde, tek bir sonuç nesnesinde.
 * İkisinin ayrışması yapısal olarak imkânsız: çağıran taraf aynı nesnenin hem
 * `bos` alanını hem bölümlerini kullanıyor.
 *
 * ## Neden üç bölüm
 *
 * Özet önce YALNIZCA "bugün biten" görevleri listeliyordu ve bu, işleri birkaç
 * gün sonraya yığılmış bir kullanıcıda özeti günlerce boş bırakıyordu — 32
 * açık görevi olan biri "bugün işin yok" diyen bir sessizlik alıyordu.
 *
 *   geciken → zaten kaçırılmış işi atlayan bir özet, özetin işini yapmıyor
 *   bugün   → asıl gündem
 *   yarın   → hazırlanmak için vakit bırakır
 */

/** Yerel gün süzmesi için görevin ait olduğu takvim günü (YYYY-MM-DD). */
export interface GunluGorev {
  gun: string;
}

export interface GorevBolumleri<G> {
  geciken: G[];
  bugun: G[];
  yarin: G[];
}

export interface GunlukIcerik<B, G> {
  bildirimler: B[];
  gorevler: GorevBolumleri<G>;
  /** Gönderilecek hiçbir şey yok — e-posta atma, ama günü DAMGALA. */
  bos: boolean;
}

/**
 * "2026-09-30" → "2026-10-01".
 *
 * UTC üzerinden hesaplanıyor: gün dizesi bir TAKVİM günü, saat dilimi taşımıyor.
 * Yerel saatle kurulan bir Date, yaz saati geçişlerinde aynı günü ya da iki gün
 * sonrasını verebilirdi.
 */
export function sonrakiGun(gun: string): string {
  const [yil, ay, gunNo] = gun.split("-").map(Number);
  return new Date(Date.UTC(yil, ay - 1, gunNo + 1)).toISOString().slice(0, 10);
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
  const bolumler: GorevBolumleri<G> = { geciken: [], bugun: [], yarin: [] };
  const gorevler = params.gorevlerDahil ? params.gorevler : [];
  const yarin = sonrakiGun(params.yerelGun);

  for (const gorev of gorevler) {
    if (gorev.gun < params.yerelGun) bolumler.geciken.push(gorev);
    else if (gorev.gun === params.yerelGun) bolumler.bugun.push(gorev);
    else if (gorev.gun === yarin) bolumler.yarin.push(gorev);
    // Daha ileri tarihliler DÜŞER: sorgu penceresi onları da getiriyor olabilir
    // ama özet "önümüzdeki iki gün"ü anlatıyor, tüm yılı değil.
  }
  // Geciken listesi en eskiden yeniye: en uzun bekleyen en üstte görünsün.
  bolumler.geciken.sort((a, b) => (a.gun < b.gun ? -1 : a.gun > b.gun ? 1 : 0));

  return {
    bildirimler: params.bildirimler,
    gorevler: bolumler,
    bos:
      params.bildirimler.length === 0 &&
      bolumler.geciken.length === 0 &&
      bolumler.bugun.length === 0 &&
      bolumler.yarin.length === 0,
  };
}
