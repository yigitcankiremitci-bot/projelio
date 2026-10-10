import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Party } from "@projelio/shared";
import { aktarimKaydiVerisi, aktarimTanimi, defterAktarimiYapildi, notaEkle } from "./aktarim";

// Aktarım kartı başka bir ekibin modülüne taşıyor; ilişki notu da gider
// (kullanıcı kararı, 2026-10-10). Buradaki bir gerileme notu kaybettirir ya
// da aynı notu her aktarımda karta yeniden ekler.

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
  test("rakip: ad, kurum segment olur, ilişki notu Not alanına, kaynak kart yazılır", () => {
    const v = aktarimKaydiVerisi(kart(), "rakip");
    assert.deepEqual(v, {
      competitorName: "Ayşe Yılmaz",
      segment: "ABC Ajans",
      threatLevel: "medium",
      notes: "fiyatları bizden düşük, gizli",
      kaynakKart: "p1",
    });
  });

  test("ortaklık: iletişim birleşir; bayi rolünde tür bayi, değilse stratejik ortak", () => {
    const v = aktarimKaydiVerisi(kart(), "ortaklik");
    assert.equal(v.partnerType, "strategic");
    assert.equal(v.contactInfo, "0532 111 22 33 · ayse@abc.com");
    assert.equal(v.status, "talking");
    assert.equal(v.notes, "fiyatları bizden düşük, gizli");
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

describe("notaEkle — defter aktarımında genel not", () => {
  test("ilişki notu genel notun sonuna eklenir; zaten varsa ya da boşsa dokunulmaz", () => {
    assert.equal(notaEkle(undefined, "Carmed için işbirliği"), "Carmed için işbirliği");
    assert.equal(notaEkle("Eski not", "Yeni"), "Eski not\n\nYeni");
    assert.equal(notaEkle("Eski not\n\nYeni", "Yeni"), undefined);
    assert.equal(notaEkle("Eski", "  "), undefined);
  });
});
