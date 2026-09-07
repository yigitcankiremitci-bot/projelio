import { apiUrl } from "./site";
import type { CanliFiyat } from "@/components/PricingTables";

/**
 * Panelden canlı fiyat listesi.
 *
 * NEDEN SUNUCUDA ÇEKİLİYOR: tarayıcıdan çekmek, sayfa açılınca fiyatın bir an
 * yedek kopyayla görünüp sonra değişmesi demekti (fiyat zıplaması). Sunucuda
 * bir kez çekilip HTML'e basılıyor ve saatte bir tazeleniyor.
 *
 * HATA YUTULUR: panel kapalıysa site fiyatsız kalmamalı; çağıran taraf boş
 * dizide sözlükteki yedek fiyata düşüyor (bkz. PricingTables).
 *
 * Zaman aşımı ŞART: yanıt vermeyen bir API, Next'in sayfa üretimini süresiz
 * bekletir ve tanıtım sitesi tamamen açılmaz olur.
 */
export async function canliFiyatlar(): Promise<CanliFiyat[]> {
  try {
    const yanit = await fetch(`${apiUrl}/billing/public/plans`, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(5000),
    });
    if (!yanit.ok) return [];
    const veri = (await yanit.json()) as { plans?: CanliFiyat[] };
    return Array.isArray(veri?.plans) ? veri.plans : [];
  } catch {
    return [];
  }
}
