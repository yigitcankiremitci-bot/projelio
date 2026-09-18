import { strict as assert } from "node:assert";
import { test } from "node:test";
import { kurSapmasi, usdKuruAyikla } from "./tcmb-kuru";

/** TCMB bülteninin gerçek biçimi — girintiler ve sıra olduğu gibi korundu. */
const BULTEN = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="isokur.xsl"?>
<Tarih_Date Tarih="17.09.2026" Date="09/17/2026"  Bulten_No="2026/175" >
\t<Currency CrossOrder="0" Kod="USD" CurrencyCode="USD">
\t\t\t<Unit>1</Unit>
\t\t\t<Isim>ABD DOLARI</Isim>
\t\t\t<CurrencyName>US DOLLAR</CurrencyName>
\t\t\t<ForexBuying>48.5873</ForexBuying>
\t\t\t<ForexSelling>48.6749</ForexSelling>
\t\t\t<BanknoteBuying>48.5533</BanknoteBuying>
\t\t\t<BanknoteSelling>48.7479</BanknoteSelling>
\t\t\t<CrossRateUSD/>
\t\t\t<CrossRateOther/>
\t</Currency>
\t<Currency CrossOrder="1" Kod="AUD" CurrencyCode="AUD">
\t\t\t<Unit>1</Unit>
\t\t\t<Isim>AVUSTRALYA DOLARI</Isim>
\t\t\t<ForexSelling>32.1111</ForexSelling>
\t\t\t<BanknoteSelling>32.2222</BanknoteSelling>
\t</Currency>
</Tarih_Date>`;

test("bültenden USD satırını okur", () => {
  const kur = usdKuruAyikla(BULTEN);
  assert.deepEqual(kur, { tarih: "17.09.2026", forexSelling: 48.6749, banknoteSelling: 48.7479 });
});

test("USD dışındaki para birimlerinin değerini almaz", () => {
  // Bu testin sebebi: USD bloğuyla sınırlamayan bir arama, listedeki bir sonraki
  // para biriminin (AUD) kurunu yakalayabilir ve fiyat kararı yanlış bir sayıya
  // dayanırdı.
  const kur = usdKuruAyikla(BULTEN);
  assert.notEqual(kur?.forexSelling, 32.1111);
  assert.notEqual(kur?.banknoteSelling, 32.2222);
});

test("USD yoksa null döner", () => {
  const eksik = BULTEN.replace(/Kod="USD"/, 'Kod="EUR"');
  assert.equal(usdKuruAyikla(eksik), null);
});

test("boş ya da bozuk içerikte null döner", () => {
  assert.equal(usdKuruAyikla(""), null);
  assert.equal(usdKuruAyikla("<html>hata sayfası</html>"), null);
  assert.equal(usdKuruAyikla(BULTEN.replace("48.6749", "")), null);
});

test("kur sapması: fiyat geride kalmışsa pozitif", () => {
  // 50 ₺/$ sabitlenmiş fiyat, kur 55'e çıkmış: %10 geride.
  assert.equal(kurSapmasi(50, 55), 0.1);
});

test("kur sapması: fiyat kurun üstündeyse negatif", () => {
  // Yukarı yuvarlama yüzünden olağan durum budur.
  assert.ok((kurSapmasi(50, 48.6749) ?? 0) < 0);
});

test("kur sapması: geçersiz değerlerde null", () => {
  assert.equal(kurSapmasi(0, 50), null);
  assert.equal(kurSapmasi(50, 0), null);
  assert.equal(kurSapmasi(Number.NaN, 50), null);
});
