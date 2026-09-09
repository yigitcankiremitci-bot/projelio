import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readDroppedFiles, toDroppedFiles } from "./dropFiles";

/** `<input type="file">`in klasör seçiminde verdiği dosya. */
function dosya(name: string, relativePath?: string): File {
  const f = new File(["x"], name);
  if (relativePath) Object.defineProperty(f, "webkitRelativePath", { value: relativePath });
  return f;
}

/** `webkitGetAsEntry()` sonucunun testlik taklidi. */
function fileEntry(name: string) {
  return {
    isFile: true,
    isDirectory: false,
    name,
    file: (ok: (f: File) => void) => queueMicrotask(() => ok(dosya(name))),
  };
}

function dirEntry(name: string, children: any[]) {
  return {
    isFile: false,
    isDirectory: true,
    name,
    createReader: () => {
      let verildi = false;
      return {
        // Gerçek okuyucu gibi: ASENKRON ve ikinci çağrıda boş dizi.
        readEntries: (ok: (batch: any[]) => void) => {
          const batch = verildi ? [] : children;
          verildi = true;
          queueMicrotask(() => ok(batch));
        },
      };
    },
  };
}

function dataTransfer(entries: any[], files: File[] = []): any {
  return {
    items: entries.map((entry) => ({ kind: "file", webkitGetAsEntry: () => entry })),
    files,
  };
}

describe("toDroppedFiles", () => {
  it("klasör seçicisinin verdiği göreli yolu korur", () => {
    const out = toDroppedFiles([dosya("kapak.jpg", "Fotoğraflar/2026/kapak.jpg")]);
    assert.equal(out.length, 1);
    assert.equal(out[0].relativePath, "Fotoğraflar/2026/kapak.jpg");
  });

  it("tek dosya seçiminde göreli yol boş kalır — dosya kapsamın köküne iner", () => {
    assert.equal(toDroppedFiles([dosya("rapor.pdf")])[0].relativePath, undefined);
  });

  it("zaten çözülmüş listeyi olduğu gibi geçirir", () => {
    const hazir = [{ file: dosya("a.txt"), relativePath: "k/a.txt" }];
    assert.deepEqual(toDroppedFiles(hazir), hazir);
  });

  it("boş girdide boş liste döner", () => {
    assert.deepEqual(toDroppedFiles(null), []);
  });
});

describe("readDroppedFiles", () => {
  it("bırakılan klasörün ağacını göreli yollarıyla açar", async () => {
    const agac = dirEntry("Fotoğraflar", [
      fileEntry("kapak.jpg"),
      dirEntry("2026", [fileEntry("ocak.png")]),
    ]);

    const out = await readDroppedFiles(dataTransfer([agac]));

    assert.deepEqual(
      out.map((d) => d.relativePath),
      ["Fotoğraflar/kapak.jpg", "Fotoğraflar/2026/ocak.png"]
    );
  });

  it("kökte bırakılan tek dosyaya yol yazmaz", async () => {
    const out = await readDroppedFiles(dataTransfer([fileEntry("rapor.pdf")]));
    assert.deepEqual(out.map((d) => d.relativePath), [undefined]);
  });

  it("webkitGetAsEntry desteklenmiyorsa düz dosya listesine düşer", async () => {
    // Klasör yüklenemez ama tek dosyalar çalışmaya devam etmeli.
    const out = await readDroppedFiles({ items: [], files: [dosya("a.txt")] } as any);
    assert.deepEqual(out.map((d) => d.file.name), ["a.txt"]);
  });

  it("dataTransfer yoksa boş döner", async () => {
    assert.deepEqual(await readDroppedFiles(null), []);
  });
});
