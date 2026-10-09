import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import * as qrcodeModulu from "qrcode-generator";
import { piksellerdenQr } from "./qr-coz";
import { kartvizitMetniCoz } from "./vcard";

// ffmpeg yerelde yok; görseli piksele açan kısım canlı imajda çalışıyor. Burada
// sınanan, çözücünün gerçek bir kartvizit QR'ını (MECARD, Türkçe karakterli)
// geri okuyabildiği ve sonucun kişiye dönüştüğü.

const qrcode: any = (qrcodeModulu as any).default ?? qrcodeModulu;

function qrPikselleri(metin: string, modul = 6, bosluk = 4): { veri: Uint8ClampedArray; w: number; h: number } {
  // Telefonların yaptığı gibi metin UTF-8 BAYT olarak yazılır. Kütüphanenin
  // varsayılanı her karakteri tek bayta kırpıyor ("ı" → "1"); bayt dizisi
  // her karakteri bir bayt olan bir metin olarak veriliyor.
  const qr = qrcode(0, "M");
  qr.addData(Buffer.from(metin, "utf8").toString("latin1"));
  qr.make();
  const n = qr.getModuleCount();
  const w = (n + bosluk * 2) * modul;
  const veri = new Uint8ClampedArray(w * w * 4).fill(255);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if (!qr.isDark(y, x)) continue;
      for (let dy = 0; dy < modul; dy++)
        for (let dx = 0; dx < modul; dx++) {
          const i = (((y + bosluk) * modul + dy) * w + (x + bosluk) * modul + dx) * 4;
          veri[i] = veri[i + 1] = veri[i + 2] = 0;
        }
    }
  return { veri, w, h: w };
}

describe("piksellerdenQr", () => {
  test("Türkçe karakterli MECARD QR'ı çözülür ve kişiye dönüşür", () => {
    const metin = "MECARD:N:Yılmaz,Ayşe;ORG:Çiçek Ajans;TEL:+905321112233;EMAIL:ayse@cicek.com;;";
    const { veri, w, h } = qrPikselleri(metin);
    const cozulen = piksellerdenQr(veri, w, h);
    assert.equal(cozulen, metin);
    assert.equal(kartvizitMetniCoz(cozulen!)[0].kurum, "Çiçek Ajans");
  });

  test("QR olmayan görsel null", () => {
    const w = 120;
    assert.equal(piksellerdenQr(new Uint8ClampedArray(w * w * 4).fill(255), w, w), null);
  });
});
