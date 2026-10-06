// Backend tsconfig'inde esModuleInterop kapalı, bu yüzden namespace import.
import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  discoveryAlani,
  discoveryHatasi,
  discoveryOku,
  hashtagButcesi,
  HashtagGecersiz,
  hashtagiTemizle,
  kullanimOku,
} from "./rakip-takibi";

const basliklar = (h: Record<string, string>) => ({ get: (ad: string) => h[ad] ?? null });

describe("rakip takibi", () => {
  test("hashtag temizlenir, geçersiz olan reddedilir", () => {
    assert.equal(hashtagiTemizle("#Müzik Prodüksiyon!"), "müzikprodüksiyon");
    assert.equal(hashtagiTemizle("home_studio"), "home_studio");
    assert.throws(() => hashtagiTemizle("###"), HashtagGecersiz);
    assert.throws(() => hashtagiTemizle("2026"), HashtagGecersiz);
  });

  test("discovery alanına kullanıcı adı güvenli girer", () => {
    assert.match(discoveryAlani("kursat.taydas"), /^business_discovery\.username\(kursat\.taydas\)\{/);
    assert.match(discoveryAlani("x){media}"), /username\(xmedia\)/);
  });

  test("discovery yanıtı okunur; gizli beğeni sayısı bilinmiyor kalır", () => {
    const r = discoveryOku({
      business_discovery: {
        name: "Kürşat",
        followers_count: 1200,
        media_count: 80,
        media: {
          data: [
            { id: "1", like_count: 50, comments_count: 3, timestamp: "2026-10-01T10:00:00+0000", media_product_type: "REELS" },
            { id: "2", comments_count: 1 },
            { caption: "kimliksiz" },
          ],
        },
      },
    });
    assert.equal(r.profil.takipci, 1200);
    assert.equal(r.gonderiler.length, 2);
    assert.equal(r.gonderiler[0].postedAt, "2026-10-01T10:00:00.000Z");
    assert.equal(r.gonderiler[1].likeCount, undefined);
  });

  test("kullanım başlıkları: uygulama ve işletme düzeyi, bekleme süresi", () => {
    const k = kullanimOku(
      basliklar({
        "x-app-usage": '{"call_count":12,"total_time":3,"total_cputime":2}',
        "x-business-use-case-usage":
          '{"123":[{"type":"instagram","call_count":40,"total_time":80,"total_cputime":5,"estimated_time_to_regain_access":0}],"456":[{"call_count":10,"estimated_time_to_regain_access":15}]}',
      })
    );
    assert.deepEqual(k, { callCount: 12, totalTime: 3, totalCputime: 2, isletme: 80, beklemeDk: 15 });
    assert.equal(kullanimOku(basliklar({})), null);
  });

  test("hashtag bütçesi son 7 günde sorgulanan farklı etiketler", () => {
    const simdi = new Date("2026-10-06T12:00:00Z");
    const b = hashtagButcesi(
      [
        { hashtag: "a", son_sorgu: "2026-10-06T05:00:00" },
        { hashtag: "b", son_sorgu: "2026-10-01T12:00:00Z" },
        { hashtag: "c", son_sorgu: "2026-09-20T00:00:00Z" },
        { hashtag: "d", son_sorgu: null },
      ],
      simdi
    );
    assert.equal(b.kullanilan, 2);
    assert.equal(b.sinir, 30);
    assert.equal(b.yenilenme, "2026-10-08T12:00:00.000Z");
  });

  test("discovery hataları anlaşılır cümleye çevrilir", () => {
    assert.match(discoveryHatasi('{"error":{"code":110,"message":"Invalid user id"}}'), /kişisel hesap/);
    assert.match(discoveryHatasi('{"error":{"code":4}}'), /çağrı sınırı/);
    assert.match(discoveryHatasi("<html>"), /reddetti/);
  });
});
