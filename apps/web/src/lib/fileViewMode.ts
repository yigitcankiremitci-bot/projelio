import { useCallback, useState } from "react";

const GORUNUM_ANAHTARI = "projelio.dosya-gorunumu";

export type FileViewMode = "list" | "grid";

/**
 * Liste/simge tercihi — bütün dosya ekranları için TEK anahtar.
 *
 * Tarayıcıda saklanıyor: kullanıcı bir kez liste görünümünü seçtiyse her
 * sayfada yeniden seçmek zorunda kalmasın. Sunucuya taşımak için fazla
 * önemsiz bir tercih.
 *
 * VARSAYILAN SİMGE: dosyaların çoğu görsel ve artık önizlemeleri var
 * (bkz. lib/fileThumbnails.ts); liste görünümünde 34 pikselik kareye sıkışan
 * önizleme "hangi görsel bu?" sorusunu cevaplamıyor.
 */
function oku(): FileViewMode {
  try {
    return localStorage.getItem(GORUNUM_ANAHTARI) === "list" ? "list" : "grid";
  } catch {
    // Gizli sekmede / depolama kapalıyken erişim hata fırlatabiliyor.
    return "grid";
  }
}

export function useFileViewMode(): [FileViewMode, () => void] {
  const [mode, setMode] = useState<FileViewMode>(oku);

  const toggle = useCallback(() => {
    setMode((prev) => {
      const sonraki = prev === "grid" ? "list" : "grid";
      try {
        localStorage.setItem(GORUNUM_ANAHTARI, sonraki);
      } catch {
        // Depolama kapalıysa tercih oturumluk kalır; işlevi bozmaz.
      }
      return sonraki;
    });
  }, []);

  return [mode, toggle];
}
