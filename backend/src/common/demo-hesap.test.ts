import { test } from "node:test";
import * as assert from "node:assert/strict";
import { demoEpostasiMi, demoKullanicisiMi, demoHesabindaYasak } from "./demo-hesap";

test("demo e-postası büyük/küçük harf ve boşluktan etkilenmez", () => {
  assert.equal(demoEpostasiMi("ceo@celikhan.test"), true);
  assert.equal(demoEpostasiMi("  CEO@Celikhan.TEST "), true);
  assert.equal(demoEpostasiMi("ceo@celikhan.test.tr"), false);
  assert.equal(demoEpostasiMi(undefined), false);
});

test("demo kullanıcısı id ön ekinden tanınır", () => {
  assert.equal(demoKullanicisiMi("ce110001-0000-4000-8000-000000000001"), true);
  // Gerçek bir kullanıcının id'si demo aralığına düşmemeli.
  assert.equal(demoKullanicisiMi("7aa66707-dc0a-4eff-a39b-cb07be605885"), false);
  assert.equal(demoKullanicisiMi(null), false);
});

test("yasak işlem demo hesabında hata verir, başkasında sessizce geçer", () => {
  assert.throws(
    () => demoHesabindaYasak("ce110001-0000-4000-8000-000000000001", "şifre değiştirme"),
    /demo hesabı/i
  );
  assert.doesNotThrow(() => demoHesabindaYasak("7aa66707-dc0a-4eff-a39b-cb07be605885", "şifre değiştirme"));
});
