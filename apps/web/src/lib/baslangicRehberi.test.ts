import { strict as assert } from "node:assert";
import { test } from "node:test";
import { REHBER_AZ_KULLANIM_SANIYE, rehberKendiligindenAcilsinMi, rehberMaddeleri } from "./baslangicRehberi";

const temel = { toplamSaniye: 600, kapatildi: false, buOturumdaAcildi: false, turSuruyor: false, ilkTurGoruldu: true };

test("az kullanmış kişide açılır", () => {
  assert.equal(rehberKendiligindenAcilsinMi(temel), true);
  assert.equal(rehberKendiligindenAcilsinMi({ ...temel, toplamSaniye: 0 }), true);
});

test("uygulamayı kullanmış kişide açılmaz — o '?'ye basınca görür", () => {
  assert.equal(rehberKendiligindenAcilsinMi({ ...temel, toplamSaniye: REHBER_AZ_KULLANIM_SANIYE }), false);
});

test("kapatıldıysa, bu oturumda açıldıysa, tur sürüyorsa ya da ilk tur görülmediyse açılmaz", () => {
  assert.equal(rehberKendiligindenAcilsinMi({ ...temel, kapatildi: true }), false);
  assert.equal(rehberKendiligindenAcilsinMi({ ...temel, buOturumdaAcildi: true }), false);
  assert.equal(rehberKendiligindenAcilsinMi({ ...temel, turSuruyor: true }), false);
  assert.equal(rehberKendiligindenAcilsinMi({ ...temel, ilkTurGoruldu: false }), false);
});

test("süre bilinmiyorsa (yüklenmedi) açılmaz", () => {
  assert.equal(rehberKendiligindenAcilsinMi({ ...temel, toplamSaniye: null }), false);
});

test("her hesap tipinde örnek iş ilk madde; şirket ve taşeron kendi maddelerini alır", () => {
  for (const tip of ["freelancer", "organization_owner", "subcontractor", undefined] as const) {
    assert.equal(rehberMaddeleri(tip)[0].id, "ornek-is");
  }
  assert.ok(rehberMaddeleri("organization_owner").some((m) => m.id === "departmanlar"));
  assert.ok(rehberMaddeleri("subcontractor").some((m) => m.id === "taseron"));
  assert.ok(!rehberMaddeleri("freelancer").some((m) => m.id === "departmanlar"));
});
