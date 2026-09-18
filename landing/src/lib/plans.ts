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

/** Lio Bakiyesi paketi — panelin açık ucundan (GET /billing/public/lio-packages). */
export interface BakiyePaketi {
  key: string;
  credits: number;
  price: number;
}

/**
 * Panelden canlı bakiye paketleri. Kurallar canliFiyatlar ile aynı: sunucuda
 * çekilir, hata yutulur (boş dizi = sözlükteki yedek kopya), zaman aşımı şart.
 */
export async function canliBakiyePaketleri(): Promise<BakiyePaketi[]> {
  try {
    const yanit = await fetch(`${apiUrl}/billing/public/lio-packages`, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(5000),
    });
    if (!yanit.ok) return [];
    const veri = (await yanit.json()) as { packages?: BakiyePaketi[] };
    return Array.isArray(veri?.packages) ? veri.packages : [];
  } catch {
    return [];
  }
}
