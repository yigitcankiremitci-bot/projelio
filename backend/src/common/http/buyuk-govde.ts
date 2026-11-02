import { json } from "express";

/**
 * Tek bir uçta Express'in 100 KB gövde sınırını büyüten ara katman.
 *
 * SARMALAYICI ŞART: Nest kendi JSON ayrıştırıcısını kurmadan önce yığında ADI
 * "jsonParser" olan bir ara katman var mı diye bakar, varsa kurmaz
 * (platform-express isMiddlewareApplied). json() doğrudan app.use'a
 * verildiğinde tam o adı taşır: 2026-11-02'de iki saat boyunca o uç dışındaki
 * TÜM JSON gövdeleri boş geldi (sohbet "Mesaj boş olamaz", Mac'in iş
 * sonuçları kayboldu). Bkz. buyuk-govde.test.ts.
 */
export function buyukJsonGovde(limit: string) {
  const ayristir = json({ limit });
  return function buyukJsonGovdesi(req: any, res: any, next: any) {
    ayristir(req, res, next);
  };
}
