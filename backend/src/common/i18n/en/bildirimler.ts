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
};
