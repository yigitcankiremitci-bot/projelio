import { strict as assert } from "node:assert";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import {
  bildirimGecerliMi,
  bildirimHash,
  direktOdemeTokeni,
  durumSorguTokeni,
  iframeTokeni,
  kartListesiTokeni,
  kartSilmeTokeni,
  kurusaCevir,
  ondalikTutar,
  siparisNumarasiCoz,
  siparisNumarasiUret,
  siparisOneki,
  telefonAlani,
} from "./paytr-imza";

const KEY = "test-merchant-key";
const SALT = "test-merchant-salt";

const ALANLAR = {
  merchantId: "750172",
  userIp: "85.100.10.20",
  merchantOid: "LIO0123456789abcdef0123456789abcdefk1x2y3",
  email: "musteri@ornek.com",
  paymentAmount: "24900",
  paymentType: "card",
  installmentCount: "0",
  currency: "TL",
  testMode: "1",
  non3d: "0",
};

test("Direkt API ödeme tokeni PayTR'nin örnek kodundaki sırayla üretilir", () => {
  // Beklenen değer burada BAĞIMSIZ olarak, PayTR'nin Node.js örneğindeki
  // birleştirme sırası elle yazılarak hesaplanıyor. Fonksiyonun kendi
  // mantığını tekrar etmiyor; sıra değişirse bu test düşer.
  const birlesim =
    "750172" + "85.100.10.20" + ALANLAR.merchantOid + "musteri@ornek.com" + "24900" + "card" + "0" + "TL" + "1" + "0";
  const beklenen = createHmac("sha256", KEY).update(birlesim + SALT, "utf8").digest("base64");
  assert.equal(direktOdemeTokeni(ALANLAR, KEY, SALT), beklenen);
});

test("tek bir alan değişince token değişir", () => {
  const temel = direktOdemeTokeni(ALANLAR, KEY, SALT);
  assert.notEqual(direktOdemeTokeni({ ...ALANLAR, paymentAmount: "24901" }, KEY, SALT), temel);
  assert.notEqual(direktOdemeTokeni({ ...ALANLAR, non3d: "1" }, KEY, SALT), temel);
  assert.notEqual(direktOdemeTokeni({ ...ALANLAR, testMode: "0" }, KEY, SALT), temel);
});

test("alanların sırası karışırsa token farklı olur", () => {
  // Birleştirme sırası bir güvenlik ayrıntısı değil ama yanlış sıra HER isteği
  // reddettirir ve PayTR sebebini söylemez; bu yüzden ayrıca doğrulanıyor.
  const tersSira = createHmac("sha256", KEY)
    .update(
      "750172" + "85.100.10.20" + ALANLAR.merchantOid + "musteri@ornek.com" + "24900" + "card" + "0" + "TL" + "0" + "1" + SALT,
      "utf8"
    )
    .digest("base64");
  assert.notEqual(direktOdemeTokeni(ALANLAR, KEY, SALT), tersSira);
});

test("iFrame tokeni sepeti ve taksit alanlarını da imzalar", () => {
  // PayTR'nin iFrame örneğindeki sıra (PHP):
  // merchant_id + user_ip + merchant_oid + email + payment_amount +
  // user_basket + no_installment + max_installment + currency + test_mode
  const alanlar = {
    merchantId: "750172",
    userIp: "85.100.10.20",
    merchantOid: "LIOdeneme1",
    email: "musteri@ornek.com",
    paymentAmount: "24900",
    userBasketB64: "W1siTGlvIEJha2l5ZXNpIiwiMjQ5LjAwIiwxXV0=",
    noInstallment: "1",
    maxInstallment: "0",
    currency: "TL",
    testMode: "1",
  };
  const birlesim =
    "750172" + "85.100.10.20" + "LIOdeneme1" + "musteri@ornek.com" + "24900" +
    alanlar.userBasketB64 + "1" + "0" + "TL" + "1";
  const beklenen = createHmac("sha256", KEY).update(birlesim + SALT, "utf8").digest("base64");
  assert.equal(iframeTokeni(alanlar, KEY, SALT), beklenen);
});

