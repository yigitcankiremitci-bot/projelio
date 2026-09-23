import assert from "node:assert/strict";
import { test } from "node:test";
import { KULLANICI_ADI_DESENI, kullaniciAdiOner } from "./ekipHesaplari";

test("kullanıcı adı önerisi ilk ad + soyadı alır, Türkçe harfleri sadeleştirir", () => {
  assert.equal(kullaniciAdiOner("Ayşe Nur Yılmaz"), "ayse.yilmaz");
  assert.equal(kullaniciAdiOner("  İsmail Çağlar  "), "ismail.caglar");
  assert.equal(kullaniciAdiOner("IŞIK ÖZGÜR"), "isik.ozgur");
});

test("tek kelimelik ad olduğu gibi kalır, işaretler düşer", () => {
  assert.equal(kullaniciAdiOner("Deniz"), "deniz");
  assert.equal(kullaniciAdiOner("O'Brien-Smith"), "obriensmith");
  assert.equal(kullaniciAdiOner("   "), "");
});

test("öneri her zaman sunucunun kabul ettiği desene uyar (boş değilse)", () => {
  for (const ad of ["Şükrü Güneş", "Ümit Ağaoğlu Karadağ", "Élodie Brûlé", "Çok Uzun Bir Soyadıolanbirkişininadıburadabitmez"]) {
    const oneri = kullaniciAdiOner(ad);
    assert.ok(KULLANICI_ADI_DESENI.test(oneri), `${ad} → ${oneri}`);
  }
});
