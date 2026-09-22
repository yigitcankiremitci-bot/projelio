import type { TranslationDict } from "@projelio/shared";

/**
 * Admin > E-posta (bkz. modules/eposta-yonetimi/), şirket ve taşeron örnek
 * işleri (modules/ornek-is/ornek-is.icerik.ts) ve ortak doğrulama mesajları
 * (packages/shared/src/epostaYonetimi.ts — sunucu istisnası olarak da dönüyor).
 */
export const epostaYonetimi: TranslationDict = {
  "1 · Buradan başla: taşeron olarak ne görürsün":
    "1 · Start here: what you see as a subcontractor",
  "1 · Buradan başla: şirketin katmanları":
    "1 · Start here: your company's layers",
  "2 · Departmanlarını gözden geçir":
    "2 · Review your departments",
  "2 · Sana atanan görevleri Yapılacaklar'da takip et":
    "2 · Follow your assigned tasks in To-do",
  "3 · Ekibini davet et":
    "3 · Invite your team",
  "3 · İşi bitir, iş verenin haberdar olsun":
    "3 · Finish the work and let your client know",
  "4 · Görevleri dağıt ve takip et":
    "4 · Hand out tasks and follow up",
  "4 · Sana açılan modülde kayıt tut":
    "4 · Keep records in the module opened to you",
  "5 · Bitiş saatine dikkat et":
    "5 · Watch the due time",
  "5 · Şirket bütçesini tek defterde tut":
    "5 · Keep the company budget in one ledger",
  "6 · Yaptım'a yaptığın işi yaz":
    "6 · Log your work in Work log",
  "6 · Şirketin künyesini doldur":
    "6 · Fill in your company's details",
  "7 · Lio'ya şirketini sor":
    "7 · Ask Lio about your company",
  "Aylık bütçe kontrolü":
    "Monthly budget check",
  "Bağlantı / ile başlayan bir uygulama yolu ya da https:// adresi olmalı.":
    "The link must be an in-app path starting with / or an https:// address.",
  "Bağlantı verdiysen düğme metnini de yaz.":
    "If you add a link, write the button text too.",
  "Başlık ve gövde boş bırakılamaz.":
    "Title and body can't be empty.",
  "Başlık ve gövde zorunlu.":
    "Title and body are required.",
  "Bir şirket seni taşeron olarak davet ettiğinde, o şirketin sana açtığı modülü ve sana atanan görevleri görürsün. Davet bildirimini kabul etmeyi unutma.\n\nŞu an bir görevin içindesin. Başlığı, açıklamayı, tarihi değiştirebilirsin. Sonraki kartlara geç ve her birinde yazanı dene.":
    "When a company invites you as a subcontractor, you see the module it opened to you and the tasks assigned to you. Don't forget to accept the invitation notification.\n\nYou're inside a task right now. You can change its title, description and date. Move on to the next cards and try what each one says.",
  "Bu e-postayı Projelio hesabın olduğu için aldın.":
    "You're receiving this email because you have a Projelio account.",
  "Bu görevin alt görevleri var; biri zaten tamamlanmış. Kalanları tamamla. Bir görevi tamamlandı olarak işaretlediğinde görevi sana veren kişi bunu görür — ayrıca haber vermene gerek kalmaz.":
    "This task has subtasks; one is already done. Complete the rest. When you mark a task as complete, the person who gave it to you sees it — no need to tell them separately.",
  "Bu görevin alt görevleri, ekibini içeri almanın adımları. Çalışanlarını departmanların kadrosuna davet et; davet ettiğin kişi kabul edince departmanın görevlerini ve modüllerini görür.\n\nDışarıdan hizmet aldığın biri varsa onu TAŞERON olarak ekle: taşeron yalnızca kendisine açılan modülü ve görevleri görür, şirketinin geri kalanını ve bütçesini görmez.":
    "The subtasks of this task are the steps for bringing your team in. Invite your employees to your departments' staff; once they accept, they see the department's tasks and modules.\n\nIf you work with someone from outside, add them as a SUBCONTRACTOR: a subcontractor only sees the module and tasks opened to them, not the rest of your company or its budget.",
  "Bu görevin yarın saat 10:00'da bitmesi gerekiyor. Saatli görevlere vaktinden önce hatırlatma kurabilirsin; böylece teslim saatini kaçırmazsın.":
    "This task is due tomorrow at 10:00. You can set a reminder ahead of time for tasks with a time, so you don't miss the delivery time.",
  "Bu kitlede e-posta gönderilebilecek kimse yok.":
    "There's no one in this audience who can be emailed.",
  "Bu kişiye e-posta gönderilemiyor: adresi doğrulanmamış ya da gerçek bir adres değil.":
    "Can't email this person: their address isn't verified or isn't a real address.",
  "Bu örnek iş, bir şirkete hizmet verirken Projelio'yu nasıl kullanacağını göstermek için hazırlandı. İçindeki proje, görevler ve rutin gerçek kayıtlar: aç, düzenle, tamamla — hiçbir şey bozulmaz. İşin bitince bu sayfadaki \"Örnekleri sil\" düğmesiyle hepsini tek tıkla kaldırabilirsin.":
    "This sample job was set up to show how to use Projelio while working for a company. The project, tasks and routine inside are real records: open, edit, complete them — nothing will break. When you're done, remove all of it in one click with the \"Delete samples\" button on this page.",
  "Bu örnek iş, şirketini Projelio'da nasıl yöneteceğini göstermek için hazırlandı ve şirketine bağlı. İçindeki proje, görevler ve rutin gerçek kayıtlar: aç, düzenle, tamamla — hiçbir şey bozulmaz. İşin bitince bu sayfadaki \"Örnekleri sil\" düğmesiyle hepsini tek tıkla kaldırabilirsin.":
    "This sample job was set up to show how to run your company in Projelio, and it's linked to your company. The project, tasks and routine inside are real records: open, edit, complete them — nothing will break. When you're done, remove all of it in one click with the \"Delete samples\" button on this page.",
  "Bütçe kademe kademe toplanır: görev → proje → iş → departman → şirket (varsa holding). Bir gider hangi kademeye aitse oraya yazılır; üstteki rakam kendiliğinden toplanır, hiçbir şey iki kez sayılmaz.\n\nFarklı para birimleri birbirine karışmaz; her biri kendi toplamıyla görünür.":
    "The budget rolls up level by level: task → project → job → department → company (and holding, if any). An expense is recorded at the level it belongs to; the figure above adds up on its own and nothing is counted twice.\n\nDifferent currencies never get mixed; each one shows its own total.",
  "Departman yöneticilerini belirle":
    "Choose department managers",
  "Düğme metni çok uzun.":
    "Button text is too long.",
  "Elle en fazla 500 kişi seçilebilir; daha geniş kitle için kitle seçeneklerini kullan.":
    "You can pick at most 500 people by hand; use the audience options for a wider group.",
  "Geçersiz ayar.":
    "Invalid setting.",
  "Geçersiz ipucu alanı.":
    "Invalid tip field.",
  "Görevi tamamlandı olarak işaretle":
    "Mark the task as complete",
  "Görevleri departman panosuna ya da bir işin projesine yazıp kişilere ata. Atanan kişi bildirim alır, görev onun Yapılacaklar listesine düşer; tamamlandığında sen haberdar olursun.\n\nBu görevin yarın saat 10:00'da bitmesi gerekiyor — saatli görevlerde hatırlatma kurabilirsin.":
    "Write tasks on a department board or in a job's project and assign them to people. The assignee gets notified and the task lands in their To-do list; you hear back when it's done.\n\nThis task is due tomorrow at 10:00 — you can set reminders for tasks with a time.",
  "Gün sayısı 1 ile 365 arasında olmalı.":
    "The number of days must be between 1 and 365.",
  "Günlük tavan sıfır ya da pozitif bir sayı olmalı.":
    "The daily cap must be zero or a positive number.",
  "Haftalık iş raporunu gönder":
    "Send the weekly work report",
  "Haftalık yönetim toplantısı":
    "Weekly management meeting",
  "Hangi şirketten gelirse gelsin, sana atanan bütün görevler Yapılacaklar sayfasında toplanır. Güne oradan başla: bugün ne var, ne gecikti.\n\nHer sabah gelen özet e-postası da aynı listeyi gelen kutuna getirir.":
    "Whichever company they come from, all tasks assigned to you come together on the To-do page. Start your day there: what's due today, what's overdue.\n\nThe summary email you get each morning brings the same list to your inbox.",
  "Hepsi bu kadar! Artık şirketin için ilk gerçek işini açmaya hazırsın.\n\nBu işin sayfasındaki \"Örnekleri sil\" düğmesi bu işi, projeyi, görevleri ve rutini birlikte kaldırır. Şirketine, departmanlarına ve kendi açtığın işlere dokunmaz. Örnekleri daha sonra yeniden görmek istersen Ayarlar > Yardımcılar'dan tekrar ekleyebilirsin.":
    "That's it! You're ready to create your company's first real job.\n\nThe \"Delete samples\" button on this job's page removes this job, the project, the tasks and the routine together. It doesn't touch your company, its departments or the jobs you created. If you want to see the samples again later, you can add them back from Settings > Helpers.",
  "Hepsi bu kadar! Bu işin sayfasındaki \"Örnekleri sil\" düğmesi bu işi, projeyi, görevleri ve rutini birlikte kaldırır. Bağlı olduğun şirketin kayıtlarına dokunmaz. Örnekleri daha sonra yeniden görmek istersen Ayarlar > Yardımcılar'dan tekrar ekleyebilirsin.":
    "That's it! The \"Delete samples\" button on this job's page removes this job, the project, the tasks and the routine together. It doesn't touch the records of the company you work with. If you want to see the samples again later, you can add them back from Settings > Helpers.",
  "Her cuma saat 16:00'da açılan örnek bir rutin görevi. Tekrar kuralını değiştirmeyi dene.":
    "A sample routine task that opens every Friday at 16:00. Try changing its repeat rule.",
  "Kampanya bulunamadı":
    "Send not found",
  "Kime gideceğini seç.":
    "Choose who it goes to.",
  "Konu boş olamaz.":
    "Subject can't be empty.",
  "Konu çok uzun.":
    "Subject is too long.",
  "Lio taslağı yazamadı; biraz sonra tekrar dene.":
    "Lio couldn't write the draft; try again in a moment.",
  "Lio şu an metni yazamadı; biraz sonra tekrar dene.":
    "Lio couldn't write the text right now; try again in a moment.",
  "Lio'ya ne yazmasını istediğini anlat.":
    "Tell Lio what you want it to write.",
  "Projelio'da şirketin şöyle durur: ŞİRKET → DEPARTMANLAR (her birinin kadrosu, görevleri ve modülleri) ve ŞİRKETE BAĞLI İŞLER → PROJELER → GÖREVLER.\n\nBirden fazla şirketin varsa hepsi bir holding (grup) altında toplanabilir. Menüden Organizasyonlar'ı açıp şirketinin sayfasına bir göz at.":
    "Here's how your company is organised in Projelio: COMPANY → DEPARTMENTS (each with its own staff, tasks and modules) and JOBS LINKED TO THE COMPANY → PROJECTS → TASKS.\n\nIf you have more than one company, they can all sit under a holding (group). Open Organizations from the menu and take a look at your company's page.",
  "Rutin, bitiş tarihi olmayan, tekrar eden işlerin yeridir. Kuralı bir kez yazarsın; Projelio görevleri vakti gelince kendisi açar ve hangilerinin kaçırıldığını gösterir.":
    "A routine is where recurring work with no end date lives. You write the rule once; Projelio opens the tasks when they're due and shows which ones were missed.",
  "Rutin, bitiş tarihi olmayan, tekrar eden işlerin yeridir: haftalık toplantı, aylık bütçe kontrolü gibi. Kuralı bir kez yazarsın; Projelio görevleri vakti gelince kendisi açar ve hangilerinin kaçırıldığını gösterir.":
    "A routine is where recurring work with no end date lives: a weekly meeting, a monthly budget check. You write the rule once; Projelio opens the tasks when they're due and shows which ones were missed.",
  "Sağ alttaki Lio, Projelio'nun yapay zekâ yardımcısı. Ona düz cümlelerle yaz: \"bu hafta hangi görevler gecikti?\" ya da \"satış departmanına yarın için üç görev ekle\".\n\nLio'yu Cmd/Ctrl + K ile de açabilirsin.":
    "Lio, in the bottom right corner, is Projelio's AI assistant. Write to it in plain sentences: \"which tasks are overdue this week?\" or \"add three tasks for tomorrow to the sales department\".\n\nYou can also open Lio with Cmd/Ctrl + K.",
  "Son adım · Örnekleri sil":
    "Last step · Delete the samples",
  "Son adım · Örnekleri sil ve ilk gerçek işini aç":
    "Last step · Delete the samples and create your first real job",
  "Sunucuda Lio için tanımlı bir AI sağlayıcısı yok.":
    "There's no AI provider configured for Lio on the server.",
  "Sıralama listesi bekleniyor":
    "An ordered list is expected",
  "Taşeron olarak seni davet eden şirketin yalnızca sana açılan bölümünü görürsün: bağlandığın departmanın ilgili modülü ve sana atanan görevler. Şirketin diğer işlerini ve bütçesini görmezsin. Görevleri sırayla aç ve açıklamalarındaki adımları dene.":
    "As a subcontractor you only see the part of the inviting company opened to you: the relevant module of the department you're linked to and the tasks assigned to you. You don't see the company's other jobs or its budget. Open the tasks in order and try the steps in their descriptions.",
  "Taşeronları ilgili modüle bağla":
    "Link subcontractors to the right module",
  "Yaptım, kişisel iş günlüğün. Gün içinde yaptığın işleri kısaca yaz, istersen kronometreyle süresini tut. Ne kadar çalıştığını iş verenine gösterirken işine yarar.":
    "The Work log is your personal log of what you did. Jot down what you worked on during the day, and time it with the stopwatch if you like. It helps when you show your client how much you worked.",
  "Çalışanları kadroya davet et":
    "Invite employees to the staff",
  "Örnek proje: Müşteriye verilen hizmet":
    "Sample project: Service for a client",
  "Örnek proje: Yeni dönem hazırlığı":
    "Sample project: Getting ready for the new term",
  "Örnek rutin: Haftalık rapor":
    "Sample routine: Weekly report",
  "Örnek rutin: Yönetim düzeni":
    "Sample routine: Management rhythm",
  "İpucu bulunamadı":
    "Tip not found",
  "İpucu metni çok uzun.":
    "Tip text is too long.",
  "İstek çok uzun.":
    "The request is too long.",
  "İşi teslim et":
    "Deliver the work",
  "İşin kapsamını netleştir":
    "Clarify the scope of the work",
  "Şirket sayfasında departmanların listelenir. Her departmanın kendi kadrosu, görev panosu ve modülleri (ör. satış, muhasebe) vardır.\n\nEksik bir departman varsa şirket sayfasından ekle; kullanmadığını kaldırabilirsin.":
    "Your departments are listed on the company page. Each department has its own staff, task board and modules (e.g. sales, accounting).\n\nIf a department is missing, add it from the company page; you can remove the ones you don't use.",
  "Şirket sayfasındaki bilgi kartı, şirketinin künyesini (unvan, vergi bilgileri, adresler) ve önemli belgelerini tek yerde tutar. Bir kez doldur; ihtiyaç olduğunda aramak zorunda kalma.":
    "The info card on the company page keeps your company's details (legal name, tax information, addresses) and key documents in one place. Fill it in once and never go looking again.",
  "Şirket seni bir departman modülüne (ör. satış ya da muhasebe) bağladıysa, o modülün kayıtlarını ekleyip güncelleyebilirsin. Menüde sana açılan modülü bul ve kayıtlarına göz at.":
    "If the company linked you to a department module (e.g. sales or accounting), you can add and update that module's records. Find the module opened to you in the menu and look through its records.",
  "Şirketindeki her çalışma bir İŞ altında toplanır, işin içinde projeler ve görevler olur. İşler şirkete bağlandığı için şirket sayfasından hepsini birlikte görürsün. Görevleri sırayla aç ve açıklamalarındaki adımları dene.":
    "All work in your company lives under a JOB, and jobs contain projects and tasks. Since jobs are linked to the company, you see them all together on the company page. Open the tasks in order and try the steps in their descriptions.",
  "🎓 Projelio'yu tanı: taşeron (örnek)":
    "🎓 Meet Projelio: subcontractor (sample)",
  "🎓 Projelio'yu tanı: şirket (örnek)":
    "🎓 Meet Projelio: company (sample)",
  // Planlı gönderim (migration 123)
  "En fazla 60 gün ilerisine planlanabilir.":
    "You can schedule at most 60 days ahead.",
  "Geçersiz gönderim zamanı.":
    "Invalid send time.",
  "Gönderim zamanı geçmişte olamaz.":
    "The send time can't be in the past.",
};
