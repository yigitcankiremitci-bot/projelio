// Backend tsconfig'inde esModuleInterop kapalı (NestJS CommonJS derlemesi
// gereği), bu yüzden namespace import kullanılıyor.
import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Party, PartyRole } from "@projelio/shared";
import { addRole, findDuplicates, normalizeEmail, normalizeName, normalizeTaxNumber, removeRole } from "./party-dedup";

// Ortak varlığın değeri tekilliğine bağlı: "ABC Ltd", "ABC Ltd." ve "abc ltd"
// üç ayrı kayıt olursa müşteri verisi yine bölünür ve party'nin varlık sebebi
// ortadan kalkar. Bu dosya o kuralın çalıştırılabilir hali.

function party(over: Partial<Party> = {}): Party {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    organizationId: "org-1",
    partyType: "company",
    displayName: "Örnek",
    roles: ["lead"],
    status: "active",
    data: {},
    createdAt: "2026-08-12T00:00:00Z",
    updatedAt: "2026-08-12T00:00:00Z",
    ...over,
  };
}

describe("normalizeName — Türkçe'ye duyarlı", () => {
  test("büyük/küçük harf farkı yok sayılır", () => {
    assert.equal(normalizeName("ABC Yazılım"), normalizeName("abc yazılım"));
  });

  test("Türkçe İ/I doğru küçültülür", () => {
    // toLowerCase() tek başına "İ"yi araya nokta koyarak bozar, "I"yı da
    // yanlış olarak "i" yapar. İkisi de aynı sonuca inmeli.
    assert.equal(normalizeName("İSTANBUL"), normalizeName("istanbul"));
    assert.equal(normalizeName("ILGIN"), normalizeName("ılgın"));
  });

  test("aksanlı harfler ASCII'ye indirgenir", () => {
    assert.equal(normalizeName("Şişli Gıda"), normalizeName("Sisli Gida"));
    assert.equal(normalizeName("Öztürk Çelik"), normalizeName("Ozturk Celik"));
  });

  test("sondaki nokta fark yaratmaz", () => {
    assert.equal(normalizeName("ABC Ltd."), normalizeName("ABC Ltd"));
    assert.equal(normalizeName("ABC Yazılım."), normalizeName("ABC Yazılım"));
  });

  test("nokta kısaltmayı böler değil birleştirir", () => {
    // "A.Ş." tek kelimedir; boşluğa çevirseydik "a s" olur ve tüzel kişilik
    // eki olarak tanınmazdı. Bu, Türkçe unvanlarda en sık karşılaşılan durum.
    assert.equal(normalizeName("A.B.C."), "abc");
    assert.equal(normalizeName("ABC A.Ş."), "abc");

    // Bunun bilinçli bedeli: boşlukla yazılan "A B C" üç ayrı kelimedir ve
    // "A.B.C." ile eşleşmez. Ad benzerliği yalnızca UYARI seviyesinde olduğu
    // için kabul edilebilir — engelleyici kontrol vergi numarasıdır.
    assert.notEqual(normalizeName("A.B.C."), normalizeName("A B C"));
  });

  test("tüzel kişilik ekleri atılır", () => {
    // "ABC A.Ş." ile "ABC" aynı firmadır.
    assert.equal(normalizeName("ABC A.Ş."), "abc");
    assert.equal(normalizeName("ABC Ltd. Şti."), "abc");
    assert.equal(normalizeName("ABC Sanayi ve Ticaret A.Ş."), "abc");
  });

  test("fazla boşluk temizlenir", () => {
    assert.equal(normalizeName("  ABC   Yazılım  "), normalizeName("ABC Yazılım"));
  });

  test("yalnızca ekten oluşan ad boşa iner", () => {
    // Boş sonuç kimseyle eşleşmemeli; aksi halde tüm eksik adlar birbirinin
    // kopyası sayılırdı (findDuplicates bunu ayrıca koruyor).
    assert.equal(normalizeName("Ltd. Şti."), "");
  });

  test("farklı firmalar birbirine karışmaz", () => {
    assert.notEqual(normalizeName("ABC Yazılım"), normalizeName("ABD Yazılım"));
  });
});

describe("normalizeTaxNumber / normalizeEmail", () => {
  test("vergi numarasında boşluk ve tire önemsiz", () => {
    assert.equal(normalizeTaxNumber("123 456 7890"), "1234567890");
    assert.equal(normalizeTaxNumber("123-456-7890"), "1234567890");
  });

  test("e-posta büyük/küçük harf duyarsız", () => {
    assert.equal(normalizeEmail("  Info@ABC.COM "), "info@abc.com");
  });
});

