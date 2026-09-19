import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { bilgiEpostasiOlustur, ipucuEpostasiOlustur } from "./ipucu-eposta.template";
import { IPUCLARI } from "./ipucu.icerik";

const temel = {
  locale: "tr" as const,
  ipucu: IPUCLARI[0],
  sira: 1,
  toplam: IPUCLARI.length,
  webUrl: "https://app.projelio.test",
};

describe("ipucuEpostasiOlustur", () => {
  it("başlığı, sırayı ve düğmeyi taşır", () => {
    const mail = ipucuEpostasiOlustur(temel);
    assert.ok(mail.subject.includes(IPUCLARI[0].baslik));
    assert.ok(mail.html.includes(`İpucu 1/${IPUCLARI.length}`));
    assert.ok(mail.html.includes(IPUCLARI[0].dugme));
    assert.ok(mail.text.includes(IPUCLARI[0].dugme));
  });

  it("paragrafları ayrı ayrı yazar", () => {
    const mail = ipucuEpostasiOlustur(temel);
    const paragrafSayisi = IPUCLARI[0].govde.split(/\n{2,}/).length;
    assert.ok(paragrafSayisi > 1);
    assert.equal((mail.html.match(/line-height:1\.65/g) ?? []).length, paragrafSayisi);
  });

  it("bağlantıyı tam adrese çevirir", () => {
    const mail = ipucuEpostasiOlustur({ ...temel, ipucu: IPUCLARI.find((i) => i.link === "/tasks")! });
    assert.ok(mail.html.includes("https://app.projelio.test/tasks"));
    assert.ok(mail.text.includes("https://app.projelio.test/tasks"));
  });

  it("adı kaçırır", () => {
    const mail = ipucuEpostasiOlustur({ ...temel, ad: "<b>Can</b>" });
    assert.ok(!mail.html.includes("<b>Can</b>"));
    assert.ok(mail.html.includes("&lt;b&gt;Can&lt;/b&gt;"));
    assert.ok(mail.text.includes("<b>Can</b>"));
  });

  it("abonelik adresi varsa tek tık çıkış başlıklarını ekler", () => {
    const adres = "https://api.projelio.test/notifications/ipucu-kapat?u=x&i=y";
    const mail = ipucuEpostasiOlustur({ ...temel, abonelikAdresi: adres });
    assert.equal(mail.headers?.["List-Unsubscribe"], `<${adres}>`);
    assert.equal(mail.headers?.["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
    assert.ok(mail.html.includes("İpuçlarını artık gönderme"));
  });

  it("İngilizcede sözlükten çevirir", () => {
    const mail = ipucuEpostasiOlustur({ ...temel, locale: "en" });
    assert.ok(!mail.subject.includes("Örnek"), mail.subject);
    assert.ok(mail.html.includes(`Tip 1/${IPUCLARI.length}`));
  });

  it("Lio metni verilince onu kullanır ve ikinci selam eklemez", () => {
    const mail = ipucuEpostasiOlustur({
      ...temel,
      ad: "Can",
      metin: { konu: "Özel konu", baslik: "Özel başlık", govde: "Merhaba Can, özel gövde.", dugme: "Aç" },
    });
    assert.equal(mail.subject, "Özel konu");
    assert.equal((mail.html.match(/Merhaba Can/g) ?? []).length, 1);
  });
});

describe("bilgiEpostasiOlustur", () => {
  it("bağlantı yoksa düğme çizmez", () => {
    const mail = bilgiEpostasiOlustur({
      locale: "tr",
      metin: { konu: "k", baslik: "b", govde: "g", dugme: "Aç" },
      webUrl: "https://app.projelio.test",
    });
    assert.ok(!mail.html.includes("Aç</"));
  });

  it("gövdedeki HTML'i kaçırır", () => {
    const mail = bilgiEpostasiOlustur({
      locale: "tr",
      metin: { konu: "k", baslik: "b", govde: "<script>x</script>" },
      webUrl: "https://app.projelio.test",
    });
    assert.ok(!mail.html.includes("<script>"));
  });
});
