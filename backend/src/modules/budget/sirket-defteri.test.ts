import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

// Şirketin GELİR-GİDER defteri artık burada değil: modül kaldırıldı ve
// kayıtları budget_transactions'a taşındı (migration 104). Bu dosyada yalnızca
// henüz gerçekleşmemiş para — alacak/borç — kaldı.
import { sirketAlacakBorcu } from "./sirket-defteri";

describe("şirket alacak/borcu Kasa vade listesine çevrilir", () => {
  const kayit = (data: Record<string, unknown>) => ({ id: "ab-1", organization_id: "org-1", data });

  it("açık alacak vade ve karşı tarafla gelir", () => {
    const a = sirketAlacakBorcu(
      kayit({ type: "receivable", amount: 4200, dueDate: "2026-04-01", status: "open" }),
      "Akkoç A.Ş.",
      "Deniz Yapı"
    );
    assert.equal(a?.type, "receivable");
    assert.equal(a?.amount, 4200);
    assert.equal(a?.dueDate, "2026-04-01");
    assert.equal(a?.counterparty, "Deniz Yapı");
    assert.equal(a?.organizationName, "Akkoç A.Ş.");
  });

  // Kapanan kayıt gerçekleşmiş paradır; Kasa'da defterde görünür, vade
  // listesinde değil — orası "neyi kaçırıyorum" sorusunu cevaplıyor.
  it("kapanmış kayıt listeye girmez", () => {
    assert.equal(sirketAlacakBorcu(kayit({ type: "payable", amount: 100, status: "settled" })), null);
  });

  // Gelir/gider defterinin aksine burada toplam hesaplanmıyor: para birimi
  // yüzünden bir vade uyarısını yutmak yanlış toplamdan daha kötü olurdu.
  it("TRY dışı para birimi elenmez, kendi birimiyle taşınır", () => {
    const a = sirketAlacakBorcu(kayit({ type: "payable", amount: 300, currency: "USD" }));
    assert.equal(a?.currency, "USD");
    assert.equal(a?.amount, 300);
  });

  it("karşı taraf çözülemediyse kayıttaki ham değer kalır", () => {
    const a = sirketAlacakBorcu(kayit({ type: "receivable", amount: 10, counterparty: "Eski Müşteri" }));
    assert.equal(a?.counterparty, "Eski Müşteri");
  });

  it("vadesi girilmemiş kayıt vadesiz gelir", () => {
    assert.equal(sirketAlacakBorcu(kayit({ type: "receivable", amount: 10 }))?.dueDate, undefined);
  });

  it("tutarsız kayıt elenir", () => {
    assert.equal(sirketAlacakBorcu(kayit({ type: "receivable" })), null);
    assert.equal(sirketAlacakBorcu(kayit({ type: "receivable", amount: 0 })), null);
  });
});
