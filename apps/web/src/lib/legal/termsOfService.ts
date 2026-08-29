/**
 * Kullanıcı sözleşmesinin tam metni — Türkçe ve İngilizce.
 *
 * Aynı metin tanıtım sitesinde de yayımlanıyor (landing/,
 * src/i18n/legal.ts). Birini değiştirirsen diğerini de güncelle; iki yerde
 * farklı yasal metin yayımlamak hukuki risktir.
 *
 * Köşeli parantezli alanlar ([ŞİRKET UNVANI] gibi) yayına almadan önce
 * doldurulmalı ve metin bir hukuk danışmanınca gözden geçirilmelidir.
 */
import type { LegalDoc } from "./legalDoc";

export const termsDoc: LegalDoc = {
  path: "/terms",
  text: {
    tr: {
      title: "Kullanıcı Sözleşmesi",
      lede: "Projelio'yu kullanırken sizin ve bizim hak ve yükümlülüklerimiz.",
      effective: "21 Ağustos 2026",
    },
    en: {
      title: "User Agreement",
      lede: "The rights and obligations that apply to you and to us when you use Projelio.",
      effective: "21 August 2026",
    },
  },
  sections: {
    tr: [
      {
        h: "Kısaca",
        p: [
          "Bu sözleşme, Projelio'yu kullanırken sizin ve bizim neyi taahhüt ettiğimizi belirler. Hesap açtığınızda ya da Hizmet'i kullanmaya devam ettiğinizde bu koşulları kabul etmiş olursunuz.",
          "Özetle: ürettiğiniz içerik sizindir; yazılım bizimdir. Hesabınızın güvenliğinden siz, hizmetin çalışmasından biz sorumluyuz. Aboneliğinizi istediğiniz an iptal edebilir, verilerinizi dışa aktarabilirsiniz.",
          "Bu özet bağlayıcı değildir; bağlayıcı olan aşağıdaki tam metindir.",
        ],
      },
      {
        h: "1. Taraflar ve sözleşmenin konusu",
        p: [
          "Bu Kullanıcı Sözleşmesi (\"Sözleşme\"), bir tarafta [ŞİRKET UNVANI] ([ADRES]) (\"Projelio\", \"biz\") ile diğer tarafta Hizmet'i kullanan gerçek veya tüzel kişi (\"Kullanıcı\", \"siz\") arasında kurulur.",
          "Sözleşmenin konusu, Projelio'nun sunduğu iş, proje, görev, ekip, modül, bütçe ve yapay zekâ asistanı özelliklerinden oluşan bulut tabanlı yazılım hizmetinin (\"Hizmet\") hangi koşullarla kullanılacağıdır.",
          "Hesap oluşturarak, bir davet kabul ederek veya Hizmet'i kullanmaya devam ederek bu Sözleşme'yi ve ayrılmaz parçası olan Gizlilik Politikası'nı kabul etmiş sayılırsınız. Kabul etmiyorsanız Hizmet'i kullanmamalısınız.",
          "Ücretli paket satın alan tüketiciler bakımından Mesafeli Satış Sözleşmesi ile İptal ve İade Koşulları da uygulanır. Bu metinler arasında çelişki olursa, satın alma işlemine özgü konularda ilgili özel metin geçerlidir.",
        ],
      },
      {
        h: "2. Tanımlar",
        p: [
          "Hizmet: projelio.app alan adı ve alt alan adları üzerinden sunulan web ve mobil uygulamalar, Lio asistanı, entegrasyonlar ve destek kanalları.",
          "Organizasyon: Hizmet içinde oluşturulan ve altında departman, iş, proje ve modüllerin toplandığı kurumsal yapı.",
          "Yönetici: Organizasyon sahibi, iş sahibi veya departman yöneticisi sıfatıyla başkalarının erişimini düzenleyebilen kullanıcı.",
          "İçerik: Hizmet'e yüklediğiniz veya Hizmet içinde ürettiğiniz her türlü veri, metin, dosya, görsel ve kayıt.",
          "Abonelik: seçtiğiniz paket kapsamında, belirli bir dönem için Hizmet'i kullanma hakkı.",
          "Kredi: Lio'nun yapay zekâ özelliklerinin kullanımını ölçen ve satın alınabilen birim.",
        ],
      },
      {
        h: "3. Hesap açma ve uygunluk",
        p: [
          "Hizmet iş amaçlı bir yazılımdır ve yalnızca 18 yaşını doldurmuş kişiler tarafından kullanılabilir. Bir tüzel kişi adına hesap açıyorsanız, o tüzel kişiyi temsil ve ilzama yetkili olduğunuzu beyan etmiş olursunuz.",
          "Kayıt sırasında verdiğiniz bilgilerin doğru, güncel ve eksiksiz olmasından siz sorumlusunuz. E-posta adresinizi doğrulamadan hesabınıza giriş yapılamaz.",
          "Parolanızın ve oturumunuzun gizliliğinden siz sorumlusunuz. Hesabınız üzerinden yapılan tüm işlemler, aksini ispat etmediğiniz sürece size ait sayılır.",
          "Hesabınıza yetkisiz bir erişim olduğunu düşünüyorsanız gecikmeksizin parolanızı değiştirmeli ve info@projelio.app adresinden bize bildirmelisiniz.",
          "Bir hesap tek bir kişiye aittir; hesap paylaşımı yapılamaz. Ekipteki her kişi kendi hesabıyla giriş yapmalıdır.",
        ],
      },
      {
        h: "4. Organizasyonlar ve yönetici yetkisi",
        p: [
          "Bir organizasyona kurumsal e-posta adresinizle katıldığınızda ya da bir yönetici tarafından eklendiğinizde, o organizasyondaki kullanımınız aynı zamanda organizasyonun kurallarına tabidir.",
          "Yöneticiler; sizi işe, projeye, departmana veya modül ekibine ekleyebilir, yetkilerinizi değiştirebilir, erişiminizi sonlandırabilir ve yetkileri kapsamındaki içeriği görüntüleyebilir, düzenleyebilir veya silebilir. Bu, hizmetin doğal bir parçasıdır.",
          "İşe veya projeye davetler onaya tabidir. Bekleyen veya reddedilen bir davet hiçbir erişim hakkı vermez.",
          "Organizasyon adına oluşturulan İçerik organizasyona aittir. Hesabınızın kapanması, organizasyonda kalan İçeriği ortadan kaldırmaz.",
          "Ücretli paketlerde, organizasyonun aboneliğinden ve ücretlerinden organizasyon sahibi sorumludur.",
        ],
      },
      {
        h: "5. Kabul edilebilir kullanım",
        p: [
          "Hizmet'i yalnızca hukuka, ahlaka ve bu Sözleşme'ye uygun biçimde kullanabilirsiniz.",
          "Şunlar yasaktır: hukuka aykırı, hakaret içeren, ayrımcı, tehdit edici veya başkalarının haklarını ihlal eden içerik yüklemek; başkasının kişisel verilerini hukuka aykırı biçimde işlemek; zararlı yazılım, virüs veya kötü amaçlı kod barındırmak; izinsiz reklam ve toplu ileti (spam) göndermek.",
          "Şunlar da yasaktır: Hizmet'i tersine mühendisliğe tabi tutmak, kaynak koda ulaşmaya çalışmak, kopyalamak veya benzer bir ürün geliştirmek için kullanmak; güvenlik önlemlerini aşmaya çalışmak; başka bir kullanıcının hesabına izinsiz erişmek; paket sınırlarını teknik yollarla aşmak.",
          "Otomatik erişim (bot, kazıyıcı, yük testi) ve Hizmet'in altyapısına orantısız yük bindiren kullanım, önceden yazılı iznimiz olmadıkça yasaktır. Güvenlik testi yapmak istiyorsanız önce bize yazın.",
          "Hizmet'i kendi müşterilerinize yeniden satmak, kiralamak veya hizmet bürosu gibi kullanmak yalnızca ayrı bir yazılı anlaşmayla mümkündür.",
          "İhlal tespit edersek içeriği kaldırabilir, erişimi sınırlayabilir veya hesabı askıya alabiliriz (bkz. 14. bölüm).",
        ],
      },
      {
        h: "6. İçeriğiniz",
        p: [
          "İçeriğinizin mülkiyeti size (veya ilgili organizasyona) aittir. Bu Sözleşme size ait fikri mülkiyet haklarını bize devretmez.",
          "Hizmet'i sunabilmemiz için bize; İçeriğinizi barındırmak, yedeklemek, işlemek, ekip arkadaşlarınıza göstermek ve talebiniz üzerine bağladığınız üçüncü taraf hizmetlere iletmek amacıyla sınırlı, dünya çapında, telifsiz ve devredilebilir olmayan bir kullanım hakkı vermiş olursunuz. Bu hak yalnızca Hizmet'in işletilmesi için kullanılır.",
          "İçeriğinizi yükleme, işleme ve paylaşma hakkına sahip olduğunuzu; üçüncü kişilerin kişisel verilerini yüklüyorsanız gerekli aydınlatma ve hukuki sebebi sağladığınızı beyan edersiniz.",
          "İçeriğinizin doğruluğundan, hukuka uygunluğundan ve saklanması gereken yasal kayıtlarınızın kendi nezdinizde de bulundurulmasından siz sorumlusunuz. Düzenli yedek alsak da, kritik verilerinizin dışa aktarılmış bir kopyasını kendinizde bulundurmanızı öneririz.",
          "Hukuka aykırı olduğu açık olan veya yetkili bir makam tarafından bildirilen içeriği kaldırma hakkımız saklıdır.",
        ],
      },
      {
        h: "7. Projelio'nun fikri mülkiyeti",
        p: [
          "Hizmet'in yazılımı, kaynak kodu, arayüz tasarımı, veritabanı şeması, dokümantasyonu, \"Projelio\" ve \"Lio\" adları ile logoları dâhil tüm fikri ve sınai haklar Projelio'ya aittir.",
          "Size verilen hak; Abonelik süresince, seçtiğiniz paket kapsamında, devredilemez ve münhasır olmayan biçimde Hizmet'i kullanma hakkından ibarettir. Bunun dışında hiçbir hak devri yapılmaz.",
          "Marka, logo ve görsellerimizi önceden yazılı iznimiz olmadan kullanamaz, Hizmet'in herhangi bir parçasını çoğaltamaz veya türev çalışma üretemezsiniz.",
        ],
      },
      {
        h: "8. Geri bildirim",
        p: [
          "Bize ilettiğiniz öneri, fikir ve geri bildirimleri; size karşı herhangi bir yükümlülük doğurmaksızın, ücret ödemeksizin ve süresiz olarak kullanabilir, ürüne dâhil edebiliriz.",
          "Bu, İçeriğiniz üzerindeki haklarınızı etkilemez; yalnızca ürünün geliştirilmesine dair önerileri kapsar.",
        ],
      },
      {
        h: "9. Lio ve yapay zekâ özellikleri",
        p: [
          "Lio, Hizmet'e gömülü yapay zekâ asistanıdır. Lio yalnızca sizin görme ve değiştirme yetkiniz olan verilerle çalışır.",
          "Yapay zekâ çıktıları olasılıksaldır ve hata içerebilir. Çıktıların doğruluğu, eksiksizliği veya belirli bir amaca uygunluğu garanti edilmez. Finansal, hukuki, vergisel veya operasyonel kararlarınızı yalnızca Lio'nun yanıtına dayandırmamalısınız; doğrulama sorumluluğu size aittir.",
          "Lio kullanımı Kredi tüketir. Her isteğin tükettiği kredi, işlenen ve üretilen metin miktarına göre hesaplanır ve hesabınızda görüntülenir. Paketinize dâhil krediler dönem sonunda devretmez; satın alınan krediler aksi belirtilmedikçe devreder.",
          "Krediyi tüketmek amacıyla otomatik veya kötü niyetli kullanım, kredi bakiyesinin manipülasyonu ve Lio üzerinden Hizmet'in kabul edilebilir kullanım kurallarının aşılması yasaktır.",
          "Yapay zekâ altyapısını sağlayan tedarikçiyi değiştirebilir, model sürümünü güncelleyebiliriz. Bu değişiklikler çıktıların biçimini ve kalitesini etkileyebilir.",
        ],
      },
      {
        h: "10. Üçüncü taraf hizmetler ve entegrasyonlar",
        p: [
          "Google Drive, Microsoft OneDrive ve Outlook, Instagram, WhatsApp gibi hizmetlere bağlanmayı seçebilirsiniz. Bu bağlantıları siz kurar, istediğiniz an kaldırırsınız.",
          "Bu hizmetler bizim kontrolümüzde değildir; kendi sözleşme ve gizlilik koşullarına tabidir. Kullanımlarından, kesintilerinden veya koşullarını değiştirmelerinden sorumlu değiliz.",
          "Bir üçüncü taraf hizmet erişimini durdurur, ücretlendirmeye başlar veya arayüzünü değiştirirse, ilgili entegrasyonu bildirimde bulunarak kaldırabilir veya değiştirebiliriz.",
        ],
      },
      {
        h: "11. Ücretsiz paket, deneme ve beta özellikler",
        p: [
          "Ücretsiz Başlangıç paketi, ilan edilen sınırlar dâhilinde süresiz kullanılabilir. Ücretsiz kullanım için hizmet seviyesi taahhüdü verilmez.",
          "Ücretli paketler için sunulan deneme süresi boyunca kart bilgisi istenmez ve otomatik ücretlendirme yapılmaz. Süre sonunda paket seçmezseniz hesabınız ücretsiz pakete düşer; paket sınırlarını aşan İçeriğiniz silinmez, salt okunur hâle gelebilir.",
          "\"Beta\", \"önizleme\" veya \"deneysel\" olarak işaretlenen özellikler eksik veya kararsız olabilir; her an değiştirilebilir ya da kaldırılabilir. Bu özellikler \"olduğu gibi\" sunulur ve hizmet seviyesi taahhüdü kapsamı dışındadır.",
        ],
      },
      {
        h: "12. Paketler, ücretler ve faturalandırma",
        p: [
          "Güncel paketler, kullanıcı başına fiyatlar ve kredi paketleri projelio.app üzerindeki fiyatlandırma sayfasında yayımlanır. Aksi belirtilmedikçe fiyatlara KDV dâhil değildir.",
          "Abonelik, seçtiğiniz dönemin (aylık veya yıllık) sonunda, iptal edilmedikçe aynı süreyle ve yenileme anındaki güncel fiyattan otomatik olarak yenilenir. Yenilemeyi durdurmak için dönem bitmeden aboneliğinizi iptal etmeniz yeterlidir.",
          "Kullanıcı başına fiyatlanan paketlerde dönem içinde kullanıcı eklerseniz, eklenen kullanıcılar için kalan döneme orantılı ücret tahakkuk eder. Dönem içinde kullanıcı çıkarmak, ödenmiş ücretin iadesini gerektirmez; azalma bir sonraki yenilemede geçerli olur.",
          "Ödemeler lisanslı bir ödeme kuruluşu üzerinden alınır; kart bilgileri bizim sunucularımızda saklanmaz. Fatura, verdiğiniz fatura bilgilerine göre düzenlenir; bilgilerin doğruluğundan siz sorumlusunuz.",
          "Fiyatları değiştirebiliriz. Değişiklik, yürürlüğe girmesinden en az 30 gün önce duyurulur ve mevcut ödenmiş dönemi etkilemez; yeni fiyat bir sonraki yenilemede uygulanır. Kabul etmiyorsanız yenilemeden önce iptal edebilirsiniz.",
          "Ödemenin alınamaması hâlinde sizi bilgilendirir ve makul bir süre veririz. Ödeme yapılmazsa Hizmet askıya alınabilir; askı süresince İçeriğiniz silinmez.",
          "İade koşulları İptal ve İade Koşulları metninde düzenlenir. Tüketicilerin mesafeli sözleşmelerden doğan cayma hakkı saklıdır; dijital içerik ve anında ifa edilen hizmetlerde mevzuattaki istisnalar uygulanır.",
        ],
      },
      {
        h: "13. Hizmetin sürekliliği, bakım ve değişiklikler",
        p: [
          "Hizmet'i kesintisiz ve güvenli sunmak için makul çabayı gösteririz; ancak ücretsiz ve standart paketlerde belirli bir çalışma süresi (uptime) taahhüdü verilmez. Kurumsal pakette hizmet seviyesi ayrı bir sözleşmeyle belirlenir.",
          "Planlı bakımları, mümkün olduğunca kullanımın düşük olduğu saatlerde yapar ve önceden duyururuz. Acil güvenlik müdahalelerinde önceden bildirim yapılamayabilir.",
          "Hizmet'i geliştirmek için özellikleri değiştirebilir, ekleyebilir veya kaldırabiliriz. Kullanımınızı önemli ölçüde olumsuz etkileyecek bir değişikliği yürürlüğe girmeden makul süre önce bildiririz.",
          "Barındırma, bildirim, e-posta ve yapay zekâ gibi alanlarda çalıştığımız tedarikçileri değiştirebiliriz; bu değişiklikler Gizlilik Politikası'ndaki taahhütlere uygun olarak yapılır.",
        ],
      },
      {
        h: "14. Askıya alma ve fesih",
        p: [
          "Aboneliğinizi dilediğiniz zaman iptal edebilirsiniz. İptal, bir sonraki yenilemeyi durdurur; ödemesi yapılmış dönem sonuna kadar Hizmet'i kullanmaya devam edersiniz.",
          "Hesabınızın tamamen silinmesini talep edebilirsiniz. Silme talebi, organizasyona ait İçeriği kapsamaz; onun için ilgili organizasyon yöneticisine başvurulmalıdır.",
          "Şu hâllerde erişiminizi askıya alabilir veya Sözleşme'yi feshedebiliriz: bu Sözleşme'nin veya kabul edilebilir kullanım kurallarının ihlali, ödemenin yapılmaması, Hizmet'in veya diğer kullanıcıların güvenliğini tehdit eden davranış, hukuka aykırı kullanım ya da yetkili makam kararı.",
          "Ağır olmayan ihlallerde önce bildirimde bulunur ve makul bir düzeltme süresi veririz. Güvenlik, hukuka aykırılık ve acil hâllerde askıya alma derhâl uygulanabilir.",
          "Fesihten sonra Hizmet'e erişiminiz sona erer. Verilerinizi dışa aktarmanız için fesih tarihinden itibaren 30 gün süre tanınır; bu sürenin sonunda veriler Gizlilik Politikası'ndaki saklama kurallarına göre silinir.",
          "Bu Sözleşme'nin niteliği gereği fesihten sonra da yürürlükte kalması gereken hükümleri (fikri mülkiyet, sorumluluk sınırı, tazminat, gizlilik, uygulanacak hukuk) fesihten sonra da geçerliliğini korur.",
        ],
      },
      {
        h: "15. Garantiler ve sorumluluğun kapsamı dışındakiler",
        p: [
          "Hizmet, mevzuatın izin verdiği ölçüde \"olduğu gibi\" ve \"mevcut hâliyle\" sunulur. Hizmet'in kesintisiz, hatasız veya belirli bir amaca uygun olacağına dair açık ya da zımni bir garanti verilmez.",
          "Şunlardan sorumlu değiliz: internet bağlantınızdan, cihazınızdan veya işletim sisteminizden kaynaklanan sorunlar; bağladığınız üçüncü taraf hizmetlerin kesintileri; sizin veya ekibinizin hatalı veri girişi; yetkili kullanıcılarınızın yaptığı silme işlemleri; mücbir sebep hâlleri.",
          "Tüketici mevzuatından doğan haklarınız ile kastımızdan veya ağır kusurumuzdan doğan sorumluluğumuz saklıdır; bu bölüm onları sınırlamaz.",
        ],
      },
      {
        h: "16. Sorumluluğun sınırlandırılması",
        p: [
          "Mevzuatın izin verdiği azami ölçüde, dolaylı zararlardan, kâr kaybından, iş kaybından, itibar zararından ve veri kaybına bağlı dolaylı sonuçlardan sorumlu değiliz.",
          "Her hâlükârda toplam sorumluluğumuz, talebin doğduğu tarihten önceki 12 ay içinde bize fiilen ödediğiniz tutarla sınırlıdır. Hizmet'i ücretsiz kullanıyorsanız bu tutar, mevzuatın izin verdiği ölçüde sıfırdır.",
          "Bu sınırlar; kastımız, ağır kusurumuz ve tüketici mevzuatının emredici hükümleri bakımından uygulanmaz.",
        ],
      },
      {
        h: "17. Tazminat",
        p: [
          "İçeriğinizin veya Hizmet'i kullanma biçiminizin hukuka ya da bu Sözleşme'ye aykırılığı nedeniyle üçüncü kişiler tarafından bize karşı bir talep yöneltilirse, bu talepten doğan zararı, yargılama giderlerini ve makul avukatlık ücretlerini karşılamayı kabul edersiniz.",
          "Böyle bir talep hâlinde sizi gecikmeksizin bilgilendirir, savunmada makul iş birliği yaparız.",
        ],
      },
      {
        h: "18. Kişisel veriler ve gizlilik",
        p: [
          "Kişisel verilerin işlenmesine ilişkin esaslar Gizlilik Politikası'nda düzenlenir ve bu Sözleşme'nin ayrılmaz parçasıdır.",
          "Organizasyonunuzun Hizmet'e yüklediği üçüncü kişi verileri bakımından veri sorumlusu organizasyondur; biz veri işleyen sıfatıyla ve organizasyonun talimatları doğrultusunda hareket ederiz. Talep etmeniz hâlinde ayrı bir veri işleyen sözleşmesi imzalanabilir.",
          "Hizmet'in işleyişine ilişkin öğrendiğiniz teknik ve ticari bilgileri (fiyatlandırma istisnaları, yayımlanmamış özellikler, güvenlik açıkları) gizli tutmayı kabul edersiniz.",
        ],
      },
      {
        h: "19. Mücbir sebep",
        p: [
          "Doğal afet, salgın, savaş, terör, siber saldırı, ülke çapında internet veya elektrik kesintisi, yasal düzenleme değişikliği ve tarafların kontrolü dışındaki benzer hâller mücbir sebep sayılır.",
          "Mücbir sebep süresince yükümlülükler askıya alınır; hâl 30 günden uzun sürerse taraflardan her biri Sözleşme'yi tazminatsız feshedebilir. Ödenmiş ancak kullanılmamış dönem bedeli iade edilir.",
        ],
      },
      {
        h: "20. Devir, bildirimler ve sözleşme değişiklikleri",
        p: [
          "Bu Sözleşme'den doğan haklarınızı önceden yazılı iznimiz olmadan devredemezsiniz. Biz, birleşme, devralma veya işletmenin devri hâlinde Sözleşme'yi devredebiliriz; bu durumda sizi bilgilendiririz.",
          "Bildirimler; hesabınızda kayıtlı e-posta adresine, uygulama içi duyuruya veya bu sayfada yayımlanmaya göre yapılır. E-posta adresinizin güncel tutulmasından siz sorumlusunuz.",
          "Bu Sözleşme'yi değiştirebiliriz. Önemli değişiklikler yürürlüğe girmeden en az 30 gün önce duyurulur. Değişikliğin yürürlüğe girmesinden sonra Hizmet'i kullanmaya devam etmeniz kabul anlamına gelir; kabul etmiyorsanız aboneliğinizi iptal edebilirsiniz.",
          "Bu Sözleşme'nin bir hükmünün geçersiz sayılması diğer hükümleri etkilemez; geçersiz hüküm, amacına en yakın geçerli hükümle değiştirilmiş sayılır.",
          "Bir hakkın kullanılmaması, o haktan feragat edildiği anlamına gelmez.",
        ],
      },
      {
        h: "21. Uygulanacak hukuk ve uyuşmazlıkların çözümü",
        p: [
          "Bu Sözleşme Türk hukukuna tabidir.",
          "Uyuşmazlıklarda [İL] Mahkemeleri ve İcra Daireleri yetkilidir.",
          "Tüketici sıfatını taşıyan kullanıcılar bakımından, parasal sınırlara göre Tüketici Hakem Heyetleri ile Tüketici Mahkemeleri'ne başvurma hakkı saklıdır; bu bölüm o hakkı sınırlamaz.",
          "Uyuşmazlığı yargıya taşımadan önce info@projelio.app adresinden bize yazmanızı rica ederiz; çoğu sorun bu aşamada çözülüyor.",
        ],
      },
      {
        h: "22. Yürürlük ve iletişim",
        p: [
          "Bu Sözleşme, hesabınızı oluşturduğunuz anda yürürlüğe girer ve hesabınız açık kaldığı sürece geçerlidir.",
          "Sözleşme ekleri: Gizlilik Politikası, KVKK Aydınlatma Metni, Mesafeli Satış Sözleşmesi, İptal ve İade Koşulları.",
          "İletişim: [ŞİRKET UNVANI], [ADRES] · info@projelio.app · [MERSİS / VERGİ DAİRESİ VE NUMARASI].",
          "Yürürlük tarihi: 21 Ağustos 2026.",
        ],
      },
    ],
    en: [
      {
        h: "In short",
        p: [
          "These terms set out what you and we commit to when you use Projelio. By creating an account or continuing to use the Service, you accept them.",
          "In short: the content you create is yours; the software is ours. You are responsible for the security of your account, we are responsible for running the service. You can cancel your subscription at any time and export your data.",
          "This summary is not binding; the full text below is.",
        ],
      },
      {
        h: "1. Parties and subject matter",
        p: [
          "This User Agreement (the \"Agreement\") is made between [COMPANY LEGAL NAME] ([ADDRESS]) (\"Projelio\", \"we\") and the individual or legal entity using the Service (\"User\", \"you\").",
          "Its subject matter is the terms on which you may use Projelio's cloud software service — the jobs, projects, tasks, teams, modules, budget and AI assistant features (the \"Service\").",
          "By creating an account, accepting an invitation or continuing to use the Service, you accept this Agreement and the Privacy Policy, which forms an integral part of it. If you do not accept them, you must not use the Service.",
          "For consumers purchasing a paid plan, the Distance Sales Agreement and the Cancellation and Refund Policy also apply. Where those documents conflict with this one, the specific document governs its own subject matter.",
        ],
      },
      {
        h: "2. Definitions",
        p: [
          "Service: the web and mobile applications served from the projelio.app domain and its subdomains, the Lio assistant, the integrations and the support channels.",
          "Organisation: the corporate structure created inside the Service, under which departments, jobs, projects and modules are grouped.",
          "Administrator: a user who can manage others' access as organisation owner, job owner or department manager.",
          "Content: any data, text, file, image or record you upload to or create within the Service.",
          "Subscription: the right to use the Service for a given period within the plan you have chosen.",
          "Credit: the unit that measures and is purchased for use of Lio's AI features.",
        ],
      },
      {
        h: "3. Registration and eligibility",
        p: [
          "The Service is business software and may only be used by people aged 18 or over. If you open an account on behalf of a legal entity, you represent that you are authorised to bind that entity.",
          "You are responsible for the information you provide at registration being accurate, current and complete. You cannot sign in until your email address is verified.",
          "You are responsible for keeping your password and session confidential. All activity carried out through your account is deemed to be yours unless you prove otherwise.",
          "If you believe your account has been accessed without authorisation, change your password without delay and tell us at info@projelio.app.",
          "An account belongs to one person and may not be shared. Every member of your team must sign in with their own account.",
        ],
      },
      {
        h: "4. Organisations and administrator authority",
        p: [
          "When you join an organisation with your work email address, or are added by an administrator, your use within that organisation is also subject to the organisation's own rules.",
          "Administrators may add you to a job, project, department or module team, change your permissions, end your access, and view, edit or delete content within the scope of their permissions. This is an inherent part of the Service.",
          "Invitations to a job or project require acceptance. A pending or rejected invitation grants no access rights.",
          "Content created on behalf of an organisation belongs to that organisation. Closing your account does not remove content that remains with the organisation.",
          "On paid plans, the organisation owner is responsible for the organisation's subscription and fees.",
        ],
      },
      {
        h: "5. Acceptable use",
        p: [
          "You may use the Service only in a manner that complies with the law, with good faith and with this Agreement.",
          "The following are prohibited: uploading unlawful, defamatory, discriminatory or threatening content, or content that infringes the rights of others; processing another person's personal data unlawfully; hosting malware, viruses or malicious code; sending unsolicited advertising or bulk messages (spam).",
          "The following are also prohibited: reverse engineering the Service, attempting to obtain its source code, copying it or using it to build a comparable product; attempting to circumvent security measures; accessing another user's account without permission; exceeding plan limits by technical means.",
          "Automated access (bots, scrapers, load testing) and any use that places a disproportionate load on our infrastructure are prohibited without our prior written permission. If you wish to run a security test, write to us first.",
          "Reselling, renting or operating the Service as a service bureau for your own customers is possible only under a separate written agreement.",
          "Where we detect a breach we may remove content, restrict access or suspend the account (see section 14).",
        ],
      },
      {
        h: "6. Your content",
        p: [
          "Your Content belongs to you (or to the relevant organisation). This Agreement transfers none of your intellectual property to us.",
          "So that we can provide the Service, you grant us a limited, worldwide, royalty-free and non-transferable right to host, back up, process and display your Content to your teammates, and to send it to third-party services you have connected at your request. This right is used only to operate the Service.",
          "You represent that you have the right to upload, process and share your Content, and that where you upload third parties' personal data you have provided the required notice and have a lawful basis.",
          "You are responsible for the accuracy and lawfulness of your Content, and for keeping your own copies of records you are legally required to retain. Although we take regular backups, we recommend you keep an exported copy of critical data.",
          "We reserve the right to remove content that is manifestly unlawful or that a competent authority has notified to us.",
        ],
      },
      {
        h: "7. Our intellectual property",
        p: [
          "All intellectual and industrial property rights in the Service — its software, source code, interface design, database schema and documentation, and the \"Projelio\" and \"Lio\" names and logos — belong to Projelio.",
          "What you receive is the right to use the Service during your Subscription, within your chosen plan, on a non-transferable and non-exclusive basis. No other rights are transferred.",
          "You may not use our brand, logos or visuals without our prior written permission, nor reproduce any part of the Service or create derivative works from it.",
        ],
      },
      {
        h: "8. Feedback",
        p: [
          "We may use the suggestions, ideas and feedback you send us without any obligation to you, without payment and without time limit, including by building them into the product.",
          "This does not affect your rights in your Content; it covers only suggestions about developing the product.",
        ],
      },
      {
        h: "9. Lio and AI features",
        p: [
          "Lio is the AI assistant embedded in the Service. Lio works only with data you are permitted to see and change.",
          "AI output is probabilistic and can be wrong. No warranty is given as to its accuracy, completeness or fitness for a particular purpose. You should not base financial, legal, tax or operational decisions on Lio's answer alone; verification is your responsibility.",
          "Using Lio consumes Credits. The credits each request consumes are calculated from the amount of text processed and produced, and are shown in your account. Credits included in your plan do not carry over at the end of the period; purchased credits carry over unless stated otherwise.",
          "Automated or bad-faith use aimed at consuming credits, manipulation of the credit balance, and using Lio to get around the acceptable use rules are prohibited.",
          "We may change the supplier providing the AI infrastructure and update the model version. Such changes may affect the form and quality of output.",
        ],
      },
      {
        h: "10. Third-party services and integrations",
        p: [
          "You may choose to connect services such as Google Drive, Microsoft OneDrive and Outlook, Instagram and WhatsApp. You set up these connections and can remove them at any time.",
          "These services are outside our control and are subject to their own terms and privacy policies. We are not responsible for their use, their outages or changes to their terms.",
          "If a third-party service stops providing access, starts charging or changes its interface, we may remove or change the relevant integration on notice.",
        ],
      },
      {
        h: "11. Free plan, trials and beta features",
        p: [
          "The free Starter plan may be used indefinitely within its published limits. No service level is promised for free use.",
          "During any trial period offered for paid plans we ask for no card details and charge nothing automatically. If you do not choose a plan when the trial ends, your account drops to the free plan; Content beyond the plan's limits is not deleted but may become read-only.",
          "Features marked \"beta\", \"preview\" or \"experimental\" may be incomplete or unstable and may be changed or withdrawn at any time. They are provided \"as is\" and fall outside any service level commitment.",
        ],
      },
      {
        h: "12. Plans, fees and billing",
        p: [
          "Current plans, per-user prices and credit packages are published on the pricing page at projelio.app. Unless stated otherwise, prices exclude VAT.",
          "Unless cancelled, your Subscription renews automatically at the end of the chosen period (monthly or annual) for the same period, at the price current at renewal. To stop renewal, cancel your subscription before the period ends.",
          "On per-user plans, adding users mid-period is charged pro rata for the remainder of the period. Removing users mid-period does not entitle you to a refund of fees already paid; the reduction applies at the next renewal.",
          "Payments are taken through a licensed payment provider; card details are not stored on our servers. Invoices are issued using the billing details you provide, and you are responsible for their accuracy.",
          "We may change prices. Any change is announced at least 30 days before it takes effect and does not affect the period already paid for; the new price applies at the next renewal. If you do not accept it, you may cancel before renewal.",
          "If a payment cannot be taken we will tell you and allow a reasonable period. If payment is not made, the Service may be suspended; your Content is not deleted during suspension.",
          "Refunds are governed by the Cancellation and Refund Policy. Consumers' statutory right of withdrawal for distance contracts is reserved; the exceptions in the legislation apply to digital content and services performed immediately.",
        ],
      },
      {
        h: "13. Continuity, maintenance and changes to the Service",
        p: [
          "We use reasonable efforts to provide the Service securely and without interruption, but no specific uptime is promised on the free and standard plans. On the enterprise plan the service level is set out in a separate agreement.",
          "We carry out planned maintenance at low-usage hours wherever possible and announce it in advance. Emergency security work may not be announced beforehand.",
          "We may change, add or remove features to improve the Service. We will give reasonable notice before a change that would materially and adversely affect your use takes effect.",
          "We may change the suppliers we work with for hosting, notifications, email and AI; such changes are made consistently with the commitments in the Privacy Policy.",
        ],
      },
      {
        h: "14. Suspension and termination",
        p: [
          "You may cancel your Subscription at any time. Cancellation stops the next renewal; you keep using the Service until the end of the period you have paid for.",
          "You may ask for your account to be deleted entirely. A deletion request does not cover content owned by an organisation; for that you must approach the relevant organisation administrator.",
          "We may suspend your access or terminate this Agreement where: this Agreement or the acceptable use rules are breached, payment is not made, your conduct threatens the security of the Service or of other users, use is unlawful, or a competent authority so decides.",
          "For breaches that are not serious we will notify you first and allow a reasonable period to put things right. Suspension may be immediate in security, unlawfulness and emergency cases.",
          "After termination your access to the Service ends. You are given 30 days from the termination date to export your data; at the end of that period data is deleted in line with the retention rules in the Privacy Policy.",
          "Provisions that by their nature must survive termination — intellectual property, limitation of liability, indemnity, confidentiality and governing law — remain in force afterwards.",
        ],
      },
      {
        h: "15. Warranties and what falls outside our responsibility",
        p: [
          "To the extent permitted by law, the Service is provided \"as is\" and \"as available\". No express or implied warranty is given that it will be uninterrupted, error-free or fit for a particular purpose.",
          "We are not responsible for: problems caused by your internet connection, device or operating system; outages of third-party services you have connected; incorrect data entered by you or your team; deletions performed by your authorised users; events of force majeure.",
          "Your rights under consumer legislation, and our liability for our wilful misconduct or gross negligence, are reserved; this section does not limit them.",
        ],
      },
      {
        h: "16. Limitation of liability",
        p: [
          "To the maximum extent permitted by law, we are not liable for indirect damages, loss of profit, loss of business, reputational harm or indirect consequences of data loss.",
          "In any event our total liability is limited to the amounts you actually paid us in the 12 months before the claim arose. If you use the Service free of charge, that amount is zero to the extent permitted by law.",
          "These limits do not apply to our wilful misconduct or gross negligence, or to mandatory provisions of consumer legislation.",
        ],
      },
      {
        h: "17. Indemnity",
        p: [
          "If a third party brings a claim against us because your Content or your use of the Service breaches the law or this Agreement, you agree to cover the resulting loss, litigation costs and reasonable legal fees.",
          "In such a case we will notify you without delay and cooperate reasonably in the defence.",
        ],
      },
      {
        h: "18. Personal data and confidentiality",
        p: [
          "The rules on processing personal data are set out in the Privacy Policy, which forms an integral part of this Agreement.",
          "For third-party data your organisation uploads to the Service, the organisation is the data controller; we act as processor on its instructions. A separate data processing agreement can be signed on request.",
          "You agree to keep confidential the technical and commercial information you learn about how the Service works — pricing exceptions, unreleased features, security vulnerabilities.",
        ],
      },
      {
        h: "19. Force majeure",
        p: [
          "Natural disaster, epidemic, war, terrorism, cyber attack, nationwide internet or power outage, changes in legislation and similar events beyond the parties' control count as force majeure.",
          "Obligations are suspended while force majeure lasts; if it continues for more than 30 days either party may terminate the Agreement without compensation. Fees paid for an unused period are refunded.",
        ],
      },
      {
        h: "20. Assignment, notices and changes to the Agreement",
        p: [
          "You may not assign your rights under this Agreement without our prior written consent. We may assign the Agreement in a merger, acquisition or transfer of business, and will inform you if we do.",
          "Notices are given to the email address registered on your account, by in-app announcement, or by publication on this page. You are responsible for keeping your email address up to date.",
          "We may change this Agreement. Significant changes are announced at least 30 days before they take effect. Continuing to use the Service after a change takes effect means you accept it; if you do not, you may cancel your subscription.",
          "If a provision of this Agreement is held invalid, the remaining provisions are unaffected and the invalid provision is deemed replaced by the valid provision closest to its purpose.",
          "Failure to exercise a right does not amount to a waiver of it.",
        ],
      },
      {
        h: "21. Governing law and dispute resolution",
        p: [
          "This Agreement is governed by Turkish law.",
          "The Courts and Enforcement Offices of [CITY] have jurisdiction over disputes.",
          "For users who are consumers, the right to apply to the Consumer Arbitration Committees and Consumer Courts according to the applicable monetary thresholds is reserved; this section does not limit that right.",
          "Before taking a dispute to court, please write to us at info@projelio.app — most issues are resolved at that stage.",
        ],
      },
      {
        h: "22. Effect and contact",
        p: [
          "This Agreement takes effect when you create your account and applies for as long as your account remains open.",
          "Annexes: the Privacy Policy, the KVKK Privacy Notice, the Distance Sales Agreement and the Cancellation and Refund Policy.",
          "Contact: [COMPANY LEGAL NAME], [ADDRESS] · info@projelio.app · [TRADE REGISTRY / TAX OFFICE AND NUMBER].",
          "Effective date: 21 August 2026.",
        ],
      },
    ],
  },
};
