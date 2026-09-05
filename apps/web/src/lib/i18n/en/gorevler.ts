import type { TranslationDict } from "@projelio/shared";

/**
 * Görevler, alt görevler, pano sütunları, görev düzenleme ve toplu seçim.
 *
 * Bu ekranlarda metin YERİ dar: pano kartları, sütun başlıkları, seçim
 * şeridindeki düğmeler. Çeviriyi kısa tut, uzun karşılık kartı taşırıyor.
 */
export const gorevler: TranslationDict = {
  // ─────────────────────────────────────────────── Temel kavramlar
  "Görev ekle": "Add task",
  "Yeni görev": "New task",
  "Görev adı": "Task name",
  "Görev başlığı": "Task title",
  "Görev başlığı gerekli": "A task title is required",
  "Görev başlığı yaz, Enter'a bas": "Type a task title, press Enter",
  "Görevi düzenle": "Edit task",
  "Görevi oluştur": "Create task",
  "Görev durumu": "Task status",
  "Görev önceliği": "Task priority",
  "Görev sırası": "Task order",
  "Görevler yükleniyor…": "Loading tasks…",
  "Görev listesi alınamadı.": "Could not load the task list.",
  "Görev güncellenemedi. Tekrar dene.": "Could not update the task. Try again.",
  "Görev oluşturulamadı": "Could not create the task",
  "Görev oluşturma": "Task creation",
  "Görevi": "the task",
  Yapılacaklar: "To do",
  // Pano sütun adları (bkz. TaskColumn columnLabel — modül düzeyi sabit,
  // çeviri render anında yapılıyor).
  "Yapılacak": "To do",
  "Devam eden": "In progress",
  "Tamamlandı": "Done",
  "Kişisel görev": "Personal task",
  "Kişisel görevlerini senden başkası görmez.": "Nobody but you sees your personal tasks.",
  "Atanan görev": "Assigned task",
  "Sana atanmış görevler. Buradaki sıralama yalnızca sana görünür.":
    "Tasks assigned to you. This ordering is visible only to you.",

  // ─────────────────────────────────────────────── Alt görevler
  "Alt görev ekle": "Add subtask",
  "Alt görev adı": "Subtask name",
  "Alt görev başlığı, Enter'a bas": "Subtask title, press Enter",
  "Alt görevi": "the subtask",
  "Alt görevi düzenle": "Edit subtask",
  "Alt görev taşıma": "Move subtask",
  "Alt göreve dönüştür": "Convert to subtask",
  "Alt göreve dönüştürüldü": "Converted to a subtask",
  "Alt göreve dönüştürülemedi.": "Could not convert it to a subtask.",
  "Alt görev yapılabileceği başka bir görev yok.": "There is no other task it could go under.",
  "Hangi görevin altına girsin?": "Which task should it go under?",
  "Göreve dönüştür": "Convert to task",
  "Göreve dönüştürüldü": "Converted to a task",
  "Göreve dönüştürülemedi.": "Could not convert it to a task.",
  "Dönüştürülüyor…": "Converting…",
  "Dönüştürme başarısız oldu.": "The conversion failed.",
  "Bu görevin kendi alt görevleri var, bu yüzden alt göreve dönüştürülemez. Önce alt görevlerini başka bir göreve taşı ya da üst seviyeye çıkar.":
    "This task has subtasks of its own, so it can't become a subtask. Move its subtasks under another task first, or promote them.",
  "Bu kayıt bir görev.": "This record is a task.",
  "Bu kayıt bir alt görev.": "This record is a subtask.",

  // ─────────────────────────────────────────────── Tamamlama
  "Görevi tamamla": "Complete task",
  "Tamamlandı olarak işaretle": "Mark as done",
  "Tamamlandıyı geri al": "Mark as not done",
  "Alt görevi tamamlandı olarak işaretle": "Mark subtask as done",
  "Alt görev tamamlandıyı geri al": "Mark subtask as not done",
  "Üzerinde çalışıyorum": "I'm working on this",
  "Üzerinde çalışmayı bırak": "Stop working on this",
  'görevini tamamlandı olarak işaretleyip "{sutun}" bölümüne taşımak istiyor musun?':
    'do you want to mark it done and move it to "{sutun}"?',
  "{sutun}'de": "in {sutun}",

  // ─────────────────────────────────────────────── Silme / arşivleme
  Sil: "Delete",
  "Arşivle": "Archive",
  "Görevleri sil": "Delete tasks",
  "Görevleri arşivle": "Archive tasks",
  "Görevden ayrıl": "Leave task",
  "Bu görevden ayrılmak istiyor musun? Görev silinmez, üzerinden düşersin.":
    "Do you want to leave this task? The task isn't deleted; you're just taken off it.",
  '"{baslik}" görevini silmek istediğine emin misin? Varsa bu göreve bağlı tüm alt görevler de silinecek. Silindikten sonra birkaç saniye içinde Cmd/Ctrl+Z ile geri alabilirsin, sonrasında kalıcı olarak silinir.':
    'Are you sure you want to delete "{baslik}"? Any subtasks under it will be deleted too. You have a few seconds to undo with Cmd/Ctrl+Z; after that it\'s permanent.',
  '"{baslik}" alt görevini silmek istediğine emin misin? Silindikten sonra birkaç saniye içinde Cmd/Ctrl+Z ile geri alabilirsin, sonrasında kalıcı olarak silinir.':
    'Are you sure you want to delete the subtask "{baslik}"? You have a few seconds to undo with Cmd/Ctrl+Z; after that it\'s permanent.',
  '"{baslik}" görevini arşive eklemek istediğine emin misin? Varsa bu göreve bağlı tüm alt görevler de arşive taşınır. İstediğin zaman Ayarlar > Arşiv üzerinden geri getirebilirsin.':
    'Are you sure you want to archive "{baslik}"? Any subtasks under it move to the archive too. You can bring it back any time from Settings > Archive.',
  '"{baslik}" alt görevini arşive eklemek istediğine emin misin? İstediğin zaman Ayarlar > Arşiv üzerinden geri getirebilirsin.':
    'Are you sure you want to archive the subtask "{baslik}"? You can bring it back any time from Settings > Archive.',
  "{n} görev silme": { one: "Deleting {n} task", other: "Deleting {n} tasks" },
  "{n} görev arşivleme": { one: "Archiving {n} task", other: "Archiving {n} tasks" },
  "{n} kişisel görev silme": { one: "Deleting {n} personal task", other: "Deleting {n} personal tasks" },
  "{n} görevi silmek istediğine emin misin? Kişisel görevler arşivlenir ve istediğin zaman geri getirebilirsin; atanmış görevler birkaç saniye içinde Cmd/Ctrl+Z ile geri alınabilir, sonrasında kalıcı olarak silinir.":
    {
      one: "Are you sure you want to delete {n} task? Personal tasks are archived and can be restored any time; assigned tasks can be undone with Cmd/Ctrl+Z for a few seconds, after which the deletion is permanent.",
      other:
        "Are you sure you want to delete {n} tasks? Personal tasks are archived and can be restored any time; assigned tasks can be undone with Cmd/Ctrl+Z for a few seconds, after which the deletion is permanent.",
    },
  "{n} görevi arşive taşımak istediğine emin misin? Arşivlenen görevler bu listeden kalkar, arşivden geri getirilebilir.": {
    one: "Are you sure you want to archive {n} task? Archived tasks leave this list and can be restored from the archive.",
    other:
      "Are you sure you want to archive {n} tasks? Archived tasks leave this list and can be restored from the archive.",
  },

  // ─────────────────────────────────────────────── Toplu seçim
  "{n} seçili": { one: "{n} selected", other: "{n} selected" },
  "Görev seçimini aç": "Start selecting tasks",
  "Seçimi iptal et": "Cancel selection",
  "Seçimi kaldır": "Clear selection",
  "Seçilenleri sil": "Delete selected",
  "Seçilenleri arşivle": "Archive selected",
  "Seçilenleri taşı": "Move selected",
  "Seçilenleri çoğalt": "Duplicate selected",
  "Seçilenleri Lio'ya sor": "Ask Lio about the selected",
  "Seçilenleri göreve / alt göreve dönüştür": "Convert selected to task / subtask",
  "{n} görev alt göreve alındı": { one: "{n} task moved under another", other: "{n} tasks moved under another" },
  "Çoğalt": "Duplicate",
  "Taşı": "Move",

  // ─────────────────────────────────────────────── Sıralama
  "Sıralama ölçütü": "Sort by",
  "Sıralama: {olcut}": "Sorted by: {olcut}",
  "Kartlar seçtiğin ölçüte göre sıralı; kendi sıranı düzenlemek için “Kendi sıram”a dön.":
    "Cards follow the sort you picked; switch back to “My order” to arrange them yourself.",

  // ─────────────────────────────────────────────── Alanlar
  "Başlık": "Title",
  "Açıklama": "Description",
  "Teslim tarihi": "Due date",
  "Başlangıç tarihi": "Start date",
  "Bitiş tarihi": "End date",
  "Bitiş saati (opsiyonel)": "End time (optional)",
  "Tahmini süre (opsiyonel)": "Estimated time (optional)",
  "Görevle ilgili notlar (opsiyonel)": "Notes about the task (optional)",
  "Görünen ad (opsiyonel)": "Display name (optional)",
  Notlar: "Notes",
  "Öncelik": "Priority",
  "Öncelik {n}/{toplam}": "Priority {n}/{toplam}",
  "Önceliği kaldır": "Clear priority",
  "{n} yıldız": { one: "{n} star", other: "{n} stars" },
  Seviye: "Level",
  "Bütçe (₺)": "Budget (₺)",
  "Ekip": "Team",
  Kime: "To",
  "Çıktı": "Output",
  "Çıktı yok": "No output",
  "Görevin çıktısı değişti": "The task's output changed",
  "Bu görevin bağlı olduğu bir proje ya da departman yok.":
    "This task isn't attached to a project or a department.",
  "Örn. 4": "e.g. 4",
  "Adı değiştirmek için çift tıkla": "Double-click to rename",
  "Çift tıkla: alt görevi düzenle": "Double-click to edit the subtask",
  "Çift tıkla: görevin bulunduğu sayfaya git": "Double-click to open the task's page",

  // ─────────────────────────────────────────────── Hatırlatma
  Hatırlat: "Remind me",
  "Hatırlatma yok": "No reminder",
  "Tam saatinde": "On time",
  "1 saat önce": "1 hour before",
  "1 gün önce": "1 day before",
  "15 dakika önce": "15 minutes before",
  "Gün": "Day",
  Saat: "Time",

  // ─────────────────────────────────────────────── Ekler ve bağlantılar
  Dosyalar: "Files",
  "Dosyayı aç": "Open file",
  "Bu dosya açılamıyor (erişim yok)": "This file can't be opened (no access)",
  "Eki kaldır": "Remove attachment",
  "Bağlantılar": "Links",
  "Bağlantı ekle": "Add link",
  "Bağlantıyı aç": "Open link",
  "Bağlantı eklenemedi. Tekrar dene.": "Could not add the link. Try again.",
  "Bu bağlantı açılamıyor: adres geçerli bir web adresi değil.":
    "This link can't be opened: the address isn't a valid web address.",
  "Henüz bağlantı yok. Çıktının adresini buraya bırak — dosyalar aşağıdaki Dosyalar bölümünden Drive/OneDrive'a eklenir.":
    "No links yet. Drop the output's address here — files go to Drive/OneDrive from the Files section below.",
  "{n} bağlantı": { one: "{n} link", other: "{n} links" },
  "{n} bağlantı — açmak için tıkla": { one: "{n} link — click to open", other: "{n} links — click to open" },
  "{n} dosya": { one: "{n} file", other: "{n} files" },
  "{n} dosya — açmak için tıkla": { one: "{n} file — click to open", other: "{n} files — click to open" },

  // ─────────────────────────────────────────────── Yorumlar
  Yorumlar: "Comments",
  "Yorum yaz…": "Write a comment…",
  "Henüz yorum yok.": "No comments yet.",

  // ─────────────────────────────────────────────── Modül kaydından görev
  "{modul} kaydından oluşturuldu.": "Created from a {modul} record.",
  "Bu kayıttan daha önce {n} görev oluşturulmuş.": {
    one: "{n} task has already been created from this record.",
    other: "{n} tasks have already been created from this record.",
  },

  // ─────────────────────────────────────────────── Ortak düğmeler
  Kaydet: "Save",
  Ekle: "Add",
  "Gönder": "Send",
  "Vazgeç": "Cancel",
  "Seç": "Select",
  "Oluşturuluyor…": "Creating…",
  "Lio'ya sor": "Ask Lio",
  // ─────────────────────────────────────────────── Görev oluşturma ve taşıma
  "Görevi taşı": "Move task",
  "Görev ara…": "Search tasks…",
  "Görev eklemek için önce bir proje oluşturman gerekiyor.":
    "You need to create a project before you can add a task.",
  "Bu görevi senden başkası görmez.": "Nobody but you sees this task.",
  "Kişisel görevi düzenle": "Edit personal task",
  "Çıktı (opsiyonel)": "Output (optional)",
  "Çıktıdan çıkar": "Remove from output",
  "Çıktısız — proje görevi": "No output — project task",
  "Çıktılar yükleniyor…": "Loading outputs…",
  "Projeler yükleniyor…": "Loading projects…",
  "Hedef çıktı": "Target output",
  "Bağlı iş:": "Linked job:",
  "İlgili kişi": "Contact",
  "Örn. Logo revizyonu": "e.g. Logo revision",
  "Seç…": "Select…",
  "— seçilmedi —": "— not selected —",
  Not: "Note",
  Departman: "Department",
};
