import { parcalara } from "./parcali-liste";

/**
 * Bir kullanıcının verilen görevlerdeki ATAMALARINI kaldırır. Görevler
 * silinmez — yalnızca "bu iş bende" bağı kopar.
 *
 * NEDEN AYRI BİR DOSYA: bir ekipten ayrılmanın (işten, şirketten) tek başına
 * yeterli olmadığı ortaya çıktı. Üyelik kaydı silindikten sonra bile atanmış
 * görevler Yapılacaklar panosunda durmaya devam ediyordu: pano
 * `v_personal_board` görünümünden besleniyor ve o görünümün "assigned" yarısı
 * yalnızca `task_assignees`e bakıyor, kullanıcının işi görme yetkisine değil.
 * Sonuç, artık açamadığı bir işin görevlerini panosunda taşıyan kullanıcıydı.
 *
 * ATAMA İKİ YERDE DURUYOR (bkz. migration 053 ve TasksService.syncAssignees):
 * `task_assignees` çoklu atananlar, `tasks.assigned_to` ise BİRİNCİL atanan.
 * İkisi ayrı yollardan güncellenirse ayrışırlar; o yüzden burada da birlikte
 * ele alınıyor. Birincil atanan ayrılıyorsa yerine kalan atananlardan ilki
 * geçer, kimse kalmadıysa alan boşaltılır.
 *
 * @returns bırakılan atama sayısı
 */
export async function atamalariBirak(client: any, taskIds: string[], userId: string): Promise<number> {
  if (taskIds.length === 0) return 0;

  // 1. Bu kullanıcının hangi görevlerde atanan olduğu.
  const benimGorevlerim: string[] = [];
  for (const parca of parcalara(taskIds)) {
    const { data } = await client.from("task_assignees").select("task_id").eq("user_id", userId).in("task_id", parca);
    for (const row of data ?? []) benimGorevlerim.push(row.task_id);
  }
  if (benimGorevlerim.length === 0) return 0;

  // 2. Atama satırları kalkar.
  for (const parca of parcalara(benimGorevlerim)) {
    const { error } = await client.from("task_assignees").delete().eq("user_id", userId).in("task_id", parca);
    if (error) throw error;
  }

  // 3. `assigned_to` bu kullanıcıyı gösteren görevlerde birincil atanan
  //    yenilenir. Kalanlar atanma sırasına göre okunur: yerine geçecek kişi,
  //    göreve ondan sonra eklenen ilk kişidir.
  const devralan = new Map<string, string | null>();
  for (const parca of parcalara(benimGorevlerim)) {
    const { data: sahipsiz } = await client
      .from("tasks")
      .select("id")
      .eq("assigned_to", userId)
      .in("id", parca);
    for (const row of sahipsiz ?? []) devralan.set(row.id, null);
  }
  if (devralan.size > 0) {
    const idler = Array.from(devralan.keys());
    for (const parca of parcalara(idler)) {
      const { data: kalanlar } = await client
        .from("task_assignees")
        .select("task_id, user_id")
        .in("task_id", parca)
        .order("assigned_at", { ascending: true });
      for (const row of kalanlar ?? []) {
        if (devralan.get(row.task_id) == null) devralan.set(row.task_id, row.user_id);
      }
    }

    // Aynı yeni değeri alan görevler tek istekte güncellenir: görev başına bir
    // UPDATE atmak, kalabalık bir işten ayrılmayı onlarca isteğe çıkarırdı.
    const gruplar = new Map<string | null, string[]>();
    for (const [taskId, yeni] of devralan) {
      const liste = gruplar.get(yeni) ?? [];
      liste.push(taskId);
      gruplar.set(yeni, liste);
    }
    for (const [yeni, liste] of gruplar) {
      for (const parca of parcalara(liste)) {
        const { error } = await client.from("tasks").update({ assigned_to: yeni }).in("id", parca);
        if (error) throw error;
      }
    }
  }

  return benimGorevlerim.length;
}
