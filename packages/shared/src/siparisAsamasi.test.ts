import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { asamaGecisi, kalemlerKilitli, stokImzasi } from "./siparisAsamasi";
import { kalanTutar, siparisDurumu, tahsilatRaporu } from "./tahsilat";
import type { MusteriSiparisi } from "./types";

const stok = (r: ReturnType<typeof asamaGecisi>) => ("hata" in r ? `HATA:${r.hata}` : r.stok);

describe("asamaGecisi — stok kuralı", () => {
  test("onaya ilk geçiş stok düşürür (atlayarak da)", () => {
    assert.equal(stok(asamaGecisi("web_sitesi", "alindi", "onaylandi")), "satis");
    assert.equal(stok(asamaGecisi("elle", "alindi", "yolda")), "satis");
    assert.equal(stok(asamaGecisi(undefined, "alindi", "teslim_edildi")), "satis");
  });

  test("onaylı aşamalar arasında ileri/geri: stoka dokunmaz", () => {
    assert.equal(stok(asamaGecisi("web_sitesi", "onaylandi", "hazirlaniyor")), null);
    assert.equal(stok(asamaGecisi("web_sitesi", "yolda", "hazirlaniyor")), null);
    assert.equal(stok(asamaGecisi("elle", "teslim_edildi", "onaylandi")), null);
  });

  test("iptal: onaydan sonra iade, onaydan önce hiçbir şey", () => {
    assert.equal(stok(asamaGecisi("web_sitesi", "alindi", "iptal")), null);
    assert.equal(stok(asamaGecisi("web_sitesi", "onaylandi", "iptal")), "iade");
    assert.equal(stok(asamaGecisi("elle", "teslim_edildi", "iptal")), "iade");
  });

  test("yasak geçişler", () => {
    assert.match(stok(asamaGecisi("elle", "onaylandi", "alindi"))!, /^HATA:/);
    assert.match(stok(asamaGecisi("elle", "iptal", "onaylandi"))!, /^HATA:/);
    assert.match(stok(asamaGecisi("elle", "yolda", "yolda"))!, /^HATA:/);
  });

  test("Shopify ve Excel siparişinde aşama değişir, stok değişmez", () => {
    assert.equal(stok(asamaGecisi("shopify", "alindi", "onaylandi")), null);
    assert.equal(stok(asamaGecisi("excel", "onaylandi", "iptal")), null);
  });
});

describe("kalemlerKilitli ve stokImzasi", () => {
  test("onaydan sonra takipli siparişin kalemleri kilitli", () => {
    assert.equal(kalemlerKilitli({ asama: "alindi", kaynak: "web_sitesi" }), false);
    assert.equal(kalemlerKilitli({ asama: "onaylandi", kaynak: "elle" }), true);
    assert.equal(kalemlerKilitli({ asama: "yolda", kaynak: "shopify" }), false);
    assert.equal(kalemlerKilitli({ asama: "iptal", kaynak: "shopify" }), true);
  });

  test("imza ürün başına toplam adet; sıra ve ürünsüz kalem fark etmez", () => {
    const a = stokImzasi([
      { productId: "b", miktar: 1 },
      { productId: "a", miktar: 2 },
      { productId: "a", miktar: 1 },
      { productId: undefined, miktar: 9 },
    ]);
    assert.equal(a, "a:3|b:1");
    assert.equal(stokImzasi([{ productId: "b", miktar: 1 }, { productId: "a", miktar: 3 }]), a);
    assert.notEqual(stokImzasi([{ productId: "a", miktar: 4 }, { productId: "b", miktar: 1 }]), a);
  });
});

describe("iptal edilen sipariş alacak değildir", () => {
  const s = (asama: MusteriSiparisi["asama"]): MusteriSiparisi =>
    ({
      id: "1", kalemler: [], tutar: 500, paraBirimi: "TRY", siparisTarihi: "2026-10-01", vadeGun: 0,
      vadeTarihi: "2026-10-01", odemeYontemi: "havale", tahsilatlar: [], createdAt: "", asama,
    }) as MusteriSiparisi;

  test("kalan 0, durum iptal, raporda yok", () => {
    assert.equal(kalanTutar(s("iptal")), 0);
    assert.equal(kalanTutar(s("alindi")), 500);
    assert.equal(siparisDurumu(s("iptal"), "2026-11-09"), "iptal");
    assert.equal(siparisDurumu(s("alindi"), "2026-11-09"), "gecikti");
    const r = tahsilatRaporu([s("iptal"), s("onaylandi")], "2026-11-09");
    assert.equal(r.length, 1);
    assert.equal(r[0].beklenen, 500);
  });
});
