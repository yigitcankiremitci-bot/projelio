import { test } from "node:test";
// Backend tsconfig'inde esModuleInterop kapalı (NestJS CommonJS derlemesi
// gereği), bu yüzden namespace import kullanılıyor.
import * as assert from "node:assert/strict";
import { AiModelSettingsService } from "./ai-model-settings.service";

/**
 * Sahte Supabase: yalnızca bu servisin kullandığı iki çağrıyı taklit eder.
 * Gerçek veritabanına gitmeden doğrulama ve yedeğe düşme davranışı test edilir.
 */
function fakeSupabase(opts: { modelRows?: any[]; defaultTier?: string; fail?: boolean } = {}) {
  const yazilan: any[] = [];
  const client = {
    from(table: string) {
      if (opts.fail) {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: "tablo yok" } }) }),
            then: undefined,
          }),
          upsert: async () => ({ error: { message: "tablo yok" } }),
        } as any;
      }
      if (table === "ai_model_settings") {
        const result = { data: opts.modelRows ?? [], error: null };
        return {
          select: async () => result,
          upsert: async (row: any) => {
            yazilan.push(row);
            return { error: null };
          },
        } as any;
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { default_tier: opts.defaultTier ?? "fast" }, error: null }),
          }),
        }),
        upsert: async (row: any) => {
          yazilan.push(row);
          return { error: null };
        },
      } as any;
    },
  };
  return { supabase: { client } as any, yazilan };
}

test("katalogda olmayan model reddedilir", async () => {
  // En pahalı hata: geçersiz model kaydedilirse asistan HER istekte sağlayıcıdan
  // 404 alır ve sebebi panelde görünmez.
  const { supabase } = fakeSupabase();
  const svc = new AiModelSettingsService(supabase);

  for (const kotu of ["anthropic:yokboyle", "yokboyle:model", "saglayicisiz", "::"]) {
    await assert.rejects(() => svc.setTierModel("fast", kotu, "admin-1"), /katalogda yok|Geçersiz/i);
  }
});

test("geçerli model kaydedilir", async () => {
  const { supabase, yazilan } = fakeSupabase();
  const svc = new AiModelSettingsService(supabase);

  await svc.setTierModel("smart", "anthropic:claude-sonnet-5", "admin-1");
  assert.equal(yazilan[0].tier, "smart");
  assert.equal(yazilan[0].model_key, "anthropic:claude-sonnet-5");
  assert.equal(yazilan[0].updated_by, "admin-1");
});

test("boş değer varsayılana döndürür (null yazılır)", async () => {
  const { supabase, yazilan } = fakeSupabase();
  const svc = new AiModelSettingsService(supabase);

  await svc.setTierModel("fast", "   ", "admin-1");
  assert.equal(yazilan[0].model_key, null);
});

test("geçersiz kademe reddedilir", async () => {
  const { supabase } = fakeSupabase();
  const svc = new AiModelSettingsService(supabase);

  await assert.rejects(() => svc.setTierModel("yokboyle" as any, null, "admin-1"), /Geçersiz kademe/);
  await assert.rejects(() => svc.setDefaultTier("yokboyle" as any, "admin-1"), /Geçersiz kademe/);
});

test("tablo okunamazsa asistan durmaz, kod varsayılanına düşer", async () => {
  // Migration uygulanmadan önce tablolar yok. Bu durumda hata fırlatmak
  // Lio'yu tamamen durdururdu; eski davranışa düşmek doğru olan.
  const { supabase } = fakeSupabase({ fail: true });
  const svc = new AiModelSettingsService(supabase);

  const settings = await svc.get();
  assert.equal(settings.defaultTier, "fast");
  assert.deepEqual(
    settings.tiers.map((t) => t.modelKey),
    [null, null, null]
  );
});

test("kayıtlı ayarlar okunur", async () => {
  const { supabase } = fakeSupabase({
    modelRows: [{ tier: "smart", model_key: "zai:glm-5.3", updated_at: "2026-09-04T00:00:00Z" }],
    defaultTier: "smart",
  });
  const svc = new AiModelSettingsService(supabase);

  assert.equal(await svc.defaultTier(), "smart");
  assert.equal(await svc.modelKeyForTier("smart"), "zai:glm-5.3");
  // Kaydı olmayan kademe null döner: kod varsayılanı geçerli.
  assert.equal(await svc.modelKeyForTier("max"), null);
});

test("bilinmeyen varsayılan kademe fast'e düşer", async () => {
  const { supabase } = fakeSupabase({ defaultTier: "bozuk" });
  const svc = new AiModelSettingsService(supabase);
  assert.equal(await svc.defaultTier(), "fast");
});

test("kaydetme sonrası önbellek düşer (yeni değer hemen okunur)", async () => {
  const { supabase } = fakeSupabase({ defaultTier: "fast" });
  const svc = new AiModelSettingsService(supabase);

  await svc.get(); // önbelleği doldur
  svc.invalidate();
  // invalidate sonrası tekrar okunabilmeli (hata fırlatmamalı)
  assert.equal((await svc.get()).defaultTier, "fast");
});
