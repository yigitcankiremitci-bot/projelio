import { strict as assert } from "node:assert";
import { test } from "node:test";
import { FaturaOkunamadi, faturaCevabiniCoz, GUVEN_ESIGI } from "./fatura-okuma";

const TAM = {
  direction: "received",
  amount: 1250.5,
  currency: "TRY",
  issueDate: "2026-09-14",
  invoiceNo: "2026-114",
  counterpartyName: "Acme Ltd.",
  category: "Yazılım",
  description: "Yıllık lisans",
  confidence: 0.95,
};

test("düz JSON okunur", () => {
  const f = faturaCevabiniCoz(JSON.stringify(TAM));
  assert.equal(f.amount, 1250.5);
  assert.equal(f.direction, "received");
  assert.equal(f.invoiceNo, "2026-114");
});

test("kod bloğuna ya da cümleye sarılmış JSON da okunur", () => {
  // İstem bunu yasaklıyor ama yasak bir garanti değil; her seferinde işi
  // düşürmek yerine ayıklamayı deniyoruz.
  const f = faturaCevabiniCoz("İşte fatura bilgileri:\n```json\n" + JSON.stringify(TAM) + "\n```\nKolay gelsin.");
  assert.equal(f.amount, 1250.5);
});

test("düşük güvende kayıt AÇILMAZ", () => {
  const dusuk = { ...TAM, confidence: GUVEN_ESIGI - 0.01 };
  assert.throws(() => faturaCevabiniCoz(JSON.stringify(dusuk)), FaturaOkunamadi);
  // Fatura olmayan belge: model 0 döndürüyor.
  assert.throws(() => faturaCevabiniCoz(JSON.stringify({ ...TAM, confidence: 0 })), FaturaOkunamadi);
});

test("güven alanı hiç yoksa da açılmaz", () => {
  const { confidence, ...eksik } = TAM;
  void confidence;
  assert.throws(() => faturaCevabiniCoz(JSON.stringify(eksik)), FaturaOkunamadi);
});

test("tutar okunamadıysa sessiz varsayılan YOK", () => {
  for (const amount of [0, -5, "", "abc", null, undefined]) {
    assert.throws(() => faturaCevabiniCoz(JSON.stringify({ ...TAM, amount })), FaturaOkunamadi);
  }
});

test("tutar hem Türkçe hem İngilizce biçimden okunur", () => {
  assert.equal(faturaCevabiniCoz(JSON.stringify({ ...TAM, amount: "1.234,56" })).amount, 1234.56);
  assert.equal(faturaCevabiniCoz(JSON.stringify({ ...TAM, amount: "1,234.56" })).amount, 1234.56);
  assert.equal(faturaCevabiniCoz(JSON.stringify({ ...TAM, amount: "1234.56 TL" })).amount, 1234.56);
  // Tek ayıraç + tam üç basamak = binlik. "2.500 TL"yi 2,50 TL yazmak,
  // sessizce üç basamak kaybetmek olurdu.
  assert.equal(faturaCevabiniCoz(JSON.stringify({ ...TAM, amount: "2.500" })).amount, 2500);
  assert.equal(faturaCevabiniCoz(JSON.stringify({ ...TAM, amount: "2,500" })).amount, 2500);
  assert.equal(faturaCevabiniCoz(JSON.stringify({ ...TAM, amount: "1.50" })).amount, 1.5);
  assert.equal(faturaCevabiniCoz(JSON.stringify({ ...TAM, amount: "0,75" })).amount, 0.75);
});

test("tarih ISO değilse reddedilir — bugüne düşmez", () => {
  // Bugüne düşseydi belge yanlış ayın arşivine girer ve kimse fark etmezdi.
  for (const issueDate of ["14.09.2026", "2026-9-4", "", "yarın", undefined]) {
    assert.throws(() => faturaCevabiniCoz(JSON.stringify({ ...TAM, issueDate })), FaturaOkunamadi);
  }
  assert.throws(() => faturaCevabiniCoz(JSON.stringify({ ...TAM, issueDate: "2026-13-40" })), FaturaOkunamadi);
});

test("para birimi simgesi koda çevrilir, bilinmeyen ₺ sayılır", () => {
  assert.equal(faturaCevabiniCoz(JSON.stringify({ ...TAM, currency: "₺" })).currency, "TRY");
  assert.equal(faturaCevabiniCoz(JSON.stringify({ ...TAM, currency: "$" })).currency, "USD");
  assert.equal(faturaCevabiniCoz(JSON.stringify({ ...TAM, currency: "eur" })).currency, "EUR");
  assert.equal(faturaCevabiniCoz(JSON.stringify({ ...TAM, currency: "dolar" })).currency, "TRY");
  assert.equal(faturaCevabiniCoz(JSON.stringify({ ...TAM, currency: undefined })).currency, "TRY");
});

test("tanınmayan yön ALINAN sayılır", () => {
  // Yön yanlışsa gider kasada gelir gibi görünür ve hata toplamlarda gizlenir.
  assert.equal(faturaCevabiniCoz(JSON.stringify({ ...TAM, direction: "belirsiz" })).direction, "received");
  assert.equal(faturaCevabiniCoz(JSON.stringify({ ...TAM, direction: "issued" })).direction, "issued");
});

test("boş metin alanları yazılmaz", () => {
  const f = faturaCevabiniCoz(JSON.stringify({ ...TAM, invoiceNo: "   ", counterpartyName: "" }));
  assert.equal(f.invoiceNo, undefined);
  assert.equal(f.counterpartyName, undefined);
});

test("JSON hiç yoksa anlaşılır hata", () => {
  assert.throws(() => faturaCevabiniCoz("Bu belgeyi okuyamadım."), FaturaOkunamadi);
  assert.throws(() => faturaCevabiniCoz(""), FaturaOkunamadi);
});
