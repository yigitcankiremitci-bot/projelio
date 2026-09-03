// Backend tsconfig'inde esModuleInterop kapalı (NestJS CommonJS derlemesi
// gereği), bu yüzden namespace import kullanılıyor.
import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { describeCause, isNetworkFailure } from "../common/network-errors";
import { createRetryingFetch } from "./retrying-fetch";

// Geçici ağ hataları kullanıcıya yansımamalı — ama yazma istekleri ASLA
// yeniden denenmemeli: "fetch failed" isteğin sunucuya ulaşmadığını garanti
// etmez, yeniden denemek çift kayıt yaratır.

const noSleep = async () => {};

function networkError(code = "ECONNRESET"): Error {
  const err = new TypeError("fetch failed");
  (err as { cause?: unknown }).cause = Object.assign(new Error("socket hang up"), { code });
  return err;
}

const OK = { ok: true, status: 200 } as Response;

describe("isNetworkFailure", () => {
  test("fetch failed ağ hatasıdır", () => {
    assert.equal(isNetworkFailure(new TypeError("fetch failed")), true);
  });

  test("sarmalanmış hata kodu bulunur", () => {
    assert.equal(isNetworkFailure(networkError("ENOTFOUND")), true);
    assert.equal(isNetworkFailure(networkError("ETIMEDOUT")), true);
    assert.equal(isNetworkFailure(networkError("UND_ERR_CONNECT_TIMEOUT")), true);
  });

  test("kod hatası ağ hatası DEĞİLDİR", () => {
    // Yanlış sınıflandırma tehlikeli: gerçek bir hatayı 503 diye gizlerdik.
    assert.equal(isNetworkFailure(new TypeError("x is not a function")), false);
    assert.equal(isNetworkFailure(new Error("Kayıt bulunamadı")), false);
  });

  test("Error olmayan değerler ağ hatası değildir", () => {
    assert.equal(isNetworkFailure("fetch failed"), false);
    assert.equal(isNetworkFailure(null), false);
    assert.equal(isNetworkFailure(undefined), false);
  });

  test("döngüsel sebep zinciri sonsuz dönmez", () => {
    const a = new Error("a");
    const b = new Error("b");
    (a as { cause?: unknown }).cause = b;
    (b as { cause?: unknown }).cause = a;
    assert.equal(isNetworkFailure(a), false);
  });
});

describe("describeCause", () => {
  test("sebebin kodunu ve mesajını çıkarır", () => {
    const desc = describeCause(networkError("ENOTFOUND"));
    assert.ok(desc?.includes("ENOTFOUND"), desc);
    assert.ok(desc?.includes("socket hang up"), desc);
  });

  test("sebep yoksa undefined döner", () => {
    assert.equal(describeCause(new Error("yalın")), undefined);
    assert.equal(describeCause("metin"), undefined);
  });

  test("AggregateError alt hataları listelenir", () => {
    // IPv4 ve IPv6 denemesi ayrı ayrı başarısız olduğunda böyle görünür.
    const err = new TypeError("fetch failed");
    const agg = Object.assign(new Error("all attempts failed"), {
      errors: [Object.assign(new Error("v4"), { code: "ECONNREFUSED" }), Object.assign(new Error("v6"), { code: "EHOSTUNREACH" })],
    });
    (err as { cause?: unknown }).cause = agg;
    const desc = describeCause(err);
    assert.ok(desc?.includes("ECONNREFUSED"), desc);
    assert.ok(desc?.includes("EHOSTUNREACH"), desc);
  });
});

describe("createRetryingFetch — okuma istekleri", () => {
  test("ilk denemede başarılıysa tekrar çağrılmaz", async () => {
    let calls = 0;
    const f = createRetryingFetch(async () => {
      calls += 1;
      return OK;
    }, { sleep: noSleep });
    await f("https://x/rest/v1/party");
    assert.equal(calls, 1);
  });

  test("geçici hatadan sonra başarılı olur", async () => {
    let calls = 0;
    const f = createRetryingFetch(async () => {
      calls += 1;
      if (calls === 1) throw networkError();
      return OK;
    }, { sleep: noSleep });

    const res = await f("https://x/rest/v1/party");
    assert.equal(res.ok, true);
    assert.equal(calls, 2, "bir kez yeniden denenmeliydi");
  });

  test("sürekli hatada denemeler tükenince hata fırlatır", async () => {
    let calls = 0;
    const f = createRetryingFetch(async () => {
      calls += 1;
      throw networkError();
    }, { sleep: noSleep, maxAttempts: 3 });

    await assert.rejects(() => f("https://x/rest/v1/party"));
    assert.equal(calls, 3);
  });

  test("yeniden deneme geri çağrısı tetiklenir", async () => {
    const denemeler: number[] = [];
    let calls = 0;
    const f = createRetryingFetch(async () => {
      calls += 1;
      if (calls < 3) throw networkError();
      return OK;
    }, { sleep: noSleep, onRetry: (attempt) => denemeler.push(attempt) });

    await f("https://x/rest/v1/party");
    assert.deepEqual(denemeler, [1, 2]);
  });

  test("üstel geri çekilme uygulanır", async () => {
    const beklemeler: number[] = [];
    let calls = 0;
    const f = createRetryingFetch(async () => {
      calls += 1;
      if (calls < 3) throw networkError();
      return OK;
    }, { baseDelayMs: 100, sleep: async (ms) => { beklemeler.push(ms); } });

    await f("https://x/rest/v1/party");
    assert.deepEqual(beklemeler, [100, 200]);
  });

  test("ağ hatası olmayan hata yeniden denenmez", async () => {
    let calls = 0;
    const f = createRetryingFetch(async () => {
      calls += 1;
      throw new TypeError("bozuk kod");
    }, { sleep: noSleep });

    await assert.rejects(() => f("https://x/rest/v1/party"));
    assert.equal(calls, 1, "kod hatası yeniden denenmemeli");
  });
});

