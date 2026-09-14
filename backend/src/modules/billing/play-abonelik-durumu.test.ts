import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { playAbonelikDurumu } from "./play-abonelik-durumu";

const SIMDI = new Date("2026-09-15T12:00:00Z");
const ILERIDE = new Date("2026-10-01T00:00:00Z");
const GECMISTE = new Date("2026-09-01T00:00:00Z");

describe("playAbonelikDurumu", () => {
  it("etkin abonelik hak verir", () => {
    assert.equal(playAbonelikDurumu({ state: "SUBSCRIPTION_STATE_ACTIVE" }, SIMDI), "active");
  });

  it("ödeme alınamadıysa erişim sürüyor", () => {
    // past_due bilerek hak veriyor: tek başarısız çekim yüzünden erişimi
    // kesmek geri kazanılamayan bir müşteri kaybı (bkz. CLAUDE.md).
    assert.equal(playAbonelikDurumu({ state: "SUBSCRIPTION_STATE_IN_GRACE_PERIOD" }, SIMDI), "past_due");
  });

  it("iptal edilmiş ama dönemi bitmemiş abonelik erişimi korur", () => {
    // Kullanıcı parasını ödediği dönemi sonuna kadar kullanabilmeli.
    assert.equal(
      playAbonelikDurumu({ state: "SUBSCRIPTION_STATE_CANCELED", expiryTime: ILERIDE }, SIMDI),
      "canceled"
    );
  });

  it("iptal edilmiş ve dönemi bitmiş abonelik erişim vermez", () => {
    assert.equal(
      playAbonelikDurumu({ state: "SUBSCRIPTION_STATE_CANCELED", expiryTime: GECMISTE }, SIMDI),
      "expired"
    );
  });

  it("bitiş tarihi bilinmeyen iptal, erişim vermez", () => {
    assert.equal(playAbonelikDurumu({ state: "SUBSCRIPTION_STATE_CANCELED" }, SIMDI), "expired");
  });

  it("beklemede, askıda ve duraklatılmış durumlar", () => {
    assert.equal(playAbonelikDurumu({ state: "SUBSCRIPTION_STATE_PENDING" }, SIMDI), "pending");
    for (const state of [
      "SUBSCRIPTION_STATE_EXPIRED",
      "SUBSCRIPTION_STATE_ON_HOLD",
      "SUBSCRIPTION_STATE_PAUSED",
      "SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED",
    ]) {
      assert.equal(playAbonelikDurumu({ state }, SIMDI), "expired");
    }
  });

  it("tanınmayan durum null döner, sessizce erişim kesilmez", () => {
    // Google yeni bir durum eklerse "expired" saymak, ödeme yapan müşterinin
    // erişimini kesebilirdi. Çağıran taraf null'ı hata olarak ele alıyor.
    assert.equal(playAbonelikDurumu({ state: "SUBSCRIPTION_STATE_YENI_BIR_SEY" }, SIMDI), null);
  });
});
