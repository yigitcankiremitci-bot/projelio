#!/usr/bin/env node
/**
 * DEMO HESABININ ŞİFRESİNİ HER YERDE DEĞİŞTİRİR.
 *
 *   node scripts/demo-sifre-degistir.mjs 'YeniSifre123!'
 *
 * NEDEN SCRIPT: `ceo@celikhan.test` herkese açık bir demo hesabı ve şifresini
 * ziyaretçilerin değiştirmesi kapalı (bkz. backend/src/common/demo-hesap.ts) —
 * yani Ayarlar'dan da değiştirilemiyor. Sahibi olarak değiştirmen gerektiğinde
 * yol burası; şifre DÖRT yerde birden duruyor ve biri unutulursa demo bozuluyor:
 *
 *   1. veritabanı  users.password_hash
 *   2. anlık görüntü  database/demo/celikhan-demo.json   (her girişte 1'i ezer)
 *   3. panel          apps/web/src/lib/demoHesap.ts
 *   4. tanıtım sitesi ../projelio-site/src/lib/site.ts
 *
 * 3 ve 4 kaynak dosya olduğu için değişikliğin yayına çıkması yeniden dağıtım ister.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcrypt";

const DEMO_EPOSTA = "ceo@celikhan.test";
/** password.util.ts içindeki BCRYPT_ROUNDS ile aynı olmalı. */
const TUR_SAYISI = 12;

const kok = join(dirname(fileURLToPath(import.meta.url)), "..");
const yeniSifre = process.argv[2];

if (!yeniSifre || yeniSifre.length < 8) {
  console.error("Kullanım: node scripts/demo-sifre-degistir.mjs 'YeniSifre123!'  (en az 8 karakter)");
  process.exit(1);
}
if (Buffer.byteLength(yeniSifre, "utf8") > 72) {
  console.error("Şifre 72 bayttan uzun olamaz (bcrypt sınırı; Türkçe harfler 2 bayt).");
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(join(kok, "backend/.env"), "utf8")
    .split("\n")
    .filter((l) => l.trim() && !l.trim().startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, "")];
    })
);

const hash = await bcrypt.hash(yeniSifre, TUR_SAYISI);

// --- 1. veritabanı ---------------------------------------------------------
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { data: kullanici, error: okumaHatasi } = await supabase
  .from("users")
  .select("id")
  .eq("email", DEMO_EPOSTA)
  .maybeSingle();
if (okumaHatasi) throw okumaHatasi;
if (!kullanici) {
  console.error(`${DEMO_EPOSTA} veritabanında yok. Yanlış ortama mı bakıyorsun?`);
  process.exit(1);
}
const { error: yazmaHatasi } = await supabase
  .from("users")
  .update({ password_hash: hash })
  .eq("id", kullanici.id);
if (yazmaHatasi) throw yazmaHatasi;
console.log("  ✓ veritabanı");

// --- 2. anlık görüntü ------------------------------------------------------
const anlikYol = join(kok, "database/demo/celikhan-demo.json");
if (existsSync(anlikYol)) {
  const anlik = JSON.parse(readFileSync(anlikYol, "utf8"));
  const satir = anlik.find((t) => t.table === "users")?.rows.find((r) => r.email === DEMO_EPOSTA);
  if (!satir) {
    console.error("Anlık görüntüde demo kullanıcısı bulunamadı; dosya elden geçirilmeli.");
    process.exit(1);
  }
  satir.password_hash = hash;
  writeFileSync(anlikYol, JSON.stringify(anlik));
  console.log("  ✓ anlık görüntü");
} else {
  console.log("  ! anlık görüntü yok (database/demo/celikhan-demo.json) — atlandı");
}

// --- 3 ve 4. kaynak dosyalar ----------------------------------------------
/** Dosyada tek bir yerde geçen şifre metnini değiştirir; bulamazsa hata verir. */
function sifreyiDegistir(yol, kalip, etiket) {
  if (!existsSync(yol)) {
    console.log(`  ! ${etiket} bulunamadı (${yol}) — atlandı`);
    return;
  }
  const icerik = readFileSync(yol, "utf8");
  const eslesme = icerik.match(kalip);
  if (!eslesme) {
    console.error(`${etiket}: şifre satırı bulunamadı, dosya değişmiş olabilir. Elle güncelle: ${yol}`);
    process.exit(1);
  }
  const yeni = icerik.replace(kalip, `${eslesme[1]}${yeniSifre}${eslesme[2]}`);
  writeFileSync(yol, yeni);
  console.log(`  ✓ ${etiket}`);
}

sifreyiDegistir(
  join(kok, "apps/web/src/lib/demoHesap.ts"),
  /(password:\s*")[^"]*(")/,
  "panel (demoHesap.ts)"
);
sifreyiDegistir(
  join(kok, "../projelio-site/src/lib/site.ts"),
  /(password:\s*")[^"]*(")/,
  "tanıtım sitesi (site.ts)"
);

console.log(`\nDemo şifresi güncellendi: ${yeniSifre}`);
console.log("Panel ve site kaynak dosyaları değişti — yayına çıkması için yeniden dağıtman gerekiyor.");
