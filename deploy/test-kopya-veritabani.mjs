#!/usr/bin/env node
// test-kopya-veritabani.mjs — TEST KOPYASININ veritabanını sıfırdan kurar.
//
// YALNIZCA test-kopya dalında var. Hedef: eski Supabase projesi
// `projelio` (kjglfieqodfwkkfzrrtq). Canlı VPS'e BAĞLANMAZ — bağlantı adresi
// supabase.co değilse betik hiçbir şey yapmadan çıkar.
//
// Ne yapıyor (sırayla):
//   1. Depodaki tüm dosyaları depo API'siyle siler. SQL ile silinemez: Supabase
//      storage.objects'e doğrudan DELETE'i reddediyor, satırı silebilsek bile
//      dosyanın kendisi S3'te sahipsiz kalırdı.
//   2. public şemasını düşürüp Supabase'in varsayılan izinleriyle yeniden açar.
//   3. database/migrations/*.sql'i dosya adı sırasıyla (migrate.sh ile aynı)
//      tek tek, her biri kendi transaction'ında uygular ve schema_migrations'a
//      yazar. İlk hatada durur.
//   4. PostgREST'in şema önbelleğini tazeler.
//
// Gizli değerler ekrana BASILMAZ. Okunan dosya: ~/projelio-test-kopya.env
//   TEST_DB_URL=postgresql://postgres.<ref>:<parola>@...pooler.supabase.com:5432/postgres
//   TEST_SUPABASE_URL=https://<ref>.supabase.co
//   TEST_SUPABASE_SERVICE_ROLE_KEY=...
//
// Kullanım:  node deploy/test-kopya-veritabani.mjs --evet-sil

import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const BEKLENEN_REF = "kjglfieqodfwkkfzrrtq";
const kok = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Worktree'de node_modules yok; ana klasörünkini kullan.
const require = createRequire(join(kok, "../projelio/package.json"));
const pg = require("pg");
const { createClient } = require("@supabase/supabase-js");

const env = Object.fromEntries(
  readFileSync(join(homedir(), "projelio-test-kopya.env"), "utf8")
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("#") && s.includes("="))
    .map((s) => [s.slice(0, s.indexOf("=")), s.slice(s.indexOf("=") + 1)]),
);

for (const k of ["TEST_DB_URL", "TEST_SUPABASE_URL", "TEST_SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!env[k]) throw new Error(`${k} eksik (~/projelio-test-kopya.env)`);
}
// Yanlış hedefe karşı iki kilit: hem veritabanı hem API adresi test projesini
// göstermeli. Canlı VPS'in adresi (api.projelio.app / 100.111.x) buradan geçemez.
if (!env.TEST_DB_URL.includes(BEKLENEN_REF) || !env.TEST_DB_URL.includes("supabase.com")) {
  throw new Error("TEST_DB_URL test projesini göstermiyor — durduruldu.");
}
if (env.TEST_SUPABASE_URL !== `https://${BEKLENEN_REF}.supabase.co`) {
  throw new Error("TEST_SUPABASE_URL test projesini göstermiyor — durduruldu.");
}
if (!process.argv.includes("--evet-sil")) {
  console.log("Bu betik test projesindeki TÜM veriyi ve dosyaları siler. Onay için --evet-sil ekle.");
  process.exit(1);
}

// 1. Depo
const sb = createClient(env.TEST_SUPABASE_URL, env.TEST_SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { data: kovalar, error: kovaHata } = await sb.storage.listBuckets();
if (kovaHata) throw kovaHata;
// emptyBucket'a güvenilmiyor: alt klasörleri boşaltmadan dönüp "kova boş değil"
// hatasına yol açtı. Klasörleri tek tek gezip dosyaları kendimiz siliyoruz.
async function dosyalariTopla(kova, onek) {
  const { data, error } = await sb.storage.from(kova).list(onek, { limit: 1000 });
  if (error) throw new Error(`${kova}/${onek} listelenemedi: ${error.message}`);
  const yollar = [];
  for (const o of data) {
    const yol = onek ? `${onek}/${o.name}` : o.name;
    // Klasörlerin id'si yok; dosyaların var.
    if (o.id) yollar.push(yol);
    else yollar.push(...(await dosyalariTopla(kova, yol)));
  }
  return yollar;
}
for (const kova of kovalar) {
  const yollar = await dosyalariTopla(kova.id, "");
  for (let i = 0; i < yollar.length; i += 100) {
    const { error } = await sb.storage.from(kova.id).remove(yollar.slice(i, i + 100));
    if (error) throw new Error(`${kova.id} boşaltılamadı: ${error.message}`);
  }
  const { error: silHata } = await sb.storage.deleteBucket(kova.id);
  if (silHata) throw new Error(`${kova.id} silinemedi: ${silHata.message}`);
  console.log(`depo: ${kova.id} — ${yollar.length} dosya silindi, kova kaldırıldı`);
}

// 2-4. Şema
const db = new pg.Client({ connectionString: env.TEST_DB_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  await db.query(`
    drop schema public cascade;
    create schema public;
    grant usage on schema public to postgres, anon, authenticated, service_role;
    grant all on schema public to postgres, service_role;
    alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
  `);
  console.log("public şeması sıfırlandı");

  const dizin = join(kok, "database/migrations");
  // migrate.sh'nin kabuk glob'u ile aynı sıra: bayt sırası.
  const dosyalar = readdirSync(dizin).filter((d) => d.endsWith(".sql")).sort();
  for (const ad of dosyalar) {
    const icerik = readFileSync(join(dizin, ad), "utf8");
    const basladi = Date.now();
    try {
      await db.query("begin");
      await db.query(icerik);
      await db.query("commit");
    } catch (e) {
      await db.query("rollback");
      console.error(`HATA: ${ad}: ${e.message}`);
      process.exitCode = 1;
      break;
    }
    // 083'ten önce tablo yok; onları 083 uygulanınca toplu yazarız.
    if (ad >= "083") {
      if (ad.startsWith("083")) {
        for (const once of dosyalar.filter((d) => d <= ad)) {
          const sha = createHash("sha256").update(readFileSync(join(dizin, once))).digest("hex");
          await db.query(
            "insert into public.schema_migrations(version, checksum) values ($1,$2) on conflict do nothing",
            [once, sha],
          );
        }
      } else {
        const sha = createHash("sha256").update(icerik).digest("hex");
        await db.query(
          "insert into public.schema_migrations(version, checksum, duration_ms) values ($1,$2,$3)",
          [ad, sha, Date.now() - basladi],
        );
      }
    }
    console.log(`  ✓ ${ad}`);
  }
  await db.query("notify pgrst, 'reload schema'");
  const { rows } = await db.query("select count(*)::int n from public.schema_migrations");
  console.log(`schema_migrations: ${rows[0].n}/${dosyalar.length}`);
} finally {
  await db.end();
}
