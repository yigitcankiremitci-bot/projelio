import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Party } from "@projelio/shared";
import { aktarimKaydiVerisi, aktarimTanimi, defterAktarimiYapildi } from "./aktarim";

// Aktarım kartı başka bir ekibin modülüne taşıyor. Buradaki bir gerileme
// yönetimin gizli ilişki notunu pazarlamanın rakip analizine sızdırır.

const kart = (over: Partial<Party> = {}): Party => ({
  id: "p1",
  organizationId: "o1",
  partyType: "person",
  displayName: "Ayşe Yılmaz",
  kurum: "ABC Ajans",
  phone: "0532 111 22 33",
  email: "ayse@abc.com",
  roles: ["contact"],
  modules: ["baglantilar"],
  sosyal: {},
  status: "active",
  data: {},
  createdAt: "2026-10-10T00:00:00Z",
  updatedAt: "2026-10-10T00:00:00Z",
  baglanti: { onem: "yuksek", iliskiNotu: "fiyatları bizden düşük, gizli" },
  ...over,
});

describe("aktarimKaydiVerisi", () => {
  test("rakip: ad, kurum segment olur, kaynak kart yazılır; ilişki notu GİTMEZ", () => {
    const v = aktarimKaydiVerisi(kart(), "rakip");
    assert.deepEqual(v, { competitorName: "Ayşe Yılmaz", segment: "ABC Ajans", threatLevel: "medium", kaynakKart: "p1" });
    assert.ok(!JSON.stringify(v).includes("gizli"));
  });

  test("ortaklık: iletişim birleşir; bayi rolünde tür bayi, değilse stratejik ortak", () => {
    const v = aktarimKaydiVerisi(kart(), "ortaklik");
    assert.equal(v.partnerType, "strategic");
    assert.equal(v.contactInfo, "0532 111 22 33 · ayse@abc.com");
    assert.equal(v.status, "talking");
    assert.ok(!JSON.stringify(v).includes("gizli"));
    assert.equal(aktarimKaydiVerisi(kart({ roles: ["distributor"] }), "ortaklik").partnerType, "dealer");
  });
});

describe("defterAktarimiYapildi", () => {
  test("Müşteriler'de olup tedarikçi rolü yoksa tedarikçi aktarımı yapılmamış sayılır", () => {
    const tedarikci = aktarimTanimi("tedarikci")!;
    assert.equal(defterAktarimiYapildi({ modules: ["crm_musteri"], roles: ["customer"] }, tedarikci), false);
    assert.equal(defterAktarimiYapildi({ modules: ["crm_musteri"], roles: ["customer", "supplier"] }, tedarikci), true);
    assert.equal(defterAktarimiYapildi({ modules: ["baglantilar"], roles: ["supplier"] }, tedarikci), false);
  });

  test("tanınmayan hedef yok", () => {
    assert.equal(aktarimTanimi("muhasebe"), undefined);
  });
});
