/**
 * Departman açma kuralı (kullanıcı kararı, 2026-11-01).
 *
 * Kurulumda departman sorulduğunda kullanıcı hepsini işaretliyordu; 2-3
 * kişilik işletmelerde kimsesi olmayan bir sürü departman doğuyordu. O 2-3 kişi
 * bütün işi birlikte yürütüyor — departmanlaşma ekip büyüdükçe olur. Bu yüzden:
 *
 * 1. Departman İLK KİŞİSİYLE doğar: yönetici (şirket sahibi) dışında biri
 *    olmadan departman açılamaz. Boş departman hiç oluşmaz.
 * 2. 10 kişiden küçük şirkette departman sayısı, yönetici dışındaki kişi
 *    sayısını geçemez: yönetici + 2 kişi → en çok 2 departman.
 * 3. 10 kişi ve üstünde sayı sınırı yok.
 *
 * Departmanı açılmamış modüller yöneticide çalışır (bkz. apps/web
 * lib/modulYeri.ts) — yani bu kural bir modülü kullanmayı engellemez.
 *
 * Sunucu (DepartmentsService.create) ve arayüz aynı fonksiyondan geçer: form
 * düğmeyi kapatırken gösterdiği sebep, sunucunun reddederken yazdığıyla aynı.
 *
 * Mevcut şirketlerdeki boş departmanlara DOKUNULMAZ; kural yalnızca yeni
 * departman açılışında işler.
 */

/** Kişi sayısı (yönetici DAHİL) bunun altındaysa departman sayısı sınırlı. */
export const KUCUK_SIRKET_SINIRI = 10;

export interface DepartmanAcmaGercekleri {
  /** Şirkette arşivlenmemiş departman sayısı (açılacak olan HARİÇ). */
  departmanSayisi: number;
  /**
   * Yönetici dışındaki kişi sayısı, açılacak departmanın ilk kişisi DAHİL
   * (yeni katılan biriyse bir artmış hâli).
   */
  kisiSayisiSonra: number;
}

export type DepartmanAcmaKarari = { acilabilir: true } | { acilabilir: false; sebep: string };

export function departmanAcilabilirMi(g: DepartmanAcmaGercekleri): DepartmanAcmaKarari {
  if (g.kisiSayisiSonra < 1) {
    return {
      acilabilir: false,
      sebep: "Departman ilk kişisiyle açılır: yönetici dışında birini ekip olarak eklediğinde departman açabilirsin.",
    };
  }
  // Yönetici de bir kişi: "10 kişiden az" toplamı soruyor.
  const toplam = g.kisiSayisiSonra + 1;
  if (toplam < KUCUK_SIRKET_SINIRI && g.departmanSayisi + 1 > g.kisiSayisiSonra) {
    return {
      acilabilir: false,
      sebep: `${KUCUK_SIRKET_SINIRI} kişiden küçük şirketlerde departman sayısı, yönetici dışındaki kişi sayısını geçemez (${g.kisiSayisiSonra} kişi, ${g.departmanSayisi} departman). Bu işleri yöneticide yürütebilir ya da yeni biriyle birlikte departman açabilirsin.`,
    };
  }
  return { acilabilir: true };
}

/** "Departman ekle" ekranının ihtiyaç duyduğu durum (GET .../departman-kurali). */
export interface DepartmanKuraliDurumu {
  departmanSayisi: number;
  /** Yönetici dışındaki kişi sayısı (bugün). */
  kisiSayisi: number;
  /** Mevcut bir çalışanla (kişi sayısı artmadan) açılabilir mi. */
  mevcutKisiyle: DepartmanAcmaKarari;
  /** Yeni biriyle (kişi sayısı bir artarak) açılabilir mi. */
  yeniKisiyle: DepartmanAcmaKarari;
}

export function departmanKuraliDurumu(departmanSayisi: number, kisiSayisi: number): DepartmanKuraliDurumu {
  return {
    departmanSayisi,
    kisiSayisi,
    mevcutKisiyle: departmanAcilabilirMi({ departmanSayisi, kisiSayisiSonra: kisiSayisi }),
    yeniKisiyle: departmanAcilabilirMi({ departmanSayisi, kisiSayisiSonra: kisiSayisi + 1 }),
  };
}

/**
 * Yeni bir kişiyle birlikte açılacak departmanın tanımı (Ekip Hesapları ve
 * İşe al formlarında "Yeni departman" seçeneği). Katalogdaki standart bir
 * departman ya da özel bir ad.
 */
export interface YeniDepartmanGirdisi {
  catalogKey?: string;
  name?: string;
  role: "manager" | "employee" | "subcontractor";
}
