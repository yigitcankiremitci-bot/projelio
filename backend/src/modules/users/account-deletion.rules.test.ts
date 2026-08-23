// Backend tsconfig'inde esModuleInterop kapalı (NestJS CommonJS derlemesi
// gereği), bu yüzden namespace import kullanılıyor.
import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { decideJobOwnership, decideOrgOwnership, describeBlockers } from "./account-deletion.rules";

// Bu kural GERİ ALINAMAZ bir karar veriyor: yanlış bir "sil", bir ekibin
// aylarca yaptığı işi yok eder. Testler o yüzden burada.

describe("decideJobOwnership", () => {
  test("başka onaylı üye yoksa iş silinir", () => {
    assert.equal(decideJobOwnership({ jobId: "j1", otherApprovedMemberCount: 0 }), "sil");
  });

  test("tek bir başka üye bile varsa iş KORUNUR", () => {
    assert.equal(decideJobOwnership({ jobId: "j1", otherApprovedMemberCount: 1 }), "anonim-birak");
  });

  test("kalabalık ekipte de korunur", () => {
    assert.equal(decideJobOwnership({ jobId: "j1", otherApprovedMemberCount: 12 }), "anonim-birak");
  });
});

describe("describeBlockers", () => {
  test("engel yoksa null — silme devam edebilir", () => {
    assert.equal(describeBlockers([]), null);
  });

  test("organizasyon sahipliği silmeyi durdurur ve ne yapılacağını söyler", () => {
    const mesaj = describeBlockers([{ tur: "organizasyon", ad: "Acme" }]);
    assert.match(mesaj!, /Acme \(organizasyon\)/);
    assert.match(mesaj!, /devretmen gerekiyor/);
  });

  test("birden fazla engel tek mesajda toplanır", () => {
    const mesaj = describeBlockers([
      { tur: "organizasyon", ad: "Acme" },
      { tur: "grup", ad: "Ajans" },
    ]);
    assert.match(mesaj!, /Acme \(organizasyon\), Ajans \(grup\)/);
  });
});

// Şikayetin tam hali: kullanıcı kendi kurduğu, içinde kimsenin olmadığı bir
// şirket yüzünden hesabını HİÇ silemiyordu — devredecek kimse de yoktu.
describe("decideOrgOwnership", () => {
  test("içinde başka kimse yoksa organizasyon hesapla birlikte silinir", () => {
    assert.equal(decideOrgOwnership({ otherApprovedPeopleCount: 0 }), "sil");
  });

  test("tek bir başka kişi bile varsa silme engellenir", () => {
    assert.equal(decideOrgOwnership({ otherApprovedPeopleCount: 1 }), "engelle");
  });

  test("kalabalık şirkette engellenir", () => {
    assert.equal(decideOrgOwnership({ otherApprovedPeopleCount: 40 }), "engelle");
  });
});
