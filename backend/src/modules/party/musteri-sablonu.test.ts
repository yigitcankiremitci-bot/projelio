// Backend tsconfig'inde esModuleInterop kapalı, bu yüzden namespace import.
import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  BAGLANTI_SUTUNLARI,
  MUSTERI_SUTUNLARI,
  mevcutlariAyikla,
  musteriSablonuOlustur,
  musteriSayfasiniSec,
  musteriSutunlariniBul,
  planMusteriImport,
  SABLON_SAYFA_ADI,
  tabloyuOku,
  tarihiCoz,
  Workbook,
} from "./musteri-sablonu";

// Kullanıcı şablonu indirip doldurur ve Lio'ya geri verir. Buradaki bir kırılma
// sessizdir: başlık tanınmazsa o sütun hiç yazılmaz, kullanıcı ancak kartlara
// bakınca fark eder. Bu yüzden asıl sınanan şey şablon ile okuyucunun
// birbirini TANIMASI.

const sayfa = (rows: string[][]) => ({ name: SABLON_SAYFA_ADI, rows });
const BASLIKLAR = MUSTERI_SUTUNLARI.map((s) => s.baslik);

describe("şablon — üret ve geri oku", () => {
  test("indirilen şablonun her sütunu okuyucu tarafından tanınır, veri sayfası ilk sırada ve boş", async () => {
    const wb = new Workbook();
    await wb.xlsx.load((await musteriSablonuOlustur()) as any);
    const ilk = wb.worksheets[0];
    assert.equal(ilk.name, SABLON_SAYFA_ADI);

    const basliklar = (ilk.getRow(1).values as unknown[]).slice(1).map(String);
    const sutunlar = musteriSutunlariniBul(basliklar);
    assert.equal(sutunlar.size, MUSTERI_SUTUNLARI.length);

    // Örnek satır veri sayfasına KONMAMALI: silinmezse sahte müşteri açılırdı.
    let doluSatir = 0;
    ilk.eachRow({ includeEmpty: false }, (row) => {
      const v = (row.values as unknown[]).slice(1);
      if (v.some((c) => c !== null && c !== undefined && String(c).trim())) doluSatir++;
    });
    assert.equal(doluSatir, 1);
  });
});

describe("planMusteriImport", () => {
  test("şablon satırı karta dönüşür: rol, tür, adres ve yetkili kişi", () => {
    const satir = BASLIKLAR.map(() => "");
    const koy = (baslik: string, v: string) => (satir[BASLIKLAR.indexOf(baslik)] = v);
    koy("Ad", "Deniz Lojistik");
    koy("Tür", "Firma");
    koy("Rol", "Müşteri, Tedarikçi");
    koy("Vergi / TC no", "0123456789");
    koy("Telefon", "0216 555 12 34");
    koy("Şehir", "İstanbul");
    koy("Yetkili kişi", "Ayşe Yılmaz");
    koy("Yetkili telefon", "0532 555 12 34");

    const plan = planMusteriImport(sayfa([BASLIKLAR, satir]));
    assert.equal(plan.planlanan.length, 1);
    const p = plan.planlanan[0];
    assert.equal(p.satir, 2);
    assert.equal(p.party.displayName, "Deniz Lojistik");
    assert.equal(p.party.partyType, "company");
    assert.deepEqual(p.party.roles, ["customer", "supplier"]);
    assert.equal(p.party.taxNumber, "0123456789");
    assert.equal(p.party.phone, "0216 555 12 34");
    assert.equal(p.party.address?.city, "İstanbul");
    assert.deepEqual(p.kisi, { name: "Ayşe Yılmaz", phone: "0532 555 12 34", email: undefined });
    assert.deepEqual(plan.uyarilar, []);
  });

  test("kullanıcının kendi başlıkları eş adlarla tanınır; yetkili telefonu firma telefonuna düşmez", () => {
    const plan = planMusteriImport(
      sayfa([
        ["Firma Adı *", "Yetkili Tel", "Tel", "Email", "Fax"],
        ["ABC", "0532 1", "0212 2", "a@b.com", "x"],
      ])
    );
    const p = plan.planlanan[0];
    assert.equal(p.party.displayName, "ABC");
    assert.equal(p.party.phone, "0212 2");
    assert.equal(p.party.email, "a@b.com");
    assert.deepEqual(plan.kullanilmayanSutunlar, ["Fax"]);
  });

  test("açık eşleme şablon başlığının önüne geçer", () => {
    const plan = planMusteriImport(sayfa([["Kod", "Ünvanı"], ["K1", "Mavi Ajans"]]), {
      esleme: { displayName: "Ünvanı" },
    });
    assert.equal(plan.planlanan[0].party.displayName, "Mavi Ajans");
  });

  test("adı boş satır gerekçesiyle atlanır, tamamen boş satır sayılmaz", () => {
    const plan = planMusteriImport(sayfa([["Ad", "Telefon"], ["", "0212"], ["", ""], ["Ok", ""]]));
    assert.equal(plan.toplamSatir, 2);
    assert.deepEqual(plan.atlanan, [{ satir: 2, sebep: "ad boş" }]);
    assert.equal(plan.planlanan.length, 1);
  });

  test("tanınmayan rol kartı düşürmez, uyarı olur", () => {
    const plan = planMusteriImport(sayfa([["Ad", "Rol"], ["X", "Müşterimiz"]]));
    assert.equal(plan.planlanan.length, 1);
    assert.equal(plan.planlanan[0].party.roles, undefined);
    assert.equal(plan.uyarilar.length, 1);
  });

  test("ad sütunu yoksa hiçbir satır planlanmaz ve sebep söylenir", () => {
    const plan = planMusteriImport(sayfa([["Telefon"], ["0212"]]));
    assert.equal(plan.planlanan.length, 0);
    assert.match(plan.atlanan[0].sebep, /Ad sütunu/);
  });
});

