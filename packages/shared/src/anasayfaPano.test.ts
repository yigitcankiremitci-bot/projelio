import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  PANO_EN_COK_KART,
  panoBoyutAyarla,
  panoDuzeniniCoz,
  panoKapsamiGecerliMi,
  panoKartEkle,
  panoKartKaldir,
  panoSirala,
  type PanoKart,
} from "./anasayfaPano";

const a: PanoKart = { id: "a", boyut: "kucuk" };
const b: PanoKart = { id: "b", boyut: "orta" };
const c: PanoKart = { id: "c", boyut: "genis" };

describe("anasayfa panosu düzeni", () => {
  test("geçersiz kayıt null, boş pano geçerli tercih", () => {
    assert.equal(panoDuzeniniCoz("bozuk"), null);
    assert.equal(panoDuzeniniCoz(undefined), null);
    assert.deepEqual(panoDuzeniniCoz([]), []);
  });

  test("tekrar eden ve bozuk öğeler atılır, bilinmeyen boyut küçüğe düşer", () => {
    assert.deepEqual(
      panoDuzeniniCoz([{ id: "a", boyut: "dev" }, { id: "a", boyut: "orta" }, { id: "<script>" }, 5, null, { id: "modul:crm", boyut: "orta" }]),
      [a, { id: "modul:crm", boyut: "orta" }]
    );
  });

  test("kart sayısı tavanı aşamaz", () => {
    const cok = Array.from({ length: PANO_EN_COK_KART + 5 }, (_, i) => ({ id: `k${i}`, boyut: "kucuk" }));
    assert.equal(panoDuzeniniCoz(cok)?.length, PANO_EN_COK_KART);
    const dolu = panoDuzeniniCoz(cok)!;
    assert.equal(panoKartEkle(dolu, "yeni"), dolu);
  });

  test("sürükleme sırası uygulanır, ekranda olmayan kart silinmez", () => {
    assert.deepEqual(panoSirala([a, b, c], ["c", "a"]), [c, a, b]);
  });

  test("ekranda olup düzende olmayan kimlik yok sayılır", () => {
    assert.deepEqual(panoSirala([a], ["x", "a"]), [a]);
  });

  test("ekle / kaldır / boyutlandır", () => {
    assert.deepEqual(panoKartEkle([a], "b", "orta"), [a, b]);
    assert.deepEqual(panoKartEkle([a], "a", "genis"), [a]);
    assert.deepEqual(panoKartKaldir([a, b], "a"), [b]);
    assert.deepEqual(panoBoyutAyarla([a], "a", "genis"), [{ id: "a", boyut: "genis" }]);
  });

  test("kapsam yalnızca me ya da uuid", () => {
    assert.equal(panoKapsamiGecerliMi("me"), true);
    assert.equal(panoKapsamiGecerliMi("3f2b1c9e-8a7d-4e6f-9b0a-1c2d3e4f5a6b"), true);
    assert.equal(panoKapsamiGecerliMi("../diger"), false);
    assert.equal(panoKapsamiGecerliMi(undefined), false);
  });
});
