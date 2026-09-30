// Backend tsconfig'inde esModuleInterop kapalı (NestJS CommonJS derlemesi
// gereği), bu yüzden namespace import kullanılıyor.
import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildLinkUrl, generateLinkCode, komutuSohbeteCevir, parseInboundCommand } from "./whatsapp-optin";

describe("gelen komut çözümleme", () => {
  test("eşleştirme kodu, küçük harf ve etrafında metinle bile", () => {
    assert.deepEqual(parseInboundCommand("projelio-k7x2"), { kind: "link", code: "PROJELIO-K7X2" });
    assert.deepEqual(parseInboundCommand("Merhaba PROJELIO-ABCD kodum"), { kind: "link", code: "PROJELIO-ABCD" });
  });

  test("kodda yasak karakter (0/O/1/I) varsa kod sayılmaz", () => {
    assert.deepEqual(parseInboundCommand("PROJELIO-AB0I"), { kind: "none" });
  });

  test("çıkış kelimeleri", () => {
    for (const w of ["DUR", "dur", "Durdur", "iptal", "STOP", "Çıkış", "dur."]) {
      assert.deepEqual(parseInboundCommand(w), { kind: "opt_out" }, w);
    }
  });

  test("başlatma kelimeleri", () => {
    for (const w of ["BAŞLAT", "baslat", "start", "Devam"]) {
      assert.deepEqual(parseInboundCommand(w), { kind: "opt_in" }, w);
    }
  });

  test("onay kelimeleri", () => {
    for (const w of ["EVET", "evet", "Onaylıyorum", "tamam", "ok"]) {
      assert.deepEqual(parseInboundCommand(w), { kind: "confirm" }, w);
    }
    assert.deepEqual(parseInboundCommand("evet ama yarın"), { kind: "none" });
  });

  test("cümle içindeki komut kelimesi komut değildir", () => {
    assert.deepEqual(parseInboundCommand("dur bakalım şunu da ekle"), { kind: "none" });
  });

  test("boş", () => {
    assert.deepEqual(parseInboundCommand(""), { kind: "none" });
    assert.deepEqual(parseInboundCommand(undefined), { kind: "none" });
  });
});

describe("eşleştirme kodu üretimi", () => {
  test("biçim ve belirlenimcilik", () => {
    const code = generateLinkCode(() => 0);
    assert.equal(code, "PROJELIO-AAAA");
    assert.deepEqual(parseInboundCommand(code), { kind: "link", code });
  });

  test("wa.me bağlantısı", () => {
    assert.equal(buildLinkUrl("+905321234567", "PROJELIO-AB2C"), "https://wa.me/905321234567?text=PROJELIO-AB2C");
  });
});

describe("komutuSohbeteCevir", () => {
  const bagli = { user_id: "u1", opt_in_state: "opted_in", pending_user_id: null };

  test("bağlı kullanıcının 'onaylıyorum' cevabı sohbettir (Lio'ya gider)", () => {
    assert.deepEqual(komutuSohbeteCevir(parseInboundCommand("onaylıyorum"), bagli), { kind: "none" });
    assert.deepEqual(komutuSohbeteCevir(parseInboundCommand("Tamam"), bagli), { kind: "none" });
    assert.deepEqual(komutuSohbeteCevir(parseInboundCommand("devam"), bagli), { kind: "none" });
  });

  test("bekleyen aday varken EVET hâlâ eşleştirme onayıdır", () => {
    const aday = { user_id: null, opt_in_state: null, pending_user_id: "u2" };
    assert.equal(komutuSohbeteCevir(parseInboundCommand("evet"), aday).kind, "confirm");
  });

  test("çıkış komutu bağlı kullanıcıda da çalışır", () => {
    assert.equal(komutuSohbeteCevir(parseInboundCommand("dur"), bagli).kind, "opt_out");
  });

  test("bildirimi kapatmış kullanıcının BAŞLAT'ı yeniden açar", () => {
    const kapali = { user_id: "u1", opt_in_state: "opted_out", pending_user_id: null };
    assert.equal(komutuSohbeteCevir(parseInboundCommand("başlat"), kapali).kind, "opt_in");
  });
});

describe("çıkış kelimeleri sohbet bağlamında", () => {
  const bagli = { user_id: "u1", opt_in_state: "opted_in", pending_user_id: null, sohbet_aktif: true };

  test("Lio ile süren sohbette 'iptal' ve 'dur' sohbettir", () => {
    assert.equal(komutuSohbeteCevir(parseInboundCommand("iptal"), bagli, "iptal").kind, "none");
    assert.equal(komutuSohbeteCevir(parseInboundCommand("Dur!"), bagli, "Dur!").kind, "none");
  });

  test("sohbet sürerken bile kesin çıkış kelimeleri çıkıştır", () => {
    for (const w of ["stop", "durdur", "çıkış"]) {
      assert.equal(komutuSohbeteCevir(parseInboundCommand(w), bagli, w).kind, "opt_out", w);
    }
  });

  test("sohbet yokken 'iptal' çıkıştır", () => {
    assert.equal(komutuSohbeteCevir(parseInboundCommand("iptal"), { ...bagli, sohbet_aktif: false }, "iptal").kind, "opt_out");
  });
});
