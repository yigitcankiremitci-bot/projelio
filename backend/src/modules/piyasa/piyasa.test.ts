import * as assert from "node:assert/strict";
import { test } from "node:test";
import { dovizBulteniAyikla, haberleriBirlestir, rssAyikla, yahooGrafikAyikla } from "./piyasa";

const TCMB = `<Tarih_Date Tarih="09.11.2026" Date="11/09/2026">
<Currency CrossOrder="0" Kod="USD" CurrencyCode="USD"><ForexBuying>41.10</ForexBuying><ForexSelling>41.25</ForexSelling></Currency>
<Currency CrossOrder="9" Kod="EUR" CurrencyCode="EUR"><ForexBuying>47.50</ForexBuying><ForexSelling>47.70</ForexSelling></Currency>
<Currency CrossOrder="12" Kod="XDR" CurrencyCode="XDR"><ForexBuying></ForexBuying><ForexSelling></ForexSelling></Currency>
</Tarih_Date>`;

test("TCMB bülteninden istenen birimler kendi bloklarından okunur", () => {
  const b = dovizBulteniAyikla(TCMB, ["USD", "EUR", "GBP"]);
  assert.deepEqual(b, {
    tarih: "09.11.2026",
    kurlar: [
      { kod: "USD", alis: 41.1, satis: 41.25 },
      { kod: "EUR", alis: 47.5, satis: 47.7 },
    ],
  });
});

test("değeri boş birim atlanır, hiçbiri yoksa null", () => {
  assert.equal(dovizBulteniAyikla(TCMB, ["XDR"]), null);
  assert.equal(dovizBulteniAyikla(""), null);
});

test("RSS: TRT gibi link yazmayan akışta adres guid'den alınır, CDATA ve varlıklar çözülür", () => {
  const xml = `<rss><channel>
    <item><guid>https://trt.example/h/1</guid><pubDate>Mon, 09 Nov 2026 11:52:00 +0300</pubDate><title>Faiz &amp; enflasyon</title><media:content url="https://trt.example/r.jpg" type="image/jpeg"/></item>
    <item><guid isPermaLink="false">4117250</guid><link>https://aa.example/h/2</link><title><![CDATA[Borsa güne yükselişle başladı]]></title></item>
    <item><guid isPermaLink="false">123</guid><title>Bağlantısız</title></item>
  </channel></rss>`;
  const h = rssAyikla(xml, "Kaynak");
  assert.equal(h.length, 2);
  assert.deepEqual(h[0], { baslik: "Faiz & enflasyon", baglanti: "https://trt.example/h/1", kaynak: "Kaynak", tarih: "2026-11-09T08:52:00.000Z", gorsel: "https://trt.example/r.jpg" });
  assert.equal(h[1].baglanti, "https://aa.example/h/2");
  assert.equal(h[1].baslik, "Borsa güne yükselişle başladı");
  assert.equal(h[1].tarih, "");
});

test("akışlar karışır: en yeni önce, aynı başlık bir kez, tavanla", () => {
  const a = { baslik: "A", baglanti: "https://x/a", kaynak: "TRT", tarih: "2026-11-09T08:00:00.000Z" };
  const b = { baslik: "B", baglanti: "https://x/b", kaynak: "AA", tarih: "2026-11-09T09:00:00.000Z" };
  const aTekrar = { ...a, kaynak: "AA", tarih: "2026-11-09T07:00:00.000Z" };
  assert.deepEqual(haberleriBirlestir([[a], [b, aTekrar]], 10).map((h) => h.baslik), ["B", "A"]);
  assert.equal(haberleriBirlestir([[a], [b]], 1).length, 1);
});

test("Yahoo yanıtından fiyat ve önceki kapanışa göre değişim", () => {
  const json = { chart: { result: [{ meta: { symbol: "XU100.IS", currency: "TRY", regularMarketPrice: 11649.67, chartPreviousClose: 11482.6 } }] } };
  assert.deepEqual(yahooGrafikAyikla(json, "BIST 100"), { sembol: "XU100.IS", ad: "BIST 100", fiyat: 11649.67, degisim: 1.45, paraBirimi: "TRY" });
});

test("Yahoo biçimi bozuksa istisna yok, null", () => {
  assert.equal(yahooGrafikAyikla(null, "X"), null);
  assert.equal(yahooGrafikAyikla({ chart: { result: [] } }, "X"), null);
  assert.equal(yahooGrafikAyikla({ chart: { result: [{ meta: { regularMarketPrice: "yok" } }] } }, "X"), null);
});
