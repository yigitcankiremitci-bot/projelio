import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  DEMOTE_BELOW,
  PROMOTE_AT,
  resolveModuleTabs,
  scoreModule,
  slotCount,
  type ModuleUsage,
} from "./moduleLayout";

// Sekme çubuğu ekranın en görünür davranışı: yanlış çalışırsa kullanıcı dün
// kullandığı yeri bugün bulamaz. Bu yüzden kural saf fonksiyonda ve testli.

const NOW = "2026-08-14T12:00:00Z";
const daysAgo = (n: number) => new Date(Date.parse(NOW) - n * 24 * 60 * 60 * 1000).toISOString();

// Taban durum bilerek "sifir puanli ama terk edilmemis" bir modul: birkac kaydi
// var, uzun suredir acik, kimseye atanmamis. Boylece her test tek bir sinyali
// yalitarak olcuyor. (recordCount 0 verilseydi taban durumun kendisi "terk
// edilmis" sayilip -3 alirdi ve hicbir test tek sinyali olcmezdi.)
function usage(over: Partial<ModuleUsage> = {}): ModuleUsage {
  return {
    key: "fm_gelir_gider",
    name: "Gelir-Gider",
    recordCount: 5,
    assignedToMe: false,
    enabledAt: daysAgo(200),
    ...over,
  };
}

describe("slotCount — şirket büyüdükçe modül sekmesi azalır", () => {
  test("tek kişi: 2 slot", () => {
    assert.equal(slotCount({ userCount: 1, departmentCount: 0 }), 2);
  });

  test("küçük ekip (2–9): 2 slot", () => {
    assert.equal(slotCount({ userCount: 7, departmentCount: 3 }), 2);
  });

  test("orta ölçek (10–49): 1 slot", () => {
    assert.equal(slotCount({ userCount: 24, departmentCount: 4 }), 1);
  });

  test("büyük ölçek: sekme yok, gezinme departmandan yürür", () => {
    assert.equal(slotCount({ userCount: 80, departmentCount: 4 }), 0);
  });

  test("departman sayısı da büyüklük göstergesidir", () => {
    // 6 kişilik ama 6 departmanlı bir yapı: kullanıcı sayısı küçük olsa da
    // gezinme ekseni artık departman.
    assert.equal(slotCount({ userCount: 6, departmentCount: 6 }), 0);
  });

  test("mobilde hiçbir zaman modül sekmesi yok", () => {
    assert.equal(slotCount({ userCount: 1, departmentCount: 0 }, true), 0);
  });
});

describe("scoreModule — sinyaller", () => {
  test("atanmışlık en güçlü tek sinyal", () => {
    assert.equal(scoreModule(usage({ assignedToMe: true }), NOW), 3);
  });

  test("son 14 gün içindeki hareket taze sayılır", () => {
    assert.equal(scoreModule(usage({ lastActivityAt: daysAgo(3) }), NOW), 2);
  });

  test("15–30 gün arası hareket yarım puan değerinde", () => {
    assert.equal(scoreModule(usage({ lastActivityAt: daysAgo(20) }), NOW), 1);
  });

  test("30 günden eski hareket puan getirmez", () => {
    assert.equal(scoreModule(usage({ lastActivityAt: daysAgo(60) }), NOW), 0);
  });

  test("hacim kademeli sayılır", () => {
    assert.equal(scoreModule(usage({ recordCount: 20 }), NOW), 0);
    assert.equal(scoreModule(usage({ recordCount: 50 }), NOW), 1);
    assert.equal(scoreModule(usage({ recordCount: 500 }), NOW), 2);
  });

  test("yeni açılan modül görünürlük avansı alır", () => {
    assert.equal(scoreModule(usage({ enabledAt: daysAgo(2) }), NOW), 2);
  });

  test("çekirdek sekmeyle örtüşen modül cezalandırılır", () => {
    // Bütçe zaten kendi sekmesinde; ikinci kez göstermek iki ayrı yer varmış
    // hissi veriyor.
    const score = scoreModule(usage({ key: "panel_butce", assignedToMe: true }), NOW);
    assert.equal(score, 1);
  });

  test("terk edilmiş modül eksiye düşer", () => {
    // Hiç kaydı yok, 30 günden uzun süredir açık, hiç hareket görmemiş.
    assert.equal(scoreModule(usage({ recordCount: 0, enabledAt: daysAgo(90) }), NOW), -3);
  });

  test("kaydı olmayan ama yeni açılmış modül terk edilmiş sayılmaz", () => {
    assert.equal(scoreModule(usage({ recordCount: 0, enabledAt: daysAgo(3) }), NOW), 2);
  });

  test("tipik günlük kullanım terfi eşiğini geçer", () => {
    // Atanmış (3) + taze hareket (2) + orta hacim (1) = 6
    const score = scoreModule(
      usage({ assignedToMe: true, lastActivityAt: daysAgo(1), recordCount: 40 }),
      NOW
    );
    assert.equal(score, PROMOTE_AT);
  });
});

