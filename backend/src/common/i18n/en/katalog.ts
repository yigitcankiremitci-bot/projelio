import type { TranslationDict } from "@projelio/shared";

/**
 * Departman ve modül kataloğu (department_catalog, module_catalog tabloları).
 *
 * Bu metinler KODDA değil, VERİTABANINDA duruyor — migration'larla yazılmış
 * referans verisi. Kurulum sihirbazı, "Modül ekle" penceresi ve departman
 * listesi onları doğrudan gösteriyordu; İngilizce arayüzde ilk ekrandan
 * itibaren "İNSAN KAYNAKLARI", "Fatura Modülü" gibi Türkçe adlar çıkıyordu.
 *
 * Çeviri katalog SUNULURKEN yapılıyor (catalog.service.ts), veritabanına
 * ikinci bir dil kolonu eklenmiyor: katalog salt okunur ve nadiren değişiyor,
 * sözlük yeterli. Katalog satırı değişirse buradaki anahtar da değişmeli;
 * denetim betiği bu dosyayı "artık anahtar" diye saymıyor çünkü anahtarlar
 * kodda geçmiyor (bkz. scripts/dil-denetimi.mjs VERITABANI_SOZLUKLERI).
 */
export const katalog: TranslationDict = {
  // ─────────────────────────────────────────────── Departmanlar
  "YÖNETİM": "MANAGEMENT",
  "Şirketin vizyonunu, stratejik hedeflerini belirler ve tüm departmanlar arasındaki koordinasyonu sağlar.":
    "Sets the company's vision and strategic goals and coordinates across all departments.",
  "İNSAN KAYNAKLARI": "HUMAN RESOURCES",
  "Şirketin en değerli kaynağı olan insan gücünün planlanması, kuruma kazandırılması ve yönetilmesiyle ilgilenir.":
    "Plans, hires and manages the company's most valuable resource: its people.",
  "FİNANS MUHASEBE": "FINANCE & ACCOUNTING",
  "Şirketin finansal sağlığını korumak, nakit akışını yönetmek ve yasal mali yükümlülükleri yerine getirmekle sorumludur.":
    "Protects the company's financial health, manages cash flow and meets legal financial obligations.",
  "PAZARLAMA ve BÜYÜME": "MARKETING & GROWTH",
  "Şirketin ürün ve hizmetlerini hedef kitleye tanıtmak, marka değerini artırmak ve talep yaratmakla görevlidir.":
    "Introduces the company's products and services to its audience, builds brand value and creates demand.",
  "SATIŞ ve İŞ GELİŞTİRME": "SALES & BUSINESS DEVELOPMENT",
  "Pazarlamanın yarattığı potansiyeli gelire dönüştürmekten ve yeni iş fırsatları oluşturmaktan sorumludur.":
    "Turns the potential created by marketing into revenue and opens new business opportunities.",
  "OPERASYON/ÜRETİM": "OPERATIONS/PRODUCTION",
  "Şirketin sunduğu ana ürün veya hizmetin somut/soyut olarak ortaya çıkarılmasını ve teslimatını sağlar.":
    "Produces and delivers the company's core product or service.",
  "BİLGİ TEKNOLOJİLERİ/YAZILIM": "IT/SOFTWARE",
  "Şirketin dijital altyapısını, siber güvenliğini ve geliştirdiği teknolojik ürünleri yönetir.":
    "Manages the company's digital infrastructure, cybersecurity and the technology products it builds.",
  "ÜRÜN YÖNETİMİ": "PRODUCT MANAGEMENT",
  "Özellikle teknoloji ve dijital odaklı şirketlerde, ürünün fikir aşamasından kullanıcıya ulaşana kadarki tüm yaşam döngüsünü yönetir.":
    "Manages the product's full life cycle from idea to user, especially in technology and digital companies.",
  "MÜŞTERİ İLİŞKİLERİ": "CUSTOMER RELATIONS",
  "Müşteri memnuniyetini sağlamak, sorunları çözmek ve mevcut müşterilerin elde tutulmasını (Retention) sağlamakla yükümlüdür.":
    "Keeps customers satisfied, solves their problems and retains existing customers.",
  "HUKUK ve UYUM": "LEGAL & COMPLIANCE",
  "Şirketin tüm faaliyetlerinin yasalara, yönetmeliklere ve sözleşmelere uygun olarak yürütülmesini güvence altına alır.":
    "Ensures all company activities comply with laws, regulations and contracts.",

  // ─────────────────────────────────────────────── Modüller
  "Misyon belirleme şablonu": "Mission statement template",
  "Kimlik ve Yön modülüne taşındı; ayrıca açılması gerekmez.":
    "Moved into the Identity & Direction module; no need to enable it separately.",
  "Vizyon belirleme şablonu": "Vision statement template",
  "Hedef belirleme modülü": "Goal setting",
  "Dönemsel hedefleri sorumlusu ve tarihiyle listeler; kimin neyi ne zamana kadar başaracağını tek yerde tutar.":
    "Lists periodic goals with owner and date, so who achieves what by when lives in one place.",
  "Analiz modülü": "Analytics",
  "Diğer modüllerin verisinden şirket geneli göstergeler üretir. Veri girişi yoktur, okur (panel).":
    "Builds company-wide indicators from other modules' data. No data entry; read-only (panel).",
  "Raporlama modülü": "Reporting",
  "Seçilen dönem için hazır raporlar üretir ve dışa aktarır. Veri girişi yoktur, okur (panel).":
    "Produces ready-made reports for the selected period and exports them. No data entry; read-only (panel).",
  "Denetim modülü": "Audit",
  "Kayıtlarda kim ne zaman ne değiştirdi, hangi süreç eksik kaldı — denetim izini gösterir (panel).":
    "Shows the audit trail: who changed what and when, and which processes were left incomplete (panel).",
  "Proje yönetimi modülü": "Project management",
  "Projelio'nun çekirdek proje yönetimidir; ayrıca etkinleştirilmesi gerekmez.":
    "Projelio's core project management; no need to enable it separately.",
  "Program yönetimi modülü": "Program management",
  "Süresi olmayan, tekrar eden işlerin (program) yönetimi. Projelio'nun çekirdeğidir.":
    "Manages recurring work with no end date (programs). Part of Projelio's core.",
  "Görev yönetimi modülü": "Task management",
  "Görev oluşturma, atama ve takip Projelio'nun çekirdeğidir; ayrıca etkinleştirilmesi gerekmez.":
    "Creating, assigning and tracking tasks is Projelio's core; no need to enable it separately.",
  "Çıktı yönetimi modülü": "Output management",
  "Projelerin somut çıktılarının yönetimi Projelio'nun çekirdeğidir.":
    "Managing the concrete outputs of projects is part of Projelio's core.",
  "Bütçe yönetimi modülü": "Budget management",
  "Planlanan ve gerçekleşen bütçeyi karşılaştırıp yönetime sapma gösterir. Veri girişi yoktur, okur (panel).":
    "Compares planned and actual budget and shows variance to management. No data entry; read-only (panel).",
  "Dosya yönetimi modülü": "File management",
  "Dosya saklama ve paylaşım Projelio'nun çekirdeğidir; Drive/OneDrive bağlantısıyla çalışır.":
    "File storage and sharing are part of Projelio's core; works with a Drive/OneDrive connection.",
  "İşe alım ve oryantasyon modülü": "Recruitment & onboarding",
  "Açık pozisyonlara gelen adayları mülakattan işe alıma kadar aşama aşama takip eder.":
    "Tracks candidates for open positions stage by stage, from interview to hire.",
  "Eğitim ve gelişim planlama modülü": "Training & development planning",
  "Çalışanların eğitim ve gelişim planlarını tarihi, katılımcısı ve maliyetiyle planlar.":
    "Plans employee training and development with dates, participants and cost.",
  "Performans izleme": "Performance tracking",
  "Dönemsel performans değerlendirmelerini kaydeder; kimin hedefine ne kadar yaklaştığını gösterir.":
    "Records periodic performance reviews and shows how close each person is to their goal.",
  "Bordro ve özlük modülü": "Payroll & personnel files",
  "Çalışan bazında dönemlik bordro ve ödeme kayıtlarını tutar. Maaş bilgisi içerir, yalnızca atanan kişiler görmelidir.":
    "Keeps periodic payroll and payment records per employee. Contains salary data; only assigned people should see it.",
  "İç iletişim ve şirket kültürü": "Internal communication & culture",
  "Şirket içi duyuru, etkinlik, anket ve kutlamaları planlar ve yayınlanma durumunu izler.":
    "Plans internal announcements, events, surveys and celebrations and tracks whether they've been published.",
  "Alacak-Borç Takibi": "Receivables & Payables",
  "Henüz tahsil edilmemiş alacakları ve ödenmemiş borçları vade tarihiyle takip eder.":
    "Tracks uncollected receivables and unpaid payables by due date.",
  "Fatura Modülü": "Invoices",
  "Kesilen ve alınan faturaları numarası, tutarı ve ödeme durumuyla kaydeder.":
    "Records issued and received invoices with number, amount and payment status.",
  "Vergi takip modülü": "Tax tracking",
  "Beyanname ve vergi ödeme yükümlülüklerini dönem ve son ödeme tarihiyle takip eder; gecikmeleri öne çıkarır.":
    "Tracks tax returns and payment obligations by period and due date, and highlights anything overdue.",
  "Bütçe hazırlama modülü": "Budget planning",
  "Dönem başında hangi kaleme ne kadar ayrılacağını planlar; gerçekleşmeyle karşılaştırma bütçe panelinde yapılır.":
    "Plans how much goes to each line at the start of a period; the comparison with actuals happens in the budget panel.",
  "Finansal Planlama Modülü": "Financial Planning",
  "Mevcut verilerden ileriye dönük finansal projeksiyon üretir. Veri girişi yoktur, okur (panel).":
    "Builds forward-looking financial projections from existing data. No data entry; read-only (panel).",
  "Nakit akış modülü": "Cash flow",
  "Gelir-gider kayıtlarından tarih bazlı nakit giriş/çıkış akışını çıkarır. Veri girişi yoktur, okur (panel).":
    "Derives dated cash inflows and outflows from income and expense entries. No data entry; read-only (panel).",
  "Analiz ve Rapor oluşturma": "Analysis & Reports",
  "Finansal verilerden kategori ve dönem kırılımlı analiz üretir. Veri girişi yoktur, okur (panel).":
    "Produces analysis broken down by category and period from financial data. No data entry; read-only (panel).",
  "Sermaye ve Yatırım takip modülü": "Capital & Investment tracking",
  "Yapılan ve planlanan yatırımları tutarı, beklenen getirisi ve durumuyla izler.":
    "Tracks completed and planned investments with amount, expected return and status.",
  "Risk yönetimi modülü": "Risk management",
  "Şirketi tehdit eden riskleri olasılık, etki, sorumlu ve alınacak önlemle birlikte kayıt altına alır.":
    "Records risks to the company with likelihood, impact, owner and mitigation.",
  "Rakip ve sektör analizi modülü": "Competitor & industry analysis",
  "Rakipleri güçlü/zayıf yanları, fiyat konumu ve tehdit seviyesiyle karşılaştırır.":
    "Compares competitors by strengths and weaknesses, price position and threat level.",
  "Hedef kitle modülü": "Target audience",
  "Hedef müşteri profillerini (persona) ihtiyaçları ve ulaşılan kanallarıyla tanımlar.":
    "Defines target customer profiles (personas) with their needs and the channels that reach them.",
  "Sosyal medya modülü": "Social media",
  "Sosyal medya gönderilerini platform ve tarihe göre planlar; taslaktan yayına durumunu izler.":
    "Plans social media posts by platform and date and tracks them from draft to published.",
  "E-mail modülü": "Email",
  "E-posta kampanyalarını hedef listesi, gönderim tarihi ve açılma/tıklanma oranlarıyla takip eder.":
    "Tracks email campaigns with target list, send date and open/click rates.",
  "Reklam modülü": "Advertising",
  "Reklam kampanyalarını platformu, bütçesi ve yayın durumuyla yönetir.":
    "Manages ad campaigns with platform, budget and run status.",
  "Ürün stratejileri bölümü": "Product strategies",
  "Her ürün için konumlandırma, hedef segment ve fiyatlandırma stratejisini tek yerde tutar.":
    "Keeps positioning, target segment and pricing strategy for each product in one place.",
  "Müşteri kazanım optimizasyonu": "Customer acquisition optimization",
  "Reklam ve satış verisinden müşteri kazanım maliyeti ve dönüşüm oranlarını çıkarır. Veri girişi yoktur, okur (panel).":
    "Derives customer acquisition cost and conversion rates from ad and sales data. No data entry; read-only (panel).",
  "Büyüme hedefleri": "Growth goals",
  "Sayısal büyüme hedeflerini ölçütü, hedef değeri ve mevcut değeriyle izler.":
    "Tracks numeric growth goals with metric, target value and current value.",
  "Satış planlama BtoB, BtoC": "Sales planning B2B, B2C",
  "Satış fırsatlarını potansiyelden kapanışa kadar aşama aşama takip eder; açık fırsat tutarını gösterir.":
    "Tracks sales opportunities stage by stage from lead to close and shows the open pipeline value.",
  "Ortaklık ve Dağıtım Modülü": "Partnerships & Distribution",
  "Bayi, distribütör ve iş ortaklarını bölgesi, komisyon oranı ve durumuyla yönetir.":
    "Manages dealers, distributors and partners with region, commission rate and status.",
  "Pazar ve araştırma modülü": "Market research",
  "Pazar büyüklüğü, fiyat ve trend araştırmalarını bulgularıyla birlikte arşivler.":
    "Archives market size, pricing and trend research along with the findings.",
  "Tedarik modülü": "Procurement",
  "Malzeme ve hizmet taleplerini siparişten teslimata kadar takip eder.":
    "Tracks material and service requests from order to delivery.",
  "Depo modülü": "Warehouse",
  "Stok kalemlerinin mevcut miktarını, birimini ve konumunu tutar; kritik seviyenin altına düşenleri uyarır.":
    "Keeps the quantity, unit and location of stock items and warns when one drops below its critical level.",
  "Sevkiyat yönetimi": "Shipment management",
  "Müşteriye giden sevkiyatları taşıyıcı, takip numarası ve teslim durumuyla izler.":
    "Tracks outgoing shipments with carrier, tracking number and delivery status.",
  "Mevzuatlar": "Regulations",
  "Şirketi bağlayan mevzuat ve düzenlemeleri uyum durumuyla birlikte arşivler.":
    "Archives the laws and regulations that bind the company, with compliance status.",
  "Takip edilen anahtar kelimeleri hedef sayfası, arama hacmi ve sıralamasıyla izler.":
    "Tracks keywords with target page, search volume and ranking.",
  "Kalite kontrol modülü": "Quality control",
  "Uygunsuzluk ve kalite sorunlarını düzeltici aksiyondan kapanışa kadar takip eder.":
    "Tracks nonconformities and quality issues from corrective action to closure.",
  "Yazılım modülü": "Software",
  "Kullanılan yazılım ve aboneliklerin envanteri; lisans türü ve yenileme tarihiyle takip edilir.":
    "Inventory of software and subscriptions in use, with license type and renewal date.",
  "Donanım modülü": "Hardware",
  "Şirket donanımlarını (bilgisayar, telefon, ağ cihazı) seri numarası ve zimmetli kişisiyle izler.":
    "Tracks company hardware (computers, phones, network devices) with serial number and assignee.",
  "Ağ ve güvenlik": "Network & security",
  "Güvenlik olaylarını ve periyodik kontrolleri önem derecesi ve çözüm durumuyla kayıt altına alır.":
    "Records security incidents and periodic checks with severity and resolution status.",
  "Ürünler modülü": "Products",
  "Şirketin ürün ve hizmetlerini fiyatı ve görseliyle tanımlar; şirket anasayfasında kart olarak listelenir.":
    "Defines the company's products and services with price and image; they're listed as cards on the company home page.",
  "Müşteriden gelen şikayet ve önerileri açıktan çözüme kadar takip eder.":
    "Tracks customer complaints and suggestions from open to resolved.",
  "Destek taleplerini önceliği, geliş kanalı ve sorumlusuyla açıktan kapanışa kadar yönetir.":
    "Manages support tickets with priority, channel and owner from open to closed.",
  "Sözleşme Modülü": "Contracts",
  "Müşteri, tedarikçi ve ortaklık sözleşmelerini taraf ve tarih aralığıyla takip eder; bitişi yaklaşanları öne çıkarır.":
    "Tracks customer, supplier and partnership contracts with parties and dates, and highlights those about to expire.",
  "Marka/Patent/Telif/Tescil Bölümü": "Trademarks/Patents/Copyright",
  "Marka, patent ve telif tescillerini başvuru/yenileme tarihleriyle izler; hak kaybı yaratacak gecikmeleri uyarır.":
    "Tracks trademark, patent and copyright registrations with filing and renewal dates, and warns before a lapse costs you the right.",
  "Analiz modülü (Holding geneli)": "Analytics (group-wide)",
  "Holdinge bağlı tüm şirketlerin verisini tek ekranda karşılaştırır. Veri girişi yoktur, okur (panel).":
    "Compares data from all companies in the group on one screen. No data entry; read-only (panel).",
  "Raporlama modülü (Holding geneli)": "Reporting (group-wide)",
  "Holding geneli konsolide raporlar üretir. Veri girişi yoktur, okur (panel).":
    "Produces consolidated group-wide reports. No data entry; read-only (panel).",
  "Denetim modülü (Holding geneli)": "Audit (group-wide)",
  "Holdinge bağlı şirketlerdeki değişiklik ve süreç izini gösterir. Veri girişi yoktur, okur (panel).":
    "Shows the change and process trail across the group's companies. No data entry; read-only (panel).",
  "Temas edilen tüm kişi ve kurumların tek kaydı; kimin ne zaman ne konuştuğu, neyi satın aldığı ve hangi sorunu yaşadığı tek karttan görülür.":
    "A single record of every person and organization you deal with: who said what and when, what they bought and which issues they had, all on one card.",
  "Dijital Pazarlama": "Digital Marketing",
  "Sosyal medya, e-posta, reklam ve SEO kanallarının performansını tek ekranda toplar. Veri girişi yoktur, okur (panel).":
    "Brings social media, email, ads and SEO performance together on one screen. No data entry; read-only (panel).",
  "Şirketin ne için var olduğunu ve nereye gittiğini tek sayfada tutar; hedefler, işe alım ve müşteri iletişimi aynı cümleye dayanır.":
    "Keeps why the company exists and where it's headed on one page, so goals, hiring and customer communication rest on the same statement.",
  "Markanın nerede yarıştığını, ne vaat ettiğini, nasıl konuştuğunu ve neye benzediğini tek sayfada tutar: konum, vaat ve kanıtlar, arketip ve kişilik, ses tonu, ad ve yazım kuralları, renk/logo/görsel dil, temas noktaları, tescil ve alan adları. Teklif, reklam ve sosyal medya metinleri aynı yerden beslenir.":
    "Keeps where the brand competes, what it promises, how it speaks and how it looks on one page: positioning, promise and proof, archetype and personality, tone of voice, naming and writing rules, color/logo/visual language, touchpoints, registrations and domains. Proposals, ads and social media copy all draw from the same source.",
  "Üye olunan tüm hesapları ve giriş bilgilerini tek yerde tutar: şifreler şifrelenmiş saklanır ve ancak kilit açılarak gösterilir, ücretli abonelikler kasaya düzenli gider olarak işlenir, giriş adresleri tek düğmeyle açılır.":
    "Keeps every account you've signed up for and its login details in one place: passwords are stored encrypted and shown only after unlocking, paid subscriptions go into the cash book as recurring expenses, and login pages open with one button.",

  // Web sözlüğünde de duranlar: modül ekranları onları kendi etiketleri
  // olarak kullanıyor, katalog da aynı adı taşıyor.
  "SEO / SEM": "SEO / SEM",
  "Şikayet ve Öneri": "Complaints & suggestions",
  "Teknik Destek": "Technical support",
  "Müşteri": "Customers",
  "Kimlik ve Yön": "Identity & Direction",
  "Marka Kimliği": "Brand Identity",
  "Hesaplar": "Accounts",
};
