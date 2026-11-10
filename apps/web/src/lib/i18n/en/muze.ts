import type { TranslationDict } from "@projelio/shared";

/**
 * Müze (pages/Muze.tsx, components/muze/) ve Arşiv > Biten projeler: biten
 * projelerin değiştirilemez plaketleri.
 */
export const muze: TranslationDict = {
  "Müze": "Museum",
  "Müzeye git": "Go to the museum",
  "Arşive git": "Go to the archive",
  "Arşivde aç": "Open in the archive",
  "Projelio Müzesi": "Projelio Museum",
  "Biten projelerin plaketleri. Her plaket projenin bittiği anın kopyasıdır ve değiştirilemez; projenin düzenlenebilir hâli Arşiv'de.":
    "Plaques of finished projects. Each plaque is a copy of the moment the project was finished and can't be changed; the editable project lives in the Archive.",
  "Müze yüklenemedi. Sayfayı yenileyip tekrar dene.": "The museum couldn't be loaded. Refresh the page and try again.",
  "Müzede henüz plaket yok. Bir projeyi tamamladığında plaketi burada yerini alır.":
    "No plaques in the museum yet. When you complete a project, its plaque takes its place here.",
  "{n} proje": { one: "{n} project", other: "{n} projects" },
  "{n} kişinin emeği": { one: "the work of {n} person", other: "the work of {n} people" },
  "{n} görev": { one: "{n} task", other: "{n} tasks" },
  "{n} çıktı": { one: "{n} deliverable", other: "{n} deliverables" },
  "{n} paylaşım": { one: "{n} post", other: "{n} posts" },
  "toplam {n} gün": { one: "{n} day in total", other: "{n} days in total" },
  "Tüm işler": "All jobs",
  "Tüm yıllar": "All years",
  "{ad} plaketini aç": "Open the plaque for {ad}",
  "{n} gün sürdü": { one: "Took {n} day", other: "Took {n} days" },
  "Teslim gününde bitti": "Finished on the due date",
  "Teslimden {n} gün önce bitti": { one: "Finished {n} day before the due date", other: "Finished {n} days before the due date" },
  "Teslimden {n} gün sonra bitti": { one: "Finished {n} day after the due date", other: "Finished {n} days after the due date" },
  "Emeği geçenler": "Made by",
  "Eski ekip üyesi": "Former team member",
  "Bu şirketin {n}. tamamlanan projesi": "This company's completed project no. {n}",
  "Bu işin {n}. tamamlanan projesi": "This job's completed project no. {n}",
  "Bu proje müzeden önce bittiği için bitiş tarihi son biten görevden tahmin edildi.":
    "This project finished before the museum existed, so its end date was estimated from its last completed task.",
  "Proje sonradan yeniden açıldı; plaket bittiği günkü hâliyle duruyor.":
    "The project was reopened later; the plaque stays as it was on the day it finished.",
  "Biten projeler": "Completed projects",
  "Tamamlanan projelerin düzenlenebilir hâli. Burada yaptığın değişiklikler müzedeki plakete yansımaz.":
    "The editable versions of completed projects. Changes you make here don't affect the plaque in the museum.",
  "Henüz tamamlanan proje yok.": "No completed projects yet.",
  "{tarih} tarihinde bitti": "Finished on {tarih}",
  "Plaket": "Plaque",
  "Arşivlenenler": "Archived items",
  "Sildiğin yerine arşive eklediklerin. Geri getirebilir ya da kalıcı olarak silebilirsin.":
    "Things you archived instead of deleting. You can restore them or delete them permanently.",
};
