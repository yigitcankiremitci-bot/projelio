import type { TranslationDict } from "@projelio/shared";

/**
 * Yeni üyenin ilk dakikaları: kurulum sihirbazı, profil seçenekleri ve
 * onların ortak etiketleri (packages/shared/src/types.ts).
 *
 * Ayrı bir dosya çünkü bu yol yabancı test kullanıcılarının İLK gördüğü
 * yer ve bir süre yalnızca Türkçe kalmıştı: kayıt olan herkes İngilizce
 * arayüzün ortasında Türkçe bir sihirbazla karşılaşıyordu.
 */
export const baslangic: TranslationDict = {
  // ─────────────────────────────────────────────── Kurulum sihirbazı
  "Devam etmek için bir seçenek seç": "Pick an option to continue",
  "Şirket/işletme adını gir": "Enter your company/business name",
  "Grup adını gir": "Enter your group name",
  "Bir şeyler ters gitti, tekrar dene.": "Something went wrong. Try again.",
  "Bu bilgiler profilinde görünür ve ekip arkadaşlarının seni tanımasını kolaylaştırır. Tamamı isteğe bağlı.":
    "This shows on your profile and helps teammates get to know you. All of it is optional.",
  "Fotoğrafı değiştir": "Change photo",
  "Profil fotoğrafı ekle": "Add profile photo",
  "Şirketini kuralım": "Let's set up your company",
  "Grubunu kuralım": "Let's set up your group",
  "İşlerini toplayacağın şirket/işletme birazdan oluşturulacak.":
    "The company/business that will hold your jobs is about to be created.",
  "Birden fazla organizasyonu altında toplayacağın holding yapısı oluşturulacak.":
    "A group structure to hold several organizations will be created.",
  "Şirket/işletme adı": "Company/business name",
  "Grup (holding) adı": "Group (holding) name",
  "Örn. Acme Yazılım A.Ş.": "e.g. Acme Software Inc.",
  "Örn. Acme Holding": "e.g. Acme Group",
  '"{ad}" için ISO 9001 uyumlu standart departmanlardan istediklerini işaretle. Bu adımı boş geçip departmanları sonra da ekleyebilirsin.':
    'Pick the ISO 9001 standard departments you want for "{ad}". You can skip this step and add departments later.',
  "Ya da özel departman adı (opsiyonel)": "Or a custom department name (optional)",
  "Birden fazla seçebilirsin. Buna göre hangi ekranların öne çıkacağına karar veriyoruz.":
    "You can pick more than one. We use this to decide which screens to put first.",
  "Şimdilik işine yarayacakları işaretle — bu bir tercih kaydı, hepsini sonradan açıp kapatabilirsin.":
    "Mark the ones useful to you for now. It's just a preference; you can turn any of them on or off later.",
  "Seçtiklerini bir kez gözden geçir; istersen geri dönüp değiştirebilirsin.":
    "Review your choices once; you can go back and change them.",
  "Çalışma şekli": "How you work",
  "Grup": "Group",
  "Şirket/işletme": "Company/business",
  "Unvan": "Title",
  "Kullanım amacı": "Use cases",
  "Kuruluyor…": "Setting up…",
  "Projelio'yu kullanmaya başla": "Start using Projelio",
  'Boş bırakırsan üyelik tipine göre "{unvan}" olarak görünür.':
    'If you leave it empty, it shows as "{unvan}" based on your account type.',

  // ─────────────────────────────────────────────── Profil seçenekleri (shared/types.ts)
  "Serbest Çalışan": "Freelancer",
  "Organizasyon Sahibi": "Organization Owner",
  "Grup Sahibi": "Group Owner",
  "Yalnızca ben": "Just me",
  "2-5 kişi": "2-5 people",
  "6-20 kişi": "6-20 people",
  "21-50 kişi": "21-50 people",
  "50+ kişi": "50+ people",
  "Yazılım / Teknoloji": "Software / Technology",
  "İnşaat / Mimarlık": "Construction / Architecture",
  "Danışmanlık": "Consulting",
  "Üretim / Sanayi": "Manufacturing / Industry",
  "Perakende / E-ticaret": "Retail / E-commerce",
  "Sağlık": "Healthcare",
  "Reklam / Medya": "Advertising / Media",
  "Lojistik / Nakliye": "Logistics / Transport",
  "Finans / Muhasebe": "Finance / Accounting",
  "Görev takibi": "Task tracking",
  "Proje yönetimi": "Project management",
  "Ekip koordinasyonu": "Team coordination",
  "Müşteri / cari takibi": "Customer / account tracking",
  "Bütçe ve finans": "Budget and finance",
  "Dosya ve doküman yönetimi": "File and document management",
  "Planlama ve takvim": "Planning and calendar",
};
