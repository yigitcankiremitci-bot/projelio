import { test } from "node:test";
import assert from "node:assert/strict";
import { FAB_PRIORITY, mergeFabActions, type FabRegistration } from "./fabMerge";

const noop = () => {};
const kayit = (id: number, priority: number, label: string): FabRegistration => ({
  id,
  priority,
  action: { label, onClick: noop },
});

test("kayıt yoksa '+' gizlenir", () => {
  assert.equal(mergeFabActions([]), null);
});

test("panel kaydı sayfa kaydını ezer", () => {
  const sonuc = mergeFabActions([
    kayit(1, FAB_PRIORITY.page, "Yeni iş"),
    kayit(2, FAB_PRIORITY.panel, "Müşteri ekle"),
  ]);
  assert.equal(sonuc?.label, "Müşteri ekle");
});

test("aynı öncelikteki kayıtlar tek menüde birleşir, sıra id'ye göre", () => {
  const sonuc = mergeFabActions([
    kayit(5, FAB_PRIORITY.panel, "Ürün/Hizmet ekle"),
    kayit(2, FAB_PRIORITY.panel, "Modül ekle"),
  ]);
  assert.equal(sonuc?.label, "Ekle");
  assert.deepEqual(sonuc?.options?.map((o) => o.label), ["Modül ekle", "Ürün/Hizmet ekle"]);
});

test("birleşmede kendi seçenekleri olan kayıt açılır", () => {
  const sonuc = mergeFabActions([
    { id: 1, priority: FAB_PRIORITY.panel, action: { label: "Dosya ekle", options: [
      { label: "Dosya yükle", onClick: noop },
      { label: "Yeni dosya oluştur", onClick: noop },
    ] } },
    kayit(2, FAB_PRIORITY.panel, "Kişi ata"),
  ]);
  assert.deepEqual(sonuc?.options?.map((o) => o.label), ["Dosya yükle", "Yeni dosya oluştur", "Kişi ata"]);
});
