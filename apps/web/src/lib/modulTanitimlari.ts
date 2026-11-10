// dil:anahtar-dosya — metinler render anında t() ile çevriliyor.

/**
 * "Modül ekle" ekranındaki tanıtımlar (bkz. AddModuleModal).
 *
 * Katalog açıklaması tek cümle ve kullanıcı bir modülü açmadan önce içinde ne
 * olduğunu göremiyordu: açıp boş bir liste görünce kapatıyordu. Burada her
 * aktif modül (bkz. shared aktifModuller.ts) için kısa bir özet, neler
 * yapılabildiği ve kimin işine yaradığı duruyor. Tanıtımı olmayan modül
 * (pasif — yalnızca yöneticiler görür) katalog açıklamasıyla gösterilir.
 */
export interface ModulTanitimi {
  /** Kartın tek satırlık vaadi. */
  ozet: string;
  /** Kartta özetin altında duran, modülün nasıl çalıştığını anlatan paragraf. */
  detay: string;
  /** "Neler yapabilirsin" maddeleri. */
  neler: string[];
  /** Kimin işine yarar. */
  kimIcin: string;
  /** Kartın üstündeki kategori etiketi. */
  kategori: ModulKategorisi;
}

export type ModulKategorisi = "Satış ve müşteri" | "Pazarlama" | "Finans" | "Operasyon" | "Ekip ve erişim";

export const MODUL_KATEGORI_SIRASI: ModulKategorisi[] = [
  "Satış ve müşteri",
  "Pazarlama",
  "Finans",
  "Operasyon",
  "Ekip ve erişim",
];

