import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fileKey, folderKey, nextSelection, parseKey, type ClickModifiers } from "./fileSelection";

const duz: ClickModifiers = { metaKey: false, ctrlKey: false, shiftKey: false };
const cmd: ClickModifiers = { metaKey: true, ctrlKey: false, shiftKey: false };
const ctrl: ClickModifiers = { metaKey: false, ctrlKey: true, shiftKey: false };
const shift: ClickModifiers = { metaKey: false, ctrlKey: false, shiftKey: true };

// Ekrandaki sıra: önce klasörler, sonra dosyalar (bkz. FilesPanel render).
const sira = [folderKey("k1"), folderKey("k2"), fileKey("d1"), fileKey("d2"), fileKey("d3")];

describe("anahtarlar", () => {
  it("klasör ve dosya kimlikleri çakışmaz", () => {
    assert.notEqual(fileKey("1"), folderKey("1"));
    assert.deepEqual(parseKey(folderKey("1")), { kind: "folder", id: "1" });
    assert.deepEqual(parseKey(fileKey("1")), { kind: "file", id: "1" });
  });

  it("kimlikte iki nokta olsa da tür doğru okunur", () => {
    assert.deepEqual(parseKey("file:a:b"), { kind: "file", id: "a:b" });
  });
});

describe("nextSelection", () => {
  it("düz tık yalnızca o öğeyi seçer ve çıpayı oraya koyar", () => {
    const r = nextSelection([fileKey("d1"), fileKey("d2")], fileKey("d1"), duz, folderKey("k2"), sira);
    assert.deepEqual(r.keys, [folderKey("k2")]);
    assert.equal(r.anchor, folderKey("k2"));
  });

  it("Cmd+tık seçime ekler", () => {
    const r = nextSelection([folderKey("k1")], folderKey("k1"), cmd, folderKey("k2"), sira);
    assert.deepEqual(r.keys, [folderKey("k1"), folderKey("k2")]);
  });

  it("Ctrl+tık de aynı işi görür — Windows'ta Cmd yok", () => {
    const r = nextSelection([folderKey("k1")], folderKey("k1"), ctrl, folderKey("k2"), sira);
    assert.deepEqual(r.keys, [folderKey("k1"), folderKey("k2")]);
  });

  it("Cmd+tık seçili öğeyi çıkarır", () => {
    const r = nextSelection([folderKey("k1"), folderKey("k2")], folderKey("k2"), cmd, folderKey("k2"), sira);
    assert.deepEqual(r.keys, [folderKey("k1")]);
  });

  it("çıkarılan öğe çıpa olarak kalmaz", () => {
    // Kalsaydı sonraki Shift+tık artık seçili olmayan bir noktadan ölçerdi.
    const r = nextSelection([folderKey("k1"), folderKey("k2")], folderKey("k1"), cmd, folderKey("k2"), sira);
    assert.notEqual(r.anchor, folderKey("k2"));
  });

  it("Shift+tık çıpadan tıklanana kadarki aralığı seçer", () => {
    const r = nextSelection([folderKey("k2")], folderKey("k2"), shift, fileKey("d2"), sira);
    assert.deepEqual(r.keys, [folderKey("k2"), fileKey("d1"), fileKey("d2")]);
  });

  it("Shift+tık geriye doğru da çalışır", () => {
    const r = nextSelection([fileKey("d3")], fileKey("d3"), shift, folderKey("k1"), sira);
    assert.deepEqual(r.keys, sira);
  });

  it("Shift+tık çıpayı KAYDIRMAZ — aralık büyütülüp küçültülebilsin", () => {
    const genis = nextSelection([folderKey("k1")], folderKey("k1"), shift, fileKey("d3"), sira);
    assert.equal(genis.anchor, folderKey("k1"));
    const dar = nextSelection(genis.keys, genis.anchor, shift, folderKey("k2"), sira);
    assert.deepEqual(dar.keys, [folderKey("k1"), folderKey("k2")]);
  });

  it("çıpa yokken Shift+tık düz tık gibi davranır", () => {
    const r = nextSelection([], null, shift, fileKey("d2"), sira);
    assert.deepEqual(r.keys, [fileKey("d2")]);
  });

  it("çıpa listeden düşmüşse (silinmiş dosya) aralık kurulmaz", () => {
    const r = nextSelection([], fileKey("silinmis"), shift, fileKey("d2"), sira);
    assert.deepEqual(r.keys, [fileKey("d2")]);
  });
});
