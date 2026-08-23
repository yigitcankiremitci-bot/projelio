// Backend tsconfig'inde esModuleInterop kapalı (NestJS CommonJS derlemesi
// gereği), bu yüzden namespace import kullanılıyor.
import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { removeStaleUploadsInFolder, splitObjectPath } from "./public-upload.util";

// Riskli olan taraf silme: yanlış dosyayı silmek kullanıcının kapağını uçurur.
// Bu yüzden "az önce yüklenen korunuyor mu" ve "kovanın kökü temizlenmiyor mu"
// sabitleniyor.

function fakeClient(entries: string[], removed: string[][]) {
  return {
    storage: {
      from() {
        return {
          list: async () => ({ data: entries.map((name) => ({ name })), error: null }),
          remove: async (paths: string[]) => {
            removed.push(paths);
            return { error: null };
          },
        };
      },
    },
  } as any;
}

describe("splitObjectPath", () => {
  test("klasör ve dosya adını ayırır", () => {
    assert.deepEqual(splitObjectPath("abc/def.png"), { folder: "abc", fileName: "def.png" });
    assert.deepEqual(splitObjectPath("operations/abc/def.png"), { folder: "operations/abc", fileName: "def.png" });
  });

  test("klasörsüz yolda klasör boştur", () => {
    assert.deepEqual(splitObjectPath("def.png"), { folder: "", fileName: "def.png" });
  });
});

describe("removeStaleUploadsInFolder", () => {
  test("az önce yüklenen dosya silinmez, diğerleri silinir", async () => {
    const removed: string[][] = [];
    await removeStaleUploadsInFolder(fakeClient(["eski1.png", "eski2.png", "yeni.png"], removed), "kova", "u1/yeni.png");
    assert.deepEqual(removed, [["u1/eski1.png", "u1/eski2.png"]]);
  });

  test("silinecek bir şey yoksa remove hiç çağrılmaz", async () => {
    const removed: string[][] = [];
    await removeStaleUploadsInFolder(fakeClient(["yeni.png"], removed), "kova", "u1/yeni.png");
    assert.deepEqual(removed, []);
  });

  test("klasörsüz yolda hiçbir şey silinmez (kovanın kökü temizlenmesin)", async () => {
    const removed: string[][] = [];
    await removeStaleUploadsInFolder(fakeClient(["a.png", "b.png"], removed), "kova", "yeni.png");
    assert.deepEqual(removed, []);
  });
});
