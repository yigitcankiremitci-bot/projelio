import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formatForWhatsapp, stripMarkdown, truncateForWhatsapp, WHATSAPP_REPLY_LIMIT } from "./whatsapp-lio-format";

const URL = "https://projelio.app";

describe("stripMarkdown", () => {
  test("başlık işaretleri gider", () => {
    assert.equal(stripMarkdown("## Bütçe raporu\nToplam: 100"), "Bütçe raporu\nToplam: 100");
  });

  test("kalın ve italik sadeleşir", () => {
    assert.equal(stripMarkdown("**Toplam** _artış_ var"), "Toplam artış var");
  });

  test("çarpma işareti italik sanılmaz", () => {
    // "3 * 4 * 5" bir vurgu değil; yıldızlar arasında satır sonu yoksa da
    // kelime sınırı kuralı bunu korumalı.
    assert.equal(stripMarkdown("3 * 4 = 12"), "3 * 4 = 12");
  });

  test("alt çizgili tanımlayıcı bozulmaz", () => {
    assert.equal(stripMarkdown("job_id alanı"), "job_id alanı");
  });

  test("projelio dosya bağlantısı yalnızca ada iner", () => {
    assert.equal(stripMarkdown("[rapor.xlsx](projelio:file/abc-123) hazır"), "rapor.xlsx hazır");
  });

  test("gerçek bağlantı adresiyle kalır", () => {
    assert.equal(stripMarkdown("[panel](https://projelio.app/x)"), "panel: https://projelio.app/x");
  });

  test("tablo düz metne iner, ayraç satırı atılır", () => {
    const table = ["| Ay | Tutar |", "|---|---|", "| Ocak | 100 |", "| Şubat | 200 |"].join("\n");
    assert.equal(stripMarkdown(table), "Ay · Tutar\nOcak · 100\nŞubat · 200");
  });

  test("madde işaretleri korunur", () => {
    assert.equal(stripMarkdown("- ilk\n- ikinci"), "- ilk\n- ikinci");
  });

  test("kod çiti gider, içerik kalır", () => {
    assert.equal(stripMarkdown("```sql\nselect 1\n```"), "select 1");
  });

  test("satır içi kod sadeleşir", () => {
    assert.equal(stripMarkdown("`npm test` çalıştır"), "npm test çalıştır");
  });
});

describe("truncateForWhatsapp", () => {
  test("sınırın altındaki metne dokunulmaz", () => {
    assert.equal(truncateForWhatsapp("kısa", URL), "kısa");
  });

  test("uzun metin kesilir ve sonuç sınırı AŞMAZ", () => {
    const long = "a".repeat(2000);
    const out = truncateForWhatsapp(long, URL);
    assert.ok(out.length <= WHATSAPP_REPLY_LIMIT, `uzunluk ${out.length}`);
    assert.match(out, /Tamamı için: https:\/\/projelio\.app$/);
  });

  test("kelime ortasından kesmez", () => {
    const text = "kelime ".repeat(300);
    const out = truncateForWhatsapp(text, URL);
    const body = out.split("…")[0];
    assert.ok(!body.endsWith("keli"), "kelime ortasından kesilmiş");
  });

  test("tek uzun kelimede de sınır korunur", () => {
    // Boşluk yoksa kelime sınırı zorlanamaz; önemli olan taşmamak.
    const out = truncateForWhatsapp("x".repeat(1500), URL);
    assert.ok(out.length <= WHATSAPP_REPLY_LIMIT);
  });
});

describe("formatForWhatsapp", () => {
  test("önce sadeleştirir sonra keser", () => {
    // Markdown süsleri kesme hesabına dahil olmamalı: sadeleştikten sonra
    // sınırın altına düşen metin kesilmemeli.
    const text = "**" + "a".repeat(WHATSAPP_REPLY_LIMIT - 10) + "**";
    const out = formatForWhatsapp(text, URL);
    assert.ok(!out.includes("Tamamı için"), "gereksiz kesildi");
    assert.ok(!out.includes("*"));
  });
});
