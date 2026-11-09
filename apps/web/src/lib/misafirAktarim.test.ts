import { test } from "node:test";
import assert from "node:assert/strict";
import { MISAFIR_ANAHTAR, misafirTaslaginiAktar, parcayiCoz } from "./misafirAktarim";

const parca = (tel: unknown) => `#misafir=${Buffer.from(JSON.stringify(tel)).toString("base64url")}`;

function depoKur(gorevSayisi: number) {
  const m = new Map<string, string>();
  m.set(
    MISAFIR_ANAHTAR,
    JSON.stringify({
      taslak: {
        is: "İş",
        proje: "Proje",
        gorevler: Array.from({ length: gorevSayisi }, (_, i) => ({ baslik: `G${i}`, bitti: i === 0 })),
      },
      alindi: 1000,
      deneme: 0,
      aktarilan: 0,
    })
  );
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

test("Türkçe karakterli taslak çözülür", () => {
  const t = parcayiCoz(parca({ v: 1, i: "Çiğdem İşi", p: "Şube", g: [["Görev", 1]] }));
  assert.deepEqual(t, { is: "Çiğdem İşi", proje: "Şube", gorevler: [{ baslik: "Görev", bitti: true }] });
});

test("dışarıdan gelen taslakta sınırlar yeniden uygulanır", () => {
  const t = parcayiCoz(
    parca({ v: 1, i: "x".repeat(500), p: "P", g: Array.from({ length: 50 }, () => ["y".repeat(500), 0]) })
  );
  assert.equal(t?.is.length, 80);
  assert.equal(t?.gorevler.length, 10);
  assert.equal(t?.gorevler[0].baslik.length, 140);
});

test("bozuk ya da bilinmeyen sürüm reddedilir", () => {
  assert.equal(parcayiCoz("#misafir=%%%"), null);
  assert.equal(parcayiCoz(parca({ v: 2, i: "İş" })), null);
  assert.equal(parcayiCoz(parca({ v: 1, i: 42 })), null);
  assert.equal(parcayiCoz(""), null);
});

test("proje yoksa görevler düşer", () => {
  assert.deepEqual(parcayiCoz(parca({ v: 1, i: "İş", p: null, g: [["G", 0]] }))?.gorevler, []);
});

test("sırayla aktarır, bitince taslağı siler", async () => {
  const depo = depoKur(2);
  const cagrilar: string[] = [];
  const post = async <T,>(yol: string): Promise<T> => {
    cagrilar.push(yol);
    return { outcome: "created", entity: { id: yol === "/jobs" ? "j1" : "p1" } } as T;
  };
  const sonuc = await misafirTaslaginiAktar(post, depo, 2000);
  assert.deepEqual(sonuc, { isId: "j1", projeId: "p1" });
  assert.deepEqual(cagrilar, ["/jobs", "/projects", "/projects/p1/tasks", "/projects/p1/tasks"]);
  assert.equal(depo.m.has(MISAFIR_ANAHTAR), false);
});

test("yarıda kesilirse kaldığı yerden sürer, işi iki kez açmaz", async () => {
  const depo = depoKur(3);
  const cagrilar: string[] = [];
  let gorev = 0;
  const post = async <T,>(yol: string): Promise<T> => {
    if (yol.endsWith("/tasks") && ++gorev === 2) throw new Error("ağ");
    cagrilar.push(yol);
    return { entity: { id: yol === "/jobs" ? "j1" : "p1" } } as T;
  };
  await assert.rejects(misafirTaslaginiAktar(post, depo, 2000));
  assert.equal(depo.m.has(MISAFIR_ANAHTAR), true);
  await misafirTaslaginiAktar(post, depo, 2000);
  assert.equal(cagrilar.filter((y) => y === "/jobs").length, 1);
  assert.equal(cagrilar.filter((y) => y === "/projects").length, 1);
  assert.equal(cagrilar.filter((y) => y.endsWith("/tasks")).length, 3);
});

test("süresi dolan taslak aktarılmaz", async () => {
  const depo = depoKur(1);
  const post = async <T,>(): Promise<T> => assert.fail("çağrılmamalıydı");
  assert.equal(await misafirTaslaginiAktar(post, depo, 1000 + 8 * 24 * 60 * 60 * 1000), null);
  assert.equal(depo.m.has(MISAFIR_ANAHTAR), false);
});
