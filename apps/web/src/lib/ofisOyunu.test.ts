import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  BOS_KAYIT,
  esyaAlani,
  izgarayaOturt,
  kaydiCoz,
  kazanilanPuan,
  duzeniUygula,
  masaAlani,
  MODUL_ESYALARI,
  modulYerleri,
  yolHakki,
  ofisPlani,
  ofisSeviyesi,
  yerlestirilebilir,
} from "./ofisOyunu";

describe("ofisPlani", () => {
  test("departman yoksa departman odası da yok", () => {
    const p = ofisPlani([]);
    assert.equal(p.odalar.filter((o) => o.tur === "departman").length, 0);
    assert.ok(p.odalar.some((o) => o.tur === "ortak"));
    assert.ok(p.odalar.some((o) => o.tur === "toplanti"));
  });

  test("referanstaki asimetrik halka: üstte üç oda, yanlarda birer, altta girişin iki yanında", () => {
    const p = ofisPlani(["urun", "pazarlama", "satis", "operasyon", "finans", "ik"].map((id) => ({ id, kisi: 3 })));
    const ortak = p.odalar.find((o) => o.tur === "ortak")!;
    const yer = (id: string) => p.odalar.find((o) => o.id === id)!;
    const ust = ["urun", "pazarlama", "toplanti"].map(yer);
    for (const o of ust) assert.ok(o.z + o.d <= ortak.z + 1e-9, o.id);
    // Dış hat basamaklı: üst odaların kuzey kenarları ve derinlikleri aynı değil.
    assert.ok(new Set(ust.map((o) => o.z)).size > 1);
    assert.ok(new Set(ust.map((o) => o.d)).size > 1);
    // Toplantı odası en sağda ve ortak alana dayanır (aşağı sarkar).
    assert.ok(yer("toplanti").x > yer("pazarlama").x);
    assert.ok(Math.abs(yer("toplanti").z + yer("toplanti").d - ortak.z) < 1e-9);
    assert.ok(yer("satis").x + yer("satis").w <= ortak.x + 1e-9);
    assert.ok(yer("operasyon").x >= ortak.x + ortak.w - 1e-9);
    const giris = p.odalar.find((o) => o.tur === "giris")!;
    assert.ok(yer("finans").z >= ortak.z + ortak.d - 1e-9 && yer("ik").z >= ortak.z + ortak.d - 1e-9);
    assert.ok(yer("finans").x < giris.x && yer("ik").x >= giris.x + giris.w - 1e-9);
  });

  test("her departmana bir oda; merkez üstten ve iki yandan çevrili", () => {
    const p = ofisPlani(["a", "b", "c", "d", "e", "f"].map((id) => ({ id, kisi: 3 })));
    const deps = p.odalar.filter((o) => o.tur === "departman");
    assert.deepEqual(deps.map((o) => o.id).sort(), ["a", "b", "c", "d", "e", "f"]);
    const ortak = p.odalar.find((o) => o.tur === "ortak")!;
    assert.ok(ortak.w >= 7 && ortak.d >= 7);
    assert.ok(deps.some((o) => o.z + o.d <= ortak.z));
    assert.ok(deps.some((o) => o.x + o.w <= ortak.x));
    assert.ok(deps.some((o) => o.x >= ortak.x + ortak.w));
  });

  test("her sayıda departmanla her odanın kapısı ortak alana (ya da girintisine) açılır", () => {
    for (let n = 0; n <= 14; n++) {
      const p = ofisPlani(Array.from({ length: n }, (_, i) => ({ id: `d${i}`, kisi: (i * 3) % 9 })));
      const ortaklar = p.odalar.filter((o) => o.tur === "ortak" || o.tur === "giris" || o.tur === "koridor");
      for (const o of p.odalar.filter((o) => o.tur === "departman" || o.tur === "toplanti")) {
        const dis = { x: o.kapi.x + o.kapiYonu.x * 0.3, z: o.kapi.z + o.kapiYonu.z * 0.3 };
        assert.ok(ortaklar.some((r) => dis.x > r.x && dis.x < r.x + r.w && dis.z > r.z && dis.z < r.z + r.d), `${n} departman, ${o.id}`);
      }
      // Her odanın kapısı bir duvarda gerçekten boşluk olarak var.
      assert.equal(p.duvarlar.filter((d) => d.kapi).length, n + 1);
    }
  });

  test("masa sayısı kişiyle büyür, sığmayan sayılır", () => {
    const p = ofisPlani([
      { id: "az", kisi: 1 },
      { id: "cok", kisi: 11 },
    ]);
    const az = p.odalar.find((o) => o.id === "az")!;
    const cok = p.odalar.find((o) => o.id === "cok")!;
    assert.equal(az.masalar.length, 2);
    assert.equal(cok.masalar.length, 8);
    assert.equal(cok.sigmayan, 3);
    // Aynı sütundaki odalar eşit genişlikte; sütun en kalabalık odaya göre açılır.
    assert.ok(cok.w >= 4 * 1.5 + 2);
    assert.ok(az.masalar.every((m) => m.x > az.x && m.x < az.x + az.w));
  });

  test("odalar üst üste binmez ve ofis genişliğini aşmaz", () => {
    const p = ofisPlani(["a", "b", "c", "d", "e"].map((id, i) => ({ id, kisi: i * 2 })));
    for (const o of p.odalar) assert.ok(o.x + o.w <= p.genislik + 1e-9 && o.z + o.d <= p.derinlik + 1e-9);
    for (let i = 0; i < p.odalar.length; i++)
      for (let j = i + 1; j < p.odalar.length; j++) {
        const a = p.odalar[i];
        const b = p.odalar[j];
        const binme = a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 && a.z < b.z + b.d - 1e-9 && b.z < a.z + a.d - 1e-9;
        assert.equal(binme, false, `${a.id} ile ${b.id}`);
      }
  });
});

