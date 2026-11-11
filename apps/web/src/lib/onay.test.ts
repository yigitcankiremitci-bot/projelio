import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { bildir, onayIsteginiKapat, onayKuyrugu, onayKuyrugunuDinle, onayla, sor, tehlikeliMi } from "./onay";

describe("uygulamanın onay penceresi", () => {
  it("istekler sırayla kuyruğa girer ve yanıtları çağırana döner", async () => {
    const birak = onayKuyrugunuDinle(() => {});
    try {
      const a = onayla("Sipariş silinsin mi?");
      const b = sor({ mesaj: "Klasör adı:", varsayilan: "Yeni" });
      const c = bildir("Kaydedilemedi.");
      const [ilk, ikinci, ucuncu] = onayKuyrugu();
      assert.equal(onayKuyrugu().length, 3);
      assert.equal(ilk.tur, "onay");
      assert.equal(ikinci.tur, "soru");
      assert.equal(ucuncu.tur, "bilgi");

      onayIsteginiKapat(ilk);
      if (ilk.tur === "onay") ilk.coz(false);
      onayIsteginiKapat(ikinci);
      if (ikinci.tur === "soru") ikinci.coz("Faturalar");
      onayIsteginiKapat(ucuncu);
      if (ucuncu.tur === "bilgi") ucuncu.coz();

      assert.equal(await a, false);
      assert.equal(await b, "Faturalar");
      assert.equal(await c, undefined);
      assert.equal(onayKuyrugu().length, 0);
    } finally {
      birak();
    }
  });

  it("geri dönüşü zor işleri kırmızı düğmeyle sorar", () => {
    assert.equal(tehlikeliMi("Sipariş silinsin mi?"), true);
    assert.equal(tehlikeliMi("Sipariş iptal edilsin mi? İptal geri alınamaz."), true);
    assert.equal(tehlikeliMi("Bu tahsilat geri alınsın mı?"), true);
    assert.equal(tehlikeliMi("5 sipariş aktarılsın mı?"), false);
    assert.equal(tehlikeliMi("Modül her açılışta \"Tahsilat\" sekmesinde açılsın mı?"), false);
  });
});
