import { Logger } from "@nestjs/common";

/**
 * Sır niteliğindeki ortam değişkenlerinin TEK okuma noktası.
 *
 * NEDEN VAR: JWT_SECRET daha önce yedi ayrı dosyada
 *   `process.env.JWT_SECRET ?? "change-me"`
 * şeklinde okunuyordu. Bu kalıbın sorunu, değişken tanımsız kaldığında
 * uygulamanın durmak yerine HERKESÇE BİLİNEN bir sırla token imzalamaya devam
 * etmesiydi: "change-me" değeri .env.example dosyasında yazılı olduğu için
 * saldırganın tahmin etmesi bile gerekmez; istediği kullanıcı kimliği için
 * geçerli bir token üretip her hesaba girebilirdi. Yapılandırma hatası sessiz
 * bir güvenlik açığına dönüşüyordu.
 *
 * KURAL: sır okuması asla varsayılana düşmez. Değer yoksa, örnek değerse ya da
 * fazla kısaysa süreç açılışta durur — çalışma anında değil. Aynı yaklaşım
 * common/crypto/token-crypto.ts içinde de uygulanıyor.
 *
 * Sır OLMAYAN ayarlar (JWT_EXPIRES_IN gibi) varsayılan alabilir; onlarda eksik
 * değer bir açığa değil yalnızca farklı bir davranışa yol açar.
 */

const logger = new Logger("Env");

/** .env.example ve şablonlarda örnek olarak duran, sır sayılamayacak değerler. */
const PLACEHOLDER_SECRETS = new Set([
  "change-me",
  "changeme",
  "change_me",
  "secret",
  "mysecret",
  "your-secret",
  "your-secret-here",
  "todo",
  "xxx",
  "test",
]);

/**
 * Kabaca 128 bit entropiye karşılık gelen asgari uzunluk. `openssl rand -base64 32`
 * 44 karakter üretir; bu sınır elle yazılmış "kisasifre" gibi değerleri eler.
 */
const MIN_SECRET_LENGTH = 24;

export function isProduction(): boolean {
  return (process.env.NODE_ENV ?? "").trim().toLowerCase() === "production";
}

/**
 * Bir sırrı okur ve doğrular. Sorun varsa Error fırlatır.
 *
 * Hata mesajları sırrın KENDİSİNİ değil yalnızca değişken adını içerir; bu
 * mesajlar loglara ve hata izleme servisine düşüyor.
 */
// Doğrulama sonucu (ad + değer) çifti başına bir kez yapılır: her istekte
// yeniden doğrulanmasın ve uyarı satırı log'u doldurmasın. Değere göre
// anahtarlandığı için ortam değişkeni değişirse yeniden doğrulanır.
const validatedSecrets = new Set<string>();

function readSecret(name: string): string {
  const raw = process.env[name]?.trim();

  if (!raw) {
    throw new Error(
      `${name} tanımlı değil. Üretin ve ortam değişkeni olarak tanımlayın: openssl rand -base64 32`
    );
  }

  const cacheKey = name + "\u0000" + raw;
  if (validatedSecrets.has(cacheKey)) return raw;

  if (PLACEHOLDER_SECRETS.has(raw.toLowerCase())) {
    throw new Error(
      `${name} örnek değerde bırakılmış. Bu değer .env.example dosyasında açıkça yazılı olduğu için ` +
        `sır sayılmaz — herkes bu sırla geçerli token üretebilir. Gerçek bir değer üretin: openssl rand -base64 32`
    );
  }

  if (raw.length < MIN_SECRET_LENGTH) {
    const message =
      `${name} çok kısa (${raw.length} karakter, en az ${MIN_SECRET_LENGTH} olmalı). ` +
      `Kaba kuvvetle denenebilir. Üretin: openssl rand -base64 32`;
    // Üretimde durdurur; geliştirmede yalnızca uyarır ki yerel kurulum bozulmasın.
    if (isProduction()) throw new Error(message);
    logger.warn(message);
  }

  validatedSecrets.add(cacheKey);
  return raw;
}

/**
 * JWT imzalama sırrı. JwtModule.register() ve JwtStrategy bunu kullanır —
 * hepsinin AYNI değeri görmesi şart, yoksa bir modülün ürettiği token'ı diğeri
 * doğrulayamaz.
 */
export function getJwtSecret(): string {
  return readSecret("JWT_SECRET");
}

/** Sır değil: eksikse yalnızca oturum ömrü varsayılana döner. */
export function getJwtExpiresIn(): string {
  return process.env.JWT_EXPIRES_IN?.trim() || "7d";
}

