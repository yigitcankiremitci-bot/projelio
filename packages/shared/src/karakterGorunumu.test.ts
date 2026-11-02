import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { KIYAFET_RENKLERI, karakterGorunumuTemizle } from "./karakterGorunumu";

describe("karakterGorunumuTemizle", () => {
  test("geçerli model ve listedeki renkler kalır (büyük/küçük harf fark etmez)", () => {
    assert.deepEqual(karakterGorunumuTemizle({ model: "kadin_suit", ten: "#c99068", sac: "#1F1A17", kiyafet: KIYAFET_RENKLERI[2] }), {
      model: "kadin_suit",
      ten: "#C99068",
      sac: "#1F1A17",
      kiyafet: KIYAFET_RENKLERI[2],
    });
  });

  test("listede olmayan renk ve fazladan alan düşer", () => {
    assert.deepEqual(karakterGorunumuTemizle({ model: "erkek_hoodie", ten: "#123456", sac: "kırmızı", baska: 1 }), { model: "erkek_hoodie" });
  });

  test("model yoksa ya da bilinmiyorsa null", () => {
    assert.equal(karakterGorunumuTemizle({ ten: "#C99068" }), null);
    assert.equal(karakterGorunumuTemizle({ model: "../gizli" }), null);
    assert.equal(karakterGorunumuTemizle("erkek_suit"), null);
    assert.equal(karakterGorunumuTemizle(null), null);
  });
});
