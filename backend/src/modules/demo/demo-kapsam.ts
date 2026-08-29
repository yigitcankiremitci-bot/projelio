/**
 * DEMO KAPSAMI — "hangi satırlar demoya ait?" sorusunun tek cevabı.
 *
 * Hem anlık görüntü alınırken (DemoAnlikGoruntuService) hem de ziyaretçinin
 * eklediği satırlar silinirken (DemoSifirlamaService) buradaki tanımlar
 * kullanılıyor. İkisi ayrı listelerle yürüseydi biri güncellenip diğeri
 * unutulduğunda demo sessizce bozulurdu.
 */

/**
 * Demo satırlarının id aralığı.
 *
 * Bütün demo verisi `ce11...` ile başlayan uuid'lerle yüklendi; ziyaretçinin
 * oluşturduğu her satır rastgele bir uuid alır. uuid sütununda `like`
 * kullanamıyoruz (PostgREST filtrede `id::text` cast'i yapamaz, Postgres de
 * uuid ~~ text karşılaştırmasını reddeder), ama uuid sıralanabilir bir tip:
 * bu iki sınırın DIŞINDA kalan her satır ziyaretçi eseridir.
 */
export const DEMO_ID_ALT = "ce110000-0000-0000-0000-000000000000";
export const DEMO_ID_UST = "ce11ffff-ffff-ffff-ffff-ffffffffffff";

/** PostgREST `or=` filtresi: demo aralığının dışındaki satırlar. */
export const ZIYARETCI_SATIRI = `id.lt.${DEMO_ID_ALT},id.gt.${DEMO_ID_UST}`;

/** Demo kullanıcılarının e-posta alan adı. */
export const DEMO_EPOSTA_SONU = "@celikhan.test";

export type KapsamAdi =
  | "kullanicilar"
  | "organizasyon"
  | "departmanlar"
  | "isler"
  | "projeler"
  | "operasyonlar"
  | "rutinler"
  | "cariler"
  | "modulKayitlari"
  | "gorevler";

export type KapsamIdleri = Record<KapsamAdi, string[]>;

/**
 * Anlık görüntü alınırken tabloların İŞLENME SIRASI = geri yükleme sırası.
 * Önce ebeveyn (kullanıcılar, şirket), sonra ona bağlı kayıtlar; sırayı
 * bozarsan geri yükleme yabancı anahtar hatası verir.
 *
 * `tip`:
 *   eposta → users tablosu, demo alan adına göre
 *   aralik → yalnızca id aralığı yeter (organizations)
 *   kapsam → `sutun` değeri, daha önce toplanmış `kaynak` id listesinde olanlar
 *   coklu  → birden fazla sütundan sarkabilen tablolar (görev: proje/operasyon/departman)
 * `kendine` → kendine referans veren sütun; satırlar ebeveyn önce gelecek şekilde sıralanır.
 */
export type YakalamaKurali = {
  tablo: string;
  tip: "eposta" | "aralik" | "kapsam" | "coklu";
  sutun?: string;
  kaynak?: KapsamAdi;
  coklu?: { sutun: string; kaynak: KapsamAdi }[];
  kendine?: string;
  /** Toplanan id'lerin hangi kapsam adıyla saklanacağı (sonraki tablolar kullanır). */
  kapsamAdi?: KapsamAdi;
  /**
   * Yalnızca demo aralığındaki (`ce11...`) satırları al.
   *
   * VARSAYILAN KAPALI ve öyle olmalı: sahibi demoyu düzenlerken YENİ kayıt da
   * ekliyor ve o satırlar rastgele uuid alıyor; aralıkla sınırlasaydık sahibin
   * eklediği hiçbir şey "ilk hâl"e giremez, ilk sıfırlamada uçardı.
   *
   * Yalnızca uygulamanın kendi ürettiği gürültü için açılıyor (bildirimler):
   * onları dondurmanın anlamı yok, her sıfırlamada silinip yeniden üretiliyorlar.
   */
  yalnizcaDemoAraligi?: boolean;
};

