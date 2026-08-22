// Backend tsconfig'inde esModuleInterop kapalı (NestJS CommonJS derlemesi
// gereği), bu yüzden namespace import kullanılıyor.
import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertConvertToSubtaskAllowed,
  assertConvertToTaskAllowed,
  assertSubtaskMoveRequest,
  assertSubtaskMoveAllowed,
  subtaskScopePatch,
} from "./subtask-move";

test("alt görev taşıma — istek kuralları", async (t) => {
  await t.test("hedef üst görev zorunlu", () => {
    assert.throws(() => assertSubtaskMoveRequest("a", ""), /Hedef üst görev/);
  });

  await t.test("görev kendi altına taşınamaz", () => {
    assert.throws(() => assertSubtaskMoveRequest("a", "a"), /kendi alt görevi/);
  });

  await t.test("geçerli istek geçer", () => {
    assert.doesNotThrow(() => assertSubtaskMoveRequest("a", "b"));
  });
});

test("alt görev taşıma — yapı kuralları", async (t) => {
  await t.test("üst seviye görev sürüklenemez", () => {
    assert.throws(() => assertSubtaskMoveAllowed({ id: "a" }, { id: "b" }), /Yalnızca alt görevler/);
  });

  await t.test("hedef bir alt görevse reddedilir (iki seviye korunur)", () => {
    assert.throws(
      () => assertSubtaskMoveAllowed({ id: "a", parentTaskId: "p" }, { id: "b", parentTaskId: "q" }),
      /alt görevin altına/
    );
  });

  await t.test("alt görev → üst görev geçerli", () => {
    assert.doesNotThrow(() => assertSubtaskMoveAllowed({ id: "a", parentTaskId: "p" }, { id: "b" }));
  });
});

test("alt görev taşıma — kapsam devri", async (t) => {
  await t.test("aynı projedeyse hiçbir alan yazılmaz", () => {
    assert.deepEqual(subtaskScopePatch({ project_id: "p1" }, { project_id: "p1" }), {});
  });

  await t.test("aynı departmandaysa hiçbir alan yazılmaz", () => {
    assert.deepEqual(subtaskScopePatch({ department_id: "d1" }, { department_id: "d1" }), {});
  });

  await t.test("başka projeye taşınınca kapsam devralınır ve çıktı düşer", () => {
    assert.deepEqual(subtaskScopePatch({ project_id: "p1" }, { project_id: "p2" }), {
      project_id: "p2",
      department_id: null,
      output_id: null,
    });
  });

  await t.test("departmandan projeye taşınınca ikisi de yazılır", () => {
    assert.deepEqual(subtaskScopePatch({ department_id: "d1" }, { project_id: "p1" }), {
      project_id: "p1",
      department_id: null,
      output_id: null,
    });
  });

  await t.test("aynı proje içinde departman değişirse çıktı korunur", () => {
    assert.deepEqual(subtaskScopePatch({ project_id: "p1", department_id: "d1" }, { project_id: "p1", department_id: "d2" }), {
      project_id: "p1",
      department_id: "d2",
    });
  });
});

test("görev ↔ alt görev dönüşümü", async (t) => {
  await t.test("görev kendi altına alınamaz", () => {
    assert.throws(
      () => assertConvertToSubtaskAllowed({ id: "a" }, { id: "a" }, false),
      /kendi alt görevi/
    );
  });

  await t.test("zaten alt görev olan tekrar indirilemez", () => {
    assert.throws(
      () => assertConvertToSubtaskAllowed({ id: "a", parentTaskId: "p" }, { id: "b" }, false),
      /zaten bir alt görev/
    );
  });

  await t.test("hedef alt görevse reddedilir (iki seviye korunur)", () => {
    assert.throws(
      () => assertConvertToSubtaskAllowed({ id: "a" }, { id: "b", parentTaskId: "q" }, false),
      /alt görevin altına/
    );
  });

  await t.test("alt görevi olan görev indirilemez", () => {
    assert.throws(
      () => assertConvertToSubtaskAllowed({ id: "a" }, { id: "b" }, true),
      /Alt görevleri olan/
    );
  });

  await t.test("geçerli indirme geçer", () => {
    assert.doesNotThrow(() => assertConvertToSubtaskAllowed({ id: "a" }, { id: "b" }, false));
  });

  await t.test("üst görev zaten üst görevse yükseltilemez", () => {
    assert.throws(() => assertConvertToTaskAllowed({ id: "a" }), /zaten bir üst görev/);
  });

  await t.test("alt görev yükseltilebilir", () => {
    assert.doesNotThrow(() => assertConvertToTaskAllowed({ id: "a", parentTaskId: "p" }));
  });
});
