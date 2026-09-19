import type { AccountType } from "@projelio/shared";

/**
 * "?" menüsündeki başlangıç rehberi: örnek iş kartlarını ve temel kavramları
 * kısa maddelerle anlatan yardım listesi (bkz. components/tour/BaslangicRehberi.tsx).
 *
 * Sesli turdan AYRI: tur ekranı gezdirir ("burası menü, burası Lio"), rehber
 * kavramı anlatır ("görev kartı nedir, alt görev ne işe yarar") ve kullanıcıyı
 * örnek işe götürür. İkisi aynı menüde duruyor çünkü aranan yer aynı: "?".
 *
 * KENDİLİĞİNDEN AÇILMA: yeni üyelerde ve üye olup çok az vakit geçirmiş,
 * geri dönen kullanıcılarda. Uygulamayı biraz kullanmış biri için her
 * girişte açılan bir liste gürültü; o kişi "?"ye basınca görür.
 */

/**
 * Bu süreden az kullanmış kişide rehber kendiliğinden açılır (toplam, saniye).
 * 30 dakika: 3 saatle başlandı ama mevcut kullanıcıların çoğu o eşiğin
 * altında kalıyordu ve liste neredeyse herkese her oturumda açılıyordu.
 */
export const REHBER_AZ_KULLANIM_SANIYE = 30 * 60;

/** Kullanıcı "bir daha kendiliğinden açma" dediğinde görüldü listesine giren kimlik. */
export const REHBER_KAPALI_KIMLIGI = "baslangic-rehberi:kendiliginden-acma";

/** İlk girişte kendiliğinden başlayan sesli tur; rehber onun bitmesini bekler. */
export const ILK_TUR_KIMLIGI = "ilk-adimlar";

/**
 * Rehber şimdi kendiliğinden açılsın mı? Saf karar.
 *
 * Sesli tur sürerken açılmaz (ikisi üst üste binerdi); ilk tur hiç
 * görülmemişse de beklenir — yeni üyede önce tur başlıyor, kapanınca rehber
 * açılıyor. Aynı tarayıcı oturumunda bir kez: sayfa değiştirdikçe tekrar
 * tekrar açılan bir liste kullanıcıyı kaçırır.
 */
export function rehberKendiligindenAcilsinMi(p: {
  toplamSaniye: number | null;
  kapatildi: boolean;
  buOturumdaAcildi: boolean;
  turSuruyor: boolean;
  ilkTurGoruldu: boolean;
}): boolean {
  if (p.kapatildi || p.buOturumdaAcildi || p.turSuruyor || !p.ilkTurGoruldu) return false;
  if (p.toplamSaniye === null) return false;
  return p.toplamSaniye < REHBER_AZ_KULLANIM_SANIYE;
}

export type RehberEylemi =
  | { tur: "ornek-is" }
  | { tur: "yol"; yol: string }
  | { tur: "sesli-tur"; turId: string };

export interface RehberMaddesi {
  id: string;
  baslik: string;
  metin: string;
  eylem?: { etiket: string } & RehberEylemi;
}

// dil:anahtar-baslangic — rehber metinleri: çeviri bileşende yapılıyor.
const ORNEK_IS: RehberMaddesi = {
  id: "ornek-is",
  baslik: "Örnek işin",
  metin:
    "Hesabına \"Projelio'yu tanı\" adında örnek bir iş açtık. İçindeki proje, görev kartları ve rutin gerçek kayıtlar: aç, düzenle, tamamla — hiçbir şey bozulmaz. Her kartın açıklamasında o kartla ne deneyebileceğin yazıyor.",
  eylem: { etiket: "Örnek işi aç", tur: "ornek-is" },
};

const GOREV_KARTI: RehberMaddesi = {
  id: "gorev-karti",
  baslik: "Görev kartları",
  metin:
    "Her kart yapılacak tek bir iş. Kartı açıp başlığını, bitiş tarihini ve kime atandığını değiştirebilirsin; bitince tamamlandı olarak işaretle. Tarihi olan kartlar Yapılacaklar'da, takvimde ve sabah özet e-postasında görünür.",
};

const ALT_GOREV: RehberMaddesi = {
  id: "alt-gorev",
  baslik: "Alt görevler",
  metin:
    "Büyük bir işi başlanabilir parçalara böl: kartın içine alt görevler ekle. Alt görevler tamamlandıkça ana görevin ne kadar ilerlediği görünür.",
};

