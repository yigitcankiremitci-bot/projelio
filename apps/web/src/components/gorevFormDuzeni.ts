import type { CSSProperties } from "react";

/**
 * Görev düzenleme formlarının ortak düzeni — proje görevi (TaskEditModal) ile
 * kişisel görev (PersonalTodoModal) aynı iskeleti kullanıyor. İki ayrı kopya
 * tutulduğunda kişisel görev penceresi başka bir ekran gibi görünüyordu.
 */

/**
 * İki sütunlu form satırı (tarihler, saat/hatırlatma, ekip/bütçe).
 *
 * NEDEN sabit bir kırılma noktası (useIsDesktop) değil: bu satırların
 * genişliğini pencere değil MODALİN kendisi belirliyor — dar ekranda tam ekran,
 * geniş ekranda 1280 px'e kadar. Sarma (wrap) modalin o anki genişliğine göre
 * kendiliğinden karar verir; iki göz yan yana sığmadığı anda alt alta geçerler.
 */
export const twoColumnRow: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 10 };

/**
 * O satırların tek bir gözü.
 *
 * `minWidth: 0` ŞART: flex gözleri varsayılan olarak `min-width: auto` alır,
 * yani içindeki alanın asgari genişliğinin altına inemezler. Telefonda tarih
 * alanının asgari genişliği (177 px) gözün payına düşenden büyük olduğu için
 * satır dışarı taşıyor, modal yatay kaydırılır hale geliyor ve alanlar üst üste
 * binmiş gibi görünüyordu.
 *
 * 190 px'lik taban ölçü de bu asgari genişliklerden geliyor: iki tarih alanı
 * ancak bu kadar yer bulunca yan yana durabiliyor, bulamayınca satır sarıyor.
 */
export const halfField: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  flex: "1 1 190px",
  minWidth: 0,
};
