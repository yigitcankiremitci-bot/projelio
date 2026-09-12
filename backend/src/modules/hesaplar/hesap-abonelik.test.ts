import { strict as assert } from "node:assert";
import { test } from "node:test";
import { abonelikKarari } from "./hesap-abonelik";

const temel = {
  isPaid: true,
  amount: 40,
  currency: "usd",
  billingInterval: "monthly" as const,
  nextDueDate: "2026-10-07",
  name: "Adobe Creative Cloud",
};

test("ücretli hesap ilk kez kaydedilince düzenli gider kurulur", () => {
  const k = abonelikKarari(temel);
  assert.equal(k.eylem, "olustur");
  assert.equal(k.satir?.type, "expense");
  assert.equal(k.satir?.amount, 40);
  // Para birimi büyük harfe çevriliyor: aynı birim iki kovaya dağılmasın.
  assert.equal(k.satir?.currency, "USD");
  assert.equal(k.satir?.interval, "monthly");
  assert.equal(k.satir?.next_due_date, "2026-10-07");
  assert.equal(k.satir?.anchor_day, 7);
  assert.equal(k.satir?.category, "Abonelik");
});

test("bağlı satır varsa güncellenir, ikincisi açılmaz", () => {
  const k = abonelikKarari({ ...temel, mevcutId: "abc" }, { vadeDegisti: true });
  assert.equal(k.eylem, "guncelle");
  assert.equal(k.satir?.next_due_date, "2026-10-07");
});

test("vade değişmediyse defterdeki takvime DOKUNULMAZ", () => {
  // Hesabın adını düzeltmek için yapılan bir kaydetme, cron'un ilerlettiği
  // vadeyi geriye çekip aynı ay ikinci kez gider yazdırırdı.
  const k = abonelikKarari({ ...temel, mevcutId: "abc" }, { vadeDegisti: false });
  assert.equal(k.eylem, "guncelle");
  assert.equal(k.satir?.next_due_date, undefined);
  assert.equal(k.satir?.anchor_day, undefined);
  // Tutar ve ritim yine güncelleniyor: onların geçmişe etkisi yok.
  assert.equal(k.satir?.amount, 40);
  assert.equal(k.satir?.interval, "monthly");
});

test("yeni kayıtta vade her zaman yazılır", () => {
  const k = abonelikKarari(temel, { vadeDegisti: false });
  assert.equal(k.eylem, "olustur");
  assert.equal(k.satir?.next_due_date, "2026-10-07");
});

test("plan adı açıklamaya giriyor", () => {
  const k = abonelikKarari({ ...temel, plan: "Team, 5 koltuk" });
  assert.equal(k.satir?.description, "Adobe Creative Cloud — Team, 5 koltuk");
});

test("abonelik işareti kaldırılınca satır pasifleşir, silinmez", () => {
  // Silinirse geçmiş ödemelerin bağı kopar; pasif satır ne gider üretir ne
  // geçmişi bozar.
  assert.equal(abonelikKarari({ ...temel, isPaid: false, mevcutId: "abc" }).eylem, "pasiflestir");
});

test("ücretsiz hesap kasaya hiç dokunmaz", () => {
  const k = abonelikKarari({ ...temel, isPaid: false });
  assert.equal(k.eylem, "yok");
  assert.equal(k.satir, undefined);
});

test("vade girilmezse bugünden başlar", () => {
  const bugun = new Date().toISOString().slice(0, 10);
  const k = abonelikKarari({ ...temel, nextDueDate: null });
  assert.equal(k.satir?.next_due_date, bugun);
});

test("tutarsız ücretli abonelik reddedilir", () => {
  assert.throws(() => abonelikKarari({ ...temel, amount: 0 }), /tutar/);
  assert.throws(() => abonelikKarari({ ...temel, amount: null }), /tutar/);
  assert.throws(() => abonelikKarari({ ...temel, billingInterval: null }), /aralığı/);
});
