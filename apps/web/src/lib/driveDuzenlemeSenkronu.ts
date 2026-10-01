import { useCallback, useEffect, useRef } from "react";
import type { ProjectFile } from "@projelio/shared";
import { filesApi } from "../api/files";
import { driveEditUrl } from "./driveLinks";

/**
 * "Drive'da düzenle" ile açılan dosyaların künyesini, kullanıcı Projelio
 * sekmesine döndüğünde buluttan tazeler.
 *
 * Dosya sağlayıcının kendi editöründe açılıyor ve kullanıcı adını orada
 * değiştirebiliyor; Projelio'nun kaydı bundan habersizdi ve listede ilk
 * verilen ad kalıyordu. Yalnızca bu bileşenden düzenlemeye açılan dosyalar
 * izlenir — listedeki her dosyayı her dönüşte sormak gereksiz istek olurdu.
 *
 * Dönüşte hem `focus` hem `visibilitychange` geliyor; ikisi aynı isteği iki
 * kez atmasın diye kısa bir aralık içindeki ikinci tetik yok sayılır.
 */
export function useDriveDuzenlemeSenkronu(onGuncellendi: (file: ProjectFile) => void) {
  const izlenen = useRef(new Set<string>());
  const sonTazeleme = useRef(0);
  const geriCagri = useRef(onGuncellendi);
  geriCagri.current = onGuncellendi;

  useEffect(() => {
    const tazele = () => {
      if (document.visibilityState === "hidden" || izlenen.current.size === 0) return;
      const simdi = Date.now();
      if (simdi - sonTazeleme.current < 1500) return;
      sonTazeleme.current = simdi;
      for (const id of izlenen.current) {
        filesApi
          .syncFromCloud(id)
          .then((file) => geriCagri.current(file))
          // Dosya silinmiş ya da erişim kalkmışsa izlemeyi bırak; kayıt
          // zaten sunucuda "eksik" işaretlendi, liste kendi yolundan görür.
          .catch(() => izlenen.current.delete(id));
      }
    };
    window.addEventListener("focus", tazele);
    document.addEventListener("visibilitychange", tazele);
    return () => {
      window.removeEventListener("focus", tazele);
      document.removeEventListener("visibilitychange", tazele);
    };
  }, []);

  /** Dosyayı sağlayıcının editöründe yeni sekmede açar ve izlemeye alır. */
  return useCallback((file: ProjectFile) => {
    izlenen.current.add(file.id);
    window.open(driveEditUrl(file), "_blank", "noopener,noreferrer");
  }, []);
}