test("iFrame ve Direkt API tokenleri BİRBİRİNİN YERİNE KULLANILAMAZ", () => {
  // Bu testin sebebi canlıda yaşandı: iFrame ucuna Direkt API sırasıyla
  // imzalanmış istek gönderildi, PayTR "paytr_token gecersiz" dedi ve hangi
  // alanın yanlış olduğunu söylemedi.
  const ortak = {
    merchantId: "750172",
    userIp: "85.100.10.20",
    merchantOid: "LIOdeneme1",
    email: "musteri@ornek.com",
    paymentAmount: "24900",
    currency: "TL",
    testMode: "1",
  };
  const iframe = iframeTokeni(
    { ...ortak, userBasketB64: "W10=", noInstallment: "1", maxInstallment: "0" },
    KEY,
    SALT
  );
  const direkt = direktOdemeTokeni(
    { ...ortak, paymentType: "card", installmentCount: "0", non3d: "0" },
    KEY,
    SALT
  );
  assert.notEqual(iframe, direkt);
});

test("geçerli bildirim kabul edilir", () => {
  const hash = bildirimHash({ merchantOid: "LIO1", status: "success", totalAmount: "24900" }, KEY, SALT);
  assert.equal(
    bildirimGecerliMi({ merchant_oid: "LIO1", status: "success", total_amount: "24900", hash }, KEY, SALT),
    true
  );
});

test("durumu değiştirilmiş bildirim reddedilir", () => {
  // Saldırının en bariz biçimi: başarısız bir bildirimi 'success' yapmak.
  const hash = bildirimHash({ merchantOid: "LIO1", status: "failed", totalAmount: "0" }, KEY, SALT);
  assert.equal(bildirimGecerliMi({ merchant_oid: "LIO1", status: "success", total_amount: "0", hash }, KEY, SALT), false);
});

test("tutarı değiştirilmiş bildirim reddedilir", () => {
  const hash = bildirimHash({ merchantOid: "LIO1", status: "success", totalAmount: "100" }, KEY, SALT);
  assert.equal(
    bildirimGecerliMi({ merchant_oid: "LIO1", status: "success", total_amount: "24900", hash }, KEY, SALT),
    false
  );
});

test("hash yoksa ya da anahtar yanlışsa reddedilir", () => {
  const hash = bildirimHash({ merchantOid: "LIO1", status: "success", totalAmount: "1" }, KEY, SALT);
  assert.equal(bildirimGecerliMi({ merchant_oid: "LIO1", status: "success", total_amount: "1" }, KEY, SALT), false);
  assert.equal(bildirimGecerliMi({ merchant_oid: "LIO1", status: "success", total_amount: "1", hash: "" }, KEY, SALT), false);
  assert.equal(
    bildirimGecerliMi({ merchant_oid: "LIO1", status: "success", total_amount: "1", hash }, "baska-anahtar", SALT),
    false
  );
});

test("farklı uzunluktaki hash fırlatmadan reddedilir", () => {
  // timingSafeEqual farklı uzunlukta istisna atar; uç bunu 500'e çevirmemeli.
  assert.equal(bildirimGecerliMi({ merchant_oid: "LIO1", status: "success", total_amount: "1", hash: "kisa" }, KEY, SALT), false);
});

test("durum sorgu tokeni merchant_id + oid + salt sırasıyla üretilir", () => {
  // Ödeme tokeninden FARKLI bir sıra; PayTR'nin durum-sorgu örneğinden alındı.
  const beklenen = createHmac("sha256", KEY).update("750172" + "LIO1" + SALT, "utf8").digest("base64");
  assert.equal(durumSorguTokeni({ merchantId: "750172", merchantOid: "LIO1" }, KEY, SALT), beklenen);
  // Sıra ters çevrilince farklı çıkmalı — karıştırılması kolay iki token.
  const ters = createHmac("sha256", KEY).update("LIO1" + "750172" + SALT, "utf8").digest("base64");
  assert.notEqual(durumSorguTokeni({ merchantId: "750172", merchantOid: "LIO1" }, KEY, SALT), ters);
});

test("sipariş numarası üretilip geri çözülür", () => {
  const orderId = "3f1a9c2e-7b4d-4a51-9c33-0d2e8f6a1b47";
  const oid = siparisNumarasiUret(orderId, 1758184800000);
  assert.ok(oid.startsWith("LIO"));
  assert.ok(/^[A-Za-z0-9]+$/.test(oid), "alfanumerik olmalı");
  assert.ok(oid.length <= 64);
  assert.equal(siparisNumarasiCoz(oid), orderId);
});

