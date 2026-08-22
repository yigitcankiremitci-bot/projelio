import { strict as assert } from "node:assert";
import { test } from "node:test";
import { sanitizeForSpeech } from "./narrator";

/**
 * Konuşma temizliği regex yoğun ve gözle doğrulaması zor: yanlış giden bir kural
 * sessizce metni bozuyor, sonuç ancak sesi dinleyince fark ediliyor. Lio'nun
 * gerçek cevaplarından alınmış birkaç örnek burada sabitlendi.
 */
test("seslendirme için metin temizliği", async (t) => {
  await t.test("markdown yıldızlarını okumaz", () => {
    assert.equal(sanitizeForSpeech("**Tamamlandı**: 68 görev eklendi"), "Tamamlandı: 68 görev eklendi");
  });

  await t.test("emojiyi atar", () => {
    assert.equal(sanitizeForSpeech("✅ Tüm görevler eklendi"), "Tüm görevler eklendi");
  });

  await t.test("liste ve başlık işaretlerini atar", () => {
    // Satır sonları KORUNUYOR: konuşma sentezi onları doğal duraklama sayıyor
    // ve splitForSpeech parçalamayı buradan da yapabiliyor.
    assert.equal(sanitizeForSpeech("## Özet\n- ilk madde\n- ikinci madde"), "Özet\nilk madde\nikinci madde");
  });

  await t.test("bağlantıda yalnızca görünen metni okur", () => {
    assert.equal(sanitizeForSpeech("[proje sayfası](https://a.b/c) açıldı"), "proje sayfası açıldı");
  });

  await t.test("orta noktayı virgüle çevirir, noktalamayı korur", () => {
    assert.equal(sanitizeForSpeech("Excel · 2 sayfa · 40 satır."), "Excel, 2 sayfa, 40 satır.");
  });

  await t.test("düz metni bozmaz", () => {
    assert.equal(sanitizeForSpeech("Görevi yarına aldım, tamam mı?"), "Görevi yarına aldım, tamam mı?");
  });
});
