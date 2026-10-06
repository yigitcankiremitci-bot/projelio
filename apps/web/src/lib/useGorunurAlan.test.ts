import { test } from "node:test";
import assert from "node:assert/strict";
import { gorunurAlanKutusu } from "./useGorunurAlan";

test("WebView klavyeyle küçüldüyse panel dokunulmaz", () => {
  assert.equal(gorunurAlanKutusu(500, 500, 0), null);
});

test("adres çubuğu kadar fark kutu dayatmaz", () => {
  assert.equal(gorunurAlanKutusu(800, 770, 0), null);
});

test("klavye görsel alanı kısalttıysa panel onun üstüne sığar", () => {
  assert.deepEqual(gorunurAlanKutusu(800, 450.4, 0), { top: 0, height: 450 });
});

test("iOS sayfayı kaydırdıysa panel görsel alanın tepesinden başlar", () => {
  assert.deepEqual(gorunurAlanKutusu(800, 450, 120), { top: 120, height: 450 });
});

test("ölçü yoksa ya da bozuksa null", () => {
  assert.equal(gorunurAlanKutusu(800, 0, 0), null);
  assert.equal(gorunurAlanKutusu(0, 400, 0), null);
});