describe("puan ve seviye", () => {
  test("görev başına puan", () => {
    assert.equal(kazanilanPuan(7), 70);
    assert.equal(kazanilanPuan(-3), 0);
  });

  test("seviye eşikleri", () => {
    assert.equal(ofisSeviyesi(0).seviye, 1);
    assert.equal(ofisSeviyesi(99).seviye, 1);
    assert.equal(ofisSeviyesi(100).seviye, 2);
    const s = ofisSeviyesi(150);
    assert.equal(s.seviye, 2);
    assert.ok(s.ilerleme > 0 && s.ilerleme < 1);
  });
});

describe("yerleştirme", () => {
  const plan = ofisPlani([{ id: "a", kisi: 2 }]);
  const ortak = plan.odalar.find((o) => o.tur === "ortak")!;
  // Batı duvarında kahve köşesi var; denemeler ortak alanın kuzeydoğu köşesinde.
  const kx = ortak.x + ortak.w;

  test("ortak alanın köşesine bitki konur, oturma grubuna ve kahve köşesine konmaz", () => {
    assert.equal(yerlestirilebilir({ tur: "bitki", x: kx - 0.8, z: ortak.z + 0.8, don: 0 }, plan, []), true);
    assert.equal(yerlestirilebilir({ tur: "bitki", x: plan.oturma.x, z: plan.oturma.z, don: 0 }, plan, []), false);
    assert.equal(yerlestirilebilir({ tur: "bitki", x: plan.kahve.x + 0.2, z: plan.kahve.z, don: 0 }, plan, []), false);
  });

  test("ofis dışına konmaz, eşyalar çakışmaz", () => {
    assert.equal(yerlestirilebilir({ tur: "bitki", x: -2, z: -2, don: 0 }, plan, []), false);
    const var1 = { id: "1", tur: "bitki" as const, x: kx - 0.8, z: ortak.z + 0.8, don: 0 };
    assert.equal(yerlestirilebilir({ tur: "puf", x: kx - 1, z: ortak.z + 0.9, don: 0 }, plan, [var1]), false);
    // Taşınan eşya kendisiyle çakışmış sayılmaz.
    assert.equal(yerlestirilebilir({ ...var1, x: var1.x - 0.25 }, plan, [var1], "1"), true);
  });

  test("halının üstüne eşya konur", () => {
    const hali = { id: "h", tur: "hali" as const, x: kx - 1.5, z: ortak.z + 1.5, don: 0 };
    assert.equal(yerlestirilebilir({ tur: "hali", x: hali.x, z: hali.z, don: 0 }, plan, []), true);
    assert.equal(yerlestirilebilir({ tur: "bitki", x: kx - 1.25, z: ortak.z + 1.25, don: 0 }, plan, [hali]), true);
    assert.equal(yerlestirilebilir({ tur: "hali", x: kx - 1.75, z: ortak.z + 1.5, don: 0 }, plan, [hali]), false);
  });

  test("döndürünce alan yer değiştirir", () => {
    const a = esyaAlani({ tur: "kitaplik", x: 0, z: 0, don: 1 });
    assert.ok(a.d > a.w);
  });

  test("ızgara", () => {
    assert.equal(izgarayaOturt(1.13), 1.25);
    assert.equal(izgarayaOturt(-0.1), -0);
  });
});

