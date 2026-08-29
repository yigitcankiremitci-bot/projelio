import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createScrollLock } from "./scrollLock";

function fakeTarget(overflow = "") {
  return { style: { overflow } };
}

describe("kaydırma kilidi", () => {
  test("tek kilit: alınır ve bırakılınca eski değer geri gelir", () => {
    const target = fakeTarget("scroll");
    const lock = createScrollLock(() => target);

    const release = lock.acquire();
    assert.equal(target.style.overflow, "hidden");
    release();
    assert.equal(target.style.overflow, "scroll");
  });

  test("iç içe iki kilit AYNI sırada bırakılsa da sayfa kilitli kalmaz", () => {
    // Ayıklanan hata tam olarak buydu: görev modalı + içindeki silme onayı
    // birlikte kapanıyor, React temizliği üstten alta çalıştırıyor ve içteki
    // modal "hidden"ı geri koyup sayfayı kilitli bırakıyordu.
    const target = fakeTarget();
    const lock = createScrollLock(() => target);

    const disModal = lock.acquire();
    const icModal = lock.acquire();
    assert.equal(target.style.overflow, "hidden");

    disModal();
    // Hâlâ bir kilit açık: sayfa kilitli KALMALI.
    assert.equal(target.style.overflow, "hidden");

    icModal();
    assert.equal(target.style.overflow, "", "son kilit bırakıldı, sayfa açılmalıydı");
    assert.equal(lock.depth, 0);
  });

  test("ters sırada bırakma da aynı sonucu verir", () => {
    const target = fakeTarget();
    const lock = createScrollLock(() => target);

    const ilk = lock.acquire();
    const ikinci = lock.acquire();
    ikinci();
    ilk();
    assert.equal(target.style.overflow, "");
  });

  test("aynı kilidi iki kez bırakmak sayacı bozmaz", () => {
    // StrictMode geliştirmede etkileri iki kez çalıştırıyor; sayaç eksiye
    // düşerse bir sonraki modal sayfayı kalıcı kilitler.
    const target = fakeTarget();
    const lock = createScrollLock(() => target);

    const release = lock.acquire();
    release();
    release();
    assert.equal(lock.depth, 0);

    const tekrar = lock.acquire();
    assert.equal(target.style.overflow, "hidden");
    tekrar();
    assert.equal(target.style.overflow, "");
  });
});
