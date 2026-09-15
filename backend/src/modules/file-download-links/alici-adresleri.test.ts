import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { adresleriAyikla } from "./alici-adresleri";

describe("adresleriAyikla", () => {
  it("virgül, noktalı virgül, boşluk ve satır sonunu aynı ayırıcı sayar", () => {
    // Kullanıcı dördünü de yazabiliyor ve hepsi aynı şeyi kastediyor;
    // birini "yanlış biçim" diye reddetmek gereksiz bir engel olurdu.
    assert.deepEqual(adresleriAyikla(["a@x.com, b@x.com; c@x.com\nd@x.com e@x.com"]), [
      "a@x.com",
      "b@x.com",
      "c@x.com",
      "d@x.com",
      "e@x.com",
    ]);
  });

  it("küçük harfe indirir ve tekrarları atar", () => {
    assert.deepEqual(adresleriAyikla(["Ahmet@Firma.COM", " ahmet@firma.com "]), ["ahmet@firma.com"]);
  });

  it("emails dizisi ile tekil email alanını birleştirir", () => {
    assert.deepEqual(adresleriAyikla(["a@x.com", "b@x.com"]), ["a@x.com", "b@x.com"]);
  });

  it("boş girdide hata verir", () => {
    assert.throws(() => adresleriAyikla(["", "   "]), /Geçerli bir e-posta/);
  });

  // Yazım hatası SESSİZCE ATILMAZ: eksik giden mesajı kullanıcı ancak karşı
  // taraf sormayınca öğrenirdi.
  it("bozuk adres varsa tamamını reddeder", () => {
    assert.throws(() => adresleriAyikla(["a@x.com, bozukadres"]), /geçerli görünmüyor/);
  });

  it("alıcı tavanını aşarsa reddeder", () => {
    const cok = Array.from({ length: 21 }, (_, i) => `k${i}@x.com`).join(",");
    assert.throws(() => adresleriAyikla([cok]), /en fazla 20/);
  });
});
