import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { kartvizitPlani, kirpmaHesabi, ortakIletisimiAyir, telefonAnahtari, type Koseler } from "./kartvizit-plani";

// Fuar dönüşü 20 kartvizit tek mesajla geliyor. Buradaki bir gerileme ya aynı
// şirketin iki çalışanını iki ayrı şirket gibi açar ya da kayıtlı kişiyi ikinci
// kez yazar — kullanıcı ancak listeye bakınca fark eder.

describe("kartvizitPlani — gruplama", () => {
  test("aynı markadan iki kartvizit tek şirket kartının altında birleşir", () => {
    const plan = kartvizitPlani(
      [
        { displayName: "Ayşe Yılmaz", kurum: "ABC Ajans Ltd. Şti.", unvan: "Müdür", phone: "0532 111 22 33", kartvizitler: [{ dosya: "a" }] },
        { displayName: "Mehmet Kaya", kurum: "abc ajans", email: "mehmet@abc.com", website: "abc.com", kartvizitler: [{ dosya: "b" }] },
      ],
      []
    );
    assert.equal(plan.length, 1);
    const adim = plan[0];
    assert.equal(adim.tur, "yeniKurum");
    if (adim.tur !== "yeniKurum") return;
    assert.equal(adim.ad, "ABC Ajans Ltd. Şti.");
    assert.equal(adim.website, "abc.com");
    assert.deepEqual(adim.kisiler.map((k) => [k.name, k.title]), [["Ayşe Yılmaz", "Müdür"], ["Mehmet Kaya", undefined]]);
    assert.deepEqual(adim.kartvizitler.map((k) => k.dosya), ["a", "b"]);
  });

  test("tek kişilik marka kişi kartı olur, farklı markalar ayrı kalır", () => {
    const plan = kartvizitPlani(
      [
        { displayName: "Ayşe", kurum: "ABC" },
        { displayName: "Can", kurum: "XYZ" },
        { displayName: "Ece" },
      ],
      []
    );
    assert.deepEqual(plan.map((a) => a.tur), ["yeniKisi", "yeniKisi", "yeniKisi"]);
  });

  test("kurumu kayıtlı şirketle eşleşen kişi o karta eklenir", () => {
    const plan = kartvizitPlani(
      [{ displayName: "Ayşe", kurum: "ABC Ajans", kartvizitler: [{ dosya: "a" }] }],
      [{ id: "k1", displayName: "ABC Ajans A.Ş.", partyType: "company" }]
    );
    assert.equal(plan[0].tur, "mevcutKurum");
    if (plan[0].tur !== "mevcutKurum") return;
    assert.equal(plan[0].partyId, "k1");
    assert.equal(plan[0].kisiler[0].name, "Ayşe");
  });

  test("kayıtlı kişi ad, e-posta ya da telefonla eşleşirse atlanır", () => {
    const mevcut = [{ id: "p1", displayName: "Ayşe Yılmaz", partyType: "person", email: "AYSE@abc.com", phone: "+90 532 111 22 33" }];
    const plan = kartvizitPlani(
      [
        { displayName: "Ayşe Yılmaz" },
        { displayName: "A. Yılmaz", email: "ayse@abc.com" },
        { displayName: "Ayse Y", phone: "05321112233" },
      ],
      mevcut
    );
    assert.deepEqual(
      plan.map((a) => (a.tur === "atla" ? a.sebep : a.tur)),
      ["ad", "e-posta", "telefon"]
    );
  });

  test("LinkedIn/Instagram şirket altındaki kişinin notuna yazılır", () => {
    const plan = kartvizitPlani(
      [
        { displayName: "A", kurum: "K", linkedin: "in/a" },
        { displayName: "B", kurum: "K", instagram: "@b" },
      ],
      []
    );
    if (plan[0].tur !== "yeniKurum") throw new Error("şirket bekleniyordu");
    assert.equal(plan[0].kisiler[0].notes, "LinkedIn: in/a");
    assert.equal(plan[0].kisiler[1].notes, "Instagram: @b");
  });
});

describe("telefonAnahtari", () => {
  test("ülke kodu ve baştaki sıfır farkı eşleşir, kısa numara anahtar üretmez", () => {
    assert.equal(telefonAnahtari("+90 532 111 22 33"), telefonAnahtari("0532 111 2233"));
    assert.equal(telefonAnahtari("123"), "");
  });
});

