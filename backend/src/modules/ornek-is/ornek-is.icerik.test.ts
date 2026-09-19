import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { gunEkle, ornekIcerik, ornekTuru, type OrnekTur } from "./ornek-is.icerik";

const TURLER: OrnekTur[] = ["bireysel", "sirket", "taseron"];

describe("ornekIcerik", () => {
  it("hiçbir görev geçmişe düşmez — yeni üyenin ilk gördüğü liste kırmızı olmamalı", () => {
    for (const tur of TURLER) for (const g of ornekIcerik("tr", tur).gorevler) assert.ok(g.gunSonra >= 0, g.baslik);
  });

  it("hesap tipine göre doğru örnek seçilir", () => {
    assert.equal(ornekTuru("organization_owner"), "sirket");
    assert.equal(ornekTuru("group_owner"), "sirket");
    assert.equal(ornekTuru("subcontractor"), "taseron");
    assert.equal(ornekTuru("employee"), "bireysel");
    assert.equal(ornekTuru(null), "bireysel");
    assert.notEqual(ornekIcerik("tr", "sirket").is.baslik, ornekIcerik("tr", "taseron").is.baslik);
  });

  it("en az bir alt görevli, bir tamamlanmış ve bir saatli görev örneği var", () => {
    const { gorevler } = ornekIcerik("tr");
    assert.ok(gorevler.some((g) => (g.altGorevler ?? []).length > 0));
    assert.ok(gorevler.some((g) => g.durum === "completed"));
    assert.ok(gorevler.some((g) => g.saat));
  });

  it("rutin kuralları veritabanı kısıtlarına uyar", () => {
    for (const r of TURLER.flatMap((tur) => ornekIcerik("tr", tur).rutinler)) {
      if (r.freq === "weekly") assert.ok(r.byWeekday?.every((d) => d >= 0 && d <= 6));
      if (r.freq === "monthly") assert.ok(r.byMonthDay?.every((d) => d >= 1 && d <= 31));
      assert.match(r.dueTime, /^\d{2}:\d{2}$/);
    }
  });

  it("İngilizcede metinleri çevirir, emojiyi korur", () => {
    assert.equal(ornekIcerik("en").is.baslik, "🎓 Meet Projelio (sample)");
    for (const tur of TURLER) {
      const en = ornekIcerik("en", tur);
      const tr = ornekIcerik("tr", tur);
      // Sözlükte eksik kalan metin Türkçe döner; her metin değişmiş olmalı.
      assert.notEqual(en.is.aciklama, tr.is.aciklama);
      en.gorevler.forEach((g, i) => {
        assert.notEqual(g.baslik, tr.gorevler[i].baslik);
        assert.notEqual(g.aciklama, tr.gorevler[i].aciklama);
        g.altGorevler?.forEach((a, j) => assert.notEqual(a.baslik, tr.gorevler[i].altGorevler![j].baslik));
      });
      en.rutinler.forEach((r, i) => assert.notEqual(r.baslik, tr.rutinler[i].baslik));
    }
  });
});

describe("gunEkle", () => {
  it("ay ve yıl sınırını geçer", () => {
    assert.equal(gunEkle("2026-09-30", 1), "2026-10-01");
    assert.equal(gunEkle("2026-12-31", 1), "2027-01-01");
    assert.equal(gunEkle("2026-09-19", 0), "2026-09-19");
  });

  it("yaz saati geçişinde günü kaydırmaz", () => {
    assert.equal(gunEkle("2026-03-28", 1), "2026-03-29");
    assert.equal(gunEkle("2026-10-24", 2), "2026-10-26");
  });
});
