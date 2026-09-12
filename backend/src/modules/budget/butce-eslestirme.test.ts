import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { kapsamTuru, mapTransaction } from "./butce-eslestirme";

// Kaydın hangi kademeye ait olduğu, toplamanın tamamının dayandığı bilgi.
// Yanlış türetilirse tutar yanlış kademede sayılır ve fark hiçbir ekranda
// görünmez — bu yüzden kimlik sütunlarının önceliği testle sabitleniyor.

describe("kapsamTuru", () => {
  test("her kademe kendi sütunundan tanınır", () => {
    assert.equal(kapsamTuru({ group_id: "g1" }), "group");
    assert.equal(kapsamTuru({ organization_id: "o1" }), "organization");
    assert.equal(kapsamTuru({ job_id: "j1" }), "job");
    assert.equal(kapsamTuru({ department_id: "d1" }), "department");
    assert.equal(kapsamTuru({ project_id: "p1" }), "project");
    assert.equal(kapsamTuru({ operation_id: "r1" }), "operation");
  });

  test("hiçbir kademe yoksa kişisel Kasa kaydıdır", () => {
    // 020'de kurulan kural: kişisel kayıt yalnızca owner_id taşır.
    assert.equal(kapsamTuru({ owner_id: "u1" }), "personal");
    assert.equal(kapsamTuru({}), "personal");
  });

  test("üstteki kademe kazanır", () => {
    // Veritabanı kısıtı (budget_tx_single_parent) zaten iki kademeyi birden
    // yazmayı engelliyor; bu yalnızca bozuk bir satırın sessizce yanlış
    // kademeye düşmemesi için deterministik bir sıra.
    assert.equal(kapsamTuru({ group_id: "g1", project_id: "p1" }), "group");
    assert.equal(kapsamTuru({ job_id: "j1", project_id: "p1" }), "job");
  });
});

describe("mapTransaction", () => {
  const satir = {
    id: "t1",
    job_id: "j1",
    owner_id: "u1",
    created_by: "u2",
    type: "expense",
    amount: "1250.50",
    occurred_at: "2026-09-10",
    created_at: "2026-09-10T08:00:00Z",
  };

  test("tutar sayıya çevrilir, kademe türetilir", () => {
    const h = mapTransaction(satir);
    assert.equal(h.amount, 1250.5);
    assert.equal(h.scopeType, "job");
    assert.equal(h.jobId, "j1");
  });

  test("para birimi boşsa ₺ — sütun eklenmeden önceki kayıtlar tek para birimliydi", () => {
    assert.equal(mapTransaction(satir).currency, "TRY");
    assert.equal(mapTransaction({ ...satir, currency: "USD" }).currency, "USD");
  });

  test("defter sahibi ile kaydı giren AYRI alanlar", () => {
    // Departman yöneticisinin şirket defterine girdiği kayıtta ikisi farklıdır;
    // denetim için ikisi de lazım.
    const h = mapTransaction(satir);
    assert.equal(h.ownerId, "u1");
    assert.equal(h.createdBy, "u2");
  });
});
