// Backend tsconfig'inde esModuleInterop kapalı (NestJS CommonJS derlemesi
// gereği), bu yüzden namespace import kullanılıyor.
import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  bakiyeUyarisi,
  gunAnahtari,
  gunlukPencere,
  sicramaUyarisi,
  sonGunlerinOrtalamasi,
} from "./ai-spend-alert";

// Bu mantık paranın bittiğini haber veriyor. İki yönlü de kırılabilir: susarsa
// Lio bir sabah tüm kullanıcılar için durur, gereksiz öterse kimse ciddiye almaz.
// Testler iki tarafı da sabitliyor.

const ESIKLER = { criticalUsd: 5, warningUsd: 15 };

describe("bakiyeUyarisi", () => {
  test("eşiğin üstünde uyarı YOK", () => {
    assert.equal(bakiyeUyarisi({ remainingUsd: 40, gunlukOrtalamaUsd: 1, ...ESIKLER }), null);
  });

  test("uyarı eşiğinin altında 'uyarı' seviyesi", () => {
    const u = bakiyeUyarisi({ remainingUsd: 12, gunlukOrtalamaUsd: 1, ...ESIKLER });
    assert.equal(u?.seviye, "uyarı");
    assert.match(u!.govde, /12\.00 USD/);
  });

  test("kritik eşiğin altında 'kritik' seviyesi", () => {
    const u = bakiyeUyarisi({ remainingUsd: 3, gunlukOrtalamaUsd: 1, ...ESIKLER });
    assert.equal(u?.seviye, "kritik");
    assert.match(u!.govde, /Lio tüm kullanıcılar için durur/);
  });

  test("kalan gün, harcama hızından hesaplanır — asıl karar verdiren sayı bu", () => {
    const yavas = bakiyeUyarisi({ remainingUsd: 12, gunlukOrtalamaUsd: 0.2, ...ESIKLER });
    assert.match(yavas!.govde, /yaklaşık 60 gün/);

    const hizli = bakiyeUyarisi({ remainingUsd: 12, gunlukOrtalamaUsd: 8, ...ESIKLER });
    assert.match(hizli!.govde, /yaklaşık 1 gün/);
  });

  test("hiç harcama yoksa gün tahmini uydurulmaz", () => {
    const u = bakiyeUyarisi({ remainingUsd: 12, gunlukOrtalamaUsd: 0, ...ESIKLER });
    assert.match(u!.govde, /hesaplanamadı/);
  });

  test("bakiye eksiye düşmüşse 'bugün tükenebilir' der, negatif gün yazmaz", () => {
    const u = bakiyeUyarisi({ remainingUsd: -2, gunlukOrtalamaUsd: 5, ...ESIKLER });
    assert.equal(u?.seviye, "kritik");
    assert.match(u!.govde, /bugün içinde tükenebilir/);
  });
});

describe("sicramaUyarisi", () => {
  const TABAN = { katsayi: 3, tabanUsd: 1 };

  test("normal seyirde uyarı YOK", () => {
    assert.equal(sicramaUyarisi({ duneUsd: 2, oncekiOrtalamaUsd: 1.5, ...TABAN }), null);
  });

  test("katsayıyı aşan artışta uyarır", () => {
    const u = sicramaUyarisi({ duneUsd: 9, oncekiOrtalamaUsd: 2, ...TABAN });
    assert.match(u!.govde, /4\.5 katı/);
  });

  test("küçük tutarlarda oran yanıltıcı olduğu için susar", () => {
    // 0,02 -> 0,50 = 25 kat ama toplam para önemsiz.
    assert.equal(sicramaUyarisi({ duneUsd: 0.5, oncekiOrtalamaUsd: 0.02, ...TABAN }), null);
  });

  test("geçmiş veri yoksa uyarı üretmez (ilk günlerde yanlış alarm olmasın)", () => {
    assert.equal(sicramaUyarisi({ duneUsd: 50, oncekiOrtalamaUsd: 0, ...TABAN }), null);
  });
});

describe("gün pencereleri", () => {
  function gunler(simdi: Date, degerler: Record<number, number>): Map<string, number> {
    const m = new Map<string, number>();
    for (const [kaydirma, tutar] of Object.entries(degerler)) {
      const d = new Date(simdi);
      d.setDate(d.getDate() - Number(kaydirma));
      m.set(gunAnahtari(d), tutar);
    }
    return m;
  }

  test("gunlukPencere: dün ile ondan önceki 7 günü ayırır", () => {
    const simdi = new Date(2026, 7, 23);
    const m = gunler(simdi, { 0: 99, 1: 10, 2: 7, 3: 7, 4: 7, 5: 7, 6: 7, 7: 7, 8: 7 });
    const { duneUsd, oncekiOrtalamaUsd } = gunlukPencere(m, simdi);
    assert.equal(duneUsd, 10);
    assert.equal(oncekiOrtalamaUsd, 7);
  });

  test("bugün hiçbir hesaba katılmaz — gün bitmeden karşılaştırma yanlış alarm üretir", () => {
    const simdi = new Date(2026, 7, 23);
    const m = gunler(simdi, { 0: 1000 });
    assert.equal(gunlukPencere(m, simdi).duneUsd, 0);
    assert.equal(sonGunlerinOrtalamasi(m, simdi, 7), 0);
  });

  test("sonGunlerinOrtalamasi: dünden geriye N günün ortalaması", () => {
    const simdi = new Date(2026, 7, 23);
    const m = gunler(simdi, { 1: 7, 2: 7, 3: 7, 4: 7, 5: 7, 6: 7, 7: 7 });
    assert.equal(sonGunlerinOrtalamasi(m, simdi, 7), 7);
  });

  test("ay sınırını doğru geçer", () => {
    const simdi = new Date(2026, 8, 2); // 2 Eylül
    const m = gunler(simdi, { 1: 5, 2: 5, 3: 5 }); // 1 Eylül, 31 ve 30 Ağustos
    assert.equal(gunlukPencere(m, simdi).duneUsd, 5);
    assert.equal(sonGunlerinOrtalamasi(m, simdi, 3), 5);
  });
});