describe("resolveModuleTabs — slot, eşik, histerezis", () => {
  const hot = (key: string, name: string) =>
    usage({ key, name, assignedToMe: true, lastActivityAt: daysAgo(1), recordCount: 40 });

  test("eşiği geçen modül terfi eder ve yeni işaretlenir", () => {
    const tabs = resolveModuleTabs({
      size: { userCount: 3, departmentCount: 1 },
      modules: [hot("fm_gelir_gider", "Gelir-Gider")],
      now: NOW,
    });
    assert.deepEqual(tabs.map((t) => t.key), ["fm_gelir_gider"]);
    assert.equal(tabs[0].isNew, true);
  });

  test("eşiği geçemeyen modül sekmeye çıkmaz", () => {
    const tabs = resolveModuleTabs({
      size: { userCount: 3, departmentCount: 1 },
      modules: [usage({ assignedToMe: true })], // 3 puan
      now: NOW,
    });
    assert.deepEqual(tabs, []);
  });

  test("slot sayısı aşılmaz, en yüksek puanlılar girer", () => {
    const tabs = resolveModuleTabs({
      size: { userCount: 3, departmentCount: 1 }, // 2 slot
      modules: [
        hot("a", "A"),
        hot("b", "B"),
        { ...hot("c", "C"), recordCount: 500 }, // en yüksek
      ],
      now: NOW,
    });
    assert.equal(tabs.length, 2);
    assert.equal(tabs[0].key, "c");
  });

  test("mevcut sekme, terfi eşiğinin altına düşse bile yerinde kalır", () => {
    // Histerezisin bütün amacı bu: 6'nın altına inen ama 3'ün üstünde kalan bir
    // modül her girişte belirip kaybolmamalı.
    const tabs = resolveModuleTabs({
      size: { userCount: 3, departmentCount: 1 },
      modules: [usage({ key: "fm_gelir_gider", name: "Gelir-Gider", assignedToMe: true })], // 3
      now: NOW,
      previous: ["fm_gelir_gider"],
    });
    assert.deepEqual(tabs.map((t) => t.key), ["fm_gelir_gider"]);
    assert.equal(tabs[0].isNew, false, "kalan sekme yeniden 'yeni' diye işaretlenmez");
  });

  test("düşme eşiğinin altına inen sekme iner", () => {
    const tabs = resolveModuleTabs({
      size: { userCount: 3, departmentCount: 1 },
      modules: [usage({ key: "fm_gelir_gider", name: "Gelir-Gider", recordCount: 30 })], // 1
      now: NOW,
      previous: ["fm_gelir_gider"],
    });
    assert.deepEqual(tabs, []);
  });

  test("mevcut sekmeler sıralarını korur, yeni gelen sona eklenir", () => {
    const tabs = resolveModuleTabs({
      size: { userCount: 3, departmentCount: 1 },
      modules: [{ ...hot("yeni", "Yeni"), recordCount: 900 }, hot("eski", "Eski")],
      now: NOW,
      previous: ["eski"],
    });
    assert.deepEqual(tabs.map((t) => t.key), ["eski", "yeni"]);
  });

  test("şirket büyüyüp slot azalınca en düşük puanlı sekme düşer", () => {
    const tabs = resolveModuleTabs({
      size: { userCount: 20, departmentCount: 3 }, // 1 slot
      modules: [hot("a", "A"), { ...hot("b", "B"), recordCount: 900 }],
      now: NOW,
      previous: ["a", "b"],
    });
    assert.deepEqual(tabs.map((t) => t.key), ["b"]);
  });

  test("büyük şirkette sekme çubuğu modül taşımaz", () => {
    const tabs = resolveModuleTabs({
      size: { userCount: 120, departmentCount: 9 },
      modules: [hot("a", "A")],
      now: NOW,
      previous: ["a"],
    });
    assert.deepEqual(tabs, []);
  });

  test("artık var olmayan modül önceki listeden sessizce düşer", () => {
    // Modül kapatıldığında (organization_modules'tan silindiğinde) önbellekteki
    // sekme listesi hâlâ onu içerebilir; çökmemeli.
    const tabs = resolveModuleTabs({
      size: { userCount: 3, departmentCount: 1 },
      modules: [hot("a", "A")],
      now: NOW,
      previous: ["kapatilmis", "a"],
    });
    assert.deepEqual(tabs.map((t) => t.key), ["a"]);
  });

  test("aynı girdi aynı sırayı verir (eşit puanda ada göre)", () => {
    const modules = [hot("z", "Zeytin"), hot("c", "Çilek"), hot("a", "Armut")];
    const first = resolveModuleTabs({ size: { userCount: 2, departmentCount: 1 }, modules, now: NOW });
    const second = resolveModuleTabs({
      size: { userCount: 2, departmentCount: 1 },
      modules: [...modules].reverse(),
      now: NOW,
    });
    assert.deepEqual(first.map((t) => t.key), second.map((t) => t.key));
    assert.deepEqual(first.map((t) => t.name), ["Armut", "Çilek"]);
  });

  test("eşikler arasında anlamlı bir bant var", () => {
    assert.ok(PROMOTE_AT > DEMOTE_BELOW, "terfi eşiği düşme eşiğinden yüksek olmalı");
  });
});
