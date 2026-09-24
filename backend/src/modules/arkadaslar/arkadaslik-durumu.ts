import type { ArkadaslikDurumu } from "@projelio/shared";

/**
 * Arkadaşlık kararları — saf fonksiyonlar, veritabanına dokunmaz.
 *
 * Tek satır = tek çift (bkz. 134_arkadaslik.sql). Satırın yönü (isteyen/alan)
 * yalnızca bekleyen/reddedilen istekte anlamlı; kabul edilmiş arkadaşlıkta
 * kimin istediğinin önemi yok.
 */

export type SatirDurumu = "bekliyor" | "kabul" | "reddedildi";

export interface ArkadaslikSatiri {
  id: string;
  isteyen_id: string;
  alan_id: string;
  durum: SatirDurumu;
}

/**
 * Bakan kişinin gözünden ilişki.
 *
 * Reddedilmiş istek İSTEYENE hâlâ "giden_istek" görünür, reddedene "yok":
 * isteyene reddedildiğini söylemek onu yeniden göndermeye (ve karşı tarafa
 * bildirim yağdırmaya) iterdi.
 */
export function durumHesapla(satir: ArkadaslikSatiri | null, bakanId: string, digerId: string): ArkadaslikDurumu {
  if (bakanId === digerId) return "kendisi";
  if (!satir) return "yok";
  if (satir.durum === "kabul") return "arkadas";
  const benIstedim = satir.isteyen_id === bakanId;
  if (satir.durum === "reddedildi") return benIstedim ? "giden_istek" : "yok";
  return benIstedim ? "giden_istek" : "gelen_istek";
}

export type IstekKarari =
  // Hiç satır yok: yeni bekleyen istek açılır, karşı tarafa bildirim gider.
  | { islem: "ekle" }
  // Karşı taraf zaten bana istek göndermiş: göndermek = kabul etmek.
  | { islem: "kabul_et" }
  // Daha önce BEN reddetmiştim, şimdi ben istiyorum: satır yön değiştirip
  // yeniden bekleyen olur.
  | { islem: "yeniden_ac" }
  // Yapılacak bir şey yok (zaten arkadaş / zaten gönderilmiş / reddedilmiş).
  // Reddedilmiş istekte sessizce "gönderildi" denir, bildirim GİTMEZ.
  | { islem: "yok"; durum: ArkadaslikDurumu };

export function istekKarari(satir: ArkadaslikSatiri | null, gonderenId: string, aliciId: string): IstekKarari {
  if (!satir) return { islem: "ekle" };
  if (satir.durum === "kabul") return { islem: "yok", durum: "arkadas" };
  const benIstedim = satir.isteyen_id === gonderenId;
  if (satir.durum === "bekliyor") {
    return benIstedim ? { islem: "yok", durum: "giden_istek" } : { islem: "kabul_et" };
  }
  // reddedildi
  return benIstedim ? { islem: "yok", durum: "giden_istek" } : { islem: "yeniden_ac" };
}

/**
 * Duvar görünürlüğü: duvar sahibi ve ARKADAŞLARI görür, yazar, yorum yapar.
 * Arkadaşlıktan çıkılınca eski paylaşımlar yerinde kalır ama çıkan kişi artık
 * o duvarı göremez — görünürlük o anki ilişkiye bakar, paylaşım anına değil.
 */
export function duvarErisimi(bakanId: string, duvarSahibiId: string, arkadasMi: boolean): boolean {
  return bakanId === duvarSahibiId || arkadasMi;
}

/** Duvar paylaşımını yazan ya da duvarın sahibi silebilir. */
export function duvarPaylasiminiSilebilir(bakanId: string, yazarId: string, duvarSahibiId: string): boolean {
  return bakanId === yazarId || bakanId === duvarSahibiId;
}

export type AramaSorgusu = { tur: "eposta"; deger: string } | { tur: "metin"; deger: string };

/** Yazmaya başlar başlamaz arama: 2 karakter yeter (tek harf herkesi listelerdi). */
export const ARAMA_EN_AZ = 2;

