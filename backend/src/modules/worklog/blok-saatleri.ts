/**
 * Bir Yaptım kaydının takvimde kaplayacağı saat aralığı.
 *
 * Servisten AYRI bir dosya: içindeki tek şey kenar durumları olan saf bir
 * hesap ve o kenar durumları veritabanına gitmeden sınanabilmeli (gece yarısı,
 * gün aşan aralık, gün başını taşıran geriye sayım).
 */

/** Kaydın takvim için gereken alanları. Hepsi yerel duvar saati, sonda Z yok. */
export interface BlokGirdisi {
  /** İşin yapıldığı an ("YYYY-MM-DDTHH:MM:SS"). */
  doneAt: string;
  startedAt?: string;
  endedAt?: string;
}

export interface BlokAraligi {
  /** "HH:MM" */
  baslangic: string;
  bitis: string;
}

/**
 * Aralığı hesaplar; takvime konamayacak durumda `null` döner.
 *
 * KURALLAR ve nedenleri:
 *
 *   1. Kullanıcı saat aralığı verdiyse AYNEN o kullanılır. Tahmin etmeye gerek
 *      yok, bildiği şeyi yazmış.
 *   2. Aralık iki ayrı güne yayılıyorsa null. `plan_time_blocks.starts_at/
 *      ends_at` `time` kolonları ve bir bloğun iki günü olamıyor; kayıt yine
 *      tam olarak duruyor, yalnızca takvimde görünmüyor.
 *   3. Yalnızca süre verildiyse işin kaydın girildiği anda BİTTİĞİ varsayılıp
 *      geriye sayılır. Bir tahmin ama makul olanı: insan işi bitirince
 *      kaydediyor.
 *   4. Geriye sayarken gün başı aşılıyorsa null — bloğu 00:00'a kırpmak, iki
 *      saat süren işi takvimde yirmi dakika göstermek olurdu ve kullanıcı
 *      neden öyle olduğunu hiçbir yerde göremezdi.
 *   5. Süre yoksa blok yok: sıfır yükseklikte bir kutu takvimde okunmuyor.
 */
export function blokAraligi(girdi: BlokGirdisi, dakika: number | null): BlokAraligi | null {
  if (girdi.startedAt && girdi.endedAt) {
    if (gun(girdi.startedAt) !== gun(girdi.endedAt)) return null;
    return { baslangic: saat(girdi.startedAt), bitis: saat(girdi.endedAt) };
  }

  if (!dakika || dakika <= 0) return null;

  const bitisDk = saatiDakikaya(saat(girdi.doneAt));
  const baslangicDk = bitisDk - dakika;
  if (baslangicDk < 0) return null;
  // Kaydın tam gece yarısında girildiği durumda bitiş de başlangıç da 00:00
  // olurdu; blok sıfır uzunlukta olamaz (planning tarafı da reddediyor).
  if (baslangicDk === bitisDk) return null;

  return { baslangic: dakikayiSaate(baslangicDk), bitis: dakikayiSaate(bitisDk) };
}

/** "09:30" -> 570. Gün içindeki dakika. */
export function saatiDakikaya(saat: string): number {
  const [ss, dd] = saat.split(":");
  return Number(ss) * 60 + Number(dd);
}

/** 570 -> "09:30". */
export function dakikayiSaate(dakika: number): string {
  const ss = String(Math.floor(dakika / 60)).padStart(2, "0");
  const dd = String(dakika % 60).padStart(2, "0");
  return `${ss}:${dd}`;
}

function gun(damga: string): string {
  return damga.slice(0, 10);
}

function saat(damga: string): string {
  return damga.slice(11, 16);
}
