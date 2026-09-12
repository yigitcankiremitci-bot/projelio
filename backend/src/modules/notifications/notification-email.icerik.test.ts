import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { gunlukOzetIcerigi, sonrakiGun } from "./notification-email.icerik";

const bildirim = { baslik: "Yeni görev", govde: "x" };
const gorev = (gun: string) => ({ baslik: `Görev ${gun}`, gun });
const BUGUN = "2026-09-12";

describe("sonrakiGun", () => {
  it("ay ve yıl sınırını doğru geçer", () => {
    assert.equal(sonrakiGun("2026-09-12"), "2026-09-13");
    assert.equal(sonrakiGun("2026-09-30"), "2026-10-01");
    assert.equal(sonrakiGun("2026-12-31"), "2027-01-01");
    assert.equal(sonrakiGun("2028-02-28"), "2028-02-29"); // artık yıl
  });
});

describe("gunlukOzetIcerigi", () => {
  it("görevleri geciken / bugün / yarın diye ayırır", () => {
    const icerik = gunlukOzetIcerigi({
      bildirimler: [],
      gorevler: [gorev("2026-09-11"), gorev("2026-09-12"), gorev("2026-09-13"), gorev("2026-09-20")],
      yerelGun: BUGUN,
      gorevlerDahil: true,
    });
    assert.deepEqual(icerik.gorevler.geciken.map((g) => g.gun), ["2026-09-11"]);
    assert.deepEqual(icerik.gorevler.bugun.map((g) => g.gun), ["2026-09-12"]);
    assert.deepEqual(icerik.gorevler.yarin.map((g) => g.gun), ["2026-09-13"]);
    assert.equal(icerik.bos, false);
  });

  it("yarından sonrasını almaz — özet iki günü anlatıyor, tüm yılı değil", () => {
    const icerik = gunlukOzetIcerigi({
      bildirimler: [],
      gorevler: [gorev("2026-09-14"), gorev("2026-10-01")],
      yerelGun: BUGUN,
      gorevlerDahil: true,
    });
    assert.equal(icerik.gorevler.yarin.length, 0);
    assert.equal(icerik.bos, true);
  });

  it("geciken listesi en eskiden yeniye sıralanır", () => {
    const icerik = gunlukOzetIcerigi({
      bildirimler: [],
      gorevler: [gorev("2026-09-10"), gorev("2026-08-30"), gorev("2026-09-11")],
      yerelGun: BUGUN,
      gorevlerDahil: true,
    });
    assert.deepEqual(icerik.gorevler.geciken.map((g) => g.gun), ["2026-08-30", "2026-09-10", "2026-09-11"]);
  });

  /**
   * GERİLEME TESTİ — 12 Eylül 2026'da canlıda yaşandı.
   *
   * Kullanıcının penceresinde 32 görev vardı ama hiçbiri o güne ait değildi.
   * "Boş mu" kararı ham listeye, süzme ise gönderim anına bakınca ikisi
   * ayrıştı: e-posta gitmedi AMA gün de damgalanmadı, kullanıcı her 10
   * dakikada bir yeniden hesaplanıp askıda kaldı.
   *
   * Bugün bu senaryo zaten boş DEĞİL (13 Eylül artık "yarın" bölümüne düşüyor),
   * bu yüzden test hiçbir bölüme düşmeyen tarihlerle kuruluyor.
   */
  it("pencerede görev var ama hiçbiri bölümlere düşmüyorsa BOŞ sayılır", () => {
    const icerik = gunlukOzetIcerigi({
      bildirimler: [],
      gorevler: [gorev("2026-09-20"), gorev("2026-09-25")],
      yerelGun: BUGUN,
      gorevlerDahil: true,
    });
    assert.equal(icerik.bos, true, "boş sayılmazsa gün damgalanmaz ve kullanıcı askıda kalır");
  });

  it("yalnızca geciken görev varsa bile gönderilir — kaçırılanı susmak özetin işi değil", () => {
    const icerik = gunlukOzetIcerigi({
      bildirimler: [],
      gorevler: [gorev("2026-09-01")],
      yerelGun: BUGUN,
      gorevlerDahil: true,
    });
    assert.equal(icerik.bos, false);
  });

  it("bildirim varsa görev olmasa da boş değildir", () => {
    const icerik = gunlukOzetIcerigi({
      bildirimler: [bildirim],
      gorevler: [],
      yerelGun: BUGUN,
      gorevlerDahil: true,
    });
    assert.equal(icerik.bos, false);
  });

  it("görev listesi istenmiyorsa görevler hiç bakılmadan düşer", () => {
    const icerik = gunlukOzetIcerigi({
      bildirimler: [],
      gorevler: [gorev(BUGUN), gorev("2026-09-01")],
      yerelGun: BUGUN,
      gorevlerDahil: false,
    });
    assert.deepEqual(icerik.gorevler, { geciken: [], bugun: [], yarin: [] });
    assert.equal(icerik.bos, true);
  });
});
