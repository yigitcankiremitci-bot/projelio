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
};
