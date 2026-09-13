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
 * Çözüm: kayıt YÖNLE tutulur. Satır projenin defterinde `payout` (defter
 * sahibi = proje sahibi, user_id = parayı alan üye). Sahibin tarafında gider
 * olarak toplanır; üyenin Kasa'sına aynı satır `income` olarak YANSIR
 * (`aynaKayit`). İkinci bir satır yazılmaz: iki kişi ayrı defterler olduğu
 * için çift sayım yok, ama satırı kopyalamak düzenlemede ikisinin ayrışması
 * demek olurdu.
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
 * sayılır: anlaşma tutarı ₺ ve kur dönüşümü yapılmıyor.
 */
export function hizmetOzeti(agreedFee: number | null | undefined, odemeler: BudgetTransaction[]): HizmetOzeti {
  const anlasilan = Number(agreedFee ?? 0) || 0;
  const paid = odemeler
    .filter((o) => o.type === "payout" && (o.currency || "TRY") === "TRY")
    .reduce((t, o) => t + (Number(o.amount) || 0), 0);
  return {
    agreedFee: anlasilan,
    paid,
    remaining: Math.max(0, anlasilan - paid),
    overpaid: anlasilan > 0 ? Math.max(0, paid - anlasilan) : 0,
  };
}

/**
 * Sahibin defterindeki `payout` satırının parayı alan üyedeki görünümü.
 *
 * Tür `income`a döner ve satır salt okunur olur: Kasa'daki silme/düzenleme
 * düğmeleri kişisel defter kuralıyla (owner_id = ben) çalışıyor ve bu satırın
 * sahibi başkası. Yönetimi proje bütçesindeki "Hizmet anlaşmaları"ndan.
 */
export function aynaKayit(tx: BudgetTransaction, karsiTarafAdi?: string): BudgetTransaction {
  return {
    ...tx,
    type: "income",
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
