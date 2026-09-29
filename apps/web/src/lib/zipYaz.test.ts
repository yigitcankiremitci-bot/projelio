import test from "node:test";
import assert from "node:assert/strict";
import { benzersizYollar, crc32, zipYaz } from "./zipYaz";

test("crc32 bilinen değeri verir", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

test("aynı yollar numaralanır, uzantı korunur", () => {
  assert.deepEqual(benzersizYollar(["a/foto.jpg", "a/foto.jpg", "a/Foto.jpg", "b"]), [
    "a/foto.jpg",
    "a/foto (2).jpg",
    "a/Foto (3).jpg",
    "b",
  ]);
});

test("zip imzaları ve girdi sayısı doğru", async () => {
  const blob = zipYaz([
    { yol: "k/a.txt", veri: new TextEncoder().encode("merhaba") },
    { yol: "k/ü.txt", veri: new Uint8Array(0) },
  ]);
  const b = new Uint8Array(await blob.arrayBuffer());
  const dv = new DataView(b.buffer);
  assert.equal(dv.getUint32(0, true), 0x04034b50);
  assert.equal(dv.getUint32(b.length - 22, true), 0x06054b50);
  assert.equal(dv.getUint16(b.length - 22 + 10, true), 2);
});
