import { strict as assert } from "node:assert";
import { test } from "node:test";
import { authorizationHeader, abonelikWebhookDogrula, abonelikWebhookImzasi } from "./iyzico-imza";

test("authorization başlığı IYZWSv2 + base64 biçiminde ve tek boşlukla ayrılıyor", () => {
  const { authorization } = authorizationHeader({
    apiKey: "anahtar",
    secretKey: "gizli",
    uriPath: "/v2/subscription/checkoutform/initialize",
    body: '{"a":1}',
    randomKey: "sabit123",
  });

  const [onek, kodlanmis, fazlasi] = authorization.split(" ");
  assert.equal(onek, "IYZWSv2");
  assert.equal(fazlasi, undefined, "başlıkta ikinci bir boşluk olmamalı");

  const cozulmus = Buffer.from(kodlanmis, "base64").toString("utf8");
  assert.match(cozulmus, /^apiKey:anahtar&randomKey:sabit123&signature:[0-9a-f]{64}$/);
});

test("imza gövdeye bağlı: gövde değişince imza da değişir", () => {
  const ortak = { apiKey: "a", secretKey: "s", uriPath: "/v2/x", randomKey: "r" };
  const bir = authorizationHeader({ ...ortak, body: '{"tutar":1}' }).authorization;
  const iki = authorizationHeader({ ...ortak, body: '{"tutar":2}' }).authorization;
  assert.notEqual(bir, iki);
});

test("gövdesiz istekte imza yalnızca randomKey + yol üzerinden alınır", () => {
  const govdesiz = authorizationHeader({ apiKey: "a", secretKey: "s", uriPath: "/v2/x", randomKey: "r" }).authorization;
  const bosGovde = authorizationHeader({ apiKey: "a", secretKey: "s", uriPath: "/v2/x", body: "", randomKey: "r" }).authorization;
  // Boş dize gövde "gövde yok" ile aynı sayılmalı; aksi halde GET isteklerinde
  // rastgele 401 alırdık.
  assert.equal(govdesiz, bosGovde);
});

test("randomKey verilmezse her çağrıda değişir", () => {
  const bir = authorizationHeader({ apiKey: "a", secretKey: "s", uriPath: "/v2/x" });
  const iki = authorizationHeader({ apiKey: "a", secretKey: "s", uriPath: "/v2/x" });
  assert.notEqual(bir.randomKey, iki.randomKey);
});

const govde = {
  iyziEventType: "subscription.order.success",
  subscriptionReferenceCode: "abn-1",
  orderReferenceCode: "sip-1",
  customerReferenceCode: "mus-1",
};

test("doğru imza kabul, bozuk imza ret", () => {
  const dogru = abonelikWebhookImzasi({ merchantId: "m1", secretKey: "gizli", govde });
  assert.equal(abonelikWebhookDogrula({ merchantId: "m1", secretKey: "gizli", govde, imzaBasligi: dogru }), true);
  assert.equal(
    abonelikWebhookDogrula({ merchantId: "m1", secretKey: "gizli", govde, imzaBasligi: dogru.replace(/.$/, "0") }),
    false
  );
});

test("gövdedeki tek bir alan değişince imza tutmaz", () => {
  const dogru = abonelikWebhookImzasi({ merchantId: "m1", secretKey: "gizli", govde });
  const kurcalanmis = { ...govde, subscriptionReferenceCode: "baskasinin-aboneligi" };
  assert.equal(
    abonelikWebhookDogrula({ merchantId: "m1", secretKey: "gizli", govde: kurcalanmis, imzaBasligi: dogru }),
    false
  );
});

test("anahtar ya da imza eksikse doğrulama başarısız — 'anahtar yoksa geç' kısayolu yok", () => {
  const dogru = abonelikWebhookImzasi({ merchantId: "m1", secretKey: "gizli", govde });
  assert.equal(abonelikWebhookDogrula({ merchantId: "m1", secretKey: "", govde, imzaBasligi: dogru }), false);
  assert.equal(abonelikWebhookDogrula({ merchantId: "", secretKey: "gizli", govde, imzaBasligi: dogru }), false);
  assert.equal(abonelikWebhookDogrula({ merchantId: "m1", secretKey: "gizli", govde, imzaBasligi: undefined }), false);
});

test("hex olmayan imza başlığı çökmeden reddedilir", () => {
  assert.equal(
    abonelikWebhookDogrula({ merchantId: "m1", secretKey: "gizli", govde, imzaBasligi: "hex-degil!!" }),
    false
  );
});
