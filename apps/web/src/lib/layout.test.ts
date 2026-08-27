import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { DRAWER_MAX_WIDTH, DRAWER_MIN_SCRIM, TOP_CHROME, TOP_CHROME_BOTTOM, Z } from "./layout";

// Bu testler görünüşü değil KATMAN SIRASINI sabitler. Sıra bozulduğunda ortaya
// çıkan hata her ekranda görünmüyor: telefonda çekmece açıkken bildirim çanının
// çekmecenin kapatma düğmesinin üstüne binmesi gibi, yalnızca belirli bir
// genişlikte fark ediliyor ve ancak kullanıcının ekran görüntüsüyle anlaşılıyor.

describe("sabit katman sırası", () => {
  test("telefondaki çekmece BÜTÜN uygulama süslerinin üstünde", () => {
    // Ayıklanan hata tam olarak buydu: çan (40) ve Lio balonu (45) çekmecenin
    // (38) üstünde kalıyor, dar ekranda üst üste biniyorlardı.
    for (const [name, value] of [
      ["topChrome", Z.topChrome],
      ["aiLauncher", Z.aiLauncher],
      ["presenceStrip", Z.presenceStrip],
      ["bottomNav", Z.bottomNav],
      ["stickyHeader", Z.stickyHeader],
    ] as const) {
      assert.ok(Z.drawerScrim > value, `${name} (${value}) çekmece karartmasının üstünde kalıyor`);
    }
    assert.ok(Z.drawer > Z.drawerScrim, "çekmece kendi karartmasının üstünde olmalı");
  });

  test("sağ üst düğmeler kaydırma şeridinin ve üst maskenin üstünde", () => {
    // Şerit çanı örterse kullanıcı bildirimlerine kaydırdıktan sonra erişemez.
    assert.ok(Z.topChrome > Z.stickyHeader);
    assert.ok(Z.stickyHeader > Z.headerMask);
  });

  test("pencereler ve geri-al bildirimi her şeyin üstünde", () => {
    for (const value of [Z.drawer, Z.aiPanel, Z.aiActivity, Z.topChrome]) {
      assert.ok(Z.modal > value, `pencere ${value} katmanının altında kalıyor`);
    }
    assert.ok(Z.filePreview > Z.aiPanel, "dosya önizlemesi Lio panelinin üstünde açılmalı");
    assert.ok(Z.undoToast > Z.filePreview);
    assert.ok(Z.onboarding > Z.undoToast);
  });

  test("Lio paneli çekmecenin üstünde — en son açılan yüzey", () => {
    assert.ok(Z.aiPanelScrim > Z.drawer);
    assert.ok(Z.aiPanel > Z.aiPanelScrim);
  });
});

describe("dar ekran ölçüleri", () => {
  test("en dar telefonda bile çekmecenin yanında dokunulabilir bir şerit kalır", () => {
    // 320 px, hâlâ karşılaşılan en dar ekran (küçük Android / eski iPhone SE).
    const narrowest = 320;
    const width = Math.min(DRAWER_MAX_WIDTH, narrowest - DRAWER_MIN_SCRIM);
    assert.ok(narrowest - width >= 44, "çekmeceyi kapatmak için dokunulacak alan 44 px'in altına düşmemeli");
  });

  test("sağ üst bandın alt sınırı düğme ölçülerinden türer", () => {
    // Kapak bileşenleri bu değere göre yer bırakıyor; elle yazılmış bir 62
    // kalırsa düğme büyüdüğünde yalnızca bazı sayfalar düzelir.
    assert.ok(TOP_CHROME_BOTTOM > TOP_CHROME.top + TOP_CHROME.size);
  });
});
