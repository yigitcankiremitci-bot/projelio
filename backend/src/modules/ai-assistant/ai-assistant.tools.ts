import type Anthropic from "@anthropic-ai/sdk";

// Kullanıcının onayı olmadan ASLA doğrudan çalıştırılmaması gereken araçlar.
// (Silme, arşivleme ve bütçe/para hareketi gibi geri alınması zor işlemler.)
export const CRITICAL_TOOLS = new Set<string>([
  "delete_output",
  "archive_output",
  "delete_task",
  "archive_task",
  "delete_project",
  "archive_project",
  "delete_job",
  "archive_job",
  "add_budget_transaction",
]);

export const AI_TOOLS: Anthropic.Tool[] = [
  // --- Sohbete sabitlenmiş dosyalar ------------------------------------
  {
    name: "release_files",
    description:
      "Sohbete iliştirilmiş dosyalarla İŞ BİTTİĞİNDE çağır. Dosyalar bırakılır ve sonraki " +
      "turlarda modele gönderilmez; böylece kullanıcı aynı içeriği tur tur ödemeye devam etmez. " +
      "İş gerçekten bitmeden çağırma: bıraktıktan sonra dosyanın içeriğini bir daha göremezsin " +
      "ve kullanıcıdan tekrar göndermesini istemek zorunda kalırsın.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "search_files",
    description:
      "Projelio'ya yüklenmiş dosyaları ADINA göre arar (işlerin ve projelerin dosyaları). " +
      "Dosyanın kimliğini, adını, türünü, boyutunu ve hangi iş/projede durduğunu döndürür — " +
      "İÇERİĞİNİ DÖNDÜRMEZ. Kullanıcı \"şu dosyayı getir\", \"şu sözleşmeye bak\", " +
      "\"projede hangi dosyalar var\" gibi bir şey dediğinde önce bunu çağır; " +
      "içeriği gerekiyorsa dönen fileId ile open_file'ı çağır. " +
      "query boş bırakılırsa en son yüklenen dosyalar döner.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Dosya adında aranacak metin (opsiyonel)." },
        projectId: { type: "string", description: "Yalnızca bu projenin dosyalarında ara (opsiyonel)." },
        limit: { type: "number", description: "En fazla kaç sonuç (varsayılan 20, en çok 50)." },
      },
      required: [],
    },
  },
  {
    name: "open_file",
    description:
      "Projelio'daki bir dosyayı SOHBETE GETİRİR: içeriği okunur ve sohbete sabitlenir, yani bu " +
      "turdan itibaren elinde olur. Word/Excel/CSV/metin dosyaları metne çevrilir; görsel ve PDF'i " +
      "doğrudan görürsün. Dosya kimliğini search_files'tan al. " +
      "PAHALIDIR: sabitlenen dosya iş bitene kadar HER TURDA yeniden gönderilir ve kullanıcı her " +
      "turda öder. Bu yüzden yalnızca kullanıcı bir dosyanın getirilmesini/incelenmesini istediğinde " +
      "çağır; hangisi olduğundan emin değilsen açmadan önce sor, doğru olanı bulmak için birkaç " +
      "dosyayı arka arkaya AÇMA. İşin bitince release_files ile bırak.",
    input_schema: {
      type: "object",
      properties: {
        fileId: { type: "string", description: "search_files'ın döndürdüğü dosya kimliği." },
      },
      required: ["fileId"],
    },
  },
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
        outputId: { type: "string", description: "Görevi bir çıktıya bağlar (opsiyonel)" },
      },
      required: ["projectId", "title", "deadline"],
    },
  },
  {
    name: "update_task",
    description:
      "Bir görevin başlık/açıklama/tarih/atanan kişi/bütçe bilgilerini günceller. " +
      "Görevi bir çıktıya taşımak için outputId ver; çıktıdan çıkarmak için boş dize gönder.",
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
        outputId: { type: "string", description: "Görevi bu çıktıya taşır; boş dize çıktıdan çıkarır" },
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

  // --- Toplu işlem aracı (kredi tasarrufu için) ----------------------------
  {
    name: "create_tasks",
    description:
      "Bir projede BİRDEN FAZLA görevi tek seferde oluşturur. Kullanıcı \"şu projeye şu N görevi ekle\" dediğinde " +
      "her görev için ayrı ayrı create_task çağırmak yerine bunu bir kez çağır (daha az tur = daha az kredi).",
    input_schema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        tasks: {
          type: "array",
          // maxItems ŞEMADA zorunlu tutuluyor, yalnızca promptta öğütlenmiyor:
          // model 30 kalemlik tek bir çağrı yazmaya kalktığında JSON yanıt uzunluk
          // sınırında kesiliyor, tur tamamen boşa gidiyor ve kullanıcı hiçbir iş
          // yapılmadan yüzlerce kredi ödüyordu.
          maxItems: 10,
          description:
            "Oluşturulacak görevlerin listesi. Tek çağrıda EN FAZLA 10 kalem; " +
            "daha fazlası varsa aracı arka arkaya birkaç kez çağır.",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              deadline: { type: "string", description: "ISO tarih/saat" },
              startDate: { type: "string", description: "ISO tarih/saat" },
              assignedTo: { type: "string", description: "Atanacak kullanıcının id'si (opsiyonel)" },
              budget: { type: "number" },
              parentTaskId: { type: "string" },
              outputId: { type: "string", description: "Görevi bir çıktıya bağlar (opsiyonel)" },
            },
            required: ["title", "deadline"],
          },
        },
      },
      required: ["projectId", "tasks"],
    },
  },

  // --- Çıktılar -------------------------------------------------------------
  // Çıktı = projenin/departmanın teslim edilecek parçası ("Logo tasarımı",
  // "Ana sayfa"). Görevler bir çıktıya bağlanabilir; pano onları o başlık
  // altında gruplar.
  {
    name: "list_outputs",
    description: "Bir projenin çıktılarını listeler.",
    input_schema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
    },
  },
  {
    name: "create_output",
    description:
      "Projeye yeni bir çıktı ekler. Görevleri çıktıya bağlamak için create_task/create_tasks'a outputId ver.",
    input_schema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
      },
      required: ["projectId", "title"],
    },
  },
  {
    name: "update_output",
    description: "Çıktının adını ya da açıklamasını değiştirir.",
    input_schema: {
      type: "object",
      properties: {
        outputId: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
      },
      required: ["outputId"],
    },
  },
  {
    name: "archive_output",
    description: "Çıktıyı arşivler. Kullanıcıya onaylatılır.",
    input_schema: {
      type: "object",
      properties: { outputId: { type: "string" } },
      required: ["outputId"],
    },
  },
  {
    name: "delete_output",
    description: "Çıktıyı siler. Kullanıcıya onaylatılır.",
    input_schema: {
      type: "object",
      properties: { outputId: { type: "string" } },
      required: ["outputId"],
    },
  },

  // --- Görev yorumları ------------------------------------------------------
  {
    name: "list_task_comments",
    description: "Bir görevin yorumlarını (aktivite/sosyal geçmişini) listeler.",
    input_schema: { type: "object", properties: { taskId: { type: "string" } }, required: ["taskId"] },
  },
  {
    name: "add_task_comment",
    description: "Bir göreve yorum ekler.",
    input_schema: {
      type: "object",
      properties: { taskId: { type: "string" }, body: { type: "string" } },
      required: ["taskId", "body"],
    },
  },

  // --- Bildirimler ------------------------------------------------------------
  {
    name: "get_notifications_summary",
    description:
      "Kullanıcının okunmamış bildirim sayısını ve en son bildirimlerini getirir. " +
      "\"Bildirimlerim var mı\", \"yeni bir şey var mı\" gibi sorular için kullan.",
    input_schema: { type: "object", properties: {}, required: [] },
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

  // --- Takvim / kişisel planlama ---------------------------------------------
  //
  // Bu araçlar diğerlerinden bir konuda ayrılır: burada model KARAR VERMEZ,
  // KONUŞUR. Kullanıcının haftasını hangi yüzdelerle böleceği onun kararıdır;
  // modelin işi doğru soruları sormak, cevabı yapıya çevirmek ve aritmetiği
  // suggest_schedule'a bırakmaktır. Model yüzde dağıtımını kendi kafasından
  // saatlere çevirmeye kalkarsa hem yanlış hesaplar hem gereksiz token yakar.
  {
    name: "get_plan_overview",
    description:
      "Kullanıcının bir dönemdeki (gün/hafta/ay) planını özetler: dönemin teması, odak alanı hedefleri, " +
      "takvime düşen ve tamamlanan süreler, hedef-gerçek sapması. " +
      "\"Bu hafta nasıl gidiyor\", \"planıma ne kadar uydum\", \"bu ay ne yapacaktım\" gibi sorular için kullan. " +
      "Planlama sohbetine başlamadan ÖNCE mutlaka bunu çağır: kullanıcının hâlihazırda ne planladığını bilmeden soru sorma.",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["day", "week", "month"], description: "Varsayılan: week." },
        date: { type: "string", description: "Dönemin içindeki herhangi bir gün (YYYY-MM-DD). Varsayılan: bugün." },
      },
      required: [],
    },
  },
  {
    name: "list_focus_areas",
    description:
      "Kullanıcının odak alanlarını listeler (ör. Yazılım, Müzik Prodüksiyon, İçerik). " +
      "Planlama yüzdeleri bu alanlara dağıtılır. Hedef yazmadan önce hangi alanların var olduğunu buradan öğren.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "set_period_plan",
    description:
      "Bir dönemin planını yazar: teması ve odak alanı hedefleri. Haftalık/aylık planlama sihirbazının ANA aracıdır. " +
      "Hedefler dönemin YENİ TAM HÂLİDİR — listede olmayan eski hedefler silinir, bu yüzden değişiklik yaparken " +
      "korunmasını istediğin hedefleri de listeye dahil et. " +
      "Odak alanını adıyla verebilirsin (focusAreaName); o adda bir alan yoksa otomatik oluşturulur, " +
      "yani önce ayrı bir araçla alan yaratmana gerek yok. " +
      "Yüzdelerin toplamı 100 olmak zorunda değildir; kalan pay kullanıcının esneklik payıdır.",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["day", "week", "month"], description: "Varsayılan: week." },
        date: { type: "string", description: "Dönemin içindeki herhangi bir gün (YYYY-MM-DD). Varsayılan: bugün." },
        theme: { type: "string", description: "Dönemin tek cümlelik niyeti. Kullanıcının kendi cümlesine sadık kal." },
        capacityMinutes: {
          type: "number",
          description: "Dönem için ayrılan toplam çalışma dakikası. Kullanıcı 'bu hafta yarım çalışacağım' derse doldur, yoksa boş bırak.",
        },
        targets: {
          type: "array",
          description: "Dönemin hedefleri.",
          items: {
            type: "object",
            properties: {
              focusAreaName: { type: "string", description: "Odak alanının adı. Yoksa oluşturulur." },
              title: { type: "string", description: "Odak alanına bağlı olmayan serbest hedef başlığı." },
              sharePct: { type: "number", description: "Dönemin yüzde kaçı (0-100)." },
              targetMinutes: { type: "number", description: "Yüzde yerine doğrudan dakika verilecekse." },
              targetCount: { type: "number", description: "Adet hedefi, ör. 10 içerik." },
              unit: { type: "string", description: "Adet hedefinin birimi: içerik, video, teklif." },
            },
            required: [],
          },
        },
      },
      required: [],
    },
  },
  {
    name: "suggest_schedule",
    description:
      "Dönemin hedeflerini kullanıcının çalışma saatlerine göre takvime dağıtır ve saat bloklarını üretir. " +
      "Yüzdeleri saate çevirme işini SEN yapma, bu aracı çağır: hesabı sunucu yapar, elle konmuş bloklara dokunmaz, " +
      "yer yetmezse eksik kalan süreyi (shortfall) bildirir. " +
      "apply=false ile önce öneriyi göster, kullanıcı onaylarsa apply=true ile uygula. Ay için çalışmaz; ay hedefleri haftalara bölünür.",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["day", "week"], description: "Varsayılan: week." },
        date: { type: "string", description: "Dönemin içindeki herhangi bir gün (YYYY-MM-DD). Varsayılan: bugün." },
        apply: { type: "boolean", description: "true ise bloklar gerçekten takvime yazılır. Varsayılan false (önizleme)." },
        replaceExisting: {
          type: "boolean",
          description: "true ise bu aralıktaki, kullanıcının henüz dokunmadığı eski AI önerileri silinip yenisi kurulur.",
        },
      },
      required: [],
    },
  },
  {
    name: "list_time_blocks",
    description:
      "Bir tarih aralığındaki takvim bloklarını listeler. \"Bugün saat kaçta ne yapıyorum\", \"yarın boş muyum\" " +
      "gibi sorular için kullan.",
    input_schema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Başlangıç tarihi (YYYY-MM-DD)." },
        to: { type: "string", description: "Bitiş tarihi (YYYY-MM-DD)." },
      },
      required: ["from", "to"],
    },
  },
  {
    name: "create_time_blocks",
    description:
      "Takvime bir veya birden çok saat bloğu ekler. Kullanıcı belirli bir işi belirli bir saate koymak istediğinde kullan " +
      "(\"salı sabahı 2 saat müzik\"). Genel bir haftalık dağıtım için bunu tek tek çağırma, suggest_schedule kullan. " +
      "Bir bloğu gerçek bir göreve bağlamak için taskId ver: kullanıcının erişebildiği HERHANGİ bir proje ya da " +
      "program görevi olabilir, kendisine atanmış olması gerekmez. Görevin id'sini search_tasks ile bul.",
    input_schema: {
      type: "object",
      properties: {
        blocks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              blockDate: { type: "string", description: "YYYY-MM-DD" },
              startsAt: { type: "string", description: "HH:MM" },
              endsAt: { type: "string", description: "HH:MM" },
              title: { type: "string" },
              focusAreaName: { type: "string", description: "Odak alanının adı. Yoksa oluşturulur." },
              taskId: { type: "string", description: "Kullanıcının erişebildiği bir proje/program görevinin id'si." },
              note: { type: "string" },
            },
            required: ["blockDate", "startsAt", "endsAt"],
          },
        },
      },
      required: ["blocks"],
    },
  },
  {
    name: "update_time_block_status",
    description:
      "Bir takvim bloğunu tamamlandı/atlandı olarak işaretler ya da planlanan durumuna geri alır. " +
      "Kullanıcı \"sabahki bloğu yaptım\" dediğinde kullan. Gerçekleşen süre verilmezse planlanan süre gerçekleşmiş sayılır.",
    input_schema: {
      type: "object",
      properties: {
        blockId: { type: "string" },
        status: { type: "string", enum: ["planned", "done", "skipped"] },
        actualMinutes: { type: "number", description: "Gerçekten kaç dakika sürdü (opsiyonel)." },
      },
      required: ["blockId", "status"],
    },
  },
  {
    name: "get_due_ritual",
    description:
      "Kullanıcının bugün bekleyen planlama ritüeli (gün başı / hafta başı / ay başı sihirbazı) var mı diye bakar; " +
      "varsa sorulacak soruları ve bir önceki oturumun özetini döner. " +
      "Kullanıcı \"planlayalım\", \"haftamı kuralım\", \"bugün ne yapsam\" dediğinde ilk bunu çağır.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "complete_ritual",
    description:
      "Planlama sihirbazı oturumunu kapatır ve özetini kaydeder. Hedefleri set_period_plan ile YAZDIKTAN SONRA çağır. " +
      "Kaydettiğin özet bir sonraki oturumda sana geri verilir — \"geçen hafta şuna ağırlık vereceğini söylemiştin\" " +
      "diyebilmen bu özete bağlı, o yüzden kullanıcının kendi kararlarını ve gerekçelerini yaz.",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["daily", "weekly", "monthly"] },
        summary: { type: "string", description: "Oturumun özeti: kullanıcı ne karar verdi, neden." },
        answers: { type: "object", description: "Soru anahtarı -> cevap eşlemesi (opsiyonel)." },
        status: { type: "string", enum: ["done", "skipped"], description: "Kullanıcı planlamak istemediyse skipped." },
      },
      required: ["kind"],
    },
  },
];
