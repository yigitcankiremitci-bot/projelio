import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { bildirimBaglantisi } from "./bildirimBaglantisi";

const MODUL = "/departments/d1/modules/crm_musteri";

describe("bildirimin adresi", () => {
  it("eski sipariş bildirimi Tahsilat'ı ve gövdedeki numarayı ister", () => {
    assert.equal(
      bildirimBaglantisi({ type: "web_order_received", link: MODUL, body: "NS-10007 · 1.014,30 TRY — onay bekliyor" }),
      `${MODUL}?sekme=tahsilat&siparisNo=NS-10007`
    );
  });

  it("numarasız eski bildirim yalnızca Tahsilat'ı açar", () => {
    assert.equal(
      bildirimBaglantisi({ type: "web_order_received", link: MODUL, body: "1.014,30 TRY — onay bekliyor" }),
      `${MODUL}?sekme=tahsilat`
    );
  });

  it("yeni bildirimin bağlantısına dokunmaz", () => {
    const yeni = `${MODUL}?sekme=tahsilat&siparis=abc`;
    assert.equal(bildirimBaglantisi({ type: "web_order_received", link: yeni, body: "NS-1 · 5 TRY" }), yeni);
  });

  it("başka bildirimlere dokunmaz", () => {
    assert.equal(bildirimBaglantisi({ type: "task_assigned", link: "/tasks/1", body: "A · B" }), "/tasks/1");
    assert.equal(bildirimBaglantisi({ type: "web_order_received", link: null }), undefined);
  });
});
