import type { Translate } from "@projelio/shared";

/**
 * Departman adı ekranda hangi dilde görünsün?
 *
 * Departman adı kullanıcının verisidir ve kural olarak ÇEVRİLMEZ (bkz.
 * backend departments.service.ts `create`: katalogdan açılan departman,
 * açanın dilinde oluşur). Ama iki durumda veritabanında, kimsenin yazmadığı
 * Türkçe varsayılan adlar duruyor:
 *   - herkese açık Çelikhan demosu: veri Türkçe yazıldı, ziyaretçi ise
 *     tanıtım sitesinin /en sayfasından İngilizce arayüzle giriyor — kenar
 *     çubuğunda "İnsan Kaynakları", "Hukuk ve Uyum" görüyordu;
 *   - dil desteğinden önce açılmış departmanlar: katalog adıyla ("İNSAN
 *     KAYNAKLARI") kaydedildi.
 *
 * Bu yüzden YALNIZCA aşağıdaki varsayılan adlar çevriliyor. Kullanıcının
 * değiştirdiği ya da kendi yazdığı bir ad listede olmadığı için aynen kalır.
 */
// dil:anahtar-baslangic
const VARSAYILAN_ADLAR = new Set<string>([
  // Demo verisinin (database/demo/celikhan-demo.json) kullandığı biçim
  "Yönetim",
  "İnsan Kaynakları",
  "Finans ve Muhasebe",
  "Pazarlama ve Büyüme",
  "Satış ve İş Geliştirme",
  "Operasyon ve Üretim",
  "Bilgi Teknolojileri",
  "Ürün Yönetimi",
  "Müşteri İlişkileri",
  "Hukuk ve Uyum",
  // department_catalog'daki adlar (024_departments_and_org_structure.sql)
  "YÖNETİM",
  "İNSAN KAYNAKLARI",
  "FİNANS MUHASEBE",
  "PAZARLAMA ve BÜYÜME",
  "SATIŞ ve İŞ GELİŞTİRME",
  "OPERASYON/ÜRETİM",
  "BİLGİ TEKNOLOJİLERİ/YAZILIM",
  "ÜRÜN YÖNETİMİ",
  "MÜŞTERİ İLİŞKİLERİ",
  "HUKUK ve UYUM",
]);
// dil:anahtar-bitis

export function departmanAdi(ad: string, t: Translate): string;
export function departmanAdi(ad: string | null | undefined, t: Translate): string | undefined;
export function departmanAdi(ad: string | null | undefined, t: Translate): string | undefined {
  if (!ad) return ad ?? undefined;
  const kirpik = ad.trim();
  return VARSAYILAN_ADLAR.has(kirpik) ? t(kirpik) : ad;
}
