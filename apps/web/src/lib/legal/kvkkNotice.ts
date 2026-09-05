/**
 * KVKK aydınlatma metni — Türkçe ve İngilizce.
 *
 * NEDEN GİZLİLİK POLİTİKASINDAN AYRI: 6698 sayılı Kanun m.10 aydınlatmayı
 * "veri işlemeden ÖNCE, ayrı ve anlaşılır" biçimde arıyor. Gizlilik politikası
 * bunu içeriyor ama 19 bölüm içine dağılmış hâlde; Kurul'un aradığı sayfa, tek
 * ekranda okunan ve kayıt ekranından doğrudan erişilen bu metindir.
 *
 * Aynı metin tanıtım sitesinde de yayımlanıyor (landing/, src/i18n/legal.ts,
 * `kvkk` anahtarı). Birini değiştirirsen diğerini de güncelle; iki yerde farklı
 * yasal metin yayımlamak hukuki risktir.
 *
 * Ayrıntı burada TEKRARLANMAZ, gizlilik politikasına atıf yapılır: iki metin
 * aynı şeyi iki farklı ayrıntı düzeyinde anlatırsa, biri güncellenip diğeri
 * unutulduğunda çelişki doğar.
 */
import type { LegalDoc } from "./legalDoc";

export const kvkkDoc: LegalDoc = {
  path: "/kvkk",
  text: {
    tr: {
      title: "KVKK Aydınlatma Metni",
      lede: "6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında veri sorumlusu sıfatıyla yaptığımız bilgilendirme.",
      effective: "4 Eylül 2026",
    },
    en: {
      title: "Privacy Notice (KVKK)",
      lede: "Our disclosure as data controller under Turkish Personal Data Protection Law no. 6698.",
      effective: "4 September 2026",
    },
  },
  sections: {
    tr: [
      {
        h: "1. Veri sorumlusu",
        p: [
          "6698 sayılı Kişisel Verilerin Korunması Kanunu (\"KVKK\") uyarınca veri sorumlusu sıfatıyla, kişisel verileriniz aşağıda açıklanan kapsamda işlenmektedir.",
          "Veri sorumlusu: [ŞİRKET UNVANI], [ADRES], [VERBİS KAYIT NUMARASI]. İletişim: info@projelio.app",
          "Organizasyonunuzun Projelio içinde ürettiği içerik bakımından veri sorumlusu organizasyonunuzdur; biz veri işleyen sıfatıyla hareket ederiz.",
        ],
      },
      {
        h: "2. İşlenen kişisel veriler",
        p: [
          "Kimlik: ad, soyad. İletişim: e-posta, telefon, adres. Müşteri işlem: abonelik, sipariş, fatura ve ödeme kayıtları. İşlem güvenliği: IP adresi, giriş denemeleri, oturum ve log kayıtları, cihaz bilgisi. Mesleki deneyim: unvan, departman, organizasyon.",
          "Ayrıca Hizmet içinde ürettiğiniz içerik (iş, proje, görev, modül kayıtları, dosyalar, yorumlar) ile Lio asistanına ve WhatsApp üzerinden ilettiğiniz mesajların içeriği işlenir.",
          "Özel nitelikli kişisel veri toplamayı amaçlamıyoruz; serbest metin alanlarına bu tür veri girilmemesini öneririz.",
        ],
      },
      {
        h: "3. İşleme amaçları",
        p: [
          "Hizmetin sunulması ve sözleşmenin ifası, hesabınızın ve yetkilerinizin yönetimi, faturalandırma ve muhasebe kayıtlarının tutulması, bilgi güvenliğinin sağlanması ve kötüye kullanımın önlenmesi, talep ve şikâyetlerin karşılanması, yasal yükümlülüklerin yerine getirilmesi ve açık rıza bulunması hâlinde tanıtım faaliyetleri.",
        ],
      },
      {
        h: "4. Hukuki sebepler",
        p: [
          "KVKK m.5/2-c (sözleşmenin kurulması veya ifası), m.5/2-ç (hukuki yükümlülük), m.5/2-e (hakkın tesisi ve korunması), m.5/2-f (meşru menfaat) ve gerekli hâllerde m.5/1 (açık rıza).",
        ],
      },
      {
        h: "5. Aktarım ve yurt dışı",
        p: [
          "Uygulama sunucusu, veritabanı ve yüklediğiniz dosyalar Türkiye'dedir. Yedekler de Türkiye'de saklanır.",
          "Kişisel verileriniz; barındırma, e-posta, bildirim ve destek hizmeti aldığımız tedarikçilere, yetkili kamu kurumlarına ve mevzuattan doğan hâllerde ilgili taraflara, amaçla sınırlı olarak aktarılabilir.",
          "Yurt dışına aktarım şunlarla sınırlıdır: yapay zekâ asistanı (Amerika Birleşik Devletleri; yedek tedarikçi devredeyse Çin Halk Cumhuriyeti), e-posta gönderimi (ABD), tarayıcınızın anlık bildirim altyapısı, yazı tipi hizmeti ve kendi isteğinizle bağladığınız üçüncü taraf hizmetler. Bu aktarımlar KVKK m.9 çerçevesinde, standart sözleşme ya da mevzuatın öngördüğü diğer güvencelerle yapılır.",
          "Tedarikçilerin tam listesi ve hangi veriye erişildiği Gizlilik Politikası'nın \"Bilgileri kimlerle paylaşıyoruz\" ve \"Verileriniz nerede tutuluyor\" bölümlerindedir.",
        ],
      },
      {
        h: "6. Toplama yöntemi",
        p: [
          "Veriler; web sitesi ve uygulama formları, Google veya Microsoft ile giriş, e-posta, destek kanalları, WhatsApp üzerinden yapılan yazışmalar ve otomatik sistem kayıtları aracılığıyla, kısmen otomatik yollarla toplanır.",
        ],
      },
      {
        h: "7. Saklama süreleri",
        p: [
          "Veriler, işlenme amacının gerektirdiği süre ve mevzuatın öngördüğü asgari süreler boyunca saklanır; süresi dolanlar silinir veya anonim hâle getirilir.",
          "Başlıca süreler: hesap silme talebinden sonra 30 günlük bekleme ve ardından kalıcı silme, Lio sohbet geçmişi 90 gün, WhatsApp konuşma kayıtları 90 gün, teknik ve güvenlik kayıtları en fazla 12 ay, faturalandırma kayıtları mevzuat gereği 10 yıl. Tam liste Gizlilik Politikası'nın \"Saklama süreleri\" bölümündedir.",
        ],
      },
      {
        h: "8. İlgili kişinin hakları ve başvuru",
        p: [
          "KVKK m.11 uyarınca; kişisel verinizin işlenip işlenmediğini öğrenme, bilgi talep etme, amaca uygun kullanılıp kullanılmadığını öğrenme, düzeltilmesini veya silinmesini isteme, aktarıldığı üçüncü kişileri öğrenme, bu işlemlerin aktarılan üçüncü kişilere bildirilmesini isteme, münhasıran otomatik sistemlerle analiz sonucu aleyhinize bir sonuç doğmasına itiraz etme ve kanuna aykırı işleme nedeniyle zarara uğramanız hâlinde zararın giderilmesini talep etme haklarına sahipsiniz.",
          "Çoğu talebi uygulama içinden kendiniz karşılayabilirsiniz: profilinizi güncelleyebilir, verilerinizi Excel olarak dışa aktarabilir ve hesabınızın silinmesini talep edebilirsiniz.",
          "Başvurularınızı info@projelio.app adresine iletebilirsiniz; kimliğinizi doğrulamak için ek bilgi isteyebiliriz. Talepler en geç 30 gün içinde ücretsiz olarak sonuçlandırılır. Sonuçtan memnun kalmazsanız Kişisel Verileri Koruma Kurulu'na şikâyette bulunabilirsiniz.",
        ],
      },
    ],
    en: [
      {
        h: "1. Data controller",
        p: [
          "Under Turkish Personal Data Protection Law no. 6698 (\"KVKK\"), your personal data is processed as data controller within the scope described below.",
          "Data controller: [COMPANY LEGAL NAME], [ADDRESS], [VERBIS REGISTRATION NUMBER]. Contact: info@projelio.app",
          "For the content your organisation creates inside Projelio, your organisation is the controller and we act as a processor.",
        ],
      },
      {
        h: "2. Categories of data",
        p: [
          "Identity: first and last name. Contact: email, phone, address. Customer transactions: subscription, order, invoice and payment records. Transaction security: IP address, sign-in attempts, session and log records, device information. Professional details: title, department, organisation.",
          "We also process the content you create inside the Service (jobs, projects, tasks, module records, files, comments) and the content of the messages you send to the Lio assistant and over WhatsApp.",
          "We do not seek to collect special categories of personal data and recommend that you do not enter such data into free-text fields.",
        ],
      },
      {
        h: "3. Purposes",
        p: [
          "Providing the service and performing the contract, managing your account and permissions, keeping invoicing and accounting records, ensuring information security and preventing abuse, handling requests and complaints, meeting legal obligations, and marketing activity where explicit consent exists.",
        ],
      },
      {
        h: "4. Legal grounds",
        p: [
          "KVKK art. 5/2-c (conclusion or performance of a contract), 5/2-ç (legal obligation), 5/2-e (establishment and protection of rights), 5/2-f (legitimate interest) and, where required, art. 5/1 (explicit consent).",
        ],
      },
      {
        h: "5. Transfers, including abroad",
        p: [
          "The application server, the database and the files you upload are located in Türkiye. Backups are kept in Türkiye as well.",
          "Your personal data may be transferred, limited to the purpose, to suppliers providing hosting, email, notification and support services, to authorised public bodies, and to relevant parties where legislation requires.",
          "Transfers abroad are limited to: the AI assistant (United States; the People's Republic of China if a fallback supplier is in use), email delivery (USA), your browser's push notification infrastructure, the web font service, and the third-party services you connect yourself. Such transfers are made under KVKK art. 9 with a standard contract or another safeguard the legislation provides.",
          "The full list of suppliers and what each can access is in the \"Who we share information with\" and \"Where your data is kept\" sections of the Privacy Policy.",
        ],
      },
      {
        h: "6. Collection method",
        p: [
          "Data is collected partly by automated means through website and application forms, signing in with Google or Microsoft, email, support channels, conversations over WhatsApp, and automatic system records.",
        ],
      },
      {
        h: "7. Retention",
        p: [
          "Data is kept for as long as the purpose requires and for the minimum periods the law prescribes; data whose period has expired is deleted or anonymised.",
          "The main periods: a 30-day waiting period after a deletion request followed by permanent deletion, Lio chat history 90 days, WhatsApp conversation records 90 days, technical and security logs at most 12 months, billing records 10 years as required by law. The full list is in the \"Retention\" section of the Privacy Policy.",
        ],
      },
      {
        h: "8. Your rights and how to apply",
        p: [
          "Under KVKK art. 11 you may learn whether your data is processed, request information, learn whether it is used for its purpose, request correction or deletion, learn the third parties it was transferred to, request that these actions be notified to those third parties, object to results arising solely from automated analysis, and claim compensation for damage caused by unlawful processing.",
          "You can handle most requests yourself inside the application: update your profile, export your data as an Excel file, and request deletion of your account.",
          "Send applications to info@projelio.app; we may ask for additional information to verify your identity. Requests are concluded free of charge within 30 days at the latest. If you are not satisfied with the outcome you may complain to the Turkish Personal Data Protection Authority.",
        ],
      },
    ],
  },
};
