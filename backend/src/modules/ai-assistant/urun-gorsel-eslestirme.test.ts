import { test } from "node:test";
import * as assert from "node:assert/strict";
import {
  base64GorselTuru,
  eklenecekMi,
  eslesmeleriCoz,
  eslestirmeSistemi,
  gruplara,
  urunListesiMetni,
} from "./urun-gorsel-eslestirme";

test("ürün listesi numaralı ve ek bilgileriyle yazılır", () => {
  const metin = urunListesiMetni([
    { id: "a", ad: "Vacrol Sprey 30 ML", kategori: "Sprey" },
    { id: "b", ad: "Vacrol Damla 10 ML", sku: "VD10" },
  ]);
  assert.equal(metin, "1) Vacrol Sprey 30 ML (Sprey)\n2) Vacrol Damla 10 ML (kod VD10)");
});

test("sistem istemi kimlik değil numara ister", () => {
  const s = eslestirmeSistemi([{ id: "uuid-1", ad: "Ürün" }]);
  assert.ok(s.includes("1) Ürün"));
  assert.ok(!s.includes("uuid-1"));
});

test("yanıt çözülür; çevresindeki metin yok sayılır", () => {
  const r = eslesmeleriCoz('Sonuç:\n[{"no":1,"urun":2,"guven":"yuksek","gorulen":"Damla"}]\n', 4, 3);
  assert.deepEqual(r, [{ no: 1, urun: 2, guven: "yuksek", gorulen: "Damla" }]);
});

test("aralık dışı ürün 0 olur, aralık dışı/tekrarlanan görsel atlanır", () => {
  const r = eslesmeleriCoz(
    '[{"no":1,"urun":9,"guven":"yuksek"},{"no":1,"urun":1,"guven":"yuksek"},{"no":7,"urun":1},{"no":2,"urun":1,"guven":"belki"}]',
    4,
    3
  );
  assert.deepEqual(
    r.map((e) => [e.no, e.urun, e.guven]),
    [
      [1, 0, "yuksek"],
      [2, 1, "dusuk"],
    ]
  );
});

test("bozuk JSON hiçbir eşleşme üretmez (yanlış ürüne gitmez)", () => {
  assert.deepEqual(eslesmeleriCoz("[{no:1", 4, 3), []);
  assert.deepEqual(eslesmeleriCoz("yanıt yok", 4, 3), []);
});

test("düşük güven ve eşleşmeyen eklenmez", () => {
  assert.equal(eklenecekMi({ no: 1, urun: 2, guven: "yuksek", gorulen: "" }), true);
  assert.equal(eklenecekMi({ no: 1, urun: 2, guven: "orta", gorulen: "" }), true);
  assert.equal(eklenecekMi({ no: 1, urun: 2, guven: "dusuk", gorulen: "" }), false);
  assert.equal(eklenecekMi({ no: 1, urun: 0, guven: "yuksek", gorulen: "" }), false);
  assert.equal(eklenecekMi(undefined), false);
});

test("gruplara bölme", () => {
  assert.deepEqual(gruplara([1, 2, 3, 4, 5], 4), [[1, 2, 3, 4], [5]]);
});

test("görsel türü veriden okunur", () => {
  assert.equal(base64GorselTuru("/9j/4AAQ"), "image/jpeg");
  assert.equal(base64GorselTuru("iVBORw0K"), "image/png");
  assert.equal(base64GorselTuru("UklGRiQ"), "image/webp");
  assert.equal(base64GorselTuru("xyz"), undefined);
});
