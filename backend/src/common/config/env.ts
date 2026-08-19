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

/** CORS_ORIGINS virgülle ayrılmış liste. Boş dizi = tanımlanmamış. */
export function getCorsOrigins(): string[] {
  return (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
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

  if (problems.length) {
    throw new Error(
      `Ortam değişkeni yapılandırması eksik veya güvensiz — uygulama başlatılmadı:\n${problems.join("\n")}`
    );
  }
}
