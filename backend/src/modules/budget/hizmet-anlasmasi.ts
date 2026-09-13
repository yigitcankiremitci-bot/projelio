import type { BudgetTransaction } from "@projelio/shared";

/**
 * Ortak projede hizmet alan (proje sahibi) ile hizmet veren (üye) arasındaki
 * para — saf kurallar.
 *
 * Sorun şuydu: sahibi Arda olan projede Arda'nın ödediği 10.000 ₺, Arda için
 * gider, parayı alan üye için gelirdir. Defterde tek satır iki kişiye aynı
 * anda doğru görünemiyordu; üye "gelir mi gider mi gireyim" diye kalıyordu ve
 * sahibi olmadığı projeye zaten hiç kayıt giremiyordu.
 *
 * Çözüm: kayıt YÖNLE tutulur ve satır tek kalır, bakış açısı iki olur
 * (`aynaKayit`). Satırı kopyalamak düzenlemede ikisinin ayrışması demekti.
 *
 * İki biçim var:
 *   `uye`   — proje sahibi hizmet alır, projedeki üye verir. Satır projenin
 *             defterinde `payout` (user_id = üye); üyenin Kasa'sına `income`
 *             olarak yansır.
 *   `proje` — iş sahibi hizmet alır, işin altındaki hizmet projesinin
 *             (projects.hizmet_projesi, migration 111) sahibi verir. Satır
 *             projenin defterinde `income`; proje işe TOPLANMAZ, bu satırlar
 *             işe ve iş sahibinin Kasa'sına `payout` olarak yansır.
 */

export interface HizmetYetkiGercekleri {
  // Proje sahibi ya da projenin bağlı olduğu işin sahibi.
  isManager: boolean;
  // İsteyen kişi anlaşmanın taraf olan üyesi mi (onaylı üyelik).
  isSelf: boolean;
}

/**
 * Anlaşmaya tutar ya da ödeme girme hakkı İKİ TARAFTA da var.
 *
 * Yalnızca sahibe açık olsaydı hizmet veren, müşterisi sisteme girmediği
 * sürece aldığı parayı hiçbir yere yazamazdı — asıl şikâyet buydu. Üçüncü bir
 * üye (aynı projedeki başka bir hizmet veren) başkasının anlaşmasını göremez
 * ve değiştiremez: ücretler kişiler arası bilgidir.
 */
export function hizmetYetkisi(g: HizmetYetkiGercekleri): { canView: boolean; canEdit: boolean } {
  const izin = g.isManager || g.isSelf;
  return { canView: izin, canEdit: izin };
}

export interface HizmetOzeti {
  agreedFee: number;
  paid: number;
  remaining: number;
  overpaid: number;
}

/**
 * Anlaşma ve ödemelerden kalan/fazla hesabı.
 *
 * Ödenen, anlaşmanın ÜSTÜNE EKLENMEZ, içinden düşer (proje tahsilatıyla aynı
 * kural, bkz. BudgetService.calculateExpectedPayment). Yalnızca ₺ ödemeler
 * sayılır: anlaşma tutarı ₺ ve kur dönüşümü yapılmıyor. Satırların türüne
 * bakılmaz — hangi satırın ödeme olduğunu biçime göre çağıran seçer
 * (`uye`de payout, `proje`de income).
 */
export function hizmetOzeti(agreedFee: number | null | undefined, odemeler: BudgetTransaction[]): HizmetOzeti {
  const anlasilan = Number(agreedFee ?? 0) || 0;
  const paid = odemeler
    .filter((o) => (o.currency || "TRY") === "TRY")
    .reduce((t, o) => t + (Number(o.amount) || 0), 0);
  return {
    agreedFee: anlasilan,
    paid,
    remaining: Math.max(0, anlasilan - paid),
    overpaid: anlasilan > 0 ? Math.max(0, paid - anlasilan) : 0,
  };
}

/**
 * Karşı tarafın defterindeki satırın bu taraftaki görünümü: `uye`de sahibin
 * payout'u üyede `income`, `proje`de hizmet verenin income'u iş sahibinde
 * `payout` olur.
 *
 * Satır salt okunur olur: Kasa'daki ve kademe sayfasındaki düzenleme
 * düğmeleri o defterin kuralıyla çalışıyor ve bu satırın sahibi başkası.
 * Yönetimi proje bütçesindeki "Hizmet anlaşmaları"ndan.
 */
export function aynaKayit(
  tx: BudgetTransaction,
  karsiTarafAdi?: string,
  tur: "income" | "payout" = "income"
): BudgetTransaction {
  return {
    ...tx,
    type: tur,
    readOnly: true,
    mirror: true,
    counterpartyName: karsiTarafAdi ?? tx.counterpartyName,
  };
}

/**
 * Üye, sahibin defterine KENDİ girdiği hizmet ödemesini düzeltebilir/silebilir.
 *
 * Yalnızca kendi girdiğini ve yalnızca kendisine yapılan ödemeyi: sahibin
 * girdiği satır sahibinindir, başka bir üyeye yapılan ödeme de onun.
 * Otomatik satırlar (görev bütçesi, düzenli ödeme) hiç düzenlenmez.
 */
export function uyeKendiOdemesiniYonetebilir(
  row: { type?: string; user_id?: string | null; created_by?: string | null; source?: string | null },
  userId: string | undefined
): boolean {
  if (!userId) return false;
  return (
    row.type === "payout" &&
    row.user_id === userId &&
    row.created_by === userId &&
    (row.source ?? "manual") === "manual"
  );
}

/**
 * `proje` biçiminde iş sahibi (hizmet alan), hizmet verenin defterine KENDİ
 * girdiği ödemeyi düzeltebilir/silebilir. Kişinin gerçekten o hizmet
 * projesinin iş sahibi olduğunu çağıran doğrular; burası satırın kendisine
 * bakar.
 */
export function musteriKendiOdemesiniYonetebilir(
  row: { type?: string; created_by?: string | null; owner_id?: string | null; source?: string | null },
  userId: string | undefined
): boolean {
  if (!userId) return false;
  return (
    row.type === "income" &&
    row.created_by === userId &&
    row.owner_id !== userId &&
    (row.source ?? "manual") === "manual"
  );
}
