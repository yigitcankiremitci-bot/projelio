import type Anthropic from "@anthropic-ai/sdk";

// Kullanıcının onayı olmadan ASLA doğrudan çalıştırılmaması gereken araçlar.
// (Silme, arşivleme ve bütçe/para hareketi gibi geri alınması zor işlemler.)
export const CRITICAL_TOOLS = new Set<string>([
  "delete_task",
  "archive_task",
  "delete_project",
  "archive_project",
  "delete_job",
  "archive_job",
  "add_budget_transaction",
]);

export const AI_TOOLS: Anthropic.Tool[] = [
  // --- Okuma araçları -------------------------------------------------
  {
    name: "list_jobs",
    description: "Kullanıcının erişebildiği tüm işleri (job) listeler. Bir işin altında birden çok proje olabilir.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "list_projects",
    description:
      "Kullanıcının erişebildiği projeleri listeler. jobId verilirse yalnızca o işe ait projeler döner.",
    input_schema: {
      type: "object",
      properties: { jobId: { type: "string", description: "Opsiyonel: belirli bir işin projelerini filtrelemek için." } },
      required: [],
    },
  },
  {
    name: "get_project",
    description: "Tek bir projenin detaylarını getirir (bütçe, tarihler, durum vb.).",
    input_schema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
    },
  },
  {
    name: "list_tasks",
    description: "Bir projedeki (arşivlenmemiş) görevleri listeler.",
    input_schema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
    },
  },
  {
    name: "list_budget_transactions",
    description: "Bir projenin bütçe hareketlerini (gelir/gider/ödeme) ve kalan marjı listeler. Yalnızca proje sahibi kullanabilir.",
    input_schema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
    },
  },
  {
    name: "list_project_members",
    description:
      "Bir projenin ekibini listeler (isim, kullanıcı adı, rol, id). Bir göreve kişi atamadan önce doğru kullanıcı id'sini bulmak için kullan.",
    input_schema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
    },
  },
  {
    name: "search_tasks",
    description:
      "Kullanıcının erişebildiği tüm projelerde görev arar. Duruma, atanan kişiye, gecikmişliğe veya tarih aralığına göre filtreler. " +
      "\"Bu hafta neler var\", \"geciken işlerim\", \"bana atanmış görevler\" gibi sorular için bunu kullan.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Görev başlığında aranacak metin (opsiyonel)." },
        projectId: { type: "string", description: "Yalnızca belirli bir projede ara (opsiyonel)." },
        status: { type: "string", enum: ["todo", "in_progress", "completed"] },
        assignedToMe: { type: "boolean", description: "Yalnızca kullanıcıya atanmış görevler." },
        overdue: { type: "boolean", description: "Yalnızca teslim tarihi geçmiş ve tamamlanmamış görevler." },
        dueBefore: { type: "string", description: "Bu tarihten önce teslim edilecekler (YYYY-MM-DD)." },
        dueAfter: { type: "string", description: "Bu tarihten sonra teslim edilecekler (YYYY-MM-DD)." },
        limit: { type: "number", description: "En fazla kaç sonuç (varsayılan 25)." },
      },
      required: [],
    },
  },
  {
    name: "get_workspace_summary",
    description:
      "Kullanıcının genel durumunu özetler: aktif proje sayısı, geciken görevler, bu hafta teslim edilecekler, kendisine atanmış açık işler. " +
      "\"Durumum ne\", \"neler yapmam lazım\", \"özet ver\" gibi sorular için kullan.",
    input_schema: { type: "object", properties: {}, required: [] },
  },

  // --- Job (iş) yazma araçları -----------------------------------------
  {
    name: "create_job",
    description: "Yeni bir iş (job) oluşturur. Oluşturan kullanıcı otomatik olarak iş sahibi olur.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
      },
      required: ["title"],
    },
  },
  {
    name: "update_job",
    description: "Bir işin başlığını/açıklamasını günceller. Yalnızca iş sahibi yapabilir.",
    input_schema: {
      type: "object",
      properties: {
        jobId: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
      },
      required: ["jobId"],
    },
  },
  {
    name: "archive_job",
    description: "Bir işi arşivler (geri alınabilir ama kritik bir işlemdir, onay gerekir). Yalnızca iş sahibi yapabilir.",
    input_schema: { type: "object", properties: { jobId: { type: "string" } }, required: ["jobId"] },
  },
  {
    name: "delete_job",
    description: "Bir işi KALICI olarak siler. Geri alınamaz, onay gerekir. Yalnızca iş sahibi yapabilir.",
    input_schema: { type: "object", properties: { jobId: { type: "string" } }, required: ["jobId"] },
  },

  // --- Proje yazma araçları ---------------------------------------------
  {
    name: "create_project",
    description: "Bir işin altında yeni proje oluşturur. Kullanıcı yalnızca kendi sahibi olduğu bir işin altında proje açabilir.",
    input_schema: {
      type: "object",
      properties: {
        jobId: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        totalBudget: { type: "number" },
        startDate: { type: "string", description: "YYYY-MM-DD" },
        deadline: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["jobId", "title", "deadline"],
    },
  },
  {
    name: "update_project",
    description: "Bir projenin başlık/açıklama/bütçe/tarih/durum bilgilerini günceller. Yalnızca proje veya iş sahibi yapabilir.",
    input_schema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        totalBudget: { type: "number" },
        startDate: { type: "string", description: "YYYY-MM-DD" },
        deadline: { type: "string", description: "YYYY-MM-DD" },
        status: { type: "string", enum: ["active", "completed", "archived"] },
      },
      required: ["projectId"],
    },
  },
  {
    name: "archive_project",
    description: "Bir projeyi arşivler. Kritik bir işlemdir, onay gerekir. Yalnızca proje veya iş sahibi yapabilir.",
    input_schema: { type: "object", properties: { projectId: { type: "string" } }, required: ["projectId"] },
  },
  {
    name: "delete_project",
    description: "Bir projeyi KALICI olarak siler. Geri alınamaz, onay gerekir. Yalnızca proje veya iş sahibi yapabilir.",
    input_schema: { type: "object", properties: { projectId: { type: "string" } }, required: ["projectId"] },
  },

  // --- Görev yazma araçları -----------------------------------------------
  {
    name: "create_task",
    description: "Bir projede yeni görev (veya parentTaskId verilirse alt görev) oluşturur.",
    input_schema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        deadline: { type: "string", description: "ISO tarih/saat" },
        startDate: { type: "string", description: "ISO tarih/saat" },
        assignedTo: { type: "string", description: "Atanacak kullanıcının id'si (opsiyonel)" },
        budget: { type: "number" },
        parentTaskId: { type: "string", description: "Alt görev oluşturmak için üst görev id'si (opsiyonel)" },
      },
      required: ["projectId", "title", "deadline"],
    },
  },
  {
    name: "update_task",
    description: "Bir görevin başlık/açıklama/tarih/atanan kişi/bütçe bilgilerini günceller.",
    input_schema: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        deadline: { type: "string" },
        startDate: { type: "string" },
        assignedTo: { type: "string" },
        budget: { type: "number" },
      },
      required: ["taskId"],
    },
  },
  {
    name: "update_task_status",
    description: "Bir görevin durumunu değiştirir (todo / in_progress / completed).",
    input_schema: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        status: { type: "string", enum: ["todo", "in_progress", "completed"] },
      },
      required: ["taskId", "status"],
    },
  },
  {
    name: "archive_task",
    description: "Bir görevi arşivler. Kritik bir işlemdir, onay gerekir. Yalnızca proje sahibi yapabilir.",
    input_schema: { type: "object", properties: { taskId: { type: "string" } }, required: ["taskId"] },
  },
  {
    name: "delete_task",
    description: "Bir görevi KALICI olarak siler. Geri alınamaz, onay gerekir. Yalnızca proje sahibi yapabilir.",
    input_schema: { type: "object", properties: { taskId: { type: "string" } }, required: ["taskId"] },
  },

  // --- Bütçe yazma aracı ---------------------------------------------------
  {
    name: "add_budget_transaction",
    description:
      "Bir projeye bütçe hareketi (gelir/gider/ödeme) ekler. Finansal ve kritik bir işlemdir, her zaman onay gerekir. Yalnızca proje sahibi yapabilir.",
    input_schema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        type: { type: "string", enum: ["income", "expense", "payout"] },
        amount: { type: "number" },
        description: { type: "string" },
      },
      required: ["projectId", "type", "amount"],
    },
  },
];
