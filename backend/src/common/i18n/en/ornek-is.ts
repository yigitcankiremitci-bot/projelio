import type { TranslationDict } from "@projelio/shared";

/**
 * Yeni üyenin hesabına açılan örnek iş (bkz. modules/ornek-is/ornek-is.icerik.ts).
 *
 * Bunlar e-posta değil, kullanıcının hesabına YAZILAN kayıtlar: iş, proje,
 * görev ve rutin başlıkları. Kayıt anındaki dile göre bir kez çevrilip öyle
 * saklanıyor; kullanıcı dilini sonradan değiştirirse örnek iş eski dilinde
 * kalır — kendi yazdığı görevler gibi.
 */
export const ornekIs: TranslationDict = {
  "🎓 Projelio'yu tanı (örnek)": "🎓 Meet Projelio (sample)",
  "Bu örnek iş, Projelio'nun nasıl çalıştığını göstermek için hazırlandı. İçindeki proje, görevler ve rutin gerçek kayıtlar: aç, düzenle, tamamla, taşı — hiçbir şey bozulmaz. İşin bitince bu sayfadaki \"Örnekleri sil\" düğmesiyle hepsini tek tıkla kaldırabilirsin.":
    "This sample job was set up to show you how Projelio works. The project, tasks and routine inside are real records: open, edit, complete, move them — nothing will break. When you're done, remove all of it in one click with the \"Delete samples\" button on this page.",

  "Örnek proje: Web sitesi yenileme": "Sample project: Website redesign",
  "Proje, başı ve sonu olan bir çalışmadır: bir teslim tarihi, bir bütçesi ve bir görev listesi vardır. Bir işin altında istediğin kadar proje açabilirsin. Görevleri sırayla aç ve açıklamalarındaki adımları dene.":
    "A project is a piece of work with a start and an end: it has a due date, a budget and a task list. You can create as many projects under a job as you like. Open the tasks in order and try the steps in their descriptions.",

  "1 · Buradan başla: bu bir görev kartı": "1 · Start here: this is a task card",
  "Projelio'da her şey bir katman düzeninde durur: İŞ (müşteri, şirket ya da girişimin) → PROJE (başı sonu olan çalışma) → GÖREV (yapılacak tek bir şey) → ALT GÖREV (görevin parçaları).\n\nŞu an bir görevin içindesin. Başlığı, açıklamayı, tarihi değiştirebilirsin. Sonraki kartlara geç ve her birinde yazanı dene.":
    "Everything in Projelio is organised in layers: JOB (a client, your company or your venture) → PROJECT (work with a start and an end) → TASK (a single thing to do) → SUBTASK (the pieces of a task).\n\nYou're inside a task right now. You can change its title, description and date. Move on to the next cards and try what each one says.",

  "2 · Beni tamamlandı olarak işaretle": "2 · Mark me as complete",
  "Bir görevi bitirdiğinde tamamlandı olarak işaretle. Tamamlanan görevler listeden ayrılır ama kaybolmaz; projenin ilerlemesi de buna göre güncellenir.\n\nHadi dene: bu görevi şimdi tamamla.":
    "When you finish a task, mark it as complete. Completed tasks move out of the list but don't disappear, and the project's progress updates accordingly.\n\nGo on, try it: complete this task now.",

  "3 · Büyük işi alt görevlere böl": "3 · Split big work into subtasks",
  "Bu görevin içinde üç alt görev var; biri zaten tamamlanmış. Alt görevler, büyük bir işi başlanabilir parçalara bölmenin yolu. Kalan ikisini de tamamla ya da kendi alt görevini ekle.":
    "This task has three subtasks inside; one is already done. Subtasks are how you break big work into pieces you can actually start. Complete the other two, or add a subtask of your own.",
  "Sayfa metinlerini topla": "Gather the page copy",
  "Görselleri seç": "Pick the images",
  "Yayına hazırla": "Get it ready to go live",

  "4 · Bitiş tarihi ve saat ver": "4 · Give it a due date and time",
  "Bu görevin yarın saat 10:00'da bitmesi gerekiyor. Saatli görevlere vaktinden önce hatırlatma kurabilirsin.\n\nTarihi olan görevler Yapılacaklar sayfasında, takvimde ve her sabah gelen özet e-postasında görünür. Tarihi değiştirip nereye taşındığına bak.":
    "This task is due tomorrow at 10:00. You can set a reminder ahead of time for tasks that have a time.\n\nTasks with a date show up on the To-do page, on the calendar and in your morning summary email. Change the date and see where it moves.",

  "5 · Görevi birine ata": "5 · Assign the task to someone",
  "Bu görev sana atanmış. Gerçek bir işte, işe ekip arkadaşlarını ekleyip görevleri onlara atayabilirsin; atadığın kişiye bildirim gider ve görev onun Yapılacaklar listesine düşer.\n\nBir görevin birden fazla kişiye atanması da mümkün.":
    "This task is assigned to you. In a real job you can add teammates and assign tasks to them; they get notified and the task lands in their To-do list.\n\nA task can also be assigned to more than one person.",

  "6 · Lio'ya bir şey yaptır": "6 · Get Lio to do something",
  "Sağ alttaki Lio, Projelio'nun yapay zekâ yardımcısı. Ona düz cümlelerle yaz: \"Örnek projeye 'iletişim formunu test et' diye bir görev ekle\" ya da \"bu hafta neler var?\".\n\nLio'yu Cmd/Ctrl + K ile de açabilirsin.":
    "Lio, in the bottom right corner, is Projelio's AI assistant. Write to it in plain sentences: \"Add a task called 'test the contact form' to the sample project\" or \"what's on this week?\".\n\nYou can also open Lio with Cmd/Ctrl + K.",

  "7 · Yaptım'a bugün ne yaptığını yaz": "7 · Write what you did today in Yaptım",
  "Yaptım, kişisel iş günlüğün: planlı görevlerin dışında kalan işleri de kaydetmenin yeri. Menüden Yaptım'ı aç ve bugün yaptığın bir işi yaz; istersen kronometreyle süresini tut.":
    "Yaptım is your personal work log: the place to record work that falls outside your planned tasks. Open Yaptım from the menu and write down something you did today; time it with the stopwatch if you like.",

  "Örnek: tamamlanmış bir görev": "Sample: a completed task",
  "Tamamlanan görevler böyle görünür. Yanlışlıkla tamamladıysan geri açabilirsin.":
    "This is what completed tasks look like. If you completed one by mistake, you can reopen it.",

  "Son adım · Örnekleri sil ve kendi işini aç": "Last step · Delete the samples and create your own job",
  "Hepsi bu kadar! Artık kendi işini açmaya hazırsın.\n\nBu işin sayfasındaki \"Örnekleri sil\" düğmesi bu işi, projeyi, görevleri ve rutini birlikte kaldırır. Kendi açtığın işlere dokunmaz. Örnekleri daha sonra yeniden görmek istersen Ayarlar > Yardımcılar'dan tekrar ekleyebilirsin.":
    "That's it! You're ready to create your own job.\n\nThe \"Delete samples\" button on this job's page removes this job, the project, the tasks and the routine together. It doesn't touch the jobs you created. If you want to see the samples again later, you can add them back from Settings > Helpers.",

  "Örnek rutin: Haftalık düzen": "Sample routine: Weekly rhythm",
  "Rutin, bitiş tarihi olmayan, tekrar eden işlerin yeridir: haftalık rapor, aylık fatura kontrolü gibi. Kuralı bir kez yazarsın; Projelio görevleri vakti gelince kendisi açar ve hangilerini kaçırdığını gösterir.":
    "A routine is where recurring work with no end date lives: a weekly report, a monthly invoice check. You write the rule once; Projelio opens the tasks when they're due and shows which ones you missed.",
  "Haftalık durum raporu hazırla": "Prepare the weekly status report",
  "Her pazartesi saat 10:00'da açılan örnek bir rutin görevi. Tekrar kuralını değiştirmeyi dene.":
    "A sample routine task that opens every Monday at 10:00. Try changing its repeat rule.",
  "Aylık faturaları kontrol et": "Check the monthly invoices",
  "Her ayın 1'inde açılan örnek bir rutin görevi.": "A sample routine task that opens on the 1st of every month.",
};
