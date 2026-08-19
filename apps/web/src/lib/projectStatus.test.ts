import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS, PROJECT_STATUS_STYLE } from "./projectStatus";

function srgbToLinear(channel: number): number {
  const v = channel / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => srgbToLinear(parseInt(hex.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

describe("proje durum rozetleri", () => {
  test("her durumun etiketi ve rengi var", () => {
    for (const status of PROJECT_STATUSES) {
      assert.ok(PROJECT_STATUS_LABELS[status], `${status} için etiket yok`);
      assert.ok(PROJECT_STATUS_STYLE[status], `${status} için renk yok`);
    }
    // Liste ile tablolar birbirinden kopmasın: biri güncellenip diğeri
    // unutulduğunda seçicide görünmeyen ya da rengi olmayan bir durum kalır.
    assert.equal(new Set(PROJECT_STATUSES).size, PROJECT_STATUSES.length);
    assert.equal(Object.keys(PROJECT_STATUS_STYLE).length, PROJECT_STATUSES.length);
    assert.equal(Object.keys(PROJECT_STATUS_LABELS).length, PROJECT_STATUSES.length);
  });

  test("yazı/zemin kontrastı WCAG AA eşiğini geçiyor", () => {
    for (const status of PROJECT_STATUSES) {
      const { bg, text } = PROJECT_STATUS_STYLE[status];
      const ratio = contrast(text, bg);
      assert.ok(ratio >= 4.5, `${status} rozeti ${ratio.toFixed(2)}:1 — 4.5:1 altında`);
    }
  });

  test("etiketler birbirinden ayırt edilebilir", () => {
    const labels = PROJECT_STATUSES.map((s) => PROJECT_STATUS_LABELS[s]);
    assert.equal(new Set(labels).size, labels.length);
  });
});
