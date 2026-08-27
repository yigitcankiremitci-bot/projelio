import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { uploadScope } from "./uploadScope";

describe("yükleme kapsam anahtarı", () => {
  test("hedef türleri birbirine karışmaz", () => {
    // Aynı kimlik farklı türlerde kullanılabiliyor; önek olmasa bir işin
    // yüklemesi aynı kimlikli projenin listesinde görünürdü.
    const id = "a1";
    assert.notEqual(uploadScope({ jobId: id }), uploadScope({ projectId: id }));
    assert.notEqual(uploadScope({ projectId: id }), uploadScope({ departmentId: id }));
  });

  test("görev/çıktı bağlamı anahtara girer", () => {
    // Girmezse görevin ekleri projenin genel dosya listesinde de belirirdi.
    const proje = { projectId: "p1" };
    assert.notEqual(uploadScope(proje), uploadScope(proje, { taskId: "t1" }));
    assert.notEqual(uploadScope(proje, { taskId: "t1" }), uploadScope(proje, { outputId: "o1" }));
  });

  test("aynı hedef her zaman aynı anahtarı verir", () => {
    // Panel anahtarı useMemo ile üretiyor; kararsız olsaydı satırlar
    // her çizimde kaybolup geri gelirdi.
    assert.equal(uploadScope({ jobId: "j1" }, { taskId: "t1" }), uploadScope({ jobId: "j1" }, { taskId: "t1" }));
  });
});
