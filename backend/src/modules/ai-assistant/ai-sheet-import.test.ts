import { test } from "node:test";
// Backend tsconfig'inde esModuleInterop kapalı: namespace import şart.
import * as assert from "node:assert/strict";
import {
  buildSheetSummary,
  parseCsv,
  distinctValues,
  parseSheetDate,
  parseSheetNumber,
  planRecordImport,
  planTaskImport,
  resolveColumn,
  type SheetData,
} from "./ai-sheet-import";

const sayfa: SheetData = {
  name: "Görevler",
  rows: [
    ["Görev Adı", "Detay", "Termin", "Birim", "Sorumlu"],
    ["Landing sayfası metni", "Ana sayfa", "12.03.2026", "Pazarlama", "Arda"],
    ["Fatura mutabakatı", "", "2026-04-01", "Muhasebe", ""],
    ["Bayi ziyareti", "", "12 Mart 2026", "Saha", ""],
    ["", "Başlıksız satır", "01.01.2026", "Pazarlama", ""],
    ["Reklam raporu", "", "çarşamba", "Pazarlama", "Bilinmeyen Kişi"],
  ],
};

const hedef = {
  kolon: "Birim",
  kurallar: [
    { deger: "Pazarlama", departmentId: "dep-pazarlama" },
    { deger: "muhasebe", departmentId: "dep-muhasebe" },
  ],
};

test("sütun adı birebir tutmasa da bulunur", () => {
  const headers = sayfa.rows[0];
  assert.equal(resolveColumn(headers, "görev adı"), 0);
  assert.equal(resolveColumn(headers, "Termin"), 2);
  // Sütun harfi de kabul edilir: model bazen başlık yerine harf veriyor.
  assert.equal(resolveColumn(headers, "D"), 3);
  assert.equal(resolveColumn(headers, "olmayan sütun"), -1);
});

test("tarih dört biçimden de çözülür", () => {
  assert.equal(parseSheetDate("12.03.2026"), "2026-03-12");
  assert.equal(parseSheetDate("2026-4-1"), "2026-04-01");
  assert.equal(parseSheetDate("12 Mart 2026"), "2026-03-12");
  // Excel'in tarih olarak biçimlenmemiş hücresi seri numarası taşır.
  assert.equal(parseSheetDate("46093"), "2026-03-12");
  assert.equal(parseSheetDate("çarşamba"), undefined);
});

test("tarih sanılan bütçe sayısı tarihe çevrilmez", () => {
  // 45.000 ₺'lik bir bütçe hücresi seri numarası aralığında; ama tarih
  // yalnızca teslim sütununda aranır ve sayı olarak da okunabilmeli.
  assert.equal(parseSheetNumber("1.250,50"), 1250.5);
  assert.equal(parseSheetNumber("1,250.50"), 1250.5);
  assert.equal(parseSheetNumber("15.000 ₺"), 15000);
  // Tek ayraç + üç hane binliktir; iki hane ondalıktır.
  assert.equal(parseSheetNumber("15.5"), 15.5);
  assert.equal(parseSheetNumber("1250"), 1250);
});

test("plan satırları hedeflere dağıtır, eşleşmeyeni gerekçesiyle atlar", () => {
  const plan = planTaskImport(sayfa, {
    esleme: { baslik: "Görev Adı", aciklama: "Detay", teslim: "Termin" },
    hedef,
  });

  assert.equal(plan.toplamSatir, 5);
  assert.equal(plan.planlanan.length, 3);
  assert.deepEqual(
    plan.planlanan.map((p) => p.departmentId),
    ["dep-pazarlama", "dep-muhasebe", "dep-pazarlama"]
  );
  assert.equal(plan.planlanan[0].deadline, "2026-03-12");

  // Başlıksız satır ve hedefi eşleşmeyen "Saha" satırı atlanır — ikisi de
  // SEBEBİYLE birlikte, çünkü sessizce atlanan satır elle karşılaştırmadan
  // fark edilmiyor.
  assert.deepEqual(plan.atlanan, [
    { satir: 4, sebep: 'hedef eşleşmedi: "Saha"' },
    { satir: 5, sebep: "başlık boş" },
  ]);
});

