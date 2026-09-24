// Backend tsconfig'inde esModuleInterop kapalı, bu yüzden namespace import.
import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { AI_TOOLS } from "./ai-assistant.tools";
import { GOOGLE_TAKVIM_ARACLARI, GOOGLE_VERISI_SAGLAYICILARI, takvimVerisiIceriyor } from "./google-veri-siniri";
import { PROVIDER_CATALOG } from "./providers/providers.config";

// Bu dosyadaki bir gevşeme, gizlilik politikasının §7'sindeki "takvim verisi
// yalnızca Anthropic'e gider" taahhüdünün sessizce bozulması demek.

describe("takvimVerisiIceriyor", () => {
  test("takvim aracı çağrılmış konuşma yakalanır", () => {
    assert.equal(
      takvimVerisiIceriyor([
        { content: "yarın ne var?" },
        { content: [{ type: "text", text: "bakıyorum" }, { type: "tool_use", name: "list_calendar_events" }] },
        { content: [{ type: "tool_result", content: "…" }] },
      ]),
      true
    );
  });

  test("takvimsiz konuşma serbest", () => {
    assert.equal(
      takvimVerisiIceriyor([
        { content: "görevlerimi listele" },
        { content: [{ type: "tool_use", name: "list_tasks" }] },
      ]),
      false
    );
  });
});

describe("liste tutarlılığı", () => {
  test("Google Takvim araçlarının hepsi sınırın içinde", () => {
    // Yeni bir takvim aracı eklenip bu listeye yazılmazsa, çıktısı yedek
    // sağlayıcıya gidebilir. Ad kalıbı yakalamak için yeterince belirgin.
    const takvimAraclari = AI_TOOLS.map((t) => t.name).filter((n) => /calendar/.test(n));
    for (const ad of takvimAraclari) assert.ok(GOOGLE_TAKVIM_ARACLARI.has(ad), `sınır dışında: ${ad}`);
    for (const ad of GOOGLE_TAKVIM_ARACLARI) assert.ok(takvimAraclari.includes(ad), `AI_TOOLS'ta yok: ${ad}`);
  });

  test("izinli sağlayıcılar katalogda var ve yalnızca Anthropic", () => {
    assert.deepEqual([...GOOGLE_VERISI_SAGLAYICILARI], ["anthropic"]);
    for (const id of GOOGLE_VERISI_SAGLAYICILARI) {
      assert.ok(PROVIDER_CATALOG.some((p) => p.id === id), `katalogda yok: ${id}`);
    }
  });
});