export const MODUL_TANITIMLARI: Record<string, ModulTanitimi> = {
  crm_musteri: {
    kategori: "Satış ve müşteri",
    ozet: "Müşterilerini, siparişlerini ve tahsilatlarını tek yerde takip et.",
    detay:
      "Her müşterinin bir kartı olur: iletişim bilgileri, görüşme notları, açılan siparişler ve ödemeler aynı yerde durur. Siparişin vadesini ay ay planlarsın; ödeme geldiğinde işaretlersin, tutar kasaya gelir olarak kendiliğinden yazılır. Müşteriyi bir çalışana atarsan o kişi yalnızca kendi müşterilerini görür, sen de kimin ne kadar tahsil ettiğini raporda izlersin.",
    neler: [
      "Müşteri ve potansiyel müşteri kartları, görüşme notları",
      "Sipariş açma, ay ay vade ve tahsilat takibi",
      "Tahsilatlar kasaya otomatik gelir olarak düşer",
      "Müşteriyi bir çalışana atama ve yönetici raporu",
    ],
    kimIcin: "Satış yapan, müşterisinden ödeme bekleyen her işletme.",
  },
  baglantilar: {
    kategori: "Satış ve müşteri",
    ozet: "Müşterin olmayan dış kişileri — fuar, rakip, iş birliği — düzenli tut.",
    detay:
      "Fuarda tanıştığın biri, takip ettiğin bir rakip ya da iş birliği yapabileceğin bir firma müşteri listeni kalabalıklaştırmadan burada durur. Her kişiye önem derecesi ve sonraki temas tarihi verirsin; tarihi gelenler öne çıkar. Kişileri listelere ayırabilir, haritada il il görebilirsin.",
    neler: [
      "Kişileri önem derecesi ve listelerle grupla",
      "Bir sonraki temas tarihini belirle, unutma",
      "Kartvizit fotoğrafından Lio kişiyi kaydetsin",
    ],
    kimIcin: "Ağ kuran, fuara giden, iş birliği arayan ekipler.",
  },
  uyd_urunler: {
    kategori: "Satış ve müşteri",
    ozet: "Ürün ve hizmet kataloğunu fiyat, stok ve görselleriyle yönet.",
    detay:
      "Sattığın her ürün ya da hizmetin fiyatı, KDV'si, stoğu ve görselleri tek kartta durur. Aynı kartta ürünün hedef kitlesi ve stratejisi ile hangi müşteriye ne kadar satıldığı da görünür. Shopify mağazan ya da kendi web siten bağlıysa ürünler oradan okunur, satış olunca stok kendiliğinden düşer.",
    neler: [
      "Ürün kartı: fiyat, KDV, stok, görseller",
      "Ürünün stratejisi ve satışları aynı kartta",
      "Shopify ve web siteniz ile bağlantı",
    ],
    kimIcin: "Ürün ya da hizmet satan işletmeler.",
  },
  pd_sosyal_medya: {
    kategori: "Pazarlama",
    ozet: "Gönderilerini planla, Instagram'a otomatik yayınla, sonuçlarını izle.",
    detay:
      "Gönderilerini takvim üzerinde planlar, taslak olarak hazırlarsın. Instagram hesabını bağladığında gönderi seçtiğin saatte kendiliğinden yayınlanır. Lio videonu ya da fotoğrafını okuyup açıklama ve etiket önerir; yayından sonra hangi içeriğin normalinden iyi gittiğini görür, yeni fikirler alırsın.",
    neler: [
      "İçerik takvimi ve taslaklar",
      "Instagram'a zamanlanmış yayın",
      "Lio'dan açıklama ve etiket önerisi",
      "Gönderi metrikleri ve fikir raporu",
    ],
    kimIcin: "Sosyal medyayı düzenli kullanan markalar.",
  },
  pd_email: {
    kategori: "Pazarlama",
    ozet: "Şirket e-postanı Projelio'dan oku, yanıtla ve kampanyalarını takip et.",
    detay:
      "Outlook kutunu ya da şirketine açılan @projelio.app adresini bağladığında gelen e-postalar Projelio'nun içinde görünür. Okur, yanıtlar, gerekirse Lio'dan bir yanıt taslağı istersin. Gönderdiğin e-posta kampanyalarının kaydını da aynı modülde tutarsın.",
    neler: [
      "Outlook ya da @projelio.app kutunu bağla",
      "Lio ile yanıt taslağı hazırla",
      "E-posta kampanyalarının kaydını tut",
    ],
    kimIcin: "Müşterileriyle e-postayla yazışan ekipler.",
  },
  fm_fatura: {
    kategori: "Finans",
    ozet: "Faturalarını belgeleriyle sakla, Lio okuyup kaydı senin yerine açsın.",
    detay:
      "Gelen ve giden her faturanın kaydı belgesiyle birlikte saklanır, belgeler ay ay klasörlenir. Faturanın fotoğrafını ya da PDF'ini yüklediğinde Lio tutarı, tarihi ve karşı tarafı okuyup kaydı ve kasa satırını senin yerine açar. Bir müşteri siparişinden fatura kesebilir, ödendi durumunu tahsilattan otomatik alırsın.",
    neler: [
      "Gelen ve giden faturaların kaydı ve belgesi",
      "Belgeden Lio ile otomatik kayıt ve kasa satırı",
      "Ay ay klasörleme ve ay sonu arşivi",
      "Siparişten fatura kesme, ödendi durumu tahsilattan",
    ],
    kimIcin: "Faturasını düzenli tutmak isteyen her işletme.",
  },
  oud_tedarik: {
    kategori: "Operasyon",
    ozet: "Satın alma taleplerini ve tedarikçilerini yönet.",
    detay:
      "Ekibinden gelen satın alma taleplerini tek listede toplar, onay ve teslim durumlarını izlersin. Tedarikçi kartları müşteri defterinle ortaktır; bir firma hem müşterin hem tedarikçin olabilir, iki ayrı kayıt tutmazsın.",
    neler: [
      "Satın alma talebi aç, durumunu izle",
      "Tedarikçi kartları müşteri defteriyle ortak",
    ],
    kimIcin: "Düzenli malzeme ya da hizmet satın alan işletmeler.",
  },
  hesaplar: {
    kategori: "Ekip ve erişim",
    ozet: "Şirketin üyeliklerini ve giriş bilgilerini şifreli, güvenli sakla.",
    detay:
      "Şirketin kullandığı yazılım ve hizmet üyelikleri — hangi e-postayla açıldığı, ne kadar ödendiği, ne zaman yenileneceği — tek listede durur. Giriş bilgileri şifrelenerek saklanır ve yalnızca izin verdiğin kişiler görebilir. Abonelik bedelini kasaya bağladığında her yenilemede gider kendiliğinden yazılır.",
    neler: [
      "Kullanılan yazılım ve hizmet üyelikleri",
      "Şifreler şifrelenmiş olarak saklanır",
      "Kimin hangi hesabı görebileceğini sen seç",
      "Abonelik bedeli kasaya bağlanır",
    ],
    kimIcin: "Ortak hesapları ekiple paylaşan şirketler.",
  },
  ekip_hesaplari: {
    kategori: "Ekip ve erişim",
    ozet: "Ekibine Projelio hesabını sen aç, giriş bağlantısı e-postayla gitsin.",
    detay:
      "Çalışanın için Projelio hesabını sen açarsın: adını, e-postasını, departmanını ve kullanacağı modülleri seçersin. Kişiye tek kullanımlık bir giriş bağlantısı e-postayla gider; şifre hiçbir yere yazılmaz. Lio'ya “Ayşe'ye satış departmanında hesap aç” demen de yeter.",
    neler: [
      "Çalışana hesap aç, departmanını ve modüllerini seç",
      "Tek kullanımlık giriş bağlantısı — şifre e-postaya yazılmaz",
      "Lio'ya \"şu kişiye hesap aç\" demen yeter",
    ],
    kimIcin: "Ekibini hızla sisteme almak isteyen yöneticiler.",
  },
};
