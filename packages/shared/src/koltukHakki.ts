/**
 * Şirketin kişi (koltuk) hakkı (kullanıcı kararı, 2026-11-02).
 *
 * Business kişi sayısıyla satılmaya başladı; sınır yalnızca ona konsaydı en
 * çok ödeyen müşteri kısıtlanır, ucuz paketteki şirket sınırsız kalırdı. Bu
 * yüzden Business dışındaki her paket şirkette Business'ın tabanına dahil olan
 * kadar kişi taşır; daha kalabalık ekip Business ister.
 *
 * Kurallar (modül hakkıyla aynı ruh, bkz. modulHakki.ts):
 * - Sahip de bir koltuktur. Taşeron sayılmaz: şirketin içinden biri değil,
 *   bir işe dışarıdan alınmış taraftır (bkz. backend common/access/subcontractor.ts).
 * - Hak dolduğunda MEVCUT üyeler çıkarılmaz — kural öncesi kalabalık olan ya
 *   da paketi düşen şirketin ekibi dağılmasın. Yalnızca YENİ kişi eklenemez.
 * - Şirketin paketi: şirket adına alınmış abonelik ya da sahibin kendi
 *   aboneliği; hangisi daha çok kişi taşıyorsa o.
 *
 * Sunucu (KoltukService, üye ekleyen her yol) ve arayüz aynı fonksiyondan geçer.
 */

/** Business dışındaki paketlerde şirketteki en çok kişi (Business tabanına dahil olanla aynı). */
export const KOLTUKSUZ_SIRKET_SINIRI = 3;

/**
 * Koltuk sayısı yazılmamış (2026-11 öncesi alınmış) Business: vitrinde
 * "10 kullanıcıya kadar" diye satılmıştı, söz verilen sayı korunuyor.
 */
export const ESKI_BUSINESS_SINIRI = 10;

/** Bir aboneliğin şirkete taşıdığı kişi sayısı. */
export function abonelikKoltukSiniri(planKey: string, koltuk: number | null | undefined): number {
  if (planKey !== "business") return KOLTUKSUZ_SIRKET_SINIRI;
  return koltuk ?? ESKI_BUSINESS_SINIRI;
}

/** Geçerli aboneliklerden şirketin kişi sınırı; abonelik yoksa ücretsiz paketin sınırı. */
export function sirketKoltukSiniri(abonelikler: Array<{ planKey: string; koltuk: number | null | undefined }>): number {
  return abonelikler.reduce((enCok, a) => Math.max(enCok, abonelikKoltukSiniri(a.planKey, a.koltuk)), KOLTUKSUZ_SIRKET_SINIRI);
}

export interface KoltukDurumu {
  sinir: number;
  /** Koltuk sayılan kişi sayısı (sahip dahil, taşeron hariç). */
  kullanilan: number;
  /** Hak aşılmışsa 0. */
  kalan: number;
}

export function koltukDurumu(sinir: number, kullanilan: number): KoltukDurumu {
  return { sinir, kullanilan, kalan: Math.max(0, sinir - kullanilan) };
}

/**
 * Ret sebebi metin + parametre olarak döner, hazır cümle değil: sunucu bunu
 * kullanıcının diline çeviriyor (backend common/i18n hataMetni) ve sayı
 * gömülü bir cümle sözlükte anahtar olamazdı.
 */
export type KoltukKarari = { eklenebilir: true } | { eklenebilir: false; metin: string; params: { sinir: number } };

/**
 * Kişi şirkete eklenebilir mi. Zaten koltuk sayılan kişi (başka departmana
 * geçen, yeniden onaylanan) ve taşeron yer harcamaz.
 */
export function koltukEklenebilirMi(durum: KoltukDurumu, kisi: { zatenSayiliyor: boolean; taseron: boolean }): KoltukKarari {
  if (kisi.zatenSayiliyor || kisi.taseron || durum.kalan > 0) return { eklenebilir: true };
  return {
    eklenebilir: false,
    metin:
      durum.sinir > KOLTUKSUZ_SIRKET_SINIRI
        ? "Şirketin paketindeki {sinir} kişilik yer dolu. Paketim ekranından kişi sayısını artırabilirsin." // dil:anahtar
        : "Bu pakette şirkete en çok {sinir} kişi eklenebilir. Daha kalabalık bir ekip için Business'a geç.", // dil:anahtar
    params: { sinir: durum.sinir },
  };
}
