import type { LegalSlug } from "@/lib/site";

export type LegalSection = { h: string; p: string[] };
type LegalDoc = Record<"tr" | "en", LegalSection[]>;

/**
 * TASLAK METİNLER.
 * Yayına almadan önce şirket unvanı, adres, vergi bilgileri ve iş modelinize
 * göre bir hukuk danışmanı tarafından gözden geçirilmelidir.
 * Şirket bilgileri src/lib/site.ts içindeki `company` alanından gelir.
 *
 * `privacy` ve `terms` metinleri uygulamada da yayımlanıyor:
 * ../projelio/apps/web/src/lib/legal/{privacyPolicy,termsOfService}.ts —
 * birini değiştirirsen diğerini de güncelle. İki yerde farklı yasal metin
 * yayımlamak hukuki risktir.
 */

/**
 * Her metnin kendi yürürlük tarihi. Tek bir tarih sabiti vardı; bir metin
 * güncellenince diğerlerinin tarihi de kaymış görünüyordu.
 */
export const legalUpdatedAt: Record<LegalSlug, string> = {
  privacy: "04.09.2026",
  terms: "21.08.2026",
  kvkk: "04.09.2026",
  distance: "12.08.2026",
  refund: "12.08.2026",
};

export const legalContent: Record<LegalSlug, LegalDoc> = {
  privacy: {
    tr: [
      {
        h: "Kısaca",
        p: [
          "Projelio bir ekip ve iş yönetimi hizmetidir. Bu politika, Projelio'yu kullandığınızda hangi bilgileri topladığımızı, bunları neden işlediğimizi, kimlerle paylaştığımızı ve haklarınızı nasıl kullanabileceğinizi anlatır.",
          "Özetle: verilerinizi reklam amacıyla kullanmıyor, üçüncü taraflara satmıyor ve içeriğinizi yapay zekâ modellerinin eğitiminde kullandırmıyoruz. Hizmeti sunmak için gereken tedarikçiler dışında verileriniz dışarı çıkmaz.",
          "Verilerinizin tutulduğu sunucu ve veritabanı Türkiye'dedir. Yurt dışına yalnızca sayılı ve burada tek tek yazılmış hizmetler için veri gider: yapay zekâ, e-posta gönderimi, anlık bildirim ve yazı tipleri.",
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
          "Sosyal medya hesap bilgileri: sosyal medya modülünde bir hesabın kullanıcı adı ve parolasını saklamayı seçerseniz, parola veritabanına şifrelenmiş olarak yazılır. Varsayılan kapalıdır: modülü görebilen biri parolanın varlığını görür, değerini görmez. Parolayı yalnızca kaydı giren kişi, ilgili yönetici ve yöneticinin açıkça izin verdiği kişiler görüntüleyebilir; her görüntüleme kim, ne zaman ve hangi hakla sorularının cevabıyla birlikte kaydedilir.",
          "İletişim ve destek bilgileri: bize gönderdiğiniz e-postalar, destek talepleri, hata bildirimleri, ekran görüntüleri, anket ve geri bildirim yanıtları.",
          "Lio'ya yazdıklarınız: asistana gönderdiğiniz mesajların içeriği, varsa ilettiğiniz dosya ve görseller ve asistanın verdiği yanıtlar.",
          "Faturalandırma bilgileri: fatura unvanı, adres, vergi dairesi ve vergi numarası ile satın alma kayıtlarınız. Kart bilgilerini hiç toplamıyoruz: şu anda ödemeler banka havalesi/EFT ile alınıyor, sistemde yalnızca siparişin kaydı tutuluyor. Bir ödeme kuruluşu entegrasyonu devreye girdiğinde de kart bilgileri sunucularımıza uğramayacak, doğrudan lisanslı kuruluşun altyapısında işlenecek ve bu politika güncellenecektir.",
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
          "Lio, Projelio içindeki yapay zekâ asistanıdır. Bir istek gönderdiğinizde mesajınız ve isteği yanıtlamak için gereken bağlam (ör. sorduğunuz görevin başlığı) modeli çalıştıran tedarikçimize iletilir ve yanıt üretilir. Bir dosya veya görsel iliştirirseniz onun içeriği de aynı yolla iletilir.",
          "Modeli çalıştıran tedarikçi Anthropic, PBC'dir (Amerika Birleşik Devletleri). Hizmetin kesintisiz sürmesi için yedek tedarikçi olarak MiniMax ve Z.ai (Zhipu AI) tanımlanabilir; bu iki tedarikçinin sunucuları Çin Halk Cumhuriyeti'ndedir. Yedeğe geçiş yalnızca birincil tedarikçi geçici olarak yanıt veremediğinde olur.",
          "Hangi tedarikçinin ve modelin kullanılacağına Projelio yöneticisi karar verir; kullanıcı seçemez. Yürürlükteki tedarikçi listesini ve hangi ülkelere veri gittiğini bu politikada güncel tutarız.",
          "İçeriğiniz yapay zekâ modellerinin eğitiminde kullanılmaz. Birincil tedarikçimizle bu yönde bir veri işleme sözleşmesi bulunmaktadır; bir yedek tedarikçi ancak aynı taahhüdü veren bir sözleşme kurulduktan sonra devreye alınır.",
          "Lio, sizin panelde görme yetkiniz olmayan hiçbir veriye erişemez. Yetkilendirme kuralları arayüzde ve sohbette birebir aynı çalışır; Lio bir kaydı ancak siz de görebiliyorsanız okuyabilir, ancak siz de değiştirebiliyorsanız değiştirir.",
          "Sohbet geçmişiniz, konuşmanın devamlılığı için saklanır ve son mesajından itibaren 90 gün dolduğunda mesajlarıyla birlikte kalıcı olarak silinir. Kredi sistemi gereği her isteğin tükettiği belirteç (token) miktarı ve maliyeti hesabınıza kaydedilir; bu kayıtlar mesajlarınızın içeriğini barındırmaz ve sohbet silindikten sonra da faturalandırma amacıyla kalır.",
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
          "WhatsApp: Lio'yu WhatsApp üzerinden kullanmayı seçerseniz telefon numaranız, uygulama içinde ürettiğiniz tek kullanımlık doğrulama koduyla hesabınıza bağlanır. Mesajlar Meta Platforms, Inc. altyapısı üzerinden iletilir ve bu iletim Meta'nın kendi koşullarına tabidir; köprüyü işleten sunucu bizimdir ve Türkiye'dedir.",
          "Habie: Projelio'ya gömülü mesajlaşma modülüdür. Oturumunuz Projelio tarafından üretilen tek kullanımlık bir kod ile Habie'ye tanıtılır; parolanız aktarılmaz.",
          "Bu hizmetlerin kendi gizlilik politikaları geçerlidir ve uygulamalarından sorumlu değiliz. Bağlamadan önce ilgili politikayı okumanızı öneririz.",
        ],
      },
      {
        h: "8. Modüllere girdiğiniz, başkalarına ait veriler",
        p: [
          "Projelio'da müşteri, tedarikçi, çalışan ve aday kayıtları tutulabilir: cari kartlar, faturalar, bordro ve özlük kayıtları, işe alım adayları, destek talepleri, WhatsApp'tan yazan müşteriler. Bu kişiler çoğu zaman Projelio kullanıcısı değildir ama verileri kişisel veridir.",
          "Bu verilerin veri sorumlusu organizasyonunuzdur, biz değiliz. Aydınlatma yükümlülüğünü yerine getirmek, hukuki sebebi belirlemek, gerekiyorsa açık rıza almak ve saklama sürelerine karar vermek organizasyonun sorumluluğundadır. Biz bu kayıtları yalnızca organizasyonun talimatıyla, hizmeti sunmak için işleriz.",
          "Özel nitelikli kişisel veri girmemenizi öneririz. Sağlık raporu, ceza mahkûmiyeti, sendika üyeliği, din veya biyometrik veri gibi bilgiler için Projelio'da ayrı bir koruma katmanı yoktur; bu tür bir veriyi serbest metin alanına yazmak, o alanı görebilen herkesin görmesi demektir.",
          "Kurumsal müşterilerimizle KVKK ve GDPR'ın aradığı içerikte bir veri işleme sözleşmesi (DPA) imzalarız. Talep etmeniz yeterlidir.",
        ],
      },
      {
        h: "9. Paylaşım linkleri ve hesabı olmayan kişiler",
        p: [
          "Bir projenin durumunu Projelio hesabı olmayan birine (müşteri, yatırımcı, danışman) göstermek için paylaşım linki oluşturabilirsiniz. Link salt okunurdur ve neyin görüneceği (özet, görevler, bütçe, ekip) link oluşturulurken tek tek seçilir; varsayılan olarak yalnızca özet ve görevler açıktır.",
          "Linki elinde tutan herkes seçtiğiniz içeriği görebilir. Linke bir e-posta adresi tanımlarsanız açan kişiden o adresi yazması istenir; bu bir kimlik doğrulaması değildir, kazayla yayılmayı zorlaştıran bir kapıdır. Asıl koruma linkteki gizli dizinin tahmin edilemezliğidir; bu yüzden linki yalnızca görmesini istediğiniz kişilere iletin ve gerekmediğinde kapatın.",
          "Linke tanımladığınız e-posta adresi yalnızca linki oluşturan kişiye gösterilir; genel görünümde yer almaz.",
          "Aynı şekilde, bir dosyayı Google Drive veya OneDrive üzerinden paylaştığınızda erişim kuralları o hizmetin kurallarıdır.",
        ],
      },
      {
        h: "10. Bilgileri kimlerle paylaşıyoruz",
        p: [
          "Organizasyonunuzdaki diğer kullanıcılarla: bir işe, projeye, departmana veya modül ekibine dahil olduğunuzda adınız, profil görseliniz, unvanınız ve o alanda ürettiğiniz içerik, aynı alana erişimi olan kişiler tarafından görülür. Görev atamaları, yorumlar ve akış paylaşımları ilgili ekibe açıktır.",
          "Yöneticilerle: iş sahibi, departman yöneticisi ve organizasyon sahibi, yetkileri kapsamındaki içeriğe ve üyelik bilgilerine erişebilir. Kurumsal e-posta adresinizle katıldığınız bir organizasyonda yöneticinizin bu erişimi hizmetin doğal bir parçasıdır. Yöneticiler ayrıca yapay zekâ kredisi harcamasına ilişkin toplu raporlar alabilir.",
          "Hizmet sağlayıcılarımızla: Hizmet'i çalıştırmak için sınırlı sayıda tedarikçi kullanırız. Bunlar: sunucu barındırma (Hosting Dünyam — sunucular Türkiye'de; uygulama, veritabanı ve yüklediğiniz dosyalar buradadır), tanıtım sitesi barındırma (Vercel Inc., ABD), e-posta gönderimi (Resend, Inc., ABD), yapay zekâ (Anthropic, PBC; tanımlıysa yedek olarak MiniMax ve Z.ai/Zhipu AI), anlık bildirim (tarayıcınızın üreticisinin push altyapısı — Google LLC, Mozilla, Apple veya Microsoft), yazı tipleri (Google Fonts) ve bağladığınız hâlde Google LLC, Microsoft Corporation ve Meta Platforms, Inc. hizmetleri. Her biri verileri yalnızca bizim adımıza, talimatımız doğrultusunda ve sözleşmeyle sınırlanmış biçimde işler.",
          "Yetkili makamlarla: yalnızca mevzuatın gerektirdiği, usulüne uygun ve yazılı bir talep olduğunda; talebin kapsamıyla sınırlı olarak. Hukuken engellenmediğimiz sürece sizi bilgilendirmeye çalışırız.",
          "Şirket işlemlerinde: birleşme, devir, bölünme veya varlık satışı hâlinde veriler alıcıya aktarılabilir. Böyle bir durumda sizi önceden bilgilendirir ve alıcının bu politikadaki taahhütlere uymasını sağlarız.",
          "Verilerinizi hiçbir koşulda reklam amacıyla üçüncü taraflara satmıyor veya kiralamıyoruz.",
        ],
      },
      {
        h: "11. Verileriniz nerede tutuluyor, yurt dışına ne gidiyor",
        p: [
          "Uygulama sunucusu, veritabanı ve yüklediğiniz dosyalar Türkiye'de, kiraladığımız bir sunucuda tutulur. Yedekler de Türkiye'de, erişimi yetkili kişilerle sınırlı bir ortamda saklanır.",
          "Yurt dışına yalnızca şu hâllerde veri gider: (a) Lio'ya gönderdiğiniz mesajlar ve bağlam, modeli çalıştıran tedarikçiye — Amerika Birleşik Devletleri'ne, yedek tedarikçi devredeyse Çin Halk Cumhuriyeti'ne; (b) size gönderdiğimiz e-postaların adres ve içeriği, e-posta tedarikçimize (ABD); (c) anlık bildirim başlıkları, tarayıcınızın üreticisinin push sunucusuna; (d) sayfayı açtığınızda yazı tipi dosyalarını indirmek için IP adresiniz Google Fonts'a; (e) bağladığınız üçüncü taraf hizmetlere, yalnızca verdiğiniz izin kapsamında.",
          "Aktarımlar, 6698 sayılı Kanun'un 9. maddesi kapsamında; standart sözleşme, taahhütname ya da mevzuatın öngördüğü diğer güvencelerden biri sağlanarak yapılır. Avrupa Ekonomik Alanı'ndan yapılan aktarımlarda Avrupa Komisyonu'nun Standart Sözleşme Hükümleri (SCC) uygulanır.",
          "Aktarımın yapıldığı ülkeler ve güvence yöntemi hakkında bilgi almak için bizimle iletişime geçebilirsiniz.",
        ],
      },
      {
        h: "12. Saklama süreleri",
        p: [
          "Hesap ve içerik verileri: hesabınız etkin olduğu sürece saklanır.",
          "Hesap silme: silme talebinizden sonra 30 günlük bir bekleme süresi başlar. Bu süre içinde giriş yaparsanız talep iptal olur ve hiçbir şey silinmez. Süre dolduğunda hesabınız ve kişisel verileriniz kalıcı olarak silinir; yedeklerden tamamen temizlenmesi ek olarak birkaç haftayı bulabilir. İçinde başka üye bulunmayan işleriniz ve organizasyonlarınız da silinir; içinde başkalarının emeği olanlar korunur ve oradaki katkılarınız kimliksizleştirilir.",
          "Organizasyona ait içerik: hesabınızı silseniz de organizasyonun sahibi olduğu içerik (ör. ekip arkadaşlarınıza gönderdiğiniz yorumlar, tamamladığınız görev kayıtları) organizasyonda kalmaya devam eder. Bu içeriğin silinmesi organizasyon yöneticisinin talebine bağlıdır.",
          "Lio sohbet geçmişi: son mesajından 90 gün sonra mesajlarıyla birlikte otomatik olarak silinir. Kredi ve kullanım kayıtları, faturalandırma nedeniyle daha uzun süre tutulur ve mesaj içeriği barındırmaz.",
          "WhatsApp konuşma kayıtları: en fazla 90 gün saklanır ve sonra otomatik olarak silinir. WhatsApp'tan gelen ham olay kayıtları (mesajın tam metnini içerir) işlendikten sonra en fazla 7 gün tutulur.",
          "Tek kullanımlık bağlantı ve kodlar (e-posta doğrulama, parola sıfırlama, WhatsApp bağlama): süresi dolduktan 30 gün sonra silinir.",
          "Sosyal medya parolası görüntüleme kayıtları: denetim izi olduğu için ilgili parola kaydı silinene kadar saklanır; kayıt silindiğinde bu izler de silinir.",
          "Teknik ve güvenlik kayıtları: en fazla 12 ay saklanır; bir güvenlik incelemesi sürüyorsa inceleme bitene kadar korunur.",
          "Yedekler: veritabanı yedekleri 14 gün saklanır, sonra silinir.",
          "Faturalandırma ve muhasebe kayıtları: mevzuatın öngördüğü süre boyunca (Türkiye'de kural olarak 10 yıl) saklanır.",
          "Pazarlama izni ve iletişim kayıtları: izninizi geri çekene kadar; geri çektiğinizde talebin kaydı, ispat yükümlülüğü nedeniyle saklanır.",
        ],
      },
      {
        h: "13. Güvenlik",
        p: [
          "Tüm veri aktarımı TLS ile şifrelenir. Parolalar geri döndürülemez biçimde (bcrypt) saklanır; kimse — biz dahil — parolanızı göremez. Sosyal medya modülünde sakladığınız hesap parolaları ayrı bir anahtarla şifrelenerek yazılır ve yalnızca yetkili kişiye, kaydı tutulmak üzere gösterilir.",
          "Veritabanı yalnızca sunucunun iç ağından erişilebilir; internete açık değildir. Sunucu yönetimi yalnızca özel bir ağ üzerinden ve anahtarla yapılır, parolayla erişim kapalıdır.",
          "Veritabanına hiçbir istemci doğrudan bağlanamaz. Tüm veri erişimi sunucumuz üzerinden geçer; veritabanı düzeyinde satır güvenliği ve yetki geri alma olmak üzere iki bağımsız katman, dışarıdan doğrudan erişimi kalıcı olarak reddeder.",
          "Yetkilendirme en az ayrıcalık ilkesine göre işler: bir kaydı yalnızca ilgili iş, proje, departman veya modül ekibinde yer alıyorsanız görebilirsiniz. Bekleyen veya reddedilmiş bir davet hiçbir erişim vermez.",
          "Yüklenen dosyaların türü, istemcinin beyanına değil dosyanın kendi imzasına bakılarak belirlenir; yürütülebilir içeriğin görsel gibi yüklenmesi engellenir ve dosya boyutu sınırlandırılır.",
          "Giriş denemeleri hem IP hem hesap bazında sınırlanır; art arda başarısız denemeden sonra hesap geçici olarak kilitlenir.",
          "Hiçbir sistem tümüyle güvenli değildir. Bir veri ihlali yaşanırsa, mevzuatın öngördüğü süre içinde (KVKK kapsamında en kısa sürede ve Kurul'a 72 saat içinde, GDPR kapsamında 72 saat içinde) ilgili kişileri ve yetkili makamları bilgilendiririz.",
          "Hesabınızın güvenliği için güçlü ve size özgü bir parola kullanmanızı, parolanızı kimseyle paylaşmamanızı öneririz. Bir güvenlik açığı fark ederseniz lütfen bize bildirin.",
        ],
      },
      {
        h: "14. Çerezler ve yerel depolama",
        p: [
          "Zorunlu çerezler ve yerel depolama: oturumunuzu açık tutmak, dil ve tema tercihinizi hatırlamak, arayüz durumunuzu (açık sekme, sıralama, kapatılan uyarılar) korumak için kullanılır. Bunlar hizmetin çalışması için gereklidir ve kapatılamaz; tarayıcı ayarlarınızdan silerseniz oturumunuz kapanır.",
          "Şu an analitik, reklam veya profilleme çerezi kullanmıyoruz; sitede üçüncü taraf bir ölçümleme aracı çalışmıyor. Bu değişirse, analitik çerezler yalnızca onayınızla çalışacak ve onayınızı istediğiniz zaman geri çekebileceksiniz.",
          "Sayfalarımız yazı tiplerini Google Fonts üzerinden yükler; bu sırada IP adresiniz Google'a ulaşır. Bunun dışında sayfalarımızda üçüncü taraf takip kodu bulunmaz.",
          "Verilerinizi reklam ağlarıyla paylaşmıyoruz.",
        ],
      },
      {
        h: "15. Haklarınız ve bunları nasıl kullanırsınız",
        p: [
          "6698 sayılı Kanun'un 11. maddesi uyarınca; kişisel verinizin işlenip işlenmediğini öğrenme, işlenmişse buna ilişkin bilgi talep etme, işlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme, yurt içinde veya yurt dışında verilerin aktarıldığı üçüncü kişileri bilme, eksik veya yanlış işlenmiş verilerin düzeltilmesini isteme, silinmesini veya yok edilmesini isteme, bu işlemlerin verilerin aktarıldığı üçüncü kişilere bildirilmesini isteme, münhasıran otomatik sistemlerle analiz edilmesi suretiyle aleyhinize bir sonucun ortaya çıkmasına itiraz etme ve kanuna aykırı işleme nedeniyle zarara uğramanız hâlinde zararın giderilmesini talep etme haklarına sahipsiniz.",
          "Avrupa Ekonomik Alanı veya Birleşik Krallık'ta iseniz ayrıca; verilerinize erişme ve kopyasını alma, düzeltme, silinmesini isteme, işlemenin kısıtlanmasını isteme, işlemeye itiraz etme, verilerinizi yapılandırılmış ve makine tarafından okunabilir bir biçimde alma (taşınabilirlik) ve verdiğiniz rızayı geri çekme haklarına sahipsiniz. Rızanın geri çekilmesi, geri çekme anına kadar yapılan işlemeyi etkilemez.",
          "Çoğu talebi kendiniz karşılayabilirsiniz: profil bilgilerinizi ayarlardan güncelleyebilir, bildirim tercihlerinizi değiştirebilir, bağladığınız üçüncü taraf hizmetleri kaldırabilir, verilerinizi ayarlardan bir Excel dosyası olarak dışa aktarabilir ve hesabınızı silme talebi oluşturabilirsiniz.",
          "Diğer taleplerinizi info@projelio.app adresine iletebilirsiniz. Kimliğinizi doğrulamak için ek bilgi isteyebiliriz. Talebinizi en geç 30 gün içinde ücretsiz olarak sonuçlandırırız; işlem ayrıca bir maliyet gerektiriyorsa Kurul'un belirlediği tarifedeki ücreti isteyebiliriz.",
          "Hesabınız bir organizasyona bağlıysa ve talebiniz organizasyonun sahibi olduğu içeriğe ilişkinse, talebinizi ilgili organizasyona yönlendirir ve sizi bilgilendiririz.",
          "Talebinizin sonucundan memnun kalmazsanız Kişisel Verileri Koruma Kurulu'na şikâyette bulunma; Avrupa Ekonomik Alanı veya Birleşik Krallık'ta iseniz bulunduğunuz ülkenin denetim makamına başvurma hakkınız saklıdır.",
        ],
      },
      {
        h: "16. Otomatik karar verme",
        p: [
          "Hakkınızda hukuki sonuç doğuran ya da sizi benzer biçimde önemli ölçüde etkileyen, yalnızca otomatik sistemlere dayanan bir karar almıyoruz. Profilleme yapmıyoruz.",
          "Lio'nun ürettiği metinler ve önerdiği işlemler bir karar değil, bir taslaktır; sonucu her zaman bir insan onaylar. Lio yalnızca sizin yetkiniz kadar işlem yapabilir.",
        ],
      },
      {
        h: "17. Çocukların gizliliği",
        p: [
          "Projelio bir iş yazılımıdır ve 18 yaşın altındaki kişilere yönelik değildir. Bilerek çocuklardan kişisel veri toplamayız.",
          "18 yaşından küçük birinin bize veri verdiğini fark edersek bu veriyi gecikmeksizin sileriz. Böyle bir durumu fark ederseniz lütfen bize bildirin.",
        ],
      },
      {
        h: "18. Bu politikadaki değişiklikler",
        p: [
          "Bu politikayı zaman zaman güncelleyebiliriz. Güncel metin her zaman bu sayfada, yürürlük tarihiyle birlikte yayımlanır.",
          "Önemli değişikliklerde, değişiklik yürürlüğe girmeden önce e-posta ile veya uygulama içinde belirgin bir bildirimle sizi bilgilendiririz. Yeni bir yapay zekâ tedarikçisinin devreye alınması ve verinin yeni bir ülkeye aktarılmaya başlanması önemli değişiklik sayılır.",
          "Değişiklikleri kabul etmiyorsanız Hizmet'i kullanmayı bırakabilir ve hesabınızın silinmesini talep edebilirsiniz.",
        ],
      },
      {
        h: "19. Bize ulaşın",
        p: [
          "Veri sorumlusu: [ŞİRKET UNVANI], [ADRES], [VERBİS KAYIT NUMARASI].",
          "Gizlilikle ilgili tüm sorularınız, talepleriniz ve şikâyetleriniz için: info@projelio.app",
          "Avrupa Ekonomik Alanı ve Birleşik Krallık'taki ilgili kişiler için temsilcimiz: [AB/BK TEMSİLCİSİ — İSİM VE ADRES].",
          "Yürürlük tarihi: 4 Eylül 2026.",
        ],
      },
    ],
    en: [
      {
        h: "In short",
        p: [
          "Projelio is a team and work management service. This policy explains what information we collect when you use Projelio, why we process it, who we share it with, and how you can exercise your rights.",
          "In short: we do not use your data for advertising, we do not sell it to third parties, and we do not allow your content to be used to train AI models. Beyond the suppliers we need to run the service, your data does not leave us.",
          "The server and database holding your data are in Türkiye. Data leaves the country only for a short, individually listed set of services: AI, email delivery, push notifications and web fonts.",
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
          "Social media account credentials: if you choose to store an account's username and password in the social media module, the password is written to the database encrypted. It is closed by default: someone who can see the module sees that a password exists, not its value. Only the person who entered it, the relevant administrator and people the administrator has explicitly authorised can reveal it, and every reveal is logged with who, when and under which right.",
          "Communication and support information: emails you send us, support requests, bug reports, screenshots, survey and feedback responses.",
          "What you write to Lio: the content of the messages you send the assistant, any files or images you attach, and the answers it returns.",
          "Billing information: billing name, address, tax office and tax number, and your purchase records. We do not collect card details at all: payments are currently taken by bank transfer and only the order record is kept in the system. When a payment provider is integrated, card details still will not reach our servers — they will be processed on the licensed provider's own infrastructure — and this policy will be updated.",
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
          "Lio is the AI assistant inside Projelio. When you send a request, your message and the context needed to answer it (for example the title of the task you asked about) are sent to the supplier that runs the model, and an answer is generated. If you attach a file or an image, its content travels the same way.",
          "The model is run by Anthropic, PBC (United States). To keep the service available, MiniMax and Z.ai (Zhipu AI) may be configured as fallback suppliers; the servers of these two are in the People's Republic of China. A fallback is used only when the primary supplier is temporarily unable to answer.",
          "Which supplier and which model is used is decided by the Projelio administrator, not by users. We keep the list of suppliers in use, and the countries data goes to, current in this policy.",
          "Your content is not used to train AI models. We have a data processing agreement to that effect with our primary supplier, and a fallback supplier is only enabled once an agreement with the same commitment is in place.",
          "Lio cannot reach any data you are not permitted to see in the panel. Permission rules work identically in the interface and in chat: Lio can read a record only if you can, and change it only if you can.",
          "Your chat history is kept so conversations stay coherent, and is permanently deleted together with its messages 90 days after the last message. For the credit system, the tokens each request consumed and its cost are recorded against your account; those records contain no message content and remain, for billing purposes, after the conversation is deleted.",
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
          "WhatsApp: if you choose to use Lio over WhatsApp, your phone number is linked to your account with a single-use verification code generated inside the app. Messages travel over Meta Platforms, Inc.'s infrastructure and that transport is subject to Meta's own terms; the server running the bridge is ours and is located in Türkiye.",
          "Habie: the messaging module embedded in Projelio. Your session is presented to Habie with a single-use code generated by Projelio; your password is never passed on.",
          "These services have their own privacy policies and we are not responsible for their practices. We recommend reading the relevant policy before connecting.",
        ],
      },
      {
        h: "8. Other people's data that you enter into modules",
        p: [
          "Projelio can hold records about customers, suppliers, employees and candidates: contact cards, invoices, payroll and personnel records, job applicants, support requests, customers who write in over WhatsApp. These people are usually not Projelio users, but their data is personal data.",
          "Your organisation, not us, is the controller for that data. Giving the required privacy notice, determining the legal basis, obtaining consent where necessary and deciding retention periods are the organisation's responsibility. We process these records only on the organisation's instructions, to provide the Service.",
          "We recommend that you do not enter special categories of personal data. Projelio has no separate protection layer for health reports, criminal convictions, trade union membership, religion or biometric data; putting such data in a free-text field means everyone with access to that field can see it.",
          "We sign a data processing agreement (DPA) meeting the requirements of both the Turkish law and the GDPR with our business customers. Just ask for one.",
        ],
      },
      {
        h: "9. Share links and people without an account",
        p: [
          "You can create a share link to show a project's status to someone without a Projelio account (a client, an investor, a consultant). The link is read-only and what it exposes — summary, tasks, budget, team — is chosen switch by switch when the link is created; by default only the summary and tasks are open.",
          "Anyone holding the link can see what you chose to expose. If you attach an email address to the link, whoever opens it is asked to type that address; this is not authentication, it is a gate that makes accidental spread harder. The real protection is that the secret string in the link cannot be guessed, so send it only to the people you mean to and close it when it is no longer needed.",
          "The email address you attach to a link is shown only to the person who created the link; it never appears in the public view.",
          "Likewise, when you share a file through Google Drive or OneDrive, the access rules are that service's rules.",
        ],
      },
      {
        h: "10. Who we share information with",
        p: [
          "With other users in your organisation: when you join a job, project, department or module team, your name, profile picture, title and the content you create there are visible to everyone with access to that area. Task assignments, comments and feed posts are open to the relevant team.",
          "With administrators: the job owner, the department manager and the organisation owner can access content and membership information within the scope of their permissions. If you joined an organisation with your work email address, this administrator access is an inherent part of the Service. Administrators may also receive aggregate reports on AI credit spending.",
          "With our service providers: we use a small number of suppliers to run the Service — server hosting (Hosting Dünyam, servers located in Türkiye; the application, the database and the files you upload all live there), marketing site hosting (Vercel Inc., USA), email delivery (Resend, Inc., USA), AI (Anthropic, PBC; where configured, MiniMax and Z.ai/Zhipu AI as fallbacks), push notifications (your browser vendor's push infrastructure — Google LLC, Mozilla, Apple or Microsoft), web fonts (Google Fonts), and, where you connect them, services from Google LLC, Microsoft Corporation and Meta Platforms, Inc. Each processes data only on our behalf, on our instructions and under contractual limits.",
          "With competent authorities: only where there is a duly made, written request required by law, and only to the extent of that request. Unless we are legally prevented, we will try to inform you.",
          "In corporate transactions: in a merger, acquisition, demerger or asset sale, data may be transferred to the acquirer. We will inform you beforehand and ensure the acquirer honours the commitments in this policy.",
          "We never sell or rent your data to third parties for advertising.",
        ],
      },
      {
        h: "11. Where your data is kept, and what leaves the country",
        p: [
          "The application server, the database and the files you upload are kept in Türkiye, on a server we rent. Backups are also kept in Türkiye, in an environment restricted to authorised people.",
          "Data leaves the country only in these cases: (a) the messages and context you send to Lio go to the supplier running the model — to the United States, or to the People's Republic of China if a fallback supplier is in use; (b) the address and content of emails we send you go to our email supplier (USA); (c) push notification headlines go to your browser vendor's push server; (d) your IP address reaches Google Fonts when a page downloads font files; (e) to the third-party services you connect, within the scope you granted.",
          "Transfers are made under Article 9 of Turkish Law no. 6698 with a standard contract, an undertaking, or another safeguard the legislation provides. For transfers out of the European Economic Area we rely on the European Commission's Standard Contractual Clauses.",
          "Contact us if you would like information about the countries involved and the safeguard used.",
        ],
      },
      {
        h: "12. Retention",
        p: [
          "Account and content data: kept for as long as your account is active.",
          "Account deletion: a 30-day waiting period starts when you request deletion. If you sign in during that period the request is cancelled and nothing is deleted. When the period ends your account and personal data are permanently deleted; clearing them from backups can take a few extra weeks. Jobs and organisations with no other members are deleted too; those containing other people's work are preserved and your contributions there are anonymised.",
          "Organisation-owned content: even if you delete your account, content owned by the organisation (comments you sent to teammates, task records you completed) stays with the organisation. Deleting that content depends on a request from the organisation's administrator.",
          "Lio chat history: automatically deleted, along with its messages, 90 days after the last message. Credit and usage records are kept longer for billing purposes and contain no message content.",
          "WhatsApp conversation records: kept for a maximum of 90 days and then deleted automatically. Raw event records received from WhatsApp (which contain the full message text) are kept for at most 7 days after processing.",
          "Single-use links and codes (email verification, password reset, WhatsApp linking): deleted 30 days after they expire.",
          "Social media password reveal logs: as an audit trail, kept until the password record itself is deleted; deleting the record deletes these traces too.",
          "Technical and security logs: kept for a maximum of 12 months, or until a security investigation in progress is concluded.",
          "Backups: database backups are kept for 14 days and then deleted.",
          "Billing and accounting records: kept for the period the law requires (as a rule 10 years in Türkiye).",
          "Marketing consent and communication records: until you withdraw your consent; when you do, a record of the request is retained so we can demonstrate compliance.",
        ],
      },
      {
        h: "13. Security",
        p: [
          "All data in transit is encrypted with TLS. Passwords are stored irreversibly (bcrypt); nobody — including us — can see your password. Account passwords you store in the social media module are written encrypted with a separate key and are only revealed to an authorised person, with the reveal logged.",
          "The database can only be reached from the server's internal network; it is not exposed to the internet. Server administration happens only over a private network and with keys; password access is disabled.",
          "No client connects to the database directly. All data access goes through our server, and two independent layers at the database level — row level security and revoked grants — permanently deny direct outside access.",
          "Authorisation follows least privilege: you can see a record only if you belong to the relevant job, project, department or module team. A pending or rejected invitation grants no access at all.",
          "The type of an uploaded file is determined from the file's own signature rather than the client's claim, which prevents executable content being uploaded as an image, and file size is capped.",
          "Sign-in attempts are rate limited per IP and per account; after repeated failures an account is temporarily locked.",
          "No system is completely secure. If a data breach occurs, we will notify the affected individuals and the competent authorities within the period the law requires (within 72 hours under the GDPR, and to the Turkish authority within 72 hours under Law no. 6698).",
          "For your own safety, use a strong and unique password and never share it. If you notice a vulnerability, please tell us.",
        ],
      },
      {
        h: "14. Cookies and local storage",
        p: [
          "Strictly necessary cookies and local storage: used to keep you signed in, remember your language and theme, and preserve interface state (open tab, sort order, dismissed notices). These are required for the Service to work and cannot be turned off; clearing them in your browser signs you out.",
          "We currently use no analytics, advertising or profiling cookies, and no third-party measurement tool runs on the site. Should that change, analytics cookies will run only with your consent and you will be able to withdraw it at any time.",
          "Our pages load web fonts from Google Fonts, which means your IP address reaches Google. Apart from that, our pages carry no third-party tracking code.",
          "We do not share your data with ad networks.",
        ],
      },
      {
        h: "15. Your rights and how to exercise them",
        p: [
          "Under Article 11 of Turkish Law no. 6698 you have the right to: learn whether your personal data is being processed and request information about it; learn the purpose of processing and whether it is used accordingly; know the third parties in Türkiye or abroad to whom the data is transferred; request correction of incomplete or inaccurate data; request erasure or destruction; request that these actions be notified to third parties the data was transferred to; object to a result reached solely through automated analysis that works against you; and claim compensation for damage caused by unlawful processing.",
          "If you are in the European Economic Area or the United Kingdom you also have the right to: access and obtain a copy of your data, have it corrected, request erasure, request restriction of processing, object to processing, receive your data in a structured, machine-readable format (portability), and withdraw any consent you gave. Withdrawal does not affect processing carried out before it.",
          "You can handle most requests yourself: update your profile in settings, change your notification preferences, remove connected third-party services, export your data as an Excel file from settings, and request deletion of your account.",
          "For anything else, write to info@projelio.app. We may ask for additional information to verify your identity. We respond within 30 days at no charge; where a request requires additional cost, we may charge the fee set by the competent authority's tariff.",
          "If your account belongs to an organisation and your request concerns content the organisation owns, we forward the request to that organisation and let you know.",
          "If you are not satisfied with the outcome, you may complain to the Turkish Personal Data Protection Authority (KVKK Kurulu), or, in the EEA or the UK, to the supervisory authority in your country.",
        ],
      },
      {
        h: "16. Automated decision-making",
        p: [
          "We do not make decisions based solely on automated processing that produce legal effects concerning you or similarly significantly affect you. We do not carry out profiling.",
          "The text Lio produces and the actions it proposes are drafts, not decisions; a human always confirms the outcome. Lio can only act within the permissions you already have.",
        ],
      },
      {
        h: "17. Children's privacy",
        p: [
          "Projelio is business software and is not directed at people under 18. We do not knowingly collect personal data from children.",
          "If we learn that someone under 18 has given us data, we delete it without delay. Please tell us if you become aware of such a case.",
        ],
      },
      {
        h: "18. Changes to this policy",
        p: [
          "We may update this policy from time to time. The current text is always published on this page together with its effective date.",
          "For significant changes we will notify you by email or with a prominent in-app notice before the change takes effect. Bringing a new AI supplier into use, and beginning to transfer data to a new country, count as significant changes.",
          "If you do not accept the changes, you can stop using the Service and request deletion of your account.",
        ],
      },
      {
        h: "19. Contact us",
        p: [
          "Data controller: [COMPANY LEGAL NAME], [ADDRESS], [VERBIS REGISTRATION NUMBER].",
          "For any privacy question, request or complaint: info@projelio.app",
          "Our representative for individuals in the European Economic Area and the United Kingdom: [EU/UK REPRESENTATIVE — NAME AND ADDRESS].",
          "Effective date: 4 September 2026.",
        ],
      },
    ],
  },

  terms: {
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

  kvkk: {
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

  distance: {
    tr: [
      {
        h: "1. Taraflar",
        p: [
          "SATICI: sitenin altbilgisinde unvanı, adresi, vergi dairesi ve numarası belirtilen şirket.",
          "ALICI: Projelio hizmetine abone olan veya kredi satın alan gerçek ya da tüzel kişi.",
        ],
      },
      {
        h: "2. Sözleşmenin konusu",
        p: [
          "Bu sözleşme, ALICI'nın elektronik ortamda satın aldığı dijital abonelik ve Lio kredilerinin sunulmasına ilişkin, 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği hükümleri uyarınca tarafların hak ve yükümlülüklerini düzenler.",
        ],
      },
      {
        h: "3. Hizmet ve bedel",
        p: [
          "Satın alınan paketin adı, süresi ve KDV dahil toplam bedeli sipariş özetinde ve fatura üzerinde gösterilir. Ödeme, kredi/banka kartı veya havale/EFT ile peşin olarak yapılır.",
        ],
      },
      {
        h: "4. İfa ve teslim",
        p: [
          "Hizmet dijital olarak, ödemenin onaylanmasının ardından derhal ALICI'nın hesabına tanımlanır. Fiziki teslimat söz konusu değildir.",
        ],
      },
      {
        h: "5. Cayma hakkı",
        p: [
          "Mesafeli Sözleşmeler Yönetmeliği m.15/1-ğ uyarınca, elektronik ortamda anında ifa edilen ve tüketiciye anında teslim edilen gayrimaddi mallarda cayma hakkı bulunmamaktadır.",
          "Buna rağmen SATICI, ticari politikası gereği, hiç kullanılmamış abonelik ve kredi alımları için satın alma tarihinden itibaren 14 gün içinde iade imkânı tanır. Detaylar İptal ve İade Koşulları sayfasındadır.",
        ],
      },
      {
        h: "6. Uyuşmazlıklar",
        p: [
          "ALICI, şikâyet ve itirazları için Ticaret Bakanlığı'nca ilan edilen parasal sınırlar dâhilinde ikametgâhının bulunduğu yerdeki Tüketici Hakem Heyetine veya Tüketici Mahkemesine başvurabilir.",
        ],
      },
    ],
    en: [
      {
        h: "1. Parties",
        p: [
          "SELLER: the company whose name, address and tax details appear in the site footer.",
          "BUYER: the natural or legal person subscribing to Projelio or purchasing credits.",
        ],
      },
      {
        h: "2. Subject",
        p: [
          "This agreement governs the rights and obligations of the parties regarding digital subscriptions and Lio credits purchased electronically, under Turkish Consumer Protection Law no. 6502 and the Distance Contracts Regulation.",
        ],
      },
      {
        h: "3. Service and price",
        p: [
          "The name, period and total price including VAT of the purchased plan are shown in the order summary and on the invoice. Payment is made in advance by card or bank transfer.",
        ],
      },
      {
        h: "4. Delivery",
        p: [
          "The service is digital and is activated on the BUYER's account immediately after payment approval. There is no physical delivery.",
        ],
      },
      {
        h: "5. Right of withdrawal",
        p: [
          "Under art. 15/1-ğ of the Distance Contracts Regulation, there is no right of withdrawal for intangible goods performed instantly in electronic form.",
          "Nevertheless, as a matter of commercial policy the SELLER offers a refund for entirely unused subscriptions and credits within 14 days of purchase. See the Cancellation and Refund page.",
        ],
      },
      {
        h: "6. Disputes",
        p: [
          "The BUYER may apply to the Consumer Arbitration Committee or Consumer Court at their place of residence, within the monetary limits announced by the Ministry of Trade.",
        ],
      },
    ],
  },

  refund: {
    tr: [
      {
        h: "1. Ücretsiz deneme",
        p: [
          "14 günlük deneme süresinde kart bilgisi alınmaz ve otomatik ücretlendirme yapılmaz. Süre sonunda paket seçmezseniz hesabınız ücretsiz Başlangıç paketine düşer.",
        ],
      },
      {
        h: "2. Abonelik iptali",
        p: [
          "Aboneliğinizi panelden tek tıkla iptal edebilirsiniz. İptal, bir sonraki yenilemeyi durdurur; ödemesi yapılmış dönem sonuna kadar hizmeti kullanmaya devam edersiniz.",
        ],
      },
      {
        h: "3. Abonelik iadesi",
        p: [
          "Yeni bir aboneliğin ilk 14 günü içinde, hizmeti önemli ölçüde kullanmadıysanız (ör. veri girişi ve kullanıcı davetleri sınırlıysa) tam iade talep edebilirsiniz.",
          "Yıllık aboneliklerde, ilk 14 gün geçtikten sonra kalan aylar için orantılı iade talebi değerlendirilir; kullanılan aylar tam ay olarak hesaplanır.",
        ],
      },
      {
        h: "4. Kredi iadesi",
        p: [
          "Satın alınan Lio kredilerinin hiç kullanılmamış olması şartıyla, satın alma tarihinden itibaren 14 gün içinde iade edilir. Kısmen kullanılmış paketlerde kalan kredi oranında iade değerlendirilir.",
          "Hediye (bonus) krediler iade hesabına dâhil edilmez.",
        ],
      },
      {
        h: "5. İade süreci",
        p: [
          "İade talebinizi info@projelio.app adresine, sipariş numarasıyla birlikte iletin. Talep 3 iş günü içinde değerlendirilir; onaylanan iadeler ödemenin yapıldığı yönteme, bankaya bağlı olarak 5–14 iş günü içinde yansır.",
        ],
      },
      {
        h: "6. İstisnalar",
        p: [
          "Kullanım koşullarının ihlali nedeniyle kapatılan hesaplar, kurumsal özel geliştirme bedelleri ve tamamlanmış eğitim/danışmanlık hizmetleri iade kapsamı dışındadır.",
        ],
      },
    ],
    en: [
      {
        h: "1. Free trial",
        p: [
          "No card details are taken during the 14-day trial and nothing is charged automatically. If you don't choose a plan, your account drops to the free Starter plan.",
        ],
      },
      {
        h: "2. Cancelling a subscription",
        p: [
          "You can cancel from the panel in one click. Cancellation stops the next renewal; you keep using the service until the end of the paid period.",
        ],
      },
      {
        h: "3. Subscription refunds",
        p: [
          "Within the first 14 days of a new subscription you may request a full refund if the service has not been used substantially (for example, limited data entry and user invitations).",
          "For annual subscriptions after the first 14 days, a pro-rata refund for remaining months may be considered; used months are counted as full months.",
        ],
      },
      {
        h: "4. Credit refunds",
        p: [
          "Purchased Lio credits are refunded within 14 days of purchase provided they are entirely unused. For partially used packs, a refund proportional to the remaining balance may be considered.",
          "Bonus credits are excluded from refund calculations.",
        ],
      },
      {
        h: "5. Refund process",
        p: [
          "Send your request with the order number to info@projelio.app. Requests are reviewed within 3 business days; approved refunds appear on the original payment method within 5–14 business days depending on your bank.",
        ],
      },
      {
        h: "6. Exceptions",
        p: [
          "Accounts closed for breach of the Terms, custom enterprise development fees, and completed training or consultancy services are outside the scope of refunds.",
        ],
      },
    ],
  },
};
