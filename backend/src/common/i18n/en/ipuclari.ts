import type { TranslationDict } from "@projelio/shared";

/**
 * Günlük ipucu e-postaları (bkz. modules/notifications/ipucu.icerik.ts) —
 * şablon metinleri, ipucu dizisi ve ipucu çıkış sayfası.
 *
 * İpucu gövdeleri paragraf ayracı olarak "\n\n" taşıyor; çeviride de aynı
 * yerde durmalı, yoksa İngilizce e-posta tek paragrafa sıkışır.
 */
export const ipuclari: TranslationDict = {
  // ─────────────────────────────────────────────── Şablon
  "İpucu {sira}/{toplam}": "Tip {sira}/{toplam}",
  "Projelio ipucu: {baslik}": "Projelio tip: {baslik}",
  "Bu e-postaları Projelio'yu yeni kullanmaya başlayanlara, günde bir tane olmak üzere gönderiyoruz. Dizi {toplam} ipucunda biter.":
    "We send these emails, one a day, to people who are new to Projelio. The series ends after {toplam} tips.",
  "İpuçlarını artık gönderme": "Stop sending tips",
  "E-posta ayarları": "Email settings",

  // ─────────────────────────────────────────────── Çıkış sayfası
  "İpucu e-postaları kapatıldı": "Tip emails turned off",
  "Bundan sonra sana ipucu e-postası göndermeyeceğiz. Bildirim e-postaların bundan etkilenmedi; onları Ayarlar > Yardımcılar'dan yönetebilirsin.":
    "We won't send you tip emails anymore. Your notification emails aren't affected; you can manage them in Settings > Helpers.",

  // ─────────────────────────────────────────────── İpucu dizisi
  "Örnek işinle başla": "Start with your sample job",
  "Ana sayfanda \"Projelio'yu tanı\" adında örnek bir iş seni bekliyor. İçindeki kartlar Projelio'yu adım adım anlatıyor: kurcala, tamamla, sil — hiçbir şey bozulmaz.\n\nİşin bitince iş sayfasındaki \"Örnekleri sil\" düğmesiyle hepsini tek tıkla kaldırabilirsin. Örnek işi göremiyorsan Ayarlar > Yardımcılar'dan istediğin zaman ekleyebilirsin.":
    "A sample job called \"Meet Projelio\" is waiting on your home page. Its cards walk you through Projelio step by step: poke around, complete, delete — nothing will break.\n\nWhen you're done, remove all of it in one click with the \"Delete samples\" button on the job page. If you don't see the sample job, you can add it any time from Settings > Helpers.",
  "Örnek işi aç": "Open the sample job",

  "İş, proje, görev: üç katman": "Job, project, task: three layers",
  "Projelio'da her şey bir İŞ altında toplanır: bir müşteri, şirketin ya da kendi girişimin. İşin içinde projeler, projelerin içinde görevler olur.\n\nBaşlamak için tek bir iş açman yeter. Sonra ilk projeni ekle ve aklındaki ilk üç görevi yaz — geri kalanı zamanla oturur.":
    "In Projelio everything lives under a JOB: a client, your company or your own venture. Jobs contain projects, and projects contain tasks.\n\nOne job is all you need to get started. Then add your first project and write down the first three tasks on your mind — the rest falls into place over time.",
  "İlk işini aç": "Create your first job",

  "Büyük görevi alt görevlere böl": "Split big tasks into subtasks",
  "Bir görevin içine alt görevler ekleyebilirsin. \"Web sitesini yenile\" tek başına göz korkutur; \"metinleri topla\", \"görselleri seç\", \"yayına al\" diye bölünce başlamak kolaylaşır.\n\nAlt görevler tamamlandıkça ana görevin ne kadar ilerlediği de görünür.":
    "You can add subtasks inside a task. \"Redesign the website\" is daunting on its own; split it into \"gather copy\", \"pick images\", \"go live\" and it becomes easy to start.\n\nAs subtasks get done, you can see how far the main task has come.",
  "Görevlerime git": "Go to my tasks",

  "Bütün görevlerin tek bir yerde": "All your tasks in one place",
  "Farklı işlerdeki ve projelerdeki görevlerin Yapılacaklar sayfasında toplanır. Güne oradan başla: bugün ne var, ne gecikti, sırada ne var.\n\nHer sabah gelen özet e-postası da aynı listeyi gelen kutuna getirir.":
    "Your tasks from every job and project come together on the To-do page. Start your day there: what's due today, what's overdue, what's next.\n\nThe summary email you get each morning brings the same list to your inbox.",
  "Yapılacaklar'ı aç": "Open To-do",

  "Tekrar eden işler için rutin kur": "Set up routines for recurring work",
  "Her pazartesi rapor, her ayın 1'inde fatura kontrolü... Bunları her seferinde elle görev olarak açmana gerek yok.\n\nBir işin içinde rutin oluştur ve ne sıklıkla tekrarlandığını söyle. Projelio görevleri vakti gelince kendisi açar, kaçırdıklarını da gösterir.":
    "A report every Monday, an invoice check on the 1st of each month... You don't need to create these as tasks by hand every time.\n\nCreate a routine inside a job and say how often it repeats. Projelio opens the tasks when they're due and shows you the ones you missed.",
  "Bir rutin kur": "Set up a routine",

  "Lio'ya yazdır, o yapsın": "Tell Lio, let it do the work",
  "Sağ alttaki Lio, Projelio'nun yapay zekâ yardımcısı. \"Yarın için üç görev ekle\", \"bu hafta geciken görevlerimi listele\" gibi düz cümleler yaz; o senin yerine yapsın.\n\nLio'yu klavyeden Cmd/Ctrl + K ile de açabilirsin.":
    "Lio, in the bottom right corner, is Projelio's AI assistant. Write plain sentences like \"add three tasks for tomorrow\" or \"list my overdue tasks this week\" and let it do the work for you.\n\nYou can also open Lio from the keyboard with Cmd/Ctrl + K.",
  "Lio'yu dene": "Try Lio",

  "Haftanı takvimde gör": "See your week on the calendar",
  "Takvim sayfasında görevlerin günlere yerleşmiş hâlde görünür. Hangi günün dolu, hangisinin boş olduğunu bir bakışta anlarsın.\n\nYoğun bir haftaya girmeden önce takvime göz atmak, son dakika sürprizlerini azaltır.":
    "The Calendar page shows your tasks laid out across the days. You can tell at a glance which days are full and which are free.\n\nA quick look at the calendar before a busy week cuts down on last-minute surprises.",
  "Takvimi aç": "Open the calendar",

  "Ekibini davet et": "Invite your team",
  "Bir işe ekip arkadaşlarını ekleyip görevleri onlara atayabilirsin. Atadığın kişiye bildirim gider; görev tamamlanınca sen de haberdar olursun.\n\nKimin neyle uğraştığını sormak yerine görev listesine bakman yeter.":
    "You can add teammates to a job and assign tasks to them. The person you assign gets notified, and you hear back when the task is done.\n\nInstead of asking who's working on what, just look at the task list.",
  "Bir iş aç ve ekibini ekle": "Create a job and add your team",

  "Yaptım: bugün ne yaptın?": "Yaptım: what did you do today?",
  "Yaptım, kişisel iş günlüğün. Gün içinde yaptığın işleri kısaca yaz, istersen kronometreyle süresini tut.\n\nPlanlı görevlerin dışında kalan işler de böylece kaybolmaz; hafta sonunda vaktinin nereye gittiğini görürsün.":
    "Yaptım is your personal work log. Jot down what you worked on during the day, and time it with the stopwatch if you like.\n\nWork that falls outside your planned tasks doesn't get lost, and at the end of the week you can see where your time went.",
  "Yaptım'ı aç": "Open Yaptım",

  "Saat ver, hatırlatılsın": "Add a time, get a reminder",
  "Bir göreve bitiş tarihinin yanında saat de verebilirsin. Saatli görevlerde, vaktinden önce hatırlatma kurmak mümkün.\n\nHer sabahki özet e-postasının saatini de Ayarlar > Yardımcılar'dan kendine göre ayarlayabilirsin.":
    "You can give a task a time as well as a due date. For tasks with a time, you can set a reminder ahead of it.\n\nYou can also choose when your morning summary email arrives in Settings > Helpers.",
  "E-posta ayarlarım": "My email settings",

  "Bütçeni işinle birlikte takip et": "Track your budget alongside your work",
  "İşlerinin ve projelerinin bütçe sekmesine gelir ve giderlerini yazabilirsin. Projelio bunları projeden işe, işten şirkete doğru kendisi toplar.\n\nFarklı para birimleri birbirine karışmaz; her biri kendi toplamıyla görünür.":
    "You can record income and expenses in the budget tab of your jobs and projects. Projelio rolls them up for you, from project to job and from job to company.\n\nDifferent currencies never get mixed; each one shows its own total.",
  "İşlerime git": "Go to my jobs",

  "Dosyaların işinle birlikte dursun": "Keep your files with your work",
  "Google Drive ya da OneDrive hesabını bağlarsan, işlerinin ve projelerinin dosyalarını Projelio'dan açıp yükleyebilirsin.\n\nBir dosyayı bulmak için hangi klasörde olduğunu hatırlaman gerekmez; işin içinde durur.":
    "Connect your Google Drive or OneDrive account and you can open and upload files for your jobs and projects right from Projelio.\n\nYou don't need to remember which folder a file is in; it sits inside the job.",
  "Bağlantıları aç": "Open connections",

  "Ekranını sadeleştir": "Declutter your screen",
  "Kullanmadığın bölümleri Ayarlar > Gezinme'den gizleyebilirsin. Menüde yalnızca işine yarayanlar kalsın.\n\nFikrin değişirse aynı yerden tek tıkla geri açarsın.":
    "You can hide the sections you don't use in Settings > Navigation, so the menu only shows what you need.\n\nChanged your mind? Turn them back on from the same place in one click.",
  "Gezinme ayarları": "Navigation settings",

  "Son ipucu: bize yaz": "Last tip: write to us",
  "Bu, ipucu dizisinin son e-postası. Umarız Projelio'da kendine bir düzen kurmuşsundur.\n\nTakıldığın bir yer ya da eksik gördüğün bir özellik varsa Ayarlar > Destek'ten yaz — her mesajı okuyoruz.":
    "This is the last email in the tips series. We hope you've found your rhythm in Projelio.\n\nIf you got stuck somewhere or feel a feature is missing, write to us from Settings > Support — we read every message.",
  "Destek'e yaz": "Contact support",
};
