/**
 * Günlük "Projelio ipucu" e-postalarının dizisi (bkz. migration 118).
 *
 * NEDEN SABİT BİR DİZİ, rastgele değil: ipuçları bir öğrenme SIRASI izliyor —
 * önce örnek iş, sonra iş/proje/görev katmanları, sonra rutin, Lio, ekip...
 * Rutini anlatan e-posta, görevin ne olduğunu bilmeyen birine erken gelirse
 * boşa gider. Dizi bitince gönderim kendiliğinden durur: yeni üyeye yardım
 * eden bir seri, sonsuza kadar sürerse pazarlama e-postasına dönüşür ve
 * kapatılır.
 *
 * Metinler DÜZ METİN (HTML değil): hem e-postanın HTML hem düz metin
 * sürümünde aynı metin kullanılıyor. Paragraflar "\n\n" ile ayrılır.
 *
 * BUNLAR VARSAYILANLAR: yönetici Admin > E-posta > İpuçları'ndan her birini
 * düzenleyebilir, kapatabilir, sırasını değiştirebilir ve araya kendi
 * ipucunu ekleyebilir (bkz. migration 119, eposta_ipuclari). İlerleme,
 * "hangi ipucu kime gitti" kaydıyla tutuluyor (ipucu_gonderimleri), yani
 * buraya yeni ipucu eklemek ya da sırayı değiştirmek kimseyi şaşırtmaz.
 * `kimlik` ise KALICI: değiştirmek, o ipucunu almış herkese yeniden gönderir.
 *
 * Çeviri: başlık, gövde ve düğme metinleri sunucu sözlüğünde
 * (common/i18n/en/ipuclari.ts). Burada yazılan her metnin orada karşılığı
 * olmalı — `npm run dil` eksik olanı yakalar.
 */

export interface Ipucu {
  /** Kısa, kalıcı kimlik — yalnızca log ve testler için; ilerleme sayaçla. */
  kimlik: string;
  baslik: string;
  govde: string;
  /** Uygulama içi yol; e-postada tam adrese çevrilir. */
  link: string;
  dugme: string;
}