describe("mevcutlariAyikla", () => {
  const plan = (satir: number, displayName: string, extra: Record<string, string> = {}) => ({
    satir,
    party: { displayName, ...extra },
  });

  test("aynı ad (hukuki ek farkıyla), vergi no ya da e-posta zaten kayıtlıysa atlanır", () => {
    const { yeni, zatenVar } = mevcutlariAyikla(
      [plan(2, "ABC Ltd. Şti."), plan(3, "Başka", { taxNumber: "111 222" }), plan(4, "Yeni", { email: "X@Y.com" }), plan(5, "Temiz")],
      [
        { id: "1", displayName: "abc" },
        { id: "2", displayName: "Eski", taxNumber: "111222" },
        { id: "3", displayName: "Z", email: "x@y.com" },
      ]
    );
    assert.deepEqual(yeni.map((y) => y.satir), [5]);
    assert.deepEqual(zatenVar.map((z) => z.neden), ["aynı ad", "aynı vergi no", "aynı e-posta"]);
  });

  test("dosyanın kendi içindeki tekrar da atlanır, ilk geçen kalır", () => {
    const { yeni, zatenVar } = mevcutlariAyikla([plan(2, "Mavi"), plan(3, "mavi")], []);
    assert.deepEqual(yeni.map((y) => y.satir), [2]);
    assert.equal(zatenVar[0].satir, 3);
  });

  test("arşivdeki kart da eşleşir ve bunu söyler", () => {
    const { zatenVar } = mevcutlariAyikla([plan(2, "Mavi")], [{ id: "1", displayName: "Mavi", archivedAt: "2026-01-01" }]);
    assert.match(zatenVar[0].mevcutKart, /arşivde/);
  });
});

describe("tabloyuOku — yüklenen dosya", () => {
  test("doldurulan şablon: boş hücre sütunları KAYDIRMAZ, rehber sayfası müşteri sanılmaz", async () => {
    const wb = new Workbook();
    await wb.xlsx.load((await musteriSablonuOlustur()) as any);
    const veri = wb.getWorksheet(SABLON_SAYFA_ADI)!;
    // Ad dolu, Tür ve Rol BOŞ, Resmî unvan dolu: ExcelJS'in seyrek dizisi
    // burada delik bırakır.
    veri.getRow(2).getCell(1).value = "Deniz Lojistik";
    veri.getRow(2).getCell(4).value = "Deniz Lojistik Ltd. Şti.";
    veri.getRow(2).getCell(8).value = "0216 555 12 34";
    veri.getRow(2).commit();
    const buf = Buffer.from(await wb.xlsx.writeBuffer());

    const sayfalar = await tabloyuOku(buf, "müşteriler.xlsx");
    const sayfa = musteriSayfasiniSec(sayfalar);
    assert.equal(sayfa.name, SABLON_SAYFA_ADI);
    const plan = planMusteriImport(sayfa);
    assert.equal(plan.planlanan.length, 1);
    assert.equal(plan.planlanan[0].party.displayName, "Deniz Lojistik");
    assert.equal(plan.planlanan[0].party.legalName, "Deniz Lojistik Ltd. Şti.");
    assert.equal(plan.planlanan[0].party.phone, "0216 555 12 34");
  });

  test("CSV de okunur (noktalı virgül ayraçlı, BOM'lu)", async () => {
    const sayfalar = await tabloyuOku(Buffer.from("\uFEFFAd;Telefon\nMavi Ajans;0212\n", "utf8"), "liste.csv");
    const plan = planMusteriImport(musteriSayfasiniSec(sayfalar));
    assert.equal(plan.planlanan[0].party.displayName, "Mavi Ajans");
    assert.equal(plan.planlanan[0].party.phone, "0212");
  });

  test("eski .xls ve bozuk dosya anlaşılır hatayla reddedilir", async () => {
    await assert.rejects(tabloyuOku(Buffer.from("x"), "eski.xls"), /\.xls/);
    await assert.rejects(tabloyuOku(Buffer.from("bozuk"), "bozuk.xlsx"), /açılamadı/);
  });

  test("şablon sayfası yoksa ilk sayfa seçilir, boş dosya reddedilir", () => {
    assert.equal(musteriSayfasiniSec([{ name: "Sayfa1", rows: [["Ad"]] }]).name, "Sayfa1");
    assert.throws(() => musteriSayfasiniSec([]));
  });
});

