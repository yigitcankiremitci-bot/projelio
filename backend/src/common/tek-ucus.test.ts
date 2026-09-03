// Backend tsconfig'inde esModuleInterop kapalı (NestJS CommonJS derlemesi
// gereği), bu yüzden namespace import kullanılıyor.
import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { TekUcus } from "./tek-ucus";

describe("TekUcus", () => {
  test("aynı anahtarla gelen eşzamanlı çağrılar işi TEK KEZ çalıştırır", async () => {
    // Asıl senaryo: jetonun süresi dolmuşken 5 paralel istek gelir. Kilit
    // olmadan beşi de yenileme başlatıyordu; sağlayıcı jeton rotasyonu
    // yapıyorsa dördünün jetonu geçersizleşiyordu.
    const tekUcus = new TekUcus<string>();
    let calisma = 0;
    let cozumle: (deger: string) => void = () => {};
    const bekleyen = new Promise<string>((resolve) => {
      cozumle = resolve;
    });

    const sonuclar = Promise.all(
      Array.from({ length: 5 }, () =>
        tekUcus.calistir("hesap-1", () => {
          calisma += 1;
          return bekleyen;
        })
      )
    );

    cozumle("jeton-abc");
    assert.deepEqual(await sonuclar, Array(5).fill("jeton-abc"));
    assert.equal(calisma, 1, "iş yalnızca bir kez çalışmalıydı");
  });

  test("farklı anahtarlar birbirini beklemez", async () => {
    // Microsoft'ta önbellek anahtarı izin kümesini de içeriyor: OneDrive için
    // alınmış jeton posta uçlarında 403 döner. İkisi aynı kilidi paylaşmamalı.
    const tekUcus = new TekUcus<string>();
    let calisma = 0;
    const sonuclar = await Promise.all([
      tekUcus.calistir("hesap-1::drive", async () => {
        calisma += 1;
        return "drive-jetonu";
      }),
      tekUcus.calistir("hesap-1::mail", async () => {
        calisma += 1;
        return "mail-jetonu";
      }),
    ]);
    assert.deepEqual(sonuclar, ["drive-jetonu", "mail-jetonu"]);
    assert.equal(calisma, 2);
  });

  test("iş bittikten sonra yeni çağrı yeniden başlatır", async () => {
    // Kayıt temizlenmezse jeton bir daha hiç yenilenmezdi.
    const tekUcus = new TekUcus<number>();
    let calisma = 0;
    const ilk = await tekUcus.calistir("a", async () => ++calisma);
    const ikinci = await tekUcus.calistir("a", async () => ++calisma);
    assert.equal(ilk, 1);
    assert.equal(ikinci, 2);
    assert.equal(tekUcus.bekleyenSayisi, 0);
  });

  test("hata çağıranlara ulaşır ve kayıt temizlenir", async () => {
    // Hata yutulursa çağıran "başarılı" sanır; kayıt kalırsa hata sonsuza
    // kadar tekrarlanırdı (bir kez düşen jeton bir daha yenilenemezdi).
    const tekUcus = new TekUcus<string>();
    const patla = () => Promise.reject(new Error("invalid_grant"));

    const bekleyenler = [tekUcus.calistir("a", patla), tekUcus.calistir("a", patla)];
    await assert.rejects(() => bekleyenler[0], /invalid_grant/);
    await assert.rejects(() => bekleyenler[1], /invalid_grant/);
    assert.equal(tekUcus.bekleyenSayisi, 0, "hata sonrası kayıt temizlenmeliydi");

    // Hatadan sonra yeniden denenebilmeli.
    assert.equal(await tekUcus.calistir("a", async () => "tamam"), "tamam");
  });
});
