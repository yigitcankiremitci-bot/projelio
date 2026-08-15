/**
 * Turların içeriği (senaryo/metin).
 *
 * BURASI SADECE METİN. Yeni bir tur eklemek için buraya bir nesne eklemek
 * yeterli — kod tarafında başka hiçbir yere dokunmak gerekmez. Tek koşul:
 * `anchor` olarak verilen değer, ilgili bileşende `{...tourAnchor("...")}`
 * ile işaretlenmiş olmalı.
 *
 * Ses: her adım için public/tour-audio/tr/<turId>/<adimId>.mp3 aranır; yoksa
 * metin tarayıcının konuşma sentezi ile okunur (bkz. narrator.ts).
 */

import type { Tour } from "./types";

export const TOURS: Tour[] = [
  {
    id: "ilk-adimlar",
    title: "Projelio'ya ilk bakış",
    description: "Ekranın hangi parçası ne işe yarıyor? 2 dakikalık genel tanıtım.",
    area: "genel",
    match: /^\/$/,
    autoStart: true,
    steps: [
      {
        id: "hosgeldin",
        title: "Hoş geldin",
        text: "Projelio'yu birlikte gezelim. Anlatım hem sesli hem yazılı ilerler; istediğin an duraklatabilir, geri alabilir ya da turu kapatabilirsin.",
        speech:
          "Projelio'ya hoş geldin. Şimdi ekranı birlikte gezeceğiz. Anlatım hem sesli hem yazılı ilerliyor. İstediğin an duraklatabilir, bir adım geri alabilir ya da turu tamamen kapatabilirsin.",
        placement: "center",
      },
      {
        id: "sidebar",
        title: "Sol menü",
        text: "Uygulamanın ana gezinme alanı burası. Ana Sayfa, Bütçe, Dosyalar, Takvim ve Yapılacaklar tek tıkla buradan açılır.",
        speech:
          "Solda gördüğün menü, uygulamanın ana gezinme alanı. Ana Sayfa, Bütçe, Dosyalar, Takvim ve Yapılacaklar sayfalarına buradan tek tıkla geçebilirsin. Dar ekranda bu menü gizlenir; sol üstteki oka basınca bir çekmece gibi açılır.",
        anchor: "sidebar",
        placement: "right",
        optional: true,
      },
      {
        id: "sidebar-tree",
        title: "Yapı ağacı",
        text: "Gruplarını, organizasyonlarını ve işlerini iç içe gösteren ağaç. Bir satırı açınca altındaki departmanlar ve projeler görünür.",
        speech:
          "Menünün altındaki bu ağaç, gruplarını, organizasyonlarını ve işlerini iç içe gösterir. Bir satırın önündeki oka bastığında altındaki departmanlar ve projeler açılır. Hangi işin nereye bağlı olduğunu en hızlı buradan görürsün.",
        anchor: "sidebar-tree",
        placement: "right",
        optional: true,
      },
      {
        id: "dashboard-tabs",
        title: "Ana sayfa sekmeleri",
        text: "Ana sayfa dört sekmeden oluşur: İşler, Bütçe, Dosyalar ve Modüller. Hepsi aynı sayfada, sekme değiştirerek geçersin.",
        speech:
          "Ana sayfan dört sekmeden oluşuyor: İşler, Bütçe, Dosyalar ve Modüller. Dördü de aynı sayfada duruyor, aralarında sekme değiştirerek geçiyorsun. Birazdan her birini ayrı ayrı anlatan turları da görebileceksin.",
        anchor: "dashboard-tabs",
        placement: "bottom",
      },
      {
        id: "ekle",
        title: "Yeni bir şey oluştur",
        text: "Ortadaki artı düğmesi bulunduğun sayfaya göre iş, proje, görev ya da kayıt ekler.",
        speech:
          "Ekranın altındaki artı düğmesi, bulunduğun sayfaya göre farklı şeyler ekler. Ana sayfadayken yeni bir iş, bir projenin içindeyken görev ya da çıktı oluşturur. Yani her zaman doğru şeyi eklemek için doğru yerdesin.",
        anchor: "bottom-nav-fab",
        placement: "top",
        optional: true,
      },
      {
        id: "bildirimler",
        title: "Bildirimler",
        text: "Sana atanan görevler, yaklaşan teslim tarihleri ve ekip hareketleri bu zilin altında toplanır.",
        speech:
          "Sağ üstteki zil, bildirimlerin. Sana atanan görevler, yaklaşan teslim tarihleri ve ekibinin hareketleri burada toplanır. Okunmamış bir şey varsa zilin üstünde küçük bir işaret belirir.",
        anchor: "notification-bell",
        placement: "left",
      },
      {
        id: "lio",
        title: "Lio, yapay zekâ asistanın",
        text: "Sağ alttaki Lio'ya yazarak plan çıkarabilir, görev oluşturabilir ya da bir şeyi nasıl yapacağını sorabilirsin. Kısayolu: Command veya Ctrl artı K.",
        speech:
          "Sağ altta duran Lio, Projelio'nun yapay zekâ asistanı. Ona yazarak plan çıkarabilir, görev oluşturabilir ya da bir şeyi nasıl yapacağını sorabilirsin. Klavyeden Command K, Windows'ta Control K ile de açılır.",
        anchor: "lio-launcher",
        placement: "left",
        optional: true,
      },
      {
        id: "yardim",
        title: "Turu istediğin an tekrar başlat",
        text: "Bu soru işareti her sayfada duruyor. Tıkladığında o sayfayla ilgili anlatımları listeler; dilediğini baştan dinleyebilirsin.",
        speech:
          "Son olarak şunu bilmeni isterim: bu soru işareti her sayfada duruyor. Tıkladığında bulunduğun sayfayla ilgili anlatımları listeler. Bir şeyi unuttuğunda ya da yeni bir alana geçtiğinde buradan istediğin turu baştan dinleyebilirsin. Hazırsan başlayalım.",
        anchor: "tour-launcher",
        placement: "bottom",
      },
    ],
  },

  {
    id: "ana-sayfa-sekmeleri",
    title: "Ana sayfadaki dört sekme",
    description: "İşler, Bütçe, Dosyalar ve Modüller sekmeleri ne gösterir?",
    area: "isler",
    match: /^\/$/,
    steps: [
      {
        id: "isler",
        title: "İşler",
        text: "Erişebildiğin tüm işler burada kart olarak listelenir. Kartın üstündeki göstergeler işin ilerlemesini ve gecikmiş görevlerini özetler.",
        speech:
          "İşler sekmesi, erişebildiğin bütün işleri kart olarak listeler. Her kartın üstündeki göstergeler o işin ilerlemesini ve varsa gecikmiş görevlerini özetler. Bir karta tıkladığında işin kendi sayfası açılır.",
        navigateTo: "/",
        anchor: "dashboard-tab-jobs",
        placement: "bottom",
      },
      {
        id: "butce",
        title: "Bütçe",
        text: "Gelir ve giderlerini tek yerde toplar. Kayıtları iş, proje ya da departman bazında ayırabilirsin.",
        speech:
          "Bütçe sekmesi gelir ve giderlerini tek yerde toplar. Kayıtları iş, proje ya da departman bazında ayırabilir; tekrarlayan ödemeleri bir kez tanımlayıp otomatik işlemesini sağlayabilirsin.",
        navigateTo: "/?tab=budget",
        anchor: "dashboard-tab-budget",
        placement: "bottom",
      },
      {
        id: "dosyalar",
        title: "Dosyalar",
        text: "İşlerine yüklenmiş bütün dosyalar tek listede. Google Drive ya da OneDrive bağlıysa oradaki klasörlere de buradan ulaşırsın.",
        speech:
          "Dosyalar sekmesinde, işlerine yüklenmiş bütün dosyalar tek bir listede toplanır. Google Drive ya da OneDrive hesabını bağladıysan, oradaki klasörlerine de buradan ulaşabilir, dosyayı uygulamadan çıkmadan önizleyebilirsin.",
        navigateTo: "/?tab=files",
        anchor: "dashboard-tab-files",
        placement: "bottom",
      },
      {
        id: "moduller",
        title: "Modüller",
        text: "Finans, İnsan Kaynakları, Satış gibi hazır çalışma alanları. Departmanına ekleyince ilgili kayıt ekranları hazır gelir.",
        speech:
          "Modüller sekmesi, Finans, İnsan Kaynakları, Satış gibi hazır çalışma alanlarını gösterir. Bir modülü departmanına eklediğinde, o alana ait kayıt ekranları hazır olarak gelir; sıfırdan tablo kurmana gerek kalmaz.",
        navigateTo: "/?tab=modules",
        anchor: "dashboard-tab-modules",
        placement: "bottom",
      },
    ],
  },

  {
    id: "butce-nasil-calisir",
    title: "Bütçeyi kullanmak",
    description: "Gelir-gider girmek, tekrarlayan ödemeler ve bütçe özetleri.",
    area: "butce",
    match: /^\/(\?.*)?$/,
    steps: [
      {
        id: "butce-genel",
        title: "Bütçe sekmesi",
        text: "Bütçe, girdiğin her gelir ve gideri işlerine bağlar. Böylece hangi işin ne kazandırdığını ayrı ayrı görürsün.",
        speech:
          "Bütçe sekmesi, girdiğin her gelir ve gideri bir işe ya da departmana bağlar. Bu sayede toplam rakamın yanında, hangi işin ne kazandırdığını da ayrı ayrı görebilirsin.",
        navigateTo: "/?tab=budget",
        anchor: "dashboard-tab-budget",
        placement: "bottom",
      },
      {
        id: "kayit-ekle",
        title: "Kayıt eklemek",
        text: "Yeni bir gelir ya da gider eklerken tutar, tarih ve bağlı olduğu işi seçersin. Tekrarlayan bir ödemeyse bir kez tanımlaman yeterli.",
        speech:
          "Yeni bir kayıt eklerken tutarı, tarihi ve kaydın bağlı olduğu işi seçersin. Kira ya da abonelik gibi tekrarlayan bir ödemeyse, tekrarlayan ödeme olarak bir kez tanımlaman yeterli; sonraki aylarda kendiliğinden işlenir.",
        placement: "center",
      },
    ],
  },

  {
    id: "takvim-nasil-calisir",
    title: "Takvim ve planlama",
    description: "Görevlerin takvime nasıl düşer, çalışma ritmini nasıl kurarsın?",
    area: "takvim",
    match: /^\/calendar/,
    steps: [
      {
        id: "takvim-genel",
        title: "Takvim",
        text: "Teslim tarihi olan her görev burada görünür. Bir günü tıklayarak o güne doğrudan iş ekleyebilirsin.",
        speech:
          "Takvimde, teslim tarihi olan her görev otomatik olarak görünür. Bir güne tıklayarak o güne doğrudan yeni bir iş ekleyebilir, mevcut bir görevi sürükleyerek başka bir güne taşıyabilirsin.",
        placement: "center",
      },
      {
        id: "ritim",
        title: "Çalışma ritmi",
        text: "Hangi günler ve saatlerde çalıştığını tanımlarsan, planlama bu ritme göre yapılır.",
        speech:
          "Çalışma ritmi ayarında hangi günler ve hangi saatlerde çalıştığını tanımlayabilirsin. Planlama bunu dikkate alır: kapalı olduğun günlere iş yazmaz, teslim tarihlerini buna göre önerir.",
        placement: "center",
      },
    ],
  },

  {
    id: "lio-asistan",
    title: "Lio ile çalışmak",
    description: "Yapay zekâ asistanına ne sorabilirsin, nasıl en iyi sonucu alırsın?",
    area: "lio",
    match: /.*/,
    steps: [
      {
        id: "acmak",
        title: "Lio'yu açmak",
        text: "Sağ alttaki maskota tıkla ya da Command / Ctrl + K tuşlarına bas.",
        speech:
          "Lio'yu sağ alttaki maskota tıklayarak ya da klavyeden Command K, Windows'ta Control K tuşlarıyla açarsın. Hangi sayfada olursan ol, aynı yerden ulaşılır.",
        anchor: "lio-launcher",
        placement: "left",
        optional: true,
      },
      {
        id: "ne-sorabilirsin",
        title: "Ne sorabilirsin?",
        text: "\"Bu proje için görev listesi çıkar\", \"bu ayki giderleri özetle\", \"yarın neye odaklanmalıyım\" gibi isteklerle konuşabilirsin.",
        speech:
          "Lio'ya gündelik dille yazabilirsin. Örneğin: bu proje için bir görev listesi çıkar, bu ayki giderleri özetle, ya da yarın neye odaklanmalıyım. Ne kadar çok bağlam verirsen sonuç o kadar isabetli olur.",
        placement: "center",
      },
    ],
  },
];

export function getTour(id: string): Tour | undefined {
  return TOURS.find((t) => t.id === id);
}

/** Verilen rotada "bu sayfayla ilgili" sayılan turlar. */
export function toursForPath(pathname: string, search = ""): Tour[] {
  const full = pathname + search;
  return TOURS.filter((t) => t.match.test(pathname) || t.match.test(full));
}
