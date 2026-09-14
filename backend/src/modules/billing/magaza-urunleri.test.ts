import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { magazaUrunleri } from "./magaza-urunleri";
import type { PlanRef } from "./billing-settings.service";

function ref(over: Partial<PlanRef>): PlanRef {
  return {
    provider: "play_store",
    planKey: "pro",
    period: "monthly",
    referenceCode: "pro_monthly",
    priceAmount: null,
    currency: "TRY",
    ...over,
  } as PlanRef;
}

describe("magazaUrunleri", () => {
  it("iyzico eşleştirmesi mobil istemciye gitmez", () => {
    const sonuc = magazaUrunleri([ref({ provider: "iyzico", referenceCode: "iyz-123" })]);
    assert.equal(sonuc.length, 0);
  });

  it("referans kodu tanımsız plan atlanır", () => {
    // Tanımsız kod, o planın mağazada HENÜZ OLMADIĞI anlamına geliyor.
    // İstemciye verilseydi mağazaya sorup "ürün bulunamadı" alırdı ve
    // kullanıcı bunu "abonelik bozuk" diye görürdü.
    const sonuc = magazaUrunleri([ref({ referenceCode: null }), ref({ referenceCode: "" })]);
    assert.equal(sonuc.length, 0);
  });

  it("mağaza planları plan ve döneme göre ayrı ayrı dönüyor", () => {
    const sonuc = magazaUrunleri([
      ref({ planKey: "starter", period: "monthly", referenceCode: "starter_monthly" }),
      ref({ planKey: "starter", period: "yearly", referenceCode: "starter_yearly" }),
      ref({ provider: "app_store", planKey: "pro", period: "monthly", referenceCode: "pro.monthly" }),
    ]);
    assert.deepEqual(
      sonuc.map((u) => `${u.provider}:${u.planKey}:${u.period}:${u.productId}`),
      [
        "play_store:starter:monthly:starter_monthly",
        "play_store:starter:yearly:starter_yearly",
        "app_store:pro:monthly:pro.monthly",
      ]
    );
  });
});