describe("findDuplicates", () => {
  const mevcut = [
    party({ id: "p1", displayName: "ABC Yazılım Ltd. Şti.", taxNumber: "1234567890", email: "info@abc.com" }),
    party({ id: "p2", displayName: "XYZ Gıda A.Ş.", taxNumber: "9998887776" }),
  ];

  test("aynı vergi numarası ENGELLER", () => {
    const d = findDuplicates({ taxNumber: "123 456 7890" }, mevcut);
    assert.equal(d.length, 1);
    assert.equal(d[0].severity, "block");
    assert.equal(d[0].reason, "tax_number");
    assert.equal(d[0].party.id, "p1");
  });

  test("aynı e-posta yalnızca UYARIR", () => {
    const d = findDuplicates({ email: "INFO@abc.com" }, mevcut);
    assert.equal(d[0].severity, "warn");
    assert.equal(d[0].reason, "email");
  });

  test("benzer ad yalnızca UYARIR", () => {
    // Gerçekten aynı adı taşıyan iki ayrı şube olabilir; karar kullanıcınındır.
    const d = findDuplicates({ displayName: "abc yazilim" }, mevcut);
    assert.equal(d[0].severity, "warn");
    assert.equal(d[0].reason, "name");
  });

  test("aynı kayıt iki kez raporlanmaz", () => {
    // Hem vergi no hem e-posta eşleşse bile tek satır döner; en ağır sebep kazanır.
    const d = findDuplicates({ taxNumber: "1234567890", email: "info@abc.com", displayName: "ABC Yazılım" }, mevcut);
    assert.equal(d.length, 1);
    assert.equal(d[0].severity, "block");
  });

  test("eşleşme yoksa boş döner", () => {
    assert.deepEqual(findDuplicates({ displayName: "Bambaşka Firma", taxNumber: "0001112223" }, mevcut), []);
  });

  test("excludeId kaydın kendisini kopya saymaz", () => {
    // Güncellemede kayıt kendi vergi numarasıyla çakışmamalı.
    const d = findDuplicates({ taxNumber: "1234567890", excludeId: "p1" }, mevcut);
    assert.deepEqual(d, []);
  });

  test("birleştirilmiş ve arşivlenmiş kayıtlar aday değildir", () => {
    const havuz = [
      party({ id: "m1", displayName: "ABC", taxNumber: "111", mergedIntoId: "p1" }),
      party({ id: "a1", displayName: "ABC", taxNumber: "222", archivedAt: "2026-08-01T00:00:00Z" }),
    ];
    assert.deepEqual(findDuplicates({ taxNumber: "111" }, havuz), []);
    assert.deepEqual(findDuplicates({ taxNumber: "222" }, havuz), []);
  });

  test("boş girdi hiçbir şeyle eşleşmez", () => {
    assert.deepEqual(findDuplicates({}, mevcut), []);
    assert.deepEqual(findDuplicates({ displayName: "   ", taxNumber: "", email: "" }, mevcut), []);
  });

  test("yalnızca tüzel ekten oluşan ad kopya üretmez", () => {
    // "Ltd. Şti." normalleştirmede boşa iner; boş adla eşleşme yapılmamalı.
    const havuz = [party({ id: "x", displayName: "Ltd. Şti." })];
    assert.deepEqual(findDuplicates({ displayName: "A.Ş." }, havuz), []);
  });

  test("birden fazla kopya hepsi döner", () => {
    const havuz = [
      party({ id: "d1", displayName: "ABC Ltd." }),
      party({ id: "d2", displayName: "abc" }),
    ];
    const d = findDuplicates({ displayName: "ABC A.Ş." }, havuz);
    assert.equal(d.length, 2);
  });
});

describe("rol kuralları", () => {
  test("rol EKLENİR, mevcut roller silinmez", () => {
    // İlk fatura kesilince lead -> customer bir DEĞİŞTİRME değil EKLEMEdir;
    // kaydın potansiyel olarak başladığı bilgisi kaybolmamalı.
    assert.deepEqual(addRole(["lead"], "customer"), ["lead", "customer"]);
  });

  test("aynı rol iki kez eklenmez", () => {
    const roller: PartyRole[] = ["lead", "customer"];
    assert.deepEqual(addRole(roller, "customer"), roller);
  });

  test("aynı firma birden fazla rolde olabilir", () => {
    let roller: PartyRole[] = ["customer"];
    roller = addRole(roller, "supplier");
    assert.deepEqual(roller, ["customer", "supplier"]);
  });

  test("rol kaldırılabilir", () => {
    assert.deepEqual(removeRole(["lead", "customer"], "lead"), ["customer"]);
  });

  test("son rol silinemez", () => {
    // Rolsüz bir party listede hiçbir filtreye düşmez, kaybolur.
    assert.deepEqual(removeRole(["customer"], "customer"), ["customer"]);
  });

  test("olmayan rolü kaldırmak bir şeyi değiştirmez", () => {
    assert.deepEqual(removeRole(["customer"], "supplier"), ["customer"]);
  });
});
