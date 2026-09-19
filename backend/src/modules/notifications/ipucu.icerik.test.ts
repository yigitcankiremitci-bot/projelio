import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { IPUCLARI, ipuclariniBirlestir, ipucuKarari, siradakiIpucu, type IpucuAyari } from "./ipucu.icerik";

const SAAT = 60 * 60 * 1000;
const GUN = 24 * SAAT;
const SIMDI = new Date("2026-09-19T07:00:00Z");
const LISTE = ipuclariniBirlestir(IPUCLARI, []);

const temel = {
  simdi: SIMDI,
  hesapAcilis: new Date(SIMDI.getTime() - 2 * GUN),
  acik: true,
  liste: LISTE,
  gonderilenler: new Set<string>(),
  sonIpucuGunu: null,
  bugun: "2026-09-19",
  yerelSaat: 10,
  gunlukSaat: 9,
};

function ayar(yama: Partial<IpucuAyari>): IpucuAyari {
  return { id: "a1", kod: null, sira: 0, aktif: true, lioIle: false, baslik: null, govde: null, link: null, dugme: null, ...yama };
}

describe("ipuclariniBirlestir", () => {
  it("ayar yokken koddaki sırayla, hepsi aktif ve Lio'suz", () => {
    assert.deepEqual(LISTE.map((i) => i.anahtar), IPUCLARI.map((i) => i.kimlik));
    assert.ok(LISTE.every((i) => i.aktif && !i.lioIle && i.kaynak === "kod" && !i.duzenlendi));
  });

  it("yöneticinin metni koddakinin üstüne yazar; boş alan koddakini korur", () => {
    const liste = ipuclariniBirlestir(IPUCLARI, [ayar({ kod: IPUCLARI[0].kimlik, baslik: "Yeni başlık", sira: 0 })]);
    assert.equal(liste[0].baslik, "Yeni başlık");
    assert.equal(liste[0].govde, IPUCLARI[0].govde);
    assert.equal(liste[0].duzenlendi, true);
  });

  it("yöneticinin ipucu sıra değerine göre araya girer", () => {
    const liste = ipuclariniBirlestir(IPUCLARI, [ayar({ id: "ozel-1", baslik: "Özel", govde: "Gövde", sira: 15 })]);
    assert.equal(liste[2].anahtar, "ozel-1");
    assert.equal(liste[2].kaynak, "ozel");
  });

  it("metni olmayan, koddan da kalkmış kayıt yok sayılır", () => {
    const liste = ipuclariniBirlestir(IPUCLARI, [ayar({ kod: "kaldirilmis", sira: 5 })]);
    assert.equal(liste.length, IPUCLARI.length);
  });
});

describe("siradakiIpucu", () => {
  it("ilk ipucunu 1/N olarak verir", () => {
    const s = siradakiIpucu(LISTE, new Set());
    assert.equal(s?.ipucu.anahtar, IPUCLARI[0].kimlik);
    assert.equal(s?.sira, 1);
    assert.equal(s?.toplam, IPUCLARI.length);
  });

  it("gönderilmişleri ve kapalıları atlar", () => {
    const liste = ipuclariniBirlestir(IPUCLARI, [ayar({ kod: IPUCLARI[1].kimlik, aktif: false, sira: 10 })]);
    const s = siradakiIpucu(liste, new Set([IPUCLARI[0].kimlik]));
    assert.equal(s?.ipucu.anahtar, IPUCLARI[2].kimlik);
    assert.equal(s?.toplam, IPUCLARI.length - 1);
  });

  it("hepsi gittiyse null — dizi biter", () => {
    assert.equal(siradakiIpucu(LISTE, new Set(IPUCLARI.map((i) => i.kimlik))), null);
  });
});

describe("IPUCLARI", () => {
  it("kimlikler tekil", () => {
    const kimlikler = IPUCLARI.map((i) => i.kimlik);
    assert.equal(new Set(kimlikler).size, kimlikler.length);
  });

  it("her ipucunun uygulama içi bir bağlantısı ve düğmesi var", () => {
    for (const ipucu of IPUCLARI) {
      assert.ok(ipucu.link.startsWith("/"), ipucu.kimlik);
      assert.ok(ipucu.dugme.trim().length > 0, ipucu.kimlik);
    }
  });

  it("kullanıcıya 'kredi' demiyor (bkz. CLAUDE.md — Lio Bakiyesi)", () => {
    for (const ipucu of IPUCLARI) assert.ok(!/kredi/i.test(`${ipucu.baslik} ${ipucu.govde}`), ipucu.kimlik);
  });
});

describe("ipucuKarari", () => {
  it("temel durumda sıradaki ipucunu gönderir", () => {
    const karar = ipucuKarari(temel);
    assert.equal(karar.gonder && karar.sira, 1);
  });

  it("kapalıysa göndermez", () => {
    assert.equal(ipucuKarari({ ...temel, acik: false }).gonder, false);
  });

  it("aynı yerel günde ikinci ipucu gitmez", () => {
    assert.equal(ipucuKarari({ ...temel, sonIpucuGunu: "2026-09-19" }).gonder, false);
    assert.equal(ipucuKarari({ ...temel, sonIpucuGunu: "2026-09-18" }).gonder, true);
  });

  it("kullanıcının günlük saatinden önce gitmez", () => {
    assert.equal(ipucuKarari({ ...temel, yerelSaat: 8 }).gonder, false);
  });

  it("kayıttan hemen sonra gitmez", () => {
    assert.equal(ipucuKarari({ ...temel, hesapAcilis: new Date(SIMDI.getTime() - 3 * SAAT) }).gonder, false);
  });

  it("eski hesapta dizi BAŞLAMAZ ama başlamış dizi sürer", () => {
    const eski = new Date(SIMDI.getTime() - 200 * GUN);
    assert.equal(ipucuKarari({ ...temel, hesapAcilis: eski }).gonder, false);
    const karar = ipucuKarari({ ...temel, hesapAcilis: eski, gonderilenler: new Set([IPUCLARI[0].kimlik]) });
    assert.equal(karar.gonder && karar.sira, 2);
  });

  it("açılış anı bilinmeyen hesaba göndermez", () => {
    assert.equal(ipucuKarari({ ...temel, hesapAcilis: null }).gonder, false);
  });

  it("yönetici hesabı eski olsa da diziyi alır", () => {
    const eski = new Date(SIMDI.getTime() - 400 * GUN);
    assert.equal(ipucuKarari({ ...temel, hesapAcilis: eski, yasSiniriYok: true }).gonder, true);
  });
});
