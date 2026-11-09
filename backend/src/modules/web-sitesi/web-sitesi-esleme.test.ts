import * as assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, test } from "node:test";
import {
  anahtariAyikla,
  baglantiYonetebilir,
  bildirimImzasi,
  epostaCoz,
  ipOzelMi,
  musteriFiyatiEkle,
  portalYetkileriCoz,
  siparisDisKimligi,
  siparisIstegiCoz,
  siteMusterisi,
  siteSiparisi,
  siteUrunu,
  sitedeGorunur,
  sonrakiDenemeGecikmesiMs,
  stokIstegiCoz,
  webhookAdresiCoz,
} from "./web-sitesi-esleme";

describe("web sitesi: ürün yükü", () => {
  const satir = {
    id: "u1",
    name: "Kupa",
    sku: "KUPA-01",
    price: "149.90",
    currency: "TRY",
    stock_quantity: "3",
    cost_price: "40",
    notes: "tedarikçi gecikiyor",
    supplier_party_id: "p1",
    status: "active",
    kind: "product",
    cover_image_url: null,
    features: ["El yapımı", 5],
  };

  test("maliyet, iç not ve tedarikçi siteye ÇIKMAZ", () => {
    const y = siteUrunu(satir) as any;
    assert.equal(y.cost_price, undefined);
    assert.equal(y.notes, undefined);
    assert.equal(y.supplier_party_id, undefined);
    assert.equal(JSON.stringify(y).includes("tedarikçi"), false);
  });

  test("sayılar sayıya çevrilir, bozuk özellik atılır", () => {
    const y = siteUrunu(satir);
    assert.equal(y.price, 149.9);
    assert.equal(y.stock, 3);
    assert.deepEqual(y.features, ["El yapımı"]);
  });

  test("stok girilmemiş ürün tükendi sayılmaz; sıfır stok tükendi", () => {
    assert.equal(siteUrunu({ ...satir, stock_quantity: null }).in_stock, true);
    assert.equal(siteUrunu({ ...satir, stock_quantity: 0 }).in_stock, false);
    assert.equal(siteUrunu({ ...satir, stock_quantity: -2 }).in_stock, false);
    assert.equal(siteUrunu({ ...satir, kind: "service", stock_quantity: 0 }).in_stock, true);
  });

  test("görseller sıraya dizilir, kapak yoksa ilk görsel kapak olur", () => {
    const y = siteUrunu(satir, [
      { url: "https://x/2.jpg", sort_order: 2 },
      { url: "https://x/1.jpg", sort_order: 1 },
      { url: "javascript:alert(1)", sort_order: 0 },
    ]);
    assert.deepEqual(y.images, ["https://x/1.jpg", "https://x/2.jpg"]);
    assert.equal(y.cover_image, "https://x/1.jpg");
  });

  test("arşivdeki ya da satış dışı ürün görünmez", () => {
    assert.equal(sitedeGorunur(satir), true);
    assert.equal(sitedeGorunur({ ...satir, status: "inactive" }), false);
    assert.equal(sitedeGorunur({ ...satir, archived_at: "2026-11-01" }), false);
    assert.equal(sitedeGorunur(null), false);
  });
});

describe("web sitesi: anahtar ve imza", () => {
  test("yalnızca psite_ önekli Bearer anahtar kabul edilir", () => {
    const a = "psite_" + "x".repeat(32);
    assert.equal(anahtariAyikla(`Bearer ${a}`), a);
    assert.equal(anahtariAyikla(a), a);
    assert.equal(anahtariAyikla("Bearer ajan_" + "x".repeat(32)), null);
    assert.equal(anahtariAyikla("Bearer psite_kisa"), null);
    assert.equal(anahtariAyikla(undefined), null);
  });

  test("imza zaman.gövde üzerinden HMAC-SHA256 hex", () => {
    const beklenen = createHmac("sha256", "whsec_s").update('1700000000.{"a":1}').digest("hex");
    assert.equal(bildirimImzasi("whsec_s", 1700000000, '{"a":1}'), "sha256=" + beklenen);
  });

  test("bekleme artar ve 12 saatte sabitlenir", () => {
    assert.equal(sonrakiDenemeGecikmesiMs(1), 60_000);
    assert.ok(sonrakiDenemeGecikmesiMs(4) > sonrakiDenemeGecikmesiMs(3));
    assert.equal(sonrakiDenemeGecikmesiMs(20), 720 * 60_000);
  });
});

