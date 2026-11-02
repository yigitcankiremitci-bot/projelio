import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ESKI_BUSINESS_SINIRI,
  KOLTUKSUZ_SIRKET_SINIRI,
  koltukDurumu,
  koltukEklenebilirMi,
  sirketKoltukSiniri,
} from "./koltukHakki";

test("abonelik yoksa ya da Business değilse şirket 3 kişi taşır", () => {
  assert.equal(sirketKoltukSiniri([]), KOLTUKSUZ_SIRKET_SINIRI);
  assert.equal(sirketKoltukSiniri([{ planKey: "pro", koltuk: null }]), 3);
});

test("Business satın alınan kişi sayısını, eski (koltuksuz) Business 10 kişiyi taşır", () => {
  assert.equal(sirketKoltukSiniri([{ planKey: "business", koltuk: 7 }]), 7);
  assert.equal(sirketKoltukSiniri([{ planKey: "business", koltuk: null }]), ESKI_BUSINESS_SINIRI);
});

test("şirket ve sahip aboneliğinden büyük olan geçerli", () => {
  assert.equal(
    sirketKoltukSiniri([
      { planKey: "pro", koltuk: null },
      { planKey: "business", koltuk: 5 },
    ]),
    5
  );
});

test("yer dolunca yeni kişi eklenmez; zaten sayılan ve taşeron yer harcamaz", () => {
  const dolu = koltukDurumu(3, 3);
  assert.equal(dolu.kalan, 0);
  const karar = koltukEklenebilirMi(dolu, { zatenSayiliyor: false, taseron: false });
  assert.equal(karar.eklenebilir, false);
  assert.match("metin" in karar ? karar.metin : "", /Business'a geç/);
  assert.equal(koltukEklenebilirMi(dolu, { zatenSayiliyor: true, taseron: false }).eklenebilir, true);
  assert.equal(koltukEklenebilirMi(dolu, { zatenSayiliyor: false, taseron: true }).eklenebilir, true);
});

test("kural öncesi kalabalık şirket: kalan 0, mesaj Business'ta kişi artırmayı söyler", () => {
  const d = koltukDurumu(5, 8);
  assert.equal(d.kalan, 0);
  const karar = koltukEklenebilirMi(d, { zatenSayiliyor: false, taseron: false });
  assert.match("metin" in karar ? karar.metin : "", /Kişi sayısını artırmak/);
});
