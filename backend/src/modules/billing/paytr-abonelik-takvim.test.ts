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
  guncelTutar: 490,
};

test("yıllık aboneye 7 gün kala hatırlatma gider, daha erken gitmez", () => {
  assert.equal(hatirlatmaKarari({ ...TEMEL, period: "yearly", simdi: sonra(-8) }), null);
  assert.deepEqual(hatirlatmaKarari({ ...TEMEL, period: "yearly", simdi: sonra(-7) }), { tur: "yillik", tutar: 490 });
});

test("aylık aboneye fiyat değişmediyse hatırlatma gitmez", () => {
  assert.equal(hatirlatmaKarari({ ...TEMEL, period: "monthly", simdi: sonra(-7) }), null);
});

test("aylık aboneye fiyat değiştiyse 7 gün önce yeni tutar duyurulur", () => {
  assert.deepEqual(hatirlatmaKarari({ ...TEMEL, guncelTutar: 590, period: "monthly", simdi: sonra(-7) }), {
    tur: "fiyat",
    tutar: 590,
  });
});

test("fiyat pencere açıldıktan sonra değiştiyse o dönem duyurulmaz", () => {
  // 3 gün kala fark edilen değişiklik: 7 günlük süre tanınamaz.
  assert.equal(hatirlatmaKarari({ ...TEMEL, guncelTutar: 590, period: "monthly", simdi: sonra(-3) }), null);
  // Yıllıkta hatırlatma yine gider ama ESKİ tutarla.
  assert.deepEqual(hatirlatmaKarari({ ...TEMEL, guncelTutar: 590, period: "yearly", simdi: sonra(-3) }), {
    tur: "yillik",
    tutar: 490,
  });
});

test("aynı vade için hatırlatma iki kez gitmez", () => {
  assert.equal(hatirlatmaKarari({ ...TEMEL, period: "yearly", simdi: sonra(-6), gonderilenVade: VADE }), null);
});

test("vadesi geçmiş abonelik için hatırlatma gitmez", () => {
  assert.equal(hatirlatmaKarari({ ...TEMEL, period: "yearly", simdi: sonra(0.1) }), null);
});

test("yenilemede duyurulan tutar çekilir, duyurulmamış güncel fiyat çekilmez", () => {
  assert.equal(yenilemeTutari({ vade: VADE, sonTutar: 490, hatirlatmaVadesi: VADE, hatirlatmaTutari: 590 }), 590);
  assert.equal(yenilemeTutari({ vade: VADE, sonTutar: 490, hatirlatmaVadesi: null, hatirlatmaTutari: null }), 490);
  // Başka bir vadenin duyurusu bu vadeyi etkilemez.
  assert.equal(yenilemeTutari({ vade: VADE, sonTutar: 490, hatirlatmaVadesi: sonra(-30), hatirlatmaTutari: 590 }), 490);
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
