import { test } from "node:test";
// Backend tsconfig'inde esModuleInterop kapalı (NestJS CommonJS derlemesi
// gereği), bu yüzden namespace import kullanılıyor.
import * as assert from "node:assert/strict";
import { cevir, cevirmen, hataMetni, istekDili, istemciDili } from "./index";

test("istekDili hesap tercihini Accept-Language'e tercih eder", () => {
  assert.equal(istekDili("en", "tr-TR,tr;q=0.9"), "en");
  assert.equal(istekDili("tr", "en-US"), "tr");
  // Seçim yoksa (null) tarayıcıya bakılır — null "Türkçe" DEĞİL.
  assert.equal(istekDili(null, "en-US,en;q=0.9"), "en");
  assert.equal(istekDili(undefined, "de-DE"), "en");
  assert.equal(istekDili(null, undefined), "tr");
});

test("cevir düz metni ve yer tutuculu metni çözer", () => {
  // Türkçede sözlüğe bakılmaz, kaynak metin döner.
  assert.equal(cevir("tr", "Ekip Daveti"), "Ekip Daveti");
  assert.equal(
    cevir("tr", { metin: '{kisi}, "{proje}" projesinden ayrıldı.', params: { kisi: "Can", proje: "Kapak" } }),
    'Can, "Kapak" projesinden ayrıldı.'
  );
  assert.equal(cevir("en", "Ekip Daveti"), "Team invitation");
});

test("çevirisi olmayan metin Türkçe döner, patlamaz", () => {
  assert.equal(cevir("en", "Sözlükte hiç olmayan bir metin"), "Sözlükte hiç olmayan bir metin");
});

/**
 * Bu testin varlık sebebi: değişken içeren istisna mesajları bir kez sessizce
 * çevrilmemiş kaldı. Şablon dizesiyle yazıldıklarında (`${bytes} bayt`) mesaj
 * sözlükte aranırken zaten gömülü hâlde oluyor ve hiçbir zaman bulunmuyor —
 * üstelik hiçbir denetim bunu yakalayamıyordu.
 */
test("hataMetni anahtarı ve parametreleri ayrı tutar", () => {
  const ANAHTAR =
    "Şifre çok uzun ({bayt} bayt). En fazla {sinir} bayt olabilir; Türkçe karakterler 2 bayt yer kaplar.";
  const govde = hataMetni(ANAHTAR, { bayt: 80, sinir: 72 });

  // message alanı Türkçe ve HAZIR: filtre hiç çalışmasa bile okunabilir kalır.
  assert.match(govde.message, /^Şifre çok uzun \(80 bayt\)\. En fazla 72 bayt/);

  // Anahtar yer tutucuyla, yani sözlükte aranabilir hâlde duruyor.
  assert.equal(govde.i18n.metin, ANAHTAR);
  assert.deepEqual(govde.i18n.params, { bayt: 80, sinir: 72 });

  // Asıl mesele: o anahtar SÖZLÜKTE gerçekten bulunuyor mu. Yalnızca
  // "çıktı anahtardan farklı" demek yetmez — yer tutucular doldurulduğu için
  // çevrilmemiş bir metin de farklı görünür ve test boşuna geçerdi.
  const t = cevirmen("en");
  assert.equal(
    t(ANAHTAR, { bayt: 80, sinir: 72 }),
    "That password is too long (80 bytes). The limit is 72 bytes; Turkish characters take 2 bytes each."
  );
});

// Lio dili hesaptan okuyordu; demo hesaplarında `users.locale` PAYLAŞIM
// yüzünden bilerek boş olduğu için arayüzü İngilizce gezen ziyaretçiye
// Türkçe cevap veriyordu. Artık isteğin başlığı belirliyor.
test("istemciDili yalnızca geçerli X-Projelio-Locale başlığını kabul eder", () => {
  assert.equal(istemciDili({ headers: { "x-projelio-locale": "en" } }), "en");
  assert.equal(istemciDili({ headers: { "x-projelio-locale": "tr" } }), "tr");
  // Başlık yoksa undefined: istek tarayıcıdan gelmiyor olabilir (WhatsApp
  // köprüsü, zamanlanmış işler). Çağıran hesabın diline düşer.
  assert.equal(istemciDili({ headers: {} }), undefined);
  assert.equal(istemciDili({ headers: { "x-projelio-locale": "de" } }), undefined);
  assert.equal(istemciDili({ headers: { "x-projelio-locale": ["en"] } }), undefined);
  // Accept-Language BURAYA karışmaz: o bir ipucu, bu arayüzün kesin dili.
  assert.equal(istemciDili({ headers: { "accept-language": "en-US" } }), undefined);
});