describe("createRetryingFetch — yazma istekleri ASLA denenmez", () => {
  // "fetch failed" isteğin sunucuya ulaşmadığını garanti etmez; yanıt dönerken
  // de kopmuş olabilir. Bir POST'u yeniden denemek çift kayıt yaratır.
  for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
    test(`${method} tek denemede bırakılır`, async () => {
      let calls = 0;
      const f = createRetryingFetch(async () => {
        calls += 1;
        throw networkError();
      }, { sleep: noSleep });

      await assert.rejects(() => f("https://x/rest/v1/party", { method }));
      assert.equal(calls, 1, `${method} yeniden denendi — çift kayıt riski`);
    });
  }

  test("method küçük harfle verilse de yakalanır", async () => {
    let calls = 0;
    const f = createRetryingFetch(async () => {
      calls += 1;
      throw networkError();
    }, { sleep: noSleep });

    await assert.rejects(() => f("https://x/rest/v1/party", { method: "post" }));
    assert.equal(calls, 1);
  });

  test("method belirtilmezse GET sayılır ve denenir", async () => {
    let calls = 0;
    const f = createRetryingFetch(async () => {
      calls += 1;
      if (calls === 1) throw networkError();
      return OK;
    }, { sleep: noSleep });

    await f("https://x/rest/v1/party");
    assert.equal(calls, 2);
  });
});

describe("createRetryingFetch — HTTP hataları yeniden denenmez", () => {
  test("500 yanıtı normal yanıttır, tekrar istenmez", async () => {
    // Sunucu yanıt verdi: bu bir ağ hatası değil. Yeniden denemek yükü artırır.
    let calls = 0;
    const f = createRetryingFetch(async () => {
      calls += 1;
      return { ok: false, status: 500 } as Response;
    }, { sleep: noSleep });

    const res = await f("https://x/rest/v1/party");
    assert.equal(res.status, 500);
    assert.equal(calls, 1);
  });
});

describe("createRetryingFetch — zaman aşımı", () => {
  test("asılı kalan okuma isteği kesilir ve yeniden denenir", async () => {
    // Karşı taraf yanıt vermiyor: zaman aşımı olmasaydı istek sonsuza kadar
    // asılı kalır, yeniden deneme mantığı da onunla birlikte kilitlenirdi.
    let calls = 0;
    const f = createRetryingFetch(async (_input: any, init?: any) => {
      calls += 1;
      if (calls === 1) {
        // İlk deneme: yanıt vermeyen sunucu. Yalnızca abort ile sonlanır.
        return await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
      }
      return OK;
    }, { sleep: noSleep, timeoutMs: 10 });

    const res = await f("https://x/rest/v1/party");
    assert.equal(res.ok, true);
    assert.equal(calls, 2);
  });

  test("çağıranın kendi iptali yeniden denenmez", async () => {
    // supabase-js abortSignal() ile isteği iptal edebiliyor. Bu bir ağ hatası
    // değil, kasıtlı vazgeçiştir — yeniden denemek isteneni yapmamak olurdu.
    const controller = new AbortController();
    let calls = 0;
    const f = createRetryingFetch(async () => {
      calls += 1;
      controller.abort();
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    }, { sleep: noSleep });

    await assert.rejects(() => f("https://x/rest/v1/party", { signal: controller.signal } as any));
    assert.equal(calls, 1);
  });

  test("timeoutMs=0 verilirse zaman aşımı uygulanmaz", async () => {
    // Uzun süren tek seferlik işler (ör. büyük dışa aktarım) için kaçış kapısı.
    let seenSignal: unknown = "yok";
    const f = createRetryingFetch(async (_input: any, init?: any) => {
      seenSignal = init?.signal;
      return OK;
    }, { sleep: noSleep, timeoutMs: 0 });

    await f("https://x/rest/v1/party");
    assert.equal(seenSignal, undefined);
  });
});