describe("İngilizce şablon", () => {
  test("başlıklar, sayfa adları ve açılır listeler İngilizce; okuyucu hepsini tanır", async () => {
    const wb = new Workbook();
    await wb.xlsx.load((await musteriSablonuOlustur("en")) as any);
    assert.deepEqual(wb.worksheets.map((w) => w.name), ["Customers", "How to fill in"]);

    const veri = wb.worksheets[0];
    const basliklar = (veri.getRow(1).values as unknown[]).slice(1).map(String);
    assert.equal(basliklar[0], "Name");
    assert.ok(!basliklar.some((b) => /[çğıöşüÇĞİÖŞÜ]/.test(b)), `Türkçe başlık kaldı: ${basliklar.join(", ")}`);
    assert.equal(musteriSutunlariniBul(basliklar).size, MUSTERI_SUTUNLARI.length);

    const rol = veri.getCell("C2").dataValidation;
    assert.match(String(rol?.formulae?.[0]), /Customer,Lead,Supplier/);

    // Rehber sayfasında da Türkçe metin kalmamalı.
    const rehber: string[] = [];
    wb.worksheets[1].eachRow((row) => rehber.push((row.values as unknown[]).slice(1).map(String).join(" ")));
    assert.ok(!rehber.some((r) => /[çğıöşüÇĞİÖŞÜ]/.test(r)), rehber.find((r) => /[çğıöşü]/i.test(r)));
  });

  test("doldurulan İngilizce şablon: rol/tür İngilizce değerlerle çözülür", async () => {
    const wb = new Workbook();
    await wb.xlsx.load((await musteriSablonuOlustur("en")) as any);
    const veri = wb.getWorksheet("Customers")!;
    veri.getRow(2).getCell(1).value = "Harbor Logistics";
    veri.getRow(2).getCell(2).value = "Person";
    veri.getRow(2).getCell(3).value = "Customer, Supplier";
    veri.getRow(2).commit();
    const sayfalar = await tabloyuOku(Buffer.from(await wb.xlsx.writeBuffer()), "customers.xlsx");

    // Rehber sayfası öne alınmış olsa bile veri sayfası adıyla bulunur.
    const sayfa = musteriSayfasiniSec([...sayfalar].reverse());
    assert.equal(sayfa.name, "Customers");
    const p = planMusteriImport(sayfa).planlanan[0];
    assert.equal(p.party.displayName, "Harbor Logistics");
    assert.equal(p.party.partyType, "person");
    assert.deepEqual(p.party.roles, ["customer", "supplier"]);
  });

  test("Türkçe şablon değişmedi", async () => {
    const wb = new Workbook();
    await wb.xlsx.load((await musteriSablonuOlustur()) as any);
    assert.deepEqual(wb.worksheets.map((w) => w.name), ["Müşteriler", "Nasıl doldurulur"]);
    assert.equal(String(wb.worksheets[0].getCell("A1").value), "Ad");
  });
});

