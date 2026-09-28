import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  EN_COK_DENEME,
  hatirlatmaKarari,
  saklananKart,
  sonrakiDenemeZamani,
  yenilemeKarari,
  yenilemeTutari,
} from "./paytr-abonelik-takvim";

const GUN = 24 * 60 * 60 * 1000;
const VADE = new Date("2026-10-07T12:00:00.000Z");
const sonra = (gun: number) => new Date(VADE.getTime() + gun * GUN);

test("ilk deneme vade anında, yeniden denemeler 1, 3, 7 ve 14 gün sonra", () => {
  assert.deepEqual(sonrakiDenemeZamani(VADE, 0), VADE);
  assert.deepEqual(sonrakiDenemeZamani(VADE, 1), sonra(1));
  assert.deepEqual(sonrakiDenemeZamani(VADE, 2), sonra(3));
  assert.deepEqual(sonrakiDenemeZamani(VADE, 3), sonra(7));
  assert.deepEqual(sonrakiDenemeZamani(VADE, 4), sonra(14));
  assert.equal(sonrakiDenemeZamani(VADE, 5), null);
  assert.equal(EN_COK_DENEME, 5);
});

test("vade gelmeden çekilmez, gelince çekilir", () => {
  assert.equal(yenilemeKarari(VADE, 0, sonra(-0.01)).tur, "bekle");
  assert.deepEqual(yenilemeKarari(VADE, 0, VADE), { tur: "cek", deneme: 1 });
});

test("başarısız denemeden sonra bir sonraki güne kadar beklenir", () => {
  assert.equal(yenilemeKarari(VADE, 1, sonra(0.5)).tur, "bekle");
  assert.deepEqual(yenilemeKarari(VADE, 1, sonra(1)), { tur: "cek", deneme: 2 });
  assert.equal(yenilemeKarari(VADE, 2, sonra(2)).tur, "bekle");
  assert.deepEqual(yenilemeKarari(VADE, 4, sonra(14)), { tur: "cek", deneme: 5 });
});

test("beş deneme de düşerse abonelik biter", () => {
  assert.deepEqual(yenilemeKarari(VADE, 5, sonra(14.1)), { tur: "bitir" });
});

const TEMEL = {
  vade: VADE,
  gonderilenVade: null,
  sonTutar: 490,
  sonListe: 490,
  guncelListe: 490,
  sonrakiIndirim: null,
};

test("yıllık aboneye 7 gün kala hatırlatma gider, daha erken gitmez", () => {
  assert.equal(hatirlatmaKarari({ ...TEMEL, period: "yearly", simdi: sonra(-8) }), null);
  assert.deepEqual(hatirlatmaKarari({ ...TEMEL, period: "yearly", simdi: sonra(-7) }), { tur: "yillik", tutar: 490, liste: 490 });
});

test("aylık aboneye fiyat değişmediyse hatırlatma gitmez", () => {
  assert.equal(hatirlatmaKarari({ ...TEMEL, period: "monthly", simdi: sonra(-7) }), null);
});

test("aylık aboneye fiyat değiştiyse 7 gün önce yeni tutar duyurulur", () => {
  assert.deepEqual(hatirlatmaKarari({ ...TEMEL, guncelListe: 590, period: "monthly", simdi: sonra(-7) }), {
    tur: "fiyat",
    tutar: 590,
    liste: 590,
  });
});

test("fiyat pencere açıldıktan sonra değiştiyse o dönem duyurulmaz", () => {
  // 3 gün kala fark edilen değişiklik: 7 günlük süre tanınamaz.
  assert.equal(hatirlatmaKarari({ ...TEMEL, guncelListe: 590, period: "monthly", simdi: sonra(-3) }), null);
  // Yıllıkta hatırlatma yine gider ama ESKİ tutarla.
  assert.deepEqual(hatirlatmaKarari({ ...TEMEL, guncelListe: 590, period: "yearly", simdi: sonra(-3) }), {
    tur: "yillik",
    tutar: 490,
    liste: 490,
  });
});

test("indirim bitiyorsa artış 7 gün önce duyurulur", () => {
  // Son ödeme %50 indirimliydi (245), sonraki ödemede indirim yok.
  const d = { ...TEMEL, sonTutar: 245, period: "monthly" as const };
  assert.deepEqual(hatirlatmaKarari({ ...d, simdi: sonra(-7) }), { tur: "fiyat", tutar: 490, liste: 490 });
  // Pencere kaçtıysa artış duyurulmaz.
  assert.equal(hatirlatmaKarari({ ...d, simdi: sonra(-3) }), null);
});

test("indirim sürüyorsa ve fiyat değişmediyse aylık hatırlatma gitmez", () => {
  const d = { ...TEMEL, sonTutar: 245, sonrakiIndirim: { tur: "yuzde" as const, deger: 50 }, period: "monthly" as const };
  assert.equal(hatirlatmaKarari({ ...d, simdi: sonra(-7) }), null);
});

test("aynı vade için hatırlatma iki kez gitmez", () => {
  assert.equal(hatirlatmaKarari({ ...TEMEL, period: "yearly", simdi: sonra(-6), gonderilenVade: VADE }), null);
});

test("vadesi geçmiş abonelik için hatırlatma gitmez", () => {
  assert.equal(hatirlatmaKarari({ ...TEMEL, period: "yearly", simdi: sonra(0.1) }), null);
});

const YENILEME = { vade: VADE, sonTutar: 490, sonListe: 490, hatirlatmaVadesi: null, hatirlatmaTutari: null, hatirlatmaListe: null, indirim: null };

test("yenilemede duyurulan tutar çekilir, duyurulmamış güncel fiyat çekilmez", () => {
  assert.deepEqual(yenilemeTutari({ ...YENILEME, hatirlatmaVadesi: VADE, hatirlatmaTutari: 590, hatirlatmaListe: 590 }), { tutar: 590, liste: 590 });
  assert.deepEqual(yenilemeTutari(YENILEME), { tutar: 490, liste: 490 });
  // Başka bir vadenin duyurusu bu vadeyi etkilemez.
  assert.deepEqual(yenilemeTutari({ ...YENILEME, hatirlatmaVadesi: sonra(-30), hatirlatmaTutari: 590 }), { tutar: 490, liste: 490 });
});

test("süren indirim yenilemede uygulanır", () => {
  assert.deepEqual(yenilemeTutari({ ...YENILEME, sonTutar: 245, indirim: { tur: "yuzde", deger: 50 } }), { tutar: 245, liste: 490 });
});

test("indirim bitti ama duyurulmadıysa son çekilen tutar aşılmaz", () => {
  assert.deepEqual(yenilemeTutari({ ...YENILEME, sonTutar: 245 }), { tutar: 245, liste: 490 });
});

test("saklanan kart önceki listede olmayan karttır", () => {
  const kartlar = [{ ctoken: "A" }, { ctoken: "B" }, { ctoken: "C" }];
  assert.deepEqual(saklananKart(["A", "C"], kartlar), { ctoken: "B" });
  assert.deepEqual(saklananKart(null, [{ ctoken: "A" }]), { ctoken: "A" });
});

test("yeni kart yoksa listedeki son kart, liste boşsa null", () => {
  assert.deepEqual(saklananKart(["A", "B"], [{ ctoken: "A" }, { ctoken: "B" }]), { ctoken: "B" });
  assert.equal(saklananKart(["A"], []), null);
});
