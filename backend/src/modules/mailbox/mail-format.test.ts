// Backend tsconfig'inde esModuleInterop kapalı (NestJS CommonJS derlemesi
// gereği), bu yüzden namespace import kullanılıyor.
import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildReplyBody, describeGraphError, escapeHtml, htmlToText, mapMessageDetail } from "./mail-format";

// E-posta biçimlendirmesinin iki riski var ve ikisi de sessiz:
//   1. Kullanıcının metni HTML'e kaçırılmadan gömülürse gönderilen posta bozulur
//      ya da istenmeyen işaretleme taşır.
//   2. Gelen HTML düz metne çevrilirken script/style içeriği "metin" sanılırsa
//      Lio'nun bağlamı çöple dolar.

describe("HTML → düz metin", () => {
  test("etiketler düşer, satır yapısı korunur", () => {
    const html = "<p>Merhaba</p><p>Teklifi ekte gönderiyorum.</p>";
    assert.equal(htmlToText(html), "Merhaba\nTeklifi ekte gönderiyorum.");
  });

  test("script ve style içeriği metne karışmaz", () => {
    const html = "<style>.x{color:red}</style><p>Gövde</p><script>alert(1)</script>";
    assert.equal(htmlToText(html), "Gövde");
  });

  test("br satır sonuna çevrilir", () => {
    assert.equal(htmlToText("Bir<br>İki<br/>Üç"), "Bir\nİki\nÜç");
  });

  test("HTML varlıkları çözülür", () => {
    assert.equal(htmlToText("<p>Fiyat &lt; 100 &amp; kargo&nbsp;dahil</p>"), "Fiyat < 100 & kargo dahil");
  });

  test("boş girdi boş metin", () => {
    assert.equal(htmlToText(undefined), "");
    assert.equal(htmlToText(null), "");
  });
});

describe("yanıt gövdesi", () => {
  test("kullanıcı metni kaçırılır — HTML enjekte edilemez", () => {
    const body = buildReplyBody("<script>alert(1)</script> merhaba");
    assert.ok(!body.includes("<script>"), "script etiketi gövdeye sızdı");
    assert.ok(body.includes("&lt;script&gt;"));
  });

  test("paragraflar ve satır sonları korunur", () => {
    // E-postada paragraf yapısı anlamın parçası; tek bloğa yapışmamalı.
    const body = buildReplyBody("Merhaba,\nNasılsınız?\n\nTeklif ektedir.");
    assert.equal(body, "<p>Merhaba,<br>Nasılsınız?</p><p>Teklif ektedir.</p>");
  });

  test("düz metin imza kaçırılarak eklenir", () => {
    const body = buildReplyBody("Selam", "Ali Veli\nProjelio & Ortakları");
    assert.ok(body.includes("Ali Veli<br>Projelio &amp; Ortakları"));
  });

  test("HTML imza olduğu gibi kalır", () => {
    const body = buildReplyBody("Selam", '<p><b>Ali Veli</b></p>');
    assert.ok(body.includes("<b>Ali Veli</b>"));
  });

  test("imza yoksa fazladan boşluk eklenmez", () => {
    assert.equal(buildReplyBody("Selam"), "<p>Selam</p>");
    assert.equal(buildReplyBody("Selam", "   "), "<p>Selam</p>");
  });

  test("escapeHtml bütün tehlikeli karakterleri kapsar", () => {
    assert.equal(escapeHtml(`<a href="x">&'</a>`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;");
  });
});

describe("Graph ileti eşlemesi", () => {
  const raw = {
    id: "AAMk",
    subject: "  Teklif  ",
    from: { emailAddress: { name: "Ayşe Yılmaz", address: "ayse@ornek.com" } },
    toRecipients: [{ emailAddress: { address: "info@biz.com" } }],
    ccRecipients: [],
    bodyPreview: "Merhaba,\n  teklifinizi   aldık",
    receivedDateTime: "2026-08-19T08:30:00Z",
    isRead: false,
    hasAttachments: true,
    body: { contentType: "html", content: "<p>Merhaba</p>" },
    attachments: [{ id: "att1", name: "teklif.pdf", contentType: "application/pdf", size: 1024 }],
  };

  test("konu kırpılır, önizleme tek satıra iner", () => {
    const detail = mapMessageDetail(raw);
    assert.equal(detail.subject, "Teklif");
    assert.equal(detail.preview, "Merhaba, teklifinizi aldık");
  });

  test("HTML gövde hem ham hem düz metin olarak taşınır", () => {
    const detail = mapMessageDetail(raw);
    assert.equal(detail.bodyHtml, "<p>Merhaba</p>");
    assert.equal(detail.bodyText, "Merhaba");
  });

  test("konusuz ileti listede boş satır bırakmaz", () => {
    assert.equal(mapMessageDetail({ ...raw, subject: "   " }).subject, "(konu yok)");
  });

  test("düz metin gövdede HTML alanı boş kalır", () => {
    const detail = mapMessageDetail({ ...raw, body: { contentType: "text", content: " sade metin " } });
    assert.equal(detail.bodyHtml, undefined);
    assert.equal(detail.bodyText, "sade metin");
  });

  test("adressiz alıcılar listeye girmez", () => {
    const detail = mapMessageDetail({ ...raw, toRecipients: [{ emailAddress: {} }, ...raw.toRecipients] });
    assert.deepEqual(detail.to, [{ name: undefined, address: "info@biz.com" }]);
  });

  test("ekler ad ve boyutla gelir", () => {
    assert.deepEqual(mapMessageDetail(raw).attachments, [
      { id: "att1", name: "teklif.pdf", contentType: "application/pdf", sizeBytes: 1024 },
    ]);
  });
});

describe("Graph hataları", () => {
  test("jeton hatası eyleme dönük cümleye çevrilir", () => {
    const body = JSON.stringify({ error: { code: "InvalidAuthenticationToken", message: "Access token expired." } });
    assert.match(describeGraphError(401, body), /yeniden bağlayın/i);
  });

  test("erişim reddi paylaşılan kutu ipucu verir", () => {
    assert.match(describeGraphError(403, "{}"), /tam erişim/i);
  });

  test("bilinmeyen hata teknik mesajı korur", () => {
    const body = JSON.stringify({ error: { code: "Weird", message: "Something specific happened" } });
    assert.equal(describeGraphError(500, body), "Something specific happened");
  });

  test("JSON olmayan gövde çuvallamaz", () => {
    assert.equal(describeGraphError(502, "<html>Bad Gateway</html>"), "Posta servisi hata döndürdü (502).");
  });
});
