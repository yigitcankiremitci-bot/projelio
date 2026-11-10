/**
 * Kullanıcılara açık modüller (kullanıcı kararı, 2026-11-10).
 *
 * Katalogda 50'den fazla modül var ama çoğu 3-7 alanlı genel bir kayıt
 * listesi: açan kişi "bu mu?" deyip bırakıyordu ve ürünün geri kalanı da bu
 * yarım modüllerle ölçülüyordu. Artık yalnızca kendi ekranı olan, gerçekten
 * geliştirilmiş modüller kullanıcılara açık. Gerisi ("pasif") silinmedi:
 * katalogda ve verisiyle birlikte duruyor, yalnızca platform yöneticileri
 * (users.role = 'admin') görüp açabiliyor — geliştirilmeye devam etsin diye.
 * Bir modül olgunlaşınca buraya eklenmesi yeter; migration gerekmez.
 *
 * Pasif modülü önceden açmış şirketin verisi silinmez ama erişimi kapanır:
 * katalogda, şirketin modül listesinde ve kayıt uçlarında görünmez
 * (sunucuda ModuleMembersService.resolve*Access, CatalogService,
 * OrganizationModulesService, JobModulesService).
 */
export const AKTIF_MODULLER: ReadonlySet<string> = new Set([
  // Kendi paneli olan modüller
  "crm_musteri",
  "baglantilar",
  "uyd_urunler",
  "pd_sosyal_medya",
  "pd_email",
  "hesaplar",
  "ekip_hesaplari",
  "oud_tedarik",
  "fm_fatura",
  // Çekirdek: verisi işin/departmanın/şirketin kendi sekmesinde
  "yonetim_proje_yonetimi",
  "yonetim_program_yonetimi",
  "yonetim_gorev_yonetimi",
  "yonetim_cikti_yonetimi",
  "yonetim_dosya_yonetimi",
]);

/**
 * Katalogda görünmeyen ama başka bir ekranın İÇİNDE yaşayan modüller: kendi
 * başına eklenmez, verisi her şirkette çalışmaya devam etmeli.
 * - fm_alacak_borc: şirketin Bütçe sekmesindeki Alacak-Borç bölümü
 * - pd_urun_stratejileri: ürün kartının Strateji bölümü (shared urunIliskileri.ts)
 */
export const GOMULU_MODULLER: ReadonlySet<string> = new Set(["fm_alacak_borc", "pd_urun_stratejileri"]);

/** Herkes erişebilir mi (kayıt okuma/yazma). */
export function modulAktifMi(moduleKey: string): boolean {
  return AKTIF_MODULLER.has(moduleKey) || GOMULU_MODULLER.has(moduleKey);
}

/** Pasif modüller yalnızca platform yöneticisine açık. */
export function modulErisilebilirMi(moduleKey: string, kullaniciRolu: string | null | undefined): boolean {
  return modulAktifMi(moduleKey) || kullaniciRolu === "admin";
}

/** Katalogda (Modül ekle, listeler) görünür mü. Gömülü modüller kendi başına eklenmez. */
export function katalogdaGorunurMu(moduleKey: string, kullaniciRolu: string | null | undefined): boolean {
  return AKTIF_MODULLER.has(moduleKey) || kullaniciRolu === "admin";
}
