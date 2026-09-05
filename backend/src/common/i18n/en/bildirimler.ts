import type { TranslationDict } from "@projelio/shared";

/**
 * Bildirim başlıkları ve gövdeleri.
 *
 * Bunlar ALICININ dilinde yazılıp veritabanına çevrilmiş hâlde giriyor
 * (bkz. notifications.service.ts `notifyUser`). Aynı metin ekranda, push
 * bildiriminde ve WhatsApp mesajında görünüyor.
 *
 * İki kural:
 *  - Başlık çok kısa. Push bildiriminde tek satıra sığmak zorunda.
 *  - Yer tutucudan gelen değerler (kişi adı, görev başlığı) ÇEVRİLMEZ; onlar
 *    kullanıcının kendi verisi. Bu yüzden yedek değerler ("Bir kullanıcı")
 *    parametre olarak değil, ayrı bir metin olarak yazılmış.
 */
export const bildirimler: TranslationDict = {
  // ─────────────────────────────────────────────── Görevler
  "Yeni Görev": "New task",
  "Yeni Görev Atandı": "New task assigned",
  "Görev Güncellendi": "Task updated",
  "Görev Tamamlandı": "Task completed",
  "Görev hatırlatması": "Task reminder",
  '{atayan}, seni "{gorev}" görevine atadı.': '{atayan} assigned you to "{gorev}".',
  '"{gorev}" görevine atandın.': 'You were assigned to "{gorev}".',
  '{ekleyen}, "{gorev}" görevini ekledi.': '{ekleyen} added the task "{gorev}".',
  '"{gorev}" görevi eklendi.': 'The task "{gorev}" was added.',
  '{kisi}, "{gorev}" görevini tamamladı.': '{kisi} completed "{gorev}".',
  '"{gorev}" görevi tamamlandı.': 'The task "{gorev}" was completed.',
  '"{gorev}" görevinde güncelleme var.': 'There is an update on "{gorev}".',
  '"{gorev}" görevinin durumu değişti.': 'The status of "{gorev}" changed.',
  '"{gorev}" görevinin tarihi değişti.': 'The date of "{gorev}" changed.',
  '"{gorev}" görevinin bitiş saati: {saat}.': '"{gorev}" is due at {saat}.',
  "\"{gorev}\" görevi {saat}'de bitiyor.": '"{gorev}" is due at {saat}.',
  // Günlük özet: liste uzunsa kuyruk metnin içinde, çoğul eki gerekiyor.
  "{n} görevin var: {liste}": { one: "You have {n} task: {liste}", other: "You have {n} tasks: {liste}" },
  "{n} görevin var: {liste} ve {kalan} görev daha": {
    one: "You have {n} tasks: {liste} and {kalan} more",
    other: "You have {n} tasks: {liste} and {kalan} more",
  },

  // ─────────────────────────────────────────────── Çıktılar
  "Yeni Çıktı": "New output",
  '"{cikti}" çıktısı eklendi.': 'The output "{cikti}" was added.',

  // ─────────────────────────────────────────────── Dosyalar
  "Yeni Dosya": "New file",
  '"{dosya}" eklendi.': '"{dosya}" was added.',

  // ─────────────────────────────────────────────── Proje ekibi
  "Ekip Daveti": "Team invitation",
  "Bir projeye davet edildiniz.": "You've been invited to a project.",
  "Ekibe Eklendin": "Added to the team",
  "Bir projeye eklendin.": "You've been added to a project.",
  "Projeye Katıldın": "You joined the project",
  "Katılım isteğin onaylandı.": "Your request to join was approved.",
  "Ekipten ayrılma": "Someone left the team",
  '{kisi}, "{proje}" projesinden ayrıldı.': '{kisi} left the project "{proje}".',
  'Bir ekip üyesi "{proje}" projesinden ayrıldı.': 'A team member left the project "{proje}".',
  "Anlaşma Güncellendi": "Agreement updated",
  "Ücret anlaşmanız güncellendi.": "Your rate agreement has been updated.",

  // ─────────────────────────────────────────────── İş ve departman kadrosu
  "İşe davet edildin": "You've been invited to a job",
  "Davet kabul edildi": "Invitation accepted",
  "Davet reddedildi": "Invitation declined",
  "Kadro Daveti": "Staff invitation",
  "Kadro Onayı": "Staff approval",
  "Bir departmanın kadrosuna davet edildin.": "You've been invited to a department's staff.",
  "Departman kadrosundan ayrıldın.": "You've left the department staff.",
  "{kisi} departman davetini onayladı ve kadroya katıldı.":
    "{kisi} accepted the department invitation and joined the staff.",
  "Bir kullanıcı departman davetini onayladı ve kadroya katıldı.":
    "Someone accepted the department invitation and joined the staff.",
  "Ayrılma onayı bekliyor": "A departure needs your approval",
  "Ayrılma onaylandı": "Departure approved",
  "Ayrılma reddedildi": "Departure declined",
  "Ayrılma talebin reddedildi; departman yöneticiliğin devam ediyor.":
    "Your request to leave was declined; you remain a department manager.",
  '{kisi}, "{departman}" departmanının son yöneticisi ve ayrılmak istiyor. Onaylamadan ayrılamaz.':
    '{kisi} is the last manager of "{departman}" and wants to leave. They can\'t leave without your approval.',
  'Bir yönetici, "{departman}" departmanının son yöneticisi ve ayrılmak istiyor. Onaylamadan ayrılamaz.':
    'A manager is the last one left in "{departman}" and wants to leave. They can\'t leave without your approval.',

  // ─────────────────────────────────────────────── Modüller
  "Modüle Atandın": "Assigned to a module",
  "Bir modülde çalışmak üzere atandın.": "You've been assigned to work on a module.",

  // ─────────────────────────────────────────────── Ortaklık
  "Ortaklık Daveti": "Partnership invitation",
  "%{pay} hisse ile ortaklığa davet edildin.": "You've been invited into a partnership with a {pay}% share.",

  // ─────────────────────────────────────────────── Açma talepleri
  "Onay Bekleyen Talep": "Request awaiting approval",
  "Talebiniz Onaylandı": "Your request was approved",
  "Talebiniz Reddedildi": "Your request was declined",
  '{kisi}, "{ad}" adlı işi açmak için onayını bekliyor.':
    '{kisi} is waiting for your approval to open the job "{ad}".',
  '{kisi}, "{ad}" adlı projeyi açmak için onayını bekliyor.':
    '{kisi} is waiting for your approval to open the project "{ad}".',
  'Bir taşeron, "{ad}" adlı işi açmak için onayını bekliyor.':
    'A subcontractor is waiting for your approval to open the job "{ad}".',
  'Bir taşeron, "{ad}" adlı projeyi açmak için onayını bekliyor.':
    'A subcontractor is waiting for your approval to open the project "{ad}".',
  '"{ad}" açıldı.': '"{ad}" has been created.',
  '"{ad}" talebi reddedildi.': 'The request for "{ad}" was declined.',
  '"{ad}" talebi reddedildi. Gerekçe: {gerekce}':
    'The request for "{ad}" was declined. Reason: {gerekce}',

  // ─────────────────────────────────────────────── Paylaşımlar ve yorumlar
  "Paylaşımın beğenildi": "Your post was liked",
  "Yorumun beğenildi": "Your comment was liked",
  "Paylaşımına yorum yapıldı": "Someone commented on your post",
  "Bir paylaşımda etiketlendin": "You were mentioned in a post",
  "Bir yorumda etiketlendin": "You were mentioned in a comment",
  "{kisi} paylaşımını beğendi.": "{kisi} liked your post.",
  "{kisi} yorumunu beğendi.": "{kisi} liked your comment.",
  '{kisi} paylaşımına yorum yaptı: "{alinti}"': '{kisi} commented on your post: "{alinti}"',
  "{kisi} seni bir paylaşımda etiketledi.": "{kisi} mentioned you in a post.",
  "{kisi} seni bir yorumda etiketledi.": "{kisi} mentioned you in a comment.",

  // ─────────────────────────────────────────────── Bütçe ve düzenli ödemeler
  "Bütçe Güncellendi": "Budget updated",
  "Gelir: {tutar} ₺": "Income: {tutar} ₺",
  "Gider: {tutar} ₺": "Expense: {tutar} ₺",
  "Gelir bütçeye işlendi": "Income recorded in the budget",
  "Ödeme bütçeye işlendi": "Payment recorded in the budget",
  "Tahsilat yaklaşıyor": "A payment is due soon",
  "Ödeme yaklaşıyor": "A payment is due soon",
  "{aciklama} — {tutar}": "{aciklama} — {tutar}",
  "{aciklama} — {tutar} ({n} dönem birlikte işlendi)": {
    one: "{aciklama} — {tutar} ({n} period processed together)",
    other: "{aciklama} — {tutar} ({n} periods processed together)",
  },
  "{aciklama} — {tutar}, yarın": "{aciklama} — {tutar}, tomorrow",
  "{aciklama} — {tutar}, {n} gün sonra": {
    one: "{aciklama} — {tutar}, in {n} day",
    other: "{aciklama} — {tutar}, in {n} days",
  },

  // ─────────────────────────────────────────────── Destek
  "Destek talebin yanıtlandı": "Your support request has a reply",

  // ─────────────────────────────────────────────── WhatsApp
  "WhatsApp · {kisi}": "WhatsApp · {kisi}",
  "Sahipsiz konuşma ({hat}): {mesaj}": "Unassigned conversation ({hat}): {mesaj}",
  "Sahipsiz konuşma (havuz): {mesaj}": "Unassigned conversation (pool): {mesaj}",
  // Açıklaması olmayan düzenli ödemeler: yedek sözcük parametreye değil
  // metnin kendisine gömülü, yoksa İngilizce cümlede Türkçe kalırdı.
  "Düzenli gelir — {tutar}": "Recurring income — {tutar}",
  "Düzenli ödeme — {tutar}": "Recurring payment — {tutar}",
  "Düzenli gelir — {tutar} ({n} dönem birlikte işlendi)": {
    one: "Recurring income — {tutar} ({n} period processed together)",
    other: "Recurring income — {tutar} ({n} periods processed together)",
  },
  "Düzenli ödeme — {tutar} ({n} dönem birlikte işlendi)": {
    one: "Recurring payment — {tutar} ({n} period processed together)",
    other: "Recurring payment — {tutar} ({n} periods processed together)",
  },
  "Düzenli tahsilat — {tutar}, yarın": "Recurring collection — {tutar}, tomorrow",
  "Düzenli ödeme — {tutar}, yarın": "Recurring payment — {tutar}, tomorrow",
  "Düzenli tahsilat — {tutar}, {n} gün sonra": {
    one: "Recurring collection — {tutar}, in {n} day",
    other: "Recurring collection — {tutar}, in {n} days",
  },
  "Düzenli ödeme — {tutar}, {n} gün sonra": {
    one: "Recurring payment — {tutar}, in {n} day",
    other: "Recurring payment — {tutar}, in {n} days",
  },
  // ─────────────────────────────────────────────── Lio etkinlik akışı
  //
  // Lio bir araç çalıştırdıktan sonra panelde beliren satırlar ve onay sonrası
  // gösterilen sonuç metinleri. Kaydın ADI etiketin dışında birleştiriliyor
  // ("İş oluşturuldu" + ": Kapak tasarımı"), o yüzden burada yer tutucu yok.
  "İş oluşturuldu": "Job created",
  "İş güncellendi": "Job updated",
  "İş arşivlendi": "Job archived",
  "Proje oluşturuldu": "Project created",
  "Proje güncellendi": "Project updated",
  "Proje arşivlendi": "Project archived",
  "Organizasyon oluşturuldu": "Organization created",
  "Organizasyon güncellendi": "Organization updated",

  // Onay gerektiren araçların sonuç metinleri (RESULT_LABELS).
  "Görev silindi.": "Task deleted.",
  "Görev arşivlendi.": "Task archived.",
  "Proje silindi.": "Project deleted.",
  "Proje arşivlendi.": "Project archived.",
  "İş silindi.": "Job deleted.",
  "İş arşivlendi.": "Job archived.",
  "Çıktı silindi.": "Output deleted.",
  "Çıktı arşivlendi.": "Output archived.",
  "Bütçe hareketi eklendi.": "Budget entry added.",
  "Modül kaydı arşivlendi.": "Module record archived.",
  "Modül kapatıldı.": "Module turned off.",
  "Grup silindi.": "Group deleted.",
  "Grup arşivlendi.": "Group archived.",
  "Organizasyon silindi.": "Organization deleted.",
  "Organizasyon arşivlendi.": "Organization archived.",
  "Departman silindi.": "Department deleted.",
  "Departman arşivlendi.": "Department archived.",
  "Rutin silindi.": "Routine deleted.",
  "Rutin arşivlendi.": "Routine archived.",
  "Ürün silindi.": "Product deleted.",
  "Ürün arşivlendi.": "Product archived.",
  "Destek talebin Projelio ekibine iletildi.": "Your support request has been sent to the Projelio team.",
  // ─────────────────────────────────────────────── Lio: "şimdiye kadar ne yapıldı"
  //
  // Duraklatma ve onay mesajlarında cümlenin içine dizilen eylem adları
  // ("Şimdiye kadar: iş oluşturuldu, görev eklendi"). Bu yüzden hepsi küçük
  // harfle ve edilgen: cümlenin ortasında duruyorlar, başında değil.
  "iş oluşturuldu": "job created",
  "iş güncellendi": "job updated",
  "proje oluşturuldu": "project created",
  "proje güncellendi": "project updated",
  "görev oluşturuldu": "task created",
  "görev güncellendi": "task updated",
  "görev durumu değiştirildi": "task status changed",
  "toplu görev eklendi": "tasks added in bulk",
  "dosyadan toplu görev eklendi": "tasks added in bulk from a file",
  "çıktı oluşturuldu": "output created",
  "çıktı güncellendi": "output updated",
  "yorum eklendi": "comment added",
  "grup oluşturuldu": "group created",
  "grup güncellendi": "group updated",
  "organizasyon oluşturuldu": "organization created",
  "organizasyon güncellendi": "organization updated",
  "departman açıldı": "department opened",
  "departman güncellendi": "department updated",
  "modül açıldı": "module turned on",
  "modül kapatıldı": "module turned off",
  "modül kaydı eklendi": "module record added",
  "modül kaydı güncellendi": "module record updated",
  "modül kaydı arşivlendi": "module record archived",
  "dosyadan toplu modül kaydı eklendi": "module records added in bulk from a file",
  "rutin oluşturuldu": "routine created",
  "rutin güncellendi": "routine updated",
  "ürün eklendi": "product added",
  "ürün güncellendi": "product updated",
  "dönem planı kaydedildi": "period plan saved",
  "zaman bloğu eklendi": "time block added",
  "zaman bloğu güncellendi": "time block updated",
  "planlama oturumu kapatıldı": "planning session closed",
  "pano kartı güncellendi": "board card updated",
  "yapılacak eklendi": "to-do added",
  "yapılacak güncellendi": "to-do updated",
  "yapılacak kaldırıldı": "to-do removed",
  "yapılacak geri alındı": "to-do restored",
  "yapılacak durumu değiştirildi": "to-do status changed",
  "toplu yapılacak eklendi": "to-dos added in bulk",
  "yapılacaklar sıralandı": "to-dos reordered",
  "rapor dosyası üretildi": "report file generated",

  // Ek türleri (Lio panelinde ve WhatsApp'ta görünür)
  "Metin dosyası": "Text file",
  "Word belgesi": "Word document",
  "Ses kaydı (yazıya çevrildi)": "Voice note (transcribed)",
  // ─────────────────────────────────────────────── Lio etkinlik akışı (devam)
  "Grup oluşturuldu": "Group created",
  "Grup güncellendi": "Group updated",
  "Grup arşivlendi": "Group archived",
  "Organizasyon arşivlendi": "Organization archived",
  "Departman açıldı": "Department opened",
  "Departman güncellendi": "Department updated",
  "Departman arşivlendi": "Department archived",
  "Rutin oluşturuldu": "Routine created",
  "Rutin güncellendi": "Routine updated",
  "Rutin arşivlendi": "Routine archived",
  "Ürün eklendi": "Product added",
  "Ürün güncellendi": "Product updated",
  "Görev oluşturuldu": "Task created",
  "Görev güncellendi": "Task updated",
  "Görev durumu değişti": "Task status changed",
  "Göreve yorum eklendi": "Comment added to the task",
  "Çıktı oluşturuldu": "Output created",
  "Çıktı güncellendi": "Output updated",
  "Bütçe hareketi eklendi": "Budget entry added",
  "Modüle kayıt eklendi": "Record added to the module",
  "Modül kaydı güncellendi": "Module record updated",
  "Dönem planı kaydedildi": "Period plan saved",
  "Takvime zaman bloğu eklendi": "Time block added to the calendar",
  "Zaman bloğu güncellendi": "Time block updated",
  "Planlama oturumu tamamlandı": "Planning session completed",
  "{n} görev eklendi": { one: "{n} task added", other: "{n} tasks added" },
  "Dosyadan {n} görev eklendi": {
    one: "{n} task added from a file",
    other: "{n} tasks added from a file",
  },
  "Dosyadan {n} modül kaydı eklendi": {
    one: "{n} module record added from a file",
    other: "{n} module records added from a file",
  },

  // ─────────────────────────────────────────────── Lio: duraklatma ve kredi
  //
  // Lio bir isteği yarıda kestiğinde kullanıcıya gösterdiği metinler. Üç farklı
  // sebep, üç farklı cümle — aynı metni kullanmak kullanıcıyı yanıltıyordu.
  "Henüz kalıcı bir değişiklik yapılmadı": "Nothing has been changed yet",
  "Durdurdum. {yapilan}. Bu istek toplam {harcanan} kredi harcadı.":
    "Stopped. {yapilan}. This request used {harcanan} credits in total.",
  "(Bu isteğin toplam bedeli: {harcanan} kredi.)": "(Total cost of this request: {harcanan} credits.)",
  "Bu istek tahminen {tahmin} kredi tutacak — bu, tek seferde harcanması için yüksek bir tutar (eşik {esik} kredi). Henüz hiçbir kredi harcamadım. Devam edeyim mi?":
    "This request is estimated at {tahmin} credits — a lot to spend in one go (the threshold is {esik}). I haven't spent anything yet. Shall I continue?",
  "Bu istek şu ana kadar {harcanan} kredi harcadı ve henüz bitmedi. Şimdiye kadar: {yapilan}. Devam edersem her adım yaklaşık {tahmin} kredi daha götürür. Devam edeyim mi?":
    "This request has used {harcanan} credits so far and isn't finished. So far: {yapilan}. Each further step costs roughly {tahmin} more. Shall I continue?",
  "Bu istek {n} adım sürdü ve hâlâ bitmedi ({harcanan} kredi). Şimdiye kadar: {yapilan}. Devam edersem her adım yaklaşık {tahmin} kredi daha götürür. Devam edeyim mi?":
    "This request has taken {n} steps and still isn't finished ({harcanan} credits). So far: {yapilan}. Each further step costs roughly {tahmin} more. Shall I continue?",
  "AI kredin bu isteği sürdürmeye yetmiyor, bu yüzden burada durdum. {yapilan}. Kalan kredin {kalan}, devam etmek için en az {gereken} gerekiyor. Ayarlar > AI Kredileri sayfasından kredi yükleyip tekrar yazabilirsin.":
    "You don't have enough AI credit to carry on, so I stopped here. {yapilan}. You have {kalan} left and need at least {gereken} to continue. You can top up from Settings > AI Credits and write again.",
  // ─────────────────────────────────────────────── Lio: onay pencereleri
  //
  // Kullanıcı silme/arşivleme kararını BU cümleye bakarak veriyor. Kaydın adı
  // yer tutucudan geliyor ve çevrilmiyor — kullanıcının kendi verisi.
  // "KALICI" vurgusu İngilizcede de korunuyor: geri alınamaz bir işlem.
  '"{ad}" görevini KALICI olarak silmek üzeresin. Bu işlem geri alınamaz.':
    'You\'re about to PERMANENTLY delete the task "{ad}". This can\'t be undone.',
  '"{ad}" görevini arşivlemek üzeresin.': 'You\'re about to archive the task "{ad}".',
  '"{ad}" projesini KALICI olarak silmek üzeresin. Projeye ait tüm görevler de etkilenir. Bu işlem geri alınamaz.':
    'You\'re about to PERMANENTLY delete the project "{ad}". Every task in it is affected too. This can\'t be undone.',
  '"{ad}" projesini arşivlemek üzeresin.': 'You\'re about to archive the project "{ad}".',
  '"{ad}" işini KALICI olarak silmek üzeresin. Bu işlem geri alınamaz.':
    'You\'re about to PERMANENTLY delete the job "{ad}". This can\'t be undone.',
  '"{ad}" işini arşivlemek üzeresin.': 'You\'re about to archive the job "{ad}".',
  '"{ad}" çıktısı silinecek. Onaylıyor musun?': 'The output "{ad}" will be deleted. Do you confirm?',
  '"{ad}" çıktısı arşivlenecek. Onaylıyor musun?': 'The output "{ad}" will be archived. Do you confirm?',
  '"{ad}" grubunu KALICI olarak silmek üzeresin. Bu işlem geri alınamaz.':
    'You\'re about to PERMANENTLY delete the group "{ad}". This can\'t be undone.',
  '"{ad}" grubunu arşivlemek üzeresin. Gruba bağlı organizasyonlar ve işler de arşivlenir.':
    'You\'re about to archive the group "{ad}". The organizations and jobs under it are archived too.',
  '"{ad}" organizasyonunu arşivlemek üzeresin. Bağlı işler de (projeleri ve görevleriyle) arşivlenir.':
    'You\'re about to archive the organization "{ad}". Its jobs — with their projects and tasks — are archived too.',
  '"{ad}" departmanını KALICI olarak silmek üzeresin. Görevleri ve modül kayıtları da gider.':
    'You\'re about to PERMANENTLY delete the department "{ad}". Its tasks and module records go too.',
  '"{ad}" departmanını arşivlemek üzeresin. Kayıtlar durur, departman ekranlardan kalkar.':
    'You\'re about to archive the department "{ad}". The records stay; the department leaves the screens.',
  '"{ad}" rutinini KALICI olarak silmek üzeresin. Tekrarları ve geçmişi de gider.':
    'You\'re about to PERMANENTLY delete the routine "{ad}". Its occurrences and history go too.',
  '"{ad}" rutinini arşivlemek üzeresin. (Geri alınabilir.)':
    'You\'re about to archive the routine "{ad}". (This can be undone.)',
  '"{ad}" ürününü KALICI olarak silmek üzeresin. Fotoğrafları da gider.':
    'You\'re about to PERMANENTLY delete the product "{ad}". Its photos go too.',
  '"{ad}" ürününü arşivlemek üzeresin. (Geri alınabilir.)':
    'You\'re about to archive the product "{ad}". (This can be undone.)',
  '"{ad}" kaydını arşivlemek üzeresin. Listeden düşer, veritabanında kalır (geri alınabilir).':
    'You\'re about to archive the record "{ad}". It leaves the list but stays in the database (this can be undone).',
  '"{ad}" yapılacağını listenden kaldırmak üzeresin. (Geri alınabilir.)':
    'You\'re about to remove the to-do "{ad}" from your list. (This can be undone.)',
  "Bu işlemi onaylamak üzeresin.": "You're about to confirm this action.",
  "Projelio ekibine destek talebi gönderilecek.\nKonu: {konu}\nMesaj: {mesaj}":
    "A support request will be sent to the Projelio team.\nSubject: {konu}\nMessage: {mesaj}",
  '"{ad}" modülünü kapatmak üzeresin. Kayıtlar silinmez ama modül işin ekranlarından kaldırılır.':
    'You\'re about to turn off the module "{ad}". Records aren\'t deleted, but the module leaves the job\'s screens.',
  '"{ad}" modülünü kapatmak üzeresin. Kayıtlar silinmez ama modül organizasyonun ekranlarından kaldırılır.':
    'You\'re about to turn off the module "{ad}". Records aren\'t deleted, but the module leaves the organization\'s screens.',
  '"{ad}" organizasyonunu KALICI olarak silmek üzeresin. Departmanları, ürünleri ve modül kayıtları da gider. Bu işlem geri alınamaz.':
    'You\'re about to PERMANENTLY delete the organization "{ad}". Its departments, products and module records go too. This can\'t be undone.',
  "Projeye {tutar} ₺ tutarında gelir kaydı eklemek üzeresin":
    "You're about to add an income entry of ₺{tutar} to the project",
  "Projeye {tutar} ₺ tutarında gider kaydı eklemek üzeresin":
    "You're about to add an expense entry of ₺{tutar} to the project",
  "Projeye {tutar} ₺ tutarında ödeme kaydı eklemek üzeresin":
    "You're about to add a payout entry of ₺{tutar} to the project",
  "{moduleName} · {summary}": "{moduleName} · {summary}",
  "seçili öğe": "the selected item",
  // ─────────────────────────────────────────────── Kimlik akışı yanıtları
  //
  // Bunlar hesap VARLIĞINI sızdırmamak için bilerek belirsiz yazılmış
  // ("kayıtlıysa"); çeviride de o belirsizlik korunmalı.
  "Hesabın oluşturuldu. Girişten önce e-postana gönderdiğimiz bağlantıyla adresini doğrula.":
    "Your account has been created. Verify your address with the link we emailed you before signing in.",
  "Bu e-posta adresi kayıtlıysa, şifre sıfırlama bağlantısı gönderildi.":
    "If that email address is registered, a password reset link has been sent.",
  "Bu adres kayıtlı ve henüz doğrulanmamışsa, yeni bir doğrulama bağlantısı gönderildi.":
    "If that address is registered and not yet verified, a new verification link has been sent.",
  "Şifreniz güncellendi. Şimdi giriş yapabilirsiniz.": "Your password has been updated. You can sign in now.",
};
