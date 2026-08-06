// Departman kataloğundaki 10 standart departmanın varsayılan kapak fotoğrafları
// (apps/web/public/department-covers/*.jpg). Kullanıcı özel bir kapak
// yüklemediyse (Department.coverImageUrl boşsa) burası kullanılır; özel kapak
// kaldırılırsa (backend cover_image_url'i null'a çeker) otomatik olarak buraya
// geri dönülür — ayrıca bir "restore" mantığı gerekmez.
//
// Not: "lojistik" için henüz ayrı bir departman/kapak yok, "bilgi_teknolojileri_yazilim"
// kataloğuna eklenmedi (kullanıcı ayrıca bir Lojistik departmanı ekleyecek).
const DEFAULT_DEPARTMENT_COVERS: Record<string, string> = {
  yonetim: "/department-covers/yonetim.jpg",
  insan_kaynaklari: "/department-covers/insan_kaynaklari.jpg",
  finans_muhasebe: "/department-covers/finans_muhasebe.jpg",
  pazarlama_buyume: "/department-covers/pazarlama_buyume.jpg",
  satis_is_gelistirme: "/department-covers/satis_is_gelistirme.jpg",
  operasyon_uretim: "/department-covers/operasyon_uretim.jpg",
  bilgi_teknolojileri_yazilim: "/department-covers/bilgi_teknolojileri_yazilim.jpg",
  urun_yonetimi: "/department-covers/urun_yonetimi.jpg",
  musteri_iliskileri: "/department-covers/musteri_iliskileri.jpg",
  hukuk_uyum: "/department-covers/hukuk_uyum.jpg",
};

// Departmanın gösterilecek kapak fotoğrafı: özel kapak varsa o, yoksa
// catalogKey'e göre varsayılan (o da yoksa undefined — özel/custom departmanların
// standart bir varsayılanı yok).
export function getDepartmentCoverUrl(department: { coverImageUrl?: string; catalogKey?: string }): string | undefined {
  if (department.coverImageUrl) return department.coverImageUrl;
  return department.catalogKey ? DEFAULT_DEPARTMENT_COVERS[department.catalogKey] : undefined;
}

// Bu departmanda kullanıcının yüklediği ÖZEL bir kapak var mı — "varsayılana
// dön" seçeneğinin gösterilip gösterilmeyeceğine karar vermek için kullanılır.
export function hasCustomDepartmentCover(department: { coverImageUrl?: string }): boolean {
  return Boolean(department.coverImageUrl);
}
