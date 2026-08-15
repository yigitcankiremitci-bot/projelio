import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { MODULE_RECORD_CONFIGS } from "../moduleConfigs";
import { PANEL_CONFIGS, isPanelModule, panelSourceKeys } from "./index";
import {
  buildPeriod,
  groupBy,
  inPeriod,
  percent,
  type PanelContext,
  type Period,
} from "./types";

// A6 türev panelleri. Kendi verileri yok; hesabın doğruluğu kadar BOŞ
// durumdaki dürüstlüğü de önemli — kaynak modül kapalıysa panel bunu söylemeli,
// sıfır göstermemeli.

function rec(moduleKey: string, data: Record<string, unknown>, id = Math.random().toString(36).slice(2)) {
  return { id, moduleKey, data, createdAt: "2026-08-12T00:00:00Z" } as never;
}

function ctx(records: Record<string, unknown[]>, over: Partial<PanelContext> = {}): PanelContext {
  const map = new Map<string, never[]>();
  for (const [k, rows] of Object.entries(records)) map.set(k, rows as never[]);
  return {
    records: map as PanelContext["records"],
    enabledModules: new Set(Object.keys(records)),
    period: buildPeriod("all"),
    partyCount: 0,
    customerCount: 0,
    ...over,
  };
}

describe("dönem hesabı", () => {
  const bugun = new Date(2026, 7, 12); // 12 Ağustos 2026

  test("bu ay ayın ilk ve son gününü kapsar", () => {
    const p = buildPeriod("this_month", bugun);
    assert.equal(p.from, "2026-08-01");
    assert.equal(p.to, "2026-08-31");
  });

  test("geçen ay doğru hesaplanır", () => {
    const p = buildPeriod("last_month", bugun);
    assert.equal(p.from, "2026-07-01");
    assert.equal(p.to, "2026-07-31");
  });

  test("çeyrek üç aylık dilime oturur", () => {
    // Ağustos 3. çeyrek: Temmuz-Eylül.
    const p = buildPeriod("this_quarter", bugun);
    assert.equal(p.from, "2026-07-01");
    assert.equal(p.to, "2026-09-30");
  });

  test("yıl başı-sonu", () => {
    const p = buildPeriod("this_year", bugun);
    assert.equal(p.from, "2026-01-01");
    assert.equal(p.to, "2026-12-31");
  });

  test("tüm zamanlar sınırsızdır", () => {
    const p = buildPeriod("all", bugun);
    assert.equal(p.from, undefined);
    assert.equal(p.to, undefined);
  });

  test("yıl sonunda geçen ay bir önceki yıla taşar", () => {
    const p = buildPeriod("last_month", new Date(2026, 0, 15));
    assert.equal(p.from, "2025-12-01");
    assert.equal(p.to, "2025-12-31");
  });
});

describe("inPeriod — tarihsiz kayıt dışarıda bırakılmaz", () => {
  const agustos: Period = buildPeriod("this_month", new Date(2026, 7, 12));

  test("dönem içindeki kayıt geçer", () => {
    assert.equal(inPeriod(rec("fm_gelir_gider", { entryDate: "2026-08-05" }), "fm_gelir_gider", agustos), true);
  });

  test("dönem dışındaki kayıt elenir", () => {
    assert.equal(inPeriod(rec("fm_gelir_gider", { entryDate: "2026-07-05" }), "fm_gelir_gider", agustos), false);
  });

  test("sınır tarihleri dahildir", () => {
    assert.equal(inPeriod(rec("fm_gelir_gider", { entryDate: "2026-08-01" }), "fm_gelir_gider", agustos), true);
    assert.equal(inPeriod(rec("fm_gelir_gider", { entryDate: "2026-08-31" }), "fm_gelir_gider", agustos), true);
  });

  test("tarihi boş olan kayıt DIŞARIDA BIRAKILMAZ", () => {
    // Sessizce süzmek kullanıcıya "verim kayboldu" hissi verir.
    assert.equal(inPeriod(rec("fm_gelir_gider", {}), "fm_gelir_gider", agustos), true);
    assert.equal(inPeriod(rec("fm_gelir_gider", { entryDate: "" }), "fm_gelir_gider", agustos), true);
  });

  test("dönem alanı tanımsız modüller filtreden muaftır", () => {
    // Bütçe kalemi, risk, stok gibi modüllerde olay tarihi kavramı yok.
    assert.equal(MODULE_RECORD_CONFIGS.fm_risk_yonetimi.periodKey, undefined);
    assert.equal(inPeriod(rec("fm_risk_yonetimi", {}), "fm_risk_yonetimi", agustos), true);
  });

  test("tüm zamanlar seçilince her kayıt geçer", () => {
    const hepsi = buildPeriod("all");
    assert.equal(inPeriod(rec("fm_gelir_gider", { entryDate: "2020-01-01" }), "fm_gelir_gider", hepsi), true);
  });
});

