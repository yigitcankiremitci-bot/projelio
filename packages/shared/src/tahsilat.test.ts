import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { MusteriSiparisi } from "./types";
import {
  kalanTutar,
  siparisDurumu,
  tahsilatRaporu,
  tahsilatTutariHatasi,
  tahsilEdilen,
  vadeTarihiHesapla,
} from "./tahsilat";

// Durum rozeti, tahsilat doğrulaması ve yönetici raporu buradan geçiyor.
// Buradaki bir gerileme ya deftere gerçekte gelmemiş gelir yazdırır ya da
// yöneticiye geciken bir alacağı "bekliyor" gösterir.

function s(over: Partial<MusteriSiparisi>): MusteriSiparisi {
  return {
    id: Math.random().toString(36).slice(2),
    partyId: "p1",
    tutar: 1000,
    paraBirimi: "TRY",
    siparisTarihi: "2026-09-01",
    vadeGun: 30,
    vadeTarihi: "2026-10-01",
    odemeYontemi: "havale",
    tahsilatlar: [],
    createdAt: "2026-09-01T00:00:00Z",
    ...over,
  };
}

function t(tutar: number, tarih = "2026-09-10") {
  return { id: tarih + tutar, siparisId: "x", tutar, tarih, odemeYontemi: "havale" as const, createdAt: tarih };
}

describe("vadeTarihiHesapla", () => {
  test("gün ekler, ay ve yıl sınırını geçer", () => {
    assert.equal(vadeTarihiHesapla("2026-09-15", 30), "2026-10-15");
    assert.equal(vadeTarihiHesapla("2026-12-20", 15), "2027-01-04");
    assert.equal(vadeTarihiHesapla("2026-09-15", 0), "2026-09-15");
  });

  test("yaz saati geçişinde gün kaymaz", () => {
    assert.equal(vadeTarihiHesapla("2026-10-20", 10), "2026-10-30");
    assert.equal(vadeTarihiHesapla("2026-03-25", 7), "2026-04-01");
  });
});

describe("kalan ve durum", () => {
  test("kısmi tahsilat kalanı düşürür", () => {
    const x = s({ tahsilatlar: [t(400)] });
    assert.equal(tahsilEdilen(x), 400);
    assert.equal(kalanTutar(x), 600);
    assert.equal(siparisDurumu(x, "2026-09-20"), "kismi");
  });

  test("kayan nokta artığı kalanı açık bırakmaz", () => {
    const x = s({ tutar: 0.3, tahsilatlar: [t(0.1), t(0.2)] });
    assert.equal(kalanTutar(x), 0);
    assert.equal(siparisDurumu(x, "2026-09-20"), "tahsil_edildi");
  });

  test("vade günü gecikmiş sayılmaz, ertesi gün sayılır", () => {
    assert.equal(siparisDurumu(s({}), "2026-10-01"), "bekliyor");
    assert.equal(siparisDurumu(s({}), "2026-10-02"), "gecikti");
  });

  test("kısmen ödenmiş ama vadesi geçmiş sipariş GECİKTİ görünür", () => {
    assert.equal(siparisDurumu(s({ tahsilatlar: [t(400)] }), "2026-10-05"), "gecikti");
  });

  test("tamamı ödenmişse vadesi geçmiş olsa da kapanmıştır", () => {
    assert.equal(siparisDurumu(s({ tahsilatlar: [t(1000, "2026-10-20")] }), "2026-11-01"), "tahsil_edildi");
  });
});

describe("tahsilatTutariHatasi", () => {
  test("kalanı aşan tutar reddedilir", () => {
    const x = s({ tahsilatlar: [t(700)] });
    assert.equal(tahsilatTutariHatasi(x, 300), null);
    assert.ok(tahsilatTutariHatasi(x, 300.01));
  });

  test("sıfır, eksi ve sayı olmayan reddedilir", () => {
    assert.ok(tahsilatTutariHatasi(s({}), 0));
    assert.ok(tahsilatTutariHatasi(s({}), -5));
    assert.ok(tahsilatTutariHatasi(s({}), NaN));
  });
});

describe("tahsilatRaporu", () => {
  test("sorumlu × vade ayı × para birimi kırılımı; kur dönüşümü yok", () => {
    const rapor = tahsilatRaporu(
      [
        s({ sorumluId: "a", sorumluAdi: "Ayşe", tutar: 1000, vadeTarihi: "2026-10-01", tahsilatlar: [t(1000)] }),
        s({ sorumluId: "a", sorumluAdi: "Ayşe", tutar: 500, vadeTarihi: "2026-10-20" }),
        s({ sorumluId: "a", sorumluAdi: "Ayşe", tutar: 200, paraBirimi: "USD", vadeTarihi: "2026-10-05" }),
        s({ sorumluId: "b", sorumluAdi: "Burak", tutar: 300, vadeTarihi: "2026-11-02" }),
      ],
      "2026-10-15"
    );
    assert.equal(rapor.length, 3);
    const ayseTl = rapor.find((r) => r.sorumluId === "a" && r.paraBirimi === "TRY")!;
    assert.deepEqual(
      { n: ayseTl.siparisSayisi, b: ayseTl.beklenen, t: ayseTl.tahsilEdilen, k: ayseTl.kalan, g: ayseTl.geciken },
      { n: 2, b: 1500, t: 1000, k: 500, g: 0 }
    );
    const ayseUsd = rapor.find((r) => r.sorumluId === "a" && r.paraBirimi === "USD")!;
    assert.equal(ayseUsd.geciken, 200);
    assert.equal(rapor[rapor.length - 1].ay, "2026-11");
  });

  test("sorumlusu olmayan müşteri ayrı satırda toplanır", () => {
    const rapor = tahsilatRaporu([s({ sorumluId: undefined })], "2026-09-01");
    assert.equal(rapor[0].sorumluId, null);
  });
});
