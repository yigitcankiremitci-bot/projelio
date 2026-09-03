import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  DEFAULT_LIO_KOMUT,
  decideLioKomut,
  isLioCommandEnabled,
  lioKomutConfigFromEnv,
} from "./lio-komut-sinir";

const config = DEFAULT_LIO_KOMUT;
const fresh = { sentLastHour: 0 };

describe("isLioCommandEnabled", () => {
  test("değişken yoksa KAPALI", () => {
    // Varsayılanın kapalı olması bilinçli: özellik sunucuda elle açılır.
    assert.equal(isLioCommandEnabled({}), false);
  });

  test("1 / true / evet açar", () => {
    for (const v of ["1", "true", "TRUE", "evet"]) {
      assert.equal(isLioCommandEnabled({ WHATSAPP_LIO_KOMUT: v }), true, v);
    }
  });

  test("0 ve boş kapalı bırakır", () => {
    for (const v of ["0", "", "hayir", "false"]) {
      assert.equal(isLioCommandEnabled({ WHATSAPP_LIO_KOMUT: v }), false, v);
    }
  });
});

describe("decideLioKomut", () => {
  test("normal istek geçer ve kırpılır", () => {
    const karar = decideLioKomut(config, "  günlük bütçe raporu çıkar  ", fresh);
    assert.equal(karar.allowed, true);
    assert.equal(karar.allowed && karar.text, "günlük bütçe raporu çıkar");
  });

  test("boş mesaj sessizce düşer (cevap yok)", () => {
    const karar = decideLioKomut(config, "   ", fresh);
    assert.equal(karar.allowed, false);
    assert.equal(karar.allowed === false && karar.reason, "empty");
    // Fotoğraf/boş mesaja "anlamadım" demek gürültü olurdu.
    assert.equal(karar.allowed === false && karar.reply, undefined);
  });

  test("çok uzun metin reddedilir ve kullanıcı bilgilendirilir", () => {
    const karar = decideLioKomut(config, "a".repeat(config.maxLength + 1), fresh);
    assert.equal(karar.allowed, false);
    assert.equal(karar.allowed === false && karar.reason, "too_long");
    assert.match(karar.allowed === false ? karar.reply! : "", /uygulama/i);
  });

  test("tam sınırdaki metin geçer", () => {
    const karar = decideLioKomut(config, "a".repeat(config.maxLength), fresh);
    assert.equal(karar.allowed, true);
  });

  test("saatlik tavan dolunca reddedilir", () => {
    const karar = decideLioKomut(config, "merhaba", { sentLastHour: config.perHour });
    assert.equal(karar.allowed, false);
    assert.equal(karar.allowed === false && karar.reason, "per_hour");
    assert.ok(karar.allowed === false && karar.reply);
  });

  test("tavanın bir altı hâlâ geçer", () => {
    const karar = decideLioKomut(config, "merhaba", { sentLastHour: config.perHour - 1 });
    assert.equal(karar.allowed, true);
  });

  test("boşluk kontrolü tavandan ÖNCE gelir", () => {
    // Boş mesaj kotadan yemez: kullanıcı fotoğraf attı diye hakkı azalmasın.
    const karar = decideLioKomut(config, "", { sentLastHour: config.perHour });
    assert.equal(karar.allowed === false && karar.reason, "empty");
  });
});

describe("lioKomutConfigFromEnv", () => {
  test("tanımsızsa varsayılan", () => {
    assert.deepEqual(lioKomutConfigFromEnv({}), DEFAULT_LIO_KOMUT);
  });

  test("env değeri okunur", () => {
    const c = lioKomutConfigFromEnv({ WHATSAPP_LIO_SAATLIK: "3", WHATSAPP_LIO_MAX_UZUNLUK: "50" });
    assert.equal(c.perHour, 3);
    assert.equal(c.maxLength, 50);
  });

  test("geçersiz/sıfır değer varsayılana düşer", () => {
    // perHour=0 özelliği sessizce kapatırdı; kapatmanın yolu bayrak.
    const c = lioKomutConfigFromEnv({ WHATSAPP_LIO_SAATLIK: "0", WHATSAPP_LIO_MAX_UZUNLUK: "abc" });
    assert.deepEqual(c, DEFAULT_LIO_KOMUT);
  });
});