describe("panel kayıt defteri", () => {
  const entries = Object.entries(PANEL_CONFIGS);

  test("12 panel tanımlı", () => {
    assert.equal(entries.length, 12);
  });

  test("her panelin amacı yazılmış", () => {
    // Boş ekranda bile kullanıcı panelin ne olduğunu anlamalı.
    for (const [key, p] of entries) {
      assert.ok(p.title.length > 0, `${key} başlıksız`);
      assert.ok(p.purpose.length > 10, `${key} amacı açıklanmamış`);
      assert.ok(p.metrics.length > 0, `${key} göstergesiz`);
    }
  });

  test("hiçbir panel aynı zamanda kayıt modülü değil", () => {
    // İkisi birden olursa hangi ekranın açılacağı belirsizleşir.
    for (const [key] of entries) {
      assert.equal(MODULE_RECORD_CONFIGS[key], undefined, `${key} hem panel hem kayıt modülü`);
    }
  });

  test("gösterge etiketleri panel içinde benzersiz", () => {
    for (const [key, p] of entries) {
      const labels = p.metrics.map((m) => m.label);
      assert.equal(new Set(labels).size, labels.length, `${key}: tekrar eden gösterge etiketi`);
    }
  });

  test("panelSourceKeys tüm kaynakları toplar", () => {
    for (const [key, p] of entries) {
      const keys = panelSourceKeys(p);
      assert.ok(keys.length > 0, `${key} hiçbir modülden okumuyor`);
      for (const m of p.metrics) {
        for (const s of m.sources) assert.ok(keys.includes(s), `${key}: ${s} kaynak listesinde yok`);
      }
    }
  });

  test("isPanelModule doğru ayırt eder", () => {
    assert.equal(isPanelModule("yonetim_analiz"), true);
    assert.equal(isPanelModule("fm_gelir_gider"), false);
  });

  test("holding panelleri kapsam sınırını açıkça söylüyor", () => {
    // Konsolidasyon henüz yok; kullanıcı eksik veri gördüğünü bilmeli.
    for (const key of ["holding_analiz", "holding_raporlama", "holding_denetim"]) {
      assert.ok(PANEL_CONFIGS[key].scopeNote, `${key} kapsam notu yok`);
    }
  });
});

describe("göstergeler boş veriyle patlamıyor", () => {
  for (const [key, panel] of Object.entries(PANEL_CONFIGS)) {
    test(`${key}: hiç kayıt yokken değer üretiyor`, () => {
      const bos = ctx(Object.fromEntries(panelSourceKeys(panel).map((k) => [k, []])));
      for (const m of panel.metrics) {
        const v = m.compute(bos);
        assert.equal(typeof v, "string", `${m.label} string döndürmedi`);
        assert.ok(v.length > 0, `${m.label} boş değer`);
        assert.ok(!v.includes("NaN"), `${m.label} NaN üretti: ${v}`);
        assert.ok(!v.includes("undefined"), `${m.label} undefined üretti: ${v}`);
        assert.ok(!v.includes("Infinity"), `${m.label} Infinity üretti: ${v}`);
      }
      for (const b of panel.breakdowns ?? []) {
        assert.deepEqual(b.compute(bos), [], `${b.title} boş veriyle satır üretti`);
      }
    });
  }
});

describe("finans göstergeleri doğru hesaplıyor", () => {
  const kayitlar = {
    fm_gelir_gider: [
      rec("fm_gelir_gider", { type: "income", amount: 1000, currency: "TRY", category: "Satış" }),
      rec("fm_gelir_gider", { type: "expense", amount: 400, currency: "TRY", category: "Kira" }),
      rec("fm_gelir_gider", { type: "expense", amount: 100, currency: "TRY", category: "Kira" }),
    ],
    fm_fatura: [rec("fm_fatura", { status: "pending", amount: 250, currency: "TRY" })],
    fm_alacak_borc: [],
  };

  test("net = gelir - gider", () => {
    const panel = PANEL_CONFIGS.fm_analiz_rapor;
    const net = panel.metrics.find((m) => m.label === "Net")!;
    const v = net.compute(ctx(kayitlar));
    assert.ok(v.includes("500"), `beklenen 500, gelen: ${v}`);
  });

  test("kategori kırılımı toplayıp sıralar", () => {
    const panel = PANEL_CONFIGS.fm_analiz_rapor;
    const giderler = panel.breakdowns!.find((b) => b.title === "Gider kategorileri")!;
    const rows = giderler.compute(ctx(kayitlar));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].label, "Kira");
    assert.equal(rows[0].value, 500, "aynı kategorideki iki gider toplanmalı");
  });

  test("farklı para birimleri ayrı gösterilir", () => {
    const karisik = {
      fm_gelir_gider: [
        rec("fm_gelir_gider", { type: "income", amount: 100, currency: "TRY" }),
        rec("fm_gelir_gider", { type: "income", amount: 100, currency: "USD" }),
      ],
    };
    const gelir = PANEL_CONFIGS.fm_analiz_rapor.metrics.find((m) => m.label === "Gelir")!;
    const v = gelir.compute(ctx(karisik));
    assert.ok(v.includes("+"), `iki para birimi ayrı yazılmalı: ${v}`);
    assert.ok(!/\b200\b/.test(v), `para birimleri toplanmış: ${v}`);
  });
});

describe("yardımcılar", () => {
  test("percent payda sıfırsa — döner", () => {
    // 0 yazmak "hiç dönüşüm yok" gibi okunurdu; oysa veri yok.
    assert.equal(percent(0, 0), "—");
    assert.equal(percent(5, 0), "—");
    assert.equal(percent(1, 4), "%25");
  });

  test("groupBy değeri olmayanları ayrı toplar", () => {
    const rows = groupBy(
      [rec("m", { k: "a" }), rec("m", { k: "a" }), rec("m", {})],
      "k",
      (v) => v.toUpperCase()
    );
    assert.deepEqual(rows, [
      { label: "A", value: 2 },
      { label: "(belirtilmemiş)", value: 1 },
    ]);
  });

  test("groupBy sumField ile toplar ve büyükten küçüğe sıralar", () => {
    const rows = groupBy(
      [rec("m", { k: "az", v: 5 }), rec("m", { k: "cok", v: 50 })],
      "k",
      (v) => v,
      { sumField: "v" }
    );
    assert.equal(rows[0].label, "cok");
    assert.equal(rows[0].value, 50);
  });
});
