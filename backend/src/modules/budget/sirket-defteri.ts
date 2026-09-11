import type { BudgetTransaction, KasaAlacakBorc } from "@projelio/shared";

/**
 * Şirket "Kasa" sekmesindeki gelir/gider defteri, budget_transactions'ta değil
 * generic module_records sisteminde tutuluyor (bkz. OrgBudgetPanel /
 * moduleConfigs > financeEntryConfig). Kişisel Kasa'ya yansıtabilmek için
 * modülün anahtarı burada tanımlı.
 */
export const ORG_LEDGER_MODULE_KEY = "fm_gelir_gider";

/**
 * Şirketin alacak/borç takibi. Gelir/gider defterinden ayrı bir modül: orada
 * GERÇEKLEŞMİŞ para, burada henüz tahsil edilmemiş/ödenmemiş tutarlar duruyor
 * (bkz. moduleConfigs > receivablesPayablesConfig).
 */
export const ORG_RECEIVABLE_MODULE_KEY = "fm_alacak_borc";

/**
 * Kişisel Kasa TEK PARA BİRİMLİDİR: budget_transactions'ta currency sütunu yok,
 * arayüz tutarların hepsini ₺ ile yazıyor. Şirket defterinde ise para birimi
 * kayıt başına seçiliyor. Farklı para birimindeki bir kaydı toplama katmak
 * "1.000 USD + 1.000 TRY = 2.000 ₺" demek olurdu; bu yüzden TRY dışındakiler
 * Kasa'ya yansıtılmaz (şirketin kendi Kasa sekmesinde para birimi başına ayrı
 * toplanmaya devam ediyor).
 */
export const KASA_PARA_BIRIMI = "TRY";

/**
 * Bir module_records satırını kişisel Kasa'nın anlayacağı harekete çevirir.
 * Yansıtılmayacak kayıtlarda null döner: farklı para birimi ya da okunamayan
 * tutar. Ayrı dosyada duruyor ki bu sessiz eleme testlenebilsin — Kasa'da
 * görünmeyen kaydın sebebi bir daha tahmin işi olmasın.
 */
export function sirketDefterHareketi(
  row: { id: string; organization_id: string; data: Record<string, unknown> | null; created_at: string },
  sirketAdi?: string
): BudgetTransaction | null {
  const d = row.data ?? {};
  if (((d.currency as string) || KASA_PARA_BIRIMI) !== KASA_PARA_BIRIMI) return null;
  const amount = Number(d.amount);
  if (!Number.isFinite(amount) || amount === 0) return null;
  const tarih = typeof d.entryDate === "string" && d.entryDate ? d.entryDate : row.created_at;
  return {
    id: row.id,
    organizationId: row.organization_id,
    organizationName: sirketAdi,
    readOnly: true,
    // Şirket defterinde yalnızca income/expense var; "payout" oraya girmiyor.
    type: d.type === "expense" ? "expense" : "income",
    amount,
    description: (d.description as string) || (d.category as string) || undefined,
    occurredAt: String(tarih).slice(0, 10),
    createdAt: row.created_at,
  };
}

/**
 * Şirketin alacak/borç kaydını kişisel Kasa'nın vade listesine çevirir.
 *
 * Kapanmış (tahsil edilmiş/ödenmiş) kayıtlar null döner: Kasa'da bu bölümün
 * sorusu "neyi kaçırıyorum" — kapanan kaydın orada işi yok, gerçekleşen para
 * zaten defterde.
 *
 * Gelir/gider defterinin aksine TRY dışı kayıtlar ELENMEZ: burada bir toplam
 * hesaplanmıyor, satırlar kendi para birimiyle yazılıyor. Para birimi yüzünden
 * bir vade uyarısını yutmak, yanlış toplam göstermekten daha kötü.
 */
export function sirketAlacakBorcu(
  row: { id: string; organization_id: string; data: Record<string, unknown> | null },
  sirketAdi?: string,
  karsiTarafAdi?: string
): KasaAlacakBorc | null {
  const d = row.data ?? {};
  if (d.status === "settled") return null;
  const amount = Number(d.amount);
  if (!Number.isFinite(amount) || amount === 0) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    organizationName: sirketAdi,
    type: d.type === "payable" ? "payable" : "receivable",
    counterparty: karsiTarafAdi || (typeof d.counterparty === "string" ? d.counterparty : undefined),
    amount,
    currency: (d.currency as string) || KASA_PARA_BIRIMI,
    dueDate: typeof d.dueDate === "string" && d.dueDate ? d.dueDate.slice(0, 10) : undefined,
    category: (d.category as string) || undefined,
    description: (d.description as string) || undefined,
  };
}
