import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { bildirimEpostasiOlustur } from "./notification-email.template";

const temel = {
  locale: "tr" as const,
  kip: "gunluk" as const,
  bildirimler: [{ baslik: "Yeni görev", govde: "Can seni bir göreve atadı", link: "/tasks" }],
  gorevler: [],
  webUrl: "https://app.projelio.test",
};

describe("bildirimEpostasiOlustur", () => {
  it("bildirimi hem HTML hem düz metin sürümüne koyar", () => {
    const mail = bildirimEpostasiOlustur(temel);
    assert.ok(mail.html.includes("Yeni görev"));
    assert.ok(mail.html.includes("Can seni bir göreve atadı"));
    assert.ok(mail.text.includes("Yeni görev"));
    assert.ok(mail.text.includes("Can seni bir göreve atadı"));
  });

  it("uygulama içi yolu tam adrese çevirir", () => {
    const mail = bildirimEpostasiOlustur(temel);
    assert.ok(mail.html.includes("https://app.projelio.test/tasks"));
    assert.ok(mail.text.includes("https://app.projelio.test/tasks"));
  });

  it("kullanıcı verisini kaçırır — başlıktaki HTML e-postayı bozamaz", () => {
    const mail = bildirimEpostasiOlustur({
      ...temel,
      bildirimler: [{ baslik: '<img src=x onerror="alert(1)">', govde: "a & b < c", link: "/x" }],
    });
    assert.ok(!mail.html.includes("<img"), "ham <img> etiketi HTML'e girmemeli");
    assert.ok(mail.html.includes("&lt;img"));
    assert.ok(mail.html.includes("a &amp; b &lt; c"));
  });

  it("adı da kaçırır ama düz metinde olduğu gibi bırakır", () => {
    const mail = bildirimEpostasiOlustur({ ...temel, ad: "Ay<şe>" });
    assert.ok(!mail.html.includes("Ay<şe>"));
    assert.ok(mail.html.includes("Ay&lt;şe&gt;"));
    assert.ok(mail.text.includes("Ay<şe>"));
  });

  it("uzun listeyi kırpar ve kalanı sayar", () => {
    const bildirimler = Array.from({ length: 20 }, (_, i) => ({ baslik: `Bildirim ${i}`, govde: "x" }));
    const mail = bildirimEpostasiOlustur({ ...temel, bildirimler });
    assert.ok(mail.html.includes("Bildirim 11"));
    assert.ok(!mail.html.includes("Bildirim 12"), "12 kalemden fazlası listelenmemeli");
    assert.ok(mail.html.includes("8"), "kalan sayısı yazılmalı");
  });

  it("günlük özette görevler ayrı bölümde listelenir", () => {
    const mail = bildirimEpostasiOlustur({
      ...temel,
      gorevler: [{ baslik: "Kapak tasarımı", saat: "14:30" }],
    });
    assert.ok(mail.html.includes("Kapak tasarımı"));
    assert.ok(mail.html.includes("14:30"));
    assert.ok(mail.html.includes("Bugün biten görevlerin"));
  });

  it("tek bildirimde konu başlığa, çoklu bildirimde sayıya döner (anlık kip)", () => {
    const tek = bildirimEpostasiOlustur({ ...temel, kip: "anlik" });
    assert.equal(tek.subject, "Projelio — Yeni görev");

    const coklu = bildirimEpostasiOlustur({
      ...temel,
      kip: "anlik",
      bildirimler: [temel.bildirimler[0], { baslik: "İkinci", govde: "y" }],
    });
    assert.ok(coklu.subject.includes("2"));
  });

  it("her e-postada ayar bağlantısı bulunur — kapatma yolu görünmeli", () => {
    const mail = bildirimEpostasiOlustur(temel);
    assert.ok(mail.html.includes("/settings?sekme=yardimcilar"));
    assert.ok(mail.text.includes("/settings?sekme=yardimcilar"));
  });

  it("İngilizce dilde konu da çevrilir", () => {
    const mail = bildirimEpostasiOlustur({ ...temel, locale: "en" });
    assert.ok(!mail.subject.includes("bugünkü"), `konu çevrilmemiş: ${mail.subject}`);
    assert.ok(mail.html.includes('lang="en"'));
  });
});
