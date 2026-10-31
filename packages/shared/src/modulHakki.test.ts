import { test } from "node:test";
import assert from "node:assert/strict";
import { modulEklenebilirMi, modulHakkiDurumu } from "./modulHakki";

test("ücretsiz pakette 2 modül; çekirdek modüller sayılmaz", () => {
  const acik = ["faturalar", "yonetim_gorev_yonetimi", "yonetim_dosya_yonetimi"];
  const d = modulHakkiDurumu("free", acik);
  assert.deepEqual(d, { planKey: "free", hak: 2, kullanilan: 1, kalan: 1 });
  assert.equal(modulEklenebilirMi(d, acik, ["crm_musteri"]).eklenebilir, true);
  assert.equal(modulEklenebilirMi(d, acik, ["crm_musteri", "hesaplar"]).eklenebilir, false);
});

test("hak dolunca yeni modül açılmaz ama zaten açık olan yeniden açılabilir", () => {
  const acik = ["a", "b"];
  const d = modulHakkiDurumu("free", acik);
  assert.equal(d.kalan, 0);
  const karar = modulEklenebilirMi(d, acik, ["c"]);
  assert.equal(karar.eklenebilir, false);
  assert.match("sebep" in karar ? karar.sebep : "", /hakkı doldu/);
  assert.equal(modulEklenebilirMi(d, acik, ["a"]).eklenebilir, true);
  assert.equal(modulEklenebilirMi(d, acik, ["yonetim_proje_yonetimi"]).eklenebilir, true);
});

test("hakkı aşmış eski şirket: açıklar kalır, kalan 0", () => {
  const acik = ["a", "b", "c", "d", "e"];
  const d = modulHakkiDurumu("starter", acik);
  assert.deepEqual([d.hak, d.kullanilan, d.kalan], [4, 5, 0]);
  assert.equal(modulEklenebilirMi(d, acik, ["f"]).eklenebilir, false);
});

test("Business sınırsız; bilinmeyen paket ücretsiz sayılır", () => {
  const d = modulHakkiDurumu("business", Array.from({ length: 30 }, (_, i) => `m${i}`));
  assert.equal(d.kalan, null);
  assert.equal(modulEklenebilirMi(d, [], ["x", "y", "z"]).eklenebilir, true);
  assert.equal(modulHakkiDurumu("bilinmeyen", []).hak, 2);
});