describe("kaydiCoz", () => {
  test("boş ve bozuk kayıt", () => {
    assert.deepEqual(kaydiCoz(null), BOS_KAYIT);
    assert.deepEqual(kaydiCoz("{bozuk"), BOS_KAYIT);
  });

  test("tanınmayan eşya atılır", () => {
    const k = kaydiCoz(JSON.stringify({ harcanan: 40, esyalar: [{ id: "1", tur: "bitki", x: 1, z: 1, don: 0 }, { id: "2", tur: "uzay", x: 1, z: 1, don: 0 }] }));
    assert.equal(k.harcanan, 40);
    assert.deepEqual(k.esyalar.map((e) => e.id), ["1"]);
  });
});

describe("yolHakki", () => {
  const kadin = (id: string, emek: number) => ({ id, kadin: true, emek });
  const erkek = (id: string, emek: number) => ({ id, kadin: false, emek });

  test("erkek kadına yol verir", () => {
    assert.equal(yolHakki(kadin("a", 50), erkek("b", 0)), true);
    assert.equal(yolHakki(erkek("b", 0), kadin("a", 50)), false);
  });

  test("iki erkekte daha çok çalışan yol verir", () => {
    assert.equal(yolHakki(erkek("a", 3), erkek("b", 12)), true);
    assert.equal(yolHakki(erkek("b", 12), erkek("a", 3)), false);
  });

  test("her karşılaşmada tam olarak biri yol verir (kilitlenme yok)", () => {
    const kisiler = [kadin("a", 1), kadin("b", 1), erkek("c", 5), erkek("d", 5), erkek("e", 0)];
    for (const x of kisiler)
      for (const y of kisiler) if (x !== y) assert.notEqual(yolHakki(x, y), yolHakki(y, x), `${x.id}-${y.id}`);
  });
});

describe("modül eşyaları", () => {
  const SATIS = ["spd_satis_planlama_b2b_b2c", "crm_musteri", "baglantilar", "spd_ortaklik_dagitim", "spd_pazar_arastirma"];
  const PAZARLAMA = [
    "pd_marka_kimligi", "pd_rakip_sektor_analizi", "baglantilar", "pd_hedef_kitle", "pd_dijital_pazarlama",
    "pd_dijital_pazarlama_seo_sem", "pd_sosyal_medya", "pd_email", "pd_reklam", "pd_urun_stratejileri",
    "pd_musteri_kazanim_optimizasyonu", "pd_buyume_hedefleri",
  ];
  const plan = ofisPlani([
    { id: "urun", kisi: 2 },
    { id: "pazarlama", kisi: 3, moduller: PAZARLAMA },
    { id: "satis", kisi: 4, moduller: [...SATIS, "eslesmeyen_modul"] },
    { id: "operasyon", kisi: 2 },
    { id: "finans", kisi: 2 },
    { id: "ik", kisi: 1 },
  ]);
  const oda = (id: string) => plan.odalar.find((o) => o.id === id)!;

  test("Satış ve Pazarlama modüllerinin hepsinin eşyası var", () => {
    for (const k of [...SATIS, ...PAZARLAMA]) assert.ok(MODUL_ESYALARI[k], k);
  });

  test("hepsi odaya sığar (gerekirse oda genişler), eşleşmeyen modül yer kaplamaz", () => {
    assert.equal(oda("pazarlama").moduller.length, 12);
    assert.deepEqual(oda("pazarlama").sigmayanModuller, []);
    assert.equal(oda("satis").moduller.length, 5);
    // Aynı ofis modülsüz kurulunca Pazarlama odası daha dar.
    const modulsuz = ofisPlani(["urun", "pazarlama", "satis", "operasyon", "finans", "ik"].map((id) => ({ id, kisi: id === "pazarlama" ? 3 : 2 })));
    assert.ok(oda("pazarlama").w > modulsuz.odalar.find((o) => o.id === "pazarlama")!.w);
  });

  test("eşyalar odanın içinde, masalara ve birbirine değmez, kapının önü boş", () => {
    for (const o of [oda("pazarlama"), oda("satis")]) {
      const xs = o.masalar.map((m) => m.x);
      for (const [i, y] of o.moduller.entries()) {
        assert.ok(y.x > o.x && y.x < o.x + o.w && y.z > o.z && y.z < o.z + o.d, `${o.id} ${y.key} odada`);
        assert.ok(Math.hypot(y.x - o.kapi.x, y.z - o.kapi.z) > 1.2, `${o.id} ${y.key} kapıdan uzak`);
        const masaya = Math.min(...xs.map((x) => Math.abs(y.x - x))) > 1.0 || Math.abs(y.z - (o.z + o.d / 2)) > 1.9;
        assert.ok(masaya, `${o.id} ${y.key} masalardan uzak`);
        for (const z of o.moduller.slice(i + 1)) assert.ok(Math.hypot(y.x - z.x, y.z - z.z) > 0.8, `${y.key} ile ${z.key}`);
      }
    }
  });

  test("eşyalar kameraya dönük durur (güney duvarındakiler de)", () => {
    // Hiçbir odada eşya kameradan öteye (kuzeye) bakmaz; Satış sol sütunda, Pazarlama üst sırada.
    for (const o of [oda("pazarlama"), oda("satis")])
      for (const y of o.moduller) assert.ok(Math.cos(y.don) > -0.5, `${o.id} ${y.key} ${y.don}`);
  });

  test("eşyalar mağaza yerleştirmesinde engel sayılır", () => {
    const y = oda("satis").moduller[0];
    assert.equal(yerlestirilebilir({ tur: "bitki", x: y.x, z: y.z, don: 0 }, plan, []), false);
  });
});

