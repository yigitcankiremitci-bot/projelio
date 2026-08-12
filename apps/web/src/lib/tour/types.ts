/**
 * Sesli + yazılı ürün turunun veri tipleri.
 *
 * Tur = bir alanı (ör. "Ana Sayfa sekmeleri", "Bütçe") baştan sona anlatan
 * adımlar dizisi. Her adım ekranda bir baloncuk gösterir, aynı anda metni
 * seslendirir ve varsa ilgili arayüz öğesini spot ışığına alır.
 *
 * Hedef öğe seçimi CSS sınıfı ya da DOM yapısına göre DEĞİL, öğelere elle
 * eklenen `data-tour="..."` işaretine göre yapılır (bkz. tourAnchor()).
 * Böylece stil/yapı değiştiğinde tur bozulmaz; işaret kaldırılmadıkça çalışır.
 */

export type TourPlacement = "auto" | "top" | "bottom" | "left" | "right" | "center";

export interface TourStep {
  /**
   * Tur içinde benzersiz. Ses dosyasının adı da budur:
   * public/tour-audio/tr/<turId>/<adimId>.mp3
   * Bu yüzden id değiştirmek, yüklenmiş sesi de yeniden adlandırmayı gerektirir.
   */
  id: string;
  title: string;
  /** Baloncukta görünen metin. */
  text: string;
  /**
   * Seslendirilecek metin. Boşsa `text` okunur.
   * Yazılı metin kısa/şematik, sesli anlatım daha akıcı olsun istendiğinde ayrılır.
   */
  speech?: string;
  /** Hedef öğenin `data-tour` değeri. Yoksa adım ekranın ortasında gösterilir. */
  anchor?: string;
  placement?: TourPlacement;
  /** Adım gösterilmeden önce gidilecek rota (ör. "/?tab=budget"). */
  navigateTo?: string;
  /** Spot ışığının hedefin etrafında bırakacağı boşluk (px). */
  padding?: number;
  /**
   * true ise, hedef öğe o an ekranda yoksa (ör. sidebar mobilde kapalı, sekme
   * kullanıcının rolünde görünmüyor) adım sessizce atlanır. false/boşsa adım
   * ekranın ortasında hedefsiz gösterilir.
   */
  optional?: boolean;
}

export type TourArea =
  | "genel"
  | "isler"
  | "butce"
  | "dosyalar"
  | "takvim"
  | "moduller"
  | "lio"
  | "ayarlar";

export const AREA_LABELS: Record<TourArea, string> = {
  genel: "Genel",
  isler: "İşler",
  butce: "Bütçe",
  dosyalar: "Dosyalar",
  takvim: "Takvim",
  moduller: "Modüller",
  lio: "Lio (AI)",
  ayarlar: "Ayarlar",
};

export interface Tour {
  id: string;
  title: string;
  /** Tur listesinde başlığın altında görünen tek cümlelik özet. */
  description: string;
  area: TourArea;
  /** Bu turun hangi rotalarda "bu sayfayla ilgili" sayılacağı. */
  match: RegExp;
  /**
   * true ise, kullanıcı eşleşen sayfaya ilk kez geldiğinde tur kendiliğinden
   * başlar (bir kez; bkz. localStorage projelio_tour_seen_v1).
   */
  autoStart?: boolean;
  steps: TourStep[];
}

/**
 * Bir öğeyi tura hedef yapar:  <div {...tourAnchor("dashboard-tabs")}>
 * Tek yerden geçirmek, ileride veri niteliğinin adı değişirse tüm çağrıları
 * tek dosyadan güncelleyebilmek içindir.
 */
export function tourAnchor(key: string): { "data-tour": string } {
  return { "data-tour": key };
}