test("çözülemeyen tarih ve eşleşmeyen kişi görevi düşürmez, uyarıya yazılır", () => {
  const plan = planTaskImport(sayfa, {
    esleme: { baslik: "Görev Adı", teslim: "Termin", atanan: "Sorumlu" },
    hedef,
    atananKurallari: [{ deger: "Arda", userId: "kullanici-arda" }],
  });

  const reklam = plan.planlanan.find((p) => p.title === "Reklam raporu");
  assert.ok(reklam, "görev yine de oluşturulmalı");
  assert.equal(reklam?.deadline, undefined);
  assert.equal(plan.planlanan[0].assignedTo, "kullanici-arda");
  assert.deepEqual(plan.uyarilar, [
    { satir: 6, sebep: 'tarih çözülemedi: "çarşamba"' },
    { satir: 6, sebep: 'kişi eşleşmedi: "Bilinmeyen Kişi"' },
  ]);
});

test("varsayılan hedef verilirse eşleşmeyen satır da yerleşir", () => {
  const plan = planTaskImport(sayfa, {
    esleme: { baslik: "Görev Adı" },
    hedef: { ...hedef, varsayilanDepartmentId: "dep-genel" },
  });
  assert.equal(plan.planlanan.length, 4);
  assert.equal(plan.planlanan.find((p) => p.title === "Bayi ziyareti")?.departmentId, "dep-genel");
});

test("başlık sütunu bulunamazsa iş hiç başlamaz", () => {
  assert.throws(
    () => planTaskImport(sayfa, { esleme: { baslik: "Olmayan" }, hedef }),
    /Başlık sütunu bulunamadı/
  );
});

test("satır aralığı verilince yalnızca o aralık işlenir", () => {
  const plan = planTaskImport(sayfa, {
    esleme: { baslik: "Görev Adı" },
    hedef,
    ilkSatir: 3,
    sonSatir: 3,
  });
  assert.equal(plan.planlanan.length, 1);
  assert.equal(plan.planlanan[0].title, "Fatura mutabakatı");
});

test("modül kaydı planı alan anahtarlarına eşler", () => {
  const plan = planRecordImport(sayfa, { esleme: { baslik: "Görev Adı", kategori: "Birim" } });
  assert.equal(plan.planlanan.length, 5);
  assert.deepEqual(plan.planlanan[0].data, { baslik: "Landing sayfası metni", kategori: "Pazarlama" });
});

test("dağıtım kararı için sütundaki farklı değerler sayılır", () => {
  // Modelin 100 satırı okumasına gerek yok: 3 değeri departmanlara eşlemesi yeter.
  assert.deepEqual(distinctValues(sayfa, "Birim"), [
    { deger: "Pazarlama", adet: 3 },
    { deger: "Muhasebe", adet: 1 },
    { deger: "Saha", adet: 1 },
  ]);
});

test("künye tabloyu değil tablonun tarifini verir", () => {
  const summary = buildSheetSummary([sayfa], 2);
  assert.ok(summary.includes("6 satır"));
  assert.ok(summary.includes("Görev Adı | Detay"));
  assert.ok(summary.includes("gerisi sunucuda duruyor"));
  // Künye kısa olmalı: asıl kazanç bu.
  assert.ok(summary.length < 700, `künye çok uzun: ${summary.length}`);
});

test("CSV ayracı dosyadan bulunur, tırnak içindeki ayraç satırı bölmez", () => {
  // Türkçe Excel noktalı virgülle yazıyor; hücrenin içindeki noktalı virgül de
  // tırnaklanıyor. İkisini karıştırmak tüm sütunları kaydırırdı.
  const rows = parseCsv('Görev;Birim\n"Teklif; sunum";Pazarlama\nFatura;Muhasebe\n');
  assert.deepEqual(rows, [
    ["Görev", "Birim"],
    ["Teklif; sunum", "Pazarlama"],
    ["Fatura", "Muhasebe"],
  ]);
});

test("virgüllü CSV ve çift tırnak kaçışı", () => {
  const rows = parseCsv('a,b\n"1,5","de""mek"\n');
  assert.deepEqual(rows, [
    ["a", "b"],
    ["1,5", 'de"mek'],
  ]);
});

test("BOM ve boş satırlar ayıklanır", () => {
  const rows = parseCsv('\uFEFFa;b\n\n;\nx;y');
  assert.deepEqual(rows, [
    ["a", "b"],
    ["x", "y"],
  ]);
});