describe("yönetici masası", () => {
  const kesisir = (a: { x: number; z: number; w: number; d: number }, b: { x: number; z: number; w: number; d: number }) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.z < b.z + b.d && b.z < a.z + a.d;

  for (const kisi of [1, 2, 5, 9]) {
    test(`${kisi} kişilik odada yöneticinin masası odada, ekip masalarına değmiyor`, () => {
      const p = ofisPlani([{ id: "a", kisi, yonetici: true }]);
      const oda = p.odalar.find((o) => o.id === "a")!;
      const patron = oda.masalar.filter((m) => m.patron);
      assert.equal(patron.length, 1);
      assert.ok(oda.masalar[oda.masalar.length - 1].patron, "yönetici masası listenin sonunda (masa-N sırası korunur)");
      const iz = masaAlani(patron[0]);
      assert.ok(iz.x >= oda.x && iz.x + iz.w <= oda.x + oda.w && iz.z >= oda.z && iz.z + iz.d <= oda.z + oda.d, "odanın içinde");
      for (const m of oda.masalar.filter((mm) => !mm.patron)) assert.ok(!kesisir(iz, masaAlani(m)), "ekip masasına değiyor");
    });
  }

  test("yöneticisi olmayan oda eskisi gibi", () => {
    const p = ofisPlani([{ id: "a", kisi: 4 }]);
    assert.ok(!p.odalar.find((o) => o.id === "a")!.masalar.some((m) => m.patron));
  });
});

