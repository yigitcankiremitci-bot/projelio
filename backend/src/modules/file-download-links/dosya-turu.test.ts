import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { boyutMetni, dosyaTuruEtiketi, gorunenAd } from "./dosya-turu";

describe("dosyaTuruEtiketi", () => {
  it("bilinen türleri adlandırır", () => {
    assert.equal(dosyaTuruEtiketi("application/pdf"), "PDF");
    assert.equal(dosyaTuruEtiketi("image/png"), "Görsel");
    assert.equal(dosyaTuruEtiketi("application/vnd.google-apps.spreadsheet"), "Google E-Tablo");
    assert.equal(
      dosyaTuruEtiketi("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
      "Belge"
    );
  });

  it("tanımadığı türde genel etikete düşer", () => {
    assert.equal(dosyaTuruEtiketi("application/x-bilinmeyen"), "Dosya");
  });
});

describe("boyutMetni", () => {
  it("bilinmeyen boyutta undefined döner", () => {
    // "0 B" yazmak, boyutu bilinmeyen dosyayı boş göstermek olurdu.
    assert.equal(boyutMetni(undefined), undefined);
    assert.equal(boyutMetni(null), undefined);
  });

  it("okunur birime çevirir", () => {
    assert.equal(boyutMetni(0), "0 B");
    assert.equal(boyutMetni(900), "900 B");
    assert.equal(boyutMetni(1536), "1.5 KB");
    assert.equal(boyutMetni(20 * 1024 * 1024), "20 MB");
  });
});

describe("gorunenAd", () => {
  it("tek dosyada dosyanın adı, pakette ilk ad + kalan sayısı", () => {
    assert.equal(gorunenAd(["rapor.pdf"]), "rapor.pdf");
    assert.equal(gorunenAd(["a.pdf", "b.pdf", "c.pdf"]), "a.pdf ve 2 dosya daha");
    assert.equal(gorunenAd([]), "Dosya");
  });
});
