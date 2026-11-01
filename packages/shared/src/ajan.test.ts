import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  AJAN_ASILI_IS_MS,
  AJAN_BAGLI_SAYILMA_MS,
  AJAN_LISTE_ARALIGI_MS,
  AJAN_OGRENME_ARALIGI_MS,
  AJAN_SINIRLARI,
  ajanBagliMi,
  ajanBostaNeYapsin,
  ajanIsAsiliMi,
  ajanKonuAnahtari,
  ajanSonucunuTemizle,
} from "./ajan";

const SIMDI = Date.parse("2026-11-02T10:00:00Z");
const once = (ms: number) => new Date(SIMDI - ms).toISOString();

describe("ajanBagliMi", () => {
  test("nabız yeniyse bağlı, eskiyse ya da hiç yoksa uyuyor", () => {
    assert.equal(ajanBagliMi(once(10_000), SIMDI), true);
    assert.equal(ajanBagliMi(once(AJAN_BAGLI_SAYILMA_MS + 1), SIMDI), false);
    assert.equal(ajanBagliMi(null, SIMDI), false);
    assert.equal(ajanBagliMi("bozuk", SIMDI), false);
  });
});

describe("ajanIsAsiliMi", () => {
  // Mac iş ortasında uyursa iş "calisiyor"da kalır; süre dolunca kuyruğa döner.
  test("yeni alınmış iş asılı değil, süresi dolmuş iş asılı", () => {
    assert.equal(ajanIsAsiliMi(once(60_000), SIMDI), false);
    assert.equal(ajanIsAsiliMi(once(AJAN_ASILI_IS_MS + 1), SIMDI), true);
    assert.equal(ajanIsAsiliMi(null, SIMDI), true);
  });
});

describe("ajanBostaNeYapsin", () => {
  const temel = { ogrenmeAcik: true, bekleyenKonuVar: true, sonOgrenme: null, sonListe: null, simdi: SIMDI };

  test("öğrenme kapalıysa hiçbir şey yapmaz", () => {
    assert.equal(ajanBostaNeYapsin({ ...temel, ogrenmeAcik: false }), null);
  });

  test("bekleyen konu varsa öğrenir", () => {
    assert.equal(ajanBostaNeYapsin(temel), "ogrenme");
  });

  test("son öğrenmeden beri aralık dolmadıysa bekler", () => {
    assert.equal(ajanBostaNeYapsin({ ...temel, sonOgrenme: once(AJAN_OGRENME_ARALIGI_MS - 1000) }), null);
  });

  test("konu kalmadıysa yeni liste çıkarır, ama sık değil", () => {
    assert.equal(ajanBostaNeYapsin({ ...temel, bekleyenKonuVar: false }), "liste");
    assert.equal(ajanBostaNeYapsin({ ...temel, bekleyenKonuVar: false, sonListe: once(AJAN_LISTE_ARALIGI_MS - 1000) }), null);
  });
});

describe("ajanSonucunuTemizle", () => {
  test("bilinmeyen alanları atar, uzun metni kırpar", () => {
    const s = ajanSonucunuTemizle({ mesaj: "x".repeat(AJAN_SINIRLARI.mesaj + 50), silBunu: true });
    assert.equal(s.mesaj?.length, AJAN_SINIRLARI.mesaj);
    assert.equal("silBunu" in s, false);
  });

  test("rapor kaynaklarından http(s) olmayanlar düşer", () => {
    // Model bir sayfadan okuduğu `javascript:` bağlantısını rapora koyarsa
    // kullanıcı ona tıklayabilirdi.
    const s = ajanSonucunuTemizle({
      rapor: {
        icerik: "# Rapor",
        kaynaklar: [
          { baslik: "İyi", adres: "https://ornek.com" },
          { baslik: "Kötü", adres: "javascript:alert(1)" },
        ],
      },
    });
    assert.deepEqual(s.rapor?.kaynaklar, [{ baslik: "İyi", adres: "https://ornek.com" }]);
    assert.equal(s.rapor?.baslik, "Araştırma raporu");
  });

  test("içeriksiz rapor ve başlıksız bilgi kabul edilmez", () => {
    const s = ajanSonucunuTemizle({ rapor: { baslik: "Boş" }, bilgiler: [{ baslik: "", icerik: "a" }, { baslik: "b", icerik: "c" }] });
    assert.equal(s.rapor, undefined);
    assert.equal(s.bilgiler?.length, 1);
  });

  test("tek sonuçta kalem sayısı sınırlı", () => {
    const konular = Array.from({ length: 50 }, (_, i) => ({ konu: `Konu ${i}` }));
    assert.equal(ajanSonucunuTemizle({ konular }).konular?.length, AJAN_SINIRLARI.sonucKalemi);
  });

  test("yapılacak önerisinde geçersiz tarih atılır, öneri kalır", () => {
    const s = ajanSonucunuTemizle({ oneriler: [{ tur: "yapilacak", veri: { baslik: "Ara", bitis: "yarın" } }, { tur: "sil", veri: { baslik: "x" } }] });
    assert.deepEqual(s.oneriler, [{ tur: "yapilacak", veri: { baslik: "Ara", aciklama: undefined, bitis: undefined } }]);
  });
});

describe("ajanKonuAnahtari", () => {
  test("büyük/küçük harf ve noktalama farkı aynı konu sayılır", () => {
    assert.equal(ajanKonuAnahtari("İnstagram Reels, algoritma!"), ajanKonuAnahtari("instagram reels algoritma"));
  });
});
