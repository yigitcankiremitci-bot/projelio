import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { BUTCE_YETKISI_YOK, butceYetkisiKarari, viewerKapsamiMi, type ButceErisimGercekleri } from "./butce-erisim";

// Finansal veri bu üründeki en hassas yüzey. Buradaki bir gerileme "şirketin
// defterini görmemesi gereken biri gördü" demek — geri alınamaz bir sızıntı.

function g(over: Partial<ButceErisimGercekleri>): ButceErisimGercekleri {
  return {
    scopeType: "organization",
    isOwner: false,
    isManager: false,
    isExplicitViewer: false,
    explicitCanManage: false,
    isSubcontractor: false,
    ...over,
  };
}

describe("butceYetkisiKarari", () => {
  test("sahip her şeyi yapar", () => {
    assert.deepEqual(butceYetkisiKarari(g({ isOwner: true })), {
      canView: true,
      canManage: true,
      canApprove: true,
      canManageViewers: true,
    });
  });

  test("yönetici sahiple aynı yetkide", () => {
    assert.deepEqual(butceYetkisiKarari(g({ isManager: true })), butceYetkisiKarari(g({ isOwner: true })));
  });

  test("kadroda olmayan hiçbir şey göremez", () => {
    assert.deepEqual(butceYetkisiKarari(g({})), BUTCE_YETKISI_YOK);
  });

  test("elle eklenen kullanıcı okur, yazamaz", () => {
    assert.deepEqual(butceYetkisiKarari(g({ isExplicitViewer: true })), {
      canView: true,
      canManage: false,
      canApprove: false,
      canManageViewers: false,
    });
  });

  test("elle eklenen kullanıcıya yazma verilebilir", () => {
    const y = butceYetkisiKarari(g({ isExplicitViewer: true, explicitCanManage: true }));
    assert.equal(y.canManage, true);
  });

  test("ONAY YETKİSİ elle eklenerek alınamaz — yönetim kararıdır", () => {
    const y = butceYetkisiKarari(g({ isExplicitViewer: true, explicitCanManage: true }));
    assert.equal(y.canApprove, false);
  });

  test("görünürlük verilen kişi listeyi büyütemez", () => {
    const y = butceYetkisiKarari(g({ isExplicitViewer: true, explicitCanManage: true }));
    assert.equal(y.canManageViewers, false);
  });

  test("TAŞERON her şeyden önce gelir: listeye eklenmiş olsa da göremez", () => {
    assert.deepEqual(
      butceYetkisiKarari(g({ isSubcontractor: true, isExplicitViewer: true, explicitCanManage: true })),
      BUTCE_YETKISI_YOK
    );
  });

  test("taşeron yönetici bile olsa göremez", () => {
    assert.deepEqual(butceYetkisiKarari(g({ isSubcontractor: true, isManager: true })), BUTCE_YETKISI_YOK);
  });
});

describe("viewerKapsamiMi", () => {
  test("tanınan kademeler", () => {
    for (const k of ["job", "department", "organization", "group"]) {
      assert.equal(viewerKapsamiMi(k), true, k);
    }
  });

  test("proje ve rutin bilerek dışarıda — projede can_view_budget zaten var", () => {
    assert.equal(viewerKapsamiMi("project"), false);
    assert.equal(viewerKapsamiMi("operation"), false);
  });

  test("uydurma değerler reddedilir", () => {
    assert.equal(viewerKapsamiMi("holding"), false);
    assert.equal(viewerKapsamiMi(""), false);
    assert.equal(viewerKapsamiMi(null), false);
    assert.equal(viewerKapsamiMi(42), false);
  });
});
