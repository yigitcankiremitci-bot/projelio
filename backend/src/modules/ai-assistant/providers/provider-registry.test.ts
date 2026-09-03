import { test } from "node:test";
// Backend tsconfig'inde esModuleInterop kapalı (NestJS CommonJS derlemesi
// gereği), bu yüzden namespace import kullanılıyor.
import * as assert from "node:assert/strict";
import { LlmProviderRegistry } from "./provider-registry";

/** Testler ortam değişkenlerine bakıyor; her testten sonra eski hâle döndürülür. */
function withEnv(vars: Record<string, string | undefined>, run: () => void) {
  const before: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) before[key] = process.env[key];
  try {
    for (const [key, value] of Object.entries(vars)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    run();
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("anahtarı olmayan sağlayıcı listede olsa bile aday değildir", () => {
  withEnv(
    { AI_PROVIDERS: "zai,anthropic", ZAI_API_KEY: undefined, ANTHROPIC_API_KEY: "sk-test" },
    () => {
      const registry = new LlmProviderRegistry();
      const candidates = registry.candidatesForTier("smart");
      assert.equal(candidates.length, 1);
      assert.equal(candidates[0].definition.id, "anthropic");
    }
  );
});

test("sıra AI_PROVIDERS'a göre kurulur", () => {
  withEnv({ AI_PROVIDERS: "zai,anthropic", ZAI_API_KEY: "k", ANTHROPIC_API_KEY: "sk-test" }, () => {
    const registry = new LlmProviderRegistry();
    const ids = registry.candidatesForTier("smart").map((c) => c.definition.id);
    assert.deepEqual(ids, ["zai", "anthropic"]);
    assert.equal(registry.primaryForTier("smart")?.definition.id, "zai");
  });
});

test("kullanıcının seçtiği model en başa geçer, kademe adayları yedekte kalır", () => {
  withEnv({ AI_PROVIDERS: "anthropic,zai", ZAI_API_KEY: "k", ANTHROPIC_API_KEY: "sk-test" }, () => {
    const registry = new LlmProviderRegistry();
    const candidates = registry.candidatesForTier("fast", "zai:glm-5.3");

    assert.equal(candidates[0].definition.id, "zai");
    assert.equal(candidates[0].model, "glm-5.3");
    // Seçilen model düşerse iş durmasın: kademenin normal adayları sırada.
    assert.ok(candidates.length > 1);
  });
});

test("kapalı sağlayıcının modeli seçilemez, kademeye düşülür", () => {
  withEnv({ AI_PROVIDERS: "anthropic", ZAI_API_KEY: "k", ANTHROPIC_API_KEY: "sk-test" }, () => {
    const registry = new LlmProviderRegistry();
    assert.equal(registry.normalizeModelChoice("zai:glm-5.3"), null);
    assert.equal(registry.candidatesForTier("fast", "zai:glm-5.3")[0].definition.id, "anthropic");
  });
});

test("bozuk model seçimi yok sayılır (asistan durmaz)", () => {
  withEnv({ AI_PROVIDERS: "anthropic", ANTHROPIC_API_KEY: "sk-test" }, () => {
    const registry = new LlmProviderRegistry();
    for (const bad of ["", "   ", "saglayicisiz", "anthropic:yokboyle", "yokboyle:model"]) {
      assert.equal(registry.normalizeModelChoice(bad), null, `"${bad}" null dönmeliydi`);
    }
    assert.equal(registry.normalizeModelChoice("anthropic:claude-sonnet-5"), "anthropic:claude-sonnet-5");
  });
});

test("availableModels yalnızca etkin sağlayıcıları listeler", () => {
  withEnv({ AI_PROVIDERS: "anthropic", ZAI_API_KEY: "k", ANTHROPIC_API_KEY: "sk-test" }, () => {
    const registry = new LlmProviderRegistry();
    const providerIds = new Set(registry.availableModels().map((m) => m.providerId));
    assert.deepEqual([...providerIds], ["anthropic"]);
  });
});

test("hiçbir sağlayıcı yapılandırılmamışsa anlamlı hata verir", async () => {
  await withEnvAsync({ AI_PROVIDERS: "anthropic", ANTHROPIC_API_KEY: undefined }, async () => {
    const registry = new LlmProviderRegistry();
    assert.equal(registry.candidatesForTier("fast").length, 0);
    await assert.rejects(
      () => registry.send("fast", () => ({ model: "x", max_tokens: 8, messages: [] })),
      /yapılandırılmış sağlayıcı yok/
    );
  });
});

async function withEnvAsync(vars: Record<string, string | undefined>, run: () => Promise<void>) {
  const before: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) before[key] = process.env[key];
  try {
    for (const [key, value] of Object.entries(vars)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await run();
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
