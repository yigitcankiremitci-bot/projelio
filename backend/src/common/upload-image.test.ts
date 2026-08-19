// Backend tsconfig'inde esModuleInterop kapalı (NestJS CommonJS derlemesi
// gereği), bu yüzden namespace import kullanılıyor.
import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { detectImageUpload, MAX_IMAGE_BYTES } from "./upload-image.util";

// Bu testler somut bir açığı kilitliyor: kapak kovalarının hepsi PUBLIC ve
// eskiden dosyanın türü ile uzantısı doğrudan İSTEMCİDEN alınıyordu. Yani
// giriş yapmış bir kullanıcı, kendi alan adımızın altında kalıcı URL'li bir
// HTML sayfası barındırabiliyordu. Artık karar dosyanın kendi baytlarına ait.

/** Multer'ın verdiği nesneyi taklit eder. */
function upload(buffer: Buffer, iddia?: { mimetype?: string; originalname?: string }) {
  return {
    buffer,
    size: buffer.length,
    mimetype: iddia?.mimetype ?? "image/png",
    originalname: iddia?.originalname ?? "dosya.png",
  };
}

const PNG  = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
const GIF  = Buffer.concat([Buffer.from("GIF89a", "ascii"), Buffer.alloc(64)]);
const WEBP = Buffer.concat([Buffer.from("RIFF", "ascii"), Buffer.alloc(4), Buffer.from("WEBP", "ascii"), Buffer.alloc(64)]);

describe("gercek gorseller tanınıyor", () => {
  test("PNG", () => assert.deepEqual(detectImageUpload(upload(PNG)),  { contentType: "image/png",  ext: "png"  }));
  test("JPEG", () => assert.deepEqual(detectImageUpload(upload(JPEG)), { contentType: "image/jpeg", ext: "jpg"  }));
  test("GIF", () => assert.deepEqual(detectImageUpload(upload(GIF)),  { contentType: "image/gif",  ext: "gif"  }));
  test("WebP", () => assert.deepEqual(detectImageUpload(upload(WEBP)), { contentType: "image/webp", ext: "webp" }));
});

describe("istemcinin iddiasi dikkate alinmiyor", () => {
  test("mimetype yalan soyluyorsa gercek tur kazanir", () => {
    // Dosya aslında PNG ama istemci "text/html" diyor.
    const sonuc = detectImageUpload(upload(PNG, { mimetype: "text/html" }));
    assert.equal(sonuc.contentType, "image/png");
  });

  test("uzanti yalan soyluyorsa gercek uzanti kazanir", () => {
    // Eskiden dosya ".html" olarak kaydedilirdi.
    const sonuc = detectImageUpload(upload(JPEG, { originalname: "kapak.html" }));
    assert.equal(sonuc.ext, "jpg");
  });

  test("uzantiya gomulu dizin gezinmesi path'e sizamaz", () => {
    // Eski kod: "a.jpg/../../evil" -> ext = "jpg/../../evil"
    const sonuc = detectImageUpload(upload(PNG, { originalname: "a.jpg/../../evil" }));
    assert.equal(sonuc.ext, "png");
    assert.ok(!sonuc.ext.includes("/"));
    assert.ok(!sonuc.ext.includes(".."));
  });
});

describe("tehlikeli ve gecersiz dosyalar reddediliyor", () => {
  test("HTML reddedilir", () => {
    const html = Buffer.from("<!doctype html><script>alert(1)</script>", "utf8");
    assert.throws(() => detectImageUpload(upload(html, { mimetype: "image/png", originalname: "kapak.png" })),
      /bir görsel değil/);
  });

  test("SVG reddedilir ve sebebi soylenir", () => {
    // SVG "gerçek" bir görsel biçimidir ama XML'dir; içine <script> gömülür ve
    // tarayıcıda doğrudan açıldığında çalışır.
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', "utf8");
    assert.throws(() => detectImageUpload(upload(svg, { mimetype: "image/svg+xml" })), /SVG kabul edilmiyor/);
  });

  test("basinda bosluk olan SVG de yakalanir", () => {
    const svg = Buffer.from('\n  <?xml version="1.0"?><svg></svg>', "utf8");
    assert.throws(() => detectImageUpload(upload(svg)), /SVG kabul edilmiyor/);
  });

  test("bos dosya reddedilir", () => {
    assert.throws(() => detectImageUpload(upload(Buffer.alloc(0))), /Dosya boş/);
  });

  test("cok buyuk dosya reddedilir", () => {
    const buyuk = Buffer.concat([PNG, Buffer.alloc(MAX_IMAGE_BYTES)]);
    assert.throws(() => detectImageUpload(upload(buyuk)), /en fazla 8 MB/);
  });

  test("imzaya benzeyen ama eksik dosya reddedilir", () => {
    // Sadece "RIFF" ile başlayan bir ses dosyası (WAV) WebP sanılmamalı.
    const wav = Buffer.concat([Buffer.from("RIFF", "ascii"), Buffer.alloc(4), Buffer.from("WAVE", "ascii"), Buffer.alloc(64)]);
    assert.throws(() => detectImageUpload(upload(wav)), /bir görsel değil/);
  });

  test("cok kisa dosya imza kontrolunde cokmez", () => {
    assert.throws(() => detectImageUpload(upload(Buffer.from([0xff, 0xd8]))), /bir görsel değil/);
  });
});
