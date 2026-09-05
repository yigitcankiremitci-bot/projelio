// Backend tsconfig'inde esModuleInterop kapalı (NestJS CommonJS derlemesi
// gereği), bu yüzden namespace import kullanılıyor.
import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { kesimTarihi, kesimTarihiIso, SAKLAMA_GUN, type SaklamaAlani } from "./retention.rules";

// Buradaki sayılar gizlilik politikasında yayımlanmış bir TAAHHÜT. Testin işi
// hesabı doğrulamaktan çok, sayıyı sessizce değiştiren birini durdurmak:
// politikada "90 gün" yazarken kodda 180'e çıkarmak tutulamayan bir söz olur.

describe("SAKLAMA_GUN", () => {
  test("politikada yayımlanan süreler", () => {
    assert.equal(SAKLAMA_GUN.aiSohbet, 90, "politika §12: Lio sohbet geçmişi 90 gün");
    assert.equal(SAKLAMA_GUN.whatsappMesaj, 90, "politika §12: WhatsApp kayıtları en fazla 90 gün");
  });

  test("ham webhook olayı, mesajın kendisinden ÖNCE silinir", () => {
    // Ters olsaydı mesaj gövdesi silinip tam metni içeren ham kopya kalırdı.
    assert.ok(SAKLAMA_GUN.whatsappWebhookOlayi < SAKLAMA_GUN.whatsappMesaj);
  });

  test("hiçbir süre sıfır ya da negatif değil", () => {
    // Sıfır gün = "her gece her şeyi sil". Bir yazım hatasının veriyi
    // süpürmesini engelleyen ucuz bir kapı.
    for (const [alan, gun] of Object.entries(SAKLAMA_GUN)) {
      assert.ok(gun > 0, `${alan} pozitif olmalı`);
    }
  });
});

describe("kesimTarihi", () => {
  const simdi = new Date("2026-09-04T03:45:00.000Z");

  test("kesim, süre kadar geriye gider", () => {
    assert.equal(kesimTarihiIso("aiSohbet", simdi), "2026-06-06T03:45:00.000Z");
    assert.equal(kesimTarihiIso("whatsappWebhookOlayi", simdi), "2026-08-28T03:45:00.000Z");
  });

  test("kesim her zaman geçmişte", () => {
    for (const alan of Object.keys(SAKLAMA_GUN) as SaklamaAlani[]) {
      assert.ok(kesimTarihi(alan, simdi).getTime() < simdi.getTime(), `${alan} kesimi gelecekte olamaz`);
    }
  });

  test("yaz saati geçişi kesimi kaydırmaz — hesap UTC üzerinden", () => {
    // Türkiye kalıcı UTC+3 ama sunucu saat dilimi değişebilir; kesim tarihinin
    // yerel saate göre bir gün oynaması, sınırdaki kayıtları bir gün erken
    // silmek demek olurdu.
    const kis = new Date("2026-01-15T00:00:00.000Z");
    const yaz = new Date("2026-07-15T00:00:00.000Z");
    assert.equal(kesimTarihiIso("suresiDolmusJeton", kis), "2025-12-16T00:00:00.000Z");
    assert.equal(kesimTarihiIso("suresiDolmusJeton", yaz), "2026-06-15T00:00:00.000Z");
  });
});
