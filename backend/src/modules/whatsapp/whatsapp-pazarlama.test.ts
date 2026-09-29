import { describe, test } from "node:test";
import * as assert from "node:assert/strict";
import {
  DEFAULT_PAZARLAMA,
  decidePazarlama,
  ilgiCoz,
  isPazarlamaEnabled,
  pazarlamaConfigFromEnv,
  redMi,
  segmentCoz,
} from "./whatsapp-pazarlama";

const URL = "https://app.projelio.app/register";
const cfg = DEFAULT_PAZARLAMA;
const adim = (gelen: string, gidenSayisi: number) => decidePazarlama(cfg, { gelen, gidenSayisi, kayitUrl: URL });

describe("isPazarlamaEnabled", () => {
  test("varsayılan kapalı, yalnız açık değerler açar", () => {
    assert.equal(isPazarlamaEnabled({}), false);
    assert.equal(isPazarlamaEnabled({ WHATSAPP_PAZARLAMA: "0" }), false);
    for (const v of ["1", "true", "EVET"]) assert.equal(isPazarlamaEnabled({ WHATSAPP_PAZARLAMA: v }), true, v);
  });
  test("tavan geçersizse 10'a döner", () => {
    assert.equal(pazarlamaConfigFromEnv({}).maxGiden, 10);
    assert.equal(pazarlamaConfigFromEnv({ WHATSAPP_PAZARLAMA_MAKS: "1" }).maxGiden, 10);
    assert.equal(pazarlamaConfigFromEnv({ WHATSAPP_PAZARLAMA_MAKS: "6" }).maxGiden, 6);
  });
});

describe("sınıflama", () => {
  test("segment", () => {
    assert.equal(segmentCoz("1"), "bireysel");
    assert.equal(segmentCoz("Şirketim var"), "ekip");
    assert.equal(segmentCoz("sadece merak"), "merak");
    assert.equal(segmentCoz("bilmiyorum"), "belirsiz");
  });
  test("ilgi", () => {
    assert.equal(ilgiCoz("2"), "musteri");
    assert.equal(ilgiCoz("tahsilat"), "musteri");
    assert.equal(ilgiCoz("Instagram"), "sosyal");
    assert.equal(ilgiCoz("proje takibi"), "gorev");
    assert.equal(ilgiCoz("4"), "diger");
  });
  test("ret", () => {
    for (const t of ["hayır", "DUR", "ilgilenmiyorum", "Lütfen yazmayın", "spam bu"]) assert.equal(redMi(t), true, t);
    for (const t of ["hayırlı işler", "1", "fiyat nedir", "dur bakalım anlat"]) assert.equal(redMi(t), false, t);
  });
});

describe("akış", () => {
  test("adım adım: tanıtım → soru → öneri+link", () => {
    const a = adim("merhaba", 0);
    assert.match(a.reply ?? "", /Ben Lio|ben Lio/);
    assert.match(a.reply ?? "", /1 - /);
    assert.match(adim("2", 1).reply ?? "", /zamanınızı/);
    const c = adim("2", 2).reply ?? "";
    assert.ok(c.includes(URL));
    assert.ok(c.includes("PROJELIO-XXXX"));
  });
  test("uzayan konuşma serbest metne girmez, link şablonu döner", () => {
    for (let n = 3; n < cfg.maxGiden - 1; n++) {
      const r = adim("bana fiyatı ve tüm özellikleri uzun uzun anlat", n).reply ?? "";
      assert.ok(r.includes(URL), String(n));
    }
  });
  test("son hak kapanış, sonrası sessizlik; toplam tavanı aşmaz", () => {
    assert.match(adim("x", cfg.maxGiden - 1).reply ?? "", /bırakıyorum/);
    assert.equal(adim("x", cfg.maxGiden).reply, null);
    assert.equal(adim("x", 50).reply, null);
  });
  test("ret: tek veda + red işareti", () => {
    const r = adim("ilgilenmiyorum", 1);
    assert.equal(r.reply !== null && r.red, true);
  });
  test("kayıt bağlantısı en geç 3. mesajda gider (10 içinde yönlendirme)", () => {
    const gidenler = [adim("selam", 0), adim("1", 1), adim("1", 2)].map((r) => r.reply ?? "");
    assert.ok(gidenler.some((m) => m.includes(URL)));
  });
  test("metinlerde yasak 'kredi' kelimesi yok", () => {
    for (let n = 0; n < cfg.maxGiden; n++) assert.doesNotMatch((adim("1", n).reply ?? "").toLowerCase(), /kredi|credit/);
  });
});
