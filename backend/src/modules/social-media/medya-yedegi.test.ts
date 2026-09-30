import * as assert from "node:assert/strict";
import { test } from "node:test";
import { yedekAdiniCoz, yedekYolu } from "./medya-yedegi";

test("yedek yolu meta veriyi (ad, tür, orijinal mi) kayıpsız taşır", () => {
  const m = { id: "med_abc123", ad: "Akor Yürüyüşü Bölüm 2.mp4", mimeType: "video/mp4", orijinal: true };
  const yol = yedekYolu("u1", m);
  assert.ok(yol.startsWith("gelen/u1/med_abc123.o."));
  const cozulen = yedekAdiniCoz(yol.split("/").pop()!);
  assert.deepEqual(cozulen, { id: "med_abc123", orijinal: true, ad: m.ad, mimeType: "video/mp4" });
});

test("adında nokta olan dosya adı yolu bozmaz", () => {
  const yol = yedekYolu("u1", { id: "med_x", ad: "a.b.c.mov", mimeType: "video/quicktime", orijinal: false });
  assert.equal(yedekAdiniCoz(yol.split("/").pop()!)?.ad, "a.b.c.mov");
  assert.equal(yedekAdiniCoz(yol.split("/").pop()!)?.orijinal, false);
});

test("tanınmayan yedek adı null döner", () => {
  assert.equal(yedekAdiniCoz("rastgele.dosya"), null);
  assert.equal(yedekAdiniCoz("a.x.b.c"), null);
});
