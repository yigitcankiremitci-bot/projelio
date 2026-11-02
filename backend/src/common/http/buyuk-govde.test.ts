import * as assert from "node:assert/strict";
import { test } from "node:test";
import * as express from "express";
import { ExpressAdapter } from "@nestjs/platform-express";
import { buyukJsonGovde } from "./buyuk-govde";

test("büyük gövde ara katmanı Nest'in kendi JSON ayrıştırıcısını engellemez", async () => {
  const uygulama = (express as any).default ? (express as any).default() : (express as any)();
  const adaptor = new ExpressAdapter(uygulama);
  adaptor.use("/ajan/bilgiler", buyukJsonGovde("4mb"));
  adaptor.registerParserMiddleware("", true);
  uygulama.post("/ajan/mesajlar", (req, res) => res.json({ gelen: req.body?.metin ?? null }));
  uygulama.post("/ajan/bilgiler", (req, res) => res.json({ boy: String(req.body?.icerik ?? "").length }));
  const sunucu = uygulama.listen(0);
  try {
    const port = (sunucu.address() as any).port;
    const gonder = (yol: string, govde: unknown) =>
      fetch(`http://127.0.0.1:${port}${yol}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(govde) });
    assert.deepEqual(await (await gonder("/ajan/mesajlar", { metin: "selam" })).json(), { gelen: "selam" });
    // 100 KB'ın üstü yalnızca büyük gövde ucunda geçer.
    const buyuk = { icerik: "ş".repeat(300_000) };
    assert.deepEqual(await (await gonder("/ajan/bilgiler", buyuk)).json(), { boy: 300_000 });
    assert.equal((await gonder("/ajan/mesajlar", buyuk)).status, 413);
  } finally {
    sunucu.close();
  }
});
