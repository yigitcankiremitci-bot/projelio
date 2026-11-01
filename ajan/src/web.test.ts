import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { adresGuvenliMi, braveSonuclari, htmlMetni, ozelAdresMi, varliklariCoz } from "./web.ts";

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

describe("braveSonuclari", () => {
  test("etiketler temizlenir, http(s) olmayan sonuç düşer, sınır uygulanır", () => {
    const j = {
      web: {
        results: [
          { title: "Örnek <strong>Fiyat</strong>", url: "https://ornek.com/fiyat", description: "Aylık &amp; yıllık   paketler" },
          { title: "Kötü", url: "javascript:alert(1)", description: "" },
          { title: "Üçüncü", url: "https://c.com", description: "" },
        ],
      },
    };
    assert.deepEqual(braveSonuclari(j, 1), [{ baslik: "Örnek Fiyat", adres: "https://ornek.com/fiyat", ozet: "Aylık & yıllık paketler" }]);
    assert.equal(braveSonuclari(j, 5).length, 2);
    assert.deepEqual(braveSonuclari({}, 5), []);
  });
});
