// Backend tsconfig'inde esModuleInterop kapalı; komşu testlerle aynı biçim.
import * as assert from "node:assert/strict";
import { test } from "node:test";
import { tumSayfalar } from "./liste-tavani";

// Sahte satır kaynağı: `toplam` kadar satırı sayfa sayfa dağıtır.
function kaynak(toplam: number, sayac?: { istek: number }) {
  return (bas: number, bit: number) => {
    if (sayac) sayac.istek += 1;
    const satirlar = [];
    for (let i = bas; i <= bit && i < toplam; i++) satirlar.push({ i });
    return Promise.resolve({ data: satirlar, error: null });
  };
}

test("tumSayfalar — sayfaları birleştirir", async (t) => {
  await t.test("tek sayfaya sığan liste tek istekte gelir", async () => {
    const sayac = { istek: 0 };
    const sonuc = await tumSayfalar(kaynak(3, sayac), 1000, 10);
    assert.equal(sonuc.length, 3);
    assert.equal(sayac.istek, 1);
  });

  // Asıl hata buydu: 541 görevli projede 500'lük tek sorgu 41 satırı düşürüyordu.
  await t.test("sayfa boyunu aşan liste eksiksiz gelir", async () => {
    const sonuc = await tumSayfalar<{ i: number }>(kaynak(541), 20_000, 500);
    assert.equal(sonuc.length, 541);
    assert.equal(sonuc[540].i, 540);
  });

  await t.test("tam dolu son sayfadan sonra bir kez daha bakılır", async () => {
    const sayac = { istek: 0 };
    const sonuc = await tumSayfalar(kaynak(20, sayac), 1000, 10);
    assert.equal(sonuc.length, 20);
    assert.equal(sayac.istek, 3);
  });

  await t.test("tavan kaçak sorguyu durdurur", async () => {
    const sonuc = await tumSayfalar(kaynak(10_000), 30, 10);
    assert.equal(sonuc.length, 30);
  });

  await t.test("hata olduğu gibi fırlatılır", async () => {
    await assert.rejects(
      () => tumSayfalar(() => Promise.resolve({ data: null, error: new Error("koptu") })),
      /koptu/
    );
  });
});
