import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { kisisellestirmeIstemi, LIO_METIN_SINIRI, LioMetniCozulemedi, lioMetniniCoz, taslakIstemi } from "./lio-eposta";

const taslak = { konu: "Yeni özellik", baslik: "Rutinler geldi", govde: "Tekrar eden işler için rutin kur.", dugme: "Dene" };

describe("lioMetniniCoz", () => {
  it("kod bloğuna sarılmış JSON'u çözer", () => {
    const m = lioMetniniCoz('İşte:\n```json\n{"konu":"K","baslik":"B","govde":"G1\\n\\nG2","dugme":"D"}\n```');
    assert.deepEqual(m, { konu: "K", baslik: "B", govde: "G1\n\nG2", dugme: "D" });
  });

  it("konu yoksa başlığa düşer", () => {
    assert.equal(lioMetniniCoz('{"baslik":"B","govde":"G"}').konu, "B");
  });

  it("HTML etiketlerini ve bağlantıları temizler — model e-postaya adres koyamaz", () => {
    const m = lioMetniniCoz('{"baslik":"<b>B</b>","govde":"Şuraya bak https://kotu.site/x lütfen"}');
    assert.equal(m.baslik, "B");
    assert.ok(!m.govde.includes("http"));
  });

  it("uzunluğu sınırlar", () => {
    const m = lioMetniniCoz(JSON.stringify({ baslik: "x".repeat(500), govde: "y" }));
    assert.equal(m.baslik.length, LIO_METIN_SINIRI.baslik);
  });

  it("başlık ya da gövde boşsa ya da JSON yoksa hata", () => {
    assert.throws(() => lioMetniniCoz('{"baslik":"B"}'), LioMetniCozulemedi);
    assert.throws(() => lioMetniniCoz("JSON yok"), LioMetniCozulemedi);
    assert.throws(() => lioMetniniCoz("{bozuk"), LioMetniCozulemedi);
  });
});

describe("kisisellestirmeIstemi", () => {
  it("taslağı ve alıcı bilgisini taşır, yalnızca ilk adı verir", () => {
    const { user } = kisisellestirmeIstemi(taslak, { ad: "Ayşe Yılmaz", dil: "tr", isSayisi: 0 }, 0);
    assert.ok(user.includes("Ad: Ayşe\n"));
    assert.ok(!user.includes("Yılmaz"));
    assert.ok(user.includes(taslak.govde));
    assert.ok(user.includes("Açtığı iş sayısı: 0"));
  });

  it("dil kuralı alıcının dilinde", () => {
    assert.ok(kisisellestirmeIstemi(taslak, { dil: "en" }, 0).system.includes("İngilizce"));
  });

  it("üslup alıcıdan alıcıya değişebiliyor", () => {
    const a = kisisellestirmeIstemi(taslak, { dil: "tr" }, 0).system;
    const b = kisisellestirmeIstemi(taslak, { dil: "tr" }, 1).system;
    assert.notEqual(a, b);
  });

  it("uydurmayı ve bağlantı yazmayı yasaklıyor", () => {
    const { system } = kisisellestirmeIstemi(taslak, { dil: "tr" }, 0);
    assert.ok(system.includes("OLMAYAN"));
    assert.ok(system.includes("URL"));
    assert.ok(system.includes("kredi"));
  });
});

describe("taslakIstemi", () => {
  it("isteği taşır ve kişisel selam yazdırmaz", () => {
    const { system, user } = taslakIstemi("Bütçe özelliğini anlat", "tr");
    assert.ok(user.includes("Bütçe özelliğini anlat"));
    assert.ok(system.includes("selamla başlama"));
  });
});
