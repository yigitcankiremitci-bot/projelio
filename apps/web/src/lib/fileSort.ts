import { useCallback, useState } from "react";

/**
 * Dosya listelerinde arama ve sıralama — iki dosya ekranı (FilesPanel,
 * AllFilesPanel) aynı kuralları kullansın diye tek yerde.
 *
 * Sunucuya gitmiyor: liste zaten ekranda, sıralamak için yeniden istek atmak
 * yalnızca gecikme eklerdi. Saf fonksiyonlar test ediliyor (fileSort.test.ts).
 */

export type FileSortKey = "date-desc" | "date-asc" | "name-asc" | "name-desc" | "size-desc" | "size-asc";

/**
 * Seçim kutusundaki sıra. Etiketler bileşende (FileListControls): çeviri
 * denetimi yalnızca `t("…")` biçimindeki sabit metinleri görüyor.
 */
export const FILE_SORT_KEYS: FileSortKey[] = ["date-desc", "date-asc", "name-asc", "name-desc", "size-desc", "size-asc"];

interface SortableFile {
  name: string;
  createdAt: string;
  sizeBytes?: number;
}

// "tr" karşılaştırması: İ/ı ve Ç/Ş doğru yere düşsün; numeric: "dosya2" "dosya10"dan önce gelsin.
const karsilastir = new Intl.Collator("tr", { sensitivity: "base", numeric: true });

export function sortFiles<T extends SortableFile>(files: T[], key: FileSortKey): T[] {
  const out = [...files];
  const ada = (a: T, b: T) => karsilastir.compare(a.name, b.name);
  switch (key) {
    case "date-desc":
      return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : ada(a, b)));
    case "date-asc":
      return out.sort((a, b) => (a.createdAt > b.createdAt ? 1 : a.createdAt < b.createdAt ? -1 : ada(a, b)));
    case "name-asc":
      return out.sort(ada);
    case "name-desc":
      return out.sort((a, b) => ada(b, a));
    // Boyutu bilinmeyen dosya (Google Dokümanlar'ın boyutu yok) her iki yönde
    // de SONA düşer: "en küçük" başında boyutsuz dosyalar görmek yanıltıcı.
    case "size-desc":
    case "size-asc": {
      const yon = key === "size-desc" ? -1 : 1;
      return out.sort((a, b) => {
        if (a.sizeBytes == null && b.sizeBytes == null) return ada(a, b);
        if (a.sizeBytes == null) return 1;
        if (b.sizeBytes == null) return -1;
        return a.sizeBytes === b.sizeBytes ? ada(a, b) : (a.sizeBytes - b.sizeBytes) * yon;
      });
    }
  }
}

/** Klasörlerin tarihi/boyutu yok; yalnızca ad yönü uygulanır. */
export function sortFolders<T extends { name: string }>(folders: T[], key: FileSortKey): T[] {
  const tersine = key === "name-desc";
  return [...folders].sort((a, b) => (tersine ? -1 : 1) * karsilastir.compare(a.name, b.name));
}

/**
 * Arama normalizasyonu: büyük/küçük harf ve Türkçe aksanlar önemsiz.
 * "ı" NFD'de ayrışmadığı için elle "i"ye çevriliyor; aksi halde "Işık" adı
 * klavyesi Türkçe olmayan birinin yazdığı "isik" aramasıyla eşleşmezdi.
 */
export function normalizeSearch(text: string): string {
  return text
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .trim();
}

/** Boşlukla ayrılmış her kelime adda geçmeli (sıra önemsiz). */
export function matchesSearch(name: string, query: string): boolean {
  const q = normalizeSearch(query);
  if (!q) return true;
  const ad = normalizeSearch(name);
  return q.split(/\s+/).every((parca) => ad.includes(parca));
}

const SIRA_ANAHTARI = "projelio.dosya-sirasi";

function oku(): FileSortKey {
  try {
    const kayitli = localStorage.getItem(SIRA_ANAHTARI);
    return FILE_SORT_KEYS.includes(kayitli as FileSortKey) ? (kayitli as FileSortKey) : "date-desc";
  } catch {
    return "date-desc";
  }
}

/** Sıralama tercihi — görünüm tercihi gibi bütün dosya ekranlarında ortak (bkz. fileViewMode.ts). */
export function useFileSort(): [FileSortKey, (key: FileSortKey) => void] {
  const [key, setKey] = useState<FileSortKey>(oku);
  const degistir = useCallback((sonraki: FileSortKey) => {
    setKey(sonraki);
    try {
      localStorage.setItem(SIRA_ANAHTARI, sonraki);
    } catch {
      // Depolama kapalıysa tercih oturumluk kalır.
    }
  }, []);
  return [key, degistir];
}
