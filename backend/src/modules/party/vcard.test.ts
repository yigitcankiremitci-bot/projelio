import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { kartvizitMetniCoz, kartvizitMetniMi, vcardlariAl } from "./vcard";

// QR'dan ya da paylaşılan kişiden gelen veri ALAN ALAN gelir ve Lio'nun
// fotoğraf okumasının önüne geçer. Buradaki bir gerileme telefonu e-postaya,
// şirketi ada yazar — kullanıcı hatasız sandığı kaynağa güvendiği için fark etmez.

describe("vCard", () => {
  test("iPhone'dan paylaşılan kişi: grup öneki, cep telefonu, LinkedIn ve web ayrılır", () => {
    const vcf = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "N:Yılmaz;Ayşe;;;",
      "FN:Ayşe Yılmaz",
      "ORG:ABC Ajans;Pazarlama",
      "TITLE:Pazarlama Müdürü",
      "TEL;type=WORK;type=VOICE:+90 212 000 00 00",
      "TEL;type=CELL;type=VOICE;type=pref:+90 532 111 22 33",
      "item1.EMAIL;type=INTERNET;type=pref:ayse@abc.com",
      "item2.URL;type=pref:https://abc.com",
      "item3.URL:https://www.linkedin.com/in/ayse-yilmaz",
      "ADR;type=WORK:;;Moda Cad. 1;İstanbul;;34710;Türkiye",
      "END:VCARD",
    ].join("\r\n");
    assert.deepEqual(kartvizitMetniCoz(vcf), [
      {
        displayName: "Ayşe Yılmaz",
        kurum: "ABC Ajans",
        unvan: "Pazarlama Müdürü",
        phone: "+90 532 111 22 33",
        email: "ayse@abc.com",
        website: "https://abc.com",
        linkedin: "https://www.linkedin.com/in/ayse-yilmaz",
        adres: "Moda Cad. 1",
        sehir: "İstanbul",
      },
    ]);
  });

  test("katlanmış satır ve QUOTED-PRINTABLE (eski Android) çözülür", () => {
    const vcf =
      "BEGIN:VCARD\nVERSION:2.1\nFN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=C3=96zg=C3=BCr =C3=87elik\n" +
      "TITLE:Uzun bir unvan\n  devamı\nTEL;CELL:tel:05321112233\nEND:VCARD";
    const [k] = kartvizitMetniCoz(vcf);
    assert.equal(k.displayName, "Özgür Çelik");
    assert.equal(k.unvan, "Uzun bir unvan devamı");
    assert.equal(k.phone, "05321112233");
  });

  test("FN yoksa N'den ad kurulur; ad hiç yoksa kurum kartı olur", () => {
    assert.equal(kartvizitMetniCoz("BEGIN:VCARD\nN:Kaya;Can;;Dr.;\nEND:VCARD")[0].displayName, "Dr. Can Kaya");
    const [kurum] = kartvizitMetniCoz("BEGIN:VCARD\nORG:XYZ Derneği\nEND:VCARD");
    assert.equal(kurum.displayName, "XYZ Derneği");
    assert.equal(kurum.partyType, "company");
  });

  test("bir dosyada birden çok kişi", () => {
    const iki = "BEGIN:VCARD\nFN:A\nEND:VCARD\nBEGIN:VCARD\nFN:B\nEND:VCARD";
    assert.deepEqual(kartvizitMetniCoz(iki).map((k) => k.displayName), ["A", "B"]);
  });
});

describe("MECARD", () => {
  test("QR'daki MECARD: soyad,ad sırası çevrilir; kaçışlı noktalı virgül korunur", () => {
    const [k] = kartvizitMetniCoz("MECARD:N:Yılmaz,Ayşe;ORG:ABC\\; Ajans;TEL:+905321112233;EMAIL:ayse@abc.com;URL:https://instagram.com/ayse;;");
    assert.deepEqual(k, {
      displayName: "Ayşe Yılmaz",
      kurum: "ABC; Ajans",
      phone: "+905321112233",
      email: "ayse@abc.com",
      instagram: "https://instagram.com/ayse",
    });
  });

  test("kartvizitMetniMi düz bağlantıyı kartvizit saymaz", () => {
    assert.equal(kartvizitMetniMi("https://ornek.com/ayse"), false);
    assert.equal(kartvizitMetniMi("MECARD:N:A;;"), true);
  });
});

describe("vcardlariAl — WhatsApp'ta paylaşılan kişi", () => {
  const v = "BEGIN:VCARD\nFN:Ayşe\nEND:VCARD";
  test("WAHA'nın ortak alanı, tek kişi ve çoklu kişi mesajı okunur; tekrar elenir", () => {
    assert.deepEqual(vcardlariAl({ vCards: [v] }), [v]);
    assert.deepEqual(vcardlariAl({ _data: { Message: { contactMessage: { vcard: v } } } }), [v]);
    assert.deepEqual(
      vcardlariAl({ vCards: [v], _data: { message: { contactsArrayMessage: { contacts: [{ vCard: v }, { vcard: "x" }] } } } }),
      [v]
    );
  });

  test("kişi kartı olmayan mesaj boş döner", () => {
    assert.deepEqual(vcardlariAl({ body: "merhaba" }), []);
  });
});
