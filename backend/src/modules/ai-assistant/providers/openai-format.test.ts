import { test } from "node:test";
// Backend tsconfig'inde esModuleInterop kapalı (NestJS CommonJS derlemesi
// gereği), bu yüzden namespace import kullanılıyor.
import * as assert from "node:assert/strict";
import { messagesToOpenAi, responseFromOpenAi, toolsToOpenAi } from "./openai-format";
import { readProviderOrder } from "./providers.config";

test("araç şeması OpenAI function biçimine çevrilir", () => {
  const out = toolsToOpenAi([
    {
      name: "create_task",
      description: "Görev açar",
      input_schema: { type: "object", properties: { title: { type: "string" } } },
    },
  ] as any);

  assert.equal(out[0].type, "function");
  assert.equal(out[0].function.name, "create_task");
  assert.deepEqual(out[0].function.parameters, {
    type: "object",
    properties: { title: { type: "string" } },
  });
});

test("bloklu sistem promptu tek system mesajına iner", () => {
  const out = messagesToOpenAi([{ role: "user", content: "merhaba" }] as any, [
    { type: "text", text: "statik", cache_control: { type: "ephemeral" } },
    { type: "text", text: "dinamik" },
  ] as any);

  assert.equal(out[0].role, "system");
  assert.equal(out[0].content, "statik\n\ndinamik");
  assert.equal(out[1].content, "merhaba");
});

test("tool_use bloğu assistant.tool_calls'a çevrilir", () => {
  const out = messagesToOpenAi([
    {
      role: "assistant",
      content: [
        { type: "text", text: "Bakıyorum" },
        { type: "tool_use", id: "t1", name: "list_tasks", input: { limit: 5 } },
      ],
    },
  ] as any);

  assert.equal(out[0].role, "assistant");
  assert.equal(out[0].content, "Bakıyorum");
  assert.equal(out[0].tool_calls[0].id, "t1");
  assert.equal(out[0].tool_calls[0].function.name, "list_tasks");
  assert.deepEqual(JSON.parse(out[0].tool_calls[0].function.arguments), { limit: 5 });
});

test("tool_result blokları ayrı tool mesajlarına açılır", () => {
  const out = messagesToOpenAi([
    {
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "t1", content: "3 görev" },
        { type: "text", text: "peki bunlar ne?" },
      ],
    },
  ] as any);

  assert.equal(out[0].role, "tool");
  assert.equal(out[0].tool_call_id, "t1");
  assert.equal(out[0].content, "3 görev");
  assert.equal(out[1].role, "user");
  assert.equal(out[1].content, "peki bunlar ne?");
});

test("araç çağrılı yanıt Anthropic bloklarına geri çevrilir", () => {
  const out = responseFromOpenAi({
    choices: [
      {
        finish_reason: "tool_calls",
        message: {
          content: "Tamam",
          tool_calls: [{ id: "c1", function: { name: "create_task", arguments: '{"title":"X"}' } }],
        },
      },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 20 },
  });

  assert.equal(out.stop_reason, "tool_use");
  assert.equal(out.content[0].type, "text");
  assert.equal((out.content[1] as any).name, "create_task");
  assert.deepEqual((out.content[1] as any).input, { title: "X" });
  assert.equal(out.usage.input_tokens, 100);
  assert.equal(out.usage.output_tokens, 20);
});

test("bozuk araç argümanı JSON'u turu düşürmez", () => {
  const out = responseFromOpenAi({
    choices: [
      {
        finish_reason: "tool_calls",
        message: { content: "", tool_calls: [{ id: "c1", function: { name: "x", arguments: "{bozuk" } }] },
      },
    ],
    usage: {},
  });

  assert.deepEqual((out.content[0] as any).input, {});
});

test("önbellekten okunan token girdiden düşülür (iki kez sayılmasın)", () => {
  const out = responseFromOpenAi({
    choices: [{ finish_reason: "stop", message: { content: "ok" } }],
    usage: { prompt_tokens: 1000, completion_tokens: 10, prompt_tokens_details: { cached_tokens: 400 } },
  });

  assert.equal(out.usage.input_tokens, 600);
  assert.equal(out.usage.cache_read_input_tokens, 400);
});

test("AI_PROVIDERS sırası okunur, bilinmeyen ve tekrar edenler atlanır", () => {
  const before = process.env.AI_PROVIDERS;
  try {
    process.env.AI_PROVIDERS = "zai, anthropic, zai, yokboyle";
    assert.deepEqual(readProviderOrder(), ["zai", "anthropic"]);

    // Tanımsızsa yalnızca Anthropic: yeni sağlayıcı kendiliğinden devreye girmez.
    delete process.env.AI_PROVIDERS;
    assert.deepEqual(readProviderOrder(), ["anthropic"]);

    // Tamamen geçersiz değer asistanı durdurmaz, varsayılana döner.
    process.env.AI_PROVIDERS = "yokboyle,bilinmeyen";
    assert.deepEqual(readProviderOrder(), ["anthropic"]);
  } finally {
    if (before === undefined) delete process.env.AI_PROVIDERS;
    else process.env.AI_PROVIDERS = before;
  }
});
