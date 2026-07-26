import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Sürükle-bırak ile elde edilen nihai sıraya göre verilen id listesindeki
 * her kaydın sort_order'ını (0'dan başlayarak) yeniden yazar.
 */
export async function applyOrder(client: SupabaseClient, table: "jobs" | "projects" | "tasks" | "outputs", orderedIds: string[]): Promise<void> {
  await Promise.all(orderedIds.map((id, index) => client.from(table).update({ sort_order: index }).eq("id", id)));
}
