import type { TranslationDict } from "@projelio/shared";

/**
 * Kenar çubuğu, üst çubuk, alt menü ve sekmeler.
 *
 * Bu metinler her ekranda görünüyor ve yerleri en dar olanlar: kenar çubuğu
 * bağlantıları tek satıra, alt menü etiketleri simgenin altına sığmak zorunda.
 * Karşılıkları olabildiğince kısa tutuldu.
 */
export const gezinme: TranslationDict = {
  // ─────────────────────────────────────────────── Ana bağlantılar
  "Ana Sayfa": "Home",
  "İşlerim": "My jobs",
  "Bütçe": "Budget",
  Dosyalar: "Files",
  Takvim: "Calendar",
  Yapılacaklar: "To do",
  Ayarlar: "Settings",
  Admin: "Admin",
  "Çıkış": "Sign out",

  // Ana Sayfa düğmesinin hedefi kullanıcı tarafından değiştirilebiliyor;
  // ipucu o hedefi gösteriyor.
  "Ana Sayfa → {hedef}": "Home → {hedef}",
  "Ana Sayfa düğmesini ayarla": "Configure the Home button",
  "Ana Sayfa düğmesinin gideceği yeri değiştir": "Change where the Home button goes",

  // ─────────────────────────────────────────────── Kenar çubuğu
  "Sidebar'ı aç": "Open sidebar",
  "Sidebar'ı kapat": "Close sidebar",
  Daralt: "Collapse",
  "Genişlet": "Expand",

  // ─────────────────────────────────────────────── Sekmeler
  "Sekmeleri sola kaydır": "Scroll tabs left",
  "Sekmeleri sağa kaydır": "Scroll tabs right",
  "Sık kullandığın için üste alındı": "Moved to the top because you use it often",

  // ─────────────────────────────────────────────── Oluşturma düğmesi (alt menü)
  // Bağlama göre değişen etiketler: bulunduğun sayfa neyi eklemene izin
  // veriyorsa düğme onu söylüyor.
  "Oluştur": "Create",
  "Yeni iş": "New job",
  "Yeni görev": "New task",
  "Şirket kur": "Start a company",
  "İşletme aç": "Open a business",
  "Proje, rutin veya görev ekle": "Add a project, routine or task",
  "İş, şirket veya işletme ekle": "Add a job, company or business",
  // ══════════════════════════════════════════════ Kullanım turu
  //
  // Her adımın iki metni var: kısa YAZILI metin ve daha akıcı SESLİ anlatım.
  // İkisi de burada. Ses kaydı ayrı bir iş: /tour-audio/<dil>/… altında aranır,
  // İngilizce kayıt yüklenene kadar cihazın kendi sesi okur (narrator.ts).

  // ─────────────────────────────────────────────── İlk bakış turu
  "Projelio'ya ilk bakış": "A first look at Projelio",
  "Ekranın hangi parçası ne işe yarıyor? 2 dakikalık genel tanıtım.":
    "What does each part of the screen do? A 2-minute overview.",
  "Hoş geldin": "Welcome",
  "Projelio'yu birlikte gezelim. Anlatım hem sesli hem yazılı ilerler; istediğin an duraklatabilir, geri alabilir ya da turu kapatabilirsin.":
    "Let's walk through Projelio together. The narration runs as both audio and text; you can pause, step back or close the tour whenever you like.",
  "Projelio'ya hoş geldin. Şimdi ekranı birlikte gezeceğiz. Anlatım hem sesli hem yazılı ilerliyor. İstediğin an duraklatabilir, bir adım geri alabilir ya da turu tamamen kapatabilirsin.":
    "Welcome to Projelio. We'll walk through the screen together. The narration runs as both audio and text. You can pause at any point, step back, or close the tour entirely.",

  "Sol menü": "The left menu",
  "Uygulamanın ana gezinme alanı burası. Ana Sayfa, Bütçe, Dosyalar, Takvim ve Yapılacaklar tek tıkla buradan açılır.":
    "This is the app's main navigation. Home, Budget, Files, Calendar and To do are one click away.",
  "Solda gördüğün menü, uygulamanın ana gezinme alanı. Ana Sayfa, Bütçe, Dosyalar, Takvim ve Yapılacaklar sayfalarına buradan tek tıkla geçebilirsin. Dar ekranda bu menü gizlenir; sol üstteki oka basınca bir çekmece gibi açılır.":
    "The menu on the left is the app's main navigation. Home, Budget, Files, Calendar and To do are one click away. On a narrow screen it's hidden; the arrow at the top left slides it open like a drawer.",

  "Yapı ağacı": "The structure tree",
  "Gruplarını, organizasyonlarını ve işlerini iç içe gösteren ağaç. Bir satırı açınca altındaki departmanlar ve projeler görünür.":
    "A tree showing your groups, organizations and jobs nested together. Open a row to reveal the departments and projects beneath it.",
  "Menünün altındaki bu ağaç, gruplarını, organizasyonlarını ve işlerini iç içe gösterir. Bir satırın önündeki oka bastığında altındaki departmanlar ve projeler açılır. Hangi işin nereye bağlı olduğunu en hızlı buradan görürsün.":
    "The tree below the menu shows your groups, organizations and jobs nested together. Click the arrow in front of a row to open the departments and projects under it. It's the fastest way to see what belongs where.",

  "Ana sayfa sekmeleri": "The home tabs",
  "Ana sayfa dört sekmeden oluşur: İşler, Bütçe, Dosyalar ve Modüller. Hepsi aynı sayfada, sekme değiştirerek geçersin.":
    "The home page has four tabs: Jobs, Budget, Files and Modules. They're all on the same page; you switch between them.",
  "Ana sayfan dört sekmeden oluşuyor: İşler, Bütçe, Dosyalar ve Modüller. Dördü de aynı sayfada duruyor, aralarında sekme değiştirerek geçiyorsun. Birazdan her birini ayrı ayrı anlatan turları da görebileceksin.":
    "Your home page has four tabs: Jobs, Budget, Files and Modules. All four live on the same page and you switch between them. In a moment you'll also see separate tours for each one.",

  "Yeni bir şey oluştur": "Create something new",
  "Ortadaki artı düğmesi bulunduğun sayfaya göre iş, proje, görev ya da kayıt ekler. Ana sayfada ayrıca şirket kurma ve işletme açma seçenekleri de buradan çıkar.":
    "The plus button in the middle adds a job, project, task or record depending on the page you're on. On the home page it also offers starting a company or opening a business.",
  "Ekranın altındaki artı düğmesi, bulunduğun sayfaya göre farklı şeyler ekler. Ana sayfadayken yeni bir iş açarsın; büyümek istediğinde şirket kurma ve işletme açma seçenekleri de aynı düğmenin altında durur. Bir projenin içindeyken ise görev ya da çıktı oluşturur.":
    "The plus button at the bottom adds different things depending on where you are. On the home page it starts a new job; when you're ready to grow, starting a company and opening a business sit under the same button. Inside a project it creates a task or an output.",

  "Sana atanan görevler, yaklaşan teslim tarihleri ve ekip hareketleri bu zilin altında toplanır.":
    "Tasks assigned to you, upcoming deadlines and your team's activity all gather under this bell.",
  "Sağ üstteki zil, bildirimlerin. Sana atanan görevler, yaklaşan teslim tarihleri ve ekibinin hareketleri burada toplanır. Okunmamış bir şey varsa zilin üstünde küçük bir işaret belirir.":
    "The bell at the top right is your notifications. Tasks assigned to you, upcoming deadlines and your team's activity gather here. A small mark appears on the bell when something is unread.",

  "Lio, yapay zekâ asistanın": "Lio, your AI assistant",
  "Sağ alttaki Lio'ya yazarak plan çıkarabilir, görev oluşturabilir ya da bir şeyi nasıl yapacağını sorabilirsin. Kısayolu: Command veya Ctrl artı K.":
    "Write to Lio at the bottom right to draw up a plan, create tasks or ask how something works. The shortcut is Command or Ctrl plus K.",
  "Sağ altta duran Lio, Projelio'nun yapay zekâ asistanı. Ona yazarak plan çıkarabilir, görev oluşturabilir ya da bir şeyi nasıl yapacağını sorabilirsin. Klavyeden Command K, Windows'ta Control K ile de açılır.":
    "Lio at the bottom right is Projelio's AI assistant. Write to it to draw up a plan, create tasks or ask how something works. Command K on a Mac, Control K on Windows also opens it.",

  "Turu istediğin an tekrar başlat": "Restart the tour whenever you like",
  "Bu soru işareti her sayfada duruyor. Tıkladığında o sayfayla ilgili anlatımları listeler; dilediğini baştan dinleyebilirsin.":
    "This question mark is on every page. Click it to list the walkthroughs for that page and replay any of them.",
  "Son olarak şunu bilmeni isterim: bu soru işareti her sayfada duruyor. Tıkladığında bulunduğun sayfayla ilgili anlatımları listeler. Bir şeyi unuttuğunda ya da yeni bir alana geçtiğinde buradan istediğin turu baştan dinleyebilirsin. Hazırsan başlayalım.":
    "One last thing: this question mark is on every page. Click it and it lists the walkthroughs for the page you're on. Whenever you forget something or move into a new area, you can replay any tour from here. Let's begin.",

  // ─────────────────────────────────────────────── Ana sayfa sekmeleri turu
  "Ana sayfadaki dört sekme": "The four tabs on the home page",
  "İşler, Bütçe, Dosyalar ve Modüller sekmeleri ne gösterir?":
    "What do the Jobs, Budget, Files and Modules tabs show?",
  "Erişebildiğin tüm işler burada kart olarak listelenir. Kartın üstündeki göstergeler işin ilerlemesini ve gecikmiş görevlerini özetler.":
    "Every job you can reach is listed here as a card. The indicators on a card summarise its progress and any overdue tasks.",
  "İşler sekmesi, erişebildiğin bütün işleri kart olarak listeler. Her kartın üstündeki göstergeler o işin ilerlemesini ve varsa gecikmiş görevlerini özetler. Bir karta tıkladığında işin kendi sayfası açılır.":
    "The Jobs tab lists every job you can reach as a card. The indicators on each card summarise that job's progress and any overdue tasks. Click a card to open the job's own page.",
  "Gelir ve giderlerini tek yerde toplar. Kayıtları iş, proje ya da departman bazında ayırabilirsin.":
    "Gathers your income and spending in one place. You can break the records down by job, project or department.",
  "Bütçe sekmesi gelir ve giderlerini tek yerde toplar. Kayıtları iş, proje ya da departman bazında ayırabilir; tekrarlayan ödemeleri bir kez tanımlayıp otomatik işlemesini sağlayabilirsin.":
    "The Budget tab gathers your income and spending in one place. You can break the records down by job, project or department, and define a recurring payment once so it records itself from then on.",
  "İşlerine yüklenmiş bütün dosyalar tek listede. Google Drive ya da OneDrive bağlıysa oradaki klasörlere de buradan ulaşırsın.":
    "Every file uploaded to your jobs in one list. If Google Drive or OneDrive is connected, you can reach those folders from here too.",
  "Dosyalar sekmesinde, işlerine yüklenmiş bütün dosyalar tek bir listede toplanır. Google Drive ya da OneDrive hesabını bağladıysan, oradaki klasörlerine de buradan ulaşabilir, dosyayı uygulamadan çıkmadan önizleyebilirsin.":
    "The Files tab gathers every file uploaded to your jobs into a single list. If you've connected Google Drive or OneDrive you can reach those folders from here as well, and preview a file without leaving the app.",
  "Finans, İnsan Kaynakları, Satış gibi hazır çalışma alanları. Departmanına ekleyince ilgili kayıt ekranları hazır gelir.":
    "Ready-made work areas like Finance, Human Resources and Sales. Add one to a department and its record screens come ready.",
  "Modüller sekmesi, Finans, İnsan Kaynakları, Satış gibi hazır çalışma alanlarını gösterir. Bir modülü departmanına eklediğinde, o alana ait kayıt ekranları hazır olarak gelir; sıfırdan tablo kurmana gerek kalmaz.":
    "The Modules tab shows ready-made work areas like Finance, Human Resources and Sales. Add a module to a department and its record screens come ready — you don't have to build a table from scratch.",

  // ─────────────────────────────────────────────── Bütçe turu
  "Bütçeyi kullanmak": "Using the budget",
  "Gelir-gider girmek, tekrarlayan ödemeler ve bütçe özetleri.":
    "Entering income and expenses, recurring payments and budget summaries.",
  "Bütçe sekmesi": "The Budget tab",
  "Bütçe, girdiğin her gelir ve gideri işlerine bağlar. Böylece hangi işin ne kazandırdığını ayrı ayrı görürsün.":
    "The budget ties every income and expense you enter to a job, so you can see what each one earns you.",
  "Bütçe sekmesi, girdiğin her gelir ve gideri bir işe ya da departmana bağlar. Bu sayede toplam rakamın yanında, hangi işin ne kazandırdığını da ayrı ayrı görebilirsin.":
    "The Budget tab ties every income and expense you enter to a job or a department. Alongside the overall figure, you can see what each job brings in.",
  "Kayıt eklemek": "Adding a record",
  "Yeni bir gelir ya da gider eklerken tutar, tarih ve bağlı olduğu işi seçersin. Tekrarlayan bir ödemeyse bir kez tanımlaman yeterli.":
    "When you add income or an expense you pick the amount, the date and the job it belongs to. For a recurring payment you only define it once.",
  "Yeni bir kayıt eklerken tutarı, tarihi ve kaydın bağlı olduğu işi seçersin. Kira ya da abonelik gibi tekrarlayan bir ödemeyse, tekrarlayan ödeme olarak bir kez tanımlaman yeterli; sonraki aylarda kendiliğinden işlenir.":
    "When you add a record you pick the amount, the date and the job it belongs to. If it's recurring — rent or a subscription — define it once as a recurring payment and it records itself in the following months.",

  // ─────────────────────────────────────────────── Takvim turu
  "Takvim ve planlama": "Calendar and planning",
  "Görevlerin takvime nasıl düşer, çalışma ritmini nasıl kurarsın?":
    "How your tasks land on the calendar, and how you set your work rhythm.",
  "Teslim tarihi olan her görev burada görünür. Bir günü tıklayarak o güne doğrudan iş ekleyebilirsin.":
    "Every task with a due date appears here. Click a day to add work straight to it.",
  "Takvimde, teslim tarihi olan her görev otomatik olarak görünür. Bir güne tıklayarak o güne doğrudan yeni bir iş ekleyebilir, mevcut bir görevi sürükleyerek başka bir güne taşıyabilirsin.":
    "Every task with a due date shows up on the calendar automatically. Click a day to add new work straight to it, or drag an existing task to move it to another day.",
  "Hangi günler ve saatlerde çalıştığını tanımlarsan, planlama bu ritme göre yapılır.":
    "Define which days and hours you work and the planning follows that rhythm.",
  "Çalışma ritmi ayarında hangi günler ve hangi saatlerde çalıştığını tanımlayabilirsin. Planlama bunu dikkate alır: kapalı olduğun günlere iş yazmaz, teslim tarihlerini buna göre önerir.":
    "In the work rhythm settings you define which days and hours you work. Planning takes that into account: it won't schedule work on your days off, and it suggests deadlines accordingly.",

  // ─────────────────────────────────────────────── Lio turu
  "Lio ile çalışmak": "Working with Lio",
  "Yapay zekâ asistanına ne sorabilirsin, nasıl en iyi sonucu alırsın?":
    "What can you ask your AI assistant, and how do you get the best out of it?",
  "Lio'yu açmak": "Opening Lio",
  "Sağ alttaki maskota tıkla ya da Command / Ctrl + K tuşlarına bas.":
    "Click the mascot at the bottom right, or press Command / Ctrl + K.",
  "Lio'yu sağ alttaki maskota tıklayarak ya da klavyeden Command K, Windows'ta Control K tuşlarıyla açarsın. Hangi sayfada olursan ol, aynı yerden ulaşılır.":
    "Open Lio by clicking the mascot at the bottom right, or with Command K on a Mac and Control K on Windows. It's in the same place whatever page you're on.",
  "Ne sorabilirsin?": "What can you ask?",
  '"Bu proje için görev listesi çıkar", "bu ayki giderleri özetle", "yarın neye odaklanmalıyım" gibi isteklerle konuşabilirsin.':
    'You can talk to it with requests like "draw up a task list for this project", "summarise this month\'s expenses" or "what should I focus on tomorrow".',
  "Lio'ya gündelik dille yazabilirsin. Örneğin: bu proje için bir görev listesi çıkar, bu ayki giderleri özetle, ya da yarın neye odaklanmalıyım. Ne kadar çok bağlam verirsen sonuç o kadar isabetli olur.":
    "You can write to Lio in plain language. For example: draw up a task list for this project, summarise this month's expenses, or what should I focus on tomorrow. The more context you give, the better the answer.",

  "İşler": "Jobs",
  // Tur denetimleri
  "Turu kapat (Esc)": "Close the tour (Esc)",
  "Sesi aç": "Turn sound on",
  "Sesi kapat": "Turn sound off",
  "Duraklat": "Pause",
  "{tur} — adım {n} / {toplam}": "{tur} — step {n} of {toplam}",
  "{tur} — sesli anlat": "{tur} — narrated",
};
