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

export type AramaSorgusu = { tur: "eposta"; deger: string } | { tur: "kullanici_adi"; deger: string };

/**
 * Kişi arama yalnızca e-posta (tam eşleşme) ya da kullanıcı adıyla (önek) yapılır.
 *
 * Ad-soyad araması BİLİNÇLİ olarak yok: hiçbir ortak işi olmayan birini
 * aramaya izin veren bir uç, adla aranabilseydi tüm üye listesini dışarı
 * açan bir rehbere dönüşürdü (KVKK). E-postasını ya da kullanıcı adını bilen
 * kişi o kişiyi zaten tanıyordur.
 */
export function aramaSorgusuCoz(ham: unknown): AramaSorgusu | null {
  if (typeof ham !== "string") return null;
  const q = ham.trim().toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q) && q.length <= 254) return { tur: "eposta", deger: q };
  const ad = q.startsWith("@") ? q.slice(1) : q;
  if (/^[a-z0-9_.]{3,30}$/.test(ad)) return { tur: "kullanici_adi", deger: ad };
  return null;
}

/** LIKE kalıbında özel anlamı olan karakterleri kaçırır (kullanıcı adında "_" serbest). */
export function likeKacir(deger: string): string {
  return deger.replace(/[\\%_]/g, (k) => `\\${k}`);
}
