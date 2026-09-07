import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { Task } from "@projelio/shared";
import { isTaskBlocked } from "./taskDependencies";

function gorev(id: string, extra: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    deadline: "2026-01-01T00:00:00.000Z",
    status: "todo",
    priority: 0,
    budget: 0,
    budgetStatus: "pending",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...extra,
  } as Task;
}

function harita(...gorevler: Task[]): Map<string, Task> {
  return new Map(gorevler.map((g) => [g.id, g]));
}

describe("görev bağımlılıkları", () => {
  it("bağımlılığı olmayan görev engelli değildir", () => {
    const a = gorev("a");
    assert.equal(isTaskBlocked(a, harita(a)), false);
  });

  it("beklenen görev açıksa engellidir", () => {
    const b = gorev("b");
    const a = gorev("a", { dependsOn: ["b"] });
    assert.equal(isTaskBlocked(a, harita(a, b)), true);
  });

  it("beklenen görev tamamlandıysa engel kalkar", () => {
    const b = gorev("b", { status: "completed" });
    const a = gorev("a", { dependsOn: ["b"] });
    assert.equal(isTaskBlocked(a, harita(a, b)), false);
  });

  it("beklenenlerden biri bile açıksa engellidir", () => {
    const b = gorev("b", { status: "completed" });
    const d = gorev("d", { status: "in_progress" });
    const a = gorev("a", { dependsOn: ["b", "d"] });
    assert.equal(isTaskBlocked(a, harita(a, b, d)), true);
  });

  it("tamamlanmış görev engelli sayılmaz — iş çoktan bitmiş", () => {
    const b = gorev("b");
    const a = gorev("a", { dependsOn: ["b"], status: "completed" });
    assert.equal(isTaskBlocked(a, harita(a, b)), false);
  });

  it("elimizde olmayan bir görev engel sayılmaz — uydurma engel gösterme", () => {
    const a = gorev("a", { dependsOn: ["baska-panodaki-gorev"] });
    assert.equal(isTaskBlocked(a, harita(a)), false);
  });

  it("boş dizi 'bağımlılığı yok' demek", () => {
    const a = gorev("a", { dependsOn: [] });
    assert.equal(isTaskBlocked(a, harita(a)), false);
  });
});
