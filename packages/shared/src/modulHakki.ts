/**
 * Paket başına modül hakkı (kullanıcı kararı, 2026-11-01).
 *
 * Kurulumda kullanıcı bütün modülleri açma eğilimindeydi; modül açmak bedava
 * olduğu için kimse "buna gerçekten ihtiyacım var mı" diye sormuyordu. Artık
 * şirketin aynı anda açık tutabileceği modül sayısı paketine bağlı. Hakkı
 * dolan şirket yeni modül için ya bir modülü kapatır ya paketini yükseltir.
 * Lio Bakiyesi'nden düşmek bilerek seçilmedi: Lio'yu kullanan kişi bakiyesinin
 * neden eridiğini anlayamazdı, bakiye kişiye modül şirkete ait.
 *
 * Kurallar:
 * - Çekirdek modüller (proje, program, görev, çıktı, dosya) sayılmaz: verisi
 *   uygulamanın kendi sekmelerinde, "modül" olarak bir bedeli yok.
 * - Hak dolduğunda AÇIK modüller kapanmaz — paketi düşen ya da kural öncesi
 *   fazla açmış şirketin verisi kilitlenmesin. Yalnızca YENİ modül açılamaz.
 * - Şirketin paketi: şirket adına alınmış abonelik, yoksa sahibin kendi
 *   aboneliği; ikisi de varsa hangisi daha çok hak veriyorsa o.
 *
 * Sunucu (OrganizationModulesService) ve arayüz ("Modül ekle", kurulum
 * sihirbazı) aynı fonksiyondan geçer.
 */

/** Paket anahtarı → aynı anda açık tutulabilecek modül sayısı. null = sınırsız. */
export const MODUL_HAKKI: Record<string, number | null> = {
  free: 2,
  starter: 4,
  pro: 8,
  business: null,
};

/** Sayılmayan modüller (bkz. apps/web lib/cekirdekModuller.ts). */
export const SAYILMAYAN_MODULLER = new Set([
  "yonetim_proje_yonetimi",
  "yonetim_program_yonetimi",
  "yonetim_gorev_yonetimi",
  "yonetim_cikti_yonetimi",
  "yonetim_dosya_yonetimi",
]);

export function modulSayilirMi(moduleKey: string): boolean {
  return !SAYILMAYAN_MODULLER.has(moduleKey);
}

export interface ModulHakkiDurumu {
  planKey: string;
  /** null = sınırsız. */
  hak: number | null;
  /** Hakka sayılan açık modül sayısı. */
  kullanilan: number;
  /** null = sınırsız; hak aşılmışsa 0. */
  kalan: number | null;
}

/**
 * `ayricalik`: şirket sahibine yöneticinin verdiği ek hak (bkz. ayricalik.ts) —
 * paketin üstüne eklenir; sınırsız bayrağı paketi de sınırsız yapar.
 */
export function modulHakkiDurumu(
  planKey: string,
  acikModuller: string[],
  ayricalik?: { ekstraModul: number; sinirsizModul: boolean } | null
): ModulHakkiDurumu {
  const paketHakki = planKey in MODUL_HAKKI ? MODUL_HAKKI[planKey] : MODUL_HAKKI.free;
  const hak = paketHakki === null || ayricalik?.sinirsizModul ? null : paketHakki + (ayricalik?.ekstraModul ?? 0);
  const kullanilan = new Set(acikModuller.filter(modulSayilirMi)).size;
  return { planKey, hak, kullanilan, kalan: hak === null ? null : Math.max(0, hak - kullanilan) };
}

export type ModulEklemeKarari = { eklenebilir: true } | { eklenebilir: false; sebep: string };

/**
 * Bu modüller açılabilir mi. Zaten açık olanlar ve sayılmayanlar hakka
 * girmez: aynı modülü yeniden "açmak" hiçbir şeyi değiştirmez.
 */
export function modulEklenebilirMi(
  durum: ModulHakkiDurumu,
  acikModuller: string[],
  yeniModuller: string[]
): ModulEklemeKarari {
  if (durum.hak === null) return { eklenebilir: true };
  const acik = new Set(acikModuller);
  const eklenecek = new Set(yeniModuller.filter((k) => modulSayilirMi(k) && !acik.has(k))).size;
  if (eklenecek === 0) return { eklenebilir: true };
  if (durum.kullanilan + eklenecek <= durum.hak) return { eklenebilir: true };
  const kalan = Math.max(0, durum.hak - durum.kullanilan);
  return {
    eklenebilir: false,
    sebep:
      kalan === 0
        ? `Paketinin modül hakkı doldu (${durum.kullanilan}/${durum.hak}). Yeni modül için kullanmadığın bir modülü kapat ya da paketini yükselt.`
        : `Paketinle ${kalan} modül daha açabilirsin, ${eklenecek} seçtin. Seçimi azalt ya da paketini yükselt.`,
  };
}
