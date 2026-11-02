import { strict as assert } from "node:assert";
import { test } from "node:test";
import { kalanOran, kisiArtirmaBirimi, kisiArtirmaTutari } from "./kisi-artirma";

const d = (iso: string) => new Date(iso);

test("kalan oran dönem dışında 0 ile 1 arasında kalır", () => {
  assert.equal(kalanOran(d("2026-11-01"), d("2026-12-01"), d("2026-10-20")), 1);
  assert.equal(kalanOran(d("2026-11-01"), d("2026-12-01"), d("2026-12-05")), 0);
  assert.equal(kalanOran(d("2026-11-01"), d("2026-11-01"), d("2026-11-01")), 0);
});

test("dönemin yarısında yalnızca farkın yarısı çekilir, tam liraya yukarı", () => {
  // 30 günlük dönemin 15. günü: fark 2 kişi × 260 ₺ = 520 -> 260
  const tutar = kisiArtirmaTutari({
    eskiListe: 870,
    yeniListe: 1390,
    donemBasi: d("2026-11-01T00:00:00Z"),
    donemSonu: d("2026-12-01T00:00:00Z"),
    simdi: d("2026-11-16T00:00:00Z"),
  });
  assert.equal(tutar, 260);

  const kusurlu = kisiArtirmaTutari({
    eskiListe: 870,
    yeniListe: 1130,
    donemBasi: d("2026-11-01T00:00:00Z"),
    donemSonu: d("2026-12-01T00:00:00Z"),
    simdi: d("2026-11-11T00:00:00Z"),
  });
  // 260 × 20/30 = 173,33 -> 174
  assert.equal(kusurlu, 174);
});

test("dönem bitmek üzereyken bile en az 1 ₺", () => {
  const tutar = kisiArtirmaTutari({
    eskiListe: 870,
    yeniListe: 1130,
    donemBasi: d("2026-11-01T00:00:00Z"),
    donemSonu: d("2026-12-01T00:00:00Z"),
    simdi: d("2026-11-30T23:59:00Z"),
  });
  assert.equal(tutar, 1);
});

test("yıllık abonelikte ek birim içinde bulunulan kredi ayının kalanı kadar", () => {
  // Yıllık dönem 7 Mart'ta başladı; 22 Haziran, 7 Haziran–7 Temmuz ayının yarısı.
  const { birim, aySonu } = kisiArtirmaBirimi({
    eskiBirim: 100_000,
    yeniBirim: 120_000,
    donemBasi: d("2026-03-07T00:00:00Z"),
    simdi: d("2026-06-22T00:00:00Z"),
  });
  assert.equal(aySonu?.toISOString(), "2026-07-07T00:00:00.000Z");
  assert.equal(birim, 10_000);
});

test("ay sonu kırpılan başlangıçta kredi ayı doğru bulunur", () => {
  const { aySonu } = kisiArtirmaBirimi({
    eskiBirim: 100_000,
    yeniBirim: 110_000,
    donemBasi: d("2026-01-31T00:00:00Z"),
    simdi: d("2026-03-05T00:00:00Z"),
  });
  // Ocak 31 -> Şubat 28 -> Mart 31: 5 Mart, Şubat 28 – Mart 31 ayında.
  assert.equal(aySonu?.toISOString(), "2026-03-31T00:00:00.000Z");
});

test("dönem başlamadıysa ek birim yok", () => {
  assert.deepEqual(
    kisiArtirmaBirimi({ eskiBirim: 1, yeniBirim: 2, donemBasi: d("2026-12-01"), simdi: d("2026-11-01") }),
    { birim: 0, aySonu: null }
  );
});
