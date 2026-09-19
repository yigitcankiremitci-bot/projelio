import type { TranslationDict } from "@projelio/shared";

/**
 * Admin > E-posta ve E-posta maliyeti sekmeleri, "?" menüsündeki başlangıç
 * rehberi (lib/baslangicRehberi.ts) ve ipucu tercihinin metinleri.
 *
 * Ortak doğrulama mesajları (packages/shared/src/epostaYonetimi.ts) sunucu
 * sözlüğünde de var: aynı mesaj hem arayüzde hem sunucu istisnasında görünüyor.
 */
export const epostaYonetimi: TranslationDict = {
  "Alt görevler":
    "Subtasks",
  "Alıcı / konu":
    "Recipient / subject",
  "Alıcı başına":
    "Per recipient",
  "Bağlantı / ile başlayan bir uygulama yolu ya da https:// adresi olmalı.":
    "The link must be an in-app path starting with / or an https:// address.",
  "Bağlantı verdiysen düğme metnini de yaz.":
    "If you add a link, write the button text too.",
  "Başlangıç rehberi":
    "Getting started",
  "Birden fazla kişi toplu gönderim sayılır: ipucu ve duyuruları kapatmış olanlara gitmez.":
    "More than one person counts as a bulk send: it won't go to people who turned off tips and announcements.",
  "Bu dönemde Lio ile yazılmış gönderim yok.":
    "No Lio-written sends in this period.",
  "Bu dönemde Lio ile yazılmış ipucu yok.":
    "No Lio-written tips in this period.",
  "Bu dönemde kayıt yok.":
    "No records in this period.",
  "Bu ipucu silinsin mi?":
    "Delete this tip?",
  "Bu ipucu varsayılan metnine ve ayarlarına dönsün mü?":
    "Reset this tip to its default text and settings?",
  "Bu listeyi bir daha kendiliğinden açma":
    "Don't open this list automatically again",
  "Bu örneği Lio {birim} birime yazdı.":
    "Lio wrote this sample for {birim} units.",
  "Bütçe görevden projeye, işe, departmana ve şirkete doğru kendiliğinden toplanır. Bir gideri ait olduğu kademeye yaz; hiçbir şey iki kez sayılmaz, para birimleri birbirine karışmaz.":
    "The budget rolls up on its own from task to project, job, department and company. Record an expense at the level it belongs to; nothing is counted twice and currencies never get mixed.",
  "Bütün işlerindeki ve projelerindeki görevlerin tek bir listede. Güne buradan başla: bugün ne var, ne gecikti.":
    "The tasks from all your jobs and projects in one list. Start your day here: what's due today, what's overdue.",
  "Büyük bir işi başlanabilir parçalara böl: kartın içine alt görevler ekle. Alt görevler tamamlandıkça ana görevin ne kadar ilerlediği görünür.":
    "Break big work into pieces you can start: add subtasks inside the card. As subtasks get done, you see how far the main task has come.",
  "Deneme e-postası sana gönderildi.":
    "A test email was sent to you.",
  "Deneme gönderilemedi. E-posta adresin doğrulanmamış olabilir.":
    "Couldn't send the test. Your email address may not be verified.",
  "Departmanlar ve kadro":
    "Departments and staff",
  "Değiştirdiğin metin İngilizce kullanıcılara da bu hâliyle gider; Lio açıksa onların diline çevrilir.":
    "Text you change goes to English users as written; if Lio is on, it's translated into their language.",
  "Düzenlendi":
    "Edited",
  "Düğme metni":
    "Button text",
  "Düğme metni çok uzun.":
    "Button text is too long.",
  "E-posta gönderildi.":
    "Email sent.",
  "E-posta gönderilemedi.":
    "Couldn't send the email.",
  "E-posta önizlemesi":
    "Email preview",
  "Ekranı sesli gez":
    "Take the voice tour",
  "Ekranın hangi parçası ne işe yarıyor? İki dakikalık sesli tanıtımı istediğin zaman yeniden izleyebilirsin.":
    "Which part of the screen does what? You can replay the two-minute voice tour any time.",
  "Elle en fazla 500 kişi seçilebilir; daha geniş kitle için kitle seçeneklerini kullan.":
    "You can pick at most 500 people by hand; use the audience options for a wider group.",
  "En az iki harf yaz…":
    "Type at least two letters…",
  "Geçmiş yüklenemedi.":
    "Couldn't load the history.",
  "Giriş token":
    "Input tokens",
  "Gönderiliyor":
    "Sending",
  "Gönderilsin":
    "Send it",
  "Gönderim kuyruğa alındı.":
    "The send has been queued.",
  "Gönderimi durdur":
    "Stop sending",
  "Gönderimler":
    "Sends",
  "Görev kartları":
    "Task cards",
  "Gün sayısı 1 ile 365 arasında olmalı.":
    "The number of days must be between 1 and 365.",
  "Günlük ipucu e-postaları açık":
    "Daily tip emails on",
  "Hazır olduğunda örnekleri sil":
    "Delete the samples when you're ready",
  "Henüz e-posta gönderilmedi.":
    "No emails sent yet.",
  "Her hafta ya da her ay tekrar eden işler için rutin kur. Kuralı bir kez yazarsın; görevler vakti gelince kendiliğinden açılır ve kaçırılanlar görünür.":
    "Set up a routine for work that repeats every week or month. You write the rule once; tasks open on their own when they're due and missed ones show up.",
  "Her kart yapılacak tek bir iş. Kartı açıp başlığını, bitiş tarihini ve kime atandığını değiştirebilirsin; bitince tamamlandı olarak işaretle. Tarihi olan kartlar Yapılacaklar'da, takvimde ve sabah özet e-postasında görünür.":
    "Each card is a single piece of work. Open a card to change its title, due date and assignee; mark it as complete when it's done. Cards with a date show up in To-do, on the calendar and in your morning summary email.",
  "Herkes":
    "Everyone",
  "Hesabına \"Projelio'yu tanı\" adında örnek bir iş açtık. İçindeki proje, görev kartları ve rutin gerçek kayıtlar: aç, düzenle, tamamla — hiçbir şey bozulmaz. Her kartın açıklamasında o kartla ne deneyebileceğin yazıyor.":
    "We set up a sample job called \"Meet Projelio\" in your account. The project, task cards and routine inside are real records: open, edit, complete them — nothing will break. Each card's description tells you what to try with it.",
  "Kademeli bütçe":
    "Tiered budget",
  "Kalan alıcılara gönderim durdurulsun mu?":
    "Stop sending to the remaining recipients?",
  "Kapatırsan kimseye ipucu gitmez; her kullanıcı kaldığı yerden devam eder.":
    "If you turn this off, no one gets tips; everyone picks up where they left off.",
  "Kendime gönder":
    "Send to me",
  "Kime gideceğini seç.":
    "Choose who it goes to.",
  "Kitle":
    "Audience",
  "Konu boş olamaz.":
    "Subject can't be empty.",
  "Konu çok uzun.":
    "Subject is too long.",
  "Kullanıcı ara (ad, e-posta, kullanıcı adı)":
    "Search users (name, email, username)",
  "Kullanıcılara e-posta gönder, günlük ipucu dizisini yönet. Lio'nun yazdığı her e-postanın maliyeti E-posta maliyeti sekmesinde.":
    "Send emails to users and manage the daily tips series. What each Lio-written email costs is shown in the Email costs tab.",
  "Kuyrukta":
    "Queued",
  "Lio her alıcıya kendi yorumuyla yazsın":
    "Let Lio write it in its own words for each recipient",
  "Lio her kişiye farklı yazsın":
    "Let Lio write it differently for each person",
  "Lio ile önizle":
    "Preview with Lio",
  "Lio taslağı yazamadı.":
    "Lio couldn't write the draft.",
  "Lio taslağı yazdı ({birim} birim). Metni dilediğin gibi düzenleyebilirsin.":
    "Lio wrote the draft ({birim} units). Edit the text as you like.",
  "Lio taslağı yazsın":
    "Let Lio write the draft",
  "Lio yazıyor":
    "Written by Lio",
  "Lio yazıyor…":
    "Lio is writing…",
  "Lio çağrısı":
    "Lio calls",
  "Lio'nun e-posta yazarken harcadığı token ve bunun Lio Bakiyesi karşılığı (birim, komisyon dahil). Bu harcama kullanıcıların bakiyesinden düşmez; işletmenin gideridir.":
    "The tokens Lio spent writing emails and their Lio Units equivalent (units, commission included). This isn't deducted from anyone's balance; it's a business expense.",
  "Lio'nun ipuçlarında günlük harcama tavanı":
    "Lio's daily spending cap for tips",
  "Maliyet yüklenemedi.":
    "Couldn't load the costs.",
  "Mesajın anlamı aynı kalır; Lio her kişiye farklı cümlelerle, kişinin dilinde ve hesabının durumuna göre yazar. Herkese birebir aynı metnin gitmesi spam süzgeçlerine takılma ihtimalini artırır. Maliyet alıcı başınadır ve kimsenin bakiyesinden düşmez.":
    "The meaning stays the same; Lio writes to each person in different sentences, in their language and based on their account. Sending the exact same text to everyone makes spam filters more likely to flag it. The cost is per recipient and isn't deducted from anyone's balance.",
  "Model":
    "Model",
  "Otomatik ipuçları":
    "Automatic tips",
  "Paragrafları boş satırla ayır.":
    "Separate paragraphs with a blank line.",
  "Paragrafları boş satırla ayır. Selam satırı alıcının adıyla kendiliğinden eklenir.":
    "Separate paragraphs with a blank line. A greeting with the recipient's name is added automatically.",
  "Projelio ipuçları ve duyuruları":
    "Projelio tips and announcements",
  "Sana atanan bir görevi tamamlandı olarak işaretlediğinde görevi veren kişi bunu görür. Yaptım sayfasında da yaptığın işleri ve sürelerini kayıt altında tutabilirsin.":
    "When you mark a task assigned to you as complete, the person who gave it to you sees it. On the Yaptım page you can also keep a record of the work you did and how long it took.",
  "Sayılıyor…":
    "Counting…",
  "Sağ alttaki yapay zekâ yardımcısına düz cümlelerle yaz: \"yarın için üç görev ekle\", \"bu hafta neler gecikti?\". Cmd/Ctrl + K ile de açılır.":
    "Write to the AI assistant in the bottom right in plain sentences: \"add three tasks for tomorrow\", \"what's overdue this week?\". It also opens with Cmd/Ctrl + K.",
  "Sağlayıcı maliyeti":
    "Provider cost",
  "Seni davet eden şirketin yalnızca sana açılan modülünü ve sana atanan görevleri görürsün; şirketin diğer işleri ve bütçesi sana kapalı. Davet bildirimini kabul etmeyi unutma.":
    "You only see the module the inviting company opened to you and the tasks assigned to you; the company's other jobs and budget are closed to you. Don't forget to accept the invitation notification.",
  "Senin ipucun":
    "Your tip",
  "Son günlerde kayıt olanlar":
    "Recently signed up",
  "Son işlemler":
    "Recent activity",
  "Son {gun} gün":
    "Last {gun} days",
  "Son {gun} günde kayıt olanlar":
    "Signed up in the last {gun} days",
  "Sunucuda Lio için tanımlı bir AI sağlayıcısı yok; Lio işaretli ipuçları düz metin gider.":
    "There's no AI provider configured for Lio on the server; tips marked for Lio go out as plain text.",
  "Taslak yazdırma":
    "Draft writing",
  "Taslağı Lio'ya hazırlat (isteğe bağlı)":
    "Have Lio draft it (optional)",
  "Tavan aşılınca o gün kalan ipuçları Lio'suz, düz metin olarak gider. Toplu ve tekil gönderimler bu tavana dahil değil.":
    "Once the cap is reached, the rest of that day's tips go out as plain text without Lio. Bulk and single sends don't count toward this cap.",
  "Taşeron olarak ne görürsün":
    "What you see as a subcontractor",
  "Tek kişi":
    "One person",
  "Tek kişi: e-posta hemen ve destek adresinden gider; kişi yanıtlayabilir. Kişinin ipucu tercihine bakılmaz.":
    "One person: the email goes out immediately from the support address and they can reply. The person's tips preference isn't checked.",
  "Token":
    "Tokens",
  "Toplam birim":
    "Total units",
  "Toplam token":
    "Total tokens",
  "Toplu ve tekil gönderimler":
    "Bulk and single sends",
  "Turu başlat":
    "Start the tour",
  "Uzun süredir girmeyenler":
    "Inactive for a while",
  "Yalnızca doğrulanmış adresi olan ve ipucu/duyuruları kapatmamış kişiler sayılır. Her e-postada tek tık çıkış bağlantısı olur.":
    "Only people with a verified address who haven't turned off tips/announcements are counted. Every email has a one-click unsubscribe link.",
  "Yardım":
    "Help",
  "Yeni başlayanlara günde bir kısa ipucu (özetle aynı saatte, dizi birkaç haftada biter) ve ara sıra yenilik duyuruları.":
    "A short daily tip for newcomers (at the same time as your summary; the series ends after a few weeks) and the occasional product announcement.",
  "Yeni e-posta yaz":
    "Write a new email",
  "Yeni ipucu ekle":
    "Add a new tip",
  "adres doğrulanmamış":
    "address not verified",
  "birim":
    "units",
  "gün":
    "days",
  "sınırsız":
    "unlimited",
  "tekil":
    "single",
  "yanıt kullanılamadı":
    "response unusable",
  "{birim} birim":
    "{birim} units",
  "{gun} gündür girmeyenler":
    "Inactive for {gun} days",
  "{g}/{n} gönderildi":
    "{g}/{n} sent",
  "{n} aktif ipucu — her kullanıcıya günde bir tane, sırayla.":
    "{n} active tips — one a day per user, in order.",
  "{n} alıcı için yaklaşık {toplam} birim.":
    "About {toplam} units for {n} recipients.",
  "{n} atlandı":
    "{n} skipped",
  "{n} kişi":
    "{n} people",
  "{n} kişiye dakikada birkaç e-posta olacak şekilde gidiyor. İlerlemeyi Geçmiş sekmesinden izleyebilirsin.":
    "Going out to {n} people, a few emails a minute. You can follow the progress in the History tab.",
  "{n} kişiye e-posta gönderilecek. Bu işlem geri alınamaz. Devam edilsin mi?":
    "An email will be sent to {n} people. This can't be undone. Continue?",
  "{n} kişiye gönder":
    "Send to {n} people",
  "{n} seçili kişi":
    "{n} selected people",
  "Çağrı":
    "Calls",
  "Çıkış token":
    "Output tokens",
  "Önizleme hazırlanamadı.":
    "Couldn't prepare the preview.",
  "Önizleme ve denemeler":
    "Previews and tests",
  "Örn: Yeni bütçe özelliğini anlatan, kısa ve samimi bir e-posta. Sonunda bütçe sekmesini denemeye davet etsin.":
    "E.g.: A short, friendly email about the new budget feature. End by inviting them to try the budget tab.",
  "Örnek iş açılamadı.":
    "Couldn't open the sample job.",
  "Örnek işin":
    "Your sample job",
  "Örnek işin sayfasındaki \"Örnekleri sil\" düğmesi örnek işi, projesini, görevlerini ve rutinini birlikte kaldırır. Kendi açtığın işlere dokunmaz; örnekleri Ayarlar > Yardımcılar'dan yeniden ekleyebilirsin.":
    "The \"Delete samples\" button on the sample job's page removes the sample job with its project, tasks and routine. It doesn't touch the jobs you created; you can add the samples back from Settings > Helpers.",
  "İpucu":
    "Tip",
  "İpucu eklendi.":
    "Tip added.",
  "İpuçları":
    "Tips",
  "İpuçları yüklenemedi.":
    "Couldn't load the tips.",
  "İşini teslim et":
    "Deliver your work",
  "İşlem":
    "Operation",
  "İşlem gerçekleştirilemedi.":
    "The action couldn't be completed.",
  "İşlem türüne göre":
    "By operation type",
  "Şirket sayfasında departmanlarını kur ve çalışanlarını kadroya davet et; her departmanın kendi görev panosu ve modülleri olur. Dışarıdan hizmet aldığın kişileri taşeron olarak ekle — yalnızca kendilerine açılan modülü görürler.":
    "Set up your departments on the company page and invite your employees to their staff; each department gets its own task board and modules. Add people you work with from outside as subcontractors — they only see the module opened to them.",
  "Şirketlerimi aç":
    "Open my companies",
  // Sunucu sözlüğünde de var (ipucu düğmeleri); burada rehber ve sekme için.
  "Yapılacaklar'ı aç":
    "Open To-do",
  "Yaptım'ı aç":
    "Open Yaptım",
  "E-posta maliyeti":
    "Email costs",
  // Planlı gönderim (migration 123)
  "Daha sonra gönder":
    "Send later",
  "E-posta planlandı.":
    "Email scheduled.",
  "Gönderim zamanı":
    "Send time",
  "Hemen gönder":
    "Send now",
  "Planla":
    "Schedule",
  "Planlanan gönderim iptal edilsin mi?":
    "Cancel the scheduled send?",
  "Planlandı: {zaman}":
    "Scheduled: {zaman}",
  "Planı iptal et":
    "Cancel schedule",
  "Saat, bu cihazın saatiyle. Alıcı listesi şimdi belirlenir; gönderim seçtiğin anda başlar. Planı Geçmiş sekmesinden iptal edebilirsin.":
    "The time is in this device's time zone. The recipient list is set now; sending starts at the time you pick. You can cancel the schedule from the History tab.",
  "{zaman} tarihinde {n} kişiye gidecek. Geçmiş sekmesinden iptal edebilirsin.":
    "It will go to {n} people on {zaman}. You can cancel it from the History tab.",
  "En fazla 60 gün ilerisine planlanabilir.":
    "You can schedule at most 60 days ahead.",
  "Geçersiz gönderim zamanı.":
    "Invalid send time.",
  "Gönderim zamanı geçmişte olamaz.":
    "The send time can't be in the past.",
};
