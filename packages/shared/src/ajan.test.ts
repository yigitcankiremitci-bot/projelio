import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  AJAN_ASILI_IS_MS,
  AJAN_BAGLI_SAYILMA_MS,
  AJAN_LISTE_ARALIGI_MS,
  AJAN_OGRENME_ARALIGI_MS,
  AJAN_SINIRLARI,
  AJAN_YOGUN_OGRENME_ARALIGI_MS,
  ajanAramaKelimeleri,
  ajanBagliMi,
  ajanBellekAlintisi,
  ajanAdimlariAyir,
  ajanFikriTemizle,
  ajanSonrakiCalisma,
  AJAN_FIKIR_ARALIGI_MS,
  AJAN_FIKIR_ESIGI,
  ajanBostaNeYapsin,
  ajanIsAsiliMi,
  ajanKonuAnahtari,
  ajanOgretilenleriSigdir,
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

describe("ajanBostaNeYapsin yoğun modda", () => {
  const temel = { ogrenmeAcik: true, bekleyenKonuVar: true, sonOgrenme: null, sonListe: null, simdi: SIMDI };

  test("prizde ve boştayken kısa aralıkla öğrenir, değilken 5 dk bekler", () => {
    const az = once(AJAN_YOGUN_OGRENME_ARALIGI_MS + 1000);
    assert.equal(ajanBostaNeYapsin({ ...temel, sonOgrenme: az, yogun: true }), "ogrenme");
    assert.equal(ajanBostaNeYapsin({ ...temel, sonOgrenme: az }), null);
    assert.equal(ajanBostaNeYapsin({ ...temel, sonOgrenme: once(AJAN_YOGUN_OGRENME_ARALIGI_MS - 1000), yogun: true }), null);
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

describe("uzun öğretilenler", () => {
  // 2026-11-02: kullanıcı 100 sayfalık metin öğretmek istedi; tamamı istemde
  // olsa qwen3:8b'nin 16K bağlamı ilk belgede dolardı.
  const belge = "Giriş. " + "dolgu metni ".repeat(20_000) + "Fiyatlandırma: Pro paket aylık 499 TL. " + "son ".repeat(5000);

  test("kısa kural olduğu gibi, uzun belgenin yalnızca başı istemde", () => {
    const s = ajanOgretilenleriSigdir([
      { baslik: "Biçim", icerik: "Kısa yaz" },
      { baslik: "El kitabı", icerik: belge },
    ]);
    assert.equal(s[0].icerik, "Kısa yaz");
    assert.ok(s[1].icerik.length < 800);
    assert.match(s[1].icerik, /bellekte_ara/);
  });

  test("bütçe dolunca eski öğretilenler istemden düşer", () => {
    const liste = Array.from({ length: 20 }, (_, i) => ({ baslik: `k${i}`, icerik: "x".repeat(1400) }));
    const s = ajanOgretilenleriSigdir(liste, 5000);
    assert.equal(s.length, 3);
    assert.equal(s[0].baslik, "k0");
  });

  test("alıntı belgenin başını değil aranan yeri gösterir", () => {
    const a = ajanBellekAlintisi(belge, ajanAramaKelimeleri("Pro paket fiyatı"));
    assert.match(a, /aylık 499 TL/);
    assert.ok(a.length < 2500);
  });

  test("eşleşme yoksa başı döner, kısa metin olduğu gibi", () => {
    assert.ok(ajanBellekAlintisi(belge, ["yokyok"]).startsWith("Giriş."));
    assert.equal(ajanBellekAlintisi("kısa not", ["not"]), "kısa not");
  });

  test("arama kelimeleri küçültülür, kısalar ve tekrarlar atılır", () => {
    assert.deepEqual(ajanAramaKelimeleri("İstanbul'da ve İSTANBUL fiyat?"), ["istanbul", "fiyat"]);
  });

  test("öğretilen sınırı 100 sayfaya yeter", () => {
    assert.ok(AJAN_SINIRLARI.ogretilen >= 100 * 3000);
  });
});

describe("fikirler", () => {
  test("faydası ve en az 2 adımı olmayan fikir düşer", () => {
    assert.equal(ajanFikriTemizle({ baslik: "Sosyal medyayı kullan", fayda: "Görünürlük", adimlar: ["Paylaş"] }), null);
    assert.equal(ajanFikriTemizle({ baslik: "X", adimlar: ["a", "b"] }), null);
    const f = ajanFikriTemizle({ baslik: "Teklif şablonu", fayda: "Teklif süresi yarıya iner", adimlar: ["Şablonu yaz", "3 müşteriye dene"], etki: "yuksek", emek: "uydurma" });
    assert.deepEqual(f, { baslik: "Teklif şablonu", fayda: "Teklif süresi yarıya iner", adimlar: ["Şablonu yaz", "3 müşteriye dene"], etki: "yuksek", emek: "orta", dayanak: undefined });
  });

  test("model adımları tek metin yazarsa ayrılır", () => {
    assert.deepEqual(ajanAdimlariAyir("1. Listeyi çıkar 2. Fiyatı belirle 3) Duyur"), ["Listeyi çıkar", "Fiyatı belirle", "Duyur"]);
    assert.deepEqual(ajanAdimlariAyir("- A\n- B"), ["A", "B"]);
    assert.equal(ajanFikriTemizle({ baslik: "x", fayda: "y", adimlar: "Ara; Yaz" })?.adimlar.length, 2);
  });

  test("sonuçtaki fikir ve yapılacak birlikte temizlenir", () => {
    const s = ajanSonucunuTemizle({ oneriler: [{ tur: "fikir", veri: { baslik: "a", fayda: "b", adimlar: ["c", "d"] } }, { tur: "fikir", veri: { baslik: "boş" } }, { tur: "yapilacak", veri: { baslik: "Ara" } }, { tur: "sil" }] });
    assert.deepEqual(s.oneriler?.map((o) => o.tur), ["fikir", "yapilacak"]);
  });

  test("yeterince yeni not birikince boşta fikir üretir, sık değil", () => {
    const temel = { ogrenmeAcik: true, bekleyenKonuVar: true, sonOgrenme: null, sonListe: null, simdi: SIMDI };
    assert.equal(ajanBostaNeYapsin({ ...temel, yeniNot: AJAN_FIKIR_ESIGI }), "fikir");
    assert.equal(ajanBostaNeYapsin({ ...temel, yeniNot: AJAN_FIKIR_ESIGI - 1 }), "ogrenme");
    assert.equal(ajanBostaNeYapsin({ ...temel, yeniNot: 50, sonFikir: once(AJAN_FIKIR_ARALIGI_MS - 1000) }), "ogrenme");
  });
});

describe("ajanSonrakiCalisma (Türkiye saati)", () => {
  // 2026-11-02 pazartesi 10:00 UTC = 13:00 Türkiye.
  test("günlük: bugünün saati geçtiyse yarın", () => {
    assert.equal(ajanSonrakiCalisma({ siklik: "gunluk", saat: 9, gun: 1 }, SIMDI), "2026-11-03T06:00:00.000Z");
    assert.equal(ajanSonrakiCalisma({ siklik: "gunluk", saat: 18, gun: 1 }, SIMDI), "2026-11-02T15:00:00.000Z");
  });

  test("haftalık: aynı gün saati geçtiyse gelecek hafta", () => {
    assert.equal(ajanSonrakiCalisma({ siklik: "haftalik", saat: 9, gun: 1 }, SIMDI), "2026-11-09T06:00:00.000Z");
    assert.equal(ajanSonrakiCalisma({ siklik: "haftalik", saat: 9, gun: 5 }, SIMDI), "2026-11-06T06:00:00.000Z");
  });

  test("aylık: ayın günü geçtiyse gelecek ay, yıl sonu taşar", () => {
    assert.equal(ajanSonrakiCalisma({ siklik: "aylik", saat: 10, gun: 1 }, SIMDI), "2026-12-01T07:00:00.000Z");
    assert.equal(ajanSonrakiCalisma({ siklik: "aylik", saat: 10, gun: 1 }, Date.parse("2026-12-05T00:00:00Z")), "2027-01-01T07:00:00.000Z");
  });

  test("Türkiye gece yarısından sonra UTC hâlâ dündeyken doğru gün", () => {
    // 2026-11-02 22:30 UTC = 3 Kasım 01:30 Türkiye; günlük 09:00 → 3 Kasım 06:00 UTC.
    assert.equal(ajanSonrakiCalisma({ siklik: "gunluk", saat: 9, gun: 1 }, Date.parse("2026-11-02T22:30:00Z")), "2026-11-03T06:00:00.000Z");
  });
});
