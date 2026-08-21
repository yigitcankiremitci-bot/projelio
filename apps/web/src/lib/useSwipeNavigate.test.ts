import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { decideAxis, releaseStep } from "./useSwipeNavigate";

// Kaydırma kararlarının saf mantığı. Ayıklanan hata: dikey/köşegen kaydırırken
// dönemin de değişmesi — parmakla listeyi kaydıran kullanıcı istemeden hafta
// atlıyordu.

describe("decideAxis — yön kararı", () => {
  test("ilk birkaç piksel kararsız kalır", () => {
    assert.equal(decideAxis(4, 3), "unknown");
  });

  test("belirgin yatay hareket yatay sayılır", () => {
    assert.equal(decideAxis(40, 5), "x");
  });

  test("dikey kaydırma yatay sayılmaz", () => {
    assert.equal(decideAxis(12, 40), "y");
  });

  test("köşegen hareket dikey sayılır — dönem yanlışlıkla değişmesin", () => {
    assert.equal(decideAxis(30, 28), "y");
  });
});

describe("releaseStep — bırakma anı", () => {
  test("kısa sürükleme dönemi değiştirmez", () => {
    assert.equal(releaseStep(-40), 0);
    assert.equal(releaseStep(40), 0);
  });

  test("sola sürükleme ileri gider", () => {
    assert.equal(releaseStep(-90), 1);
  });

  test("sağa sürükleme geri gider", () => {
    assert.equal(releaseStep(90), -1);
  });
});
