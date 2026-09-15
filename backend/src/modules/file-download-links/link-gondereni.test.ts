import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { linkGondereni } from "./link-gondereni";

describe("linkGondereni", () => {
  it("EMAIL_FROM_LINK tanımlıysa onu kullanır", () => {
    assert.equal(
      linkGondereni("Projelio <bildirim@projelio.app>", "Dosya <paylas@projelio.app>"),
      "Dosya <paylas@projelio.app>"
    );
  });

  it("EMAIL_FROM'un alan adında link@ üretir", () => {
    assert.equal(linkGondereni("Projelio <bildirim@projelio.app>", undefined), "Projelio <link@projelio.app>");
  });

  it("çıplak adresten de alan adını çıkarır", () => {
    assert.equal(linkGondereni("bildirim@projelio.app", ""), "Projelio <link@projelio.app>");
  });

  // Kum havuzunda link@ diye bir adres yok: uydurmak her gönderimi 403 yapardı.
  it("Resend kum havuzunda null döner", () => {
    assert.equal(linkGondereni("Projelio <onboarding@resend.dev>", undefined), null);
  });

  it("EMAIL_FROM yoksa null döner", () => {
    assert.equal(linkGondereni(undefined, undefined), null);
  });

  it("geçersiz EMAIL_FROM_LINK sessizce kabul edilmez", () => {
    assert.equal(linkGondereni("bildirim@projelio.app", "link at projelio nokta app"), null);
  });
});
