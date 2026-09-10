import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { gorevleriAra, gorevPuani, kelimelereBol, kokBul, metniNormallestir, yazimYakini } from "./taskSearch";

// Bu modül, Yaptım'daki arama kutusunun tamamı. Buradaki bir gerileme
// kullanıcının görevini bulamaması ve kaydı hiç girmemesi demek — özelliğin
// tam olarak çözmeye çalıştığı sorunun geri gelmesi.

const bul = (sorgu: string, baslik: string, ...baglam: string[]) =>
  gorevPuani(sorgu, { baslik, baglam });

describe("metniNormallestir", () => {
  test("şapkalı harfler ve noktalama sadeleşir", () => {
    assert.equal(metniNormallestir("Görev Listesi"), "gorev listesi");
    assert.equal(metniNormallestir("-40°C test protokolü"), "40 c test protokolu");
    assert.equal(metniNormallestir("  Şoklama/Ünite  "), "soklama unite");
  });

  test("büyük İ Türkçe küçültülür", () => {
    assert.equal(metniNormallestir("İSTANBUL"), "istanbul");
  });
});

describe("kokBul", () => {
  test("yaygın ekler soyulur", () => {
    assert.equal(kokBul("testleri"), "test");
    assert.equal(kokBul("protokolu"), "protokol");
    assert.equal(kokBul("sunumu"), "sunum");
    assert.equal(kokBul("raporlar"), "rapor");
  });

  test("kök çok kısalacaksa ek soyulmaz", () => {
    // "ara" -> "ar" olsaydı neredeyse her şeyle eşleşirdi.
    assert.equal(kokBul("ara"), "ara");
    assert.equal(kokBul("test"), "test");
  });
});

describe("yazimYakini", () => {
  test("komşu harf yer değiştirmesi affedilir", () => {
    assert.equal(yazimYakini("raopr", "rapor"), true);
    assert.equal(yazimYakini("sunmu", "sunum"), true);
  });

  test("tek harf fark affedilir", () => {
    assert.equal(yazimYakini("proje", "prole"), true);
    assert.equal(yazimYakini("toplanti", "toplantı".replace("ı", "i")), true);
  });

  test("kısa kelimelerde tolerans yok", () => {
    // "ara" ile "arı" farklı işler; kısa kelimede bir harf, kelimenin kendisi.
    assert.equal(yazimYakini("ara", "arı"), false);
  });

  test("iki harflik fark affedilmez", () => {
    assert.equal(yazimYakini("rapor", "kalem"), false);
    assert.equal(yazimYakini("rapordu", "rapor"), false);
  });
});

describe("gorevPuani — kullanıcının gerçekten yazacağı şeyler", () => {
  test("araya kelime girse de bulunur", () => {
    assert.notEqual(bul("sunum hazırla", "Müşteri sunumu hazırlandı"), null);
  });

  test("kelime sırası önemsiz", () => {
    assert.notEqual(bul("hazırla sunum", "Müşteri sunumu hazırlandı"), null);
  });

  test("Türkçe eki takılmaz", () => {
    assert.notEqual(bul("test protokol", "-40°C test protokolü yazımı"), null);
    assert.notEqual(bul("testler", "Soğutma hızı testleri"), null);
  });

  test("şapkasız yazım tutar", () => {
    assert.notEqual(bul("gorev listesi", "Görev Listesi"), null);
    assert.notEqual(bul("soklama", "Şoklama ünitesi montajı"), null);
  });

  test("parmak kayması affedilir", () => {
    assert.notEqual(bul("raopr", "Rapor yazımı"), null);
  });

  test("proje/departman adından da bulunur", () => {
    assert.notEqual(bul("milano lojistik", "Fuar lojistiği ve gümrük", "HOST Milano 2026 Fuar"), null);
  });

  test("KELİMELERDEN BİRİ TUTMUYORSA eşleşme yok", () => {
    // Tek kelimesi tutanı da getirseydik liste alakasız işlerle dolardı.
    assert.equal(bul("sunum bütçe", "Müşteri sunumu hazırlandı"), null);
    assert.equal(bul("kalem", "Rapor yazımı"), null);
  });

  test("boş sorgu eşleşmez", () => {
    assert.equal(bul("", "Rapor"), null);
    assert.equal(bul("   ", "Rapor"), null);
  });
});

describe("gorevleriAra — sıralama", () => {
  const gorevler = [
    { id: "1", title: "Rapor revizyon toplantısı hazırlığı" },
    { id: "2", title: "Rapor" },
    { id: "3", title: "Test sonuç raporu" },
    { id: "4", title: "Fuar lojistiği" },
  ];
  const ara = (s: string) => gorevleriAra(s, gorevler, (g) => ({ baslik: g.title })).map((g) => g.id);

  test("birebir yazılan başlık en üstte", () => {
    assert.equal(ara("rapor")[0], "2");
  });

  test("alakasız kayıt listeye girmez", () => {
    assert.equal(ara("rapor").includes("4"), false);
  });

  test("tavan uygulanır", () => {
    const cok = Array.from({ length: 30 }, (_, i) => ({ id: String(i), title: `Rapor ${i}` }));
    assert.equal(gorevleriAra("rapor", cok, (g) => ({ baslik: g.title })).length, 8);
    assert.equal(gorevleriAra("rapor", cok, (g) => ({ baslik: g.title }), 3).length, 3);
  });
});
