import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { BILGI_KARTI_YETKISI_YOK, bilgiKartiYetkisiKarari, type BilgiKartiErisimGercekleri } from "./bilgi-karti-erisim";

// Kartta şirketin resmî kimliği duruyor: vergi numarası, MERSİS, IBAN, imza
// sirküleri. Buradaki bir gerileme "görmemesi gereken gördü" ya da
// "değiştirmemesi gereken değiştirdi" demek.

function g(over: Partial<BilgiKartiErisimGercekleri>): BilgiKartiErisimGercekleri {
  return {
    scopeType: "organization",
    isOwner: false,
    isYonetimManager: false,
    canViewScope: false,
    isSubcontractor: false,
    ...over,
  };
}

describe("bilgiKartiYetkisiKarari", () => {
  test("sahip görür ve düzenler", () => {
    assert.deepEqual(bilgiKartiYetkisiKarari(g({ isOwner: true, canViewScope: true })), {
      canView: true,
      canEdit: true,
    });
  });

  test("Yönetim departmanının yöneticisi sahiple aynı yetkide", () => {
    assert.deepEqual(bilgiKartiYetkisiKarari(g({ isYonetimManager: true, canViewScope: true })), {
      canView: true,
      canEdit: true,
    });
  });

  test("sıradan çalışan görür ama düzenleyemez", () => {
    assert.deepEqual(bilgiKartiYetkisiKarari(g({ canViewScope: true })), { canView: true, canEdit: false });
  });

  test("kapsamı göremeyen kartı da göremez", () => {
    assert.deepEqual(bilgiKartiYetkisiKarari(g({})), BILGI_KARTI_YETKISI_YOK);
  });

  test("taşeron kapsamı görse bile kartı göremez", () => {
    assert.deepEqual(
      bilgiKartiYetkisiKarari(g({ canViewScope: true, isSubcontractor: true })),
      BILGI_KARTI_YETKISI_YOK
    );
  });

  test("taşeronluk sahipliği de ezer — yanlış kurulmuş bir kayıt kapıyı açmasın", () => {
    assert.deepEqual(
      bilgiKartiYetkisiKarari(g({ isOwner: true, isYonetimManager: true, isSubcontractor: true })),
      BILGI_KARTI_YETKISI_YOK
    );
  });
});
