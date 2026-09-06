import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { detectBrowser } from "./popupSettings";

// Chromium türevleri user-agent'ta kendilerini Chrome olarak da tanıtıyor.
// Buradaki sıra kayarsa kullanıcıya var olmayan bir ayar sayfası tarif edilir
// (Edge'de chrome://settings açılmaz), yani hata sessiz değil ama kullanıcının
// karşısında oluyor.

const CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const EDGE = `${CHROME} Edg/140.0.0.0`;
const OPERA = `${CHROME} OPR/120.0.0.0`;
const SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const FIREFOX = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:131.0) Gecko/20100101 Firefox/131.0";
const IOS_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.0.0 Mobile/15E148 Safari/604.1";

describe("tarayıcı algılama", () => {
  test("Chrome kendi ayar sayfasını gösterir", () => {
    const hint = detectBrowser(CHROME);
    assert.equal(hint.key, "chrome");
    assert.equal(hint.settingsUrl, "chrome://settings/content/popups");
  });

  test("Edge Chrome sanılmaz", () => {
    const hint = detectBrowser(EDGE);
    assert.equal(hint.key, "edge");
    assert.equal(hint.settingsUrl, "edge://settings/content/popups");
  });

  test("Opera Chrome sanılmaz", () => {
    assert.equal(detectBrowser(OPERA).key, "opera");
  });

  test("Brave user-agent'ta iz bırakmadığı için ayrı bayrakla anlaşılır", () => {
    const hint = detectBrowser(CHROME, true);
    assert.equal(hint.key, "brave");
    assert.equal(hint.settingsUrl, "brave://settings/content/popups");
  });

  test("Safari'nin ayar adresi yok — menüden gidiliyor", () => {
    const hint = detectBrowser(SAFARI);
    assert.equal(hint.key, "safari");
    assert.equal(hint.settingsUrl, undefined);
  });

  test("Firefox tercihler sayfasına yönlendirir", () => {
    assert.equal(detectBrowser(FIREFOX).settingsUrl, "about:preferences#privacy");
  });

  test("iOS'taki Chrome (CriOS) Safari sanılmaz", () => {
    assert.equal(detectBrowser(IOS_CHROME).key, "chrome");
  });

  test("tanınmayan tarayıcı adressiz kalır, kod patlamaz", () => {
    const hint = detectBrowser("bilinmeyen tarayıcı");
    assert.equal(hint.key, "other");
    assert.equal(hint.settingsUrl, undefined);
  });
});
