// Backend tsconfig'inde esModuleInterop kapalı, bu yüzden namespace import.
import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { adresiNormallestir, gorulenAdresler, kesfiCoz, KesifOkunamadi, sonMetin } from "./benzer-hesap";

const bloklar = [
  { type: "text", text: "Arıyorum..." },
  { type: "server_tool_use", id: "s1", name: "web_search", input: { query: "müzik prodüksiyon içerik üreticileri" } },
  {
    type: "web_search_tool_result",
    tool_use_id: "s1",
    content: [
      { type: "web_search_result", url: "https://www.ornek.com/liste/", title: "En iyi 10 hesap" },
      { type: "web_search_result", url: "https://blog.ornek.com/roportaj?id=3", title: "Röportaj" },
    ],
  },
  { type: "text", text: "{", citations: [{ type: "web_search_result_location", url: "https://alinti.com/a" }] },
];

describe("benzer hesap keşfi", () => {
  test("görülen adresler sonuçlardan ve alıntılardan, normalleştirilmiş", () => {
    const g = gorulenAdresler(bloklar);
    assert.ok(g.has("ornek.com/liste"));
    assert.ok(g.has("blog.ornek.com/roportaj?id=3"));
    assert.ok(g.has("alinti.com/a"));
    assert.equal(adresiNormallestir("javascript:alert(1)"), null);
  });

  test("aday kaynağı aramada görüldüyse doğrulanır, görülmediyse kaynak düşer", () => {
    const yanit = JSON.stringify({
      nis: "Stüdyo arkası müzik prodüksiyonu",
      hashtagler: ["#muzikproduksiyon", "studyo hayatı", "123"],
      aramalar: ["türk müzik prodüktörü instagram"],
      adaylar: [
        { handle: "uydurma.hesap", neden: "benzer", kaynak: "https://hic-gorulmedi.com/x" },
        { handle: "@Gercek.Hesap", ad: "Gerçek", neden: "aynı format", kaynak: "https://ornek.com/liste" },
        { handle: "benim.hesabim", neden: "kendi hesabı", kaynak: "https://ornek.com/liste" },
        { handle: "gecersiz hesap adı!", neden: "x" },
        { handle: "gercek.hesap", neden: "tekrar" },
      ],
    });
    const k = kesfiCoz(yanit, gorulenAdresler(bloklar), new Set(["benim.hesabim"]));
    assert.deepEqual(k.hashtagler, ["muzikproduksiyon", "studyohayatı"]);
    assert.equal(k.adaylar.length, 2);
    // Doğrulanan önce gelir.
    assert.equal(k.adaylar[0].handle, "gercek.hesap");
    assert.equal(k.adaylar[0].dogrulandi, true);
    assert.equal(k.adaylar[0].kaynak, "https://ornek.com/liste");
    assert.equal(k.adaylar[1].handle, "uydurma.hesap");
    assert.equal(k.adaylar[1].dogrulandi, false);
    assert.equal(k.adaylar[1].kaynak, undefined);
  });

  test("boş ya da okunamayan yanıt reddedilir", () => {
    assert.throws(() => kesfiCoz("bulamadım", new Set(), new Set()), KesifOkunamadi);
    assert.throws(() => kesfiCoz('{"nis":"","adaylar":[],"hashtagler":[]}', new Set(), new Set()), KesifOkunamadi);
  });
});

describe("keşif yanıt metni", () => {
  test("son araç bloğundan sonraki metin, ayraçsız birleştirilir", () => {
    const metin = sonMetin([
      { type: "text", text: "Önce arıyorum {deneme}" },
      { type: "web_search_tool_result", content: [] },
      { type: "text", text: '{"nis": "Mü' },
      { type: "text", text: 'zik"}' },
    ]);
    assert.equal(metin, '{"nis": "Müzik"}');
  });
});