export const YAKALAMA_KURALLARI: YakalamaKurali[] = [
  { tablo: "users", tip: "eposta", kapsamAdi: "kullanicilar" },
  // Sahibi demoya yeni bir şirket eklerse o da alınsın diye id aralığı değil
  // sahiplik ölçütü kullanılıyor.
  { tablo: "organizations", tip: "kapsam", sutun: "owner_id", kaynak: "kullanicilar", kapsamAdi: "organizasyon" },
  { tablo: "departments", tip: "kapsam", sutun: "organization_id", kaynak: "organizasyon", kapsamAdi: "departmanlar" },
  { tablo: "department_members", tip: "kapsam", sutun: "department_id", kaynak: "departmanlar" },
  { tablo: "organization_modules", tip: "kapsam", sutun: "organization_id", kaynak: "organizasyon" },
  { tablo: "module_members", tip: "kapsam", sutun: "organization_id", kaynak: "organizasyon" },
  {
    tablo: "party",
    tip: "kapsam",
    sutun: "organization_id",
    kaynak: "organizasyon",
    kendine: "parent_party_id",
    kapsamAdi: "cariler",
  },
  { tablo: "party_contact", tip: "kapsam", sutun: "party_id", kaynak: "cariler" },
  { tablo: "products", tip: "kapsam", sutun: "organization_id", kaynak: "organizasyon" },
  { tablo: "jobs", tip: "kapsam", sutun: "organization_id", kaynak: "organizasyon", kapsamAdi: "isler" },
  { tablo: "job_members", tip: "kapsam", sutun: "job_id", kaynak: "isler" },
  { tablo: "projects", tip: "kapsam", sutun: "job_id", kaynak: "isler", kapsamAdi: "projeler" },
  { tablo: "project_members", tip: "kapsam", sutun: "project_id", kaynak: "projeler" },
  { tablo: "outputs", tip: "kapsam", sutun: "project_id", kaynak: "projeler" },
  { tablo: "operations", tip: "kapsam", sutun: "job_id", kaynak: "isler", kapsamAdi: "operasyonlar" },
  { tablo: "operation_routines", tip: "kapsam", sutun: "operation_id", kaynak: "operasyonlar", kapsamAdi: "rutinler" },
  {
    tablo: "tasks",
    tip: "coklu",
    coklu: [
      { sutun: "project_id", kaynak: "projeler" },
      { sutun: "operation_id", kaynak: "operasyonlar" },
      { sutun: "department_id", kaynak: "departmanlar" },
    ],
    kendine: "parent_task_id",
    kapsamAdi: "gorevler",
  },
  {
    tablo: "budget_transactions",
    tip: "coklu",
    coklu: [
      { sutun: "project_id", kaynak: "projeler" },
      { sutun: "operation_id", kaynak: "operasyonlar" },
      { sutun: "department_id", kaynak: "departmanlar" },
    ],
  },
  {
    tablo: "module_records",
    tip: "kapsam",
    sutun: "organization_id",
    kaynak: "organizasyon",
    kapsamAdi: "modulKayitlari",
  },
  { tablo: "module_record_versions", tip: "kapsam", sutun: "record_id", kaynak: "modulKayitlari" },
  { tablo: "project_posts", tip: "kapsam", sutun: "project_id", kaynak: "projeler" },
  { tablo: "post_comments", tip: "kapsam", sutun: "user_id", kaynak: "kullanicilar" },
  { tablo: "task_comments", tip: "kapsam", sutun: "user_id", kaynak: "kullanicilar" },
  { tablo: "notifications", tip: "kapsam", sutun: "user_id", kaynak: "kullanicilar", yalnizcaDemoAraligi: true },
  { tablo: "personal_todos", tip: "kapsam", sutun: "user_id", kaynak: "kullanicilar" },
];

/** Tek bir silme kuralı: "şu tabloda, şu sütunu şu id'lere bakan satırlar". */
export type SilmeKurali = { tablo: string; sutun: string; kapsam: KapsamAdi };

/**
 * Silme dalgaları. Aynı dalgadaki istekler paralel gider; dalgalar sırayla
 * çalışır ki çocuk satırlar ebeveynlerinden önce silinsin. (Şemadaki yabancı
 * anahtarların çoğu zaten `on delete cascade`, bu sıralama emniyet payı.)
 */
