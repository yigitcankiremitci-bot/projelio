import type { TranslationDict } from "@projelio/shared";

/**
 * İşler, projeler, çıktılar, ekip ve roller.
 *
 * Ürün sözlüğü sabittir ve burada bozulmaz: job, project, output, task,
 * budget, team member, subcontractor, owner, deadline, archive. Eşanlamlı
 * uydurmak (assignment/engagement/deliverable) aynı kavramı iki ayrı isimle
 * gösterir ve kullanıcı ikisinin farklı şeyler olduğunu sanır.
 *
 * Kart ve rozetlerde YER DAR: "Tahsilat tamam" gibi metinler bütçe kartının
 * içinde tek satıra sığmak zorunda. Uzun bir karşılık kartı taşırır.
 *
 * Kullanıcının kendi verdiği adlar (proje/iş/görev başlığı) çevrilmez;
 * buradaki yer tutucular ({ad}, {kisi}, {tutar}) o adları taşır.
 */
export const projeler: TranslationDict = {
  // ─────────────────────────────────────────────── Sekmeler ve gezinme
  // Bu etiketler modül düzeyindeki sabitlerde duruyor (ProjectTabs, JobTabs,
  // Dashboard coreTabs) ve `// dil:anahtar` ile işaretli; çeviri kullanıldıkları
  // yerde, t(sekme.label) ile yapılıyor.
  Sosyal: "Social",
  "Görev/Çıktı": "Tasks/Outputs",
  Süreç: "Process",
  Projeler: "Projects",
  Rutinler: "Routines",
  İşler: "Jobs",
  Modüller: "Modules",
  İşlerim: "My jobs",
  Bütçem: "My budget",
  Dosyalarım: "My files",
  Organizasyonlar: "Organizations",
  Gruplar: "Groups",
  "← Ayarlar": "← Settings",
  "← Projeler": "← Projects",
  "← Çıktılar": "← Outputs",

  // ─────────────────────────────────────────────── İş ve proje
  İş: "Job",
  Proje: "Project",
  Rutin: "Routine",
  "İş ekibi": "Job team",
  "İşe al": "Hire",
  "İşi düzenle": "Edit job",
  "Projeyi düzenle": "Edit project",
  "Üye ekle": "Add member",
  "Yeni rutin": "New routine",
  "Yeni paylaşım": "New post",
  "Kapak fotoğrafı ekle": "Add cover photo",
  "Yüklenemedi, tekrar dene": "Upload failed, try again",
  "{tarih} kuruldu": "created {tarih}",
  "{n} proje": { one: "{n} project", other: "{n} projects" },
  "{n} rutin": { one: "{n} routine", other: "{n} routines" },
  "Ücret:": "Fee:",
  "Başlangıç: {tarih}": "Start: {tarih}",
  "Bitiş: {tarih}": "Due: {tarih}",
  "Deadline'ı değiştir": "Change the deadline",
  "Takip linki": "Tracking link",
  "Takip linki oluştur": "Create tracking link",
  "Henüz iş yok.": "No jobs yet.",
  "Bu işte henüz proje yok.": "No projects in this job yet.",
  "Bu işte henüz rutin yok.": "No routines in this job yet.",
  "Rutin, bitişi olmayan ve tekrarlayan işler içindir — aylık bakım, haftalık raporlama, sosyal medya yönetimi gibi. Bitişi olan işler proje olarak açılır.":
    "A routine is for ongoing, repeating work — monthly maintenance, weekly reporting, social media. Work with an end date belongs in a project.",
  "Kapatılmış rutinler": "Closed routines",
  gizle: "hide",
  göster: "show",
  Bekleyen: "Pending",
  Biten: "Done",
  Kurduklarım: "Created by me",
  "Sahibi sensin — düzenleyebilir, ekip kurabilirsin": "You own these — you can edit them and build a team",
  Katıldıklarım: "Joined",
  "Ekibinde yer aldığın, başkasının yürüttüğü işler": "Jobs run by others where you are on the team",

  // ─────────────────────────────────────────────── Ekip ve davet
  "Ekip üyesi": "Team member",
  Kişi: "Person",
  "Bir kullanıcı": "A user",
  "Bilinmeyen kullanıcı": "Unknown user",
  Yönetici: "Owner",
  "Yanıt bekliyor": "Awaiting reply",
  Reddetti: "Declined",
  Reddet: "Decline",
  "Kabul et": "Accept",
  "Bu işe davet edildin": "You have been invited to this job",
  "{kisi} seni bu işin ekibine ekledi{unvan}. Kabul edene kadar iş anasayfanda görünmez.":
    "{kisi} added you to this job's team{unvan}. The job stays hidden from your home page until you accept.",
  "Daveti kabul ettin — bu iş artık anasayfandaki “Katıldıklarım” listesinde.":
    "You accepted the invite — this job is now under “Joined” on your home page.",
  "Daveti reddettin. İş sahibi bilgilendirildi.": "You declined the invite. The job owner has been notified.",
  "Bu işte henüz kimse yok. \"+\" düğmesiyle birini davet edebilirsin.":
    "Nobody is on this job yet. Invite someone with the \"+\" button.",
  "Bu kişiye atanmış görevler. Birine dokunarak ilgili proje ve çıktıya gidebilirsin.":
    "Tasks assigned to this person. Tap one to open its project and output.",
  "Henüz atanmış görevi yok.": "No tasks assigned yet.",
  "{kisi} için görev ata": "Assign a task to {kisi}",
  "Bu kişiye atamak istediğin görevleri işaretle. Bir görev yalnızca tek kişiye atanabilir.":
    "Check the tasks you want to assign to this person. A task can go to one person only.",
  atanmış: "assigned",
  "{done}/{total} görev": "{done}/{total} tasks",
  "şu an: {gorev}": "now: {gorev}",

  // ─────────────────────────────────────────────── Görevler ve çıktılar
  Görev: "Task",
  "Alt görev": "Subtask",
  "Üst görev": "Parent task",
  Görevler: "Tasks",
  Çıktılar: "Outputs",
  "Çıktıyı düzenle": "Edit output",
  "Görev veya çıktı ekle": "Add task or output",
  "Yeni çıktı": "New output",
  "Bu işte henüz görev yok.": "No tasks in this job yet.",
  "Bugün yapılacaklar": "Due today",
  "Tüm görevler": "All tasks",
  "Tıkla: görevi aç · Çift tıkla: görevin bulunduğu sayfaya git":
    "Click: open the task · Double-click: go to the page it lives on",
  "görevinin tüm alt görevleri tamamlandı. Bu görevi de tamamlandı olarak işaretlemek ister misin?":
    "— all of its subtasks are done. Mark this task complete too?",
  Hayır: "No",
  "Evet, tamamla": "Yes, complete it",
  "{n} görevi (varsa alt görevleriyle birlikte) arşive taşımak istediğine emin misin? Arşivlenen görevler bu listeden kalkar, arşivden geri getirilebilir.":
    {
      one: "Move {n} task (with its subtasks, if any) to the archive? Archived tasks leave this list and can be restored from the archive.",
      other:
        "Move {n} tasks (with their subtasks, if any) to the archive? Archived tasks leave this list and can be restored from the archive.",
    },
  "{n} görevi (varsa alt görevleriyle birlikte) silmek istediğine emin misin? Silindikten sonra birkaç saniye içinde Cmd/Ctrl+Z ile geri alabilirsin, sonrasında kalıcı olarak silinir.":
    {
      one: "Delete {n} task (with its subtasks, if any)? You have a few seconds to undo with Cmd/Ctrl+Z; after that it is gone for good.",
      other:
        "Delete {n} tasks (with their subtasks, if any)? You have a few seconds to undo with Cmd/Ctrl+Z; after that they are gone for good.",
    },
  "Çıktı, projenin ortaya çıkaracağı somut şey — bir müzik projesinde \"Sözler\", \"Master dosyası\", \"Albüm kapağı\" gibi. Görevleri bunların altında toplayabilirsin; zorunlu değil, istersen görevler sekmesinde düz liste olarak da çalışabilirsin.":
    "An output is something concrete the project delivers — on a music project, \"Lyrics\", \"Master file\", \"Album cover\". You can group tasks under them; it is optional, and you can stay with the flat list on the Tasks tab.",

  // ─────────────────────────────────────────────── Modüller
  "Modül ekle": "Add module",
  "Modül atama": "Module assignment",
  "Modül kaldırma": "Module removal",
  "Bu işe eklenebilecek modüller": "Modules you can add to this job",
  "Eklenebilecek başka modül yok.": "No other modules to add.",
  "Bu işe henüz modül eklenmedi. \"+\" düğmesiyle başlayabilirsin.":
    "No modules on this job yet. Start with the \"+\" button.",

  // ─────────────────────────────────────────────── Bütçe
  "Anlaşılan ücret": "Agreed fee",
  "Gelen ödeme": "Payment received",
  Beklenen: "Expected",
  Gider: "Expense",
  "Hakediş ödemesi": "Progress payment",
  "Net kazanç": "Net earnings",
  "Gelen ödeme − gider": "Payments received − expenses",
  "Projelere göre tahsilat": "Collection by project",
  "Henüz bütçesi olan bir projen yok.": "None of your projects have a budget yet.",
  "Tahsilat tamam": "Fully collected",
  " · +{tutar} fazla": " · +{tutar} over",
  "{tutar} anlaşıldı": "{tutar} agreed",
  Gelen: "Received",
  Net: "Net",
  "Düzenli ödemeler": "Recurring payments",
  "Düzenli ödeme ekle": "Add recurring payment",
  "Düzenli ödeme silme": "Recurring payment deletion",
  "Düzenli gelir": "Recurring income",
  "Düzenli gider": "Recurring expense",
  "Gelir / gider ekle": "Add income / expense",
  "Kayıt silme": "Entry deletion",
  "Bütçe kaydı eklendi": "Budget entry added",
  "Bütçe kaydı düzenlendi": "Budget entry edited",
  // Aralık etiketleri modül düzeyinde (intervalLabels), `// dil:anahtar` ile işaretli.
  "Her hafta": "Weekly",
  "Her ay": "Monthly",
  "Her yıl": "Yearly",
  "{aralik} · sonraki {tarih}": "{aralik} · next {tarih}",
  Duraklat: "Pause",
  Sürdür: "Resume",
  Düzenle: "Edit",
  "Kira, abonelik gibi tekrar eden ödemeleri sayfadaki \"+\" ile ekle. Vadesi gelince bütçene otomatik işlenir ve bildirim gönderilir.":
    "Add repeating payments like rent or subscriptions with the \"+\" on this page. They post to your budget automatically when due and you get a notification.",
  "Henüz bir hareket yok. Gelir/gider eklemek için sayfadaki \"+\" düğmesini kullan.":
    "No entries yet. Use the \"+\" button on this page to add income or an expense.",
  otomatik: "automatic",
  " · genel": " · general",
  "Ödeme / gider ekle": "Add payment / expense",

  // ─────────────────────────────────────────────── Arşiv
  "Arşivde henüz bir şey yok. Sildiğin yerine arşive eklediğin işler, projeler, görevler ve çıktılar burada görünecek.":
    "The archive is empty. Jobs, projects, tasks and outputs you archive instead of deleting show up here.",
  "{ust} içinde alt görev": "subtask in {ust}",
  "{tarih} tarihinde arşivlendi": "archived on {tarih}",
  "Geri getir": "Restore",
  "Getiriliyor…": "Restoring…",
  "{ad} - kalıcı olarak sil": "{ad} - delete permanently",
  "Kalıcı olarak sil": "Delete permanently",
  "Kalıcı silme": "Permanent deletion",
  "\"{ad}\" işini kalıcı olarak silmek istediğine emin misin? Bu işe bağlı tüm projeler, görevler ve çıktılar da kalıcı olarak silinecek. Bu işlem geri alınamaz.":
    "Delete the job \"{ad}\" permanently? Every project, task and output under it is deleted too. This cannot be undone.",
  "\"{ad}\" projesini kalıcı olarak silmek istediğine emin misin? Bu projeye bağlı tüm görevler, alt görevler ve çıktılar da kalıcı olarak silinecek. Bu işlem geri alınamaz.":
    "Delete the project \"{ad}\" permanently? Every task, subtask and output under it is deleted too. This cannot be undone.",
  "\"{ad}\" görevini kalıcı olarak silmek istediğine emin misin? Varsa bu göreve bağlı alt görevler de kalıcı olarak silinecek. Bu işlem geri alınamaz.":
    "Delete the task \"{ad}\" permanently? Its subtasks, if any, are deleted too. This cannot be undone.",
  "\"{ad}\" çıktısını kalıcı olarak silmek istediğine emin misin? Bu işlem geri alınamaz.":
    "Delete the output \"{ad}\" permanently? This cannot be undone.",

  // ─────────────────────────────────────────────── Kapak kütüphanesi
  // Hazır kapakların adları (lib/covers.ts, `// dil:anahtar`). Renk adları:
  // kısa tutuluyor, seçicide 72 px'lik karelerin altında duruyorlar.
  Arduvaz: "Slate",
  Bronz: "Bronze",
  Şafak: "Dawn",
  Sis: "Mist",
  Okyanus: "Ocean",
  Orman: "Forest",
  Kiremit: "Terracotta",
  Mor: "Violet",
  Kum: "Sand",
  Dalga: "Wave",
  Izgara: "Grid",
  Benek: "Dots",

  // ─────────────────────────────────────────────── Paylaşılan takip sayfası
  // Hesabı olmayan bir ziyaretçi okuyor: ton "siz", uygulamanın geri kalanındaki
  // "sen"den bilerek farklı — burada karşı taraf müşteri/yatırımcı.
  "Proje takip sayfası": "Project status page",
  "Bu bağlantı size özel": "This link is for you",
  "Devam etmek için bağlantının gönderildiği e-posta adresini yazın.":
    "Enter the email address the link was sent to.",
  "ornek@firma.com": "you@company.com",
  "Bu adres bu bağlantıya tanımlı değil. Bağlantıyı paylaşan kişiden doğru adresi teyit edebilirsiniz.":
    "This address is not registered for this link. Check it with the person who shared it.",
  "Kontrol ediliyor…": "Checking…",
  "Devam et": "Continue",
  "Adresiniz yalnızca bu bağlantıyı açmak için kullanılır; kaydedilmez ve size e-posta gönderilmez.":
    "Your address is used only to open this link; it is not stored and you will not be emailed.",
  "Bağlantı kurulamadı.": "Could not connect.",
  "Sayfa açılamadı": "Could not open the page",
  "Bağlantı kurulamadı. Sayfayı yenilemeyi dene.": "Could not connect. Try refreshing the page.",
  "Bu bağlantı artık aktif değil": "This link is no longer active",
  "Takip penceresi kapanmış. Projeyi paylaşan kişiden yeni bir bağlantı isteyebilirsiniz.":
    "The tracking window has closed. Ask the person who shared the project for a new link.",
  "Projelerinizi de böyle paylaşın": "Share your own projects this way",
  "Projelio, ekiplerin işlerini tek yerden yürüttüğü bir çalışma alanı. Müşterinize durum raporu hazırlamak yerine, göstermek istediğiniz kadarını gösteren bir bağlantı paylaşırsınız — karşı tarafın hesap açmasına gerek kalmadan.":
    "Projelio is a workspace where teams run their work in one place. Instead of writing a status report for your client, you share a link that shows exactly as much as you choose — with no account needed on their side.",
  "Görev, çıktı, bütçe ve dosyalar tek panoda": "Tasks, outputs, budget and files on one board",
  "Hangi bölümün paylaşılacağına bağlantı başına siz karar verirsiniz":
    "You decide which sections each link shares",
  "Proje bitince bağlantı kendiliğinden kapanır": "The link closes itself when the project ends",
  "Ücretsiz deneyin": "Try it free",
  "Projelio nedir?": "What is Projelio?",
  "Canlı · {saat}": "Live · {saat}",
  "Bu sayfa açık kaldığı sürece kendini günceller; yenilemeniz gerekmez.":
    "This page updates itself while it stays open; no need to refresh.",
  "Sorumlu: {kisi}": "Owner: {kisi}",
  "Görev eklendiğinde ilerleme burada görünecek.": "Progress will show here once tasks are added.",
  "{done}/{total} görev tamamlandı": "{done}/{total} tasks done",
  "{devam} devam ediyor · {bekleyen} bekliyor": "{devam} in progress · {bekleyen} waiting",
  Toplam: "Total",
  Harcanan: "Spent",
  Kalan: "Remaining",
  "Çıktılar ({n})": "Outputs ({n})",
  "Henüz çıktı eklenmemiş.": "No outputs added yet.",
  "Görevler ({n})": "Tasks ({n})",
  "Henüz görev eklenmemiş.": "No tasks added yet.",
  "Ekip ({n})": "Team ({n})",
  "Ekip bilgisi yok.": "No team information.",
  "Proje akışı": "Project feed",
  "Henüz paylaşım yok.": "No posts yet.",
  "Dosyalar ({n})": "Files ({n})",
  "Dosya yok.": "No files.",
  "Yalnızca dosya adları paylaşılıyor; dosyalar bu sayfadan indirilemez.":
    "Only file names are shared; files cannot be downloaded from this page.",
  "Bu sayfa Projelio ile hazırlandı": "This page was made with Projelio",
  "Ekipler projelerini Projelio'da yürütür, müşterisine durum raporu yazmak yerine böyle canlı bir bağlantı paylaşır — karşı tarafın hesap açmasına gerek kalmadan.":
    "Teams run their projects in Projelio and, instead of writing a status report, share a live link like this one — with no account needed on the client's side.",
  "Bu sayfa salt okunurdur ve proje sorumlusunun paylaştığı bölümleri gösterir.":
    "This page is read-only and shows the sections the project owner chose to share.",
};
