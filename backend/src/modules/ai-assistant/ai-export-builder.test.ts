import { test } from "node:test";
// Backend tsconfig'inde esModuleInterop kapalı: namespace import şart.
import * as assert from "node:assert/strict";
import { AiExportStore, MAX_EXPORT_ROWS } from "./ai-export-builder";

const tablo = (rows: (string | number | undefined)[][]) => ({
  title: "Görevler",
  headers: ["Başlık", "Durum"],
  rows,
});

test("CSV Excel'in Türkçe yerelinde doğru açılır: BOM ve noktalı virgül", async () => {
  const service = new AiExportStore();
  const built = await service.build("kullanici-1", {
    fileName: "gorevler",
    format: "csv",
    table: tablo([["Teklif hazırla", "Yapılacak"]]),
  });

  const metin = service.take(built.id, "kullanici-1").buffer.toString("utf8");
  assert.ok(metin.startsWith("﻿"), "BOM olmadan Excel Türkçe karakterleri bozuyor");
  assert.ok(metin.includes("Başlık;Durum"));
  assert.ok(metin.includes("Teklif hazırla;Yapılacak"));
});

test("içinde ayraç geçen hücre tırnaklanır, satır kaymaz", async () => {
  const service = new AiExportStore();
  const built = await service.build("kullanici-1", {
    fileName: "gorevler",
    format: "csv",
    table: tablo([['Teklif; sunum ve "revizyon"', "Yapılıyor"]]),
  });

  const metin = service.take(built.id, "kullanici-1").buffer.toString("utf8");
  assert.ok(metin.includes('"Teklif; sunum ve ""revizyon"""'));
});

test("satır sınırı aşılırsa rapor kesilir ve kaç satır yazıldığı bildirilir", async () => {
  const service = new AiExportStore();
  const cokSatir = Array.from({ length: MAX_EXPORT_ROWS + 25 }, (_, i) => [`Görev ${i}`, "Yapılacak"]);
  const built = await service.build("kullanici-1", {
    fileName: "gorevler",
    format: "csv",
    table: tablo(cokSatir),
  });

  // Sessizce kesmek en kötüsü olurdu: çağıran taraf farkı buradan görüp söylüyor.
  assert.equal(built.rowCount, MAX_EXPORT_ROWS);
});

test("rapor başkasına verilmez", async () => {
  const service = new AiExportStore();
  const built = await service.build("kullanici-1", {
    fileName: "gorevler",
    format: "csv",
    table: tablo([["Teklif hazırla", "Yapılacak"]]),
  });

  assert.throws(() => service.take(built.id, "kullanici-2"), /sana ait değil/);
});

test("olmayan rapor istenirse ne yapılacağını söyleyen hata döner", () => {
  const service = new AiExportStore();
  assert.throws(
    () => service.take("11111111-2222-3333-4444-555555555555", "kullanici-1"),
    /yeniden üretmesini/
  );
});

test("dosya adı uzantıyı bir kez alır, boşluklar ayraca dönüşür", async () => {
  const service = new AiExportStore();
  const built = await service.build("kullanici-1", {
    fileName: "Nisan Ayı Görevleri",
    format: "csv",
    table: tablo([["Teklif hazırla", "Yapılacak"]]),
  });

  assert.equal(built.fileName, "Nisan-Ayı-Görevleri.csv");
});
