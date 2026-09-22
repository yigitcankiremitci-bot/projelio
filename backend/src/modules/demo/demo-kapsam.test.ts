import { test } from "node:test";
import * as assert from "node:assert/strict";
import { DEMO_EPOSTA_SONLARI, SILME_DALGALARI, YAKALAMA_KURALLARI } from "./demo-kapsam";
import { DEMO_EPOSTALARI, demoEpostasiMi, demoKullanicisiMi } from "../../common/demo-hesap";

// Anlık görüntü tablo başına TEK satır tutuyor (demo_anlik_goruntu, onConflict: tablo).
// Aynı tablo iki kuralda geçerse ikincisi birincinin üzerine yazar ve o tablonun
// yarısı sessizce anlık görüntüden düşer — serbest çalışan demosu eklenirken
// jobs/party/module_records bu yüzden "coklu" kurala çevrildi.
test("her tablo yakalama kurallarında yalnızca bir kez geçer", () => {
  const tablolar = YAKALAMA_KURALLARI.map((k) => k.tablo);
  assert.deepEqual(tablolar, [...new Set(tablolar)]);
});

// Kurallar SIRAYLA işleniyor; bir kural, kendinden önce toplanmamış bir id
// listesine bakarsa boş liste görür ve o tablo hiç yakalanmaz.
test("her kural kendinden önce toplanmış bir kapsama bakar", () => {
  const toplanan = new Set<string>();
  for (const kural of YAKALAMA_KURALLARI) {
    const kaynaklar = [kural.kaynak, ...(kural.coklu ?? []).map((c) => c.kaynak)].filter(Boolean);
    for (const kaynak of kaynaklar) {
      assert.ok(toplanan.has(kaynak!), `${kural.tablo} → "${kaynak}" henüz toplanmadı`);
    }
    if (kural.kapsamAdi) toplanan.add(kural.kapsamAdi);
  }
});

test("silme kurallarının kapsamları yakalamada üretiliyor", () => {
  const uretilen = new Set(YAKALAMA_KURALLARI.map((k) => k.kapsamAdi).filter(Boolean));
  for (const dalga of SILME_DALGALARI) {
    for (const k of dalga) assert.ok(uretilen.has(k.kapsam), `${k.tablo}.${k.sutun} → "${k.kapsam}"`);
  }
});

test("iki demo hesabı da demo sayılır, gerçek adresler sayılmaz", () => {
  for (const e of DEMO_EPOSTALARI) {
    assert.ok(demoEpostasiMi(e));
    assert.ok(DEMO_EPOSTA_SONLARI.some((son) => e.endsWith(son)), `${e} yakalanan alan adlarında yok`);
  }
  assert.ok(demoEpostasiMi("OLIVER@hayes.test "));
  assert.equal(demoEpostasiMi("oliver@hayes.com"), false);
  // Serbest çalışan demosunun kimlikleri de `ce11` aralığında (migration 124).
  assert.ok(demoKullanicisiMi("ce11f000-0000-4000-8000-000000000001"));
});

// Lio sohbetleri anlık görüntüye GİRMİYOR ama siliniyor: her ziyaretçi Lio'yu
// boş açsın diye. Kapsam "kullanicilar" olduğu için kural iki demo hesabını da
// (şirket + serbest çalışan) kendiliğinden kapsıyor — `users` kuralı e-postayı
// DEMO_EPOSTA_SONLARI listesinden topluyor.
test("Lio sohbetleri her demo girişinde siliniyor ama geri yazılmıyor", () => {
  const silinen = SILME_DALGALARI.flat().find((k) => k.tablo === "ai_conversations");
  assert.ok(silinen, "ai_conversations silme kuralı yok");
  assert.equal(silinen!.kapsam, "kullanicilar");
  assert.ok(
    !YAKALAMA_KURALLARI.some((k) => k.tablo === "ai_conversations"),
    "ai_conversations yakalanıyor: sohbet geri yazılır ve ziyaretçiye eski sohbet görünür"
  );
  // ai_messages ayrı silinmiyor; conversation_id'den cascade ediyor (migration 019).
  assert.ok(!SILME_DALGALARI.flat().some((k) => k.tablo === "ai_messages"));
});
