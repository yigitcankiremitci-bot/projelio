import { MUSTERI_MODUL_KEY } from "./types";

/**
 * Sekmeli modüllerin sekmeleri ve açılış sekmesi (migration 169).
 *
 * Sıra ekrandaki sıradır. Kişi kendi açılış sekmesini hap sekmedeki ev
 * simgesiyle seçer; seçmediyse listedeki İLK sekme açılır. Müşteri modülünde
 * ilk sekme Tahsilat takibi (kullanıcı isteği, 2026-10-20) — önceden
 * Müşteriler'di, satış departmanında Potansiyel.
 *
 * Sunucu kaydederken, arayüz okurken buradan süzer: kaldırılmış bir sekme
 * kayıtlı kalırsa ilk sekmeye düşülür, boş ekran açılmaz.
 */
export const MODUL_SEKMELERI: Record<string, readonly string[]> = {
  [MUSTERI_MODUL_KEY]: ["tahsilat", "musteriler", "potansiyel"],
};

export function modulSekmeleri(modulKey: string): readonly string[] {
  return MODUL_SEKMELERI[modulKey] ?? [];
}

/** Kayıtlı tercih geçerliyse o, değilse modülün ilk sekmesi (modül sekmesizse undefined). */
export function acilisSekmesiCoz(modulKey: string, kayitli: unknown): string | undefined {
  const sekmeler = modulSekmeleri(modulKey);
  if (typeof kayitli === "string" && sekmeler.includes(kayitli)) return kayitli;
  return sekmeler[0];
}
