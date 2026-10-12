import { strict as assert } from "node:assert";
import { test } from "node:test";
import { faturaVerisi, kayitKlasorAdi, siparisFaturaVerisi } from "./kasa-faturasi";

test("gelir bizim kestiğimiz, gider bize kesilen faturadır", () => {
  assert.equal(faturaVerisi({ type: "income" }).direction, "issued");
  assert.equal(faturaVerisi({ type: "expense" }).direction, "received");
  // Hakediş ödemesi de bir çıkış: faturayı karşı taraf keser.
  assert.equal(faturaVerisi({ type: "payout" }).direction, "received");
});

test("kasa satırının faturası ÖDENMİŞ sayılır", () => {
  // Satır gerçekleşmiş bir para hareketi; "bekliyor" yazmak ödenmemiş fatura
  // listesini hiç ödenmesi gerekmeyen kayıtlarla doldururdu.
  assert.equal(faturaVerisi({ type: "expense" }).status, "paid");
});

test("tutar, para birimi ve tarih satırdan kopyalanır", () => {
  const data = faturaVerisi({
    type: "expense",
    amount: "1250.50",
    currency: "USD",
    occurred_at: "2026-09-14T00:00:00.000Z",
  });
  assert.equal(data.amount, 1250.5);
  assert.equal(data.currency, "USD");
  assert.equal(data.issueDate, "2026-09-14");
});

test("para birimi boşsa ₺ (defter eskiden tek para birimliydi)", () => {
  assert.equal(faturaVerisi({ type: "expense", currency: null }).currency, "TRY");
});

test("karşı taraf ve açıklama yalnızca doluysa yazılır", () => {
  const bos = faturaVerisi({ type: "expense" });
  assert.equal("counterpartyName" in bos, false);
  assert.equal("notes" in bos, false);

  const dolu = faturaVerisi({ type: "expense", counterparty_id: "abc", description: "Kira" });
  assert.equal(dolu.counterpartyName, "abc");
  assert.equal(dolu.notes, "Kira");
});

test("klasör adı tarih + no + karşı taraf", () => {
  const ad = kayitKlasorAdi(
    { id: "11112222-3333", data: { invoiceNo: "2026-114", counterpartyName: "Acme Ltd.", issueDate: "2026-09-14" } },
    "2026-09"
  );
  assert.equal(ad, "2026-09-14 #2026-114 Acme Ltd.");
});

test("numarası olmayan faturalar birbirine karışmaz", () => {
  const a = kayitKlasorAdi({ id: "aaaaaaaa-1111", data: { issueDate: "2026-09-14" } }, "2026-09");
  const b = kayitKlasorAdi({ id: "bbbbbbbb-2222", data: { issueDate: "2026-09-14" } }, "2026-09");
  assert.notEqual(a, b);
});

test("klasör adı alt klasör AÇMAZ", () => {
  // Karşı tarafın adında bölü işareti olabiliyor ("Ali / Veli Ltd.").
  const ad = kayitKlasorAdi(
    { id: "cccccccc", data: { invoiceNo: "1/2026", counterpartyName: "Ali / Veli", issueDate: "2026-09-01" } },
    "2026-09"
  );
  assert.equal(ad.includes("/"), false);
  assert.equal(ad.includes("\\"), false);
});

test("tarihi bozuk kayıt varsayılana düşer, adsız kalmaz", () => {
  assert.ok(kayitKlasorAdi({ id: "dddddddd", data: { issueDate: "14.09.2026" } }, "2026-09").startsWith("2026-09 "));
});

const SIPARIS = {
  partyId: "p1",
  tutar: 1000,
  paraBirimi: "USD",
  siparisTarihi: "2026-09-14",
  siparisNo: "S-12",
  aciklama: "200 koli",
  tahsilatlar: [] as { tutar: number }[],
};

test("siparişin faturası kesilen faturadır; tutar, birim ve müşteri siparişten gelir", () => {
  const d = siparisFaturaVerisi(SIPARIS, { faturaNo: " F-7 " });
  assert.equal(d.direction, "issued");
  assert.equal(d.amount, 1000);
  assert.equal(d.currency, "USD");
  assert.equal(d.counterpartyName, "p1");
  assert.equal(d.invoiceNo, "F-7");
  assert.equal(d.notes, "Sipariş #S-12 · 200 koli");
});

test("sipariş faturasının tarihi verilmezse sipariş tarihidir (ay klasörü ona göre)", () => {
  assert.equal(siparisFaturaVerisi(SIPARIS, {}).issueDate, "2026-09-14");
  assert.equal(siparisFaturaVerisi(SIPARIS, { tarih: "2026-10-01" }).issueDate, "2026-10-01");
  assert.equal(siparisFaturaVerisi(SIPARIS, { tarih: "bozuk" }).issueDate, "2026-09-14");
});

test("sipariş faturasının durumu tahsilattan gelir", () => {
  assert.equal(siparisFaturaVerisi(SIPARIS, {}).status, "pending");
  assert.equal(siparisFaturaVerisi({ ...SIPARIS, tahsilatlar: [{ tutar: 400 }] }, {}).status, "pending");
  assert.equal(siparisFaturaVerisi({ ...SIPARIS, tahsilatlar: [{ tutar: 400 }, { tutar: 600 }] }, {}).status, "paid");
});
