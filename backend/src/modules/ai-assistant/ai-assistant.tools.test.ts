// Backend tsconfig'inde esModuleInterop kapalı (NestJS CommonJS derlemesi
// gereği), bu yüzden namespace import kullanılıyor.
import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { AI_TOOLS, CRITICAL_TOOLS, toolsForChannel, WRITE_TOOLS } from "./ai-assistant.tools";

// WhatsApp kanalının güvenlik sınırı burada sınanıyor. Bu dosyadaki bir
// gevşeme, kullanıcının telefonundan gelen tek bir mesajla onaysız silme
// yapılabilmesi demek: chat() kritik araç görünce onay diyaloğu döndürüyor
// ama WhatsApp'ta o diyaloğu gösterecek ekran yok (bkz. toolsForChannel).

const names = (tools: { name: string }[]): string[] => tools.map((t) => t.name);

describe("toolsForChannel — web", () => {
  test("web setine dokunulmaz", () => {
    assert.deepEqual(names(toolsForChannel("web")), names(AI_TOOLS));
  });

  test("allowWrites web'i etkilemez", () => {
    assert.deepEqual(names(toolsForChannel("web", { allowWrites: false })), names(AI_TOOLS));
  });
});

describe("toolsForChannel — whatsapp", () => {
  test("hiçbir kritik araç yok", () => {
    const found = names(toolsForChannel("whatsapp")).filter((n) => CRITICAL_TOOLS.has(n));
    assert.deepEqual(found, [], `WhatsApp'a kritik araç sızdı: ${found.join(", ")}`);
  });

  test("hiçbir whatsapp_* aracı yok", () => {
    // WhatsApp'tan WhatsApp mesajı göndertmek zincir kurmanın en kolay yolu.
    const found = names(toolsForChannel("whatsapp")).filter((n) => n.startsWith("whatsapp_"));
    assert.deepEqual(found, []);
  });

  test("varsayılan olarak yazma araçları açık", () => {
    const found = names(toolsForChannel("whatsapp"));
    assert.ok(found.includes("create_task"), "create_task varsayılan sette olmalı");
  });

  test("allowWrites:false ile hiçbir yazma aracı kalmaz", () => {
    const found = names(toolsForChannel("whatsapp", { allowWrites: false })).filter((n) =>
      WRITE_TOOLS.has(n)
    );
    assert.deepEqual(found, [], `Yazma izni kapalıyken sızdı: ${found.join(", ")}`);
  });

  test("allowWrites:false okuma araçlarını KALDIRMAZ", () => {
    // Yazma kapalıyken "bütçe raporu çıkar" hâlâ çalışmalı; yoksa ayarın
    // kapatılması özelliği tamamen işlevsiz bırakırdı.
    const found = names(toolsForChannel("whatsapp", { allowWrites: false }));
    for (const readTool of ["list_tasks", "list_budget_transactions", "get_workspace_summary"]) {
      assert.ok(found.includes(readTool), `${readTool} okuma aracı düşmemeli`);
    }
  });
});

describe("liste tutarlılığı", () => {
  test("WRITE_TOOLS ile CRITICAL_TOOLS kesişmez", () => {
    // Bir araç iki listede birden olursa "yazma iznini açtım" diyen kullanıcı
    // farkında olmadan kritik aracı da açmış sanır; oysa kritik olan zaten
    // hiç verilmiyor. Kesişim, listelerden birinin yanlış olduğunun işareti.
    const both = [...WRITE_TOOLS].filter((n) => CRITICAL_TOOLS.has(n));
    assert.deepEqual(both, [], `İki listede birden: ${both.join(", ")}`);
  });

  test("her iki listedeki her ad gerçek bir araca karşılık gelir", () => {
    // Araç yeniden adlandırılırsa liste sessizce boşa düşer: koruma olduğunu
    // sanarız ama araç modele gider.
    const known = new Set(names(AI_TOOLS));
    for (const name of [...CRITICAL_TOOLS, ...WRITE_TOOLS]) {
      assert.ok(known.has(name), `AI_TOOLS içinde yok: ${name}`);
    }
  });
});
