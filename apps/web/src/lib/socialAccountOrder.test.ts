import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { moveItem, sortByOrder } from "./socialAccountOrder";

const hesap = (id: string) => ({ id });

describe("hesap sırası", () => {
  test("kayıtlı sıra uygulanır", () => {
    const sonuc = sortByOrder([hesap("a"), hesap("b"), hesap("c")], ["c", "a", "b"]);
    assert.deepEqual(
      sonuc.map((x) => x.id),
      ["c", "a", "b"]
    );
  });

  test("sıra yoksa liste olduğu gibi kalır", () => {
    const sonuc = sortByOrder([hesap("a"), hesap("b")], []);
    assert.deepEqual(
      sonuc.map((x) => x.id),
      ["a", "b"]
    );
  });

  // Yeni eklenen hesap listenin ortasında belirmemeli: kullanıcı sıraladığı
  // listeyi ezberliyor, araya giren kart yanlış hesabı açtırıyordu.
  test("sırada olmayan hesap sona gider, kendi düzenini korur", () => {
    const sonuc = sortByOrder([hesap("yeni1"), hesap("b"), hesap("yeni2"), hesap("a")], ["a", "b"]);
    assert.deepEqual(
      sonuc.map((x) => x.id),
      ["a", "b", "yeni1", "yeni2"]
    );
  });

  test("arşivlenmiş hesabın kimliği sırada kalsa da liste bozulmaz", () => {
    const sonuc = sortByOrder([hesap("a"), hesap("c")], ["a", "silinmis", "c"]);
    assert.deepEqual(
      sonuc.map((x) => x.id),
      ["a", "c"]
    );
  });
});

describe("sürükle-bırak", () => {
  test("öğeyi aşağı taşır", () => {
    assert.deepEqual(moveItem(["a", "b", "c"], 0, 2), ["b", "c", "a"]);
  });

  test("öğeyi yukarı taşır", () => {
    assert.deepEqual(moveItem(["a", "b", "c"], 2, 0), ["c", "a", "b"]);
  });

  test("aynı yere bırakmak ve geçersiz indeks listeyi değiştirmez", () => {
    assert.deepEqual(moveItem(["a", "b"], 1, 1), ["a", "b"]);
    assert.deepEqual(moveItem(["a", "b"], 0, 5), ["a", "b"]);
    assert.deepEqual(moveItem(["a", "b"], -1, 0), ["a", "b"]);
  });
});
