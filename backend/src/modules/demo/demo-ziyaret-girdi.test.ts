import { strict as assert } from "node:assert";
import { test } from "node:test";
import { demoPaketiniTemizle } from "./demo-ziyaret-girdi";

const ID = "3f2b8c1e-5a4d-4e7f-9b1a-2c3d4e5f6a7b";
const SUNUCU = Date.parse("2026-09-17T10:00:00Z");

test("istemci saati kaymış olsa da olay zamanı sunucuya göre hesaplanır", () => {
  const istemci = SUNUCU + 3600_000; // istemci bir saat ileride
  const p = demoPaketiniTemizle(
    {
      ziyaretId: ID,
      simdi: istemci,
      cihaz: "mobil",
      kaynak: "tanitim",
      dil: "tr",
      olaylar: [{ sira: 1, t: istemci - 5000, tur: "sayfa", anahtar: "/", sayfa: "/", sure: 4.26 }],
    },
    SUNUCU
  )!;
  assert.equal(p.olaylar[0].at, "2026-09-17T09:59:55.000Z");
  assert.equal(p.olaylar[0].sure_sn, 4.3);
  assert.equal(p.cihaz, "mobil");
});

test("bozuk olaylar atılır, geçerliler kalır", () => {
  const p = demoPaketiniTemizle(
    {
      ziyaretId: ID,
      simdi: SUNUCU,
      olaylar: [
        { sira: 1, t: SUNUCU, tur: "kaydet", anahtar: "x", sayfa: "/" },
        { sira: -1, t: SUNUCU, tur: "tikla", anahtar: "x", sayfa: "/" },
        { sira: 2, t: SUNUCU, tur: "tikla", anahtar: "", sayfa: "/" },
        { sira: 3, t: SUNUCU, tur: "tikla", anahtar: "a".repeat(200), sayfa: "/", sure: 99 },
        null,
      ],
    },
    SUNUCU
  )!;
  assert.equal(p.olaylar.length, 1);
  assert.equal(p.olaylar[0].anahtar.length, 60);
  // Süre yalnızca sayfa olayında anlamlı.
  assert.equal(p.olaylar[0].sure_sn, null);
  assert.equal(p.kaynak, null);
});

test("süre tavanı ve geçersiz ziyaret kimliği", () => {
  const p = demoPaketiniTemizle(
    { ziyaretId: ID, simdi: SUNUCU, olaylar: [{ sira: 1, t: SUNUCU, tur: "sayfa", anahtar: "/", sayfa: "/", sure: 99999 }] },
    SUNUCU
  )!;
  assert.equal(p.olaylar[0].sure_sn, 1800);
  assert.equal(demoPaketiniTemizle({ ziyaretId: "abc", simdi: SUNUCU, olaylar: [] }, SUNUCU), null);
  assert.equal(demoPaketiniTemizle(null, SUNUCU), null);
});
