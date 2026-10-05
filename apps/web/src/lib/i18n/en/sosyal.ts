import type { TranslationDict } from "@projelio/shared";

/** Sosyal medya modülü: gönderi oluşturma, kanal bağlama, paylaşım linkleri. */
export const sosyal: TranslationDict = {
  // ─────────────────────────────────────────────── Gönderi oluşturucu
  "Yeni içerik": "New content",
  "İçeriği düzenle": "Edit content",
  "İçerik türü": "Content type",
  "İçerik kaydedilemedi": "Could not save the content",
  "İçerik kaldırılsın mı?": "Remove this content?",
  "Başlık * (iç kullanım — takvimde görünür)": "Title * (internal — shown on the calendar)",
  "Metin, görsel ve yayın planı. Kanal seçtikçe karakter sınırı ona göre uyarır.":
    "Text, images and schedule. The character limit adapts as you pick channels.",
  "Yayımlanacak metin…": "Text to publish…",
  "Bu kanal için metin": "Text for this channel",
  "Kanala özel metin (boşsa ortak metin kullanılır)":
    "Channel-specific text (falls back to the shared text if empty)",
  "ortak metin": "shared text",
  "özel metin · {n}": "custom text · {n}",
  "İlk yorum (isteğe bağlı)": "First comment (optional)",
  "Etiketler ya da ek bilgi — gönderiden hemen sonra yorum olarak eklenir":
    "Hashtags or extra detail — posted as a comment right after",
  Etiketler: "Tags",
  "{n} etiket": { one: "{n} tag", other: "{n} tags" },
  "Açıklama metni": "Caption",
  Kanallar: "Channels",
  "Yayın zamanı": "Publish time",
  "Şimdi paylaş ({n})": "Publish now ({n})",
  "Yayımlanıyor…": "Publishing…",
  "Yayımlanamadı": "Could not publish",
  // ─────────────────────────────────────────────── Katkıda bulunanlar ve yayın yolu
  "Katkıda bulunanlar": "Collaborators",
  "Ortak gönderi yapılan hesaplar. Gönderi onların profilinde de görünür; davet her hesapta ayrıca kabul edilmeli.":
    "Accounts you co-post with. The post also appears on their profiles; each account has to accept the invite.",
  "@kullaniciadi ya da profil adresi": "@username or profile URL",
  "Modüldeki hesaplar:": "Accounts in this module:",
  "Davet durumu": "Invite status",
  "Katkıda bulunanı çıkar": "Remove collaborator",
  "Davet edildi": "Invited",
  "Kabul etti": "Accepted",
  "Yayını kim yapıyor": "Who publishes",
  "Başka bir araç": "Another tool",
  "Projelio bu içeriği yayımlamaz; kayıt takvim ve takip içindir.":
    "Projelio won't publish this; the entry is for the calendar and tracking.",
  "Bağlı hesaplarda planlanan saatte Projelio yayımlar.":
    "Projelio publishes on connected accounts at the scheduled time.",
  "Başka araçta planlandı": "Scheduled in another tool",
  "{arac} üzerinden planlandı": "Scheduled via {arac}",
  "Meta Business Suite": "Meta Business Suite",
  "Instagram uygulaması": "Instagram app",
  "TikTok Studio": "TikTok Studio",
  X: "X",
  "{n} kanalda yayımlandı.": { one: "Published on {n} channel.", other: "Published on {n} channels." },
  "{n} kanalda yayımlandı, {hata} kanalda hata var.": {
    one: "Published on {n} channel; {hata} failed.",
    other: "Published on {n} channels; {hata} failed.",
  },
  'Henüz hesap yok. "Hesaplar" sekmesinden ekleyince burada seçilebilir.':
    'No accounts yet. Add one from the "Accounts" tab and it becomes selectable here.',

  // Karakter sayacı
  "{n} karakter": { one: "{n} character", other: "{n} characters" },
  "{n} / {sinir} karakter": "{n} / {sinir} characters",
  "{kanal} için (en fazla {sinir})": "for {kanal} (max {sinir})",
  "en dar kanalın sınırı aşıldı": "the tightest channel's limit is exceeded",

  // Medya
  "Görsel / video": "Image / video",
  Video: "Video",
  "Dosya": "File",
  dosya: "file",
  "Medyayı kaldır": "Remove media",
  "Medya kaldırılamadı": "Could not remove the media",
  "Gönderiden kaldır (dosya silinmez)": "Remove from the post (the file is kept)",
  "Dosya yüklenemedi": "Could not upload the file",
  "Yükleniyor… %{n}": "Uploading… {n}%",
  "Dosyalar departmanın dosya alanına yüklenir, buraya bağlanır.":
    "Files are uploaded to the department's file area and linked here.",
  "Dosyalar işin dosya alanına yüklenir, buraya bağlanır.":
    "Files are uploaded to the job's file area and linked here.",
  "Dosya yüklemek için modülün bir departmanda etkin olması gerekiyor — dosyalar departmanın klasörüne gider.":
    "The module must be enabled in a department to upload files — they go to that department's folder.",

  // Örnek metinler
  "Ağustos indirimi": "August sale",
  "Ağustos kampanyası — 2. gönderi": "August campaign — post 2",
  "Sosyal akış": "Social feed",

  // ─────────────────────────────────────────────── Proje paylaşım linki
  "Link oluştur": "Create link",
  "Yeni link oluştur": "Create a new link",
  "Link oluşturulamadı. Tekrar dene.": "Could not create the link. Try again.",
  "Linkler yüklenemedi.": "Could not load the links.",
  "Henüz link oluşturmadın.": "You haven't created any links yet.",
  "Oluşturulmuş linkler": "Links you've created",
  "Link hazır — kopyalayıp gönderebilirsin.": "Your link is ready — copy it and send it on.",
  Kopyala: "Copy",
  Kopyalandı: "Copied",
  "Linki kapat": "Disable link",
  "Link kapatılsın mı?": "Disable this link?",
  "{ad}linkini kapatırsan, bu adresi daha önce gönderdiğin kişiler projeyi artık göremez. Bu işlem geri alınamaz; gerekirse yeni bir link oluşturabilirsin.":
    "If you disable {ad}this link, anyone you've already sent the address to can no longer see the project. This can't be undone; you can create a new link if you need one.",
  '"{ad}" projesini hesabı olmayan kişilere göster. Link salt okunur.':
    'Show "{ad}" to people without an account. The link is read-only.',
  "Bu link kimin için? (yalnızca sen görürsün)": "Who is this link for? (only you see this)",
  "Örn. Müşteri — Ahmet Bey": "e.g. Client — Mr Ahmet",
  "Adsız link": "Unnamed link",
  Kapatıldı: "Disabled",
  "Henüz açılmadı": "Not opened yet",
  "{n} kez açıldı": { one: "Opened {n} time", other: "Opened {n} times" },
  "son: {tarih}": "last: {tarih}",
  "· bağlı": "· linked",

  // Geçerlilik
  "Geçerlilik": "Valid for",
  "7 gün": "7 days",
  "30 gün": "30 days",
  "90 gün": "90 days",
  "Süresiz": "No expiry",
  "Proje tamamlandı": "Project completed",
  "Süreden bağımsız olarak, proje tamamlandığında link kendiliğinden kapanır.":
    "Regardless of the expiry, the link closes itself once the project is completed.",

  // E-posta kapısı
  "E-posta sorulsun mu? (isteğe bağlı)": "Ask for an email address? (optional)",
  "Kapı: {adres}": "Gate: {adres}",
  "Doldurursan sayfa açılmadan önce bu adres sorulur; link başkasına iletilse de adresi bilmeyen açamaz. Bir şifre değildir — adresi bilen herkes geçer.":
    "If you fill this in, the address is asked for before the page opens; if the link is forwarded, anyone who doesn't know the address can't get in. It is not a password — anyone who knows the address gets through.",

  // Görünürlük seçimi
  "Neler görünsün?": "What should be visible?",
  "Yalnızca özet": "Summary only",
  "Özet + {bolumler}": "Summary + {bolumler}",
  Belirtilmedi: "Not specified",
  "Proje adı, durumu, tarihleri ve ilerleme yüzdesi her linkte görünür.":
    "The project name, status, dates and progress are shown on every link.",
  "Görev başlıkları, durumları ve tarihleri": "Task titles, statuses and dates",
  "Projenin çıktı başlıkları": "The project's output titles",
  "Projeye yazılan paylaşımlar": "Posts written on the project",
  "Toplam ve harcanan tutar": "Total and spent amounts",
  "Dosya adları": "File names",
  "Yalnızca isim listesi — dosyalar indirilemez": "Names only — the files can't be downloaded",
  "Yalnızca ad ve unvan — e-posta ve ücret paylaşılmaz":
    "Name and title only — emails and rates are not shared",
  "Bağlantı": "Link",
  '"{ad}" listeden kaldırılacak. Kayıt siliniyor değil arşivleniyor; gerekirse geri alınabilir.':
    '"{ad}" will be removed from the list. The record is archived, not deleted; it can be restored.',
  // ─────────────────────────────────────────────── Sosyal medya paneli
  "Sosyal Medya": "Social media",
  "Takvim ve akış": "Calendar and feed",
  Hesaplar: "Accounts",
  Hesap: "Account",
  "Hesap ekle": "Add account",
  "Hesabı düzenle": "Edit account",
  "Hesabı tarayıcıda aç": "Open account in the browser",
  "Tarayıcıda aç": "Open in the browser",
  "{n} hesabı aç": { one: "Open {n} account", other: "Open {n} accounts" },
  "Hesapları aç": "Open accounts",
  "Tarayıcı yeni sekmeleri engelliyor.": "Your browser is blocking new tabs.",
  "{tarayici}: ayar sayfasını adres çubuğuna yapıştırın → İzin verilenler → Ekle.":
    "{tarayici}: paste the settings page into the address bar → Allowed to send pop-ups → Add.",
  "Firefox: ayar sayfasını yapıştırın → “Açılır pencereleri engelle” → İstisnalar.":
    "Firefox: paste the settings page → “Block pop-up windows” → Exceptions.",
  "Safari → Ayarlar → Web Siteleri → Açılır Pencereler → İzin Ver.":
    "Safari → Settings → Websites → Pop-up Windows → Allow.",
  "Tarayıcınızın site ayarlarından bu siteye açılır pencere izni verin.":
    "Allow pop-ups for this site in your browser's site settings.",
  "Ayar sayfası": "Settings page",
  "İzin verilecek site": "Site to allow",
  "İzinden sonra sayfayı yenileyin.": "Reload the page once you've allowed it.",
  "Hesabı açmak için tıklayın, sırayı değiştirmek için sürükleyin.":
    "Click an account to open it; drag to change the order.",
  "Hesabı arşivle": "Archive account",
  "İçerik ekle": "Add content",
  "Şimdi paylaş": "Publish now",
  "Kanallarınızı ekleyerek başlayın": "Start by adding your channels",
  "Henüz hesap eklenmedi. İçerik planlamadan önce en az bir kanal ekleyin.":
    "No accounts yet. Add at least one channel before planning content.",
  'Hesap eklemek için sayfadaki "+" düğmesini kullan.': 'Use the "+" button on the page to add an account.',
  "Her hesabın kitlesi, tonu ve yayın ritmi kayıtlı olur; içerik yazarken karakter sınırı ve kanal listesi buradan gelir. Sonra takvime içerik ekleyip görsellerini yükleyebilirsiniz.":
    "Each account records its audience, tone and posting rhythm; the character limit and channel list when you write come from here. After that you can add content to the calendar and upload its images.",
  "Kitle: {not}.": "Audience: {not}.",
  "Ton: {not}": "Tone: {not}",
  "{n} takipçi": { one: "{n} follower", other: "{n} followers" },
  "{kanal} yayında": "{kanal} live",
  "{hesap} hesabı arşivlensin mi? Geçmiş gönderiler korunur.":
    "Archive the account {hesap}? Past posts are kept.",
  '"{ad}" kaldırılsın mı? Kayıt arşivlenir, gerekirse geri alınabilir.':
    'Remove "{ad}"? The record is archived and can be restored.',

  // Takvim / akış görünümü
  "{ay} planı": "{ay} plan",
  "Önceki ay": "Previous month",
  "Sonraki ay": "Next month",
  "Bugün": "Today",
  "Tüm kanallar": "All channels",
  "Tüm durumlar": "All statuses",
  "Tarihsiz fikir": "Undated idea",
  "Akış — sütunlar arasında sürükleyerek durumu değiştirirsin. Fikir, taslak ve onaya hazır sütunlarına bırakılan içeriğin tarihi kalkar ({n} içerik tarihsiz).":
    "Feed — drag between columns to change the status. Items dropped into idea, draft or ready lose their date ({n} undated).",
  "{n} içerik": { one: "{n} item", other: "{n} items" },
  "{n} medya": { one: "{n} media file", other: "{n} media files" },
  "Yayımlandı": "Published",
  "yayımlanamadı": "failed to publish",
  "Onay bekliyor": "Awaiting approval",
  pasif: "inactive",
  kanal: "channel",
  medya: "media",
  '"{ad}" şimdi {n} kanalda yayımlansın mı?': {
    one: 'Publish "{ad}" on {n} channel now?',
    other: 'Publish "{ad}" on {n} channels now?',
  },
  "{n} kanalda yayımlandı, {hata} kanalda hata var — içeriği açıp sebebini görebilirsiniz.": {
    one: "Published on {n} channel; {hata} failed — open the content to see why.",
    other: "Published on {n} channels; {hata} failed — open the content to see why.",
  },
  "Veriler yüklenemedi": "Could not load the data",
  "Kayıtlar yüklenemedi": "Could not load the records",
  Kaydedilemedi: "Could not be saved",
  Silinemedi: "Could not be deleted",
  Yenile: "Refresh",
  "Geri al": "Undo",
  "İsimsiz": "Unnamed",
  "Silinmiş kullanıcı": "Deleted user",
  "Modül ekibi boş. Önce Ekip sekmesinden kişileri sosyal medya modülüne ekleyin.":
    "The module team is empty. Add people to the social media module from the Team tab first.",
  "Modül ekibinden seçin…": "Pick from the module team…",

  // ─────────────────────────────────────────────── Instagram bağlantısı
  "Instagram'a bağla": "Connect to Instagram",
  "Instagram'ı bağla": "Connect Instagram",
  "Instagram hesabınızı bağlayın — planladığınız içerikler saati gelince kendiliğinden yayımlansın.":
    "Connect your Instagram account so scheduled content publishes itself when the time comes.",
  "Instagram'ın profesyonel (işletme/içerik üretici) hesabı gerekiyor.":
    "An Instagram professional (business or creator) account is required.",
  "Instagram bağlantısı tamamlanamadı.": "Could not complete the Instagram connection.",
  "Instagram entegrasyonu bu kurulumda yapılandırılmamış.":
    "The Instagram integration isn't configured on this installation.",
  "Bu içeriğin kanallarından hiçbiri Instagram'a bağlı değil.":
    "None of this content's channels are connected to Instagram.",
  "@{hesap} hesabı bağlandı. Artık bu hesaba doğrudan yayımlayabilirsiniz.":
    "@{hesap} is connected. You can now publish to it directly.",
  "@{hesap} bağlantısı kesilsin mi? Hesap kaydı ve geçmiş gönderiler kalır.":
    "Disconnect @{hesap}? The account record and past posts are kept.",
  "Bağlantıyı kes": "Disconnect",
  "Bağlantı kesilemedi": "Could not disconnect",
  "Bağlantı başlatılamadı": "Could not start the connection",
  "Açılıyor…": "Opening…",

  // ─────────────────────────────────────────────── Giriş bilgileri (şifre kasası)
  "Giriş bilgileri": "Credentials",
  "Giriş ekle": "Add credentials",
  "Ana giriş": "Primary login",
  "Etiket": "Label",
  "Kullanıcı adı / e-posta": "Username / email",
  "Şifre *": "Password *",
  "Yeni şifre (boş bırakılırsa değişmez)": "New password (leave blank to keep it)",
  "Not (kurtarma e-postası, 2FA'nın hangi telefonda olduğu…)":
    "Note (recovery email, which phone has 2FA…)",
  "Not var": "Has a note",
  "Kullanıcı adı ve not, kaydedildiğinde yazdığınızla değiştirilir; boş bırakırsanız temizlenir.":
    "The username and note are replaced with what you type when you save; leave them blank to clear them.",
  "Bu hesap için kayıtlı giriş yok.": "No credentials saved for this account.",
  "Aşağıdan ekleyebilirsiniz.": "You can add them below.",
  "{kanal} · @{hesap} giriş bilgileri": "{kanal} · @{hesap} credentials",
  '"{etiket}" girişi silinsin mi? Şifre kalıcı olarak silinir.':
    'Delete the "{etiket}" entry? The password is permanently deleted.',
  "Şifre güncellenme: {tarih}": "Password updated: {tarih}",
  "Şifre gösterilemedi": "Could not reveal the password",
  "Göster": "Show",
  "Gizleniyor…": "Hiding…",
  "{n} saniye sonra gizlenecek.": {
    one: "Hidden again in {n} second.",
    other: "Hidden again in {n} seconds.",
  },
  "Şifreler sunucuda şifreli saklanır. Yalnızca yöneticiler, şifreyi giren kişi ve izin verilenler görebilir; her gösterim kaydedilir.":
    "Passwords are stored encrypted on the server. Only admins, the person who entered them and those granted access can reveal them; every reveal is logged.",
  "Bu gösterim kaydedildi ({yetki} yetkisiyle).": "This reveal was logged (as {yetki}).",
  "Son görüntülemeler ({n})": "Recent reveals ({n})",
  "Giren: {kisi}": "Revealed by: {kisi}",

  // İzinler
  "İzinler": "Permissions",
  "İzin ver": "Grant access",
  "İzin verilemedi": "Could not grant access",
  "İzin geri alınamadı": "Could not revoke access",
  "Şifreyi görebilenler": "Who can see the password",
  "Kimseye izin verilmedi. Şu an yalnızca yöneticiler ve şifreyi giren kişi görebiliyor.":
    "No one has been granted access. Right now only admins and the person who entered it can see it.",
  "Görme izniniz yok": "You don't have permission to view this",
  "Ekleme yetkiniz yok.": "You don't have permission to add.",
  "Salt görüntüleme": "View only",
  izinli: "granted",
  "yönetici": "admin",
  "kaydı giren": "entered it",
  "{kisi} verdi": "granted by {kisi}",
  "Bitiş tarihi (boşsa süresiz)": "End date (blank = no expiry)",
  "{tarih} tarihine kadar": "until {tarih}",
  // Hesap kartı (ek)
  "Aktif — pasif hesaplar yeni içerikte seçilemez":
    "Active — inactive accounts can't be picked for new content",
  "Hesabın kimliği, kitlesi ve yayın ritmi — içerik yazarken bu bilgiler composer'da hatırlatılır.":
    "The account's identity, audience and posting rhythm — shown as a reminder while you write.",
  "25–34 yaş, İstanbul, küçük işletme sahibi": "25–34, Istanbul, small business owner",
  "Samimi ama abartısız; emoji az; teknik terim yok":
    "Warm but understated; few emoji; no jargon",
  "Haftada 3, hafta içi 19:00": "3× a week, weekdays at 19:00",
  "Sosyal medya yönetimi": "Social media management",
  // ─────────────────────────────────────────────── Durum ve tür etiketleri
  // (lib/socialMedia.ts — modül düzeyi sabitler, çeviri render anında)
  "Havuzda bekleyen içerik fikri": "Idea waiting in the pool",
  "Metin/görsel hazırlanıyor": "Text/visual in preparation",
  "Onaya hazır": "Ready for approval",
  "Yayın için onay bekliyor": "Waiting for publish approval",
  "Onaylandı, yayın saati bekleniyor": "Approved, waiting for its slot",
  "Yayın tarihi belirlendi": "Publish date set",
  "Kanallarda yayında": "Live on the channels",
  "Yayımlanmayacak": "Won't be published",
  "Başarısız": "Failed",
  "Sırada": "Queued",
  Atlandı: "Skipped",

  // Bağlantı durumları
  "Elle yönetiliyor": "Managed manually",
  "Yayını siz yapıyorsunuz": "You publish it yourself",
  "Bağlı": "Connected",
  "Projelio bu hesaba doğrudan yayımlayabilir": "Projelio can publish to this account directly",
  "Bağlantıyı yenilemek için tekrar bağlanın": "Reconnect to refresh the link",
  "Instagram tarafında erişim kaldırılmış": "Access was revoked on Instagram's side",

  // Gönderi türleri
  "Görsel": "Image",
  "Reels / kısa video": "Reels / short video",
  "Yalnızca metin": "Text only",
  "Yazı / blog": "Article / blog",
  "Blog / web": "Blog / web",
  "Hikâye": "Story",
  Karusel: "Carousel",

  // Platform adları marka; İngilizcede de aynı kalıyorlar ama sözlükte
  // bulunmaları gerekiyor, yoksa "eksik çeviri" sayılırlar.
  Instagram: "Instagram",
  Facebook: "Facebook",
  Threads: "Threads",
  Pinterest: "Pinterest",
  YouTube: "YouTube",
  // İçeriğe buluttaki mevcut dosyayı getirme (yeniden yüklemeye gerek yok).
  "Drive'dan yükle": "Add from Drive",
  "OneDrive'dan yükle": "Add from OneDrive",
  "Dosya eklenemedi": "The file couldn't be added",

  // ─────────────────────────────────────────────── Tekrar paylaş
  "Tekrar paylaş": "Share again",
  "Çoğaltılıyor…": "Duplicating…",
  "İçerik çoğaltılamadı": "Couldn't duplicate the post",
  "İçeriği yeni bir taslak olarak çoğaltır; metin, görseller ve hesaplar taşınır.":
    "Copies the post into a new draft; text, images and accounts come along.",

  // ─────────────────────────────────────────────── Lio önerisi + deneme reels
  "Lio'ya yazdır": "Let Lio write",
  "Lio görsellere ya da videoya bakıp açıklama ve etiket önersin":
    "Lio looks at the images or video and suggests a caption and tags",
  "Lio videoyu izler: eşit aralıklarla kareler alır, konuşma varsa yazıya döker ve buna göre açıklama ile etiket önerir. Hesabın ton notu ve kutudaki taslağın dikkate alınır.":
    "Lio watches the video: it takes frames at even intervals, transcribes any speech and suggests a caption and tags from that. The account's tone note and your draft are taken into account.",
  "Lio görsellere bakıp açıklama ve etiket önerir. Hesabın ton notu ve kutudaki taslağın dikkate alınır.":
    "Lio looks at the images and suggests a caption and tags. The account's tone note and your draft are taken into account.",
  "Ne vurgulansın? (isteğe bağlı — ör. indirimi öne çıkar, kısa tut)":
    "What should it highlight? (optional — e.g. feature the discount, keep it short)",
  "Öner": "Suggest",
  "Lio videoyu izliyor…": "Lio is watching the video…",
  "Lio bakıyor…": "Lio is looking…",
  "Önce aşağıdan bir görsel ya da video ekle; Lio ona bakarak yazar.":
    "Add an image or video below first; Lio writes from it.",
  "Uzun videolarda bir iki dakika sürebilir.": "Long videos can take a minute or two.",
  "Lio bir öneri üretemedi, tekrar dene.": "Lio couldn't come up with a suggestion, try again.",
  "Lio'nun gördüğü:": "What Lio saw:",
  "İkisini de al": "Use both",
  "Yalnızca açıklamayı al": "Use caption only",
  "Yalnızca etiketleri al": "Use tags only",
  "Yeniden öner": "Suggest again",
  "{n} kare + ses · {birim} birim": "{n} frames + audio · {birim} units",
  "{n} kare · {birim} birim": "{n} frames · {birim} units",
  "Instagram'da deneme reels olarak yayımla": "Publish as an Instagram trial reel",
  "Deneme reels önce yalnızca seni takip etmeyenlere gösterilir; takipçilerin görmez. Tutarsa takipçilerine açılır. Yalnızca tek videolu gönderide çalışır.":
    "A trial reel is shown only to people who don't follow you at first; your followers won't see it. If it does well, it's shared with your followers. Works only for single-video posts.",
  "Takipçilere ne zaman açılsın": "When to share with followers",
  "Ben Instagram'dan açarım": "I'll share it from Instagram",
  "İyi performans gösterirse Instagram kendisi açsın": "Let Instagram share it if it performs well",
  "Deneme reels tek bir video ister; bu içerikte {n} medya var.":
    "A trial reel needs exactly one video; this post has {n} media items.",

  // ─────────────────────────────────────────────── Analiz ve fikirler (içerik analizi, ilham panosu, Lio raporları)
  "Analiz et":
    "Analyze",
  "Analiz ve fikirler":
    "Analytics & ideas",
  "Analiz yüklenemedi":
    "Couldn't load analytics",
  "Açılış (hook)":
    "Opening (hook)",
  "Beğendiğin hesapları ve videoları buraya kaydet: bağlantısını, neyin dikkatini çektiğini ve istersen videonun kendisini ekle. Projelio başka hesaplardan otomatik veri toplamaz; Lio senin notlarına ve yüklediğin dosyaya bakar.":
    "Save accounts and videos you like here: add the link, what caught your eye and, if you want, the video itself. Projelio doesn't collect data from other accounts automatically; Lio works from your notes and the file you upload.",
  "Beğeni":
    "Likes",
  "Bu gönderinin metrikleri okunamadı:":
    "Couldn't read this post's metrics:",
  "Bu ilham kaydı silinsin mi? Yüklediğin referans dosyası dosyalarında kalır.":
    "Delete this inspiration? The reference file you uploaded stays in your files.",
  "Dosya yüklemek için modülü bir departman içinden aç; organizasyon genelinde yükleme klasörü yok.":
    "To upload a file, open the module from a department; there's no upload folder at the organization level.",
  "Ekli dosya":
    "Attached file",
  "En iyi giden format":
    "Best-performing format",
  "En iyi paylaşım saati":
    "Best posting hour",
  "Etiketler (virgülle)":
    "Tags (comma-separated)",
  "Fikir üret":
    "Generate ideas",
  "Fikirler":
    "Ideas",
  "Fikirlere eklendi":
    "Added to ideas",
  "Format":
    "Format",
  "Geliştir":
    "Improve",
  "Gönderi":
    "Posts",
  "Gönderi analizi":
    "Post analysis",
  "Gönderilerim":
    "My posts",
  "Gönderilerinin izlenme, erişim, kaydetme ve paylaşım verilerini görmek için Instagram profesyonel hesabını bağla. İlham panosunu bağlamadan da kullanabilirsin.":
    "Connect your Instagram professional account to see views, reach, saves and shares for your posts. You can use the inspiration board without connecting.",
  "Güncellenemedi":
    "Couldn't update",
  "Henüz fikir raporu yok.":
    "No idea reports yet.",
  "Henüz gönderi verisi yok. \"Şimdi güncelle\" ile Instagram'dan çek; her gece kendiliğinden de güncellenir.":
    "No post data yet. Pull it from Instagram with \"Update now\"; it also refreshes automatically every night.",
  "Henüz ilham kaynağı yok. Örneğin: senin tarzında içerik üreten 5-10 hesap ve her birinden en çok izlenen 1-2 video iyi bir başlangıç.":
    "No inspirations yet. A good start: 5-10 accounts that make content in your style and their 1-2 most-viewed videos each.",
  "Henüz veri çekilmedi":
    "No data pulled yet",
  "Hesabının medyan izlenmesine göre.":
    "Relative to your account's median views.",
  "Instagram bağlantısı bulunamadı.":
    "Instagram connection not found.",
  "Instagram bağlantısının süresi dolmuş; hesabı yeniden bağlayın.":
    "The Instagram connection has expired; reconnect the account.",
  "Instagram entegrasyonu bu kurulumda yapılandırılmamış; ilham panosunu ve fikir raporlarını yine de kullanabilirsin.":
    "The Instagram integration isn't configured on this server; you can still use the inspiration board and idea reports.",
  "Instagram verileri okunamadı, daha sonra tekrar denenecek.":
    "Couldn't read Instagram data; it will be retried later.",
  "Instagram'da aç":
    "Open on Instagram",
  "Instagram'dan okunuyor…":
    "Reading from Instagram…",
  "Kaydetme":
    "Saves",
  "Kaydetme + paylaşım (medyan)":
    "Saves + shares (median)",
  "Kaydetme + paylaşım oranı":
    "Save + share rate",
  "Lio Bakiyesi harcar.":
    "Uses Lio Units.",
  "Lio Bakiyesi harcar. Raporlar saklanır, tekrar açmak ücretsiz.":
    "Uses Lio Units. Reports are saved; reopening them is free.",
  "Lio analizi var":
    "Lio analysis",
  "Lio bir analiz üretemedi, tekrar dene.":
    "Lio couldn't produce an analysis, try again.",
  "Lio bir rapor üretemedi, tekrar dene.":
    "Lio couldn't produce a report, try again.",
  "Lio düşünüyor…":
    "Lio is thinking…",
  "Lio en iyi ve en zayıf gönderilerine, önceki analizlerine ve ilham panona bakar; neyin işlediğini çıkarıp yeni içerik fikirleri önerir.":
    "Lio looks at your best and weakest posts, earlier analyses and your inspiration board, works out what's working and suggests new content ideas.",
  "Lio gönderiye bakar (videoysa karelerini ve konuşmasını), metrikleri hesabının normaliyle kıyaslar ve sonraki içerikler için ne yapman gerektiğini söyler. Lio Bakiyesi harcar.":
    "Lio looks at the post (frames and speech if it's a video), compares the metrics with your account's normal and tells you what to do in your next posts. Uses Lio Units.",
  "Lio incelesin":
    "Ask Lio",
  "Lio videonun karelerine ve konuşmasına bakar. Yalnızca incelemek için hakkın olan içerikleri yükle; dosya kendi klasörünüzde saklanır.":
    "Lio looks at the video's frames and speech. Only upload content you have the right to review; the file is stored in your own folder.",
  "Lio'nun analizini gizle":
    "Hide Lio's analysis",
  "Lio'nun analizini göster":
    "Show Lio's analysis",
  "Lio: neden böyle gitti?":
    "Lio: why did it perform this way?",
  "Metrikleri okumak için Instagram bağlantısının yenilenmesi gerekiyor (yeni izin: içerik istatistikleri).":
    "The Instagram connection needs to be renewed to read metrics (new permission: content insights).",
  "Ne dikkatini çekti? İlk saniyelerde ne oluyor, nasıl bitiyor, kaç izlenme almış, yorumlarda ne konuşuluyor?":
    "What caught your eye? What happens in the first seconds, how does it end, how many views did it get, what are people saying in the comments?",
  "Neden":
    "Why",
  "Neden böyle gitti":
    "Why it performed this way",
  "Neden işliyor":
    "Why it works",
  "Normal (medyan) izlenme":
    "Normal (median) views",
  "Normalin {kat} katı":
    "{kat}× your normal",
  "Notun":
    "Your note",
  "Odak (isteğe bağlı) — ör. bu ay eğitici içerik, 30 sn altı reels":
    "Focus (optional) — e.g. educational content this month, reels under 30 s",
  "Oran":
    "Rate",
  "Ort. izlenme":
    "Avg. watch",
  "Ort. izlenme süresi":
    "Avg. watch time",
  "Paylaşım":
    "Shares",
  "Reels":
    "Reels",
  "Referans video ya da görsel (isteğe bağlı)":
    "Reference video or image (optional)",
  "Senin hesabına uyarla":
    "Adapt it to your account",
  "Son güncelleme: {zaman}":
    "Last updated: {zaman}",
  "Sırala: en yeni":
    "Sort: newest",
  "Sırala: izlenme":
    "Sort: views",
  "Sırala: kaydetme + paylaşım oranı":
    "Sort: save + share rate",
  "Sırala: normale göre":
    "Sort: vs. normal",
  "Sürdür":
    "Keep doing",
  "Takip ettiğim hesap":
    "An account I follow",
  "Tek içerik (video/gönderi)":
    "Single piece (video/post)",
  "Tüm formatlar":
    "All formats",
  "Tüm hesaplar":
    "All accounts",
  "Veri az: önce gönderilerini çek ve ilham panosuna birkaç kaynak ekle, fikirler daha isabetli olur.":
    "Not much data yet: pull your posts and add a few inspirations first for sharper ideas.",
  "Verideki kalıplar":
    "Patterns in your data",
  "Veriler birkaç dakika önce güncellendi; biraz sonra tekrar dene.":
    "Data was updated a few minutes ago; try again a bit later.",
  "Yeni — metrikler oturuyor":
    "New — metrics still settling",
  "Yeniden analiz et":
    "Analyze again",
  "Yeniden incele":
    "Review again",
  "Yorum":
    "Comments",
  "Yükleniyor… {n}":
    "Uploading… {n}",
  "{n} fikir":
    "{n} ideas",
  "{n} gönderi okundu, {m} gönderinin metrikleri güncellendi.":
    "{n} posts read, metrics updated for {m}.",
  "ör. Ev yemekleri yapan hesap":
    "e.g. A home-cooking account",
  "ör. Soruyla açılan 30 sn'lik tarif videosu":
    "e.g. 30-second recipe video that opens with a question",
  "ör. hook, eğitici, kısa":
    "e.g. hook, educational, short",
  "İlham ekle":
    "Add inspiration",
  "İlham kaynağını düzenle":
    "Edit inspiration",
  "İlham panosu":
    "Inspiration board",
  "İlk 48 saatte metrikler hızla değiştiği için kıyasa girmez.":
    "Excluded from comparison for the first 48 hours while metrics change quickly.",
  "İzlenme":
    "Views",
  "İzlenme ve erişim verileri için bağlantıyı yenile (yeni izin).":
    "Renew the connection for views and reach data (new permission).",
  "İçerik":
    "Content",
  "İçerik fikri olarak ekle":
    "Add as content idea",
  "Şimdi güncelle":
    "Update now",
  "İzlenme ve erişim verileri bu kurulumda henüz açılmadı; şimdilik beğeni ve yorum sayıları gösteriliyor.":
    "Views and reach data aren't enabled on this server yet; showing like and comment counts for now.",

  // ─────────────────────────────────────────────── Benzer hesap keşfi
  "Benzer hesap bul":
    "Find similar accounts",
  "Birkaç arama yapıyor; bir iki dakika sürebilir.":
    "Running a few searches; this can take a minute or two.",
  "Bu aramada kaynağıyla birlikte aday bulunamadı; yukarıdaki etiketlere ve aramalara bakabilirsin.":
    "No candidates with a source were found this time; try the hashtags and searches above.",
  "Hesap bul":
    "Find accounts",
  "Instagram'da bak:":
    "Browse on Instagram:",
  "Kaynak":
    "Source",
  "Kaynağı bu aramada doğrulanamadı — profiline bakıp emin ol.":
    "Source couldn't be verified in this search — check the profile before adding.",
  "Kendin ara:":
    "Search yourself:",
  "Lio Bakiyesi harcar (model + en fazla 3 web araması). Sonuçlar saklanır.":
    "Uses Lio Units (model + up to 3 web searches). Results are saved.",
  "Lio bir sonuç üretemedi, tekrar dene.":
    "Lio couldn't produce a result, try again.",
  "Lio gönderilerinden nişini çıkarır ve açık web'de (listeler, haberler, bloglar) bu nişteki içerik üreticilerini arar. Instagram taranmaz; adayları profiline bakıp panoya ekleyen sensin.":
    "Lio works out your niche from your posts and searches the open web (lists, news, blogs) for creators in it. Instagram itself isn't scraped; you check each profile and add it to the board.",
  "Lio web'de arıyor…":
    "Lio is searching the web…",
  "Ne arıyorsun? (isteğe bağlı) — ör. Türkiye'deki küçük müzik prodüktörleri, eğitici reels":
    "What are you looking for? (optional) — e.g. small music producers in Turkey, educational reels",
  "Nişin":
    "Your niche",
  "Panoda":
    "On the board",
  "benzer hesap":
    "similar account",
  "{n} aday":
    "{n} candidates",
  "{n} web araması · {birim} birim":
    "{n} web searches · {birim} units",
  "İlham panosuna ekle":
    "Add to inspiration board",
};
