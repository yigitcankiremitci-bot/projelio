import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { backState, hereAsBack, nextBackMemo, resolveBackTarget, type BackTarget } from "./backTarget";

const FALLBACK: BackTarget = { to: "/jobs/abc", label: "Projeler" };

describe("geri hedefi", () => {
  it("geçerli bir from verildiyse onu kullanır", () => {
    const from = { to: "/jobs/abc?tab=tasks", label: "Pist Development" };
    assert.deepEqual(resolveBackTarget(from, FALLBACK), from);
  });

  it("from yoksa sayfanın sabit ebeveynine düşer", () => {
    assert.deepEqual(resolveBackTarget(undefined, FALLBACK), FALLBACK);
    assert.deepEqual(resolveBackTarget(null, FALLBACK), FALLBACK);
  });

  // state'i tarayıcı geçmişi de taşıyor; bozuk değer geri bağlantısını
  // uygulamanın dışına ya da boş bir sayfaya götürmemeli.
  it("bozuk from değerlerini reddeder", () => {
    const bozuk: unknown[] = [
      "…",
      42,
      {},
      { to: "/jobs/abc" },
      { label: "Yalnız etiket" },
      { to: "jobs/abc", label: "Baştaki eğik çizgi yok" },
      { to: "https://baska-site.example/x", label: "Dış adres" },
      { to: "/jobs/abc", label: "" },
      { to: 5, label: "Sayı" },
    ];
    for (const value of bozuk) {
      assert.deepEqual(resolveBackTarget(value, FALLBACK), FALLBACK, JSON.stringify(value));
    }
  });

  // Proje sayfası açılışta state'i düşürüyor (setSearchParams replace +
  // history.replaceState); hedef ilk görüldüğünde yakalanmazsa kayboluyor.
  describe("state silinince hatırlama", () => {
    const from: BackTarget = { to: "/jobs/abc?tab=tasks", label: "Pist Development" };

    it("ilk render'da yakalar, sonraki render'larda state boş olsa da tutar", () => {
      let memo = nextBackMemo(null, "/projects/p1", from);
      assert.deepEqual(memo?.from, from);
      memo = nextBackMemo(memo, "/projects/p1", undefined);
      assert.deepEqual(memo?.from, from, "aynı adreste hatıra korunmalı");
      memo = nextBackMemo(memo, "/projects/p1", null);
      assert.deepEqual(memo?.from, from);
    });

    it("başka bir kayda geçilince hatırayı düşürür", () => {
      const memo = nextBackMemo(null, "/departments/d1", from);
      assert.equal(nextBackMemo(memo, "/departments/d2", undefined), null);
    });

    it("yeni bir from gelirse eskisinin yerine geçer", () => {
      const memo = nextBackMemo(null, "/projects/p1", from);
      const yeni: BackTarget = { to: "/tasks", label: "Yapılacaklar" };
      assert.deepEqual(nextBackMemo(memo, "/projects/p1", yeni)?.from, yeni);
    });

    it("bozuk from hatırayı bozmaz", () => {
      const memo = nextBackMemo(null, "/projects/p1", from);
      assert.deepEqual(nextBackMemo(memo, "/projects/p1", { to: "http://x", label: "Dış" })?.from, from);
    });
  });

  describe("bulunulan sayfayı geri hedefi yapmak", () => {
    it("adı bilinen sayfayı sorgusuyla birlikte paketler", () => {
      assert.deepEqual(hereAsBack("/tasks", ""), { to: "/tasks", label: "Yapılacaklar" });
      assert.deepEqual(hereAsBack("/", "?tab=budget"), { to: "/?tab=budget", label: "Kasa" });
      assert.deepEqual(hereAsBack("/", ""), { to: "/", label: "Ana Sayfa" });
    });

    it("adı bilinmeyen sayfada null döner — sabit ebeveyn devrede kalsın", () => {
      assert.equal(hereAsBack("/jobs/abc", ""), null);
      assert.equal(hereAsBack("/departments/d1", "?tab=tasks"), null);
    });

    it("anasayfanın tanınmayan sekmesi yine anasayfa sayılır", () => {
      assert.deepEqual(hereAsBack("/", "?tab=jobs"), { to: "/?tab=jobs", label: "Ana Sayfa" });
    });
  });

  it("backState navigate'e verilecek şekli üretir", () => {
    const from: BackTarget = { to: "/tasks", label: "Yapılacaklar" };
    assert.deepEqual(backState(from), { from });
  });
});
