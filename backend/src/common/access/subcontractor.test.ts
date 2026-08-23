// Backend tsconfig'inde esModuleInterop kapalı (NestJS CommonJS derlemesi
// gereği), bu yüzden namespace import kullanılıyor.
import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  isSubcontractorAccount,
  seesAllProjectsOfJob,
  visibleTaskIdsForSubcontractor,
  type ProjectScopeFacts,
} from "./subcontractor";

// Şikayetin tam hali: bir işe taşeron olarak alınan kullanıcı, o işin BÜTÜN
// projelerini görebiliyordu. Kural artık hesap tipine bağlı ve burada sabit.

function facts(over: Partial<ProjectScopeFacts> = {}): ProjectScopeFacts {
  return { isJobOwner: false, isApprovedJobMember: false, isSubcontractor: false, ...over };
}

describe("isSubcontractorAccount", () => {
  test("yalnızca subcontractor hesap tipi taşerondur", () => {
    assert.equal(isSubcontractorAccount("subcontractor"), true);
    for (const t of ["freelancer", "organization_owner", "group_owner", "employee"] as const) {
      assert.equal(isSubcontractorAccount(t), false);
    }
  });

  test("tanımsız hesap tipi taşeron sayılmaz (mevcut kullanıcılar etkilenmesin)", () => {
    assert.equal(isSubcontractorAccount(undefined), false);
    assert.equal(isSubcontractorAccount(null), false);
  });
});

describe("seesAllProjectsOfJob", () => {
  test("iş sahibi tüm projeleri görür", () => {
    assert.equal(seesAllProjectsOfJob(facts({ isJobOwner: true })), true);
  });

  test("onaylı iş ekibi üyesi tüm projeleri görür", () => {
    assert.equal(seesAllProjectsOfJob(facts({ isApprovedJobMember: true })), true);
  });

  test("bekleyen davet yeterli değil", () => {
    assert.equal(seesAllProjectsOfJob(facts()), false);
  });

  test("TAŞERON işe alınmış olsa bile tüm projeleri GÖRMEZ", () => {
    assert.equal(
      seesAllProjectsOfJob(facts({ isApprovedJobMember: true, isSubcontractor: true })),
      false
    );
  });

  test("taşeron işin sahibiyse bile bu yoldan geniş erişim kazanmaz", () => {
    // Kendi işinin sahibiyse projeleri zaten owner_id üzerinden görür; bu
    // fonksiyonun sözü yalnızca "işe bağlı olduğu için hepsini görsün mü".
    assert.equal(seesAllProjectsOfJob(facts({ isJobOwner: true, isSubcontractor: true })), false);
  });

  test("taşeron olmayan hiç kimse kayıpsız kalmaz (regresyon guard'ı)", () => {
    for (const f of [facts({ isJobOwner: true }), facts({ isApprovedJobMember: true })]) {
      assert.equal(seesAllProjectsOfJob(f), true);
    }
  });
});

// Şikayetin tam hali: taşeron, KENDİSİNE ATANMIŞ görevi bile göremiyordu.
// Sebebi, atamanın iki yere birden yazılması ama görünürlüğün yalnızca eski
// tek-atama sütununa bakması: `tasks.assigned_to` sadece BİRİNCİ atananı tutuyor.
describe("visibleTaskIdsForSubcontractor", () => {
  test("çoklu atamada ikinci atanan da kendi görevini görür", () => {
    const gorunur = visibleTaskIdsForSubcontractor(
      [{ id: "t1", assignedTo: "baskasi", assigneeIds: ["baskasi", "taseron"] }],
      "taseron"
    );
    assert.deepEqual([...gorunur], ["t1"]);
  });

  test("eski kayıtlar için tek-atama sütunu hâlâ geçerli", () => {
    const gorunur = visibleTaskIdsForSubcontractor([{ id: "t1", assignedTo: "taseron" }], "taseron");
    assert.deepEqual([...gorunur], ["t1"]);
  });

  test("atanmadığı görevleri görmez", () => {
    const gorunur = visibleTaskIdsForSubcontractor(
      [
        { id: "t1", assignedTo: "baskasi", assigneeIds: ["baskasi"] },
        { id: "t2", assigneeIds: ["taseron"] },
      ],
      "taseron"
    );
    assert.deepEqual([...gorunur], ["t2"]);
  });

  test("alt görevi atanmışsa üst görev de görünür — yoksa liste kopuk görünür", () => {
    const gorunur = visibleTaskIdsForSubcontractor(
      [
        { id: "ust", assigneeIds: ["baskasi"] },
        { id: "alt", assigneeIds: ["taseron"], parentTaskId: "ust" },
      ],
      "taseron"
    );
    assert.deepEqual([...gorunur].sort(), ["alt", "ust"]);
  });

  test("hiç atama yoksa boş küme", () => {
    assert.equal(visibleTaskIdsForSubcontractor([{ id: "t1", assigneeIds: [] }], "taseron").size, 0);
  });
});
