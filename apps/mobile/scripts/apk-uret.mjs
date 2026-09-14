#!/usr/bin/env node
/**
 * Telefonda denenecek APK'yı üretir: web'i derler, Capacitor'a kopyalar,
 * Gradle'ı çağırır ve çıktıyı output/ altına tarihli bir adla koyar.
 *
 * NEDEN AYRI BETİK: üç şeyin de aynı anda doğru olması gerekiyor —
 * VITE_API_URL (yanlışsa uygulama açılır ama HİÇBİR isteği başarılı olmaz),
 * JAVA_HOME (Gradle 21 istiyor, macOS'un varsayılanı yok) ve ANDROID_HOME.
 * Üçü de elle verildiğinde eninde sonunda biri unutuluyor ve ortaya çıkan
 * hata sebebini söylemiyor. Burada tek yerden veriliyor.
 *
 * Araç zinciri Homebrew ile DEĞİL, doğrudan üreticiden ev dizinine kuruldu:
 * bu makine Intel Mac ve Homebrew orada artık hazır paket üretmiyor
 * (kaynaktan derlemek saatler sürüyor). Yollar aşağıdaki gibi; başka bir
 * makinede JAVA_HOME / ANDROID_HOME ortam değişkeni verilerek ezilebilir.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const mobilKok = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoKok = resolve(mobilKok, "../..");

/** Kabuğa gömülecek API adresi. Derleme anında sabitlenir, sonradan değişmez. */
const API_URL = process.env.VITE_API_URL ?? "https://api.projelio.app";

function jdkBul() {
  if (process.env.JAVA_HOME) return process.env.JAVA_HOME;
  const kok = join(homedir(), ".projelio-toolchain");
  const jdk = existsSync(kok) && readdirSync(kok).find((ad) => ad.startsWith("jdk-21"));
  if (!jdk) {
    throw new Error(
      "JDK 21 bulunamadı. Beklenen yer: ~/.projelio-toolchain/jdk-21*\n" +
        "Kurulum: https://api.adoptium.net/v3/binary/latest/21/ga/mac/x64/jdk/hotspot/normal/eclipse\n" +
        "indirilip ~/.projelio-toolchain altına açılır. JAVA_HOME ile de verilebilir."
    );
  }
  return join(kok, jdk, "Contents/Home");
}

function sdkBul() {
  const yol = process.env.ANDROID_HOME ?? join(homedir(), "Library/Android/sdk");
  if (!existsSync(join(yol, "platforms"))) {
    throw new Error(
      `Android SDK bulunamadı (${yol}).\n` +
        "cmdline-tools indirilip ~/Library/Android/sdk/cmdline-tools/latest altına açılır, sonra:\n" +
        '  sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"'
    );
  }
  return yol;
}

const ortam = { ...process.env, JAVA_HOME: jdkBul(), ANDROID_HOME: sdkBul() };

function calistir(komut, argumanlar, cwd) {
  execFileSync(komut, argumanlar, { cwd, env: ortam, stdio: "inherit" });
}

console.log(`\n▸ Web derleniyor (VITE_API_URL=${API_URL})`);
execFileSync("npm", ["run", "build", "--workspace", "@projelio/web"], {
  cwd: repoKok,
  env: { ...ortam, VITE_API_URL: API_URL },
  stdio: "inherit",
});

console.log("\n▸ Capacitor eşitleniyor");
calistir("npx", ["cap", "sync", "android"], mobilKok);

// local.properties git'e girmiyor (makineye özel) — her derlemede tazeleniyor.
const androidKok = join(mobilKok, "android");
execFileSync("sh", ["-c", `echo "sdk.dir=${ortam.ANDROID_HOME}" > local.properties`], {
  cwd: androidKok,
  env: ortam,
});

// --aab: Play'e yüklenen paket biçimi (Android App Bundle). APK yalnızca elden
// dağıtım ve deneme için; Play yeni uygulamalarda APK kabul etmiyor.
const aab = process.argv.includes("--aab");
const surum = aab || process.argv.includes("--release") ? "Release" : "Debug";

if (aab && !existsSync(join(androidKok, "keystore.properties"))) {
  throw new Error(
    "Yayın imzası yapılandırılmamış: apps/mobile/android/keystore.properties yok.\n" +
      "İmzasız bir AAB'yi Play reddeder. Kurulum: docs/mobil-yayin.md"
  );
}

const gorev = aab ? "bundleRelease" : `assemble${surum}`;
console.log(`\n▸ Gradle: ${gorev}`);
calistir("./gradlew", [gorev], androidKok);

const kaynak = aab
  ? join(androidKok, "app/build/outputs/bundle/release/app-release.aab")
  : join(androidKok, `app/build/outputs/apk/${surum.toLowerCase()}/app-${surum.toLowerCase()}.apk`);
const damga = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "").replace(/(\d{8})(\d{4})/, "$1-$2");
const hedefKlasor = join(repoKok, "output");
mkdirSync(hedefKlasor, { recursive: true });
const hedef = join(hedefKlasor, `projelio-${damga}.${aab ? "aab" : "apk"}`);
copyFileSync(kaynak, hedef);

console.log(`\n✓ ${aab ? "AAB" : "APK"} hazır: ${hedef}\n`);
