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
 * Kural öncesi kurulmuş şirketler bir kerelik geçişle uyar (aşağıda,
 * migration 173): sahip tutacağı departmanları seçer, gerisinin verisi ve
 * kişileri Yönetim'e taşınır.
 */

/** Kişi sayısı (yönetici DAHİL) bunun altındaysa departman sayısı sınırlı. */
export const KUCUK_SIRKET_SINIRI = 10;

/**
 * YÖNETİM departmanı kuraldan MUAF (kullanıcı kararı, 2026-11-01): yöneticinin
 * kendi departmanı — kişi istemez, sayıya girmez. Görevler veritabanı kuralı
 * gereği bir departmana ya da projeye ait olmak zorunda; kimsesi olmayan
 * şirketin görevlerinin de bir evi olmalı. Bkz. migration 173.
 */
export const MUAF_DEPARTMAN_ANAHTARI = "yonetim";

export function departmanSayilirMi(catalogKey: string | null | undefined): boolean {
  return catalogKey !== MUAF_DEPARTMAN_ANAHTARI;
}

/** Departman sayısı sınırı; null = sınır yok (10 kişi ve üstü). */
export function departmanSiniri(kisiSayisi: number): number | null {
  return kisiSayisi + 1 < KUCUK_SIRKET_SINIRI ? kisiSayisi : null;
}

export interface DepartmanAcmaGercekleri {
  /** Şirkette arşivlenmemiş departman sayısı (açılacak olan ve Yönetim HARİÇ). */
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

// ------------------------------------------------------------ Bir kerelik geçiş

/**
 * Mevcut şirketlerin kurala geçişi (migration 173, DepartmanGecisiModal):
 * sahip hangi departmanları TUTACAĞINI seçer; tutulmayanların verisi ve
 * kişileri Yönetim'e taşınır, departman silinir.
 */
export interface DepartmanGecisiDepartmani {
  id: string;
  name: string;
  catalogKey?: string;
  /** Yönetici dışındaki onaylı kişi sayısı. */
  kisiSayisi: number;
  gorevSayisi: number;
  dosyaSayisi: number;
}

export interface DepartmanGecisiDurumu {
  organizationId: string;
  organizationName: string;
  /** Yönetim HARİÇ arşivlenmemiş departmanlar. */
  departmanlar: DepartmanGecisiDepartmani[];
  /** Yönetici dışındaki kişi sayısı (tekil, Yönetim dahil tüm kadro). */
  kisiSayisi: number;
  /** Tutulabilecek departman sayısı; null = sınır yok. */
  sinir: number | null;
  yonetimVar: boolean;
}

/**
 * Seçim geçerli mi. Hata varsa kullanıcıya gösterilecek metin, yoksa null.
 * Tutulan her departmanda yönetici dışında en az bir kişi olmalı (departman
 * ilk kişisiyle doğar kuralının geçmişe uygulanışı) ve sayı sınırı aşılmamalı.
 */
export function gecisSeciminiDogrula(durum: DepartmanGecisiDurumu, tutulan: string[]): string | null {
  const byId = new Map(durum.departmanlar.map((d) => [d.id, d]));
  const tekil = new Set(tutulan);
  for (const id of tekil) {
    const d = byId.get(id);
    if (!d) return "Seçilen departmanlardan biri bu şirkette yok.";
    if (d.kisiSayisi < 1) {
      return `"${d.name}" departmanında yönetici dışında kimse yok. Tutmak için önce ekibe kişi ekle.`;
    }
  }
  if (durum.sinir !== null && tekil.size > durum.sinir) {
    return `Ekibinde yönetici dışında ${durum.kisiSayisi} kişi var: en çok ${durum.sinir} departman tutabilirsin.`;
  }
  return null;
}