/**
 * CORS_ORIGINS virgülle ayrılmış liste. Boş dizi = tanımlanmamış.
 *
 * Değerler NORMALLEŞTİRİLİR. Tarayıcının gönderdiği `Origin` başlığı her zaman
 * `şema://host[:port]` biçimindedir: sonunda eğik çizgi yoktur ve şema/host küçük
 * harftir. Yapılandırmaya `https://projelio.com/` ya da `https://Projelio.com`
 * yazmak son derece doğal görünür ama bu değerler `Origin` ile HİÇBİR ZAMAN
 * eşleşmez — sonuç, "CORS'u kilitledim" sanırken kendi ön yüzünü dışarıda
 * bırakmaktır. Bu sessiz hata, çözmeye çalışan kişiyi `*` yazmaya iter; o yüzden
 * burada baştan düzeltiliyor.
 */
export function getCorsOrigins(): string[] {
  return (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean);
}

/** Sondaki eğik çizgileri atar ve küçük harfe çevirir. Origin'de yol kısmı olmaz. */
function normalizeOrigin(raw: string): string {
  return raw.trim().replace(/\/+$/, "").toLowerCase();
}

/**
 * Ön yüzün genel adresi. Şifre sıfırlama ve e-posta doğrulama bağlantıları ile
 * OAuth dönüş yönlendirmeleri buradan kurulur (5 ayrı serviste kullanılıyordu,
 * her biri kendi `process.env.WEB_APP_URL ?? "http://localhost:5173"` satırını
 * taşıyordu — tek kaynak burası).
 *
 * Sondaki eğik çizgi atılır: adres `${webAppUrl}/reset-password?...` diye
 * birleştiriliyor, sonda çizgi varsa "//reset-password" çıkar.
 *
 * Yereldeki varsayılan bilerek http://localhost — geliştirmede doğrusu bu.
 * Üretimde bu varsayılana DÜŞÜLMEMESİ assertRequiredEnv ile garanti altında.
 */
export function getWebAppUrl(): string {
  const raw = process.env.WEB_APP_URL?.trim();
  return raw ? raw.replace(/\/+$/, "") : "http://localhost:5173";
}

/**
 * Socket.IO gateway'lerinin CORS kaynağı.
 *
 * NEDEN AYRI FONKSİYON: iki gateway (realtime, notifications) CORS_ORIGINS'i
 * kendi içlerinde AYRI AYRI ayrıştırıyordu, yani aynı mantığın üç kopyası vardı
 * ve buradaki normalleştirme onlara hiç ulaşmazdı. Tek kaynak burası.
 *
 * ÜRETİMDE "*" DÖNMEZ. Gateway'ler liste boşken `"*"` kullanıyordu. Pratikte
 * üretimde buraya düşülmüyor (assertRequiredEnv boş CORS_ORIGINS'i açılışta
 * hata sayıp süreci sonlandırıyor), ama bu güvenlik main.ts'teki import
 * sırasına bağlı bir tesadüf — kırılırsa HTTP kilitli kalırken soketler sessizce
 * herkese açılırdı. Üretimde boş liste dönüyoruz: hiçbir kaynağa izin yok.
 */
export function getGatewayCorsOrigin(): string[] | "*" {
  const origins = getCorsOrigins();
  if (origins.length) return origins;
  return isProduction() ? [] : "*";
}

/**
 * Açılışta çağrılır (main.ts). Eksik olan HER şeyi tek seferde toplayıp tek bir
 * hatada bildirir — tek tek düzeltip yeniden başlatma turuna girilmesin diye.
 *
 * Daha önce main.ts bu kontrolü yapıyor ama yalnızca logger.error yazıp
 * uygulamayı AÇMAYA DEVAM EDİYORDU; hatanın fark edilmemesi çok kolaydı.
 */
