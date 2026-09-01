// Backend tsconfig'inde esModuleInterop kapalı (bkz. ai-modules.test.ts).
import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { taskTarget } from "./ai-task-target";

describe("Görev hedefi (proje mi departman mı)", () => {
  test("proje verilirse projeye açılır", () => {
    assert.deepEqual(taskTarget({ projectId: "p1", title: "x" }), {
      projectId: "p1",
      departmentId: undefined,
    });
  });

  test("departman verilirse departmana açılır", () => {
    assert.deepEqual(taskTarget({ departmentId: "d1" }), {
      projectId: undefined,
      departmentId: "d1",
    });
  });

  test("ikisi birden verilirse reddedilir", () => {
    assert.throws(() => taskTarget({ projectId: "p1", departmentId: "d1" }), /birlikte verilemez/);
  });

  test("hiçbiri verilmezse reddedilir", () => {
    assert.throws(() => taskTarget({ title: "x" }), /nereye açılacağı belirtilmedi/);
  });

  // Model bazen alanı boş dizeyle dolduruyor; bu "verilmedi" sayılmalı, yoksa
  // görev id'si boş bir projeye yazılmaya çalışılır ve hata anlaşılmaz olur.
  test("boş dize verilmemiş sayılır", () => {
    assert.throws(() => taskTarget({ projectId: "" }), /nereye açılacağı belirtilmedi/);
    assert.deepEqual(taskTarget({ projectId: "", departmentId: "d1" }), {
      projectId: undefined,
      departmentId: "d1",
    });
  });
});
