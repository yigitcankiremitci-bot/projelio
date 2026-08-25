import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseMessageLinks } from "./messageLinks";

const DRIVE = "https://drive.google.com/file/d/15FTQuU9QPFntG0BYYHogC79FF2Yn6QyH/view?usp=drivesdk";

describe("Lio yanıtındaki bağlantılar", () => {
  test("dosya adı bağlantıya dönüşür, ham adres görünmez", () => {
    const segments = parseMessageLinks(`1. [yorma-5.mp3](${DRIVE}) — Deniz Kızı Şarkı işinde`);
    assert.deepEqual(segments[0], { type: "text", value: "1. " });
    assert.deepEqual(segments[1], { type: "link", label: "yorma-5.mp3", href: DRIVE });
    assert.equal(segments[2].type, "text");
  });

  test("çıplak adres de tıklanabilir olur, sondaki noktalama dışarıda kalır", () => {
    const segments = parseMessageLinks(`Dosya burada: ${DRIVE}.`);
    assert.deepEqual(segments[1], { type: "link", label: DRIVE, href: DRIVE });
    // Nokta adrese değil cümleye ait; içeri alınsa bağlantı kırılırdı.
    assert.deepEqual(segments[2], { type: "text", value: "." });
  });

  test("javascript: adresi bağlantı YAPILMAZ, metin olarak kalır", () => {
    // Dosya adına gizlenmiş bir şema, tıklandığında sayfanın kendi kökeninde
    // kod çalıştırırdı — jeton localStorage'da duruyor.
    const segments = parseMessageLinks("[rapor.pdf](javascript:alert(1))");
    assert.ok(segments.every((s) => s.type === "text"));
  });

  test("Projelio dosyası dış bağlantı değil, uygulama içi parça olur", () => {
    // Yeni sekmeye gitmemeli: tıklayınca önizleme penceresi açılıyor.
    const id = "0f9a1c22-4b3d-4e77-9a11-5c6d7e8f9012";
    const segments = parseMessageLinks(`[yorma-5.mp3](projelio:file/${id})`);
    assert.deepEqual(segments, [{ type: "file", label: "yorma-5.mp3", fileId: id }]);
  });

  test("uydurma dosya kimliği tıklanabilir yapılmaz", () => {
    // Model kimliği uydurabilir; UUID biçiminde değilse var olmayan bir dosyaya
    // götüren bir düğme çizmektense metin bırakmak doğrusu.
    const segments = parseMessageLinks("[rapor.pdf](projelio:file/olmayan-dosya)");
    assert.ok(segments.every((s) => s.type === "text"));
  });

  test("bağlantısız metin tek parça kalır", () => {
    assert.deepEqual(parseMessageLinks("Bugün üç görev tamamlandı."), [
      { type: "text", value: "Bugün üç görev tamamlandı." },
    ]);
  });
});
