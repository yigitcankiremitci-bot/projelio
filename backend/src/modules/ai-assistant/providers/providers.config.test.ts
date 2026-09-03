import { test } from "node:test";
// Backend tsconfig'inde esModuleInterop kapalı (NestJS CommonJS derlemesi
// gereği), bu yüzden namespace import kullanılıyor.
import * as assert from "node:assert/strict";
import {
  PROVIDER_CATALOG,
  allModels,
  catalogPricing,
  defaultModelForTier,
  findModel,
  modelOverride,
} from "./providers.config";
import { MODEL_PRICING, getPricing, DEFAULT_PRICING } from "../ai-credits.config";

test("katalogdaki her modelin fiyatı MODEL_PRICING'de var", () => {
  // En pahalı hata sınıfı: fiyatı tanımsız model DEFAULT_PRICING'e (15/75 USD)
  // düşer ve müşteriden gerçeğin 50 katı kredi kesilir.
  for (const { model, provider } of allModels()) {
    const pricing = getPricing(model.id);
    assert.notEqual(
      pricing,
      DEFAULT_PRICING,
      `${provider.id}:${model.id} fiyatı MODEL_PRICING'de yok — varsayılan pahalı tarifeye düşüyor`
    );
    assert.equal(pricing.inputPerMillion, model.price.input);
    assert.equal(pricing.outputPerMillion, model.price.output);
  }
});

test("fiyat tablosu katalogdan besleniyor", () => {
  const fromCatalog = catalogPricing();
  for (const [id, price] of Object.entries(fromCatalog)) {
    assert.deepEqual(MODEL_PRICING[id], price);
  }
});

test("her sağlayıcının her kademede bir varsayılan modeli var", () => {
  for (const provider of PROVIDER_CATALOG) {
    for (const tier of ["fast", "smart", "max"] as const) {
      const model = defaultModelForTier(provider, tier);
      assert.ok(model, `${provider.id} sağlayıcısının "${tier}" kademesi boş`);
      assert.equal(model.tier, tier);
    }
  }
});

test("her sağlayıcının anahtar değişkeni ve gereken taban adresi tanımlı", () => {
  for (const provider of PROVIDER_CATALOG) {
    assert.ok(provider.apiKeyEnv, `${provider.id} için apiKeyEnv yok`);
    // Resmî Anthropic dışındaki her sağlayıcı bir taban adres vermeli; yoksa
    // istek sessizce api.anthropic.com'a giderdi.
    if (provider.id !== "anthropic") {
      assert.ok(provider.baseUrl, `${provider.id} için baseUrl yok`);
      assert.ok(provider.baseUrl.startsWith("https://"), `${provider.id} baseUrl https değil`);
    }
  }
});

test("model kimlikleri sağlayıcı içinde tekrarlanmıyor", () => {
  for (const provider of PROVIDER_CATALOG) {
    const ids = provider.models.map((m) => m.id);
    assert.equal(new Set(ids).size, ids.length, `${provider.id} içinde tekrar eden model kimliği var`);
  }
});

test("findModel yalnızca gerçek sağlayıcı/model çiftini bulur", () => {
  assert.ok(findModel("anthropic", "claude-sonnet-5"));
  assert.equal(findModel("anthropic", "glm-5.3"), undefined);
  assert.equal(findModel("yokboyle", "claude-sonnet-5"), undefined);
});

test("model ezme değişkeni sağlayıcı adındaki noktayı taşımaz", () => {
  const before = process.env.AI_MODEL_ZAI_SMART;
  try {
    process.env.AI_MODEL_ZAI_SMART = "glm-4.7";
    assert.equal(modelOverride("zai", "smart"), "glm-4.7");
    assert.equal(modelOverride("zai", "fast"), undefined);
  } finally {
    if (before === undefined) delete process.env.AI_MODEL_ZAI_SMART;
    else process.env.AI_MODEL_ZAI_SMART = before;
  }
});
