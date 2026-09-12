import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { gunlukOzetIcerigi } from "./notification-email.icerik";

const bildirim = { baslik: "Yeni görev", govde: "x" };
const gorev = (gun: string) => ({ baslik: `Görev ${gun}`, gun });

describe("gunlukOzetIcerigi", () => {
  it("yalnızca kullanıcının yerel gününe düşen görevleri alır", () => {
    const icerik = gunlukOzetIcerigi({
      bildirimler: [],
      gorevler: [gorev("2026-09-12"), gorev("2026-09-13"), gorev("2026-09-11")],
      yerelGun: "2026-09-12",
      gorevlerDahil: true,
    });
    assert.equal(icerik.gorevler.length, 1);
    assert.equal(icerik.gorevler[0].gun, "2026-09-12");
    assert.equal(icerik.bos, false);
  });

  /**
   * GERİLEME TESTİ — 12 Eylül 2026'da canlıda yaşandı.
   *
   * Kullanıcının penceresinde 32 görev vardı ama hiçbiri o güne ait değildi.
   * "Boş mu" kararı ham listeye, süzme ise gönderim anına bakınca ikisi
   * ayrıştı: e-posta gitmedi AMA gün de damgalanmadı, kullanıcı her 10
   * dakikada bir yeniden hesaplanıp askıda kaldı.
   */
  it("pencerede görev var ama hiçbiri bugüne ait değilse BOŞ sayılır", () => {
    const icerik = gunlukOzetIcerigi({
      bildirimler: [],
      gorevler: [gorev("2026-09-13"), gorev("2026-09-14"), gorev("2026-09-11")],
      yerelGun: "2026-09-12",
      gorevlerDahil: true,
    });
    assert.deepEqual(icerik.gorevler, []);
    assert.equal(icerik.bos, true, "boş sayılmazsa gün damgalanmaz ve kullanıcı askıda kalır");
  });

  it("bildirim varsa görev olmasa da boş değildir", () => {
    const icerik = gunlukOzetIcerigi({
      bildirimler: [bildirim],
      gorevler: [gorev("2026-09-13")],
      yerelGun: "2026-09-12",
      gorevlerDahil: true,
    });
    assert.equal(icerik.bos, false);
    assert.equal(icerik.gorevler.length, 0);
  });

  it("görev listesi istenmiyorsa görevler hiç bakılmadan düşer", () => {
    const icerik = gunlukOzetIcerigi({
      bildirimler: [],
      gorevler: [gorev("2026-09-12")],
      yerelGun: "2026-09-12",
      gorevlerDahil: false,
    });
    assert.deepEqual(icerik.gorevler, []);
    assert.equal(icerik.bos, true);
  });

  it("hem bildirim hem görev yoksa boştur", () => {
    const icerik = gunlukOzetIcerigi({ bildirimler: [], gorevler: [], yerelGun: "2026-09-12", gorevlerDahil: true });
    assert.equal(icerik.bos, true);
  });
});