// dil:anahtar-baslangic — ipucu metinleri: çeviri e-posta üretilirken yapılıyor.
export const IPUCLARI: readonly Ipucu[] = [
  {
    kimlik: "ornek-is",
    baslik: "Örnek işinle başla",
    govde:
      "Ana sayfanda \"Projelio'yu tanı\" adında örnek bir iş seni bekliyor. İçindeki kartlar Projelio'yu adım adım anlatıyor: kurcala, tamamla, sil — hiçbir şey bozulmaz.\n\nİşin bitince iş sayfasındaki \"Örnekleri sil\" düğmesiyle hepsini tek tıkla kaldırabilirsin. Örnek işi göremiyorsan Ayarlar > Yardımcılar'dan istediğin zaman ekleyebilirsin.",
    link: "/",
    dugme: "Örnek işi aç",
  },
  {
    kimlik: "katmanlar",
    baslik: "İş, proje, görev: üç katman",
    govde:
      "Projelio'da her şey bir İŞ altında toplanır: bir müşteri, şirketin ya da kendi girişimin. İşin içinde projeler, projelerin içinde görevler olur.\n\nBaşlamak için tek bir iş açman yeter. Sonra ilk projeni ekle ve aklındaki ilk üç görevi yaz — geri kalanı zamanla oturur.",
    link: "/",
    dugme: "İlk işini aç",
  },
  {
    kimlik: "alt-gorev",
    baslik: "Büyük görevi alt görevlere böl",
    govde:
      "Bir görevin içine alt görevler ekleyebilirsin. \"Web sitesini yenile\" tek başına göz korkutur; \"metinleri topla\", \"görselleri seç\", \"yayına al\" diye bölünce başlamak kolaylaşır.\n\nAlt görevler tamamlandıkça ana görevin ne kadar ilerlediği de görünür.",
    link: "/tasks",
    dugme: "Görevlerime git",
  },
  {
    kimlik: "yapilacaklar",
    baslik: "Bütün görevlerin tek bir yerde",
    govde:
      "Farklı işlerdeki ve projelerdeki görevlerin Yapılacaklar sayfasında toplanır. Güne oradan başla: bugün ne var, ne gecikti, sırada ne var.\n\nHer sabah gelen özet e-postası da aynı listeyi gelen kutuna getirir.",
    link: "/tasks",
    dugme: "Yapılacaklar'ı aç",
  },
  {
    kimlik: "rutin",
    baslik: "Tekrar eden işler için rutin kur",
    govde:
      "Her pazartesi rapor, her ayın 1'inde fatura kontrolü... Bunları her seferinde elle görev olarak açmana gerek yok.\n\nBir işin içinde rutin oluştur ve ne sıklıkla tekrarlandığını söyle. Projelio görevleri vakti gelince kendisi açar, kaçırdıklarını da gösterir.",
    link: "/",
    dugme: "Bir rutin kur",
  },
  {
    kimlik: "lio",
    baslik: "Lio'ya yazdır, o yapsın",
    govde:
      "Sağ alttaki Lio, Projelio'nun yapay zekâ yardımcısı. \"Yarın için üç görev ekle\", \"bu hafta geciken görevlerimi listele\" gibi düz cümleler yaz; o senin yerine yapsın.\n\nLio'yu klavyeden Cmd/Ctrl + K ile de açabilirsin.",
    link: "/",
    dugme: "Lio'yu dene",
  },
  {
    kimlik: "takvim",
    baslik: "Haftanı takvimde gör",
    govde:
      "Takvim sayfasında görevlerin günlere yerleşmiş hâlde görünür. Hangi günün dolu, hangisinin boş olduğunu bir bakışta anlarsın.\n\nYoğun bir haftaya girmeden önce takvime göz atmak, son dakika sürprizlerini azaltır.",
    link: "/calendar",
    dugme: "Takvimi aç",
  },
  {
    kimlik: "ekip",
    baslik: "Ekibini davet et",
    govde:
      "Bir işe ekip arkadaşlarını ekleyip görevleri onlara atayabilirsin. Atadığın kişiye bildirim gider; görev tamamlanınca sen de haberdar olursun.\n\nKimin neyle uğraştığını sormak yerine görev listesine bakman yeter.",
    link: "/",
    dugme: "Bir iş aç ve ekibini ekle",
  },
  {
    kimlik: "yaptim",
    baslik: "Yaptım: bugün ne yaptın?",
    govde:
      "Yaptım, kişisel iş günlüğün. Gün içinde yaptığın işleri kısaca yaz, istersen kronometreyle süresini tut.\n\nPlanlı görevlerin dışında kalan işler de böylece kaybolmaz; hafta sonunda vaktinin nereye gittiğini görürsün.",
    link: "/worklog",
    dugme: "Yaptım'ı aç",
  },
  {
    kimlik: "hatirlatma",
    baslik: "Saat ver, hatırlatılsın",
    govde:
      "Bir göreve bitiş tarihinin yanında saat de verebilirsin. Saatli görevlerde, vaktinden önce hatırlatma kurmak mümkün.\n\nHer sabahki özet e-postasının saatini de Ayarlar > Yardımcılar'dan kendine göre ayarlayabilirsin.",
    link: "/settings?sekme=yardimcilar",
    dugme: "E-posta ayarlarım",
  },
  {
    kimlik: "butce",
    baslik: "Bütçeni işinle birlikte takip et",
    govde:
      "İşlerinin ve projelerinin bütçe sekmesine gelir ve giderlerini yazabilirsin. Projelio bunları projeden işe, işten şirkete doğru kendisi toplar.\n\nFarklı para birimleri birbirine karışmaz; her biri kendi toplamıyla görünür.",
    link: "/",
    dugme: "İşlerime git",
  },
  {
    kimlik: "dosyalar",
    baslik: "Dosyaların işinle birlikte dursun",
    govde:
      "Google Drive ya da OneDrive hesabını bağlarsan, işlerinin ve projelerinin dosyalarını Projelio'dan açıp yükleyebilirsin.\n\nBir dosyayı bulmak için hangi klasörde olduğunu hatırlaman gerekmez; işin içinde durur.",
    link: "/settings?sekme=baglantilar",
    dugme: "Bağlantıları aç",
  },
  {
    kimlik: "sadelestir",
    baslik: "Ekranını sadeleştir",
    govde:
      "Kullanmadığın bölümleri Ayarlar > Gezinme'den gizleyebilirsin. Menüde yalnızca işine yarayanlar kalsın.\n\nFikrin değişirse aynı yerden tek tıkla geri açarsın.",
    link: "/settings?sekme=gezinme",
    dugme: "Gezinme ayarları",
  },
  {
    kimlik: "destek",
    baslik: "Son ipucu: bize yaz",
    govde:
      "Bu, ipucu dizisinin son e-postası. Umarız Projelio'da kendine bir düzen kurmuşsundur.\n\nTakıldığın bir yer ya da eksik gördüğün bir özellik varsa Ayarlar > Destek'ten yaz — her mesajı okuyoruz.",
    link: "/settings?sekme=destek",
    dugme: "Destek'e yaz",
  },
];
// dil:anahtar-bitis

