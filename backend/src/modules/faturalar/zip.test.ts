import { strict as assert } from "node:assert";
import { test } from "node:test";
import { crc32, zipOlustur } from "./zip";

test("CRC-32 standart denetim değerini üretir", () => {
  // IEEE 802.3'ün bilinen kontrol değeri: "123456789" → 0xCBF43926.
  assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
  assert.equal(crc32(Buffer.alloc(0)), 0);
});

test("arşiv imzaları ve sayaçları tutuyor", () => {
  const zip = zipOlustur([
    { ad: "a.txt", icerik: Buffer.from("merhaba"), tarih: new Date(2026, 8, 14, 10, 30, 0) },
    { ad: "b.txt", icerik: Buffer.from("dünya"), tarih: new Date(2026, 8, 14, 10, 30, 0) },
  ]);

  assert.equal(zip.readUInt32LE(0), 0x04034b50, "ilk yerel başlık");
  const eocd = zip.length - 22;
  assert.equal(zip.readUInt32LE(eocd), 0x06054b50, "EOCD arşivin sonunda");
  assert.equal(zip.readUInt16LE(eocd + 10), 2, "girdi sayısı");

  // Merkezî dizin, EOCD'nin gösterdiği yerde başlamalı; kaymışsa hiçbir
  // açıcı arşivi okuyamaz ve hata ancak muhasebecide fark edilirdi.
  const merkezOfseti = zip.readUInt32LE(eocd + 16);
  assert.equal(zip.readUInt32LE(merkezOfseti), 0x02014b50);
  assert.equal(zip.readUInt32LE(eocd + 12), eocd - merkezOfseti, "merkezî dizin boyu");
});

test("Türkçe adlar UTF-8 bayrağıyla yazılır", () => {
  const zip = zipOlustur([{ ad: "Eylül faturası.pdf", icerik: Buffer.from("x") }]);
  assert.equal(zip.readUInt16LE(6) & 0x0800, 0x0800);
  const adBoyu = zip.readUInt16LE(26);
  assert.equal(zip.subarray(30, 30 + adBoyu).toString("utf8"), "Eylül faturası.pdf");
});

test("aynı adlı ikinci belge üzerine YAZMAZ, numaralanır", () => {
  // Telefondan çekilen her fotoğraf "image.jpg" gelebiliyor; üzerine yazmak
  // sessizce belge kaybettirirdi.
  const zip = zipOlustur([
    { ad: "image.jpg", icerik: Buffer.from("bir") },
    { ad: "image.jpg", icerik: Buffer.from("iki") },
    { ad: "image.jpg", icerik: Buffer.from("uc") },
  ]);
  const adlar = zip.toString("latin1");
  assert.ok(adlar.includes("image (2).jpg"));
  assert.ok(adlar.includes("image (3).jpg"));
  assert.equal(zip.readUInt16LE(zip.length - 22 + 10), 3);
});

test("boş arşiv geçerli bir ZIP'tir", () => {
  const zip = zipOlustur([]);
  assert.equal(zip.length, 22);
  assert.equal(zip.readUInt32LE(0), 0x06054b50);
});