describe("kirpmaHesabi", () => {
  const kart: Koseler = { solUst: [0.1, 0.2], sagUst: [0.9, 0.2], sagAlt: [0.9, 0.7], solAlt: [0.1, 0.7] };

  test("düz kartvizit: kenar oranı korunur, köşeler biraz dışa açılır, boyut çift", () => {
    const k = kirpmaHesabi(kart, 2000, 1000)!;
    assert.ok(k);
    // 0.8*2000=1600 genişlik, 0.5*1000=500 yükseklik → %3 açılınca biraz büyür, 1600'e sığdırılır.
    assert.equal(k.genislik, 1600);
    assert.ok(Math.abs(k.yukseklik / k.genislik - 515 / 1648) < 0.01);
    assert.equal(k.genislik % 2, 0);
    assert.equal(k.yukseklik % 2, 0);
    // ffmpeg sırası: sol üst, sağ üst, sol alt, sağ alt.
    assert.ok(k.noktalar[0][0] < 200 && k.noktalar[1][0] > 1800 && k.noktalar[2][1] > 700);
  });

  test("geçersiz ya da çok küçük alan null — özgün fotoğraf eklenir", () => {
    assert.equal(kirpmaHesabi({ ...kart, sagUst: [1.5, 0.2] }, 1000, 1000), null);
    const minik: Koseler = { solUst: [0.5, 0.5], sagUst: [0.52, 0.5], sagAlt: [0.52, 0.52], solAlt: [0.5, 0.52] };
    assert.equal(kirpmaHesabi(minik, 1000, 1000), null);
  });
});

describe("ortak iletişim şirketindir", () => {
  test("canlı deneme: Sinyal kartviziti — iki kişi, tek info@ e-postası şirket kartına gider", () => {
    const plan = kartvizitPlani(
      [
        { displayName: "Mustafa Özkan", kurum: "Sinyal", phone: "0551 507 42 70", email: "info@sinyalsoft.com", website: "www.sinyalsoft.com" },
        { displayName: "Yusuf Baştuğu", kurum: "Sinyal", phone: "0 507 519 39 91", email: "info@sinyalsoft.com", website: "www.sinyalsoft.com" },
      ],
      []
    );
    assert.equal(plan.length, 1);
    const a = plan[0];
    if (a.tur !== "yeniKurum") throw new Error("şirket kartı bekleniyordu");
    assert.equal(a.email, "info@sinyalsoft.com");
    assert.equal(a.website, "www.sinyalsoft.com");
    assert.equal(a.phone, undefined);
    assert.deepEqual(
      a.kisiler.map((k) => [k.name, k.phone, k.email]),
      [
        ["Mustafa Özkan", "0551 507 42 70", undefined],
        ["Yusuf Baştuğu", "0 507 519 39 91", undefined],
      ]
    );
  });

  test("kişisel e-postalar kişide kalır; ortak santral numarası şirkete gider", () => {
    const r = ortakIletisimiAyir([
      { name: "A", email: "a@x.com", phone: "0212 000 00 00" },
      { name: "B", email: "b@x.com", phone: "+90 212 000 00 00" },
    ]);
    assert.equal(r.email, undefined);
    assert.equal(r.phone, "0212 000 00 00");
    assert.deepEqual(r.kisiler.map((k) => [k.email, k.phone]), [["a@x.com", undefined], ["b@x.com", undefined]]);
  });

  test("tek kişide genel önekli e-posta (info@) da şirketindir", () => {
    const r = ortakIletisimiAyir([{ name: "A", email: "Info@abc.com" }]);
    assert.equal(r.email, "Info@abc.com");
    assert.equal(r.kisiler[0].email, undefined);
  });
});

describe("kayıtlı kişinin kartviziti yeniden gelirse", () => {
  test("kişi atlanır ama yeni görsel o kayıtlı karta eklenecek şekilde taşınır", () => {
    const plan = kartvizitPlani(
      [{ displayName: "Ayşe Yılmaz", kartvizitler: [{ dosya: "yeni" }] }],
      [{ id: "p1", displayName: "Ayşe Yılmaz", partyType: "person" }]
    );
    assert.equal(plan[0].tur, "atla");
    if (plan[0].tur !== "atla") return;
    assert.equal(plan[0].partyId, "p1");
    assert.deepEqual(plan[0].kartvizitler.map((k) => k.dosya), ["yeni"]);
  });
});
