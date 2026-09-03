#!/usr/bin/env node
// Backend'in HTTP uçlarını KODDAN çıkarır.
//
// NEDEN VAR: docs/api-endpoints.md elle yazılıyordu ve kaçınılmaz olarak
// bayatladı — 453 uçtan yalnızca bir avuç belgeliydi, bazı belgelenmiş uçlar
// ise artık başka imzaya sahipti. Elle tutulan bir liste, kod her değiştiğinde
// sessizce yanlışa dönüşüyor.
//
// Bu betik listeyi controller'lardaki dekoratörlerden üretir, yani daima
// gerçeği söyler. Ayrıntılı açıklama/gövde örneği isteyen uçlar api-endpoints.md
// içinde elle yazılmaya devam eder; burası "hangi uçlar var" sorusunun cevabı.
//
// Kullanım:
//   node scripts/uc-listesi.mjs            # metin tablo
//   node scripts/uc-listesi.mjs --markdown # api-endpoints.md'ye yapıştırılabilir
//   node scripts/uc-listesi.mjs --sayim    # yalnızca özet

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const kok = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const modullerDizini = join(kok, "backend/src/modules");

const bicim = process.argv.includes("--markdown")
  ? "markdown"
  : process.argv.includes("--sayim")
    ? "sayim"
    : "metin";

function controllerBul(dizin) {
  const bulunan = [];
  for (const girdi of readdirSync(dizin)) {
    const tam = join(dizin, girdi);
    if (statSync(tam).isDirectory()) bulunan.push(...controllerBul(tam));
    else if (girdi.endsWith(".controller.ts")) bulunan.push(tam);
  }
  return bulunan;
}

/** @Controller("x") -> "x" ; @Controller() -> "" */
function kokYolu(kaynak) {
  const m = kaynak.match(/@Controller\(\s*(?:["'`]([^"'`]*)["'`])?\s*\)/);
  return m?.[1] ?? "";
}

/** Sınıf ya da metot üzerinde AuthGuard('jwt') var mı. */
function korumaliMi(kaynak) {
  return /AuthGuard\(\s*["'`]jwt["'`]\s*\)/.test(kaynak);
}

function uclariCikar(dosya) {
  const kaynak = readFileSync(dosya, "utf8");
  const kok = kokYolu(kaynak);
  const jwt = korumaliMi(kaynak);
  const roller = /@Roles\(/.test(kaynak);

  const ucler = [];
  const re = /@(Get|Post|Patch|Put|Delete)\(\s*(?:["'`]([^"'`]*)["'`])?\s*\)/g;
  let m;
  while ((m = re.exec(kaynak)) !== null) {
    const metot = m[1].toUpperCase();
    const alt = m[2] ?? "";
    const yol = "/" + [kok, alt].filter(Boolean).join("/").replace(/\/+/g, "/").replace(/^\//, "");
    ucler.push({ metot, yol, jwt, roller });
  }
  return ucler;
}

const dosyalar = controllerBul(modullerDizini).sort();
const hepsi = [];
for (const d of dosyalar) {
  const modul = relative(modullerDizini, d).split(/[\\/]/)[0];
  for (const uc of uclariCikar(d)) hepsi.push({ ...uc, modul });
}

const METOT_SIRA = { GET: 0, POST: 1, PATCH: 2, PUT: 3, DELETE: 4 };
hepsi.sort((a, b) => a.modul.localeCompare(b.modul) || a.yol.localeCompare(b.yol) || METOT_SIRA[a.metot] - METOT_SIRA[b.metot]);

const korumasiz = hepsi.filter((u) => !u.jwt);

if (bicim === "sayim") {
  const modulSayisi = new Set(hepsi.map((u) => u.modul)).size;
  console.log(`Toplam uç: ${hepsi.length}`);
  console.log(`Modül:     ${modulSayisi}`);
  console.log(`Kimliksiz: ${korumasiz.length}`);
  process.exit(0);
}

if (bicim === "markdown") {
  console.log("<!-- OTOMATİK ÜRETİLDİ: node scripts/uc-listesi.mjs --markdown -->");
  console.log(`<!-- ${hepsi.length} uç, ${new Set(hepsi.map((u) => u.modul)).size} modül -->\n`);
  let sonModul = null;
  for (const u of hepsi) {
    if (u.modul !== sonModul) {
      console.log(`\n### ${u.modul}\n`);
      console.log("| Metot | Yol | Kimlik |");
      console.log("|---|---|---|");
      sonModul = u.modul;
    }
    const kimlik = u.roller ? "JWT + rol" : u.jwt ? "JWT" : "**yok**";
    console.log(`| ${u.metot} | \`${u.yol}\` | ${kimlik} |`);
  }
  process.exit(0);
}

let sonModul = null;
for (const u of hepsi) {
  if (u.modul !== sonModul) {
    console.log(`\n${u.modul}`);
    sonModul = u.modul;
  }
  console.log(`  ${u.metot.padEnd(6)} ${u.yol}${u.jwt ? "" : "   [kimliksiz]"}`);
}
console.log(`\n${hepsi.length} uç · ${new Set(hepsi.map((u) => u.modul)).size} modül · ${korumasiz.length} kimliksiz`);
