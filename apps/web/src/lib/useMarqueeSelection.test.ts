import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { marqueeHits, type Box } from "./useMarqueeSelection";

/** 150x100'lük kutulardan iki sütunlu bir ızgara. */
function kutu(left: number, top: number): Box {
  return { left, right: left + 150, top, bottom: top + 100 };
}

const ogeler = [
  { key: "file:a", box: kutu(0, 0) },
  { key: "file:b", box: kutu(160, 0) },
  { key: "file:c", box: kutu(0, 110) },
  { key: "file:d", box: kutu(160, 110) },
];

describe("marqueeHits", () => {
  it("dikdörtgenin DEĞDİĞİ öğeler seçilir, tamamen kapsaması gerekmez", () => {
    // Sol sütunun üstünden yalnızca 10 piksel geçiyor.
    assert.deepEqual(marqueeHits({ left: 10, top: 90, width: 20, height: 30 }, ogeler), [
      "file:a",
      "file:c",
    ]);
  });

  it("bütün ızgarayı kapsayan kement hepsini seçer", () => {
    assert.deepEqual(marqueeHits({ left: 0, top: 0, width: 400, height: 400 }, ogeler).length, 4);
  });

  it("boşluğa çizilen kement hiçbir şey seçmez", () => {
    // İki satırın arasındaki 10 piksellik aralık.
    assert.deepEqual(marqueeHits({ left: 0, top: 101, width: 400, height: 8 }, ogeler), []);
  });

  it("kenara teğet geçmek seçmez", () => {
    // Sıfır genişlikli sürükleme: eşiği dikeyde geçmiş olsa bile yatayda
    // dokunmadığı sütunu seçmemeli.
    assert.deepEqual(marqueeHits({ left: 155, top: 0, width: 0, height: 300 }, ogeler), []);
  });

  it("iki sütunu birden tarayan yatay hareket dört öğeyi de alır", () => {
    assert.deepEqual(marqueeHits({ left: 100, top: 40, width: 100, height: 120 }, ogeler), [
      "file:a",
      "file:b",
      "file:c",
      "file:d",
    ]);
  });

  it("öğe yoksa boş döner", () => {
    assert.deepEqual(marqueeHits({ left: 0, top: 0, width: 10, height: 10 }, []), []);
  });
});
