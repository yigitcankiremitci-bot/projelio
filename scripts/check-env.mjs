// Açılış yapılandırmasını, sunucuyu başlatmadan doğrular.
//
// NEDEN: assertRequiredEnv() eksik/bozuk yapılandırmada süreci sonlandırıyor.
// Bu iyi (yanlış yapılandırmayla sessizce açılmaktansa hiç açılmamak yeğdir)
// ama deploy sırasında öğrenmek can sıkıcı. Bu betik aynı kontrolü önceden,
// yerelde çalıştırır. Kontrolü KOPYALAMAZ — gerçek fonksiyonu çağırır ki
// ikisi birbirinden ayrı düşmesin.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const kok = dirname(dirname(fileURLToPath(import.meta.url)));
const envYolu = join(kok, "backend", ".env");
if (existsSync(envYolu)) dotenv.config({ path: envYolu });

// Komut satırından geçici değer denemek için:
//   node scripts/check-env.mjs --cors "https://projelio.com" --production
const argv = process.argv.slice(2);
const corsIndex = argv.indexOf("--cors");
if (corsIndex !== -1 && argv[corsIndex + 1]) process.env.CORS_ORIGINS = argv[corsIndex + 1];
if (argv.includes("--production")) process.env.NODE_ENV = "production";

const { assertRequiredEnv, getCorsOrigins, isProduction } = await import(
  join(kok, "backend", "src", "common", "config", "env.ts")
);

console.log(`Ortam        : ${isProduction() ? "production" : process.env.NODE_ENV || "(tanımsız)"}`);
const origins = getCorsOrigins();
console.log(`CORS_ORIGINS : ${origins.length ? origins.join(", ") : "(boş)"}`);
if (!isProduction() && !origins.length) {
  console.log("               ↑ geliştirmede boş olması normal, CORS herkese açık kalır.");
}

try {
  assertRequiredEnv();
  console.log("\n✅ Yapılandırma geçerli — sunucu bu ayarlarla açılır.");
} catch (error) {
  console.error(`\n❌ Sunucu bu ayarlarla AÇILMAZ:\n${error.message}`);
  process.exit(1);
}
