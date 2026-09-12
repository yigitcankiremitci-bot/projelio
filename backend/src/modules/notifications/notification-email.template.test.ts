import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { bildirimEpostasiOlustur } from "./notification-email.template";

const temel = {
  locale: "tr" as const,
  kip: "gunluk" as const,
  bildirimler: [{ baslik: "Yeni görev", govde: "Can seni bir göreve atadı", link: "/tasks" }],
  gorevler: { geciken: [], bugun: [], yarin: [] },
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

  it("geciken görevlerde tarih yazar, bugün/yarın bölümünde yazmaz", () => {
    const mail = bildirimEpostasiOlustur({
      ...temel,
      bildirimler: [],
      gorevler: {
        geciken: [{ baslik: "Mastering", gun: "2026-09-01" }],
        bugun: [{ baslik: "Bugünkü iş", gun: "2026-09-12" }],
        yarin: [{ baslik: "Yarınki iş", gun: "2026-09-13" }],
      },
    });
    assert.ok(mail.html.includes("Geciken görevlerin"));
    assert.ok(mail.html.includes("Bugün biten görevlerin"));
    assert.ok(mail.html.includes("Yarın biten görevlerin"));
    // Geciken satırında tarih etiketi var; bugün/yarın satırlarında yok.
    assert.ok(/1 Eyl/.test(mail.html), `geciken tarihi yazılmamış: ${mail.html.slice(0, 200)}`);
    assert.ok(!mail.html.includes("13 Eyl"), "yarın bölümünde tarih yazılmamalı");
  });

  it("yalnızca geciken varsa özet yine üretilir", () => {
    const mail = bildirimEpostasiOlustur({
      ...temel,
      bildirimler: [],
      gorevler: { geciken: [{ baslik: "Unutulmuş iş", gun: "2026-09-01" }], bugun: [], yarin: [] },
    });
    assert.ok(mail.html.includes("Unutulmuş iş"));
    assert.ok(mail.text.includes("Unutulmuş iş"));
  });

  it("tüm bölümler birlikte 12 kalemle sınırlı — üç bölüme 12'şer kalem e-postayı kırptırırdı", () => {
    const cok = (onek: string, gun: string, adet: number) =>
      Array.from({ length: adet }, (_, i) => ({ baslik: `${onek}${i}`, gun }));
    const mail = bildirimEpostasiOlustur({
      ...temel,
      bildirimler: [],
      gorevler: {
        geciken: cok("G", "2026-09-01", 10),
        bugun: cok("B", "2026-09-12", 10),
        yarin: cok("Y", "2026-09-13", 10),
      },
    });
    assert.ok(mail.html.includes("G9"), "geciken bölümü tamamen girmeli");
    assert.ok(mail.html.includes("B1"), "bütçenin kalanı bugüne geçmeli");
    assert.ok(!mail.html.includes("Y0"), "bütçe bitince yarın bölümü hiç yazılmamalı");
    assert.ok(mail.html.includes("18"), "kalan görev sayısı yazılmalı");
  });

  it("günlük özette görevler ayrı bölümde listelenir", () => {
    const mail = bildirimEpostasiOlustur({
      ...temel,
      gorevler: { geciken: [], bugun: [{ baslik: "Kapak tasarımı", saat: "14:30" }], yarin: [] },
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

  it("abonelik adresi verilince hem bağlantı hem List-Unsubscribe başlıkları çıkar", () => {
    const adres = "https://api.projelio.test/notifications/eposta-kapat?u=abc&i=deadbeef";
    const mail = bildirimEpostasiOlustur({ ...temel, abonelikAdresi: adres });
    assert.ok(mail.html.includes("eposta-kapat"));
    assert.ok(mail.text.includes(adres));
    // Tek tık için İKİSİ de şart: yalnız List-Unsubscribe, sağlayıcıya düğme
    // göstertmez (bkz. şablondaki gerekçe).
    assert.equal(mail.headers?.["List-Unsubscribe"], `<${adres}>`);
    assert.equal(mail.headers?.["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  });

  it("abonelik adresi yoksa başlık da üretilmez", () => {
    assert.equal(bildirimEpostasiOlustur(temel).headers, undefined);
  });

  it("İngilizce dilde konu da çevrilir", () => {
    const mail = bildirimEpostasiOlustur({ ...temel, locale: "en" });
    assert.ok(!mail.subject.includes("bugünkü"), `konu çevrilmemiş: ${mail.subject}`);
    assert.ok(mail.html.includes('lang="en"'));
  });
});
