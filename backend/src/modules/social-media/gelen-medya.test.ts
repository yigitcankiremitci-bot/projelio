import { test } from "node:test";
import * as assert from "node:assert/strict";
import { belgeOlarakMi, GelenMedyaDeposu, MEDYA_ADET_TAVANI, MEDYA_OMRU_MS, medyaTuru } from "./gelen-medya";

const buf = (n: number) => Buffer.alloc(n);

test("medya sırayla çözülür, bilinmeyen kimlik eksik döner", () => {
  const d = new GelenMedyaDeposu();
  const a = d.ekle("u1", { ad: "a.jpg", mimeType: "image/jpeg", buffer: buf(10) });
  const b = d.ekle("u1", { ad: "b.jpg", mimeType: "image/jpeg", buffer: buf(10) });
  const r = d.coz("u1", [b.id, "yok", a.id]);
  assert.deepEqual(r.medya.map((m) => m.ad), ["b.jpg", "a.jpg"]);
  assert.deepEqual(r.eksik, ["yok"]);
});

test("başka kullanıcının medyası görünmez", () => {
  const d = new GelenMedyaDeposu();
  const a = d.ekle("u1", { ad: "a.mp4", mimeType: "video/mp4", buffer: buf(10) });
  assert.equal(d.coz("u2", [a.id]).medya.length, 0);
});

test("süresi dolan medya düşer", () => {
  let t = 1000;
  const d = new GelenMedyaDeposu(() => t);
  const a = d.ekle("u1", { ad: "a.mp4", mimeType: "video/mp4", buffer: buf(10) });
  t += MEDYA_OMRU_MS + 1;
  assert.equal(d.coz("u1", [a.id]).medya.length, 0);
});

test("adet tavanı aşılınca en eskiler düşer", () => {
  const d = new GelenMedyaDeposu();
  const ilk = d.ekle("u1", { ad: "0", mimeType: "image/png", buffer: buf(1) });
  for (let i = 0; i < MEDYA_ADET_TAVANI; i++) d.ekle("u1", { ad: String(i + 1), mimeType: "image/png", buffer: buf(1) });
  assert.equal(d.liste("u1").length, MEDYA_ADET_TAVANI);
  assert.equal(d.coz("u1", [ilk.id]).medya.length, 0);
});

test("taslak aynı turda planlanamaz", () => {
  const d = new GelenMedyaDeposu();
  d.taslakDokunuldu("u1", "p1");
  assert.equal(d.planlanabilir("u1", "p1"), false);
});

test("kullanıcı mesajından sonra planlanabilir", () => {
  const d = new GelenMedyaDeposu();
  d.taslakDokunuldu("u1", "p1");
  d.yeniTur("u1");
  assert.equal(d.planlanabilir("u1", "p1"), true);
});

test("onaydan sonra düzeltilen taslak yeniden gösterilmeden planlanamaz", () => {
  const d = new GelenMedyaDeposu();
  d.taslakDokunuldu("u1", "p1");
  d.yeniTur("u1"); // kullanıcı "etiketi değiştir" dedi
  d.taslakDokunuldu("u1", "p1"); // Lio düzeltti, aynı turda planlamaya kalkarsa…
  assert.equal(d.planlanabilir("u1", "p1"), false);
  d.yeniTur("u1"); // kullanıcı yeni halini onayladı
  assert.equal(d.planlanabilir("u1", "p1"), true);
});

test("planlanan taslak tekrar planlanamaz ve başka kullanıcı planlayamaz", () => {
  const d = new GelenMedyaDeposu();
  d.taslakDokunuldu("u1", "p1");
  d.yeniTur("u1");
  assert.equal(d.planlanabilir("u2", "p1"), false);
  d.planlandi("u1", "p1");
  assert.equal(d.planlanabilir("u1", "p1"), false);
});

test("medya türü", () => {
  assert.equal(medyaTuru("video/mp4"), "video");
  assert.equal(medyaTuru("image/jpeg"), "gorsel");
  assert.equal(medyaTuru("image/gif"), null);
  assert.equal(medyaTuru("application/pdf"), null);
});

test("dosya olarak gelen kopya, sıkıştırılmış kopyanın yerine geçer (tür ve sıraya göre)", () => {
  const d = new GelenMedyaDeposu();
  const s1 = d.ekle("u1", { ad: "1.jpg", mimeType: "image/jpeg", buffer: buf(1) });
  const s2 = d.ekle("u1", { ad: "2.jpg", mimeType: "image/jpeg", buffer: buf(1) });
  const v = d.ekle("u1", { ad: "v.mp4", mimeType: "video/mp4", buffer: buf(1) });
  const o1 = d.ekle("u1", { ad: "1.jpg", mimeType: "image/jpeg", buffer: buf(2), orijinal: true });
  assert.equal(o1.yerineGectigi?.id, s1.id);
  const o2 = d.ekle("u1", { ad: "2.jpg", mimeType: "image/jpeg", buffer: buf(2), orijinal: true });
  assert.equal(o2.yerineGectigi?.id, s2.id);
  // video kalır: farklı tür eşleşmez
  assert.deepEqual(d.liste("u1").map((m) => m.id), [v.id, o1.id, o2.id]);
});

test("eşleşecek sıkıştırılmış kopya yoksa dosya normal eklenir", () => {
  const d = new GelenMedyaDeposu();
  const o = d.ekle("u1", { ad: "v.mp4", mimeType: "video/mp4", buffer: buf(1), orijinal: true });
  assert.equal(o.yerineGectigi, undefined);
  assert.equal(d.liste("u1").length, 1);
});

test("belge tespiti", () => {
  assert.equal(belgeOlarakMi({ _data: { message: { documentMessage: {} } } }), true);
  assert.equal(belgeOlarakMi({ _data: { Message: { videoMessage: {} } } }, "x.mp4"), false);
  assert.equal(belgeOlarakMi({}, "klip.mp4"), true);
  assert.equal(belgeOlarakMi({}, null), false);
});

test("reddedilen dosya bir kez bildirilir, süresi dolunca düşer", () => {
  let t = 1000;
  const d = new GelenMedyaDeposu(() => t);
  d.reddet("u1", { ad: "büyük.mp4", boyut: 345_000_000, sebep: "cok-buyuk" });
  assert.equal(d.reddedilenleriAl("u1").length, 1);
  assert.equal(d.reddedilenleriAl("u1").length, 0);
  d.reddet("u1", { ad: "eski.mp4", sebep: "inmedi" });
  t += 31 * 60 * 1000;
  assert.equal(d.reddedilenleriAl("u1").length, 0);
});
