/**
 * Tur seslendirme yardımcısı.
 *
 *   node scripts/tour-audio.mjs metin     -> seslendirmene verilecek metin dosyasını üretir
 *   node scripts/tour-audio.mjs eksik     -> hangi mp3'lerin hâlâ yüklenmediğini listeler
 *   node scripts/tour-audio.mjs manifest  -> makine okunur JSON (AI seslendirme toplu üretimi için)
 *
 * Ses dosyalarının konacağı yer:
 *   apps/web/public/tour-audio/tr/<turId>/<adimId>.mp3
 * Dosya adı adım id'siyle birebir aynı olmalı; kod tarafında başka bir kayıt
 * tutulmuyor, eşleşme dosya adından yapılıyor.
 */

import { writeFile, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");
const AUDIO_DIR = join(webRoot, "public", "tour-audio", "tr");

/**
 * tours.ts doğrudan içe aktarılır: Node 22.18+ TypeScript dosyalarındaki tip
 * bilgisini kendisi soyup çalıştırabiliyor (type stripping). Ayrı bir derleme
 * adımına ya da ek bağımlılığa gerek yok.
 */
async function loadTours() {
  const entry = join(webRoot, "src", "lib", "tour", "tours.ts");
  try {
    const mod = await import(pathToFileURL(entry).href);
    return mod.TOURS;
  } catch (err) {
    console.error(
      "tours.ts okunamadı. Node 22.18 ya da üstü gerekiyor (TypeScript tip soyma).\n" +
        "Daha eski bir sürümdeysen:  node --experimental-strip-types scripts/tour-audio.mjs " +
        (process.argv[2] ?? "metin")
    );
    throw err;
  }
}

const exists = async (p) => {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
};

const speechOf = (step) => (step.speech ?? step.text).replace(/\s+/g, " ").trim();

const tours = await loadTours();
const mode = process.argv[2] ?? "metin";

if (mode === "metin") {
  const lines = [
    "# Projelio — sesli tur seslendirme metinleri",
    "",
    "Her başlık bir ses dosyasına karşılık gelir. Kaydı MP3 olarak, başlıkta yazan",
    "yola tam o adla koyman yeterli; uygulama dosyayı görünce otomatik olarak",
    "tarayıcı sesi yerine bu kaydı çalar.",
    "",
  ];
  for (const tour of tours) {
    lines.push(`## ${tour.title}  (${tour.id})`, "", `_${tour.description}_`, "");
    for (const step of tour.steps) {
      lines.push(`### public/tour-audio/tr/${tour.id}/${step.id}.mp3`, "", `**${step.title}**`, "", speechOf(step), "");
    }
  }
  const target = join(webRoot, "tour-seslendirme-metinleri.md");
  await writeFile(target, lines.join("\n"), "utf8");
  console.log(`Yazıldı: ${target}`);
  console.log(`${tours.length} tur, ${tours.reduce((n, t) => n + t.steps.length, 0)} ses dosyası.`);
} else if (mode === "eksik") {
  let missing = 0;
  let total = 0;
  for (const tour of tours) {
    for (const step of tour.steps) {
      total += 1;
      const rel = `tour-audio/tr/${tour.id}/${step.id}.mp3`;
      if (!(await exists(join(AUDIO_DIR, tour.id, `${step.id}.mp3`)))) {
        missing += 1;
        console.log(`eksik  public/${rel}`);
      }
    }
  }
  console.log(`\n${total - missing}/${total} kayıt yüklenmiş. Eksikler tarayıcı sesiyle okunur.`);
} else if (mode === "manifest") {
  const manifest = tours.map((tour) => ({
    id: tour.id,
    title: tour.title,
    steps: tour.steps.map((step) => ({
      id: step.id,
      title: step.title,
      text: speechOf(step),
      file: `public/tour-audio/tr/${tour.id}/${step.id}.mp3`,
    })),
  }));
  console.log(JSON.stringify(manifest, null, 2));
} else {
  console.error(`Bilinmeyen komut: ${mode}. Kullan: metin | eksik | manifest`);
  process.exit(1);
}