export function assertRequiredEnv(): void {
  const problems: string[] = [];

  // Sırlar: doğrulamayı readSecret yapar, mesajlarını toplarız.
  for (const check of [() => getJwtSecret()]) {
    try {
      check();
    } catch (error) {
      problems.push(`  - ${(error as Error).message}`);
    }
  }

  // Sır olmayan ama olmazsa olmaz bağlantı ayarları.
  for (const name of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!process.env[name]?.trim()) problems.push(`  - ${name} tanımlı değil.`);
  }

  // CORS üretimde açık uçlu bırakılamaz: tanımsızsa main.ts her kaynağa izin
  // veriyordu, yani yapılandırma unutulduğunda güvenli tarafa değil AÇIK tarafa
  // düşüyordu.
  if (isProduction() && getCorsOrigins().length === 0) {
    problems.push(
      "  - CORS_ORIGINS tanımlı değil. Üretimde boş bırakılırsa API tüm kaynaklara açılır. " +
        "Örn: CORS_ORIGINS=https://projelio.netlify.app"
    );
  }

  // Biçimi bozuk girdiler sessizce "hiçbir şeyle eşleşmeyen" bir kural üretir:
  // cors paketi liste verildiğinde Origin'i tam metin karşılaştırır, yani "*"
  // joker değil düz metin sayılır ve HİÇBİR kaynağa izin vermez. Şemasız bir
  // değer ("projelio.com") de aynı şekilde ölü kuraldır. Bu iki durum "CORS
  // çalışmıyor" diye saatlerce aranır; açılışta söylemek çok daha ucuz.
  for (const origin of getCorsOrigins()) {
    if (origin === "*") {
      problems.push(
        "  - CORS_ORIGINS içinde \"*\" var. Liste hâlinde verildiğinde bu joker değil düz " +
          "metin olarak karşılaştırılır ve hiçbir kaynak eşleşmez. Alan adlarını tek tek yazın."
      );
    } else if (!/^https?:\/\/[^/]+$/.test(origin)) {
      problems.push(
        `  - CORS_ORIGINS içindeki "${origin}" geçerli bir origin değil. ` +
          "Biçim şema://alanadı[:port] olmalı, yol içermemeli. Örn: https://projelio.com"
      );
    }
  }

  // HTTPS zorunluluğu: adres ÜRETEN değerler üretimde https olmalı.
  //
  // NEDEN ÖNEMLİ: WEB_APP_URL yalnızca bir yönlendirme adresi değil — şifre
  // sıfırlama bağlantısı bu adresle kurulup E-POSTAYLA gönderiliyor. http:// ile
  // gönderilen bağlantı yolda okunabilir ve tıklandığı anda hesabı ele geçirmeye
  // yeter. Değişken hiç tanımlanmazsa da kod sessizce "http://localhost:5173"e
  // düşüyordu: kullanıcıya kendi bilgisayarını gösteren, işe yaramaz bir bağlantı
  // gider ve kimse hatayı fark etmez. Açılışta durmak bundan iyidir.
  if (isProduction()) {
    if (!process.env.WEB_APP_URL?.trim()) {
      problems.push(
        "  - WEB_APP_URL tanımlı değil. Şifre sıfırlama ve e-posta doğrulama bağlantıları " +
          '"http://localhost:5173" ile gönderilir; kullanıcı hesabına erişemez. ' +
          "Örn: WEB_APP_URL=https://projelio.com"
      );
    } else {
      problems.push(...httpsProblems("WEB_APP_URL", getWebAppUrl()));
    }

    // BACKEND_URL yalnızca OAuth dönüş adresi türetmek için kullanılıyor ve
    // tanımlanmamış olabilir (GOOGLE_REDIRECT_URI elle verilmişse gerekmez);
    // bu yüzden varsa denetlenir, yoksa sorun sayılmaz.
    const backendUrl = process.env.BACKEND_URL?.trim();
    if (backendUrl) problems.push(...httpsProblems("BACKEND_URL", backendUrl.replace(/\/+$/, "")));
  }

  // Uyarı, hata değil: eksikse yeni kayıtlar doğrulanamaz ve şifre sıfırlama
  // çalışmaz, ama mevcut kullanıcılar giriş yapmaya devam eder. Bu yüzden açılışı
  // engellemek (çalışan bir uygulamayı tamamen kapatmak) orantısız olurdu —
  // ama sessiz kalmak da bu arızanın haftalarca fark edilmemesi demek.
  if (isProduction() && !process.env.RESEND_API_KEY?.trim()) {
    logger.warn(
      "RESEND_API_KEY tanımlı değil. E-posta doğrulama ve şifre sıfırlama e-postaları GÖNDERİLEMEYECEK; " +
        "yeni kullanıcılar hesaplarını doğrulayamaz ve giriş yapamaz."
    );
  }

  if (problems.length) {
    throw new Error(
      `Ortam değişkeni yapılandırması eksik veya güvensiz — uygulama başlatılmadı:\n${problems.join("\n")}`
    );
  }
}


/** Üretimde adres üreten bir değişkenin https ve gerçek bir alan adı olmasını şart koşar. */
function httpsProblems(name: string, value: string): string[] {
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|$|\/)/.test(value)) {
    return [`  - ${name} üretimde yerel adrese ("${value}") ayarlı. Genel alan adını verin.`];
  }
  if (!value.startsWith("https://")) {
    return [
      `  - ${name} HTTPS değil ("${value}"). Bu adresle kurulan bağlantılar e-postayla ` +
        "gönderiliyor ve tarayıcı https sayfadan http isteğini zaten engeller.",
    ];
  }
  return [];
}
