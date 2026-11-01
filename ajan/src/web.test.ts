import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { adresGuvenliMi, ddgSonuclari, htmlMetni, ozelAdresMi, varliklariCoz } from "./web.ts";

// Ajan kullanıcının kendi ağında çalışıyor ve okuyacağı adresi bir dil modeli
// seçiyor. Buradaki bir gerileme, bir web sayfasının modeli modemin ya da
// Ollama'nın paneline yönlendirebilmesi demek.

describe("ozelAdresMi", () => {
  test("yerel, Tailscale ve bağlantı-yerel adresler özel", () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "192.168.1.1", "172.16.0.1", "100.111.242.24", "169.254.169.254", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:192.168.1.1"])
      assert.equal(ozelAdresMi(ip), true, ip);
  });

  test("genel adresler serbest", () => {
    for (const ip of ["8.8.8.8", "142.250.187.14", "172.32.0.1", "100.128.0.1", "2a00:1450:4017::200e"]) assert.equal(ozelAdresMi(ip), false, ip);
  });
});

describe("adresGuvenliMi", () => {
  test("http(s) dışı, localhost ve kimlik bilgili adres reddedilir", async () => {
    for (const a of ["file:///etc/passwd", "javascript:alert(1)", "http://localhost:11434/api/tags", "http://127.0.0.1/", "http://[::1]/", "https://kullanici:sifre@ornek.com/", "http://yazici.local/", "bozuk"])
      assert.equal(await adresGuvenliMi(a), false, a);
  });
});

describe("htmlMetni", () => {
  test("betik, stil ve menü atılır, başlık ve varlıklar çözülür", () => {
    const { baslik, metin } = htmlMetni(
      "<html><head><title>Fiyatlar &amp; Paketler</title><style>p{}</style></head><body><nav>Menü</nav><main><h1>Başlık</h1><p>Aylık 10&#8378;</p><script>kotu()</script></main></body></html>"
    );
    assert.equal(baslik, "Fiyatlar & Paketler");
    assert.match(metin, /Başlık\s+Aylık 10₺/);
    assert.doesNotMatch(metin, /Menü|kotu/);
  });
});

describe("varliklariCoz", () => {
  test("adlı ve sayısal varlıklar", () => {
    assert.equal(varliklariCoz("a &lt;b&gt; &#x131; &bilinmeyen;"), "a <b> ı &bilinmeyen;");
  });
});

describe("ddgSonuclari", () => {
  test("yönlendirme bağlantısından asıl adres çıkar, reklam atlanır", () => {
    const html =
      '<div class="result results_links results_links_deep result--ad"><a class="result__a" href="https://duckduckgo.com/y.js?ad=1">Reklam</a></div>' +
      '<div class="result results_links results_links_deep web-result"><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fornek.com%2Ffiyat&amp;rut=x">Örnek <b>Fiyat</b></a>' +
      '<a class="result__snippet" href="#">Aylık   paketler</a></div>';
    assert.deepEqual(ddgSonuclari(html, 5), [{ baslik: "Örnek Fiyat", adres: "https://ornek.com/fiyat", ozet: "Aylık paketler" }]);
  });
});
