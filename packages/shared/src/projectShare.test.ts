import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  isLikelyEmail,
  isShareLinkActive,
  normalizeShareEmail,
  shareEmailMatches,
  shareLinkClosedReason,
  normalizeShareVisibility,
  taskProgress,
} from "./projectShare";

// Paylaşım linki üyelik gerektirmeyen bir pencere açıyor: buradaki kurallar
// yanlış çalışırsa proje verisi hesabı olmayan kişilere sızar. O yüzden
// testler "çalışıyor mu"dan çok "kapalı kalması gereken kapalı mı" soruyor.

describe("paylaşım görünürlüğü", () => {
  test("verilmeyen bölüm KAPALI kabul edilir", () => {
    // İleride yeni bir bölüm eklendiğinde eski linkler onu göstermeye
    // başlamamalı: sahibi öyle bir seçim yapmadı.
    const v = normalizeShareVisibility({ tasks: true });
    assert.equal(v.tasks, true);
    assert.equal(v.budget, false);
    assert.equal(v.team, false);
    assert.equal(v.files, false);
  });

  test('"true" gibi görünen değerler açmaya yetmez', () => {
    // Gövdeden string/1 gelirse (form serileştirmesi, elle atılmış istek)
    // bölüm açılmamalı — yalnızca gerçek boolean true.
    const v = normalizeShareVisibility({ budget: "true", team: 1, files: {} });
    assert.equal(v.budget, false);
    assert.equal(v.team, false);
    assert.equal(v.files, false);
  });

  test("bozuk girdi çökertmez, her şeyi kapatır", () => {
    for (const input of [null, undefined, "x", 42]) {
      const v = normalizeShareVisibility(input);
      assert.equal(Object.values(v).some(Boolean), false);
    }
  });
});

describe("link ömrü", () => {
  const now = new Date("2026-08-29T12:00:00Z");

  test("süresiz link açık kalır", () => {
    assert.equal(isShareLinkActive({}, now), true);
  });

  test("iptal edilen link, süresi dolmamış olsa bile kapalı", () => {
    assert.equal(
      isShareLinkActive({ revokedAt: "2026-08-28T00:00:00", expiresAt: "2030-01-01T00:00:00" }, now),
      false
    );
  });

  test("süresi dolmuş link kapalı", () => {
    assert.equal(isShareLinkActive({ expiresAt: "2026-08-29T11:59:00" }, now), false);
    assert.equal(isShareLinkActive({ expiresAt: "2026-08-29T12:01:00" }, now), true);
  });

  test("dilimsiz damga UTC okunur — veritabanı timestamp'i böyle geliyor", () => {
    // Sunucudan gelen damgalarda saat dilimi eki yok (bkz. lib/dates.ts).
    // Yerel saat sanılsaydı süre Türkiye'de 3 saat erken/geç dolardı.
    assert.equal(isShareLinkActive({ expiresAt: "2026-08-29T13:00:00" }, now), true);
    assert.equal(isShareLinkActive({ expiresAt: "2026-08-29T13:00:00Z" }, now), true);
  });
});

describe("ilerleme yüzdesi", () => {
  const t = (status: "todo" | "in_progress" | "completed") => ({ status });

  test("tamamlanan / toplam", () => {
    const p = taskProgress([t("completed"), t("completed"), t("in_progress"), t("todo")]);
    assert.equal(p.total, 4);
    assert.equal(p.completed, 2);
    assert.equal(p.inProgress, 1);
    assert.equal(p.todo, 1);
    assert.equal(p.percent, 50);
  });

  test("görev yoksa yüzde YOK — %0 ile karıştırılmasın", () => {
    assert.equal(taskProgress([]).percent, undefined);
    assert.equal(taskProgress([]).total, 0);
  });

  test("yüzde aşağı yuvarlanır: proje olduğundan ileride görünmesin", () => {
    // 2/3 = %66,67 -> 66. Yukarı yuvarlansaydı 3 görevin 2'si biten bir proje
    // takip edene "%67" yerine daha iyimser bir sayı gösterirdi.
    assert.equal(taskProgress([t("completed"), t("completed"), t("todo")]).percent, 66);
    // Hepsi bitmeden %100 görünmemeli.
    assert.equal(taskProgress([t("completed"), t("completed"), t("todo")]).percent !== 100, true);
  });
});

describe("linkin kapanma sebebi", () => {
  test("açık link null döner", () => {
    assert.equal(shareLinkClosedReason({ projectStatus: "active" }), null);
  });

  test("proje tamamlandığında link kapanır", () => {
    // Kullanıcının asıl istediği kural: iş bitince takip penceresi de kapansın.
    assert.equal(shareLinkClosedReason({ projectStatus: "completed" }), "completed");
  });

  test("proje yeniden açılırsa link de açılır", () => {
    // Karar sütunda damgalanmıyor, her okumada yeniden veriliyor.
    assert.equal(shareLinkClosedReason({ projectStatus: "active" }), null);
  });

  test("iptal, süre dolmasının ve tamamlanmanın önüne geçer", () => {
    const reason = shareLinkClosedReason({
      revokedAt: "2026-01-01T00:00:00Z",
      expiresAt: "2020-01-01T00:00:00Z",
      projectStatus: "completed",
    });
    assert.equal(reason, "revoked");
  });

  test("süresi dolmuş link, projesi devam etse de kapalı", () => {
    const now = new Date("2026-06-01T00:00:00Z");
    const reason = shareLinkClosedReason({ expiresAt: "2026-05-01T00:00:00Z", projectStatus: "active" }, now);
    assert.equal(reason, "expired");
  });
});

describe("e-posta kapısı", () => {
  test("beklenen adres yoksa kapı yoktur", () => {
    // Adres girilmemiş linkler eskisi gibi doğrudan açılmalı.
    assert.equal(shareEmailMatches(null, undefined), true);
    assert.equal(shareEmailMatches("", "herhangi@bir.sey"), true);
  });

  test("büyük/küçük harf ve boşluk kapıyı kilitlemez", () => {
    assert.equal(shareEmailMatches("Ahmet@Firma.com", "  ahmet@firma.COM "), true);
  });

  test("yanlış adres geçemez", () => {
    assert.equal(shareEmailMatches("ahmet@firma.com", "mehmet@firma.com"), false);
  });

  test("adres beklenirken boş gönderim geçemez", () => {
    // Kapının en kritik durumu: alan boş bırakılarak atlanamamalı.
    assert.equal(shareEmailMatches("ahmet@firma.com", ""), false);
    assert.equal(shareEmailMatches("ahmet@firma.com", undefined), false);
    assert.equal(shareEmailMatches("ahmet@firma.com", null), false);
  });

  test("normalize edilen değer küçük harfli ve kırpılmış", () => {
    assert.equal(normalizeShareEmail("  Ali@X.CO "), "ali@x.co");
    assert.equal(normalizeShareEmail("   "), undefined);
    assert.equal(normalizeShareEmail(42), undefined);
  });

  test("bariz hatalı adresler reddedilir", () => {
    assert.equal(isLikelyEmail("ahmet@firma.com"), true);
    assert.equal(isLikelyEmail("ahmet"), false);
    assert.equal(isLikelyEmail("ahmet@firma"), false);
    assert.equal(isLikelyEmail("a@b.c d"), false);
    assert.equal(isLikelyEmail("@firma.com"), false);
    assert.equal(isLikelyEmail("a@@b.com"), false);
  });
});