/** Koddaki ipucunun varsayılan sıra değeri: aralıklı, yönetici araya ekleyebilsin. */
export const KOD_SIRA_ADIMI = 10;

/**
 * Yöneticinin kaydı (eposta_ipuclari satırı). `kod` doluysa koddaki ipucunun
 * üstüne yazar; boş metin alanları koddakini korur.
 */
export interface IpucuAyari {
  id: string;
  kod: string | null;
  sira: number;
  aktif: boolean;
  lioIle: boolean;
  baslik: string | null;
  govde: string | null;
  link: string | null;
  dugme: string | null;
}

/** Gönderimde ve admin listesinde kullanılan, birleştirilmiş ipucu. */
export interface EtkinIpucu extends Ipucu {
  /** ipucu_gonderimleri'ndeki anahtar: kod ya da satır kimliği. */
  anahtar: string;
  kaynak: "kod" | "ozel";
  /** Yönetici metni değiştirdi mi (koddaki ipucu için). */
  duzenlendi: boolean;
  sira: number;
  aktif: boolean;
  lioIle: boolean;
  /** Varsa eposta_ipuclari satırının kimliği. */
  ayarId: string | null;
}

/**
 * Koddaki ipuçlarıyla yöneticinin kayıtlarını tek sıralı listede birleştirir.
 *
 * Kayıt yoksa koddaki ipucu varsayılan hâliyle (aktif, Lio'suz, kendi
 * sırasında) listede kalır — tablo boşken sistem 118'deki gibi çalışır.
 * Koddan KALDIRILMIŞ bir ipucunun kaydı metni olmadığı sürece yok sayılır.
 */
export function ipuclariniBirlestir(kod: readonly Ipucu[], ayarlar: readonly IpucuAyari[]): EtkinIpucu[] {
  const kodaGore = new Map(ayarlar.filter((a) => a.kod).map((a) => [a.kod as string, a]));
  const sonuc: EtkinIpucu[] = kod.map((ipucu, i) => {
    const a = kodaGore.get(ipucu.kimlik);
    return {
      ...ipucu,
      baslik: a?.baslik ?? ipucu.baslik,
      govde: a?.govde ?? ipucu.govde,
      link: a?.link ?? ipucu.link,
      dugme: a?.dugme ?? ipucu.dugme,
      anahtar: ipucu.kimlik,
      kaynak: "kod",
      duzenlendi: Boolean(a && (a.baslik || a.govde || a.link || a.dugme)),
      sira: a ? a.sira : i * KOD_SIRA_ADIMI,
      aktif: a ? a.aktif : true,
      lioIle: a ? a.lioIle : false,
      ayarId: a?.id ?? null,
    };
  });
  const kodKimlikleri = new Set(kod.map((i) => i.kimlik));
  for (const a of ayarlar) {
    if (a.kod && kodKimlikleri.has(a.kod)) continue;
    if (!a.baslik || !a.govde) continue;
    sonuc.push({
      kimlik: a.kod ?? a.id,
      anahtar: a.kod ?? a.id,
      baslik: a.baslik,
      govde: a.govde,
      link: a.link || "/",
      dugme: a.dugme || "Projelio'yu aç", // dil:anahtar
      kaynak: "ozel",
      duzenlendi: true,
      sira: a.sira,
      aktif: a.aktif,
      lioIle: a.lioIle,
      ayarId: a.id,
    });
  }
  // Eşit sırada koddaki önce gelir: sıralama kararlı ve öngörülebilir kalsın.
  return sonuc.sort((x, y) => x.sira - y.sira || (x.kaynak === y.kaynak ? 0 : x.kaynak === "kod" ? -1 : 1));
}

