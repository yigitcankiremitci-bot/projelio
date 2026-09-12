// Şirketin ALACAK/BORÇ modülünden (fm_alacak_borc) kişisel Kasa'nın vade
// listesine yansıyan kayıtlar.
//
// Bu dosya eskiden şirketin GELİR-GİDER defterini de çeviriyordu; o modül
// kaldırıldı ve kayıtları budget_transactions'a taşındı (migration 104), yani
// gerçekleşen para artık tek tabloda. Burada kalan tek şey henüz gerçekleşmemiş
// para: alacak/borç.

import type { KasaAlacakBorc } from "@projelio/shared";

/**
 * Şirketin alacak/borç takibi. Gelir/gider defterinden ayrı bir modül: orada
 * GERÇEKLEŞMİŞ para, burada henüz tahsil edilmemiş/ödenmemiş tutarlar duruyor
 * (bkz. moduleConfigs > receivablesPayablesConfig).
 */
export const ORG_RECEIVABLE_MODULE_KEY = "fm_alacak_borc";

const VARSAYILAN_PARA_BIRIMI = "TRY";

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
    currency: (d.currency as string) || VARSAYILAN_PARA_BIRIMI,
    dueDate: typeof d.dueDate === "string" && d.dueDate ? d.dueDate.slice(0, 10) : undefined,
    category: (d.category as string) || undefined,
    description: (d.description as string) || undefined,
  };
}
