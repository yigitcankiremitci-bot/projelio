#!/usr/bin/env node
// Test koşucusu.
//
// Projede vitest/jest yok ve gerekmiyor: Node 22'nin yerleşik test koşucusu
// (`node --test`) TypeScript dosyalarını tip silme ile doğrudan çalıştırıyor.
// Tek eksik uzantısız göreli import çözümü; onu da küçük bir kanca hallediyor
// (scripts/ts-resolve.mjs). Böylece yeni bir bağımlılık eklenmiyor.
//
// Kullanım: npm test  ·  npm test -- --filter=access

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const searchRoots = [join(root, "apps/web/src"), join(root, "backend/src"), join(root, "packages")];

const filterArg = process.argv.find((a) => a.startsWith("--filter="));
const filter = filterArg ? filterArg.slice("--filter=".length) : null;

function findTests(dir) {
  if (!existsSync(dir)) return [];
  const found = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...findTests(full));
    else if (entry.endsWith(".test.ts") || entry.endsWith(".test.tsx")) found.push(full);
  }
  return found;
}

let entries = searchRoots.flatMap(findTests).sort();
if (filter) entries = entries.filter((e) => e.includes(filter));

if (entries.length === 0) {
  console.error(filter ? `"${filter}" ile eşleşen test yok.` : "Test dosyası bulunamadı (*.test.ts).");
  process.exit(1);
}

for (const e of entries) console.log(`  · ${relative(root, e)}`);
console.log("");

const run = spawnSync(
  process.execPath,
  [
    "--import",
    pathToFileURL(join(root, "scripts/register-ts-resolve.mjs")).href,
    // backend/package.json CommonJS (NestJS gereği); test dosyaları ESM olduğu
    // için Node her seferinde uyarı basıyor. Uyarı zararsız, gürültüsü değil.
    "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
    "--test",
    ...entries,
  ],
  { stdio: "inherit", cwd: root }
);
process.exit(run.status ?? 1);
