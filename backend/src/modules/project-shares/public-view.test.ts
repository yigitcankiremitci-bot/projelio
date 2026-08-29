// Backend tsconfig'inde esModuleInterop kapalı (NestJS CommonJS derlemesi
// gereği), bu yüzden namespace import kullanılıyor.
import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mapPublicTasks } from "./public-view";
import type { ProjectShareVisibility } from "@projelio/shared";

// Bu dosyadaki testler "görünüyor mu"yu değil, GÖRÜNMEMESİ GEREKENİN
// görünmediğini sabitliyor. Paylaşım linkini açan kişinin hesabı yok; buradan
// çıkan her alan internete çıkmış demektir.

const kapali: ProjectShareVisibility = {
  tasks: true,
  outputs: false,
  team: false,
  feed: false,
  files: false,
  budget: false,
};

const row = {
  id: "t1",
  title: "Zemin betonu",
  status: "in_progress",
  start_date: "2026-08-01",
  deadline: "2026-08-20",
  completed_at: null,
  output_id: "o1",
  assigned_to: "user-uuid",
  assigned_user: { full_name: "Ayşe Yılmaz" },
};

describe("paylaşılan görev satırı", () => {
  test("ekip kapalıyken atanan adı GİTMEZ", () => {
    const [task] = mapPublicTasks([row], kapali);
    assert.equal(task.assigneeName, undefined);
  });

  test("ekip açıkken atanan adı gider", () => {
    const [task] = mapPublicTasks([row], { ...kapali, team: true });
    assert.equal(task.assigneeName, "Ayşe Yılmaz");
  });

  test("kullanıcı kimliği hiçbir koşulda gitmez", () => {
    for (const team of [true, false]) {
      const [task] = mapPublicTasks([row], { ...kapali, team });
      assert.equal("assignedTo" in task, false);
      assert.equal(JSON.stringify(task).includes("user-uuid"), false);
    }
  });

  test("yanıtta yalnızca beklenen alanlar var", () => {
    // Sorguya ileride bir sütun eklenirse (ör. bütçe, açıklama) sessizce
    // dışarı çıkmasın: alan listesi burada sabit.
    const [task] = mapPublicTasks([{ ...row, budget: 5000, description: "iç not" }], kapali);
    assert.deepEqual(Object.keys(task).sort(), [
      "assigneeName",
      "completedAt",
      "deadline",
      "id",
      "outputId",
      "startDate",
      "status",
      "title",
    ]);
    assert.equal(JSON.stringify(task).includes("iç not"), false);
  });

  test("boş liste boş kalır", () => {
    assert.deepEqual(mapPublicTasks([], kapali), []);
  });
});