/**
 * Arama kutusundaki metni sorguya çevirir.
 *
 * E-posta TAM eşleşmeyle aranır, önekle değil: "ali@" yazan birine
 * "ali@..." ile başlayan herkesin adresini tahmin ettirmek adres toplamaya
 * açık kapı olurdu. Diğer her şey ad-soyad ve kullanıcı adında aranır;
 * kullanıcı adının başındaki @ isteğe bağlı.
 *
 * Metin PostgREST'in `or=(...)` filtresine gömüldüğü için virgül, parantez,
 * yıldız gibi sözdizimi karakterleri atılır — yalnızca harf, rakam, boşluk
 * ve kullanıcı adında geçerli `_` `.` kalır, bir de adlarda geçen `-` `'`.
 */
export function aramaSorgusuCoz(ham: unknown): AramaSorgusu | null {
  if (typeof ham !== "string") return null;
  const q = ham.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q) && q.length <= 254) return { tur: "eposta", deger: q.toLowerCase() };
  // Metin KÜÇÜLTÜLMEDEN gider, büyük/küçük harfi ilike halleder: "Işık"ı
  // Türkçe kuralla küçültmek "ışık" verir, Postgres ise "I"yı "i" ile eşler —
  // küçültülmüş sorgu adın kendisini bulamazdı.
  const metin = q
    .replace(/^@+/, "")
    .replace(/[^\p{L}\p{N}\s_.'-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  if (metin.length < ARAMA_EN_AZ) return null;
  return { tur: "metin", deger: metin };
}

/**
 * Arama sonucu sırası: kullanıcı adı birebir > kullanıcı adı öneki > ad
 * öneki > adın içinde bir kelime öneki. Aynı kademede ada göre.
 */
export function aramaSirasi(sorguHam: string, kisi: { fullName: string; username?: string }): number {
  const sorgu = sorguHam.toLocaleLowerCase("tr");
  const ad = (kisi.username ?? "").toLocaleLowerCase("tr");
  const isim = kisi.fullName.toLocaleLowerCase("tr");
  if (ad === sorgu) return 0;
  if (ad.startsWith(sorgu)) return 1;
  if (isim.startsWith(sorgu)) return 2;
  return 3;
}

export interface OneriAdayi {
  userId: string;
  ortakArkadasSayisi: number;
  ortakAlanSayisi: number;
}

/**
 * Arkadaş önerisi: ortak arkadaş ve birlikte çalışılan alan (iş, proje,
 * departman, şirket) sayılarından sıralanır.
 *
 * `haric`: kendim + aramızda HERHANGİ bir arkadaşlık satırı olan herkes —
 * zaten arkadaş olanlar, bekleyen istekler (iki yön) ve reddedilenler.
 * Reddettiğim birini bana önermek de, beni reddedeni önermek de yanlış
 * olurdu; ikincisi reddedildiğimi dolaylı yoldan sızdırırdı.
 *
 * Ortak arkadaş daha ağır basar: birlikte çalışmak iş ilişkisidir, ortak
 * arkadaş ise bu sayfanın asıl konusu olan sosyal bağ.
 */
export function oneriSirala(
  ortakArkadas: Map<string, number>,
  ortakAlan: Map<string, number>,
  haric: Set<string>,
  tavan = 20
): OneriAdayi[] {
  const idler = new Set<string>([...ortakArkadas.keys(), ...ortakAlan.keys()]);
  const adaylar: OneriAdayi[] = [];
  for (const userId of idler) {
    if (haric.has(userId)) continue;
    adaylar.push({ userId, ortakArkadasSayisi: ortakArkadas.get(userId) ?? 0, ortakAlanSayisi: ortakAlan.get(userId) ?? 0 });
  }
  const puan = (a: OneriAdayi) => a.ortakArkadasSayisi * 3 + a.ortakAlanSayisi * 2;
  return adaylar.sort((a, b) => puan(b) - puan(a) || a.userId.localeCompare(b.userId)).slice(0, tavan);
}

/** LIKE kalıbında özel anlamı olan karakterleri kaçırır (kullanıcı adında "_" serbest). */
export function likeKacir(deger: string): string {
  return deger.replace(/[\\%_]/g, (k) => `\\${k}`);
}
