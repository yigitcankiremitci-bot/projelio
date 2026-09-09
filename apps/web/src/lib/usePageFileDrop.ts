import { useEffect, useState } from "react";
import { readDroppedFiles, type DroppedFile } from "./dropFiles";

/**
 * Sayfanın HER YERİNE bırakılan dosyaları yakalar.
 *
 * NEDEN GEREKLİ: tarayıcının varsayılan davranışı, bırakılan dosyayı yeni
 * sekmede AÇMAK. Kullanıcı dosyalar sayfasındayken kesik çizgili kutucuğu
 * ıskaladığında uygulamadan atılıyor, yüklemesi de kayboluyordu — panelde
 * bir bırakma alanı olması, sayfanın geri kalanının tuzak olmasını engellemiyor.
 *
 * Dinleyici `document` üzerinde ve KABARMA aşamasında: kendi bırakma alanı olan
 * bir bileşen (ör. sosyal medya içerik penceresi) kendi işleyicisinde
 * `stopPropagation()` çağırarak olayı burada tutabilir.
 *
 * Yalnızca gerçek DOSYA sürüklemeleri sayılır: uygulama içinde kart sürüklemek
 * (`text/plain`) yükleme başlatmamalı.
 *
 * KLASÖR de bırakılabilir: ağaç `webkitGetAsEntry` ile geziliyor ve her dosya
 * göreli yoluyla birlikte veriliyor (bkz. lib/dropFiles.ts). Eskiden bırakılan
 * klasör 0 baytlık tek bir dosyaya dönüşüyordu.
 */
export function usePageFileDrop(
  enabled: boolean,
  onFiles: (files: DroppedFile[]) => void
): { dragging: boolean } {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    const dosyaSurukleniyor = (e: DragEvent) =>
      Array.from(e.dataTransfer?.types ?? []).includes("Files");

    // Sürükleme sayacı: alt öğeler arasında gezerken dragleave/dragenter
    // ardarda tetikleniyor ve tek bayrakla göstergeler titriyordu.
    let derinlik = 0;

    const girdi = (e: DragEvent) => {
      if (!dosyaSurukleniyor(e)) return;
      derinlik += 1;
      setDragging(true);
    };

    const uzerinde = (e: DragEvent) => {
      if (!dosyaSurukleniyor(e)) return;
      // preventDefault ŞART: olmadan tarayıcı bırakmayı hiç kabul etmiyor.
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };

    const cikti = (e: DragEvent) => {
      if (!dosyaSurukleniyor(e)) return;
      derinlik = Math.max(0, derinlik - 1);
      if (derinlik === 0) setDragging(false);
    };

    const birakildi = (e: DragEvent) => {
      if (!dosyaSurukleniyor(e)) return;
      e.preventDefault();
      derinlik = 0;
      setDragging(false);
      // Ağaç okuması asenkron; `dataTransfer` olay bittikten sonra boşaldığı
      // için kayıtlar okumanın İÇİNDE, ilk adımda senkron toplanıyor.
      void readDroppedFiles(e.dataTransfer).then((files) => {
        if (files.length) onFiles(files);
      });
    };

    document.addEventListener("dragenter", girdi);
    document.addEventListener("dragover", uzerinde);
    document.addEventListener("dragleave", cikti);
    document.addEventListener("drop", birakildi);
    return () => {
      document.removeEventListener("dragenter", girdi);
      document.removeEventListener("dragover", uzerinde);
      document.removeEventListener("dragleave", cikti);
      document.removeEventListener("drop", birakildi);
    };
  }, [enabled, onFiles]);

  return { dragging };
}
