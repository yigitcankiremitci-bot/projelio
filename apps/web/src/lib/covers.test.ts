import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  COVER_PRESETS,
  COVER_TEXT_PRIMARY,
  COVER_TEXT_SECONDARY,
  COVER_VEIL_MIN_ALPHA,
  DEFAULT_COVER,
  coverBackground,
  coverPresetValue,
  findCoverPreset,
  isCoverPreset,
  presetForSeed,
} from "./covers";

// Ayıklanan hata: kapağı olmayan iş/şirket sayfalarında arka plan koyu, yazı da
// koyuydu — yazılar görünmüyordu. Aşağıdaki testler "hangi kapak seçilirse
// seçilsin yazı okunur" kuralını sabitler; yeni bir kapak eklendiğinde kontrast
// düşerse test kırılır.

function srgbToLinear(channel: number): number {
  const v = channel / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Beyaz perdenin verilen alfa ile bir rengin üstüne binmiş hali. */
function underVeil(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const mixed = [0, 2, 4]
    .map((i) => Math.round(alpha * 255 + (1 - alpha) * parseInt(h.slice(i, i + 2), 16)))
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
  return `#${mixed}`;
}

describe("kapak perdesi — yazı her kapakta okunur kalmalı", () => {
  for (const preset of [...COVER_PRESETS, DEFAULT_COVER]) {
    test(`${preset.name}: ikincil yazı WCAG AA (4.5:1) eşiğini geçer`, () => {
      // En kötü durum: kapağın en koyu rengi + yazı bandındaki en ince perde.
      const bg = underVeil(preset.darkest, COVER_VEIL_MIN_ALPHA);
      const ratio = contrast(COVER_TEXT_SECONDARY, bg);
      assert.ok(ratio >= 4.5, `${preset.name} kontrastı ${ratio.toFixed(2)}:1 — 4.5 altında`);
    });

    test(`${preset.name}: başlık yazısı da rahat okunur`, () => {
      const bg = underVeil(preset.darkest, COVER_VEIL_MIN_ALPHA);
      assert.ok(contrast(COVER_TEXT_PRIMARY, bg) >= 7);
    });
  }
});

describe("coverBackground — üç durum tek yerden", () => {
  test("hazır kapak seçiliyse o kapağın gradyanı döner", () => {
    const preset = COVER_PRESETS[0];
    assert.equal(coverBackground(coverPresetValue(preset.key)), preset.background);
  });

  test("yüklenmiş fotoğrafta url'e sarılır", () => {
    assert.equal(
      coverBackground("https://cdn.example.com/a.jpg"),
      "center/cover no-repeat url(https://cdn.example.com/a.jpg)"
    );
  });

  test("kapak yoksa varsayılan açık gradyan döner (koyu lacivert DEĞİL)", () => {
    assert.equal(coverBackground(undefined), DEFAULT_COVER.background);
    assert.equal(coverBackground(""), DEFAULT_COVER.background);
  });

  test("silinmiş bir preset anahtarı kırık arka plan bırakmaz", () => {
    assert.equal(coverBackground("preset:artik-yok"), DEFAULT_COVER.background);
  });
});

describe("türetilmiş kapak — kapağı olmayan kayıtlar", () => {
  test("aynı kimlik her zaman aynı kapağı verir", () => {
    // Asıl kural bu: her çizimde rastgele seçilseydi kapak sayfa yenilendikçe
    // değişir, kullanıcı bir kaydı renginden tanıyamazdı.
    const id = "8f2c1b40-0000-4000-8000-000000000001";
    assert.equal(presetForSeed(id).key, presetForSeed(id).key);
    assert.equal(coverBackground(undefined, id), presetForSeed(id).background);
  });

  test("her hazır kapak seçilebiliyor — hiçbiri ulaşılmaz kalmıyor", () => {
    // 200 kimlik 12 kapağa dağıldığında hepsi kullanılıyor. Bu test kırılırsa iki
    // ihtimal var: karma bozulmuş (kapaklar birkaç kovaya yığılıyor) ya da yeni
    // eklenen bir kapak bu örneklemde hiç seçilmiyor — ikisi de bakılmalı.
    const keys = new Set(Array.from({ length: 200 }, (_, i) => presetForSeed(`kayit-${i}`).key));
    assert.equal(keys.size, COVER_PRESETS.length);
  });

  test("kullanıcının seçtiği kapak tohumu ezer", () => {
    const id = "8f2c1b40-0000-4000-8000-000000000002";
    assert.equal(coverBackground("preset:bronz", id), findCoverPreset("preset:bronz")!.background);
    assert.equal(
      coverBackground("https://cdn.example.com/a.jpg", id),
      "center/cover no-repeat url(https://cdn.example.com/a.jpg)"
    );
  });

  test("tohum verilmezse eski davranış korunur", () => {
    assert.equal(coverBackground(undefined), DEFAULT_COVER.background);
  });
});

describe("preset anahtarları", () => {
  test("isCoverPreset yalnızca preset: ile başlayanları tanır", () => {
    assert.equal(isCoverPreset("preset:bronz"), true);
    assert.equal(isCoverPreset("https://x/y.jpg"), false);
    assert.equal(isCoverPreset(undefined), false);
  });

  test("findCoverPreset anahtarı çözer", () => {
    assert.equal(findCoverPreset("preset:bronz")?.name, "Bronz");
    assert.equal(findCoverPreset("preset:yok"), undefined);
  });

  test("anahtarlar benzersiz", () => {
    const keys = COVER_PRESETS.map((p) => p.key);
    assert.equal(new Set(keys).size, keys.length);
  });
});
