import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { kopyaKonusu, paylasimHtml, paylasimKonusu, paylasimMetni } from "./indirme-linki-eposta";

describe("paylaşım e-postasının dili", () => {
  it("dil verilmezse Türkçe (eski istemciler alanı göndermiyor)", () => {
    assert.equal(paylasimKonusu({ dosyaAdi: "a.pdf", paylasanAdi: "Can" }), "Can sizinle bir dosya paylaştı: a.pdf");
    assert.match(paylasimMetni({ dosyaAdi: "a.pdf", url: "https://x/dosya/t" }), /Bir Projelio kullanıcısı sizinle bir dosya paylaştı\./);
  });

  it("İngilizce seçilirse konu, gövde ve düğme İngilizce", () => {
    assert.equal(
      paylasimKonusu({ dosyaAdi: "a.pdf", paylasanAdi: "Can", dil: "en" }),
      "Can shared a file with you: a.pdf"
    );
    const html = paylasimHtml({ dil: "en", dosyaAdi: "a.pdf", paylasanAdi: "Can", url: "https://x/dosya/t" });
    assert.match(html, /<html lang="en">/);
    assert.match(html, /<strong>Can<\/strong> shared a file with you\./);
    assert.match(html, />Open file</);
    assert.doesNotMatch(html, /paylaş/);
  });

  it("pakette sayı ve liste, kopya şeridi de aynı dilde", () => {
    const p = {
      dil: "en" as const,
      dosyaAdi: "a.pdf ve 1 dosya daha",
      dosyaAdlari: ["a.pdf", "b.pdf"],
      url: "https://x/dosya/t",
      boyutMetni: "2 MB",
      kopyaAlicilari: ["m@firma.com"],
    };
    assert.equal(paylasimKonusu({ dosyaAdi: "a.pdf", dosyaSayisi: 2, dil: "en" }), "2 files were shared with you: a.pdf");
    const metin = paylasimMetni(p);
    assert.match(metin, /This is your copy\. The message below was sent to: m@firma\.com/);
    assert.match(metin, /- a\.pdf\n- b\.pdf\n2 MB in total/);
    assert.equal(kopyaKonusu("a.pdf", "en"), "Copy: a.pdf shared");
  });

  it("paylaşanın adı kaçırılır; kalın yazma işareti ada sızmaz", () => {
    const html = paylasimHtml({ dosyaAdi: "a.pdf", paylasanAdi: "<b>X</b>", url: "https://x/dosya/t" });
    assert.match(html, /<strong>&lt;b&gt;X&lt;\/b&gt;<\/strong> sizinle bir dosya paylaştı\./);
    assert.doesNotMatch(html, /@@/);
  });
});
