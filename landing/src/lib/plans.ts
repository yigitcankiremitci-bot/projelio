import { apiUrl } from "./site";

/**
 * Fiyatların tazelenme aralığı (saniye).
 *
 * 1 SAAT DEĞİL, 1 DAKİKA: sayfanın ilk hâli imaj derlenirken üretiliyor ve o
 * sırada API'ye ulaşılamazsa yedek (sözlükteki) fiyat kalıyor. Bir saatlik
 * aralıkta bu, her dağıtımdan sonra sitenin bir saat boyunca yanlış fiyat
 * göstermesi demekti — 2026-09-20'de yaşandı: panel TL fiyat verirken site
 * dolar gösterdi. Dakikalık aralıkta kendi kendini düzeltiyor ve yük de
 * önemsiz (dakikada en fazla bir istek, yanıt önbelleğe alınıyor).
 */
const FIYAT_TAZELEME_SN = 60;
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
      next: { revalidate: FIYAT_TAZELEME_SN },
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
      next: { revalidate: FIYAT_TAZELEME_SN },
      signal: AbortSignal.timeout(5000),
    });
    if (!yanit.ok) return [];
    const veri = (await yanit.json()) as { packages?: BakiyePaketi[] };
    return Array.isArray(veri?.packages) ? veri.packages : [];
  } catch {
    return [];
  }
}