describe("Bağlantı ve İlişkiler şablonu", () => {
  const BAGLANTI_BASLIKLARI = BAGLANTI_SUTUNLARI.map((s) => s.baslik);

  test("iki dilde de üretilen şablonun her sütunu bağlantı okuyucusunca tanınır", async () => {
    for (const dil of ["tr", "en"] as const) {
      const wb = new Workbook();
      await wb.xlsx.load((await musteriSablonuOlustur(dil, "baglanti")) as any);
      const ilk = wb.worksheets[0];
      assert.equal(ilk.name, dil === "tr" ? "Bağlantılar" : "Contacts");
      const basliklar = (ilk.getRow(1).values as unknown[]).slice(1).map(String);
      assert.equal(musteriSutunlariniBul(basliklar, {}, "baglanti").size, BAGLANTI_SUTUNLARI.length);
    }
  });

  test("önem, tanışma yeri, sonraki temas ve ilişki notu karta yazılır; varsayılan rol Bağlantı", () => {
    const satir = BAGLANTI_SUTUNLARI.map((s) =>
      ({ displayName: "Ayşe Yılmaz", onem: "Yüksek", tanismaYeri: "İstanbul Fuarı 2026", sonrakiTemas: "15.10.2026", iliskiNotu: "rakip" })[
        s.alan as string
      ] ?? ""
    );
    const p = planMusteriImport(sayfa([BAGLANTI_BASLIKLARI, satir]), { tur: "baglanti" }).planlanan[0];
    assert.equal(p.party.roles, undefined); // sunucu varsayılanı (contact) uygular
    assert.deepEqual(p.party.baglanti, {
      onem: "yuksek",
      tanismaYeri: "İstanbul Fuarı 2026",
      sonrakiTemas: "2026-10-15",
      iliskiNotu: "rakip",
    });
  });

  test("LinkedIn ve Instagram tutamaca çevrilir; tanınmayan hesap uyarı olur, kart düşmez", () => {
    const plan = planMusteriImport(
      sayfa([
        ["Ad", "LinkedIn", "Instagram"],
        ["A", "https://www.linkedin.com/in/ayse-yilmaz/", "@ayse.y"],
        ["B", "instagram.com/yanlis", "ok"],
      ]),
      { tur: "baglanti" }
    );
    assert.deepEqual(plan.planlanan[0].party.sosyal, { linkedin: "ayse-yilmaz", instagram: "ayse.y" });
    assert.deepEqual(plan.planlanan[1].party.sosyal, { instagram: "ok" });
    assert.equal(plan.uyarilar.length, 1);
  });

  test("kendi listesinde Firma önce gelse de ad kişinin adı olur, firma kuruma yazılır", () => {
    const plan = planMusteriImport(sayfa([["Firma", "Ad Soyad", "Unvan"], ["ABC Ajans", "Ayşe Yılmaz", "Müdür"]]), {
      tur: "baglanti",
    });
    const p = plan.planlanan[0].party;
    assert.equal(p.displayName, "Ayşe Yılmaz");
    assert.equal(p.kurum, "ABC Ajans");
    assert.equal(p.unvan, "Müdür");
  });

  test("rakip ve işbirliği rolleri tanınır", () => {
    const plan = planMusteriImport(sayfa([["Ad", "Rol"], ["X", "Rakip, İşbirliği"]]), { tur: "baglanti" });
    assert.deepEqual(plan.planlanan[0].party.roles, ["competitor", "collaborator"]);
  });

  test("tanınmayan önem ve tarih kartı düşürmez, uyarı olur", () => {
    const plan = planMusteriImport(sayfa([["Ad", "Önem", "Sonraki temas"], ["X", "çok önemli", "yarın"]]), { tur: "baglanti" });
    assert.equal(plan.planlanan.length, 1);
    assert.equal(plan.planlanan[0].party.baglanti?.onem, "orta");
    assert.equal(plan.planlanan[0].party.baglanti?.sonrakiTemas, undefined);
    assert.equal(plan.uyarilar.length, 2);
  });

  test("müşteri içe aktarmasında Önem sütunu tanınmaz — kullanılmayan sütun olarak görünür", () => {
    const plan = planMusteriImport(sayfa([["Ad", "Önem"], ["X", "Yüksek"]]));
    assert.deepEqual(plan.kullanilmayanSutunlar, ["Önem"]);
    assert.equal(plan.planlanan[0].party.baglanti, undefined);
  });

  test("tarihiCoz: iki biçim, takvimde olmayan gün reddedilir", () => {
    assert.equal(tarihiCoz("2026-10-15"), "2026-10-15");
    assert.equal(tarihiCoz("5.3.2026"), "2026-03-05");
    assert.equal(tarihiCoz("05/03/2026"), "2026-03-05");
    assert.equal(tarihiCoz("31.02.2026"), undefined);
    assert.equal(tarihiCoz("yarın"), undefined);
  });
});
