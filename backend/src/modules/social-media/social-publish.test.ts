// Backend tsconfig'inde esModuleInterop kapalı (NestJS CommonJS derlemesi
// gereği), bu yüzden namespace import kullanılıyor.
import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildCaption, extractMetaError, mediaFileIds } from "./publish-format";

// Yayına giden metnin ve medya sırasının kuralları. Bu iki fonksiyon yanlış
// çalışırsa hata sessiz olur: gönderi çıkar, ama yanlış metinle ya da yanlış
// sırayla — ve geri alınamaz.

describe("yayın metni", () => {
  test("ortak metin ve etiketler birleşir", () => {
    // Etiketler ayrı alanda tutuluyor ama Instagram'da aynı gövdede yayımlanıyor.
    assert.equal(buildCaption({ caption: "Merhaba", hashtags: "#kahve #istanbul" }, {}), "Merhaba\n\n#kahve #istanbul");
  });

  test("kanala özel metin ortak metni ezer", () => {
    const post = { caption: "Uzun LinkedIn metni", hashtags: "#a" };
    assert.equal(buildCaption(post, { caption_override: "X için kısa" }), "X için kısa");
  });

  test("boşluktan ibaret ezme, ezme sayılmaz", () => {
    // Kullanıcı alanı açıp boş bırakmış olabilir; o zaman ortak metin gitmeli.
    assert.equal(buildCaption({ caption: "Ortak" }, { caption_override: "   " }), "Ortak");
  });

  test("eksik alanlar sorun çıkarmıyor", () => {
    assert.equal(buildCaption({}, {}), "");
    assert.equal(buildCaption({ caption: null, hashtags: "#tek" }, { caption_override: null }), "#tek");
  });
});

describe("medya sırası", () => {
  test("kullanıcının verdiği sıra korunur", () => {
    // Karusel'de sıra içeriğin kendisi: ilk görsel kapak ve kırpma oranını belirliyor.
    const post = {
      social_post_media: [
        { file_id: "c", sort_order: 2 },
        { file_id: "a", sort_order: 0 },
        { file_id: "b", sort_order: 1 },
      ],
    };
    assert.deepEqual(mediaFileIds(post), ["a", "b", "c"]);
  });

  test("sırası olmayan medya listeyi bozmaz", () => {
    assert.deepEqual(mediaFileIds({ social_post_media: [{ file_id: "x" }, { file_id: "y" }] }), ["x", "y"]);
    assert.deepEqual(mediaFileIds({}), []);
  });
});

describe("Meta hata mesajı", () => {
  test("kullanıcıya dönük mesaj tercih edilir", () => {
    const body = JSON.stringify({
      error: { message: "(#10) Application does not have permission", error_user_msg: "Yayın izni verilmemiş." },
    });
    assert.equal(extractMetaError(body), "Yayın izni verilmemiş.");
  });

  test("yoksa teknik mesaj kullanılır", () => {
    const body = JSON.stringify({ error: { message: "Error validating access token", code: 190 } });
    assert.equal(extractMetaError(body), "Error validating access token");
  });

  test("çözülemeyen gövde çuvallamıyor", () => {
    // Meta bazen HTML hata sayfası döndürüyor; kullanıcıya ham HTML gösterilmemeli.
    assert.equal(extractMetaError("<html>502 Bad Gateway</html>"), "Instagram isteği reddedildi.");
    assert.equal(extractMetaError(""), "Instagram isteği reddedildi.");
  });
});
