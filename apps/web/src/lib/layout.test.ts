import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  AI_PANEL_WIDTH,
  DRAWER_MAX_WIDTH,
  DRAWER_MIN_SCRIM,
  LIO_LAUNCHER,
  lioActivityAnchor,
  TOP_CHROME,
  TOP_CHROME_BOTTOM,
  Z,
  COVER_TOP_CLEARANCE,
  STICKY_TOP_ROW,
  BOTTOM_NAV_HEIGHT,
  lioBottomCss,
} from "./layout";

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

/**
 * Ölçüler artık CSS dizesi olabiliyor ("calc(184px + env(safe-area-inset-bottom))"):
 * `env()` yalnızca tarayıcıda çözülür, testte baştaki px değerine bakılır.
 */
function pxDegeri(css?: string | number): number {
  if (typeof css === "number") return css;
  const m = String(css ?? "").match(/(-?\d+(?:\.\d+)?)px/);
  return m ? Number(m[1]) : NaN;
}

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

  test("kapak, yüzen düğmelerin ve geri hapının bandını boş bırakır", () => {
    // 1. Sol üstteki logo/kenar çubuğu oku ile çakışmamalı.
    assert.ok(
      COVER_TOP_CLEARANCE >= TOP_CHROME_BOTTOM,
      "kapak yazısı sağ/sol üstteki sabit düğmelerin bandına giriyor"
    );
    // 2. Sayfanın kendi geri bağlantısı, yüzen hapın devraldığı çizginin ALTINDA
    //    doğmalı; yoksa hap sayfa hiç kaydırılmadan açılıp başlığın üstüne oturur.
    assert.ok(
      COVER_TOP_CLEARANCE > STICKY_TOP_ROW,
      "kapak bağlantısı devir çizgisinin üstünde doğuyor: hap en tepede de açık kalır"
    );
  });

  test("telefonda Lio balonu alt menünün üstünde kalır", () => {
    // Menünün gerçek yüksekliği BOTTOM_NAV_HEIGHT + güvenli alan; balonun ölçüsü
    // de aynı güvenli alanı içerdiği için px kısımlarını karşılaştırmak yeterli.
    assert.ok(
      pxDegeri(lioBottomCss(false)) > BOTTOM_NAV_HEIGHT,
      "balon alt menünün üstüne biniyor"
    );
    assert.ok(
      lioBottomCss(false).includes("safe-area-inset-bottom"),
      "çentikli telefonlarda menü büyüyor: balon güvenli alanı hesaba katmalı"
    );
    assert.ok(!lioBottomCss(true).includes("env("), "masaüstünde güvenli alan yok");
  });
});

describe("Lio bildirim şeridinin yeri", () => {
  test("balon görünürken şerit onun üstünde durur, içine girmez", () => {
    for (const isDesktop of [true, false]) {
      const anchor = lioActivityAnchor({ isDesktop, panelOpen: false, launcherVisible: true });
      const bottom = isDesktop ? LIO_LAUNCHER.bottomDesktop : LIO_LAUNCHER.bottomMobile;
      const size = isDesktop ? LIO_LAUNCHER.sizeDesktop : LIO_LAUNCHER.sizeMobile;
      assert.ok(
        pxDegeri(anchor.bottom) >= bottom + size,
        `şerit balonun üstünde başlamalı (isDesktop: ${isDesktop})`
      );
    }
  });

  test("Lio gizliyken şerit boşluğa asılı kalmaz", () => {
    const gizli = lioActivityAnchor({ isDesktop: true, panelOpen: false, launcherVisible: false });
    assert.equal(pxDegeri(gizli.bottom), LIO_LAUNCHER.bottomDesktop);
  });

  test("panel açıkken masaüstünde panelin soluna geçer", () => {
    const anchor = lioActivityAnchor({ isDesktop: true, panelOpen: true, launcherVisible: true });
    assert.ok(anchor.right >= AI_PANEL_WIDTH, "şerit panelin altında kalmamalı");
  });

  test("panel açıkken telefonda üste çıkar — altta yazı kutusu var", () => {
    const anchor = lioActivityAnchor({ isDesktop: false, panelOpen: true, launcherVisible: true });
    assert.equal(anchor.bottom, undefined);
    assert.ok((anchor.top ?? 0) > 0);
  });
});
