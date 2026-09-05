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
  "Akış": "Feed",
  Hesaplar: "Accounts",
  Hesap: "Account",
  "Hesap ekle": "Add account",
  "Hesabı düzenle": "Edit account",
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
  "Fikir havuzu ({n}) — takvimden buraya sürükleyerek tarihi kaldırır, sütunlar arasında sürükleyerek durumunu değiştirirsin":
    "Idea pool ({n}) — drag from the calendar here to clear the date, or between columns to change the status",
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
};
