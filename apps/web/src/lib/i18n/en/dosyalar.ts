import type { TranslationDict } from "@projelio/shared";

/** Dosya yükleme, Drive/OneDrive, önizleme. */
export const dosyalar: TranslationDict = {
  // ─────────────────────────────────────────────── Dosya paneli
  "Dosya ekle": "Add file",
  "Dosya yükle": "Upload file",
  "Yeni dosya oluştur": "Create a new file",
  "Dosyayı kaldır": "Remove file",
  Kaldır: "Remove",
  Kapat: "Close",
  "İndir": "Download",
  "Proje dosyası": "Project file",
  "İş geneli": "Job-wide",
  "Henüz dosya eklenmemiş.": "No files yet.",
  "Dosyaları buraya sürükleyin veya tıklayın": "Drag files here, or click",
  "Bırakın, yükleyelim": "Drop them and we'll upload",
  "Departmanın bağlı Drive/OneDrive klasöründe saklanır":
    "Stored in the department's linked Drive/OneDrive folder",
  "İşin bağlı Drive/OneDrive klasöründe saklanır": "Stored in the job's linked Drive/OneDrive folder",
  'Bağlı işlerde henüz dosya yok. Dosyalar işlere yüklenir; bir işi buraya bağlamak için "İşi düzenle" ekranını kullanın.':
    'No files in the linked jobs yet. Files are uploaded to jobs; use "Edit job" to link one here.',

  // Sağlayıcı adı (Drive / OneDrive) yer tutucudan geliyor, çevrilmiyor.
  "{saglayici}'da bulunamadı": "Not found on {saglayici}",
  "{saglayici}'da düzenle": "Edit on {saglayici}",
  "{saglayici}'da da çöp kutusuna taşı": "Also move to the {saglayici} bin",
  '"{dosya}" Projelio\'dan kaldırılacak.': '"{dosya}" will be removed from Projelio.',

  "Drive'dan seç": "Pick from Drive",
  "Dosya kaldırılamadı": "Could not remove the file",
  "Dosya içe aktarılamadı": "Could not import the file",
  "Bulut depolama erişiminiz sona ermiş. Dosya yüklemek için yeniden bağlanın.":
    "Your cloud storage access has expired. Reconnect to upload files.",
  "Dosya yükleyebilmek için önce Google Drive ya da OneDrive hesabınızı bağlayın.":
    "Connect your Google Drive or OneDrive account before uploading files.",
  "Yeni dosya oluşturmak için önce Google Drive ya da OneDrive hesabınızı bağlayın (Ayarlar > Bağlı hesaplar).":
    "Connect your Google Drive or OneDrive account before creating a file (Settings > Connected accounts).",
  "Ayarlar'a git": "Go to Settings",

  // ─────────────────────────────────────────────── Posta kutusu
  "İletiler yükleniyor…": "Loading messages…",
  "Aramayı temizle": "Clear search",
  "Daha fazlası var — aramayı daraltın": "There's more — narrow your search",
  "Bir Outlook kutusu bağlayın": "Connect an Outlook mailbox",
  "Bağladığınız kutuyu": "The mailbox you connect",
  "bu modüle atanmış herkes": "everyone assigned to this module",
  'Bu kutuda Exchange tarafında "tam erişim" yetkiniz olmalı.':
    'You need "full access" permission on this mailbox in Exchange.',
  "Kutuyu kaldır": "Remove mailbox",
  "Kutuyu modülden kaldır": "Remove the mailbox from this module",
  // Bulut depolama kartları (ek)
  "Google Drive": "Google Drive",
  OneDrive: "OneDrive",
  "Drive bağlantısını kaldır": "Disconnect Drive",
  "OneDrive bağlantısını kaldır": "Disconnect OneDrive",
  "Bağlantıyı kaldır": "Disconnect",
  "Drive'da düzenle": "Edit in Drive",
  "Outlook'ta aç": "Open in Outlook",
  "Proje dosyaları kendi Drive'ınızda saklanır": "Project files are stored in your own Drive",
  "Proje dosyaları kendi OneDrive'ınızda saklanır": "Project files are stored in your own OneDrive",
  "Depolama için şu an Google Drive kullanılıyor. Değiştirmek için önce Drive kartından bağlantıyı kaldırın.":
    "Google Drive is currently used for storage. To change it, disconnect from the Drive card first.",
  "Depolama için şu an OneDrive kullanılıyor. Değiştirmek için önce OneDrive kartından bağlantıyı kaldırın.":
    "OneDrive is currently used for storage. To change it, disconnect from the OneDrive card first.",
  "Bağlı:": "Connected:",
  "· bağlı değil": "· not connected",
  "· şu an bağlı değil": "· not connected right now",
  "· doğrulandı": "· verified",
  "· onay için gerekli": "· required for approval",

  // WhatsApp
  WhatsApp: "WhatsApp",
  "WhatsApp numaraları": "WhatsApp numbers",
  "WhatsApp'ta gönder": "Send on WhatsApp",
  "WhatsApp numarasını hesaptan ayır": "Unlink the WhatsApp number from the account",
  "WhatsApp'tan değişiklik yapılabilsin": "Allow changes from WhatsApp",
  "Görev ve son tarih bildirimleri WhatsApp'a da gelsin":
    "Also send task and deadline notifications to WhatsApp",
  "Projelio numaranız:": "Your Projelio number:",
  "numaranıza gidiyor.": "goes to your number.",
  "Projelio Türkiye": "Projelio Türkiye",
  "Etiket (ör. Destek 1)": "Label (e.g. Support 1)",

  // Destek
  "Bize yaz": "Write to us",
  "Taleplerim": "My requests",
  "Tüm taleplerim": "All my requests",
  "Mesajın": "Your message",
  "Yanıtın — kullanıcıya bildirim olarak gider": "Your reply — sent to the user as a notification",
  "Talebin bize ulaştı. Yanıtladığımızda bildirim göndereceğiz.":
    "We've received your request. We'll notify you when we reply.",
  "Öneri, dilek ya da şikâyetini buradan iletebilirsin. Yanıtladığımızda sana bildirim gelir.":
    "Send us a suggestion, request or complaint here. You'll be notified when we reply.",
  "Menüdeki": "In the menu",
};
