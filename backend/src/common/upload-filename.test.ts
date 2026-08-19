import { strict as assert } from "node:assert";
import { test } from "node:test";
import { decodeUploadFileName } from "./upload-filename.util";

/** busboy'un yaptığı hatanın birebir taklidi: UTF-8 baytlarını latin1 okumak. */
const asBusboySees = (name: string) => Buffer.from(name, "utf8").toString("latin1");

const turkishNames = [
  "Özet Raporu.pdf",
  "Çalışma Şeması.docx",
  "ğüşiöçİĞÜŞÖÇ.xlsx",
  "Ödeme Planı 2026.xlsx",
];

test("latin1'e sıkışmış Türkçe adları onarır", () => {
  for (const name of turkishNames) {
    assert.equal(decodeUploadFileName(asBusboySees(name)), name);
  }
});

test("zaten doğru gelen adı bozmaz", () => {
  for (const name of turkishNames) {
    assert.equal(decodeUploadFileName(name), name);
  }
});

test("ASCII adlara dokunmaz", () => {
  assert.equal(decodeUploadFileName("Report 2026 (final).pdf"), "Report 2026 (final).pdf");
});

test("boş/eksik ad güvenli", () => {
  assert.equal(decodeUploadFileName(undefined), "");
  assert.equal(decodeUploadFileName(null), "");
  assert.equal(decodeUploadFileName(""), "");
});

test("çözülemeyen dizide orijinali korur", () => {
  // Geçerli bir UTF-8 dizisi oluşturmayan bayt çifti: onarım U+FFFD üretir,
  // bu durumda adı çöpe çevirmek yerine geldiği gibi bırakırız.
  const broken = "ÃÃÃ.pdf";
  assert.equal(decodeUploadFileName(broken), broken);
});
