import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { kartvizitBaglantisiniCoz, ozelAdresMi, sayfaMetni, vcfBaglantisiBul } from "./qr-baglanti";

// QR'daki bağlantıyı yabancı biri veriyor ve sunucu açıyor. ozelAdresMi'deki
// bir gerileme, bir QR'ın sunucuya iç ağdaki servisleri (PostgREST, tailnet)
// okutmasına kapı açar.

describe("ozelAdresMi", () => {
  test("iç ağ, döngü, tailnet (CGNAT), bulut meta veri adresi engellenir", () => {
    for (const ip of ["10.0.0.5", "127.0.0.1", "172.20.1.1", "192.168.1.10", "100.111.242.24", "169.254.169.254", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
      assert.equal(ozelAdresMi(ip), true, ip);
    }
  });

  test("herkese açık adresler geçer", () => {
    for (const ip of ["8.8.8.8", "172.32.0.1", "100.128.0.1", "2606:4700::1111"]) assert.equal(ozelAdresMi(ip), false, ip);
  });

  test("IP olmayan değer güvenli sayılmaz", () => {
    assert.equal(ozelAdresMi("localhost"), true);
  });
});

describe("kartvizitBaglantisiniCoz — güvenlik", () => {
  test("iç ağ adresi ve http dışı şema açılmaz", async () => {
    for (const adres of ["http://127.0.0.1/kart", "http://100.111.242.24:3000/", "file:///etc/passwd", "http://user:sifre@ornek.com/"]) {
      const s = await kartvizitBaglantisiniCoz(adres);
      assert.equal(s.kaynak, "acilamadi", adres);
    }
  });
});

describe("vcfBaglantisiBul", () => {
  test("Projelio kartvizit sayfasındaki 'Rehbere Kaydet' bağlantısı bulunur", () => {
    const html = '<a class="save" id="save" href="kartvizit.vcf">Rehbere Kaydet</a>';
    assert.equal(vcfBaglantisiBul(html, "https://ayse.projelio.app/"), "https://ayse.projelio.app/kartvizit.vcf");
  });

  test("/vcard yolu ve download-contact bulunur, sıradan bağlantı bulunmaz", () => {
    assert.equal(vcfBaglantisiBul('<a href="/u/ayse/vcard">kaydet</a>', "https://x.com/u/ayse"), "https://x.com/u/ayse/vcard");
    assert.equal(vcfBaglantisiBul('<a href="https://ornek.com/hakkimizda">x</a>', "https://ornek.com"), null);
  });
});

describe("sayfaMetni", () => {
  test("betik ve stil atılır, başlık ve açıklama başa gelir", () => {
    const html =
      '<html><head><title>Ayşe Yılmaz</title><meta name="description" content="Pazarlama Müdürü, ABC"><style>.a{}</style></head>' +
      "<body><script>gizli()</script><h1>Ayşe</h1><p>+90 532 111 22 33</p></body></html>";
    const m = sayfaMetni(html);
    assert.ok(m.startsWith("Ayşe Yılmaz\nPazarlama Müdürü, ABC"));
    assert.ok(m.includes("+90 532 111 22 33"));
    assert.ok(!m.includes("gizli"));
  });
});
