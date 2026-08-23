// Backend tsconfig'inde esModuleInterop kapalı (NestJS CommonJS derlemesi
// gereği), bu yüzden namespace import kullanılıyor.
import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { requireSafeUrl, safeExternalUrl } from "./safe-url";
import { safeExternalUrl as webSafeExternalUrl } from "../../../packages/shared/src/safeUrl";

// Kural iki yerde yazılı: burada (sunucu) ve packages/shared (web). Bunun NEDENİ
// safe-url.ts'in başında anlatılıyor — özetle backend `@projelio/shared`'dan
// değer import ederse açılmıyor.
//
// Kopyanın tehlikesi ayrışmak: biri sıkılaşır, diğeri gevşek kalır ve kimse fark
// etmez. Aşağıdaki test iki uygulamayı AYNI girdilerle karşılaştırıyor; birini
// değiştirip diğerini unutan kişi burada durur.

const GIRDILER = [
  "https://ornek.com/yol?a=1",
  "http://ornek.com",
  "mailto:biri@ornek.com",
  "ornek.com",
  "  ornek.com  ",
  "//baska-site.com/x",
  "javascript:alert(1)",
  "JavaScript:alert(1)",
  "  javascript:alert(1)",
  "java\tscript:alert(1)",
  "java\nscript:alert(1)",
  "jav ascript:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "vbscript:msgbox(1)",
  "file:///etc/passwd",
  "https:///",
  "http://",
  "",
  "   ",
];

describe("safeExternalUrl (sunucu kopyası)", () => {
  test("tehlikeli şemalar reddedilir", () => {
    for (const kotu of ["javascript:alert(1)", "data:text/html,x", "vbscript:x", "file:///etc/passwd"]) {
      assert.equal(safeExternalUrl(kotu), null, `reddedilmeliydi: ${kotu}`);
    }
  });

  test("araya kontrol karakteri sıkıştırarak şema gizlenemez", () => {
    assert.equal(safeExternalUrl("java\tscript:alert(1)"), null);
  });

  test("normal ve şemasız adresler geçer", () => {
    assert.equal(safeExternalUrl("https://ornek.com/x"), "https://ornek.com/x");
    assert.equal(safeExternalUrl("ornek.com"), "https://ornek.com/");
  });

  test("requireSafeUrl güvensiz adreste 400 atar, güvenlide değeri döner", () => {
    assert.throws(() => requireSafeUrl("javascript:alert(1)", "Bağlantı"), /Bağlantı geçersiz/);
    assert.equal(requireSafeUrl("ornek.com", "Bağlantı"), "https://ornek.com/");
  });
});

describe("sunucu ve web kopyaları ayrışmamalı", () => {
  test("tüm girdilerde aynı sonucu veriyorlar", () => {
    for (const girdi of GIRDILER) {
      assert.equal(
        safeExternalUrl(girdi),
        webSafeExternalUrl(girdi),
        `Kopyalar ayrıştı — girdi: ${JSON.stringify(girdi)}\n` +
          `Birini değiştirdiysen diğerini de güncelle: ` +
          `backend/src/common/safe-url.ts ve packages/shared/src/safeUrl.ts`
      );
    }
  });
});

describe("şemasız girdide alan adı doğrulanır", () => {
  test("noktasız yazı bağlantı sayılmaz — kullanıcı ekledim sanıp tıklayınca hiçbir yere gitmesin", () => {
    assert.equal(safeExternalUrl("denemebir"), null);
    assert.equal(safeExternalUrl("proje notu"), null);
  });

  test("gerçek alan adı geçer", () => {
    assert.equal(safeExternalUrl("denemebir.com"), "https://denemebir.com/");
  });

  test("şemayı kullanıcı yazdıysa karışılmaz (iç ağ adresleri için)", () => {
    assert.equal(safeExternalUrl("http://wiki"), "http://wiki/");
  });
});
