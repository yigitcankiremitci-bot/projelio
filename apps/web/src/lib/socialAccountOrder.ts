// "Hesapları aç" listesindeki sıra. Kullanıcı hesapları sürükleyerek kendi
// çalışma sırasına diziyor: gün içinde önce Instagram'a, sonra Facebook'a
// bakan biri için sıra bir tercih, bir veri değil.
//
// Cihazda (localStorage) tutuluyor — yazı boyutu ve "Ana Sayfa" hedefiyle aynı
// mantık (bkz. homeTarget.ts): kişisel bir tercih, ekibin ortak verisi değil.
// Backend alanı olsaydı bir kullanıcının sıralaması herkesin listesini
// değiştirirdi, üstelik migration gerekirdi.
//
// Sıra KAPSAM BAŞINA saklanıyor: aynı kullanıcı bir işte 2, bir şirkette 6
// hesap görüyor, tek liste ikisini de bozardı.

const PREFIX = "projelio_sosyal_hesap_sirasi_";

function key(scopeKey: string): string {
  return `${PREFIX}${scopeKey}`;
}

export function getAccountOrder(scopeKey: string): string[] {
  try {
    const raw = localStorage.getItem(key(scopeKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    // Bozuk değer: sıralama yok sayılır, liste sunucudan geldiği gibi görünür.
    return [];
  }
}

export function setAccountOrder(scopeKey: string, ids: string[]) {
  try {
    localStorage.setItem(key(scopeKey), JSON.stringify(ids));
  } catch {
    // Depolama kapalı (gizli sekme, kota): sıra bu oturumda çalışır, kalıcı
    // olmaz. Kullanıcıya hata göstermeye değmez.
  }
}

/**
 * Kayıtlı sıraya göre dizer.
 *
 * Sırada olmayan hesap (yeni eklenmiş) SONA gider, kendi aralarındaki düzeni
 * koruyarak — yeni bir hesap listenin ortasında beliremesin. Sırada olup artık
 * var olmayan kimlikler sessizce atlanır: arşivlenen hesap listeyi bozmamalı.
 */
export function sortByOrder<T extends { id: string }>(items: T[], order: string[]): T[] {
  if (order.length === 0) return items;
  const yeri = new Map(order.map((id, i) => [id, i]));
  return items
    .map((item, i) => ({ item, i, sira: yeri.get(item.id) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.sira - b.sira || a.i - b.i)
    .map((x) => x.item);
}

/** Sürükle-bırak sonucu: `from` indeksindeki öğeyi `to` indeksine taşır. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = [...items];
  const [tasinan] = next.splice(from, 1);
  next.splice(to, 0, tasinan);
  return next;
}