describe("duzeniUygula (oda düzenleyicisi)", () => {
  const plan = ofisPlani([
    { id: "a", kisi: 2, moduller: ["crm_musteri", "baglantilar"] },
    { id: "b", kisi: 2 },
  ]);
  const a = plan.odalar.find((o) => o.id === "a")!;

  test("düzen yoksa plan aynen döner", () => {
    assert.deepEqual(duzeniUygula(plan, {}), plan);
  });

  test("taşınan masa yerine gider, engeli de onunla gider", () => {
    // Odanın ortası: masa + sandalye duvara değmez, konum aynen kalır.
    const dx = Math.round(a.w * 50) / 100;
    const dz = Math.round(a.d * 50) / 100;
    const p = duzeniUygula(plan, { a: { nesneler: { "masa-0": { dx, dz, don: Math.PI / 2 } } } });
    const yeni = p.odalar.find((o) => o.id === "a")!;
    assert.equal(yeni.masalar[0].x, a.x + dx);
    assert.equal(yeni.masalar[0].z, a.z + dz);
    assert.equal(yeni.masalar[0].don, Math.PI / 2);
    const alan = masaAlani(yeni.masalar[0]);
    assert.ok(p.engeller.some((e) => Math.abs(e.x - alan.x) < 1e-9 && Math.abs(e.z - alan.z) < 1e-9));
    // Diğer masa yerinde kalır.
    assert.deepEqual(yeni.masalar[1], a.masalar[1]);
  });

  test("odanın dışına taşan konum içeri kırpılır", () => {
    const p = duzeniUygula(plan, { a: { nesneler: { "masa-1": { dx: 99, dz: -4, don: 0 } } } });
    const m = p.odalar.find((o) => o.id === "a")!.masalar[1];
    assert.ok(m.x < a.x + a.w && m.z > a.z);
  });

  test("duvara dayalı kaydedilmiş masanın sandalyesi duvarın içinde kalmaz", () => {
    // Eski kayıt: yalnızca merkez kırpılıyordu, masa batı duvarına yaslanmış
    // ve sırtı duvara dönük (sandalye 1,2 m geride, duvarın içinde).
    const p = duzeniUygula(plan, { a: { nesneler: { "masa-0": { dx: 0.4, dz: a.d / 2, don: Math.PI / 2 } } } });
    const m = p.odalar.find((o) => o.id === "a")!.masalar[0];
    // Sandalyenin arkası masanın 0,82 + 0,3 m gerisinde (batıya, −x).
    assert.ok(m.x - 1.12 >= a.x + 0.09 - 1e-9, `sandalye duvarda: ${m.x - 1.12 - a.x}`);
  });

  test("ortak alana çıkarılmış (eski kayıt) masa da modül eşyası da odasına geri kırpılır", () => {
    const ortak = plan.odalar.find((o) => o.tur === "ortak")!;
    const hx = ortak.x + ortak.w / 2 - a.x;
    const hz = ortak.z + ortak.d / 2 - a.z;
    const p = duzeniUygula(plan, {
      a: { nesneler: { "masa-0": { dx: hx, dz: hz, don: 0 }, "modul:crm_musteri": { dx: hx, dz: hz, don: 0 } } },
    });
    const yeni = p.odalar.find((o) => o.id === "a")!;
    const m = yeni.masalar[0];
    assert.ok(m.x >= a.x && m.x <= a.x + a.w && m.z >= a.z && m.z <= a.z + a.d, "masa odada kalmalı");
    const y = yeni.moduller.find((k) => k.key === "crm_musteri")!;
    assert.ok(y.x >= a.x && y.x <= a.x + a.w && y.z >= a.z && y.z <= a.z + a.d, "modül eşyası odada kalmalı");
  });

  test("kaldırılan modül odadan çıkar, panel listesine düşer", () => {
    const p = duzeniUygula(plan, { a: { nesneler: { "modul:crm_musteri": { dx: 1, dz: 1, don: 0, gizli: true } } } });
    const yeni = p.odalar.find((o) => o.id === "a")!;
    assert.ok(!yeni.moduller.some((y) => y.key === "crm_musteri"));
    assert.ok(yeni.sigmayanModuller.includes("crm_musteri"));
    assert.ok(yeni.duzen);
  });
});

describe("modulYerleri", () => {
  const oda = { x: 0, z: 0, w: 10, d: 5 };
  const kapi = { x: 0, z: 1 }; // kapı güneyde, dış duvar kuzeyde

  test("tek eşya köşeye (bitkinin önüne) değil, duvarın içerisine konur", () => {
    const [y] = modulYerleri(oda, kapi, null, 1);
    assert.ok(y.x >= 1.35 && y.x <= oda.w - 1.35, `x=${y.x}`);
  });

  test("yer azsa köşeye bitişik yerler de kullanılır (sığan eşya sayısı azalmaz)", () => {
    const hepsi = modulYerleri(oda, kapi, null, 50);
    assert.ok(hepsi.some((y) => y.x < 1.35 && y.z < 1), "kuzeybatı köşesindeki yer de dolmalı");
    const anahtar = new Set(hepsi.map((y) => `${y.x.toFixed(2)},${y.z.toFixed(2)}`));
    assert.equal(anahtar.size, hepsi.length, "aynı yer iki kez verilmez");
  });
});
