import type { TranslationDict } from "@projelio/shared";

/**
 * Yeni üyenin ilk oturumda geçtiği ekranlarda kalan metinler: ana sayfa,
 * iş/proje/görev pencereleri, takvim, ayarlar, bilgi kartı, hata ekranı.
 *
 * Bunların çoğu denetimin göremediği yerlerdeydi: Türkçeye özgü harf
 * taşımayan dizeler ("Proje oluştur", "Sonraki") ve parantez içeren JSX
 * metinleri ("Tutar (₺)"). Yabancı test kullanıcıları İngilizce arayüzün
 * ortasında bunları Türkçe görüyordu.
 */
export const ilkAdimlar: TranslationDict = {
  // ─────────────────────────────────────────────── Genel
  "Ana sayfa": "Home",
  "Projelio - Ana sayfa": "Projelio - Home",
  "Ara…": "Search…",
  "Ekleniyor…": "Adding…",
  "Siliniyor…": "Deleting…",
  "Taşınıyor…": "Moving…",
  "Kapatılıyor…": "Closing…",
  "Hesaplanıyor…": "Calculating…",
  "Kaydedilemedi. Tekrar dene.": "Couldn't save. Try again.",
  "Kayıt eklenemedi. Tekrar dene.": "Couldn't add the entry. Try again.",
  "Kayıt güncellenemedi. Tekrar dene.": "Couldn't update the entry. Try again.",
  "İşlem başarısız.": "Something went wrong.",
  "Onaylanamadı": "Couldn't approve",
  "Veri yok.": "No data.",
  "Bilinmeyen": "Unknown",
  "Önceki": "Previous",
  "Sonraki": "Next",
  "İleri": "Next",
  "Yaz": "Write",
  "Nereye": "Where",
  "Sayfalar": "Pages",
  "Şirketler": "Companies",
  "Hedef ara": "Search destinations",
  "Tamamını görmek için çift tıkla": "Double-click to see all of it",
  "Özeti aç": "Show summary",
  "Özeti kapat": "Hide summary",
  "Kopyalamak için tıkla": "Click to copy",
  "Proje (opsiyonel)": "Project (optional)",
  "Seçili kişi": "Selected person",
  "Ödeme": "Payment",

  // ─────────────────────────────────────────────── Hata ekranı
  "Yeni sürüm yayımlandı": "A new version is out",
  "Beklenmeyen bir hata oluştu": "Something unexpected went wrong",
  "Uygulamanın yeni bir sürümü var. Sayfayı yenileyerek devam edebilirsiniz.":
    "There's a new version of the app. Refresh the page to continue.",
  "Bu bölüm açılamadı. Verileriniz güvende — başka bir sayfaya geçebilir veya yeniden deneyebilirsiniz.":
    "This section couldn't open. Your data is safe; you can go to another page or try again.",
  "Verileriniz güvende. Sayfayı yenileyerek devam edebilirsiniz.":
    "Your data is safe. Refresh the page to continue.",

  // ─────────────────────────────────────────────── Oluşturma pencereleri
  "İş oluştur": "Create job",
  "Proje oluştur": "Create project",
  "Görev oluştur": "Create task",
  "Çıktı oluştur": "Create output",
  "Rutin oluştur": "Create routine",
  "Grup oluştur": "Create group",
  "Organizasyon oluştur": "Create organization",
  "Yeni grup": "New group",
  "Yeni grup (holding)": "New group (holding)",
  "Yeni organizasyon": "New organization",
  "Yeni organizasyon (şirket/marka)": "New organization (company/brand)",
  "Bu gruba organizasyon ekle": "Add an organization to this group",
  "Bağlı olduğu grup (opsiyonel)": "Parent group (optional)",
  "Marka yenileme": "Brand refresh",
  "Anlaşılan ücret (₺)": "Agreed fee (₺)",
  "Dönemsel ücret (₺)": "Recurring fee (₺)",
  "Deadline'ı güncelle": "Update deadline",

  // ─────────────────────────────────────────────── Arşivle / sil (EntityDangerZone)
  //
  // Nesne adları cümlenin içine giriyor ("Delete job"), bu yüzden küçük harf.
  "{nesne} arşive ekle": "Archive {nesne}",
  "{nesne} sil": "Delete {nesne}",
  "{nesne} arşivleme": "Archiving {nesne}",
  "{nesne} silme": "Deleting {nesne}",
  "İşi ##nesne": "job",
  "Projeyi ##nesne": "project",
  "Çıktıyı ##nesne": "output",
  "Rutini ##nesne": "routine",
  "Grubu ##nesne": "group",
  "Organizasyonu ##nesne": "organization",
  "Departmanı ##nesne": "department",
  "Ürün/Hizmeti ##nesne": "product/service",
  "Görevi ##nesne": "task",
  "Alt görevi ##nesne": "subtask",

  // ─────────────────────────────────────────────── Kişi seçimi ve ekip
  "İsim yazarak ara…": "Search by name…",
  "Kişi eklemek için isim yaz…": "Type a name to add someone…",
  "Birincil atanan": "Primary assignee",
  "Bu departmanda kadro üyesi yok": "This department has no staff members",
  "Bu projede ekip üyesi yok": "This project has no team members",
  "Üye eklenemedi. Tekrar dene.": "Couldn't add the member. Try again.",
  "Davet gönderilemedi. Tekrar dene.": "Couldn't send the invitation. Try again.",
  "Davet gönderiliyor…": "Sending invitation…",
  "Sahip": "Owner",
  "Bu projeden ayrılmak istediğine emin misin? Sana atanmış görevler ekipte kalır.":
    "Are you sure you want to leave this project? Tasks assigned to you stay with the team.",
  "Kişi ata": "Assign someone",
  "Atanamadı": "Couldn't assign",
  "Rol değiştirilemedi": "Couldn't change the role",
  "Çıkarılamadı": "Couldn't remove",
  "Bu modüle henüz kimse atanmadı.": "No one is assigned to this module yet.",
  "Bu modüle henüz kimse atanmadı. Atanan kişiler burada kayıt oluşturup düzenleyebilir.":
    "No one is assigned to this module yet. Assigned people can create and edit records here.",
  "Kadro listesi yüklenemedi. Sayfayı yenileyip tekrar dene.":
    "Couldn't load the staff list. Refresh the page and try again.",
  "Bu işin ekibi henüz boş. Önce ekibe kişi ekle.": "This job's team is empty. Add someone to the team first.",
  "Bu departmanın kadrosu henüz boş. Önce kadroya kişi ekle.":
    "This department has no staff yet. Add someone to the staff first.",
  "Kadrodaki herkes ya bu modüle zaten atanmış ya da daveti henüz kabul etmemiş. Daveti bekleyenler kabul edince burada görünür.":
    "Everyone on the staff is either already assigned to this module or hasn't accepted their invitation yet. Pending invitees show up here once they accept.",
  "Bir taşeron": "A subcontractor",
  "Ret gerekçesi (isteğe bağlı) — talep sahibi görecek:": "Reason for rejection (optional); the requester will see it:",

  // ─────────────────────────────────────────────── Görevler
  "Bir proje seç": "Pick a project",
  "Bir departman seç": "Pick a department",
  "Görevler çıktıya taşındı": "Tasks moved to the output",
  "Görevler çıktıdan çıkarıldı": "Tasks removed from the output",
  "Görevler çıktıya taşınamadı": "Couldn't move the tasks to the output",
  "Seçimde alt görev yok": "No subtasks in the selection",
  "Uygun görev yok": "No eligible tasks",
  "Kişisel görev silme": "Deleting personal task",
  "Kaynak filtresi": "Source filter",
  "Geri alınacak bir işlem yok": "Nothing to undo",
  "İleri alınacak bir işlem yok": "Nothing to redo",
  "Erişebildiğin projelerde açık görev yok.": "There are no open tasks in the projects you can access.",
  "Atanan": "Assignee",

  // ─────────────────────────────────────────────── Paylaşım akışı
  "Şirketle bir şey paylaş… @ ile herhangi bir departman kadrosundan birini etiketleyebilirsin (140 karakter)":
    "Share something with the company… Use @ to tag anyone from any department's staff (140 characters)",
  "Departmanla bir şey paylaş… @ ile kadrodan birini etiketleyebilirsin (140 karakter)":
    "Share something with the department… Use @ to tag someone from the staff (140 characters)",
  "Ekiple bir şey paylaş… @ ile ekipten birini etiketleyebilirsin (140 karakter)":
    "Share something with the team… Use @ to tag someone on the team (140 characters)",
  "Yorum yap": "Comment",

  // ─────────────────────────────────────────────── Rutin sağlığı ve plan
  "Düzenli": "On track",
  "Aksıyor": "Slipping",
  "Bozuldu": "Broken",
  "Rutin yok": "No routine",
  "Hafta": "Week",
  "Günlük": "Daily",
  "Günlük plan": "daily plan",
  "Haftalık planlama": "weekly planning",
  "Aylık planlama": "monthly planning",
  "{ad} zamanı": "Time for {ad}",
  "Bugünü kuralım. Tek bir işi bitirmiş olarak günü kapatmak, yarısı yapılmış beş işten iyidir.":
    "Let's set up today. Ending the day with one thing finished beats five things half done.",
  "Haftaya başlamadan önce nereye ağırlık vereceğine karar ver; takvim gerisini halleder.":
    "Before the week starts, decide where to put your weight; the calendar handles the rest.",
  "Ay ölçeğinde saat değil sonuç konuşulur: ay sonunda neyin bitmiş olacağını yaz.":
    "At the monthly scale you talk results, not hours: write down what will be finished by the end of the month.",
  "Zaman bloğu": "Time block",
  "Yeni zaman bloğu": "New time block",
  "Ne üzerinde çalışacaksın?": "What will you work on?",
  "Blok kaydedilemedi.": "Couldn't save the block.",
  "Blok silinemedi.": "Couldn't delete the block.",
  "Tamamlandı işaretle": "Mark as done",
  "Tamamlandı işaretini kaldır": "Unmark as done",
  "Doluluk": "Utilization",
  "Plana sadakat": "Plan adherence",
  "Kategorisiz": "Uncategorized",
  "Hedefler kaydedilemedi.": "Couldn't save the goals.",
  "Ayarlar kaydedilemedi.": "Couldn't save the settings.",
  "Mesai saatleri": "Working hours",
  "Takvim yüklenemedi.": "Couldn't load the calendar.",
  "Dağıtım yapılamadı.": "Couldn't distribute.",
  "Plan bloğu ekle": "Add plan block",
  "Otomatik dağıt": "Auto-distribute",

  // ─────────────────────────────────────────────── Bütçe
  "Gelen ödeme (müşteriden tahsilat)": "Incoming payment (from the client)",
  "Gider (malzeme, abonelik…)": "Expense (materials, subscriptions…)",
  "Hakediş ödemesi (taşeron/ekip)": "Payout (subcontractor/team)",
  "Gider (kira, abonelik…)": "Expense (rent, subscriptions…)",
  "Gelir (düzenli tahsilat…)": "Income (recurring collection…)",
  "Düzenli ödemeyi düzenle": "Edit recurring payment",
  "Örn. Müşteri ön ödemesi": "e.g. Client advance payment",
  "Örn. Ekipman kirası": "e.g. Equipment rental",
  "Ödemeyi ekle": "Add payment",
  "Gideri ekle": "Add expense",
  "Ödeme eklendi": "Payment added",
  "Gider eklendi": "Expense added",
  "Bütçe kaydı silindi": "Budget entry deleted",
  "Hakediş": "Payout",
  "Ödeme eklenemedi. Tekrar dene.": "Couldn't add the payment. Try again.",
  "Gider eklenemedi. Tekrar dene.": "Couldn't add the expense. Try again.",
  "3 gün önce": "3 days before",
  "1 hafta önce": "1 week before",

  // ─────────────────────────────────────────────── Dosyalar
  "Dosya yükleyebilmek için önce bir işe ya da projeye eklenmen gerekiyor.":
    "To upload files, you first need to be added to a job or project.",
  "Google Doküman": "Google Doc",
  "Google E-Tablo": "Google Sheet",
  "Google Sunum": "Google Slides",
  "Word Belgesi": "Word Document",
  "Excel Tablosu": "Excel Spreadsheet",
  "PowerPoint Sunumu": "PowerPoint Presentation",
  "Dosya oluşturulamadı": "Couldn't create the file",
  "Dosya oluşturulamadı.": "Couldn't create the file.",
  "Dosya indirilemedi.": "Couldn't download the file.",
  "Yükleme tamamlandı": "Upload complete",
  "Yüklemeyi durdur": "Stop upload",

  // ─────────────────────────────────────────────── Müşteriler, destek, e-posta modülü
  "Müşteri ekle": "Add customer",
  "Müşteri arşivleme": "Archiving customer",
  "Ad / Unvan *": "Name / Company name *",
  "Vergi / TC No": "Tax / ID No",
  "Fatura kesilecekse gerekli": "Required if you'll invoice them",
  "Kişi adı": "Contact name",
  "Talep gönderilemedi.": "Couldn't send the request.",
  "Yanıtlandı": "Answered",
  "Gelen kutusu": "Inbox",
  "Kampanyalar": "Campaigns",

  // ─────────────────────────────────────────────── Profil ve ayarlar
  "Profil": "Profile",
  "Profil fotoğrafı": "Profile photo",
  "Profil kartını aç": "Open profile card",
  "Fotoğraf değiştir": "Change photo",
  "Başka fotoğraf seç": "Choose another photo",
  "Gezinme": "Navigation",
  "Yasal": "Legal",
  "Hareketi azalt": "Reduce motion",
  "Tema ve renkler": "Theme and colors",
  "Tema": "Theme",
  "Vurgu rengi": "Accent color",
  "Bilgiler alınamadı.": "Couldn't load the details.",
  "Hesap silinemedi. Tekrar dene.": "Couldn't delete the account. Try again.",
  "Veriler indirilemedi.": "Couldn't download the data.",
  "Excel olarak indir": "Download as Excel",
  "Hesabımı kapat": "Close my account",
  "Turu kapat": "Close tour",

  // ─────────────────────────────────────────────── WhatsApp
  "WhatsApp durumu alınamadı.": "Couldn't load WhatsApp status.",
  "WhatsApp bildirimleriniz durdurulmuş. Yeniden açmak için kod alıp Projelio numaranıza gönderin ya da WhatsApp'tan BAŞLAT yazın.":
    "Your WhatsApp notifications are paused. To turn them back on, get a code and send it to your Projelio number, or send START on WhatsApp.",
  "Bildirimleri WhatsApp'tan almak için bir kod alın ve aşağıdaki bağlantıyla Projelio numaranıza gönderin. Telefonunuz bu mesajla eşleşir.":
    "To get notifications on WhatsApp, get a code and send it to your Projelio number with the link below. Your phone is paired by that message.",
  "Kod al": "Get code",
  "Kod alınıyor…": "Getting code…",
  "Bu numaraya artık bildirim gitmez. Yeni numara ya da cihaz için Bağlı hesaplar'dan yeniden kod alırsınız.":
    "Notifications no longer go to this number. For a new number or device, get a new code from Connected accounts.",

  // ─────────────────────────────────────────────── Bilgi kartı
  "Bilgi kartı": "Info card",
  "Şirket bilgi kartı": "Company info card",
  "İş bilgi kartı": "Job info card",
  "Bilgi kartı açılamadı. Bu kartı görme yetkin olmayabilir.":
    "Couldn't open the info card. You may not have permission to see it.",
  "Künye": "Details",
  "Künye henüz doldurulmadı": "Details haven't been filled in yet",
  "Şirket özeti": "Company summary",
  "Alanı sil": "Delete field",
  "Alan adı (ör. Oda sicil no)": "Field name (e.g. Chamber registration no.)",
  "Alan ekle": "Add field",
  "Belge ekle": "Add document",
  "Belgeyi ekle": "Add document",
  "Belge eklenemedi. Tekrar dene.": "Couldn't add the document. Try again.",
  "Belge indirilemedi. Dosyaya erişimin olmayabilir.": "Couldn't download the document. You may not have access to the file.",
  "Belge türü": "Document type",
  "Belge adı": "Document name",
  "Belgeyi aç": "Open document",
  "Belgeyi indir": "Download document",
  "Belgeyi karttan kaldır": "Remove document from card",
  "Karttan kaldırır, dosyayı silmez": "Removes it from the card; doesn't delete the file",
  "Dış bağlantı": "External link",
  "Dosyalarımdan": "From my files",
  "Cihazdan dosya seç": "Choose a file from device",
  "Bilgisayardan dosya seç": "Choose a file from computer",
  "Bağlantı adresi": "Link URL",
  "Bağlantı adresi gerekiyor.": "A link URL is required.",
  "Önce bir dosya seç.": "Choose a file first.",
  "Dosya yüklenemedi. Bulut deposu bağlı mı diye bak, sonra tekrar dene.":
    "Couldn't upload the file. Check that cloud storage is connected, then try again.",
  "Vergi levhası, imza sirküleri, sicil gazetesi…": "Tax certificate, signature circular, trade registry gazette…",
  "Düzenlenme tarihi": "Issue date",
  "Geçerlilik bitişi": "Expiry date",
};