export const SILME_DALGALARI: SilmeKurali[][] = [
  [
    // Ziyaretçi her şeyi demo kullanıcısı olarak yazar; yorum/bildirim gibi
    // "kime ait" bilgisi net olan tablolarda kapsam doğrudan kullanıcıdır.
    { tablo: "task_comments", sutun: "user_id", kapsam: "kullanicilar" },
    { tablo: "post_comments", sutun: "user_id", kapsam: "kullanicilar" },
    { tablo: "module_record_versions", sutun: "approved_by", kapsam: "kullanicilar" },
    { tablo: "notifications", sutun: "user_id", kapsam: "kullanicilar" },
    { tablo: "personal_todos", sutun: "user_id", kapsam: "kullanicilar" },
  ],
  [
    { tablo: "tasks", sutun: "project_id", kapsam: "projeler" },
    { tablo: "tasks", sutun: "operation_id", kapsam: "operasyonlar" },
    { tablo: "tasks", sutun: "department_id", kapsam: "departmanlar" },
    // Rutin motorunun ürettiği yinelenen görevler. AYRI BİR KURAL OLMAK ZORUNDA:
    // tasks üzerinde (routine_id, occurrence_on) tekil kısıtı var, aynı rutin+tarih
    // ikinci kez yazılamıyor. Motorun ürettiği satır dururken anlık görüntüdeki
    // eşdeğerini yazmaya kalkarsak upsert `id` üzerinden çakışmayı göremez ve
    // bütün geri yükleme o noktada patlar.
    { tablo: "tasks", sutun: "routine_id", kapsam: "rutinler" },
    { tablo: "outputs", sutun: "project_id", kapsam: "projeler" },
    { tablo: "project_members", sutun: "project_id", kapsam: "projeler" },
    { tablo: "project_posts", sutun: "project_id", kapsam: "projeler" },
    { tablo: "budget_transactions", sutun: "project_id", kapsam: "projeler" },
    { tablo: "budget_transactions", sutun: "operation_id", kapsam: "operasyonlar" },
    { tablo: "budget_transactions", sutun: "department_id", kapsam: "departmanlar" },
    { tablo: "operation_routines", sutun: "operation_id", kapsam: "operasyonlar" },
    { tablo: "party_contact", sutun: "party_id", kapsam: "cariler" },
    { tablo: "department_members", sutun: "department_id", kapsam: "departmanlar" },
  ],
  [
    { tablo: "projects", sutun: "job_id", kapsam: "isler" },
    { tablo: "operations", sutun: "job_id", kapsam: "isler" },
    { tablo: "job_members", sutun: "job_id", kapsam: "isler" },
  ],
  [
    { tablo: "jobs", sutun: "organization_id", kapsam: "organizasyon" },
    { tablo: "module_records", sutun: "organization_id", kapsam: "organizasyon" },
    { tablo: "module_members", sutun: "organization_id", kapsam: "organizasyon" },
    { tablo: "organization_modules", sutun: "organization_id", kapsam: "organizasyon" },
    { tablo: "party", sutun: "organization_id", kapsam: "organizasyon" },
    { tablo: "products", sutun: "organization_id", kapsam: "organizasyon" },
    { tablo: "departments", sutun: "organization_id", kapsam: "organizasyon" },
  ],
  [
    // Ziyaretçi kendine yeni bir şirket açtıysa o da gitsin.
    { tablo: "organizations", sutun: "owner_id", kapsam: "kullanicilar" },
  ],
];

/**
 * Ebeveyn satır çocuğundan önce gelsin diye sıralar (üst görev → alt görev).
 * Döngüsel ya da eksik referansta sırayı zorlamaz, kalanı olduğu gibi ekler.
 */
export function ebeveynOnce<T extends Record<string, unknown>>(satirlar: T[], sutun: string): T[] {
  const sirali: T[] = [];
  const yazilan = new Set<unknown>();
  let kalan = [...satirlar];
  while (kalan.length) {
    const simdi = kalan.filter((r) => !r[sutun] || yazilan.has(r[sutun]));
    if (simdi.length === 0) {
      sirali.push(...kalan);
      break;
    }
    for (const r of simdi) {
      sirali.push(r);
      yazilan.add(r.id);
    }
    kalan = kalan.filter((r) => !yazilan.has(r.id));
  }
  return sirali;
}
