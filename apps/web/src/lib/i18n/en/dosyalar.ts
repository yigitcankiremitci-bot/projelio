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
};
