import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ENTITY_TAB_KEYS, LOCKED_TABS, hideableTabs, sanitizeHiddenTabs } from "./types";

// Kapatılan sekmeler hem sunucuda (kayıttan önce) hem arayüzde (çizmeden önce)
// bu fonksiyondan geçiyor. Yanlış çalışırsa bedeli görünür: sayfa gövdesiz
// açılır ya da kullanıcının kapattığı sekme geri gelir.

describe("sekme görünürlüğü", () => {
  test("tanınmayan anahtar elenir", () => {
    // Eski bir istemci ya da elle kurcalanmış bir istek, artık var olmayan bir
    // sekmeyi kaydedebilir; kayıt yaşar ama ayarlar ekranında hiç görünmez.
    assert.deepEqual(sanitizeHiddenTabs("organization", ["flow", "uydurma"]), ["flow"]);
  });

  test("kilitli sekme (sayfanın açılış sekmesi) kapatılamaz", () => {
    assert.deepEqual(sanitizeHiddenTabs("organization", ["home"]), []);
    assert.deepEqual(sanitizeHiddenTabs("job", ["projects", "team"]), ["team"]);
    assert.deepEqual(sanitizeHiddenTabs("project", ["tasks"]), []);
  });

  test("tekrarlar tekilleşir", () => {
    assert.deepEqual(sanitizeHiddenTabs("department", ["files", "files"]), ["files"]);
  });

  test("dizi olmayan değer boş listeye düşer", () => {
    // Kolon henüz yoksa (migration uygulanmadan) satırda undefined geliyor;
    // asistan/panel durmak yerine "hiçbir sekme kapalı değil" demeli.
    assert.deepEqual(sanitizeHiddenTabs("department", undefined), []);
    assert.deepEqual(sanitizeHiddenTabs("department", "flow"), []);
    assert.deepEqual(sanitizeHiddenTabs("department", null), []);
  });

  test("hepsini gizleyen liste yok sayılır", () => {
    // Departmanda kilitli sekme YOK, yani teoride hepsi kapatılabilir; geriye
    // gövdesiz bir sayfa kalırdı.
    assert.deepEqual(sanitizeHiddenTabs("department", ENTITY_TAB_KEYS.department), []);
  });

  test("kilitli sekmeler gerçekten çubuktaki anahtarlardan biri", () => {
    // Yazım hatası olan bir kilit sessizce hiçbir şeyi korumaz: o sekme
    // kapatılabilir hale gelir ve sayfa açılış sekmesini kaybeder.
    for (const scope of Object.keys(LOCKED_TABS) as (keyof typeof LOCKED_TABS)[]) {
      for (const key of LOCKED_TABS[scope]) {
        assert.ok(ENTITY_TAB_KEYS[scope].includes(key), `${scope}: ${key} çubukta yok`);
      }
      assert.ok(hideableTabs(scope).length > 0, `${scope}: kapatılabilir sekme kalmadı`);
    }
  });
});
