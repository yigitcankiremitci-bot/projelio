import * as assert from "node:assert/strict";
import { createServer } from "node:http";
import { describe, test } from "node:test";
import { uzunPost } from "./ollama.ts";

/** Yanıt başlığını `gecikme` ms sonra yazan sahte Ollama. */
function sahteSunucu(gecikme: number) {
  const sunucu = createServer((istek, yanit) => {
    let govde = "";
    istek.on("data", (p) => (govde += p));
    istek.on("end", () => setTimeout(() => yanit.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ gelen: JSON.parse(govde) })), gecikme));
  });
  return new Promise<{ adres: URL; kapat: () => void }>((coz) =>
    sunucu.listen(0, "127.0.0.1", () => coz({ adres: new URL(`http://127.0.0.1:${(sunucu.address() as any).port}/api/chat`), kapat: () => sunucu.close() }))
  );
}

describe("uzunPost", () => {
  test("geç gelen yanıt başlığını bekler ve gövdeyi bütün döner (Türkçe dahil)", async () => {
    const s = await sahteSunucu(300);
    try {
      const y = await uzunPost(s.adres, JSON.stringify({ m: "şirket" }), 5000);
      assert.equal(y.durum, 200);
      assert.deepEqual(JSON.parse(y.metin), { gelen: { m: "şirket" } });
    } finally {
      s.kapat();
    }
  });

  test("kendi süremiz dolunca anlaşılır hatayla düşer", async () => {
    const s = await sahteSunucu(2000);
    try {
      await assert.rejects(uzunPost(s.adres, "{}", 200), /yanıt vermedi/);
    } finally {
      s.kapat();
    }
  });
});