test("aynı sipariş için üretilen numara her denemede farklıdır", () => {
  // PayTR aynı sipariş numarasını ikinci kez kabul etmiyor; başarısız bir
  // ödemenin tekrarı bu yüzden yeni bir numarayla gitmeli.
  const orderId = "3f1a9c2e-7b4d-4a51-9c33-0d2e8f6a1b47";
  const ilk = siparisNumarasiUret(orderId, 1758184800000);
  const ikinci = siparisNumarasiUret(orderId, 1758184800500);
  assert.notEqual(ilk, ikinci);
  assert.equal(siparisNumarasiCoz(ilk), siparisNumarasiCoz(ikinci));
});

test("tanınmayan sipariş numarası null döner", () => {
  assert.equal(siparisNumarasiCoz("BASKA123"), null);
  assert.equal(siparisNumarasiCoz("LIOxyz"), null);
  assert.equal(siparisNumarasiCoz(""), null);
});

test("telefon boşsa yer tutucu gider", () => {
  // Boş user_phone ile istek PayTR tarafından reddediliyor; canlıda yaşandı.
  assert.equal(telefonAlani(undefined), "0000000000");
  assert.equal(telefonAlani(null), "0000000000");
  assert.equal(telefonAlani("   "), "0000000000");
});

test("telefondaki rakam dışı karakterler ayıklanır", () => {
  assert.equal(telefonAlani("+90 (541) 863 67 53"), "905418636753");
  assert.equal(telefonAlani("0541-863-67-53"), "05418636753");
});

test("telefon 20 karakteri aşmaz", () => {
  assert.equal(telefonAlani("1".repeat(40)).length, 20);
});

test("tutar kuruşa çevrilir", () => {
  assert.equal(kurusaCevir(34.56), "3456");
  assert.equal(kurusaCevir(249), "24900");
  // 19.99 * 100 kayan noktada 1998.9999... — Math.round olmadan 1998 yazardı.
  assert.equal(kurusaCevir(19.99), "1999");
});

test("Direkt API tutarı noktalı ondalık TL'dir, kuruş DEĞİL", () => {
  // Kuruş biçimini ("3456") buraya vermek 100 katı tutar çekmek olurdu.
  assert.equal(ondalikTutar(34.56), "34.56");
  assert.equal(ondalikTutar(249), "249.00");
  assert.equal(ondalikTutar(1), "1.00");
  assert.equal(ondalikTutar(19.99), "19.99");
  assert.equal(ondalikTutar(0.1 + 0.2), "0.30");
});

test("kart listesi tokeni utoken + salt sırasıyla üretilir", () => {
  const beklenen = createHmac("sha256", KEY).update("UTOK" + SALT, "utf8").digest("base64");
  assert.equal(kartListesiTokeni("UTOK", KEY, SALT), beklenen);
});

test("kart silme tokeninde ctoken utoken'dan ÖNCE gelir", () => {
  const beklenen = createHmac("sha256", KEY).update("CTOK" + "UTOK" + SALT, "utf8").digest("base64");
  assert.equal(kartSilmeTokeni({ utoken: "UTOK", ctoken: "CTOK" }, KEY, SALT), beklenen);
  const ters = createHmac("sha256", KEY).update("UTOK" + "CTOK" + SALT, "utf8").digest("base64");
  assert.notEqual(kartSilmeTokeni({ utoken: "UTOK", ctoken: "CTOK" }, KEY, SALT), ters);
});

test("önekli sipariş numarası kendi önekiyle çözülür, başkasınınkiyle çözülmez", () => {
  const userId = "3f1a9c2e-7b4d-4a51-9c33-0d2e8f6a1b47";
  const oid = siparisNumarasiUret(userId, 1758184800000, "KRT");
  assert.equal(siparisOneki(oid), "KRT");
  assert.equal(siparisNumarasiCoz(oid, "KRT"), userId);
  // Kart saklama bildirimi Lio Bakiyesi siparişi sanılmamalı.
  assert.equal(siparisNumarasiCoz(oid), null);
  assert.equal(siparisOneki(siparisNumarasiUret(userId)), "LIO");
  assert.equal(siparisOneki("XYZ123"), null);
});
