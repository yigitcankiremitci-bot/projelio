// .env yüklemesi çalışma dizinine (cwd) bağlı bırakılmaz: backend kök dizinden,
// dist içinden veya bir servis yöneticisi (pm2/systemd) tarafından başlatıldığında
// cwd farklı olur ve "dotenv/config" dosyayı bulamaz — bu durumda uygulama sessizce
// eksik yapılandırmayla açılır. Bu yüzden .env, bu dosyanın konumuna göre mutlak
// yolla yüklenir.
import { existsSync } from "node:fs";
import { join } from "node:path";
import * as dotenv from "dotenv";

const ENV_CANDIDATES = [
  join(__dirname, "..", ".env"), // dist/ içinden çalışırken -> backend/.env
  join(__dirname, "..", "..", ".env"), // dist/src/ içinden çalışırken
  join(process.cwd(), ".env"), // son çare: çalışma dizini
];

const envPath = ENV_CANDIDATES.find((candidate) => existsSync(candidate));
if (envPath) {
  dotenv.config({ path: envPath });
  // Hangi dosyanın yüklendiği çalışma anında da görülebilsin (teşhis için).
  process.env.__PROJELIO_ENV_PATH = envPath;
}

import { NestFactory } from "@nestjs/core";
import { Logger, ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";

async function bootstrap() {
  const logger = new Logger("Bootstrap");
  logger.log(envPath ? `Ortam değişkenleri yüklendi: ${envPath}` : "UYARI: .env dosyası bulunamadı!");

  // Yapılandırma eksikse sorunu çalışma anında değil, açılışta görelim.
  const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "JWT_SECRET"];
  const missing = required.filter((key) => !process.env[key]?.trim());
  if (missing.length) logger.error(`Eksik zorunlu ortam değişkenleri: ${missing.join(", ")}`);

  if (process.env.ANTHROPIC_API_KEY?.trim()) {
    logger.log(`Projelio AI etkin · model=${process.env.ANTHROPIC_MODEL?.trim() || "claude-haiku-4-5-20251001"}`);
  } else {
    logger.warn("Projelio AI devre dışı: ANTHROPIC_API_KEY tanımlı değil (backend/.env).");
  }

  const app = await NestFactory.create(AppModule);

  // CORS: geliştirmede her yere açık, üretimde yalnızca izin verilen alan adlarına.
  // CORS_ORIGINS virgülle ayrılmış liste alır, örn:
  //   CORS_ORIGINS=https://projelio.netlify.app,https://projelio.com
  const corsOrigins = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (corsOrigins.length) {
    app.enableCors({ origin: corsOrigins, credentials: true });
    logger.log(`CORS kısıtlı: ${corsOrigins.join(", ")}`);
  } else {
    app.enableCors();
    logger.warn("CORS tüm kaynaklara açık. Üretimde CORS_ORIGINS tanımlayın.");
  }

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Render gibi platformlar dinlenen adresi 0.0.0.0 bekler; yalnızca localhost'a
  // bağlanılırsa dışarıdan erişilemez ve sağlık kontrolü başarısız olur.
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, "0.0.0.0");
  logger.log(`Backend hazır · port ${port}`);
}
bootstrap();
