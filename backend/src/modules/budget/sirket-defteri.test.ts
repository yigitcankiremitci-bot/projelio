import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { sirketAlacakBorcu, sirketDefterHareketi } from "./sirket-defteri";

const satir = (data: Record<string, unknown>) => ({
  id: "kayit-1",
  organization_id: "org-1",
  data,
  created_at: "2026-03-04T10:00:00.000Z",
});

describe("şirket defteri kaydı Kasa hareketine çevrilir", () => {
  it("gider kaydı türüyle ve tarihiyle gelir", () => {
    const h = sirketDefterHareketi(satir({ type: "expense", amount: 1500, entryDate: "2026-02-10", description: "Ofis kirası" }), "Akkoç A.Ş.");
    assert.equal(h?.type, "expense");
    assert.equal(h?.amount, 1500);
    assert.equal(h?.occurredAt, "2026-02-10");
    assert.equal(h?.organizationName, "Akkoç A.Ş.");
    assert.equal(h?.description, "Ofis kirası");
  });

  it("tarih girilmemişse kaydın açılma günü kullanılır", () => {
    const h = sirketDefterHareketi(satir({ type: "income", amount: 200 }));
    assert.equal(h?.occurredAt, "2026-03-04");
  });

  it("açıklama yoksa kategori yazılır", () => {
    const h = sirketDefterHareketi(satir({ type: "expense", amount: 90, category: "Yazılım" }));
    assert.equal(h?.description, "Yazılım");
  });

  // Kişisel Kasa tek para birimli: TRY dışı bir kayıt toplama katılsaydı
  // "1.000 USD + 1.000 TRY = 2.000 ₺" gibi yanlış bir toplam çıkardı.
  it("TRY dışı para birimi Kasa'ya yansımaz", () => {
    assert.equal(sirketDefterHareketi(satir({ type: "expense", amount: 1000, currency: "USD" })), null);
    assert.ok(sirketDefterHareketi(satir({ type: "expense", amount: 1000, currency: "TRY" })));
    // Para birimi hiç seçilmemiş eski kayıtlar TRY sayılır.
    assert.ok(sirketDefterHareketi(satir({ type: "expense", amount: 1000 })));
  });

  it("tutarsız kayıt elenir", () => {
    assert.equal(sirketDefterHareketi(satir({ type: "expense" })), null);
    assert.equal(sirketDefterHareketi(satir({ type: "expense", amount: "abc" })), null);
    assert.equal(sirketDefterHareketi(satir({ type: "expense", amount: 0 })), null);
  });

  // Kimliği module_records'a ait; /budget/transactions uçları onu bulamaz.
  it("kayıt Kasa'da salt okunur işaretlenir", () => {
    assert.equal(sirketDefterHareketi(satir({ type: "income", amount: 5 }))?.readOnly, true);
  });
});

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
