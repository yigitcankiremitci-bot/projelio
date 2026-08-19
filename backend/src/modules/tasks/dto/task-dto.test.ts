// Backend tsconfig'inde esModuleInterop kapalı (NestJS CommonJS derlemesi
// gereği), bu yüzden namespace import kullanılıyor.
import * as assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";

// Global ValidationPipe `whitelist: true` ile çalışıyor (bkz. main.ts): DTO'da
// tanımlı OLMAYAN her alan istekten sessizce silinir — hata da dönmez.
//
// Bu sessizlik bir kez pahalıya patladı: modül kaydından görev üretme özelliği
// çalışıyor görünüyordu (görev oluşuyordu) ama kaynak alanları DTO'da yazılı
// olmadığı için siliniyordu; görev hangi kayıttan doğduğunu taşımıyor, modül
// panelindeki rozet hiç görünmüyordu.
//
// DTO dosyası doğrudan import EDİLEMİYOR: Node'un tip silme motoru dekoratör
// söz dizimini çalıştıramıyor (bkz. scripts/run-tests.mjs). Bu yüzden sözleşme
// kaynak metin üzerinden doğrulanıyor — kaba ama bu hatayı yakalamaya yeter.

// Yol depo kökünden kuruluyor: backend tsconfig CommonJS olduğu için
// import.meta kullanılamıyor, testler ise ESM olarak çalıştığı için __dirname
// yok. Koşucu her zaman kökten çalıştırıyor (bkz. scripts/run-tests.mjs).
const dtoSource = readFileSync(join(process.cwd(), "backend/src/modules/tasks/dto/task.dto.ts"), "utf8");

/** İstemcinin görev oluştururken gönderdiği alanlar. */
const CREATE_FIELDS = [
  "title",
  "description",
  "deadline",
  "assignedTo",
  // Çoklu atama (bkz. migration 053): whitelist'te olmazsa ValidationPipe alanı
  // sessizce siler ve göreve yalnızca tek kişi atanmış gibi davranır.
  "assignedToIds",
  // Opsiyonel bitiş saati + hatırlatma (bkz. migration 057).
  "deadlineTime",
  "reminderLeadMinutes",
  // Modül → görev köprüsü (bkz. components/TaskFromRecordModal.tsx).
  "sourceModuleKey",
  "sourceRecordId",
];

function declaredIn(source: string, className: string): Set<string> {
  const start = source.indexOf(`export class ${className}`);
  assert.ok(start >= 0, `${className} bulunamadı`);
  const rest = source.slice(start);
  const end = rest.indexOf("\nexport class ");
  const body = end >= 0 ? rest.slice(0, end) : rest;
  return new Set(Array.from(body.matchAll(/^\s{2}(\w+)[?!]?:/gm)).map((m) => m[1]));
}

describe("CreateTaskDto — whitelist sözleşmesi", () => {
  const declared = declaredIn(dtoSource, "CreateTaskDto");

  for (const field of CREATE_FIELDS) {
    test(`${field} DTO'da tanımlı`, () => {
      assert.ok(
        declared.has(field),
        `"${field}" CreateTaskDto'da yok — ValidationPipe onu sessizce silecek ve istek eksik gidecek`
      );
    });
  }
});
