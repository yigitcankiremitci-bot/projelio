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

  // ─────────────────────────────────────────────── Klasörler ve görünüm
  Klasör: "Folder",
  "Projelio klasörü": "Projelio folder",
  "Klasör adı:": "Folder name:",
  "Yeni klasör": "New folder",
  "Klasör yükle": "Upload folder",
  "Klasör oluşturulamadı": "The folder couldn't be created",
  "Klasör yeniden adlandırılamadı": "The folder couldn't be renamed",
  "Klasör kaldırılamadı": "The folder couldn't be removed",
  // Klasöre sürükleyerek ya da sağ tık menüsünden taşıma.
  Taşınamadı: "Couldn't be moved",
  "Üst klasöre taşı": "Move to parent folder",
  "Yeni belge oluştur": "New document",
  // ─────────────────────────────────────────────── Bağlama (migration 095)
  // "Bağla" tek başına "taşındı mı?" sorusunu doğuruyor; açıklama satırı şart.
  "Bağla…": "Link…",
  Bağla: "Link",
  "{sayi} öğeyi bağla": "Link {sayi} items",
  "{sayi} öğeyi bağla…": "Link {sayi} items…",
  "Yerinde kalır; seçtiğin yerde de görünmeye başlar.":
    "It stays where it is and also starts showing up where you pick.",
  // İki adımlı seçim: önce tür, sonra öğe.
  "Nereye bağlansın?": "What should it be linked to?",
  "Görev / alt görev": "Task / subtask",
  "Modül kaydı": "Module record",
  "Tür değiştir": "Change type",
  Ara: "Search",
  "Eşleşen bir şey yok.": "Nothing matches.",
  // "Dosya seç": hedefin modalinden işin ağacına bakma.
  "Dosya seç": "Pick a file",
  "Dosya yerinde kalır; buraya da bağlanır.": "The file stays where it is and is also linked here.",
  "{sayi} dosyayı bağla": "Link {sayi} files",
  "Görev, kişi ya da kayıt ara": "Search tasks, people or records",
  Kişiler: "People",
  "Modül kayıtları": "Module records",
  "Bağlanabilecek bir öğe bulunamadı.": "Nothing available to link to.",
  Bağlanamadı: "Couldn't be linked",
  "Bağlı dosyalar": "Linked files",
  // "Bağlantıyı kaldır" bulut hesabını KESMEK için ayrılmış (yukarıda);
  // dosya bağlantısı için ayrı bir fiil kullanılıyor.
  "Bağlantıyı kopar": "Unlink",
  "Bağlantı koparılamadı": "The link couldn't be removed",
  "Dosya indirilemedi": "The file couldn't be downloaded",
  // Çoklu seçim: sağ tık menüsü ve onay penceresi.
  "{sayi} öğe": "{sayi} items",
  "{sayi} öğeyi çoğalt": "Duplicate {sayi} items",
  "{sayi} öğeyi üst klasöre taşı": "Move {sayi} items to the parent folder",
  "{sayi} öğeyi köke taşı": "Move {sayi} items to the top level",
  "{sayi} öğeyi kaldır": "Remove {sayi} items",
  "Klasörü kaldır": "Remove folder",
  // Küme karışıksa (dosya + klasör) tek bir sağlayıcı adı yazılamıyor.
  "{sayi} öğeyi kaldırma": "Removing {sayi} items",
  Taşıma: "Moving",
  "Dosya çoğaltılamadı": "The file couldn't be duplicated",
  "Klasör çoğaltılamadı": "The folder couldn't be duplicated",
  // Cmd+Z bildirimindeki etiketler: "<etiket> geri alındı" diye okunuyor, bu
  // yüzden fiil ismi (bkz. DashboardModulesPanel'deki "Modül atama").
  "Klasör oluşturma": "Creating a folder",
  "Klasör yeniden adlandırma": "Renaming a folder",
  "Klasör çoğaltma": "Duplicating a folder",
  "Klasör taşıma": "Moving a folder",
  "Klasör kaldırma": "Removing a folder",
  "Dosya yeniden adlandırma": "Renaming a file",
  "Dosya çoğaltma": "Duplicating a file",
  "Dosya taşıma": "Moving a file",
  "Dosya kaldırma": "Removing a file",
  "Köke taşı": "Move to the top level",
  "Dosya yeniden adlandırılamadı": "The file couldn't be renamed",
  // Görünüm anahtarının üstündeki yazı ile ipucu: biri düğmenin metni, diğeri title.
  Liste: "List",
  Simge: "Icons",
  "Liste görünümü": "List view",
  "Simge görünümü": "Icon view",
  // Sağ tık menüsü
  Aç: "Open",
  Önizle: "Preview",
  "Yeniden adlandır": "Rename",
  "{saglayici}'da aç": "Open in {saglayici}",
  // ─────────────────────────────────────────────── Boş durum / bırakma kutusu
  "Bilgisayardan seç": "Choose from computer",
  "Cihazdan seç": "Choose from device",
  "veya sürükleyip bırakın": "or drag and drop",
  "Dosya ekleyebilmek için önce bir Drive ya da OneDrive hesabı bağlayın.":
    "Connect a Drive or OneDrive account before you can add files.",
  "Drive bağla": "Connect Drive",
  "Bırakın, nereye ekleneceğini soralım": "Drop it and we'll ask where it goes",
  "Buraya yükle": "Upload here",
  "{n} dosya seçildi": { one: "{n} file selected", other: "{n} files selected" },

  // ──────────────────────────────────── İndirme bağlantıları (migration 114)
  // Buradaki metinlerin bir kısmını, Projelio hesabı OLMAYAN bir alıcı görüyor
  // (bkz. pages/PublicFileDownload.tsx): dili hesap tercihinden değil
  // TARAYICIDAN geliyor, yani İngilizce karşılığı olmadan sayfa Türkçe kalırdı.
  "Bağlantı oluştur/gönder…": "Create or send link…",
  "Dosyayı paylaş": "Share file",
  "Bağlantı al": "Get a link",
  "Adresi kopyalayın, istediğiniz yere yapıştırın.": "Copy the address and paste it wherever you like.",
  "E-postayla gönder": "Send by email",
  "Bağlantıyı doğrudan alıcının gelen kutusuna yollayın.":
    "Send the link straight to the recipient's inbox.",
  "Bağlantıyı açan kişi Projelio hesabı olmadan dosyayı önizleyip indirebilir. Bağlantıyı istediğiniz an kaldırabilirsiniz.":
    "Whoever opens the link can preview and download the file without a Projelio account. You can remove the link at any time.",
  "Bu dosya için zaten bir bağlantı var; ikisi de onu kullanır.":
    "This file already has a link; both options use it.",
  Kime: "To",
  "İndirme bağlantısı": "Download link",
  "Bağlantı oluştur": "Create link",
  "Yeni bağlantı oluştur": "Create another link",
  "Bağlantı oluşturulamadı": "Couldn't create the link",
  "Gönderilemedi": "Couldn't be sent",
  "1 gün": "1 day",
  "İndirmeye izin ver": "Allow downloading",
  "Kapalıyken bağlantıyı açan kişi dosyayı görebilir ama indiremez.":
    "When off, whoever opens the link can view the file but not download it.",
  "İndirilince bana haber ver": "Notify me on download",
  "E-posta ve uygulama içi bildirim gönderilir.": "You'll get an email and an in-app notification.",
  "Yalnızca bu adresi bilen açsın (isteğe bağlı)": "Only someone who knows this address can open it (optional)",
  "Bağlantıyı e-postayla gönder": "Send the link by email",
  "Kısa bir not (isteğe bağlı)": "A short note (optional)",
  "alici@firma.com, ikinci@firma.com": "first@company.com, second@company.com",
  "Birden fazla adresi virgülle ayırın. Enter gönderir; bir kopyası size de gelir.":
    "Separate multiple addresses with commas. Enter sends; you'll get a copy too.",
  "Gönderiliyor…": "Sending…",
  "{sayi} adrese gönderildi": { one: "Sent to {sayi} address", other: "Sent to {sayi} addresses" },
  "Gönderilemedi: {adresler}": "Couldn't be sent to: {adresler}",
  "Bağlantıyı kopyalayıp kendiniz iletebilirsiniz.": "You can copy the link and share it yourself.",
  "ornek@firma.com": "name@company.com",
  "Bağlantıyı kapat": "Close link",
  "Bağlantı kapatıldı": "Link closed",
  "Süresiz — değiştir": "No expiry — change",
  "{tarih} tarihine kadar — değiştir": "Until {tarih} — change",
  "{goruntuleme} görüntüleme · {indirme} indirme": "{goruntuleme} views · {indirme} downloads",
  "{sayi} indirme": { one: "{sayi} download", other: "{sayi} downloads" },
  "son indirme {tarih}": "last download {tarih}",

  // Bağlantıyı açan kişinin gördüğü sayfa.
  "Bu bağlantı artık geçerli değil": "This link is no longer valid",
  "Bağlantı kaldırılmış ya da süresi dolmuş olabilir. Dosyayı paylaşan kişiden yeni bir bağlantı isteyin.":
    "The link may have been removed or expired. Ask the person who shared the file for a new one.",
  "Bağlantı şu anda açılamadı. Birkaç dakika sonra tekrar deneyin.":
    "The link couldn't be opened right now. Try again in a few minutes.",
  "E-posta adresinizi girin": "Enter your email address",
  "Bu dosya belirli bir adres için paylaşıldı. Dosyayı görmek için o adresi yazın.":
    "This file was shared with a specific address. Enter that address to see it.",
  "Bu adres bağlantıyla eşleşmedi. Dosyayı paylaşan kişinin yazdığı adresi deneyin.":
    "That address didn't match. Try the address the sender used.",
  "{ad} paylaştı": "shared by {ad}",
  "Dosyayı indir": "Download file",
  "Bu dosya yalnızca görüntülenmek üzere paylaşıldı; indirme kapatılmış. Kopyasına ihtiyacınız varsa dosyayı paylaşan kişiye yazın.":
    "This file was shared for viewing only; downloading is turned off. If you need a copy, contact the person who shared it.",
  "Bu dosya": "This file was shared with",
  "ile paylaşıldı — projelerinizi, görevlerinizi, dosyalarınızı ve bütçenizi tek yerde toplayan iş yönetim uygulaması.":
    "— the work management app that keeps your projects, tasks, files and budget in one place.",
  "Dosyalarınızı ek olarak göndermek yerine, geri alabileceğiniz bağlantılarla paylaşın.":
    "Share files with links you can revoke, instead of sending attachments.",

  // ─────────────────────────────────────────────── Arama ve sıralama
  "Dosya ara": "Search files",
  "Dosya ara…": "Search files…",
  "Bu klasörde ara…": "Search this folder…",
  "Aramayla eşleşen dosya yok.": "No files match your search.",
  "Sıralama": "Sort",
  "Eklenme: en yeni": "Date added: newest",
  "Eklenme: en eski": "Date added: oldest",
  "Ad: A → Z": "Name: A → Z",
  "Ad: Z → A": "Name: Z → A",
  "Boyut: en büyük": "Size: largest",
  "Boyut: en küçük": "Size: smallest",
  "{sayi} dosya Projelio'dan kaldırıldı ama bulut deposunda çöp kutusuna taşınamadı. Drive/OneDrive'dan elle silebilirsin.":
    "{sayi} file(s) removed from Projelio but couldn't be moved to the cloud trash. You can delete them in Drive/OneDrive yourself.",

  // ─────────────────────────────────────────────── Kaldırma kapsamı, yerinde ad değiştirme
  "Projelio'dan kaldır ve {depo}'dan da sil": "Remove from Projelio and delete from {depo}",
  "Dosya {depo} çöp kutusuna taşınır; oradan bir süre geri alınabilir.":
    "The file is moved to the {depo} trash and can be restored from there for a while.",
  "Yalnızca Projelio'dan kaldır": "Remove from Projelio only",
  "Dosya {depo}'da olduğu gibi kalır.": "The file stays in {depo} as it is.",
  '"{dosya}" Projelio\'dan kaldırılacak ve {depo}\'dan da silinecek.':
    '"{dosya}" will be removed from Projelio and deleted from {depo}.',
  '"{dosya}" yalnızca Projelio\'dan kaldırılacak.': '"{dosya}" will be removed from Projelio only.',
  "{sayi} öğe Projelio'dan kaldırılacak ve {depo}'dan da silinecek.":
    "{sayi} items will be removed from Projelio and deleted from {depo}.",
  "{sayi} öğe yalnızca Projelio'dan kaldırılacak.": "{sayi} items will be removed from Projelio only.",
  '"{ad}" klasörü İÇİNDEKİLERLE BİRLİKTE Projelio\'dan kaldırılacak ve {depo}\'da da çöp kutusuna taşınacak.':
    'The "{ad}" folder will be removed from Projelio TOGETHER WITH ITS CONTENTS and moved to the {depo} trash.',
  "Seçimdeki klasörler {depo}'da her durumda çöp kutusuna taşınır.":
    "Folders in the selection are always moved to the {depo} trash.",
  "Yeni ad": "New name",
};