const RUTIN: RehberMaddesi = {
  id: "rutin",
  baslik: "Rutinler",
  metin:
    "Her hafta ya da her ay tekrar eden işler için rutin kur. Kuralı bir kez yazarsın; görevler vakti gelince kendiliğinden açılır ve kaçırılanlar görünür.",
};

const YAPILACAKLAR: RehberMaddesi = {
  id: "yapilacaklar",
  baslik: "Yapılacaklar",
  metin: "Bütün işlerindeki ve projelerindeki görevlerin tek bir listede. Güne buradan başla: bugün ne var, ne gecikti.",
  eylem: { etiket: "Yapılacaklar'ı aç", tur: "yol", yol: "/tasks" },
};

const LIO: RehberMaddesi = {
  id: "lio",
  baslik: "Lio",
  metin:
    "Sağ alttaki yapay zekâ yardımcısına düz cümlelerle yaz: \"yarın için üç görev ekle\", \"bu hafta neler gecikti?\". Cmd/Ctrl + K ile de açılır.",
};

const SIL: RehberMaddesi = {
  id: "ornekleri-sil",
  baslik: "Hazır olduğunda örnekleri sil",
  metin:
    "Örnek işin sayfasındaki \"Örnekleri sil\" düğmesi örnek işi, projesini, görevlerini ve rutinini birlikte kaldırır. Kendi açtığın işlere dokunmaz; örnekleri Ayarlar > Yardımcılar'dan yeniden ekleyebilirsin.",
};

const DEPARTMANLAR: RehberMaddesi = {
  id: "departmanlar",
  baslik: "Departmanlar ve kadro",
  metin:
    "Şirket sayfasında departmanlarını kur ve çalışanlarını kadroya davet et; her departmanın kendi görev panosu ve modülleri olur. Dışarıdan hizmet aldığın kişileri taşeron olarak ekle — yalnızca kendilerine açılan modülü görürler.",
  eylem: { etiket: "Şirketlerimi aç", tur: "yol", yol: "/organizations" },
};

const BUTCE: RehberMaddesi = {
  id: "butce",
  baslik: "Kademeli bütçe",
  metin:
    "Bütçe görevden projeye, işe, departmana ve şirkete doğru kendiliğinden toplanır. Bir gideri ait olduğu kademeye yaz; hiçbir şey iki kez sayılmaz, para birimleri birbirine karışmaz.",
};

const TASERON_GORUNUM: RehberMaddesi = {
  id: "taseron",
  baslik: "Taşeron olarak ne görürsün",
  metin:
    "Seni davet eden şirketin yalnızca sana açılan modülünü ve sana atanan görevleri görürsün; şirketin diğer işleri ve bütçesi sana kapalı. Davet bildirimini kabul etmeyi unutma.",
};

const TESLIM: RehberMaddesi = {
  id: "teslim",
  baslik: "İşini teslim et",
  metin:
    "Sana atanan bir görevi tamamlandı olarak işaretlediğinde görevi veren kişi bunu görür. Yaptım sayfasında da yaptığın işleri ve sürelerini kayıt altında tutabilirsin.",
  eylem: { etiket: "Yaptım'ı aç", tur: "yol", yol: "/worklog" },
};

const SESLI_TUR: RehberMaddesi = {
  id: "sesli-tur",
  baslik: "Ekranı sesli gez",
  metin: "Ekranın hangi parçası ne işe yarıyor? İki dakikalık sesli tanıtımı istediğin zaman yeniden izleyebilirsin.",
  eylem: { etiket: "Turu başlat", tur: "sesli-tur", turId: ILK_TUR_KIMLIGI },
};
// dil:anahtar-bitis

/** Hesap tipine göre maddeler — örnek iş de hesap tipine göre açılıyor (bkz. ornek-is.icerik.ts). */
export function rehberMaddeleri(hesapTipi: AccountType | undefined): RehberMaddesi[] {
  if (hesapTipi === "organization_owner" || hesapTipi === "group_owner") {
    return [ORNEK_IS, DEPARTMANLAR, GOREV_KARTI, ALT_GOREV, BUTCE, RUTIN, LIO, SIL, SESLI_TUR];
  }
  if (hesapTipi === "subcontractor") {
    return [ORNEK_IS, TASERON_GORUNUM, YAPILACAKLAR, GOREV_KARTI, TESLIM, LIO, SIL, SESLI_TUR];
  }
  return [ORNEK_IS, GOREV_KARTI, ALT_GOREV, YAPILACAKLAR, RUTIN, LIO, SIL, SESLI_TUR];
}
