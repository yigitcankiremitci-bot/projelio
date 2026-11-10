import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { katalogdaGorunurMu, modulAktifMi, modulErisilebilirMi } from "./aktifModuller";

describe("aktif modüller", () => {
  test("özel panelli ve çekirdek modüller açık", () => {
    assert.equal(modulAktifMi("crm_musteri"), true);
    assert.equal(modulAktifMi("fm_fatura"), true);
    assert.equal(modulAktifMi("yonetim_dosya_yonetimi"), true);
  });

  test("genel kayıt listesi modülleri pasif", () => {
    assert.equal(modulAktifMi("ik_bordro_ozluk"), false);
    assert.equal(modulAktifMi("kimlik_ve_yon"), false);
    assert.equal(modulAktifMi("fm_nakit_akis"), false);
  });

  test("pasif modül yalnızca admine açık", () => {
    assert.equal(modulErisilebilirMi("hud_sozlesme", "freelancer"), false);
    assert.equal(modulErisilebilirMi("hud_sozlesme", undefined), false);
    assert.equal(modulErisilebilirMi("hud_sozlesme", "admin"), true);
    assert.equal(modulErisilebilirMi("crm_musteri", "demo"), true);
  });

  test("gömülü modül erişilir ama katalogda görünmez", () => {
    assert.equal(modulErisilebilirMi("fm_alacak_borc", "freelancer"), true);
    assert.equal(katalogdaGorunurMu("fm_alacak_borc", "freelancer"), false);
    assert.equal(katalogdaGorunurMu("fm_alacak_borc", "admin"), true);
    assert.equal(katalogdaGorunurMu("pd_email", undefined), true);
  });
});
