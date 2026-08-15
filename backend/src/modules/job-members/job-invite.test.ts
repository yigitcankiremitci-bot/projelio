// Backend tsconfig'inde esModuleInterop kapalı (NestJS CommonJS derlemesi
// gereği), bu yüzden namespace import kullanılıyor.
import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  canRespondToInvite,
  countsAsTeamMember,
  inviteAnswerNotificationBody,
  inviteNotificationBody,
  reinviteDecision,
} from "./job-invite";

// Hata kaydı: bir kullanıcı işe eklendiğinde ona sorulmuyor, bildirimde kimin
// hangi işe eklediği yazmıyor ve iş anasayfasına hiç düşmüyordu. Bu dosya o
// hatanın bir daha geri gelmemesi için kuralları sabitler.

describe("countsAsTeamMember — kim ekipten sayılır", () => {
  test("yalnızca daveti kabul etmiş kişi ekipten sayılır", () => {
    assert.equal(countsAsTeamMember("approved"), true);
  });

  test("yanıt bekleyen davet ekip üyeliği vermez (iş anasayfada görünmez)", () => {
    assert.equal(countsAsTeamMember("pending"), false);
  });

  test("reddedilmiş davet ekip üyeliği vermez", () => {
    assert.equal(countsAsTeamMember("rejected"), false);
  });

  test("status'ü olmayan eski kayıt üye sayılır — göçte ekipler kopmasın", () => {
    assert.equal(countsAsTeamMember(null), true);
    assert.equal(countsAsTeamMember(undefined), true);
  });
});

describe("canRespondToInvite — daveti kim yanıtlayabilir", () => {
  test("davet edilen kişi yanıtlayabilir", () => {
    assert.equal(canRespondToInvite({ userId: "u1" }, "u1"), true);
  });

  test("başka biri (iş sahibi dahil) onun yerine kabul edemez", () => {
    assert.equal(canRespondToInvite({ userId: "u1" }, "owner"), false);
  });

  test("dahili çağrıda (kullanıcı yok) kontrol atlanır", () => {
    assert.equal(canRespondToInvite({ userId: "u1" }, undefined), true);
  });
});

describe("reinviteDecision — aynı kişi tekrar davet edilirse", () => {
  test("hiç kaydı yoksa yeni davet açılır", () => {
    assert.equal(reinviteDecision(null), "create");
  });

  test("daha önce reddettiyse var olan kayıt yeniden davete döner", () => {
    // UNIQUE (job_id, user_id) yüzünden ikinci satır açılamaz.
    assert.equal(reinviteDecision({ status: "rejected" }), "revive");
  });

  test("yanıt bekleyen davet tazelenir", () => {
    assert.equal(reinviteDecision({ status: "pending" }), "revive");
  });

  test("zaten ekipteyse dokunulmaz — onaylı üye tekrar onaya düşmez", () => {
    assert.equal(reinviteDecision({ status: "approved" }), "already-member");
  });
});

describe("bildirim metinleri", () => {
  test("davet bildiriminde davet eden kişi ve iş adı geçer", () => {
    const body = inviteNotificationBody("Ayşe Yılmaz", "Galata Restorasyon");
    assert.match(body, /Ayşe Yılmaz/);
    assert.match(body, /Galata Restorasyon/);
    assert.match(body, /Kabul ediyor musun\?/);
  });

  test("isim bilinmiyorsa metin yine anlamlı kalır", () => {
    assert.equal(
      inviteNotificationBody(null, null),
      'Bir kullanıcı seni "bir iş" işine ekledi. Kabul ediyor musun?'
    );
  });

  test("iş sahibine giden yanıt bildirimi kabul/ret ayrımını yazar", () => {
    assert.match(inviteAnswerNotificationBody("Can", "Galata", true), /kabul etti/);
    assert.match(inviteAnswerNotificationBody("Can", "Galata", false), /reddetti/);
  });
});
