import * as assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, test } from "node:test";
import {
  eksikTahsilat,
  magazaAdresiCoz,
  musteriKimligi,
  odemeYontemiCoz,
  shopifyTahsilEdilen,
  siparisAlanlari,
  sorguImzasiGecerli,
  webhookImzasiGecerli,
  yerelGun,
  type ShopifySiparisi,
} from "./shopify-esleme";

// Bu dosyadaki bir gerileme ya sahte bir webhook'un kasaya gelir yazmasına
// (imza), ya yetki isteğinin başka bir sunucuya gitmesine (mağaza adresi),
// ya da aynı ödemenin iki kez sayılmasına (tahsilat farkı) yol açar.

const SIR = "shpss_test";

describe("magazaAdresiCoz", () => {
  test("kısa ad myshopify adresine tamamlanır", () => {
    assert.equal(magazaAdresiCoz("Magazam"), "magazam.myshopify.com");
    assert.equal(magazaAdresiCoz(" magazam.myshopify.com "), "magazam.myshopify.com");
    assert.equal(magazaAdresiCoz("https://magazam.myshopify.com/admin/orders"), "magazam.myshopify.com");
  });

  test("myshopify dışı alan adı ve bozuk girdi reddedilir", () => {
    assert.equal(magazaAdresiCoz("magazam.com"), null);
    assert.equal(magazaAdresiCoz("kotu.site/x.myshopify.com"), null);
    assert.equal(magazaAdresiCoz("magazam.myshopify.com.kotu.site"), null);
    assert.equal(magazaAdresiCoz("-magaza"), null);
    assert.equal(magazaAdresiCoz(""), null);
    assert.equal(magazaAdresiCoz(42), null);
  });
});

describe("webhookImzasiGecerli", () => {
  const govde = Buffer.from('{"id":1,"total_price":"10.00"}');
  const imza = createHmac("sha256", SIR).update(govde).digest("base64");

  test("doğru imza geçer", () => {
    assert.equal(webhookImzasiGecerli(govde, imza, SIR), true);
  });

  test("gövde, imza ya da sır değişirse reddedilir", () => {
    assert.equal(webhookImzasiGecerli(Buffer.from('{"id":1,"total_price":"99.00"}'), imza, SIR), false);
    assert.equal(webhookImzasiGecerli(govde, imza, "baska"), false);
    assert.equal(webhookImzasiGecerli(govde, "", SIR), false);
    assert.equal(webhookImzasiGecerli(govde, "AAAA", SIR), false);
    assert.equal(webhookImzasiGecerli(undefined, imza, SIR), false);
    assert.equal(webhookImzasiGecerli(govde, imza, ""), false);
  });
});

describe("sorguImzasiGecerli", () => {
  const imzala = (q: Record<string, string>) => {
    const mesaj = Object.keys(q).sort().map((k) => `${k}=${q[k]}`).join("&");
    return { ...q, hmac: createHmac("sha256", SIR).update(mesaj).digest("hex") };
  };

  test("Shopify'ın imzaladığı sorgu geçer", () => {
    const q = imzala({ code: "abc", shop: "magazam.myshopify.com", state: "s", timestamp: "1700000000" });
    assert.equal(sorguImzasiGecerli(q, SIR), true);
  });

  test("shop değiştirilirse reddedilir", () => {
    const q = imzala({ code: "abc", shop: "magazam.myshopify.com", state: "s", timestamp: "1" });
    assert.equal(sorguImzasiGecerli({ ...q, shop: "baska.myshopify.com" }, SIR), false);
    assert.equal(sorguImzasiGecerli({ ...q, hmac: undefined }, SIR), false);
  });
});

describe("odemeYontemiCoz", () => {
  test("elle ödeme yöntemleri tanınır, gerisi kart", () => {
    assert.equal(odemeYontemiCoz(["Cash on Delivery (COD)"]), "nakit");
    assert.equal(odemeYontemiCoz(["Kapıda ödeme"]), "nakit");
    assert.equal(odemeYontemiCoz(["Bank Deposit"]), "havale");
    assert.equal(odemeYontemiCoz(["manual"]), "diger");
    assert.equal(odemeYontemiCoz(["shopify_payments"]), "kredi_karti");
    assert.equal(odemeYontemiCoz([]), "kredi_karti");
    assert.equal(odemeYontemiCoz(["barcode_pay"]), "kredi_karti");
  });
});

describe("yerelGun", () => {
  test("mağazanın yerel günü korunur, UTC'ye çevrilmez", () => {
    assert.equal(yerelGun("2026-09-24T01:30:00+03:00"), "2026-09-24");
    assert.equal(yerelGun(null), null);
    assert.equal(yerelGun("dün"), null);
  });
});

