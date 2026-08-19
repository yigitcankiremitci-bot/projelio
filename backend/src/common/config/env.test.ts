// Backend tsconfig'inde esModuleInterop kapalı (NestJS CommonJS derlemesi
// gereği), bu yüzden namespace import kullanılıyor.
import * as assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { assertRequiredEnv, getCorsOrigins, getJwtExpiresIn, getJwtSecret, isProduction } from "./env";

// Bu testler bir güvenlik regresyonunu kilitliyor. Eskiden JWT_SECRET yedi ayrı
// dosyada `process.env.JWT_SECRET ?? "change-me"` diye okunuyordu; değişken
// tanımsız kaldığında uygulama durmuyor, HERKESÇE BİLİNEN bir sırla token
// imzalamaya devam ediyordu. "change-me" .env.example'da yazılı olduğu için
// saldırganın tahmin etmesi bile gerekmiyordu.
//
// Buradaki testler o davranışın geri gelmediğini doğrular. Biri kırılıyorsa
// testi değil kodu düzeltin.

const GECERLI_SIR = "kEo3n2Yb7pQxV1sLdA9fRtUwZmCgHjNi"; // 32 karakter, örnek değil

const KORUNAN = ["NODE_ENV", "JWT_SECRET", "JWT_EXPIRES_IN", "CORS_ORIGINS", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const ILK_HAL = new Map(KORUNAN.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const [k, v] of ILK_HAL) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

/** Üretim ortamında geçerli bir taban yapılandırma kurar. */
function uretimTabani() {
  process.env.NODE_ENV = "production";
  process.env.SUPABASE_URL = "https://ornek.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "servis-anahtari";
  process.env.CORS_ORIGINS = "https://projelio.netlify.app";
  process.env.JWT_SECRET = GECERLI_SIR;
}

describe("JWT_SECRET okuması varsayılana düşmez", () => {
  test("tanımsızsa hata verir — sessizce bir varsayılan kullanmaz", () => {
    uretimTabani();
    delete process.env.JWT_SECRET;
    assert.throws(() => getJwtSecret(), /JWT_SECRET tanımlı değil/);
  });

  test("boş dizeyse hata verir", () => {
    uretimTabani();
    process.env.JWT_SECRET = "   ";
    assert.throws(() => getJwtSecret(), /JWT_SECRET tanımlı değil/);
  });

  test("'change-me' örnek değeri reddedilir", () => {
    uretimTabani();
    process.env.JWT_SECRET = "change-me";
    assert.throws(() => getJwtSecret(), /örnek değerde bırakılmış/);
  });

  test("örnek değer kontrolü büyük/küçük harfe takılmaz", () => {
    uretimTabani();
    process.env.JWT_SECRET = "Change-Me";
    assert.throws(() => getJwtSecret(), /örnek değerde bırakılmış/);
  });

  test("üretimde kısa sır reddedilir", () => {
    uretimTabani();
    process.env.JWT_SECRET = "kisasifre";
    assert.throws(() => getJwtSecret(), /çok kısa/);
  });

  test("geliştirmede kısa sır yalnızca uyarır, akışı kesmez", () => {
    process.env.NODE_ENV = "development";
    process.env.JWT_SECRET = "kisasifre";
    assert.equal(getJwtSecret(), "kisasifre");
  });

  test("geçerli sır olduğu gibi döner ve baştaki/sondaki boşluk kırpılır", () => {
    uretimTabani();
    process.env.JWT_SECRET = `  ${GECERLI_SIR}  `;
    assert.equal(getJwtSecret(), GECERLI_SIR);
  });

  test("hata mesajı sırrın kendisini sızdırmaz", () => {
    // Bu mesajlar log'a ve hata izleme servisine düşüyor.
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = "gizli-ama-kisa";
    try {
      getJwtSecret();
      assert.fail("hata bekleniyordu");
    } catch (error) {
      assert.ok(!(error as Error).message.includes("gizli-ama-kisa"));
    }
  });
});

describe("açılış doğrulaması", () => {
  test("eksik değişkenlerin HEPSİNİ tek hatada bildirir", () => {
    process.env.NODE_ENV = "production";
    delete process.env.JWT_SECRET;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.CORS_ORIGINS = "https://projelio.app";

    try {
      assertRequiredEnv();
      assert.fail("hata bekleniyordu");
    } catch (error) {
      const mesaj = (error as Error).message;
      // Tek tek düzeltip yeniden başlatma turuna girilmesin diye hepsi bir arada.
      assert.match(mesaj, /JWT_SECRET/);
      assert.match(mesaj, /SUPABASE_URL/);
      assert.match(mesaj, /SUPABASE_SERVICE_ROLE_KEY/);
    }
  });

  test("üretimde boş CORS_ORIGINS açılışı durdurur", () => {
    // Eskiden bu durumda API sessizce TÜM kaynaklara açılıyordu.
    uretimTabani();
    process.env.CORS_ORIGINS = "";
    assert.throws(() => assertRequiredEnv(), /CORS_ORIGINS tanımlı değil/);
  });

  test("geliştirmede boş CORS_ORIGINS sorun değil", () => {
    process.env.NODE_ENV = "development";
    process.env.JWT_SECRET = GECERLI_SIR;
    process.env.SUPABASE_URL = "https://ornek.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "servis-anahtari";
    delete process.env.CORS_ORIGINS;
    assert.doesNotThrow(() => assertRequiredEnv());
  });

  test("tam yapılandırma sorunsuz geçer", () => {
    uretimTabani();
    assert.doesNotThrow(() => assertRequiredEnv());
  });
});

describe("sır olmayan ayarlar varsayılan alabilir", () => {
  test("JWT_EXPIRES_IN tanımsızsa 7d", () => {
    delete process.env.JWT_EXPIRES_IN;
    assert.equal(getJwtExpiresIn(), "7d");
  });

  test("JWT_EXPIRES_IN tanımlıysa o değer kullanılır", () => {
    process.env.JWT_EXPIRES_IN = "1h";
    assert.equal(getJwtExpiresIn(), "1h");
  });

  test("CORS_ORIGINS listesi kırpılır ve boşlar atılır", () => {
    process.env.CORS_ORIGINS = " https://a.com , ,https://b.com ,";
    assert.deepEqual(getCorsOrigins(), ["https://a.com", "https://b.com"]);
  });

  test("isProduction yalnızca 'production' için doğru", () => {
    process.env.NODE_ENV = "production";
    assert.equal(isProduction(), true);
    process.env.NODE_ENV = "staging";
    assert.equal(isProduction(), false);
    delete process.env.NODE_ENV;
    assert.equal(isProduction(), false);
  });
});
