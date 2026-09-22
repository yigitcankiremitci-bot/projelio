import { test } from "node:test";
import * as assert from "node:assert/strict";
import { sunucuZamanlariniIsaretle } from "./sunucuZamani";

test("eksiz an UTC olarak işaretlenir, iç içe nesnelerde de", () => {
  const yanit = sunucuZamanlariniIsaretle({
    createdAt: "2026-09-22T15:00:00.123456",
    gorevler: [{ completedAt: "2026-09-22T15:00:00" }, { completedAt: null }],
    sahip: { lastSeenAt: "2026-09-22T15:00" },
  });
  assert.equal(yanit.createdAt, "2026-09-22T15:00:00.123456Z");
  assert.equal(yanit.gorevler[0].completedAt, "2026-09-22T15:00:00Z");
  assert.equal(yanit.gorevler[1].completedAt, null);
  assert.equal(yanit.sahip.lastSeenAt, "2026-09-22T15:00Z");
  // Asıl amaç: düz new Date() artık doğru anı veriyor.
  assert.equal(new Date(yanit.gorevler[0].completedAt!).toISOString(), "2026-09-22T15:00:00.000Z");
});

test("zaten saat dilimi taşıyan değerlere dokunulmaz", () => {
  const yanit = sunucuZamanlariniIsaretle({
    a: "2026-09-22T15:00:00Z",
    b: "2026-09-22T18:00:00+03:00",
    c: "2026-09-22T18:00:00.5+0300",
  });
  assert.deepEqual(yanit, {
    a: "2026-09-22T15:00:00Z",
    b: "2026-09-22T18:00:00+03:00",
    c: "2026-09-22T18:00:00.5+0300",
  });
});

// Yaptım duvar saatiyle çalışıyor, son tarihler gün bazlı (UTC gece yarısı).
// UTC diye okunsalar Yaptım'da gün kayar, Amerika'da son tarih bir gün önceye düşer.
test("sabit saat alanları olduğu gibi kalır", () => {
  const yanit = sunucuZamanlariniIsaretle({
    doneAt: "2026-09-22T10:30:00",
    started_at: "2026-09-22T09:00:00",
    deadline: "2026-10-16T00:00:00",
    dueDate: "2026-09-28T10:30:00",
    effective_due_date: "2026-09-28T00:00:00",
  });
  assert.equal(yanit.doneAt, "2026-09-22T10:30:00");
  assert.equal(yanit.started_at, "2026-09-22T09:00:00");
  assert.equal(yanit.deadline, "2026-10-16T00:00:00");
  assert.equal(yanit.dueDate, "2026-09-28T10:30:00");
  assert.equal(yanit.effective_due_date, "2026-09-28T00:00:00");
});

test("zaman olmayan metinler ve yalnızca tarih değişmez", () => {
  const yanit = sunucuZamanlariniIsaretle({
    ad: "Kestrel",
    tarih: "2026-09-22",
    saat: "18:00",
    etiketler: ["2026-09-22T15:00:00"],
    data: { bitis: "2026-12-01" },
  });
  assert.equal(yanit.ad, "Kestrel");
  assert.equal(yanit.tarih, "2026-09-22");
  assert.equal(yanit.saat, "18:00");
  // Anahtarı olmayan dizi elemanı: hangi alan olduğu bilinmiyor, dokunulmaz.
  assert.deepEqual(yanit.etiketler, ["2026-09-22T15:00:00"]);
  assert.equal(yanit.data.bitis, "2026-12-01");
});

test("boş ve ilkel yanıtlar sorunsuz geçer", () => {
  assert.equal(sunucuZamanlariniIsaretle(undefined), undefined);
  assert.equal(sunucuZamanlariniIsaretle(null), null);
  assert.equal(sunucuZamanlariniIsaretle("2026-09-22T15:00:00"), "2026-09-22T15:00:00");
  assert.deepEqual(sunucuZamanlariniIsaretle([]), []);
});
