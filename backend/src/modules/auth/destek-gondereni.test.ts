// Backend tsconfig'inde esModuleInterop kapalı, bu yüzden namespace import.
import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adresiAyikla, destekGondereni } from "./destek-gondereni";

describe("destekGondereni", () => {
  it("EMAIL_FROM alan adında destek@ üretir", () => {
    assert.deepEqual(destekGondereni("Projelio <bildirim@projelio.app>", undefined), {
      from: "Projelio Destek <destek@projelio.app>",
      replyTo: "destek@projelio.app",
    });
  });

  it("EMAIL_FROM_DESTEK tanımlıysa onu kullanır", () => {
    assert.deepEqual(destekGondereni("Projelio <bildirim@projelio.app>", "Can <can@projelio.app>"), {
      from: "Can <can@projelio.app>",
      replyTo: "can@projelio.app",
    });
  });

  it("kum havuzu ya da eksik ayarda adres uydurmaz", () => {
    assert.equal(destekGondereni("Projelio <onboarding@resend.dev>", undefined), null);
    assert.equal(destekGondereni(undefined, undefined), null);
    assert.equal(destekGondereni("gecersiz", undefined), null);
  });
});

describe("adresiAyikla", () => {
  it("ad ve köşeli parantezli biçimi çözer", () => {
    assert.equal(adresiAyikla("Projelio <bildirim@projelio.app>"), "bildirim@projelio.app");
    assert.equal(adresiAyikla("bildirim@projelio.app"), "bildirim@projelio.app");
    assert.equal(adresiAyikla("Projelio"), null);
  });
});
