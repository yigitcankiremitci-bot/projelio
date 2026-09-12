// Backend tsconfig'inde esModuleInterop kapalı, bu yüzden namespace import.
import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adminMesajEpostasiOlustur } from "./admin-mesaj-eposta";

const temel = {
  locale: "tr" as const,
  baslik: "Bakım duyurusu",
  mesaj: "Merhaba.\nYarın 03:00'te kısa bir bakım var.\n\nTeşekkürler.",
  webUrl: "https://app.projelio.test",
};

describe("adminMesajEpostasiOlustur", () => {
  it("başlığı ve mesajı hem HTML hem düz metne koyar, paragrafları ayırır", () => {
    const mail = adminMesajEpostasiOlustur(temel);
    assert.equal(mail.subject, "Projelio — Bakım duyurusu");
    assert.ok(mail.html.includes("Bakım duyurusu"));
    assert.ok(mail.html.includes("Merhaba.<br>Yarın 03:00&#39;te kısa bir bakım var."));
    assert.equal((mail.html.match(/<p style="margin:0 0 14px/g) ?? []).length, 2);
    assert.ok(mail.text.includes("Yarın 03:00'te kısa bir bakım var."));
  });

  it("yöneticinin yazdığı HTML'i kaçırır", () => {
    const mail = adminMesajEpostasiOlustur({ ...temel, baslik: "<b>x</b>", mesaj: "<script>alert(1)</script>", ad: "<i>Ali</i>" });
    assert.ok(!mail.html.includes("<script>"));
    assert.ok(!mail.html.includes("<b>x</b>"));
    assert.ok(!mail.html.includes("<i>Ali</i>"));
    assert.ok(mail.html.includes("&lt;script&gt;"));
  });

  it("uygulama içi yolu tam adrese çevirir, https adresini olduğu gibi bırakır", () => {
    assert.ok(adminMesajEpostasiOlustur({ ...temel, link: "/settings" }).html.includes("https://app.projelio.test/settings"));
    assert.ok(adminMesajEpostasiOlustur({ ...temel, link: "https://projelio.app/x" }).text.includes("https://projelio.app/x"));
  });

  it("konu satırındaki satır sonu başlık enjeksiyonuna dönüşmez", () => {
    const mail = adminMesajEpostasiOlustur({ ...temel, baslik: "a\r\nBcc: x@y.com" });
    assert.ok(!/[\r\n]/.test(mail.subject));
  });
});
