// Backend tsconfig'inde esModuleInterop kapalı (NestJS CommonJS derlemesi
// gereği), bu yüzden namespace import kullanılıyor.
import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import { previewableMime } from "./onizleme-turleri";

/**
 * Önizleme kararı BURADAN veriliyor: `thumbnail_link` kolonu yükleme anında
 * neredeyse hiç dolmadığı için (Google asenkron üretiyor, OneDrive içerik
 * PUT'unda vermiyor) tür listesi daralırsa önizleme sessizce kaybolur —
 * canlıda tam olarak bu yaşandı, 158 dosyanın hiçbirinde önizleme yoktu.
 */
describe("previewableMime", () => {
  it("görsel, video ve PDF önizlenir", () => {
    for (const mime of ["image/png", "image/jpeg", "image/svg+xml", "video/mp4", "application/pdf"]) {
      assert.equal(previewableMime(mime), true, mime);
    }
  });

  it("Google ve Office belgeleri önizlenir", () => {
    assert.equal(previewableMime("application/vnd.google-apps.document"), true);
    assert.equal(previewableMime("application/vnd.google-apps.spreadsheet"), true);
    assert.equal(
      previewableMime("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
      true
    );
  });

  it("klasör önizlenmez — listede dosya gibi görünmemeli", () => {
    assert.equal(previewableMime("application/vnd.google-apps.folder"), false);
  });

  it("düz metin, ses ve bilinmeyen türler tür ikonuna düşer", () => {
    for (const mime of ["text/plain", "text/csv", "audio/mpeg", "application/zip", "font/ttf"]) {
      assert.equal(previewableMime(mime), false, mime);
    }
  });

  it("tür yoksa önizleme istenmez", () => {
    assert.equal(previewableMime(undefined), false);
    assert.equal(previewableMime(null), false);
    assert.equal(previewableMime(""), false);
  });
});