describe("web sitesi: bildirim adresi (SSRF)", () => {
  test("https ve genel alan adı kabul", () => {
    assert.equal(webhookAdresiCoz(" https://magaza.com/projelio/hook#x "), "https://magaza.com/projelio/hook");
  });

  test("http, yerel ad, özel IP, kimlik bilgisi ve başka port reddedilir", () => {
    for (const a of [
      "http://magaza.com/hook",
      "https://localhost/hook",
      "https://db.internal/hook",
      "https://10.0.0.5/hook",
      "https://169.254.169.254/latest/meta-data",
      "https://100.111.242.24/hook",
      "https://[::1]/hook",
      "https://kullanici:sifre@magaza.com/hook",
      "https://magaza.com:5432/hook",
      "https://intranet/hook",
      "javascript:alert(1)",
      "",
      42,
    ]) {
      assert.equal(webhookAdresiCoz(a), null, String(a));
    }
  });

  test("ipOzelMi", () => {
    assert.equal(ipOzelMi("8.8.8.8"), false);
    assert.equal(ipOzelMi("192.168.1.1"), true);
    assert.equal(ipOzelMi("172.20.0.1"), true);
    assert.equal(ipOzelMi("::ffff:127.0.0.1"), true);
    assert.equal(ipOzelMi("fd00::1"), true);
    assert.equal(ipOzelMi("2a00:1450:4017::200e"), false);
    assert.equal(ipOzelMi("adres-degil"), true);
  });
});

describe("web sitesi: stok isteği", () => {
  test("satış: aynı sku iki satırda gelirse toplanır", () => {
    const r = stokIstegiCoz({
      reference: " SIP-1042 ",
      type: "sale",
      items: [
        { sku: "KUPA-01", quantity: 2 },
        { sku: "KUPA-01", quantity: 1 },
        { product_id: "0b6f5f7e-1c2d-4e5f-8a9b-0c1d2e3f4a5b", quantity: 0.5 },
      ],
    });
    assert.ok("istek" in r);
    assert.equal(r.istek.referans, "SIP-1042");
    assert.equal(r.istek.tur, "satis");
    assert.deepEqual(r.istek.kalemler, [
      { sku: "KUPA-01", miktar: 3 },
      { productId: "0b6f5f7e-1c2d-4e5f-8a9b-0c1d2e3f4a5b", miktar: 0.5 },
    ]);
  });

  test("tür verilmezse satış; return → iade", () => {
    const a = stokIstegiCoz({ reference: "1", items: [{ sku: "A", quantity: 1 }] });
    const b = stokIstegiCoz({ reference: "1", type: "return", items: [{ sku: "A", quantity: 1 }] });
    assert.ok("istek" in a && "istek" in b);
    assert.equal(a.istek.tur, "satis");
    assert.equal(b.istek.tur, "iade");
  });

  test("hatalı gövdeler anlaşılır İngilizce hatayla reddedilir", () => {
    const hatali: unknown[] = [
      null,
      {},
      { reference: "1", items: [] },
      { reference: "1", type: "refund", items: [{ sku: "A", quantity: 1 }] },
      { reference: "1", items: [{ sku: "A", quantity: 0 }] },
      { reference: "1", items: [{ sku: "A", quantity: -1 }] },
      { reference: "1", items: [{ quantity: 1 }] },
      { reference: "1", items: [{ product_id: "abc", quantity: 1 }] },
      { reference: "x".repeat(121), items: [{ sku: "A", quantity: 1 }] },
      { reference: "1", items: Array.from({ length: 101 }, (_, i) => ({ sku: `S${i}`, quantity: 1 })) },
    ];
    for (const g of hatali) {
      const r = stokIstegiCoz(g);
      assert.ok("hata" in r, JSON.stringify(g)?.slice(0, 60));
    }
  });
});

describe("web sitesi B2B: müşteri fiyatı", () => {
  const satir = { id: "u1", name: "Sprey", price: "100.00", tax_rate: "10", status: "active" };

  test("iskonto KDV hariç fiyata, sonra KDV — kuruşu kuruşuna", () => {
    const u = musteriFiyatiEkle(siteUrunu(satir), satir, 12.5);
    assert.equal(u.discount_rate, 12.5);
    assert.equal(u.list_price_with_tax, 110);
    assert.equal(u.customer_price, 87.5);
    assert.equal(u.customer_price_with_tax, 96.25);
  });

  test("iskontosuz müşteri liste fiyatını görür; fiyatsız ürün null", () => {
    const u = musteriFiyatiEkle(siteUrunu(satir), satir, null);
    assert.equal(u.discount_rate, 0);
    assert.equal(u.customer_price_with_tax, 110);
    const f = musteriFiyatiEkle(siteUrunu({ ...satir, price: null }), { ...satir, price: null }, 10);
    assert.equal(f.customer_price, null);
    assert.equal(f.customer_price_with_tax, null);
  });
});

describe("web sitesi B2B: müşteri yükü (beyaz liste)", () => {
  test("vergi no, telefon, e-posta, adres ayrıntısı çıkmaz", () => {
    const m = siteMusterisi({
      id: "p1",
      display_name: "Merkez Eczanesi",
      legal_name: "Merkez Ecz. Ltd.",
      tax_number: "1234567890",
      phone: "+90 555",
      email: "a@b.com",
      address: { city: "İzmir", district: "Bornova", line1: "Gizli sk. 5", postalCode: "35000" },
      status: "active",
      iskonto_orani: "7.50",
    });
    assert.deepEqual(m, {
      id: "p1",
      display_name: "Merkez Eczanesi",
      legal_name: "Merkez Ecz. Ltd.",
      city: "İzmir",
      district: "Bornova",
      status: "active",
      discount_rate: 7.5,
    });
  });
});

