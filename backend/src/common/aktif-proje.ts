import type { SupabaseClient } from "@supabase/supabase-js";
import { parcalara } from "./parcali-liste";

/**
 * Proje dışında yalnızca AKTİF projelerin görevleri dolaşır.
 *
 * Kullanıcının kararı (2026-11-10): proje "Beklemede", "Pasif" ya da
 * "Tamamlandı" yapılınca görevleri Yapılacaklar'da, bildirim e-postalarında,
 * hatırlatmalarda, takvim seçicisinde ve Lio'nun özetlerinde görünmemeli —
 * durdurulan projenin "gecikmiş" görevleri moral bozuyordu. Görevler
 * değişmez; proje yeniden aktif olunca hepsi geri gelir. Projenin kendi
 * sayfası (findByProject) bilerek bu kuralın DIŞINDA: görevlere oradan
 * bakılabilmeli.
 *
 * Yapılacaklar panosunun karşılığı veritabanında (v_personal_board,
 * migration 190); bu yardımcı görünümden geçmeyen sorgular için.
 */

/** Bu kimlikler arasından durumu `active` OLMAYAN projeler. */
export async function aktifOlmayanProjeler(
  client: SupabaseClient,
  projeIdleri: Iterable<string | null | undefined>
): Promise<Set<string>> {
  const idler = [...new Set([...projeIdleri].filter((id): id is string => !!id))];
  const sonuc = new Set<string>();
  // Parçalı: `.in()` adres satırına yazılıyor, uzun liste URL sınırında düşer.
  for (const parca of parcalara(idler)) {
    const { data, error } = await client.from("projects").select("id").in("id", parca).neq("status", "active");
    if (error) throw error;
    for (const row of data ?? []) sonuc.add((row as { id: string }).id);
  }
  return sonuc;
}

/**
 * Satırlardan aktif olmayan projelere ait olanları ayıklar. Projesi olmayan
 * satırlar (rutin, departman görevi) olduğu gibi kalır.
 */
export async function yalnizAktifProjeGorevleri<T extends { project_id?: string | null }>(
  client: SupabaseClient,
  satirlar: T[]
): Promise<T[]> {
  const pasif = await aktifOlmayanProjeler(
    client,
    satirlar.map((s) => s.project_id)
  );
  if (pasif.size === 0) return satirlar;
  return satirlar.filter((s) => !s.project_id || !pasif.has(s.project_id));
}
