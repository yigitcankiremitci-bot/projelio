/**
 * Sürükleyip bırakılan dosyalar — KLASÖRLER DAHİL.
 *
 * NEDEN GEREKLİ: `dataTransfer.files` bir klasör bırakıldığında işe yaramıyor.
 * Tarayıcı klasörü 0 baytlık, türsüz tek bir "dosya" gibi gösteriyor; yükleme
 * ya boş bir dosya üretiyor ya da sağlayıcıda hataya düşüyordu. Kullanıcı için
 * sonuç netti: "klasör yüklenemiyor".
 *
 * Klasörün içine ancak `DataTransferItem.webkitGetAsEntry()` ile bakılabiliyor.
 * Standart dışı ama Chrome/Safari/Firefox'ta çalışan tek yol — `webkitdirectory`
 * girdisiyle aynı durum (bkz. FilesPanel'deki klasör seçici).
 */

export interface DroppedFile {
  file: File;
  /**
   * Ağaçtaki göreli yol ("Fotoğraflar/2026/kapak.jpg"). Klasör yüklemesinde
   * sunucu eksik klasörleri buna bakarak kuruyor
   * (bkz. FilesService.ensureUserFolderPath); tek dosyada boş kalır.
   */
  relativePath?: string;
}

/** Bozuk/kötü niyetli bir ağacın tarayıcıyı kilitlememesi için üst sınırlar. */
const MAX_DEPTH = 12;
const MAX_FILES = 500;

/** `FileSystemDirectoryReader` bir seferde en fazla 100 kayıt veriyor; bitene kadar okunur. */
function readAllEntries(reader: any): Promise<any[]> {
  return new Promise((resolve) => {
    const hepsi: any[] = [];
    const oku = () =>
      reader.readEntries(
        (batch: any[]) => {
          if (!batch.length) return resolve(hepsi);
          hepsi.push(...batch);
          oku();
        },
        // Okuma hata verirse elde olanla devam: yarım bir ağaç, hiç ağaç olmamasından iyi.
        () => resolve(hepsi)
      );
    oku();
  });
}

function entryFile(entry: any): Promise<File | null> {
  return new Promise((resolve) => entry.file((f: File) => resolve(f), () => resolve(null)));
}

async function walk(entry: any, prefix: string, out: DroppedFile[], depth: number): Promise<void> {
  if (!entry || out.length >= MAX_FILES) return;

  if (entry.isFile) {
    const file = await entryFile(entry);
    if (file) out.push({ file, relativePath: prefix ? `${prefix}/${file.name}` : undefined });
    return;
  }

  if (entry.isDirectory && depth < MAX_DEPTH) {
    const altKlasor = prefix ? `${prefix}/${entry.name}` : entry.name;
    for (const child of await readAllEntries(entry.createReader())) {
      await walk(child, altKlasor, out, depth + 1);
      if (out.length >= MAX_FILES) return;
    }
  }
}

/**
 * Bırakılan öğeleri (dosya ve klasör) düz bir listeye çevirir.
 *
 * `webkitGetAsEntry()` bırakma olayı işlenirken SENKRON çağrılmalı: `items`
 * listesi olay bittikten sonra boşalıyor. Bu yüzden önce kayıtlar toplanır,
 * ağaç sonra gezilir.
 */
export async function readDroppedFiles(dataTransfer: DataTransfer | null): Promise<DroppedFile[]> {
  if (!dataTransfer) return [];

  const entries: any[] = [];
  for (const item of Array.from(dataTransfer.items ?? [])) {
    if (item.kind !== "file") continue;
    const entry = (item as any).webkitGetAsEntry?.();
    if (entry) entries.push(entry);
  }

  // Tarayıcı `items`/`webkitGetAsEntry` desteklemiyorsa eski yola düş: klasör
  // yüklenemez ama tek dosyalar çalışmaya devam eder.
  if (!entries.length) return Array.from(dataTransfer.files ?? []).map((file) => ({ file }));

  const out: DroppedFile[] = [];
  for (const entry of entries) await walk(entry, "", out, 0);
  return out;
}

/** `<input type="file">` seçimi ile bırakma sonucunu tek biçime indirger. */
export function toDroppedFiles(selected: FileList | File[] | DroppedFile[] | null): DroppedFile[] {
  if (!selected) return [];
  const list = Array.from(selected as ArrayLike<File | DroppedFile>);
  return list.map((item) =>
    item instanceof File
      ? // Klasör SEÇİCİSİNDE göreli yolu tarayıcı dosyanın kendisine yazıyor.
        { file: item, relativePath: (item as File & { webkitRelativePath?: string }).webkitRelativePath || undefined }
      : item
  );
}