const ornek: ShopifySiparisi = {
  id: 5001,
  name: "#1001",
  created_at: "2026-09-24T01:30:00+03:00",
  currency: "try",
  total_price: "1250.50",
  total_outstanding: "0.00",
  financial_status: "paid",
  payment_gateway_names: ["iyzico"],
  line_items: [
    { title: "Tişört", quantity: 2 },
    { title: "Kupa", quantity: 1 },
    { title: "Kaldırılan", quantity: 0 },
  ],
  customer: { id: 77, email: "ayse@ornek.com", first_name: "Ayşe", last_name: "Yılmaz" },
};

describe("siparisAlanlari", () => {
  test("sipariş sütunlara çevrilir", () => {
    const r = siparisAlanlari(ornek, "2026-01-01");
    assert.ok("alanlar" in r);
    assert.deepEqual(r.alanlar, {
      siparis_no: "#1001",
      aciklama: "2× Tişört, 1× Kupa",
      miktar: 3,
      birim: "adet",
      tutar: 1250.5,
      para_birimi: "TRY",
      siparis_tarihi: "2026-09-24",
      vade_gun: 0,
      odeme_yontemi: "kredi_karti",
    });
  });

  test("test siparişi, sıfır tutar ve bozuk para birimi atlanır", () => {
    assert.ok("atla" in siparisAlanlari({ ...ornek, test: true }, "2026-01-01"));
    assert.ok("atla" in siparisAlanlari({ ...ornek, total_price: "0.00" }, "2026-01-01"));
    assert.ok("atla" in siparisAlanlari({ ...ornek, currency: undefined }, "2026-01-01"));
  });

  test("uzun kalem listesi 250 karakterde kesilir", () => {
    const kalemler = Array.from({ length: 40 }, (_, i) => ({ title: `Çok uzun ürün adı ${i}`, quantity: 1 }));
    const r = siparisAlanlari({ ...ornek, line_items: kalemler }, "2026-01-01");
    assert.ok("alanlar" in r);
    assert.equal(r.alanlar.aciklama!.length, 248);
  });
});

describe("shopifyTahsilEdilen", () => {
  test("kalan tutardan hesaplanır", () => {
    assert.equal(shopifyTahsilEdilen(ornek, 1250.5), 1250.5);
    assert.equal(shopifyTahsilEdilen({ ...ornek, financial_status: "partially_paid", total_outstanding: "250.50" }, 1250.5), 1000);
  });

  test("ödenmemiş sipariş sıfır", () => {
    assert.equal(shopifyTahsilEdilen({ ...ornek, financial_status: "pending", total_outstanding: "0" }, 1250.5), 0);
    assert.equal(shopifyTahsilEdilen({ ...ornek, financial_status: "authorized", total_outstanding: "0" }, 1250.5), 0);
  });

  test("kalan alanı yoksa durum belirler", () => {
    assert.equal(shopifyTahsilEdilen({ ...ornek, total_outstanding: undefined }, 100), 100);
    assert.equal(shopifyTahsilEdilen({ ...ornek, total_outstanding: null, financial_status: "unpaid" }, 100), 0);
  });

  test("tahsil edilen tutarı aşmaz", () => {
    assert.equal(shopifyTahsilEdilen({ ...ornek, total_outstanding: "-50" }, 100), 100);
  });
});

describe("eksikTahsilat", () => {
  test("yalnızca fark yazılır; aynı webhook ikinci kez gelirse sıfır", () => {
    assert.equal(eksikTahsilat(1250.5, 0), 1250.5);
    assert.equal(eksikTahsilat(1250.5, 1000), 250.5);
    assert.equal(eksikTahsilat(1250.5, 1250.5), 0);
    assert.equal(eksikTahsilat(0.3, 0.1 + 0.2), 0);
    assert.equal(eksikTahsilat(100, 150), 0);
  });
});

describe("musteriKimligi", () => {
  test("kişi adı ve e-posta", () => {
    const k = musteriKimligi(ornek);
    assert.equal(k.shopifyId, "77");
    assert.equal(k.ad, "Ayşe Yılmaz");
    assert.equal(k.email, "ayse@ornek.com");
    assert.equal(k.tur, "person");
  });

  test("fatura adresinde şirket varsa şirket kartı", () => {
    const k = musteriKimligi({ ...ornek, billing_address: { company: "Ornek Ltd", city: "İzmir" } });
    assert.equal(k.ad, "Ornek Ltd");
    assert.equal(k.tur, "company");
    assert.equal(k.adres?.city, "İzmir");
  });

  test("korumalı veri onayı yoksa ad boş döner", () => {
    const k = musteriKimligi({ ...ornek, customer: { id: 77 }, email: null });
    assert.equal(k.ad, null);
    assert.equal(k.shopifyId, "77");
  });
});
