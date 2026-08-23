// Backend tsconfig'inde esModuleInterop kapalı (NestJS CommonJS derlemesi
// gereği), bu yüzden namespace import kullanılıyor.
import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { LoginAttemptService } from "./login-attempt.service";

// Kilit mantığı yanlış kurulursa meşru kullanıcıyı dışarıda bırakır; asıl riski
// burada tutuyoruz: kaçıncı denemede kilitlendiği ve doğru şifrenin sayacı
// temizlediği.

function failTimes(service: LoginAttemptService, email: string, times: number): void {
  for (let i = 0; i < times; i++) service.recordFailure(email);
}

describe("LoginAttemptService", () => {
  test("5. başarısız denemeden sonra hesap kilitlenir", () => {
    const service = new LoginAttemptService();

    failTimes(service, "a@ornek.com", 4);
    assert.doesNotThrow(() => service.assertNotLocked("a@ornek.com"), "4 deneme kilitlememeli");

    service.recordFailure("a@ornek.com");
    assert.throws(() => service.assertNotLocked("a@ornek.com"), /Çok fazla başarısız giriş/);
  });

  test("yanıt gövdesi NESNE ve kalan süreyi taşır", () => {
    const service = new LoginAttemptService();
    failTimes(service, "sayac@ornek.com", 5);

    try {
      service.assertNotLocked("sayac@ornek.com");
      assert.fail("kilitlenmesi bekleniyordu");
    } catch (error: any) {
      const govde = error.getResponse();
      // Düz metin gövde ön yüzde "API error 429" olarak görünüyordu; mesajın
      // okunabilmesi için nesne olmak ZORUNDA (bkz. api/client.ts).
      assert.equal(typeof govde, "object", "gövde nesne olmalı, düz metin değil");
      assert.match(govde.message, /Çok fazla başarısız giriş/);
      // Geri sayım bu alandan besleniyor; 15 dakikalık kilitte makul aralık.
      assert.ok(govde.retryAfterSeconds > 890 && govde.retryAfterSeconds <= 900, `beklenmedik süre: ${govde.retryAfterSeconds}`);
    }
  });

  test("doğru şifre sayacı sıfırlar", () => {
    const service = new LoginAttemptService();

    failTimes(service, "b@ornek.com", 4);
    service.reset("b@ornek.com");

    failTimes(service, "b@ornek.com", 4);
    assert.doesNotThrow(() => service.assertNotLocked("b@ornek.com"), "sıfırlandıktan sonra hak yeniden dolmalı");
  });

  test("e-posta büyük/küçük harf ve boşluktan bağımsız aynı hesaptır", () => {
    const service = new LoginAttemptService();

    failTimes(service, "c@ornek.com", 3);
    failTimes(service, "  C@Ornek.COM  ", 2);

    assert.throws(() => service.assertNotLocked("c@ornek.com"));
  });

  test("bir hesabın kilidi diğerini etkilemez", () => {
    const service = new LoginAttemptService();

    failTimes(service, "d@ornek.com", 5);
    assert.throws(() => service.assertNotLocked("d@ornek.com"));
    assert.doesNotThrow(() => service.assertNotLocked("e@ornek.com"));
  });
});
