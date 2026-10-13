import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { IndirmeToplayici, type IndirmeOzeti } from "./indirme-toplayici";

const bekle = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("IndirmeToplayici", () => {
  it("aynı bağlantının art arda indirmelerini tek özette toplar", async () => {
    const gidenler: IndirmeOzeti<string>[] = [];
    const t = new IndirmeToplayici<string>((o) => void gidenler.push(o), 30, 1000);
    for (let i = 1; i <= 40; i++) t.ekle("L1", "link", { id: `f${i}`, ad: `dosya${i}.pdf` }, i);
    await bekle(60);
    assert.equal(gidenler.length, 1);
    assert.equal(gidenler[0].dosyaAdlari.length, 40);
    assert.equal(gidenler[0].indirmeSayisi, 40);
    assert.equal(gidenler[0].toplamIndirme, 40);
  });

  it("aynı dosyanın tekrar indirilmesi adı çoğaltmaz ama sayılır", async () => {
    const gidenler: IndirmeOzeti<string>[] = [];
    const t = new IndirmeToplayici<string>((o) => void gidenler.push(o), 20, 1000);
    t.ekle("L1", "link", { id: "f1", ad: "a.pdf" }, 1);
    t.ekle("L1", "link", { id: "f1", ad: "a.pdf" }, 2);
    await bekle(50);
    assert.deepEqual(gidenler[0].dosyaAdlari, ["a.pdf"]);
    assert.equal(gidenler[0].indirmeSayisi, 2);
  });

  it("farklı bağlantılar ayrı özet alır", async () => {
    const gidenler: IndirmeOzeti<string>[] = [];
    const t = new IndirmeToplayici<string>((o) => void gidenler.push(o), 20, 1000);
    t.ekle("L1", "bir", { id: "f1", ad: "a" }, 1);
    t.ekle("L2", "iki", { id: "f2", ad: "b" }, 1);
    await bekle(50);
    assert.deepEqual(gidenler.map((g) => g.link).sort(), ["bir", "iki"]);
  });

  it("sürekli indirme özeti üst sınırdan fazla ertelemez", async () => {
    const gidenler: IndirmeOzeti<string>[] = [];
    const t = new IndirmeToplayici<string>((o) => void gidenler.push(o), 40, 60);
    t.ekle("L1", "link", { id: "f1", ad: "a" }, 1);
    await bekle(30);
    t.ekle("L1", "link", { id: "f2", ad: "b" }, 2);
    await bekle(45);
    // Sessiz süre (40) ikinci indirmeden sayılsaydı 70'te giderdi; üst sınır 60.
    assert.equal(gidenler.length, 1);
    assert.deepEqual(gidenler[0].dosyaAdlari, ["a", "b"]);
  });

  it("kapanışta bekleyenleri hemen gönderir; gönderici hatası sızmaz", async () => {
    let sayi = 0;
    const t = new IndirmeToplayici<string>(() => {
      sayi++;
      throw new Error("e-posta düştü");
    }, 10_000, 10_000);
    t.ekle("L1", "link", { id: "f1", ad: "a" }, 1);
    await t.hepsiniBosalt();
    assert.equal(sayi, 1);
  });
});
