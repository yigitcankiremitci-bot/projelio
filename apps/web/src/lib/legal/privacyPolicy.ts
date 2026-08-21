/**
 * Gizlilik politikasının tam metni — Türkçe ve İngilizce.
 *
 * Aynı metin tanıtım sitesinde de yayımlanıyor (../projelio-site,
 * src/i18n/legal.ts). Birini değiştirirsen diğerini de güncelle; iki yerde
 * farklı yasal metin yayımlamak hukuki risktir.
 *
 * Köşeli parantezli alanlar ([ŞİRKET UNVANI] gibi) yayına almadan önce
 * doldurulmalı ve metin bir hukuk danışmanınca gözden geçirilmelidir.
 */
import type { LegalDoc } from "./legalDoc";

export const privacyDoc: LegalDoc = {
  path: "/privacy",
  text: {
    tr: {
      title: "Gizlilik Politikası",
      lede: "Hangi veriyi neden topladığımızı, kimlerle paylaştığımızı ve haklarınızı nasıl kullanacağınızı anlatır.",
      effective: "21 Ağustos 2026",
    },
    en: {
      title: "Privacy Policy",
      lede: "What data we collect and why, who we share it with, and how you can exercise your rights.",
      effective: "21 August 2026",
    },
  },
  sections: {
    tr: [
      {
        h: "Kısaca",
        p: [
          "Projelio bir ekip ve iş yönetimi hizmetidir. Bu politika, Projelio'yu kullandığınızda hangi bilgileri topladığımızı, bunları neden işlediğimizi, kimlerle paylaştığımızı ve haklarınızı nasıl kullanabileceğinizi anlatır.",
          "Özetle: verilerinizi reklam amacıyla kullanmıyor, üçüncü taraflara satmıyor ve içeriğinizi yapay zekâ modellerinin eğitiminde kullandırmıyoruz. Hizmeti sunmak için gereken tedarikçiler dışında verileriniz dışarı çıkmaz.",
          "Bu özet politikanın yerine geçmez; bağlayıcı olan aşağıdaki tam metindir.",
        ],
      },
      {
        h: "1. Bu politika neyi kapsar",
        p: [
          "Bu politika; projelio.app web sitesi, Projelio web ve mobil uygulamaları, Lio asistanı, WhatsApp entegrasyonu, destek kanallarımız ve bunlara bağlı tüm hizmetler (birlikte \"Hizmet\") için geçerlidir.",
          "İki farklı rolümüz var ve bu ayrım önemlidir. Hesabınızı oluşturduğunuzda, siteyi ziyaret ettiğinizde, bizimle iletişime geçtiğinizde veya faturalandırma yaptığımızda bu verilerin veri sorumlusu (GDPR anlamında \"controller\") biziz.",
          "Buna karşılık organizasyonunuzun Hizmet içinde ürettiği içeriğin — projeler, görevler, modül kayıtları, dosyalar, yorumlar, cari ve finans kayıtları — sahibi organizasyondur. Bu içeriği organizasyon adına ve talimatı doğrultusunda işleriz; burada veri işleyen (\"processor\") sıfatıyla hareket ederiz. Organizasyonunuzun kendi gizlilik uygulamaları için yöneticinize başvurmanız gerekir; içerikle ilgili bir talebinizi ilgili organizasyona yönlendirebiliriz.",
          "Bu politikayı kabul etmiyorsanız Hizmet'i kullanmamanızı rica ederiz.",
        ],
      },
      {
        h: "2. Sizin doğrudan verdiğiniz bilgiler",
        p: [
          "Hesap ve profil bilgileri: ad soyad, e-posta adresi, parolanızın geri döndürülemez şekilde şifrelenmiş özeti (bcrypt), profil fotoğrafı, unvan, telefon numarası, çalıştığınız organizasyon ve departman, rolünüz ve arayüz tercihleriniz (tema, yazı boyutu, bildirim ayarları).",
          "Google veya Microsoft ile giriş yapmayı seçerseniz, bu sağlayıcıdan yalnızca adınızı, e-posta adresinizi ve profil görselinizi alırız; parolanızı asla görmeyiz.",
          "İçerik bilgileri: işler, projeler, görevler ve alt görevler, program ve rutinler, takvim kayıtları, departman ve modül kayıtları (ör. cari, ürün, fatura, bordro, stok kayıtları), bütçe ve finans hareketleri, çıktılar, yorumlar, akış paylaşımları, yüklediğiniz dosya ve görseller, kapak görselleri ve kişisel yapılacak listeniz.",
          "İletişim ve destek bilgileri: bize gönderdiğiniz e-postalar, destek talepleri, hata bildirimleri, ekran görüntüleri, anket ve geri bildirim yanıtları.",
          "Lio'ya yazdıklarınız: asistana gönderdiğiniz mesajların içeriği ve asistanın verdiği yanıtlar.",
          "Faturalandırma bilgileri: fatura unvanı, adres, vergi dairesi ve vergi numarası ile satın alma kayıtlarınız. Kart bilgileri sunucularımızda tutulmaz; ödeme, lisanslı bir ödeme kuruluşu tarafından kendi altyapısında işlenir.",
        ],
      },
      {
        h: "3. Otomatik olarak toplanan bilgiler",
        p: [
          "Kullanım bilgileri: hangi ekranları açtığınız, oluşturduğunuz ve güncellediğiniz kayıt sayıları, modül kullanım istatistikleri, arama ve filtreleme davranışı, tur (onboarding) adımlarını tamamlama durumu, Lio ile yaptığınız istek sayısı ve harcanan kredi miktarı.",
          "Cihaz ve bağlantı bilgileri: IP adresi, tarayıcı ve işletim sistemi türü, cihaz tipi, ekran boyutu, dil ve saat dilimi tercihi, yönlendiren adres, uygulama sürümü ve hata/çökme kayıtları.",
          "Güvenlik ve oturum bilgileri: giriş denemeleri ve zamanları, oturum belirteçlerinin (JWT) geçerlilik bilgisi, e-posta doğrulama ve parola sıfırlama işlemleri, şüpheli erişim tespitine yarayan kayıtlar.",
          "Yerel depolama ve çerezler: oturumunuzu açık tutmak, tercihlerinizi hatırlamak ve temel işlevleri çalıştırmak için tarayıcınızın yerel depolamasını ve zorunlu çerezleri kullanırız. Ayrıntı için \"Çerezler ve yerel depolama\" bölümüne bakın.",
          "Bildirim bilgileri: anlık bildirimleri açarsanız, cihazınızın bildirim aboneliği (push endpoint / cihaz belirteci) saklanır.",
        ],
      },
      {
        h: "4. Başka kaynaklardan gelen bilgiler",
        p: [
          "Diğer kullanıcılar: sizi bir işe, projeye, departmana veya modül ekibine davet eden kişi e-posta adresinizi ve adınızı bize vermiş olabilir. Bu durumda size davetin kim tarafından ve hangi iş için gönderildiğini belirten bir bildirim iletiriz.",
          "Organizasyon yöneticileri: hesabınız bir organizasyona bağlıysa yöneticiniz kadro, departman, unvan ve yetki bilgilerinizi ekleyebilir veya güncelleyebilir.",
          "Bağladığınız üçüncü taraf hizmetler: Google Drive, Microsoft OneDrive veya Outlook posta kutusu, Instagram gibi hizmetleri kendi isteğinizle bağlarsanız, verdiğiniz izin kapsamında bu hizmetlerden dosya listesi, klasör bilgisi, posta başlıkları veya yayın hesabı bilgileri gibi veriler alırız.",
          "WhatsApp entegrasyonu: bağlantıyı siz kurarsanız telefon numaranız, bize gönderdiğiniz mesajların içeriği ve zaman damgaları işlenir.",
        ],
      },
      {
        h: "5. Bilgileri neden ve hangi hukuki sebeple işliyoruz",
        p: [
          "Hizmeti sunmak ve hesabınızı yönetmek: kaydınızı oluşturmak, kimliğinizi doğrulamak, yetkilerinizi belirlemek, içeriğinizi saklamak ve ekip arkadaşlarınızla paylaşmak. Hukuki sebep: sözleşmenin kurulması ve ifası (KVKK m.5/2-c; GDPR m.6/1-b).",
          "Hizmeti işletmek, sürdürmek ve geliştirmek: hataları ayıklamak, performansı ölçmek, hangi özelliklerin kullanıldığını anlamak, yeni özellikler tasarlamak. Bu amaçla mümkün olan her yerde toplulaştırılmış ve kimliksizleştirilmiş veri kullanırız. Hukuki sebep: meşru menfaat (KVKK m.5/2-f; GDPR m.6/1-f).",
          "İşlemsel iletişim kurmak: e-posta doğrulama, parola sıfırlama, davet, görev atama, yorum ve son tarih bildirimleri, hizmetle ilgili duyurular. Bu iletiler hizmetin bir parçasıdır; pazarlama iletilerinden ayrıdır ve tamamen kapatılamaz (ancak bildirim türlerini ayarlardan yönetebilirsiniz). Hukuki sebep: sözleşmenin ifası ve meşru menfaat.",
          "Destek sağlamak: sorununuzu anlamak, teşhis etmek ve çözmek; gerektiğinde hesabınıza ilişkin teknik kayıtları incelemek. Hukuki sebep: sözleşmenin ifası ve meşru menfaat.",
          "Güvenliği sağlamak: yetkisiz erişimi, kötüye kullanımı, dolandırıcılığı ve spam'i tespit edip önlemek; kural ihlallerini incelemek; yedek almak. Hukuki sebep: meşru menfaat ve veri güvenliğine ilişkin hukuki yükümlülük (KVKK m.12; GDPR m.32).",
          "Yasal yükümlülükleri yerine getirmek: fatura ve muhasebe kayıtlarını tutmak, yetkili makamların usulüne uygun taleplerini karşılamak, hukuki taleplerin tesisi ve korunması. Hukuki sebep: hukuki yükümlülük ve hakkın tesisi (KVKK m.5/2-a, ç, e; GDPR m.6/1-c ve m.6/1-f).",
          "Pazarlama iletişimi: ürün duyuruları, yenilikler ve kampanyalar yalnızca açık rızanız varsa gönderilir ve her iletide bulunan bağlantıyla tek tıkla çıkabilirsiniz. Hukuki sebep: açık rıza (KVKK m.5/1; GDPR m.6/1-a).",
          "Referans ve müşteri hikâyeleri: adınızı, şirketinizi veya görüşünüzü ancak ayrıca izin verirseniz yayımlarız.",
        ],
      },
      {
        h: "6. Lio ve yapay zekâ özellikleri",
        p: [
          "Lio, Projelio içindeki yapay zekâ asistanıdır. Bir istek gönderdiğinizde mesajınız ve isteği yanıtlamak için gereken bağlam (ör. sorduğunuz görevin başlığı) modeli çalıştıran tedarikçimiz Anthropic, PBC'ye iletilir ve yanıt üretilir.",
          "İçeriğiniz yapay zekâ modellerinin eğitiminde kullanılmaz. Tedarikçimizle bu yönde bir veri işleme sözleşmesi bulunmaktadır.",
          "Lio, sizin panelde görme yetkiniz olmayan hiçbir veriye erişemez. Yetkilendirme kuralları arayüzde ve sohbette birebir aynı çalışır; Lio bir kaydı ancak siz de görebiliyorsanız okuyabilir, ancak siz de değiştirebiliyorsanız değiştirir.",
          "Sohbet geçmişiniz, konuşmanın devamlılığı için sınırlı bir pencerede saklanır. Kredi sistemi gereği her isteğin tükettiği belirteç (token) miktarı ve maliyeti hesabınıza kaydedilir; bu kayıtlar mesajlarınızın içeriğini barındırmaz.",
          "Yapay zekâ çıktıları hata içerebilir. Finansal, hukuki veya operasyonel kararlarınızı yalnızca Lio'nun yanıtına dayandırmamanızı öneririz.",
        ],
      },
      {
        h: "7. Bağladığınız üçüncü taraf hizmetler",
        p: [
          "Projelio, siz istediğinizde başka hizmetlere bağlanabilir. Bağlantı kurmadıkça bu hizmetlerle hiçbir veri paylaşılmaz; bağlantıyı istediğiniz an ayarlardan kaldırabilirsiniz.",
          "Google Drive ve Microsoft OneDrive: dosyalarınızı Projelio kayıtlarına iliştirmek için kullanılır. Yalnızca izin verdiğiniz kapsamdaki dosya ve klasörlere erişilir; bir işe ya da projeye erişim izni verdiğinizde ilgili klasör paylaşımı yalnızca daveti kabul etmiş üyeler için açılır.",
          "Microsoft Outlook posta kutusu: posta modülünü kullanırsanız, verdiğiniz izin kapsamında ileti başlıkları ve içerikleri arayüzde gösterilir.",
          "Instagram ve Meta hizmetleri: sosyal medya paylaşım modülünü kullanırsanız, paylaşmayı seçtiğiniz görsel/video ve metin ilgili platforma iletilir.",
          "WhatsApp: Lio'yu WhatsApp üzerinden kullanmayı seçerseniz telefon numaranız, uygulama içinde ürettiğiniz tek kullanımlık doğrulama koduyla hesabınıza bağlanır. Mesajlar Meta Platforms, Inc. altyapısı üzerinden iletilir ve bu iletim Meta'nın kendi koşullarına tabidir.",
          "Habie: Projelio'ya gömülü mesajlaşma modülüdür. Oturumunuz Projelio tarafından üretilen tek kullanımlık bir kod ile Habie'ye tanıtılır; parolanız aktarılmaz.",
          "Bu hizmetlerin kendi gizlilik politikaları geçerlidir ve uygulamalarından sorumlu değiliz. Bağlamadan önce ilgili politikayı okumanızı öneririz.",
        ],
      },
      {
        h: "8. Bilgileri kimlerle paylaşıyoruz",
        p: [
          "Organizasyonunuzdaki diğer kullanıcılarla: bir işe, projeye, departmana veya modül ekibine dahil olduğunuzda adınız, profil görseliniz, unvanınız ve o alanda ürettiğiniz içerik, aynı alana erişimi olan kişiler tarafından görülür. Görev atamaları, yorumlar ve akış paylaşımları ilgili ekibe açıktır.",
          "Yöneticilerle: iş sahibi, departman yöneticisi ve organizasyon sahibi, yetkileri kapsamındaki içeriğe ve üyelik bilgilerine erişebilir. Kurumsal e-posta adresinizle katıldığınız bir organizasyonda yöneticinizin bu erişimi hizmetin doğal bir parçasıdır.",
          "Hizmet sağlayıcılarımızla: Hizmet'i çalıştırmak için sınırlı sayıda tedarikçi kullanırız. Bunlar: barındırma ve veritabanı (Supabase Inc.), uygulama barındırma (Netlify, Inc. ve Render Services, Inc.), e-posta gönderimi (Resend, Inc.), yapay zekâ (Anthropic, PBC), anlık bildirim (Google Firebase ve tarayıcıların web push altyapısı), bağladığınız hâlde Google LLC, Microsoft Corporation ve Meta Platforms, Inc. hizmetleri. Her biri verileri yalnızca bizim adımıza, talimatımız doğrultusunda ve sözleşmeyle sınırlanmış biçimde işler.",
          "Yetkili makamlarla: yalnızca mevzuatın gerektirdiği, usulüne uygun ve yazılı bir talep olduğunda; talebin kapsamıyla sınırlı olarak. Hukuken engellenmediğimiz sürece sizi bilgilendirmeye çalışırız.",
          "Şirket işlemlerinde: birleşme, devir, bölünme veya varlık satışı hâlinde veriler alıcıya aktarılabilir. Böyle bir durumda sizi önceden bilgilendirir ve alıcının bu politikadaki taahhütlere uymasını sağlarız.",
          "Verilerinizi hiçbir koşulda reklam amacıyla üçüncü taraflara satmıyor veya kiralamıyoruz.",
        ],
      },
      {
        h: "9. Yurt dışına aktarım",
        p: [
          "Kullandığımız barındırma, e-posta, yapay zekâ ve bildirim sağlayıcılarının sunucuları Türkiye dışında bulunabilir. Bu nedenle verileriniz yurt dışına aktarılabilir.",
          "Aktarımlar, 6698 sayılı Kanun'un 9. maddesi kapsamında; standart sözleşme, taahhütname ya da mevzuatın öngördüğü diğer güvencelerden biri sağlanarak yapılır. Avrupa Ekonomik Alanı'ndan yapılan aktarımlarda Avrupa Komisyonu'nun Standart Sözleşme Hükümleri (SCC) uygulanır.",
          "Aktarımın yapıldığı ülkeler ve güvence yöntemi hakkında bilgi almak için bizimle iletişime geçebilirsiniz.",
        ],
      },
      {
        h: "10. Saklama süreleri",
        p: [
          "Hesap ve içerik verileri: hesabınız etkin olduğu sürece saklanır. Hesabınızı sildiğinizde veya organizasyonunuz hesabınızı kapattığında veriler en geç 30 gün içinde kalıcı olarak silinir; yedeklerden tamamen temizlenmesi 90 günü bulabilir.",
          "Organizasyona ait içerik: hesabınızı silseniz de organizasyonun sahibi olduğu içerik (ör. ekip arkadaşlarınıza gönderdiğiniz yorumlar, tamamladığınız görev kayıtları) organizasyonda kalmaya devam eder. Bu içeriğin silinmesi organizasyon yöneticisinin talebine bağlıdır.",
          "Lio sohbet geçmişi: konuşma penceresi dışında kalan mesajlar düzenli olarak temizlenir. Kredi ve kullanım kayıtları, faturalandırma nedeniyle daha uzun süre tutulur.",
          "WhatsApp konuşma kayıtları: en fazla 90 gün saklanır.",
          "Teknik ve güvenlik kayıtları: en fazla 12 ay saklanır; bir güvenlik incelemesi sürüyorsa inceleme bitene kadar korunur.",
          "Faturalandırma ve muhasebe kayıtları: mevzuatın öngördüğü süre boyunca (Türkiye'de kural olarak 10 yıl) saklanır.",
          "Pazarlama izni ve iletişim kayıtları: izninizi geri çekene kadar; geri çektiğinizde talebin kaydı, ispat yükümlülüğü nedeniyle saklanır.",
        ],
      },
      {
        h: "11. Güvenlik",
        p: [
          "Tüm veri aktarımı TLS ile şifrelenir. Parolalar geri döndürülemez biçimde (bcrypt) saklanır; kimse — biz dahil — parolanızı göremez. Veritabanı disk düzeyinde şifrelidir ve düzenli olarak yedeklenir.",
          "Veritabanına hiçbir istemci doğrudan bağlanamaz. Tüm veri erişimi sunucumuz üzerinden geçer; veritabanı düzeyinde satır güvenliği ve yetki geri alma olmak üzere iki bağımsız katman, dışarıdan doğrudan erişimi kalıcı olarak reddeder.",
          "Yetkilendirme en az ayrıcalık ilkesine göre işler: bir kaydı yalnızca ilgili iş, proje, departman veya modül ekibinde yer alıyorsanız görebilirsiniz. Bekleyen veya reddedilmiş bir davet hiçbir erişim vermez.",
          "Yüklenen dosyaların türü, istemcinin beyanına değil dosyanın kendi imzasına bakılarak belirlenir; yürütülebilir içeriğin görsel gibi yüklenmesi engellenir ve dosya boyutu sınırlandırılır.",
          "Hiçbir sistem tümüyle güvenli değildir. Bir veri ihlali yaşanırsa, mevzuatın öngördüğü süre içinde (KVKK kapsamında en kısa sürede ve Kurul'a 72 saat içinde, GDPR kapsamında 72 saat içinde) ilgili kişileri ve yetkili makamları bilgilendiririz.",
          "Hesabınızın güvenliği için güçlü ve size özgü bir parola kullanmanızı, parolanızı kimseyle paylaşmamanızı öneririz. Bir güvenlik açığı fark ederseniz lütfen bize bildirin.",
        ],
      },
      {
        h: "12. Çerezler ve yerel depolama",
        p: [
          "Zorunlu çerezler ve yerel depolama: oturumunuzu açık tutmak, dil ve tema tercihinizi hatırlamak, arayüz durumunuzu (açık sekme, sıralama, kapatılan uyarılar) korumak için kullanılır. Bunlar hizmetin çalışması için gereklidir ve kapatılamaz; tarayıcı ayarlarınızdan silerseniz oturumunuz kapanır.",
          "İşlevsel çerezler: tanıtım sitesinde form doldurma kolaylığı gibi ikincil işlevler için kullanılabilir.",
          "Analitik çerezler: yalnızca onayınızla çalışır ve onayınızı istediğiniz zaman geri çekebilirsiniz.",
          "Reklam ve profilleme amaçlı çerez kullanmıyoruz; verilerinizi reklam ağlarıyla paylaşmıyoruz.",
        ],
      },
      {
        h: "13. Haklarınız ve bunları nasıl kullanırsınız",
        p: [
          "6698 sayılı Kanun'un 11. maddesi uyarınca; kişisel verinizin işlenip işlenmediğini öğrenme, işlenmişse buna ilişkin bilgi talep etme, işlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme, yurt içinde veya yurt dışında verilerin aktarıldığı üçüncü kişileri bilme, eksik veya yanlış işlenmiş verilerin düzeltilmesini isteme, silinmesini veya yok edilmesini isteme, bu işlemlerin verilerin aktarıldığı üçüncü kişilere bildirilmesini isteme, münhasıran otomatik sistemlerle analiz edilmesi suretiyle aleyhinize bir sonucun ortaya çıkmasına itiraz etme ve kanuna aykırı işleme nedeniyle zarara uğramanız hâlinde zararın giderilmesini talep etme haklarına sahipsiniz.",
          "Avrupa Ekonomik Alanı veya Birleşik Krallık'ta iseniz ayrıca; verilerinize erişme ve kopyasını alma, düzeltme, silinmesini isteme, işlemenin kısıtlanmasını isteme, işlemeye itiraz etme, verilerinizi yapılandırılmış ve makine tarafından okunabilir bir biçimde alma (taşınabilirlik) ve verdiğiniz rızayı geri çekme haklarına sahipsiniz. Rızanın geri çekilmesi, geri çekme anına kadar yapılan işlemeyi etkilemez.",
          "Çoğu talebi kendiniz karşılayabilirsiniz: profil bilgilerinizi ayarlardan güncelleyebilir, bildirim tercihlerinizi değiştirebilir, bağladığınız üçüncü taraf hizmetleri kaldırabilir ve hesabınızı silme talebi oluşturabilirsiniz.",
          "Diğer taleplerinizi info@projelio.app adresine iletebilirsiniz. Kimliğinizi doğrulamak için ek bilgi isteyebiliriz. Talebinizi en geç 30 gün içinde ücretsiz olarak sonuçlandırırız; işlem ayrıca bir maliyet gerektiriyorsa Kurul'un belirlediği tarifedeki ücreti isteyebiliriz.",
          "Hesabınız bir organizasyona bağlıysa ve talebiniz organizasyonun sahibi olduğu içeriğe ilişkinse, talebinizi ilgili organizasyona yönlendirir ve sizi bilgilendiririz.",
          "Talebinizin sonucundan memnun kalmazsanız Kişisel Verileri Koruma Kurulu'na şikâyette bulunma; Avrupa Ekonomik Alanı veya Birleşik Krallık'ta iseniz bulunduğunuz ülkenin denetim makamına başvurma hakkınız saklıdır.",
        ],
      },
      {
        h: "14. Çocukların gizliliği",
        p: [
          "Projelio bir iş yazılımıdır ve 18 yaşın altındaki kişilere yönelik değildir. Bilerek çocuklardan kişisel veri toplamayız.",
          "18 yaşından küçük birinin bize veri verdiğini fark edersek bu veriyi gecikmeksizin sileriz. Böyle bir durumu fark ederseniz lütfen bize bildirin.",
        ],
      },
      {
        h: "15. Bu politikadaki değişiklikler",
        p: [
          "Bu politikayı zaman zaman güncelleyebiliriz. Güncel metin her zaman bu sayfada, yürürlük tarihiyle birlikte yayımlanır.",
          "Önemli değişikliklerde, değişiklik yürürlüğe girmeden önce e-posta ile veya uygulama içinde belirgin bir bildirimle sizi bilgilendiririz.",
          "Değişiklikleri kabul etmiyorsanız Hizmet'i kullanmayı bırakabilir ve hesabınızın silinmesini talep edebilirsiniz.",
        ],
      },
      {
        h: "16. Bize ulaşın",
        p: [
          "Veri sorumlusu: [ŞİRKET UNVANI], [ADRES], [VERBİS KAYIT NUMARASI].",
          "Gizlilikle ilgili tüm sorularınız, talepleriniz ve şikâyetleriniz için: info@projelio.app",
          "Avrupa Ekonomik Alanı ve Birleşik Krallık'taki ilgili kişiler için temsilcimiz: [AB/BK TEMSİLCİSİ — İSİM VE ADRES].",
          "Yürürlük tarihi: 21 Ağustos 2026.",
        ],
      },
    ],
    en: [
      {
        h: "In short",
        p: [
          "Projelio is a team and work management service. This policy explains what information we collect when you use Projelio, why we process it, who we share it with, and how you can exercise your rights.",
          "In short: we do not use your data for advertising, we do not sell it to third parties, and we do not allow your content to be used to train AI models. Beyond the suppliers we need to run the service, your data does not leave us.",
          "This summary does not replace the policy; the full text below is what binds us.",
        ],
      },
      {
        h: "1. What this policy covers",
        p: [
          "This policy applies to the projelio.app website, the Projelio web and mobile applications, the Lio assistant, the WhatsApp integration, our support channels and all related services (together, the \"Service\").",
          "We act in two different roles, and the distinction matters. When you create an account, visit the site, contact us or when we bill you, we are the data controller for that data.",
          "The content your organisation creates inside the Service — projects, tasks, module records, files, comments, contact and finance records — belongs to the organisation. We process that content on the organisation's behalf and on its instructions; there we act as a processor. For your organisation's own privacy practices you should contact your administrator, and we may forward a request about such content to the relevant organisation.",
          "If you do not agree with this policy, please do not use the Service.",
        ],
      },
      {
        h: "2. Information you give us directly",
        p: [
          "Account and profile information: full name, email address, an irreversible hash of your password (bcrypt), profile photo, job title, phone number, the organisation and department you work in, your role, and your interface preferences (theme, font size, notification settings).",
          "If you choose to sign in with Google or Microsoft, we receive only your name, email address and profile picture from that provider; we never see your password.",
          "Content information: jobs, projects, tasks and subtasks, programmes and routines, calendar entries, department and module records (for example contacts, products, invoices, payroll, stock records), budget and finance entries, deliverables, comments, feed posts, files and images you upload, cover images, and your personal to-do list.",
          "Communication and support information: emails you send us, support requests, bug reports, screenshots, survey and feedback responses.",
          "What you write to Lio: the content of the messages you send the assistant and the answers it returns.",
          "Billing information: billing name, address, tax office and tax number, and your purchase records. Card details are never stored on our servers; payments are handled by a licensed payment provider on its own infrastructure.",
        ],
      },
      {
        h: "3. Information collected automatically",
        p: [
          "Usage information: which screens you open, how many records you create and update, module usage statistics, search and filtering behaviour, whether you completed onboarding tour steps, how many requests you made to Lio and how many credits they consumed.",
          "Device and connection information: IP address, browser and operating system, device type, screen size, language and time zone preference, referring address, application version, and error/crash logs.",
          "Security and session information: sign-in attempts and times, validity data for session tokens (JWT), email verification and password reset events, and records that help us detect suspicious access.",
          "Local storage and cookies: we use your browser's local storage and strictly necessary cookies to keep you signed in, remember your preferences and run core functions. See \"Cookies and local storage\" for detail.",
          "Notification information: if you enable push notifications, your device's notification subscription (push endpoint or device token) is stored.",
        ],
      },
      {
        h: "4. Information from other sources",
        p: [
          "Other users: whoever invites you to a job, project, department or module team may have given us your email address and name. In that case we send you a notification stating who invited you and to which job.",
          "Organisation administrators: if your account belongs to an organisation, your administrator can add or update your staff record, department, title and permissions.",
          "Third-party services you connect: if you choose to connect services such as Google Drive, Microsoft OneDrive or an Outlook mailbox, or Instagram, we receive data within the scope of the permission you grant — file lists, folder information, message headers or publishing account details, for example.",
          "WhatsApp integration: if you set up the connection, we process your phone number, the content of the messages you send us and their timestamps.",
        ],
      },
      {
        h: "5. Why we process information, and on what legal basis",
        p: [
          "To provide the Service and manage your account: creating your record, authenticating you, determining your permissions, storing your content and sharing it with your teammates. Legal basis: performance of a contract (GDPR Art. 6(1)(b); Turkish Law no. 6698 Art. 5/2-c).",
          "To operate, maintain and improve the Service: debugging, measuring performance, understanding which features are used, designing new ones. Wherever possible we use aggregated and de-identified data for this. Legal basis: legitimate interests (GDPR Art. 6(1)(f); Law no. 6698 Art. 5/2-f).",
          "To send transactional communications: email verification, password reset, invitations, task assignments, comment and due-date notifications, and service announcements. These are part of the Service, are separate from marketing, and cannot be switched off entirely (although you can manage notification types in settings). Legal basis: performance of a contract and legitimate interests.",
          "To provide support: understanding, diagnosing and resolving your issue, including reviewing technical records relating to your account where necessary. Legal basis: performance of a contract and legitimate interests.",
          "To keep the Service secure: detecting and preventing unauthorised access, abuse, fraud and spam; investigating policy violations; taking backups. Legal basis: legitimate interests and our legal obligation to secure data (GDPR Art. 32; Law no. 6698 Art. 12).",
          "To meet legal obligations: keeping invoicing and accounting records, responding to duly made requests from competent authorities, and establishing or defending legal claims. Legal basis: legal obligation and legal claims (GDPR Art. 6(1)(c) and 6(1)(f); Law no. 6698 Art. 5/2-a, ç, e).",
          "Marketing communications: product announcements, news and campaigns are sent only with your consent, and every message carries a one-click unsubscribe link. Legal basis: consent (GDPR Art. 6(1)(a); Law no. 6698 Art. 5/1).",
          "References and customer stories: we publish your name, company or testimonial only if you separately agree.",
        ],
      },
      {
        h: "6. Lio and AI features",
        p: [
          "Lio is the AI assistant inside Projelio. When you send a request, your message and the context needed to answer it (for example the title of the task you asked about) are sent to Anthropic, PBC, the supplier that runs the model, and an answer is generated.",
          "Your content is not used to train AI models. We have a data processing agreement with our supplier to that effect.",
          "Lio cannot reach any data you are not permitted to see in the panel. Permission rules work identically in the interface and in chat: Lio can read a record only if you can, and change it only if you can.",
          "Your chat history is kept for a limited window so the conversation stays coherent. For the credit system, the tokens each request consumed and its cost are recorded against your account; those records do not contain the content of your messages.",
          "AI output can be wrong. We recommend you do not base financial, legal or operational decisions on Lio's answer alone.",
        ],
      },
      {
        h: "7. Third-party services you connect",
        p: [
          "Projelio can connect to other services when you ask it to. Until you set up a connection, no data is shared with those services, and you can remove a connection at any time in settings.",
          "Google Drive and Microsoft OneDrive: used to attach your files to Projelio records. Only the files and folders within the scope you grant are accessed; when you give access to a job or project, the related folder is shared only with members who have accepted their invitation.",
          "Microsoft Outlook mailbox: if you use the mail module, message headers and bodies are displayed in the interface within the scope you grant.",
          "Instagram and Meta services: if you use the social publishing module, the image, video and text you choose to publish are sent to that platform.",
          "WhatsApp: if you choose to use Lio over WhatsApp, your phone number is linked to your account with a single-use verification code generated inside the app. Messages travel over Meta Platforms, Inc.'s infrastructure and that transport is subject to Meta's own terms.",
          "Habie: the messaging module embedded in Projelio. Your session is presented to Habie with a single-use code generated by Projelio; your password is never passed on.",
          "These services have their own privacy policies and we are not responsible for their practices. We recommend reading the relevant policy before connecting.",
        ],
      },
      {
        h: "8. Who we share information with",
        p: [
          "With other users in your organisation: when you join a job, project, department or module team, your name, profile picture, title and the content you create there are visible to everyone with access to that area. Task assignments, comments and feed posts are open to the relevant team.",
          "With administrators: the job owner, the department manager and the organisation owner can access content and membership information within the scope of their permissions. If you joined an organisation with your work email address, this administrator access is an inherent part of the Service.",
          "With our service providers: we use a small number of suppliers to run the Service — hosting and database (Supabase Inc.), application hosting (Netlify, Inc. and Render Services, Inc.), email delivery (Resend, Inc.), AI (Anthropic, PBC), push notifications (Google Firebase and browser web push infrastructure), and, where you connect them, services from Google LLC, Microsoft Corporation and Meta Platforms, Inc. Each processes data only on our behalf, on our instructions and under contractual limits.",
          "With competent authorities: only where there is a duly made, written request required by law, and only to the extent of that request. Unless we are legally prevented, we will try to inform you.",
          "In corporate transactions: in a merger, acquisition, demerger or asset sale, data may be transferred to the acquirer. We will inform you beforehand and ensure the acquirer honours the commitments in this policy.",
          "We never sell or rent your data to third parties for advertising.",
        ],
      },
      {
        h: "9. International transfers",
        p: [
          "The hosting, email, AI and notification providers we use may operate servers outside Türkiye and outside your country. Your data may therefore be transferred internationally.",
          "Transfers are made under Article 9 of Turkish Law no. 6698 with a standard contract, an undertaking, or another safeguard the legislation provides. For transfers out of the European Economic Area we rely on the European Commission's Standard Contractual Clauses.",
          "Contact us if you would like information about the countries involved and the safeguard used.",
        ],
      },
      {
        h: "10. Retention",
        p: [
          "Account and content data: kept for as long as your account is active. When you delete your account, or your organisation closes it, the data is permanently deleted within 30 days at the latest; clearing it from backups can take up to 90 days.",
          "Organisation-owned content: even if you delete your account, content owned by the organisation (comments you sent to teammates, task records you completed) stays with the organisation. Deleting that content depends on a request from the organisation's administrator.",
          "Lio chat history: messages outside the conversation window are cleared regularly. Credit and usage records are kept longer for billing purposes.",
          "WhatsApp conversation records: kept for a maximum of 90 days.",
          "Technical and security logs: kept for a maximum of 12 months, or until a security investigation in progress is concluded.",
          "Billing and accounting records: kept for the period the law requires (as a rule 10 years in Türkiye).",
          "Marketing consent and communication records: until you withdraw your consent; when you do, a record of the request is retained so we can demonstrate compliance.",
        ],
      },
      {
        h: "11. Security",
        p: [
          "All data in transit is encrypted with TLS. Passwords are stored irreversibly (bcrypt); nobody — including us — can see your password. The database is encrypted at rest and backed up regularly.",
          "No client connects to the database directly. All data access goes through our server, and two independent layers at the database level — row level security and revoked grants — permanently deny direct outside access.",
          "Authorisation follows least privilege: you can see a record only if you belong to the relevant job, project, department or module team. A pending or rejected invitation grants no access at all.",
          "The type of an uploaded file is determined from the file's own signature rather than the client's claim, which prevents executable content being uploaded as an image, and file size is capped.",
          "No system is completely secure. If a data breach occurs, we will notify the affected individuals and the competent authorities within the period the law requires (within 72 hours under the GDPR, and to the Turkish authority within 72 hours under Law no. 6698).",
          "For your own safety, use a strong and unique password and never share it. If you notice a vulnerability, please tell us.",
        ],
      },
      {
        h: "12. Cookies and local storage",
        p: [
          "Strictly necessary cookies and local storage: used to keep you signed in, remember your language and theme, and preserve interface state (open tab, sort order, dismissed notices). These are required for the Service to work and cannot be turned off; clearing them in your browser signs you out.",
          "Functional cookies: may be used for secondary conveniences such as pre-filling forms on the marketing site.",
          "Analytics cookies: run only with your consent, and you can withdraw that consent at any time.",
          "We do not use advertising or profiling cookies and we do not share your data with ad networks.",
        ],
      },
      {
        h: "13. Your rights and how to exercise them",
        p: [
          "Under Article 11 of Turkish Law no. 6698 you have the right to: learn whether your personal data is being processed and request information about it; learn the purpose of processing and whether it is used accordingly; know the third parties in Türkiye or abroad to whom the data is transferred; request correction of incomplete or inaccurate data; request erasure or destruction; request that these actions be notified to third parties the data was transferred to; object to a result reached solely through automated analysis that works against you; and claim compensation for damage caused by unlawful processing.",
          "If you are in the European Economic Area or the United Kingdom you also have the right to: access and obtain a copy of your data, have it corrected, request erasure, request restriction of processing, object to processing, receive your data in a structured, machine-readable format (portability), and withdraw any consent you gave. Withdrawal does not affect processing carried out before it.",
          "You can handle most requests yourself: update your profile in settings, change your notification preferences, remove connected third-party services, and request deletion of your account.",
          "For anything else, write to info@projelio.app. We may ask for additional information to verify your identity. We respond within 30 days at no charge; where a request requires additional cost, we may charge the fee set by the competent authority's tariff.",
          "If your account belongs to an organisation and your request concerns content the organisation owns, we forward the request to that organisation and let you know.",
          "If you are not satisfied with the outcome, you may complain to the Turkish Personal Data Protection Authority (KVKK Kurulu), or, in the EEA or the UK, to the supervisory authority in your country.",
        ],
      },
      {
        h: "14. Children's privacy",
        p: [
          "Projelio is business software and is not directed at people under 18. We do not knowingly collect personal data from children.",
          "If we learn that someone under 18 has given us data, we delete it without delay. Please tell us if you become aware of such a case.",
        ],
      },
      {
        h: "15. Changes to this policy",
        p: [
          "We may update this policy from time to time. The current text is always published on this page together with its effective date.",
          "For significant changes we will notify you by email or with a prominent in-app notice before the change takes effect.",
          "If you do not accept the changes, you can stop using the Service and request deletion of your account.",
        ],
      },
      {
        h: "16. Contact us",
        p: [
          "Data controller: [COMPANY LEGAL NAME], [ADDRESS], [VERBIS REGISTRATION NUMBER].",
          "For any privacy question, request or complaint: info@projelio.app",
          "Our representative for individuals in the European Economic Area and the United Kingdom: [EU/UK REPRESENTATIVE — NAME AND ADDRESS].",
          "Effective date: 21 August 2026.",
        ],
      },
    ],
  },
};
