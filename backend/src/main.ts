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
import { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";

async function bootstrap() {
  const logger = bootstrapLogger;

  // Yerelde çalışırken CANLI veritabanına bağlıysan bunu bilmelisin: buradaki
  // her kayıt, silme ve düzenleme gerçek kullanıcıların verisine gider. Uyarı
  // bilerek gürültülü — sessiz olsaydı bir gün "test ediyorum" diye silinen
  // şey gerçek olurdu. Geri dönüş: ./deploy/yerel-canliya-bagla.sh --geri
  const veritabani = process.env.SUPABASE_URL?.trim() ?? "";
  if (process.env.NODE_ENV !== "production" && veritabani.includes("api.projelio.app")) {
    logger.warn("=".repeat(64));
    logger.warn("DİKKAT: Yerel sunucu CANLI veritabanına bağlı (api.projelio.app).");
    logger.warn("Yaptığın her değişiklik gerçek veriye gider. Yedek: ~/Projelio-yedek");
    logger.warn("=".repeat(64));
  }

  if (process.env.ANTHROPIC_API_KEY?.trim()) {
    logger.log(`Projelio AI etkin · model=${process.env.ANTHROPIC_MODEL?.trim() || "claude-haiku-4-5-20251001"}`);
  } else {
    logger.warn("Projelio AI devre dışı: ANTHROPIC_API_KEY tanımlı değil (backend/.env).");
  }

  // rawBody: WhatsApp köprüsünün webhook imzası (HMAC) ham gövde üzerinden
  // doğrulanır; JSON ayrıştırıldıktan sonra yeniden serileştirilen gövde
  // bayt bayt aynı olmayabilir. Nest ham gövdeyi yalnızca bu seçenekle
  // (req.rawBody) saklar. Bkz. whatsapp-webhook.controller.ts
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });

  // Render (ve benzeri PaaS) uygulamayı bir ters vekil sunucunun arkasında çalıştırır.
  // Bu ayar yapılmazsa Express, req.ip olarak istemcinin değil vekil sunucunun iç
  // IP'sini döndürür — o da her kullanıcı için AYNIDIR. Sonuç: IP başına çalışan
  // hız sınırlayıcı (bkz. AuthRateLimitGuard) tüm kullanıcıları tek kovaya koyar;
  // meşru kullanıcılar birbirinin kotasını yer ve tek bir saldırgan dakikada 10
  // istekle giriş ekranını herkese kapatabilir.
  //
  // Neden 1, neden `true` değil: `true` tüm X-Forwarded-For zincirine güvenir;
  // saldırgan bu başlığı kendi uydurduğu IP'lerle doldurup her istekte "farklı
  // IP"den gelmiş gibi görünür ve sınırı tamamen atlar. 1 = "önümde tek bir
  // güvenilir vekil var" demektir: XFF'in sondan bir önceki girdisi, yani
  // Render'ın yazdığı gerçek istemci IP'si alınır, saldırganın baştan eklediği
  // sahte girdiler yok sayılır. Vekil zinciri değişirse bu sayı da güncellenmeli.
  app.set("trust proxy", 1);

  // Güvenlik başlıkları.
  //
  // NE İŞE YARAR, NE İŞE YARAMAZ: burası HTML değil JSON servis eden bir API.
  // Bu yüzden CSP, COOP gibi başlıkların çoğu burada FİİLEN ETKİSİZDİR — onlar
  // belgeyi (document) yükleyen origin için anlamlıdır, ki o Netlify'daki ön
  // yüzdür (bkz. netlify.toml). Buradaki asıl kazanç üç başlık:
  //
  //   * nosniff — tarayıcı Content-Type'a uymayıp içeriği "koklayarak" HTML
  //     sanmasın. Dosya indirme ucu (files.controller content) kullanıcının
  //     yüklediği içeriği kendi alan adımızdan servis ediyor; sniffing açıkken
  //     PDF diye kaydedilmiş bir HTML dosyası tarayıcıda çalışabilirdi.
  //   * HSTS — API'ye bir daha asla http:// ile gidilmesin.
  //   * X-Powered-By'ın kaldırılması — Express sürümünü bedavaya duyurmayalım.
  //
  // İki varsayılan bilerek değiştirildi:
  //   * crossOriginResourcePolicy: helmet varsayılanı "same-origin". Bu API
  //     başka bir origin'den (Netlify) tüketiliyor; "cross-origin" olmazsa
  //     tarayıcı bazı kaynak yüklemelerini engellerdi.
  //   * contentSecurityPolicy: kapalı. JSON yanıtlarında hiçbir şey yapmıyor;
  //     gerçekten gerektiği tek yer dosya içeriği ucu ve orada uca özel,
  //     çok daha sıkı bir CSP veriliyor (bkz. files.controller.ts).
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: false },
    })
  );
  app.disable("x-powered-by");

  // CORS: geliştirmede her yere açık, üretimde yalnızca izin verilen alan adlarına.
  // CORS_ORIGINS virgülle ayrılmış liste alır, örn:
  //   CORS_ORIGINS=https://projelio.netlify.app,https://projelio.com
  const corsOrigins = getCorsOrigins();

  if (corsOrigins.length) {
    // maxAge OLMADAN her istek İKİYE KATLANIYOR. İstemci her çağrıda
    // Authorization + Content-Type + X-Socket-Id gönderiyor; bunlar "basit"
    // başlık sayılmadığı için tarayıcı önce OPTIONS ön uçuşu yapıyor. Bu yanıt
    // Access-Control-Max-Age taşımazsa Chrome onu yalnızca 5 saniye saklıyor,
    // yani pratikte her API çağrısı iki gidiş-dönüş oluyor (ölçüldü: ön uçuş
    // tek başına ~70-90 ms). 7200 Chrome'un üst sınırı — daha büyük yazmak
    // işe yaramaz, sessizce 7200'e kırpılır.
    app.enableCors({ origin: corsOrigins, credentials: true, maxAge: 7200 });
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

  // Adres BİLEREK verilmiyor. İki ayrı gereksinim var ve ikisini de karşılayan
  // tek seçenek bu:
  //
  // 1. Render gibi platformlar dışarıdan erişilebilir bir adres bekler; yalnızca
  //    localhost'a bağlanılırsa sağlık kontrolü başarısız olur.
  // 2. Ama "0.0.0.0" YALNIZCA IPv4 demek. macOS'ta `localhost` önce ::1'e
  //    (IPv6) çözülüyor ve Vite geliştirme sunucusu da yalnızca [::1]'e
  //    bağlanıyor. Backend IPv4'te, sayfa IPv6'da kalınca tarayıcıdaki her
  //    istek "Failed to fetch" ile düşüyordu — sunucu ayakta olmasına ve
  //    curl 127.0.0.1 ile 200 dönmesine rağmen.
  //
  // Adres verilmediğinde Node çift yığın (::) dinler, yani hem IPv4 hem IPv6
  // bağlantılarını kabul eder; IPv6'nın olmadığı ortamlarda kendisi 0.0.0.0'a
  // düşer. Buraya tekrar sabit bir adres yazılacaksa ikisi de sınanmalı:
  // `curl http://127.0.0.1:3000/health` VE `curl "http://[::1]:3000/health"`.
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  logger.log(`Backend hazır · port ${port}`);
}
bootstrap();
