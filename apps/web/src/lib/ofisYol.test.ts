import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { bosNokta, gorusVar, izgaraKur, yolBul } from "./ofisYol";

const ALAN = { x: 0, z: 0, w: 10, d: 10 };

describe("yolBul", () => {
  test("engel yoksa düz gider", () => {
    const iz = izgaraKur(ALAN, [], []);
    const yol = yolBul(iz, { x: 1, z: 5 }, { x: 9, z: 5 })!;
    assert.equal(yol.length, 2);
  });

  test("yol üstündeki eşyanın içinden geçmez, etrafından dolaşır", () => {
    const masa = { x: 4, z: 3, w: 2, d: 4 };
    const iz = izgaraKur(ALAN, [], [masa]);
    const yol = yolBul(iz, { x: 1, z: 5 }, { x: 9, z: 5 })!;
    assert.ok(yol.length > 2);
    for (let i = 0; i < yol.length - 1; i++) assert.ok(gorusVar(iz, yol[i], yol[i + 1]));
  });

  test("duvarı kapıdan geçer, kapı yoksa yol yok", () => {
    const duvar = { x1: 5, z1: 0, x2: 5, z2: 10, tur: "kalin" as const };
    const kapisiz = izgaraKur(ALAN, [duvar], []);
    assert.equal(yolBul(kapisiz, { x: 2, z: 5 }, { x: 8, z: 5 }), null);
    const kapili = izgaraKur(ALAN, [{ ...duvar, kapi: { orta: 8, genislik: 1.3 } }], []);
    const yol = yolBul(kapili, { x: 2, z: 2 }, { x: 8, z: 2 })!;
    assert.ok(yol.some((p) => p.z > 7), "kapıya (z≈8) uğramalı");
  });

  test("başlangıç eşyanın içindeyse en yakın boş yerden çıkar", () => {
    const masa = { x: 2, z: 2, w: 2, d: 2 };
    const iz = izgaraKur(ALAN, [], [masa]);
    const yol = yolBul(iz, { x: 3, z: 3 }, { x: 8, z: 8 });
    assert.ok(yol);
  });

  test("masa duvara dayalıysa koltuktan yine çıkar, duvarın öbür yanına geçmez", () => {
    // Kuzey dış duvarı z=0; masa duvara 0,27 m kalacak kadar yakın: koltuk ile
    // duvar arası kişiye dar. Önceden başlangıç duvarın dışına oturtuluyor, yol bulunamıyordu.
    const alan = { x: -1, z: -1, w: 12, d: 12 };
    const duvar = { x1: 0, z1: 0, x2: 10, z2: 0, tur: "kalin" as const };
    const masa = { x: 2, z: 0.35, w: 2, d: 1.2 };
    const iz = izgaraKur(alan, [duvar], [masa], { duvarKalinlik: 0.16 });
    const yol = yolBul(iz, { x: 3, z: 0.45 }, { x: 8, z: 8 });
    assert.ok(yol, "yol bulunmalı");
    for (const p of yol) assert.ok(p.z > 0.08, `nokta duvarın içinde ya da dışında: ${p.z}`);
  });

  test("boş yol varsa eşyanın içinden kestirmez", () => {
    const masa = { x: 4, z: 3, w: 2, d: 4 };
    const iz = izgaraKur(ALAN, [], [masa]);
    const yol = yolBul(iz, { x: 1, z: 5 }, { x: 9, z: 5 })!;
    for (let i = 0; i < yol.length - 1; i++) assert.ok(gorusVar(iz, yol[i], yol[i + 1]));
  });
});

describe("bosNokta", () => {
  test("eşyanın içine tıklanınca yanındaki boş hücreyi verir", () => {
    const masa = { x: 4, z: 4, w: 2, d: 2 };
    const iz = izgaraKur(ALAN, [], [masa]);
    const p = bosNokta(iz, { x: 4.3, z: 5 })!;
    assert.ok(p.x < 4 - 0.18, `masanın batısında olmalı: ${p.x}`);
  });
});
