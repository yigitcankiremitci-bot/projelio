// Backend tsconfig'inde esModuleInterop kapalı, bu yüzden namespace import.
import * as assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, test } from "node:test";
import {
  adresAyristir,
  adresiDogrula,
  aliciMetniniAyristir,
  ekYolu,
  gelenKlasoru,
  konuyuAyir,
  postaAlicilari,
  referanslar,
  svixImzasiGecerli,
  yanitKonusu,
} from "./projelio-posta";

// @projelio.app kutularının iki sessiz riski var:
//   1. İmzası doğrulanmayan bir webhook, herkesin herhangi bir kutuya sahte
//      posta yazmasına izin verir.
//   2. Alıcı yanlış eşleşirse posta başka şirketin kutusuna düşer.

describe("adres doğrulama", () => {
  test("yerel ada alan adı eklenir, büyük harf küçülür", () => {
    assert.deepEqual(adresiDogrula("Satis"), { adres: "satis@projelio.app" });
  });

  test("tam adres yapıştırılırsa alan adı ikinci kez eklenmez", () => {
    assert.deepEqual(adresiDogrula("can.k@projelio.app"), { adres: "can.k@projelio.app" });
  });

  test("Türkçe karakter, boşluk ve uçta nokta reddedilir", () => {
    for (const kotu of ["satış", "a b", ".can", "can.", "a..b", "x@y"]) {
      assert.ok("hata" in adresiDogrula(kotu), kotu);
    }
  });

  test("ayrılmış adlar verilmez (sertifika doğrulama ve gönderen adreslerimiz)", () => {
    for (const ad of ["postmaster", "admin", "bildirim", "destek", "noreply"]) {
      assert.ok("hata" in adresiDogrula(ad), ad);
    }
  });
});

describe("Svix imzası", () => {
  const sir = `whsec_${Buffer.from("gizli-anahtar-32-bayt-uzunlugunda!").toString("base64")}`;
  const anahtar = Buffer.from(sir.slice(6), "base64");
  const govde = '{"type":"email.received"}';
  const zaman = "1760000000";
  const imzala = (g: string) => createHmac("sha256", anahtar).update(`msg_1.${zaman}.${g}`).digest("base64");
  const simdi = Number(zaman) * 1000;

  test("doğru imza kabul edilir (birden çok imza arasında da)", () => {
    assert.equal(svixImzasiGecerli({ govde, id: "msg_1", zaman, imza: `v1,yanlis v1,${imzala(govde)}`, sir, simdi }), true);
  });

  test("gövde değişirse reddedilir", () => {
    assert.equal(svixImzasiGecerli({ govde: govde + " ", id: "msg_1", zaman, imza: `v1,${imzala(govde)}`, sir, simdi }), false);
  });

  test("5 dakikadan eski istek reddedilir (tekrar oynatma)", () => {
    assert.equal(
      svixImzasiGecerli({ govde, id: "msg_1", zaman, imza: `v1,${imzala(govde)}`, sir, simdi: simdi + 6 * 60_000 }),
      false
    );
  });

  test("sır ya da başlık yoksa reddedilir", () => {
    assert.equal(svixImzasiGecerli({ govde, id: "msg_1", zaman, imza: undefined, sir, simdi }), false);
    assert.equal(svixImzasiGecerli({ govde, id: "msg_1", zaman, imza: `v1,${imzala(govde)}`, sir: "", simdi }), false);
  });
});

describe("alıcı eşleştirme", () => {
  test("To, Cc ve teslim başlıklarından yalnızca @projelio.app adresleri, tekil ve küçük harfle", () => {
    const alicilar = postaAlicilari({
      to: ["Satış <Satis@projelio.app>", "baska@firma.com"],
      cc: ["satis@projelio.app"],
      received_for: ["gelen@abc123.resend.app"],
      headers: { "X-Original-To": "gizli@projelio.app", subject: "x@projelio.app" },
    });
    assert.deepEqual(alicilar.sort(), ["gizli@projelio.app", "satis@projelio.app"]);
  });

  test("benzer alan adı eşleşmez", () => {
    assert.deepEqual(postaAlicilari({ to: ["a@projelio.app.evil.com", "b@notprojelio.app"] }), []);
  });

  test("DMARC düşen posta spam'e", () => {
    assert.equal(gelenKlasoru({ dmarc: "fail" }), "spam");
    assert.equal(gelenKlasoru({ dmarc: "pass" }), "inbox");
    assert.equal(gelenKlasoru(null), "inbox");
  });
});

describe("adres ayrıştırma", () => {
  test("adlı ve yalın biçim", () => {
    assert.deepEqual(adresAyristir('"Ali Veli" <ali@x.com>'), { name: "Ali Veli", address: "ali@x.com" });
    assert.deepEqual(adresAyristir("ali@x.com"), { address: "ali@x.com" });
    assert.equal(adresAyristir("ali"), undefined);
  });

  test("form metni virgül/noktalı virgülle bölünür, geçersizler ayrılır", () => {
    assert.deepEqual(aliciMetniniAyristir("a@x.com; B@x.com, olmaz, a@x.com"), {
      adresler: ["a@x.com", "b@x.com"],
      gecersiz: ["olmaz"],
    });
  });
});

describe("yanıt başlıkları", () => {
  test("önek üst üste binmez", () => {
    assert.equal(yanitKonusu("RE: Ynt: Teklif", "reply"), "Re: Teklif");
    assert.equal(yanitKonusu("Re: Teklif", "forward"), "Fwd: Teklif");
    assert.equal(yanitKonusu("", "reply"), "Re: (konu yok)");
  });

  test("References zinciri tekrarsız uzar", () => {
    assert.equal(referanslar("<a@x> <b@x>", "<c@x>"), "<a@x> <b@x> <c@x>");
    assert.equal(referanslar("<a@x>", "<a@x>"), "<a@x>");
    assert.equal(referanslar(null, null), undefined);
  });

  test("ek yolu yol ayırıcı taşımaz", () => {
    assert.equal(ekYolu("k", "i", "e", "../../gizli dosya.pdf"), "k/i/e-gizli_dosya.pdf");
  });
});

describe("Lio taslağı: konu ve gövde ayrımı", () => {
  test("KONU satırı ayrılır, konu boşsa öneri döner", () => {
    assert.deepEqual(konuyuAyir("KONU: Teklif hk.\n\nMerhaba,\nEkte.", ""), {
      subject: "Teklif hk.",
      text: "Merhaba,\nEkte.",
    });
  });

  test("kullanıcının yazdığı konu ezilmez", () => {
    assert.deepEqual(konuyuAyir("KONU: Başka\n\nGövde", "Benim konum"), { subject: undefined, text: "Gövde" });
  });

  test("kalın yazılmış önek de tanınır", () => {
    assert.equal(konuyuAyir("**Konu:** Toplantı\n\nGövde", "").subject, "Toplantı");
  });

  test("önek yoksa tamamı gövde", () => {
    assert.deepEqual(konuyuAyir("Merhaba,\nNasılsınız?", ""), { text: "Merhaba,\nNasılsınız?" });
  });
});
