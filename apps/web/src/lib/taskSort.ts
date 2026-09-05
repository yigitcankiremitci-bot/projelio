/**
 * Görev listelerinin sıralama ölçütü. Görev kartının göründüğü her yerde aynı
 * seçenekler ve aynı davranış olsun diye tek yerde duruyor (bkz. TaskSortMenu).
 */
export type TaskSortMode = "manual" | "priority" | "due" | "created" | "title";

/**
 * "manual" kullanıcının sürükleyerek kurduğu düzen — listenin asıl sıralaması
 * budur, diğerleri geçici bir bakış açısı. Bu yüzden varsayılan odur ve başta durur.
 *
 * Etiketler modül düzeyinde, yani t() burada çağrılamaz (kanca yok). Türkçe
 * metin ANAHTAR olarak duruyor, çeviri kullanıldığı yerde yapılıyor —
 * bkz. TaskSortMenu içindeki `t(s.label)`.
 */
export const TASK_SORTS: { value: TaskSortMode; label: string }[] = [
  { value: "manual", label: "Kendi sıram" }, // dil:anahtar
  { value: "priority", label: "Önceliğe göre" }, // dil:anahtar
  { value: "due", label: "Tarihe göre" }, // dil:anahtar
  { value: "created", label: "Eklenme sırasına göre" }, // dil:anahtar
  { value: "title", label: "Ada göre" }, // dil:anahtar
];

/** Sıralama için gereken en küçük görev şekli. */
export interface TaskSortFields {
  priority?: number;
  /** Boş olabilir: kişisel yapılacakların tarihi olmayabilir. */
  deadline?: string;
  createdAt: string;
  title: string;
}

/** Tarihi olmayan kart daima sona; ikisi de boşsa sıra korunur. */
function compareDue(a: TaskSortFields, b: TaskSortFields): number {
  if (!a.deadline && !b.deadline) return 0;
  if (!a.deadline) return 1;
  if (!b.deadline) return -1;
  return a.deadline.localeCompare(b.deadline);
}

export function compareTasksBy(mode: TaskSortMode) {
  return (a: TaskSortFields, b: TaskSortFields): number => {
    switch (mode) {
      case "priority":
        // Çok yıldızlı önce, önceliksiz (0) sona. Eşit öncelikte en yakın tarihli
        // önce — tek başına öncelik çok kaba bir ayrım.
        return (b.priority ?? 0) - (a.priority ?? 0) || compareDue(a, b);
      case "due":
        return compareDue(a, b);
      case "created":
        return a.createdAt.localeCompare(b.createdAt);
      case "title":
        return a.title.localeCompare(b.title, "tr");
      default:
        return 0;
    }
  };
}

/**
 * Listeyi seçili ölçüte göre sıralar. "manual"da diziye hiç dokunulmaz: o sıra
 * zaten kullanıcının kendi düzeni (sunucudan sort_order ile gelir).
 */
export function sortTasks<T extends TaskSortFields>(list: T[], mode: TaskSortMode): T[] {
  if (mode === "manual") return list;
  return [...list].sort(compareTasksBy(mode));
}
