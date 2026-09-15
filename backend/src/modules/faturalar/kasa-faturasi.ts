/**
 * Kasa satırından fatura kaydına dönüşüm ve ZIP içindeki klasör adı.
 *
 * Saf fonksiyonlar, ayrı dosya: ikisi de "ne yazılacağına" karar veriyor ve
 * kararı sınamak için ne veritabanı ne bulut gerekiyor.
 */

/** Fatura kaydının veri alanları (module_records.data, fm_fatura). */
export interface FaturaVerisi {
  direction: "issued" | "received";
  amount: number;
  currency: string;
  issueDate: string;
  status: "paid";
  counterpartyName?: string;
  notes?: string;
}

/** Kasa satırının fatura kaydına dönüşen alanları. */
export interface KasaSatiri {
  type?: string;
  amount?: unknown;
  currency?: string | null;
  occurred_at?: string | null;
  description?: string | null;
  counterparty_id?: string | null;
}

export function faturaVerisi(satir: KasaSatiri): FaturaVerisi {
  const data: FaturaVerisi = {
    // Para GİRDİYSE fatura bizim kestiğimizdir, çıktıysa bize kesilmiştir.
    // "payout" da bir çıkıştır: hakediş ödemesinin faturasını karşı taraf keser.
    direction: satir.type === "income" ? "issued" : "received",
    amount: Number(satir.amount),
    // Eski kayıtlarda sütun yoktu; defter o güne kadar tek para birimliydi.
    currency: satir.currency || "TRY",
    issueDate: String(satir.occurred_at ?? "").slice(0, 10),
    // Kasa satırı GERÇEKLEŞMİŞ bir para hareketidir; faturası tanımı gereği
    // ödenmiştir. "Bekliyor" yazmak, ödenmemiş fatura listesini hiç ödenmesi
    // gerekmeyen kayıtlarla kirletirdi.
    status: "paid",
  };
  // entity_ref alanı hem referansı hem eski serbest metni kabul ediyor
  // (bkz. moduleConfigs/shared.ts > legacyText).
  if (satir.counterparty_id) data.counterpartyName = satir.counterparty_id;
  if (satir.description) data.notes = satir.description;
  return data;
}

/**
 * ZIP içindeki klasör adı.
 *
 * Muhasebeci belgeyi klasör adından tanıyor: tarih + fatura no + karşı taraf.
 * Numara yoksa kaydın kimliğinin ilk parçası kullanılıyor — iki farklı faturanın
 * klasörü aynı ada düşerse belgeler tek klasörde karışırdı.
 */
export function kayitKlasorAdi(kayit: {
  id: string;
  data: Record<string, unknown>;
}, varsayilanTarih: string): string {
  const no = kayit.data.invoiceNo ? `#${kayit.data.invoiceNo}` : kayit.id.slice(0, 8);
  const taraf = typeof kayit.data.counterpartyName === "string" ? kayit.data.counterpartyName : "";
  const tarih = /^\d{4}-\d{2}-\d{2}/.test(String(kayit.data.issueDate ?? ""))
    ? String(kayit.data.issueDate).slice(0, 10)
    : varsayilanTarih;
  // Yol ayırıcıları arşivde alt klasör açardı; ad tek parça kalmalı.
  return `${tarih} ${no}${taraf ? ` ${taraf}` : ""}`.replace(/[\\/]+/g, "-").trim();
}
