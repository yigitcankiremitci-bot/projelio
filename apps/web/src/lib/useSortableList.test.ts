import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { sortableFilter } from "./useSortableList";

// Bu test CSS eşleşmesini değil KURAL SIRASINI sabitler — hata tam olarak orada
// çıkıyor. Ayıklanan iki hata: (1) düz "a" seçicisi yüzünden proje kartları hiç
// sürüklenemiyordu (kartın tamamı bir Link), (2) kart istisnası düğmelerden ÖNCE
// denenirse kartın içindeki durum rozetine basılı tutmak kartı sürüklemeye
// başlatır ve rozet açılamaz olur.
//
// `closest` gerçek DOM yerine "basılan öğe şu seçicilerin içinde" listesiyle
// taklit ediliyor; testin ölçtüğü şey kuralların hangi sırayla uygulandığı.
function press(...insideOf: string[]): Event {
  const target = {
    closest(selector: string) {
      const parts = selector.split(",").map((p) => p.trim());
      return parts.some((p) => insideOf.includes(p)) ? ({} as HTMLElement) : null;
    },
  };
  return { target } as unknown as Event;
}

describe("sortableFilter — sürükleme nerede başlar", () => {
  test("kartın boş bir yerine basmak sürüklemeyi başlatır", () => {
    assert.equal(sortableFilter(press()), false);
  });

  test("kartın tamamı bir bağlantı olsa da sürüklenebilir", () => {
    assert.equal(sortableFilter(press("a", "a[draggable='false']")), false);
    assert.equal(sortableFilter(press("a", ".entity-card")), false);
  });

  test("satır içi normal bağlantı sürükleme başlatmaz", () => {
    assert.equal(sortableFilter(press("a")), true);
  });

  test("karttaki düğme kart istisnasını YENER — rozet/kapak düğmesi çalışmalı", () => {
    assert.equal(sortableFilter(press("button", "a[draggable='false']", ".entity-card")), true);
  });

  test("metin alanında sürükleme değil metin seçimi olur", () => {
    assert.equal(sortableFilter(press("textarea")), true);
    assert.equal(sortableFilter(press("[contenteditable='true']")), true);
  });

  test(".no-drag her şeyi yener", () => {
    assert.equal(sortableFilter(press(".no-drag", ".entity-card")), true);
  });

  test("hedefi olmayan olay sürüklemeyi engellemez", () => {
    assert.equal(sortableFilter({ target: null } as unknown as Event), false);
  });
});
