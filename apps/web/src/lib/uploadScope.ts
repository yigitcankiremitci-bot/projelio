import type { FileContext, UploadTarget } from "../api/files";

/**
 * Yüklemenin "nereye ait olduğu" anahtarı.
 *
 * Köşedeki tepsi (UploadTray) bütün yüklemeleri gösteriyor; dosya listesi ise
 * yalnızca KENDİ hedefininkileri. Ayrımı bu anahtar yapıyor — yanlış üretilirse
 * bir görevin ekleri projenin genel dosya listesinde belirir ya da tersi olur,
 * ve bu sessizce yanlış görünür.
 *
 * Kuyruğun kendisinden (lib/uploadQueue) ayrı bir dosyada: kuyruk api/files'ı
 * çağırıyor, o da tarayıcıya özel `import.meta.env`'e dokunuyor. Anahtar saf
 * olduğu için burada test edilebiliyor.
 */
export function uploadScope(
  target: UploadTarget,
  context: Omit<FileContext, "projectId"> = {}
): string {
  const base =
    "jobId" in target
      ? `job:${target.jobId}`
      : "projectId" in target
        ? `project:${target.projectId}`
        : `department:${target.departmentId}`;
  return [
    base,
    context.taskId ? `task:${context.taskId}` : "",
    context.outputId ? `output:${context.outputId}` : "",
  ]
    .filter(Boolean)
    .join("|");
}
