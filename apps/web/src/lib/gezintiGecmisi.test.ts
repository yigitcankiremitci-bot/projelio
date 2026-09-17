import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { adiKaydet, BOS_GEZINTI, gezintiyiIsle, oncekiKayit, type GezintiDurumu } from "./gezintiGecmisi";

function git(adimlar: [tur: "PUSH" | "POP" | "REPLACE", key: string, to: string, label?: string][]): GezintiDurumu {
  let d = BOS_GEZINTI;
  for (const [tur, key, to, label] of adimlar) {
    d = gezintiyiIsle(d, tur, key, to);
    if (label) d = adiKaydet(d, key, label);
  }
  return d;
}

describe("gezinti geçmişi", () => {
  it("departmana anasayfadan girildiyse geri anasayfayı gösterir", () => {
    const d = git([
      ["POP", "a", "/", "Ana Sayfa"],
      ["PUSH", "b", "/departments/1", "Pazarlama"],
    ]);
    assert.deepEqual(oncekiKayit(d), { key: "a", to: "/", label: "Ana Sayfa" });
  });

  // Şirket → departman → geri (POP) → şirketin geri bağlantısı departmanı
  // DEĞİL, şirkete gelinen yeri göstermeli; aksi hâlde iki sayfa arasında döngü.
  it("geri dönülünce önceki kayıt bir adım daha geriye kayar", () => {
    const d = git([
      ["POP", "a", "/", "Ana Sayfa"],
      ["PUSH", "b", "/organizations/1", "Acme"],
      ["PUSH", "c", "/departments/1", "Pazarlama"],
      ["POP", "b", "/organizations/1"],
    ]);
    assert.equal(oncekiKayit(d)?.to, "/");
  });

  it("aynı sayfada sekme değişince (REPLACE) ad korunur ve adres güncellenir", () => {
    const d = git([
      ["POP", "a", "/organizations/1", "Acme"],
      ["REPLACE", "a2", "/organizations/1?tab=departments"],
      ["PUSH", "b", "/departments/1"],
    ]);
    assert.deepEqual(oncekiKayit(d), { key: "a2", to: "/organizations/1?tab=departments", label: "Acme" });
  });

  it("başka sayfaya REPLACE edilince eski ad taşınmaz", () => {
    const d = git([
      ["POP", "a", "/organizations/1", "Acme"],
      ["REPLACE", "a2", "/login"],
      ["PUSH", "b", "/departments/1"],
    ]);
    assert.equal(oncekiKayit(d), null);
  });

  it("adı bilinmeyen önceki kayıt yok sayılır, sayfa sabit ebeveynine düşer", () => {
    const d = git([
      ["POP", "a", "/something"],
      ["PUSH", "b", "/departments/1"],
    ]);
    assert.equal(oncekiKayit(d), null);
  });

  it("doğrudan girilen ilk sayfada önceki kayıt yoktur", () => {
    assert.equal(oncekiKayit(git([["POP", "a", "/departments/1", "Pazarlama"]])), null);
  });

  it("geri gidip yeni sayfaya geçince ileri kayıtlar atılır", () => {
    const d = git([
      ["POP", "a", "/", "Ana Sayfa"],
      ["PUSH", "b", "/departments/1", "Pazarlama"],
      ["POP", "a", "/"],
      ["PUSH", "c", "/jobs/1", "Pist"],
    ]);
    assert.deepEqual(d.yigin.map((k) => k.key), ["a", "c"]);
    assert.equal(oncekiKayit(d)?.key, "a");
  });

  it("uygulama dışından tanınmayan bir kayda dönülürse geçmiş sıfırlanır", () => {
    const d = git([
      ["POP", "a", "/", "Ana Sayfa"],
      ["PUSH", "b", "/departments/1", "Pazarlama"],
      ["POP", "zz", "/jobs/1"],
    ]);
    assert.deepEqual(d.yigin.map((k) => k.key), ["zz"]);
    assert.equal(oncekiKayit(d), null);
  });

  // StrictMode ve yeniden render aynı olayı birden çok kez işletir.
  it("aynı kaydı tekrar işlemek durumu değiştirmez", () => {
    const d = git([
      ["POP", "a", "/", "Ana Sayfa"],
      ["PUSH", "b", "/departments/1"],
    ]);
    assert.equal(gezintiyiIsle(d, "PUSH", "b", "/departments/1"), d);
  });
});