/**
 * Bu kişiye sıradaki ipucu: aktif ipuçlarından henüz gitmemiş ilki.
 * `sira`/`toplam` e-postadaki "3/14" göstergesi için, aktif ipuçları içinde.
 */
export function siradakiIpucu(
  liste: readonly EtkinIpucu[],
  gonderilenler: ReadonlySet<string>
): { ipucu: EtkinIpucu; sira: number; toplam: number } | null {
  const aktifler = liste.filter((i) => i.aktif);
  const index = aktifler.findIndex((i) => !gonderilenler.has(i.anahtar));
  if (index < 0) return null;
  return { ipucu: aktifler[index], sira: index + 1, toplam: aktifler.length };
}

/**
 * Hesap bu yaştan büyükse dizi HİÇ BAŞLAMAZ (başlamışsa sürer).
 *
 * Dizi yeni üyeler için: aylardır Projelio kullanan birine "iş, proje, görev
 * nedir" e-postası göndermek hem gereksiz hem de "bu sistem beni tanımıyor"
 * hissi veriyor. Özellik yayına girdiğinde hesabı bundan genç olan herkes
 * diziyi baştan alır — kayıt olup geri dönmeyenler tam da bu grupta.
 */
export const DIZI_BASLANGIC_YAS_SINIRI_GUN = 60;

/**
 * Kayıttan sonra ilk ipucu için beklenen süre. Kayıt anında doğrulama
 * e-postası zaten gidiyor; aynı saatte bir de ipucu göndermek, iki e-postayı
 * üst üste bindirirdi.
 */
export const ILK_IPUCU_BEKLEMESI_SAAT = 12;

/**
 * Bu kullanıcıya şimdi ipucu gönderilmeli mi? Saf karar — işleyici yalnızca
 * sonucu uyguluyor, böylece kural test edilebiliyor.
 *
 * `bugun` kullanıcının YEREL günü, `yerelSaat` yerel saati: ipucu, günlük
 * özetle aynı saatte gelir ve aynı gün ikinci kez gitmez.
 */
export function ipucuKarari(params: {
  simdi: Date;
  hesapAcilis: Date | null;
  acik: boolean;
  liste: readonly EtkinIpucu[];
  gonderilenler: ReadonlySet<string>;
  sonIpucuGunu: string | null;
  bugun: string;
  yerelSaat: number;
  gunlukSaat: number;
  /**
   * Yönetici hesabı yaş sınırına takılmaz: ipuçlarını düzenleyen kişi,
   * kullanıcılara ne gittiğini kendi gelen kutusunda görmeli.
   */
  yasSiniriYok?: boolean;
}): { gonder: false } | { gonder: true; ipucu: EtkinIpucu; sira: number; toplam: number } {
  if (!params.acik) return { gonder: false };
  const sonraki = siradakiIpucu(params.liste, params.gonderilenler);
  if (!sonraki) return { gonder: false };
  if (params.sonIpucuGunu === params.bugun) return { gonder: false };
  if (params.yerelSaat < params.gunlukSaat) return { gonder: false };

  // Hesabın açılış anı bilinmiyorsa göndermiyoruz: yaş sınırını
  // uygulayamadığımız bir hesaba dizinin başını göndermek, tam da önlemek
  // istediğimiz "eski kullanıcıya acemi e-postası" durumu.
  if (!params.hesapAcilis || Number.isNaN(params.hesapAcilis.getTime())) return { gonder: false };
  const yasMs = params.simdi.getTime() - params.hesapAcilis.getTime();
  if (yasMs < ILK_IPUCU_BEKLEMESI_SAAT * 60 * 60 * 1000) return { gonder: false };
  // "Dizi başladı mı" = bu kişiye daha önce herhangi bir ipucu gitti mi.
  if (!params.yasSiniriYok && params.gonderilenler.size === 0 && yasMs > DIZI_BASLANGIC_YAS_SINIRI_GUN * 24 * 60 * 60 * 1000) {
    return { gonder: false };
  }
  return { gonder: true, ...sonraki };
}
