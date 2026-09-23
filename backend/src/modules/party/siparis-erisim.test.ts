import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { kartDuzenlemeHatasi, musteriYetkisi } from "./siparis-erisim";

// Satış çalışanı başka çalışanın müşterisini ve alacağını görmemeli; yönetici
// hepsini görmeli. Buradaki bir gerileme ya ekibin tüm portföyünü herkese açar
// ya da yöneticiyi raporundan eder.

const yonetici = { canRead: true, canWrite: true, canManageTeam: true };
const uye = { canRead: true, canWrite: true, canManageTeam: false };
const saltOkur = { canRead: true, canWrite: false, canManageTeam: false };
const yok = { canRead: false, canWrite: false, canManageTeam: false };

describe("musteriYetkisi", () => {
  test("yönetici herkesin müşterisini görür ve yazar", () => {
    assert.deepEqual(musteriYetkisi(yonetici, "baskasi", "ben"), { okur: true, siparisYazar: true, yonetici: true });
    assert.deepEqual(musteriYetkisi(yonetici, null, "ben"), { okur: true, siparisYazar: true, yonetici: true });
  });

  test("çalışan yalnızca kendi müşterisini görür", () => {
    assert.equal(musteriYetkisi(uye, "ben", "ben").okur, true);
    assert.equal(musteriYetkisi(uye, "baskasi", "ben").okur, false);
    assert.equal(musteriYetkisi(uye, null, "ben").okur, false);
  });

  test("salt okur departman üyesi kendisine atanan müşterinin tahsilatını girebilir", () => {
    assert.equal(musteriYetkisi(saltOkur, "ben", "ben").siparisYazar, true);
    assert.equal(musteriYetkisi(saltOkur, "baskasi", "ben").siparisYazar, false);
  });

  test("modüle erişimi olmayan, sorumlu olsa bile göremez", () => {
    assert.equal(musteriYetkisi(yok, "ben", "ben").okur, false);
  });

  test("oturum yoksa hiçbir şey", () => {
    assert.equal(musteriYetkisi(yonetici, "ben", undefined).okur, false);
  });
});

describe("kartDuzenlemeHatasi", () => {
  test("yönetici istediği kartı istediğine atar", () => {
    assert.equal(kartDuzenlemeHatasi(yonetici, "a", "b", "ben"), null);
  });

  test("çalışan kendi kartını düzenler ama devredemez", () => {
    assert.equal(kartDuzenlemeHatasi(uye, "ben", undefined, "ben"), null);
    assert.equal(kartDuzenlemeHatasi(uye, "ben", "ben", "ben"), null);
    assert.ok(kartDuzenlemeHatasi(uye, "ben", "baskasi", "ben"));
  });

  test("çalışan başkasının kartını düzenleyemez, kendine de çekemez", () => {
    assert.ok(kartDuzenlemeHatasi(uye, "baskasi", undefined, "ben"));
    assert.ok(kartDuzenlemeHatasi(uye, "baskasi", "ben", "ben"));
  });

  test("salt okur kartı düzenleyemez", () => {
    assert.ok(kartDuzenlemeHatasi(saltOkur, "ben", undefined, "ben"));
  });
});
