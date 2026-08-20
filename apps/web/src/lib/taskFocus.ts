/**
 * "Geri dönünce hangi karta dönülecek?" — İŞLER sekmesine özgü küçük sorun.
 *
 * Aynı görev bu sekmede İKİ yerde birden görünebiliyor: üstteki "Bugün
 * yapılacaklar" listesinde ve alttaki panoda. Geri bağlantısı yalnızca görevin
 * kimliğini taşıdığında dönüşte hangi kopyanın parlayacağına bir kural karar
 * veriyordu ve kural her zaman üstteki listeyi seçiyordu — kullanıcı panodaki
 * karta tıklamışsa yanlış yere dönmüş oluyordu.
 *
 * Çözüm: kimliğin yanında NEREDEN çıkıldığı da taşınıyor. Dönüşte tam olarak o
 * kopya parlıyor ve oraya kaydırılıyor.
 */
export type FocusWhere = "today" | "board";

export interface TaskFocus {
  id: string;
  where: FocusWhere;
}

const WHERE_VALUES: FocusWhere[] = ["today", "board"];

function isFocusWhere(value: unknown): value is FocusWhere {
  return typeof value === "string" && (WHERE_VALUES as string[]).includes(value);
}

/** Geri bağlantısının adresine eklenecek sorgu parçası. */
export function focusParams(id: string, where: FocusWhere): string {
  return `focus=${encodeURIComponent(id)}&focusIn=${where}`;
}

/**
 * Adresten okunan değerleri hedefe çevirir.
 *
 * `where` eksik ya da bozuksa (elle düzenlenmiş adres, bu alan eklenmeden önce
 * paylaşılmış bir bağlantı) görevin bugün listesinde olup olmadığına bakılır —
 * eski davranış, ama artık yalnızca yedek yol.
 */
export function resolveTaskFocus(id: string | null, where: string | null, isInToday: boolean): TaskFocus | null {
  if (!id) return null;
  if (isFocusWhere(where)) return { id, where };
  return { id, where: isInToday ? "today" : "board" };
}
