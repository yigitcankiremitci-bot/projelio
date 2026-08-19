import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { SocialAccount, SocialPost } from "@projelio/shared";
import {
  PLATFORM_ORDER,
  SOCIAL_PLATFORMS,
  SOCIAL_STATUS,
  STATUS_ORDER,
  accountColor,
  accountLabel,
  captionLength,
  fromDateTimeLocal,
  hashtagCount,
  localDay,
  monthGrid,
  postColor,
  postDay,
  postTime,
  tightestLimit,
  toDateTimeLocal,
} from "./socialMedia";

// Sosyal medya modülünün sözlüğü ve tarih/metin hesapları. Panel, composer ve
// hesap modali aynı yardımcıları kullanıyor; buradaki bir kayma üç ekranda
// birden yanlış sonuç verir.

function account(over: Partial<SocialAccount> = {}): SocialAccount {
  return {
    id: "a1",
    platform: "instagram",
    handle: "projelio",
    provider: "manual",
    connectionStatus: "manual",
    active: true,
    createdAt: "2026-08-01T00:00:00Z",
    ...over,
  };
}

function post(over: Partial<SocialPost> = {}): SocialPost {
  return {
    id: "p1",
    title: "Test",
    contentType: "image",
    status: "draft",
    createdAt: "2026-08-01T00:00:00Z",
    targets: [],
    media: [],
    ...over,
  };
}

describe("sözlük bütünlüğü", () => {
  test("her platformun sırası ve etiketi var", () => {
    assert.equal(PLATFORM_ORDER.length, Object.keys(SOCIAL_PLATFORMS).length);
    for (const p of PLATFORM_ORDER) {
      assert.ok(SOCIAL_PLATFORMS[p]?.label, `${p} etiketsiz`);
      assert.match(SOCIAL_PLATFORMS[p].color, /^#[0-9A-Fa-f]{6}$/);
    }
  });

  test("her durumun sırası, etiketi ve ipucu var", () => {
    assert.equal(STATUS_ORDER.length, Object.keys(SOCIAL_STATUS).length);
    for (const s of STATUS_ORDER) {
      assert.ok(SOCIAL_STATUS[s].label);
      assert.ok(SOCIAL_STATUS[s].hint);
    }
  });
});

describe("hesap gösterimi", () => {
  test("görünen ad varsa o, yoksa @kullanıcı", () => {
    assert.equal(accountLabel(account({ displayName: "Projelio TR" })), "Projelio TR");
    assert.equal(accountLabel(account()), "@projelio");
    // Boşluktan ibaret ad, ad sayılmaz.
    assert.equal(accountLabel(account({ displayName: "   " })), "@projelio");
  });

  test("hesabın kendi rengi platform varsayılanını ezer", () => {
    assert.equal(accountColor(account()), SOCIAL_PLATFORMS.instagram.color);
    assert.equal(accountColor(account({ color: "#123456" })), "#123456");
  });
});

describe("metin sayaçları", () => {
  test("etiketler de karaktere sayılır — aynı gönderide yayımlanıyorlar", () => {
    assert.equal(captionLength("merhaba", "#a #b"), "merhaba #a #b".length);
    assert.equal(captionLength("merhaba"), 7);
    assert.equal(captionLength(undefined, undefined), 0);
  });

  test("en dar kanalın sınırı geçerli", () => {
    // X (280) LinkedIn'den (3000) dar; uyarı ona göre verilmeli.
    assert.equal(tightestLimit(["linkedin", "x"]), 280);
    // Sınırsız kabul edilen kanal tek başınaysa sınır yok.
    assert.equal(tightestLimit(["blog"]), undefined);
    assert.equal(tightestLimit([]), undefined);
  });

  test("etiket sayımı ayraçtan bağımsız", () => {
    assert.equal(hashtagCount("#kahve #istanbul"), 2);
    assert.equal(hashtagCount("#kahve, #istanbul, #sabah"), 3);
    assert.equal(hashtagCount(""), 0);
    assert.equal(hashtagCount(undefined), 0);
  });
});

describe("takvim hesapları", () => {
  test("yerel gün UTC'ye kaymaz", () => {
    // 1 Ağustos 00:30 yerel saat; toISOString UTC+3'te 31 Temmuz'a düşerdi.
    assert.equal(localDay(new Date(2026, 7, 1, 0, 30)), "2026-08-01");
  });

  test("gönderinin günü ve saati yerel okunur", () => {
    const iso = new Date(2026, 7, 12, 19, 5).toISOString();
    assert.equal(postDay(post({ scheduledAt: iso })), "2026-08-12");
    assert.equal(postTime(post({ scheduledAt: iso })), "19:05");
    assert.equal(postDay(post()), undefined);
  });

  test("datetime-local gidiş-dönüşü saati korur", () => {
    const iso = new Date(2026, 7, 12, 19, 5).toISOString();
    assert.equal(toDateTimeLocal(iso), "2026-08-12T19:05");
    assert.equal(fromDateTimeLocal("2026-08-12T19:05"), iso);
    assert.equal(fromDateTimeLocal(""), null);
  });

  test("ay ızgarası pazartesi başlar ve 42 hücredir", () => {
    // Ağustos 2026'nın 1'i cumartesi; ızgara 27 Temmuz pazartesiyle başlamalı.
    const grid = monthGrid(2026, 7);
    assert.equal(grid.length, 42);
    assert.equal(localDay(grid[0]), "2026-07-27");
    assert.equal(grid[0].getDay(), 1);
  });
});

describe("takvim rengi", () => {
  test("ilk hedef hesabın rengi kullanılır", () => {
    const a = account({ id: "acc-1", color: "#ABCDEF" });
    const p = post({
      targets: [{ id: "t1", postId: "p1", accountId: "acc-1", status: "pending" }],
    });
    assert.equal(postColor(p, [a]), "#ABCDEF");
  });

  test("kanalı seçilmemiş içerik nötr kalır", () => {
    assert.equal(postColor(post(), []), "#9AA2B0");
    // Hesap silinmişse de kart renksiz kalmalı, patlamamalı.
    const orphan = post({ targets: [{ id: "t1", postId: "p1", accountId: "yok", status: "pending" }] });
    assert.equal(postColor(orphan, []), "#9AA2B0");
  });
});
