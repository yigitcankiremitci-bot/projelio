import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { anahtarGecersizMi, BILDIRIM_KANALI, fcmMesaji } from "./fcm";

describe("fcmMesaji", () => {
  const bildirim = { id: "n1", type: "task_assigned" as any, title: "Yeni görev", body: "Sana bir görev atandı", link: "/tasks/42" };

  it("kapalı uygulamada görünsün diye notification bloğu taşır", () => {
    const m = fcmMesaji("tok", bildirim).message;
    assert.deepEqual(m.notification, { title: "Yeni görev", body: "Sana bir görev atandı" });
    assert.equal(m.token, "tok");
  });

  it("Doze'da bekletilmesin diye yüksek öncelikli ve uygulamanın kanalına gider", () => {
    const a = fcmMesaji("tok", bildirim).message.android;
    assert.equal(a.priority, "HIGH");
    assert.equal(a.notification.channel_id, BILDIRIM_KANALI);
    assert.equal(a.notification.icon, "ic_stat_projelio");
  });

  it("data değerlerinin hepsi string (FCM başka türü reddeder), link yoksa ana sayfa", () => {
    const d = fcmMesaji("tok", { ...bildirim, link: undefined }).message.data;
    assert.equal(d.link, "/");
    for (const v of Object.values(d)) assert.equal(typeof v, "string");
  });
});

describe("anahtarGecersizMi", () => {
  it("UNREGISTERED ve 404 anahtarı geçersiz sayar", () => {
    assert.equal(anahtarGecersizMi(404, { error: { details: [{ errorCode: "UNREGISTERED" }] } }), true);
    assert.equal(anahtarGecersizMi(404, null), true);
    assert.equal(anahtarGecersizMi(403, { error: { details: [{ errorCode: "SENDER_ID_MISMATCH" }] } }), true);
  });

  it("bozuk anahtar 400'ünü siler, mesajdaki başka bir 400'ü silmez", () => {
    assert.equal(
      anahtarGecersizMi(400, { error: { message: "The registration token is not a valid FCM registration token" } }),
      true
    );
    assert.equal(anahtarGecersizMi(400, { error: { message: "Invalid value at 'message.data'" } }), false);
  });

  it("geçici hatalarda anahtar SİLİNMEZ", () => {
    assert.equal(anahtarGecersizMi(429, { error: { details: [{ errorCode: "QUOTA_EXCEEDED" }] } }), false);
    assert.equal(anahtarGecersizMi(503, null), false);
    assert.equal(anahtarGecersizMi(401, null), false);
  });
});
