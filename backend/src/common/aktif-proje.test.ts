// Backend tsconfig'inde esModuleInterop kapalı; komşu testlerle aynı biçim.
import * as assert from "node:assert/strict";
import { test } from "node:test";
import { yalnizAktifProjeGorevleri } from "./aktif-proje";

/** Yalnızca bu yardımcının kullandığı zinciri taklit eden sahte istemci. */
function sahteIstemci(durumlar: Record<string, string>) {
  let sorguSayisi = 0;
  const client = {
    from: () => ({
      select: () => ({
        in: (_kolon: string, idler: string[]) => ({
          neq: (_k: string, deger: string) => {
            sorguSayisi++;
            const data = idler.filter((id) => durumlar[id] && durumlar[id] !== deger).map((id) => ({ id }));
            return Promise.resolve({ data, error: null });
          },
        }),
      }),
    }),
  };
  return { client: client as any, sorgu: () => sorguSayisi };
}

test("aktif olmayan projelerin görevleri ayıklanır, projesiz görevler kalır", async () => {
  const { client } = sahteIstemci({ a: "active", b: "on_hold", c: "passive", d: "completed" });
  const satirlar = [
    { id: "1", project_id: "a" },
    { id: "2", project_id: "b" },
    { id: "3", project_id: "c" },
    { id: "4", project_id: "d" },
    { id: "5", project_id: null }, // departman / rutin görevi
    { id: "6" },
  ];
  const sonuc = await yalnizAktifProjeGorevleri(client, satirlar);
  assert.deepEqual(
    sonuc.map((s) => s.id),
    ["1", "5", "6"]
  );
});

test("projeli görev yoksa veritabanına hiç gidilmez", async () => {
  const { client, sorgu } = sahteIstemci({});
  const sonuc = await yalnizAktifProjeGorevleri(client, [{ id: "1", project_id: null }]);
  assert.equal(sonuc.length, 1);
  assert.equal(sorgu(), 0);
});
