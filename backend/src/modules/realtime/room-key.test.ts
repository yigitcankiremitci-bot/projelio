import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { parseRoomKey } from "./room-key";

describe("oda adı çözümleme", () => {
  it("temel kapsamları tanır", () => {
    assert.deepEqual(parseRoomKey("project:p1"), { type: "project", id: "p1" });
    assert.deepEqual(parseRoomKey("department:d1"), { type: "department", id: "d1" });
    assert.deepEqual(parseRoomKey("job:j1"), { type: "job", id: "j1" });
    assert.deepEqual(parseRoomKey("operation:o1"), { type: "operation", id: "o1" });
    assert.deepEqual(parseRoomKey("organization:org1"), { type: "organization", id: "org1" });
    assert.deepEqual(parseRoomKey("group:g1"), { type: "group", id: "g1" });
  });

  it("alt sayfa eki yetkiyi değiştirmez: kök kapsam okunur", () => {
    // Modül sayfası ayrı bir odadır ama yetki departman üzerinden sorulur.
    assert.deepEqual(parseRoomKey("department:d1/module/crm_musteri"), { type: "department", id: "d1" });
    assert.deepEqual(parseRoomKey("job:j1/module/fm_gelir_gider"), { type: "job", id: "j1" });
  });

  it("bilinmeyen türü reddeder", () => {
    // Aksi halde uydurma bir oda adı yetki kontrolünü atlatabilirdi.
    assert.equal(parseRoomKey("user:u1"), null);
    assert.equal(parseRoomKey("task:t1"), null);
    assert.equal(parseRoomKey("admin:1"), null);
  });

  it("bozuk adları reddeder", () => {
    assert.equal(parseRoomKey(""), null);
    assert.equal(parseRoomKey("project"), null);
    assert.equal(parseRoomKey("project:"), null);
    assert.equal(parseRoomKey("project:   "), null);
    assert.equal(parseRoomKey(":p1"), null);
    assert.equal(parseRoomKey("/module/x"), null);
  });

  it("id içinde iki nokta varsa ilkinden sonrası id sayılır", () => {
    assert.deepEqual(parseRoomKey("project:a:b"), { type: "project", id: "a:b" });
  });
});
