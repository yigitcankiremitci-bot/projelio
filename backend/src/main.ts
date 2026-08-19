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

import { Logger, ValidationPipe } from "@nestjs/common";
import { assertRequiredEnv, getCorsOrigins, isProduction } from "./common/config/env";

// Yapılandırma doğrulaması AppModule import edilmeden ÖNCE, burada çalışır.
//
// NEDEN BURADA: modül ağacı import edilirken JwtModule.register() gövdesi de
// çalışır ve getJwtSecret()'ı çağırır. Doğrulamayı bootstrap() içine bıraksaydık
// JWT_SECRET eksikken önce ham bir import hatası patlar, aşağıdaki toplu ve
// okunur mesaj hiç görünmezdi. (TypeScript CommonJS çıktısında import'lar
// kaynak sırasını korur — yukarıdaki dotenv yüklemesi de aynı kurala dayanıyor.)
const bootstrapLogger = new Logger("Bootstrap");
bootstrapLogger.log(envPath ? `Ortam değişkenleri yüklendi: ${envPath}` : "UYARI: .env dosyası bulunamadı!");

try {
  assertRequiredEnv();
} catch (error) {
  bootstrapLogger.error((error as Error).message);
  process.exit(1);
}

import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";

async function bootstrap() {
  const logger = bootstrapLogger;

  if (process.env.ANTHROPIC_API_KEY?.trim()) {
    logger.log(`Projelio AI etkin · model=${process.env.ANTHROPIC_MODEL?.trim() || "claude-haiku-4-5-20251001"}`);
  } else {
    logger.warn("Projelio AI devre dışı: ANTHROPIC_API_KEY tanımlı değil (backend/.env).");
  }

  const app = await NestFactory.create(AppModule);

  // CORS: geliştirmede her yere açık, üretimde yalnızca izin verilen alan adlarına.
  // CORS_ORIGINS virgülle ayrılmış liste alır, örn:
  //   CORS_ORIGINS=https://projelio.netlify.app,https://projelio.com
  const corsOrigins = getCorsOrigins();

  if (corsOrigins.length) {
    app.enableCors({ origin: corsOrigins, credentials: true });
    logger.log(`CORS kısıtlı: ${corsOrigins.join(", ")}`);
  } else {
    // Üretimde buraya hiç düşülmez: assertRequiredEnv() boş CORS_ORIGINS'i
    // açılışta hata sayar. Yine de savunma amaçlı ikinci bir kontrol duruyor —
    // "yapılandırma unutulursa herkese açıl" davranışı bir daha geri gelmesin.
    if (isProduction()) {
      logger.error("CORS_ORIGINS tanımlı değil. Üretimde API tüm kaynaklara açılamaz.");
      process.exit(1);
    }
    app.enableCors();
    logger.warn("CORS tüm kaynaklara açık (yalnızca geliştirme). Üretimde CORS_ORIGINS tanımlayın.");
  }

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Hangi uç noktada, hangi sebeple hata alındığını log'a yazar. Varsayılan
  // filtre "TypeError: fetch failed" deyip asıl sebebi (error.cause) yutuyordu.
  app.useGlobalFilters(new AllExceptionsFilter());

  // Render gibi platformlar dinlenen adresi 0.0.0.0 bekler; yalnızca localhost'a
  // bağlanılırsa dışarıdan erişilemez ve sağlık kontrolü başarısız olur.
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, "0.0.0.0");
  logger.log(`Backend hazır · port ${port}`);
}
bootstrap();
