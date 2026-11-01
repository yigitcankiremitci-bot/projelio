import type { SupabaseService } from "../../database/supabase.service";

/**
 * Verilen projelerden HİZMET İŞİ (jobs.hizmet_isi, migration 176) altındakiler.
 *
 * O projelerde görev bütçesi bir fiyat kalemidir: müşterinin ödediği ücretin
 * dökümü. Onay kuyruğuna düşmez ve ödenmez — ödenseydi kendi kazancın
 * Kasa'na gider olarak yazılırdı (2026-11-01'de Samar projelerinde yaşandı).
 *
 * Hata olursa (ör. migration uygulanmadan kolon yok) boş küme: bütçe ekranları
 * durmasın, eski davranış sürsün.
 */
export async function hizmetIsiProjeleri(supabase: SupabaseService, projectIds: string[]): Promise<Set<string>> {
  const tekil = Array.from(new Set(projectIds.filter(Boolean)));
  if (tekil.length === 0) return new Set();
  const { data, error } = await supabase.client
    .from("projects")
    .select("id, jobs!inner(hizmet_isi)")
    .in("id", tekil)
    .eq("jobs.hizmet_isi", true);
  if (error || !data) return new Set();
  return new Set(data.map((p: any) => p.id as string));
}

export const HIZMET_ISI_ODEME_HATASI =
  "Bu iş bir hizmet işi: görev bütçeleri yaptığın işin fiyat kalemleri, ödenmez ve Kasa'ya gider yazılmaz. Müşterinin ödemesini proje bütçesine gelir olarak gir.";
