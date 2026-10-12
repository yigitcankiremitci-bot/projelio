/**
 * Çekirdek modüller: katalogda modül olarak duran ama verisi uygulamanın
 * kendi sekmelerinde yaşayan beşli (proje, program, görev, çıktı, dosya).
 *
 * Bkz. docs/moduller/01-modul-arketip-eslesmesi.md — "Çekirdek — modül değil".
 * Kendi panelleri YOK ve olmayacak; ama kart olarak listelendikleri her yerde
 * tıklanabilir olmalılar. Eskiden açılabilir sayılmadıkları için kart ölü
 * duruyordu — kullanıcı modülün bozuk olduğunu sanıyordu. Artık tıklanınca
 * bulundukları sayfanın ilgili sekmesine gidiyorlar.
 */

const IS_SEKMESI: Record<string, string> = {
  yonetim_proje_yonetimi: "projects",
  yonetim_program_yonetimi: "programs",
  yonetim_gorev_yonetimi: "tasks",
  // Çıktılar projelerin içinde.
  yonetim_cikti_yonetimi: "projects",
  yonetim_dosya_yonetimi: "files",
};

// Departmanda proje/program sekmesi yok: işler Görevler sekmesinde.
const DEPARTMAN_SEKMESI: Record<string, string> = {
  yonetim_proje_yonetimi: "tasks",
  yonetim_program_yonetimi: "tasks",
  yonetim_gorev_yonetimi: "tasks",
  yonetim_cikti_yonetimi: "tasks",
  yonetim_dosya_yonetimi: "files",
};

export function isCekirdekModul(moduleKey: string): boolean {
  return moduleKey in IS_SEKMESI;
}

/** Çekirdek modülün açıldığı yer; kapsam bilinmiyorsa null. */
export function cekirdekModulAdresi(
  moduleKey: string,
  kapsam: { departmentId?: string; jobId?: string }
): string | null {
  if (kapsam.jobId && IS_SEKMESI[moduleKey]) return `/jobs/${kapsam.jobId}?tab=${IS_SEKMESI[moduleKey]}`;
  if (kapsam.departmentId && DEPARTMAN_SEKMESI[moduleKey]) {
    return `/departments/${kapsam.departmentId}?tab=${DEPARTMAN_SEKMESI[moduleKey]}`;
  }
  return null;
}
