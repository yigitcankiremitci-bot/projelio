import { strict as assert } from "node:assert";
import { beforeEach, describe, it } from "node:test";
import {
  clearTaskAttachmentSnapshots,
  getTaskAttachmentSnapshot,
  publishTaskAttachments,
} from "./taskAttachmentEvents";

const link = (id: string) => ({ id, taskId: "t1", kind: "link" as const, url: "https://x/" + id, createdAt: "" });

describe("görev eki defteri", () => {
  beforeEach(clearTaskAttachmentSnapshots);

  it("yayımlanan listeyi görev kimliğine göre saklar", () => {
    publishTaskAttachments("t1", { attachments: [link("a")] });
    assert.equal(getTaskAttachmentSnapshot("t1")?.attachments?.length, 1);
    assert.equal(getTaskAttachmentSnapshot("t2"), undefined);
  });

  // Link ve dosya AYRI panellerden yayımlanıyor; ikincisi birincisini silmemeli.
  it("link ve dosya yayınları birbirini ezmez", () => {
    publishTaskAttachments("t1", { attachments: [link("a")] });
    publishTaskAttachments("t1", { files: [{ id: "f1", name: "Rapor.docx" }] });
    const snap = getTaskAttachmentSnapshot("t1");
    assert.equal(snap?.attachments?.length, 1);
    assert.equal(snap?.files?.length, 1);
  });

  it("boş liste de geçerli bir değer — son ek silinince rozet kalkmalı", () => {
    publishTaskAttachments("t1", { attachments: [link("a")] });
    publishTaskAttachments("t1", { attachments: [] });
    assert.deepEqual(getTaskAttachmentSnapshot("t1")?.attachments, []);
  });

  it("defter sınırsız büyümez", () => {
    for (let i = 0; i < 250; i++) publishTaskAttachments("t" + i, { attachments: [] });
    assert.equal(getTaskAttachmentSnapshot("t0"), undefined, "en eski kayıt düşmeli");
    assert.ok(getTaskAttachmentSnapshot("t249"), "en yeni kayıt durmalı");
  });
});
