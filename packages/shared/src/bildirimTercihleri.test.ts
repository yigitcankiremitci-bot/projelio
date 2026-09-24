import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { bildirimKanaliAcikMi, bildirimTercihleriniTemizle, BILDIRIM_KATEGORILERI } from "./bildirimTercihleri";

describe("bildirimKanaliAcikMi", () => {
  it("kaydı olmayan tipte her kanal açık — tablo boşken davranış eskisiyle aynı", () => {
    for (const kanal of ["uygulama", "anlik", "eposta", "whatsapp"] as const) {
      assert.equal(bildirimKanaliAcikMi(null, "task_reminder", kanal), true);
    }
  });

  it("yalnızca kapatılan kanal kapanır", () => {
    const t = { tipler: { post_like: { anlik: false } }, ses: true };
    assert.equal(bildirimKanaliAcikMi(t, "post_like", "anlik"), false);
    assert.equal(bildirimKanaliAcikMi(t, "post_like", "uygulama"), true);
    assert.equal(bildirimKanaliAcikMi(t, "post_like", "eposta"), true);
  });

  it("uygulama kapalıysa diğer kanallar da kapalı — satır yazılmıyor", () => {
    const t = { tipler: { post_like: { uygulama: false } }, ses: true };
    assert.equal(bildirimKanaliAcikMi(t, "post_like", "anlik"), false);
    assert.equal(bildirimKanaliAcikMi(t, "post_like", "eposta"), false);
  });

  it("kilitli tip çandan kaldırılamaz ama telefonu kapatılabilir", () => {
    const t = { tipler: { job_invite: { uygulama: false, anlik: false } }, ses: true };
    assert.equal(bildirimKanaliAcikMi(t, "job_invite", "uygulama"), true);
    assert.equal(bildirimKanaliAcikMi(t, "job_invite", "anlik"), false);
    assert.equal(bildirimKanaliAcikMi(t, "job_invite", "eposta"), true);
  });
});

describe("bildirimTercihleriniTemizle", () => {
  it("bilinmeyen tip ve kanal, boolean olmayan değer düşer; yalnızca kapalılar saklanır", () => {
    const temiz = bildirimTercihleriniTemizle({
      tipler: { post_like: { anlik: false, eposta: true, uydurma: false }, yok_boyle: { anlik: false }, task_assigned: { anlik: "hayir" } },
      ses: false,
    });
    assert.deepEqual(temiz, { tipler: { post_like: { anlik: false } }, ses: false });
  });

  it("çöp girdide varsayılana düşer", () => {
    assert.deepEqual(bildirimTercihleriniTemizle(null), { tipler: {}, ses: true });
    assert.deepEqual(bildirimTercihleriniTemizle("x"), { tipler: {}, ses: true });
  });

  it("bir tip iki kategoride birden görünmez", () => {
    const tipler = BILDIRIM_KATEGORILERI.flatMap((k) => k.tipler.map((t) => t.tip));
    assert.equal(new Set(tipler).size, tipler.length);
  });
});