describe("web sitesi B2B: sipariş isteği", () => {
  const musteri = "11111111-1111-4111-8111-111111111111";

  test("geçerli istek; aynı ürün iki satırda toplanır, fiyat yok sayılır", () => {
    const r = siparisIstegiCoz({
      customer_id: musteri,
      reference: "SIP-1",
      note: "  kapıya  ",
      items: [
        { sku: "A", quantity: 2, price: 1 },
        { sku: "A", quantity: 3 },
      ],
    });
    assert.ok("istek" in r);
    assert.equal(r.istek.referans, "SIP-1");
    assert.equal(r.istek.not, "kapıya");
    assert.equal(r.istek.portalKullaniciId, null);
    assert.deepEqual(r.istek.kalemler.map((k) => [k.sku, k.miktar]), [["A", 5]]);
  });

  test("müşteri yok, adet sıfır, bozuk portal kullanıcısı → hata", () => {
    assert.ok("hata" in siparisIstegiCoz({ reference: "R", items: [{ sku: "A", quantity: 1 }] }));
    assert.ok("hata" in siparisIstegiCoz({ customer_id: musteri, reference: "R", items: [{ sku: "A", quantity: 0 }] }));
    assert.ok("hata" in siparisIstegiCoz({ customer_id: musteri, reference: "R", items: [{ sku: "A", quantity: -1 }] }));
    assert.ok("hata" in siparisIstegiCoz({ customer_id: musteri, reference: "R", items: [] }));
    assert.ok("hata" in siparisIstegiCoz({ customer_id: musteri, reference: "R", portal_user_id: "x", items: [{ sku: "A", quantity: 1 }] }));
  });

  test("dış kimlik bağlantıya önekli: iki şirketin aynı referansı çakışmaz", () => {
    assert.notEqual(siparisDisKimligi("b1", "SIP-1"), siparisDisKimligi("b2", "SIP-1"));
    assert.equal(siparisDisKimligi("b1", "SIP-1"), "b1:SIP-1");
  });
});

describe("web sitesi B2B: portal kullanıcısı", () => {
  test("yetkiler ayıklanır, sıralanır; dizi değilse null", () => {
    assert.deepEqual(portalYetkileriCoz(["fiyat_gor", "admin", "siparis_ver", "fiyat_gor"]), ["siparis_ver", "fiyat_gor"]);
    assert.deepEqual(portalYetkileriCoz([]), []);
    assert.equal(portalYetkileriCoz("siparis_ver"), null);
  });

  test("e-posta küçük harfe iner, bozuğu reddedilir", () => {
    assert.equal(epostaCoz("  Ali@Eczane.COM "), "ali@eczane.com");
    assert.equal(epostaCoz("ali@"), null);
    assert.equal(epostaCoz(5), null);
  });
});

describe("web sitesi B2B: sipariş yükü", () => {
  test("tahsilat çıkmaz, aşama İngilizce, sku eklenir", () => {
    const o = siteSiparisi(
      {
        id: "s1",
        siparisNo: "SIP-1",
        partyId: "p1",
        asama: "onaylandi",
        kaynak: "web_sitesi",
        siparisTarihi: "2026-11-09",
        paraBirimi: "TRY",
        tutar: 192.5,
        kalemler: [{ productId: "u1", miktar: 2, birimFiyat: 96.25, listeBirimFiyat: 110, tutar: 192.5 }],
        tahsilatlar: [{ id: "t1", tutar: 50 }],
        createdAt: "2026-11-09T10:00:00Z",
      } as any,
      new Map([["u1", "SPR-30"]])
    );
    assert.equal(o.status, "approved");
    assert.equal(o.source, "website");
    assert.equal(o.items[0].sku, "SPR-30");
    assert.equal(o.items[0].unit_price, 96.25);
    assert.equal(o.total, 192.5);
    assert.ok(!("tahsilatlar" in o) && !("payments" in o) && !("paid" in o));
  });
});

describe("web sitesi: bağlantıyı kim yönetir", () => {
  test("izinli listedeki kişi şirkette çalışıyorsa sahibi olmasa da yönetir", () => {
    for (const rol of ["owner", "department_manager", "member", "staff"]) assert.equal(baglantiYonetebilir(rol, true), true, rol);
  });
  test("taşeron ve şirketi göremeyen asla; listede olmayan sahip de değil", () => {
    assert.equal(baglantiYonetebilir("subcontractor", true), false);
    assert.equal(baglantiYonetebilir("none", true), false);
    assert.equal(baglantiYonetebilir("owner", false), false);
    assert.equal(baglantiYonetebilir("member", false), false);
  });
});
