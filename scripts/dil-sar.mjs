#!/usr/bin/env node
/**
 * Görünen metinleri t() ile sarar — YALNIZCA güvenli olduğu kesin yerlerde.
 *
 * ## Neden her yeri sarmıyor
 *
 * Türkçe içeren her dize ekrana çıkmıyor. Bir kısmı KARŞILAŞTIRMA değeri
 * (`if (durum === "Tamamlandı")`), bir kısmı nesne anahtarı, bir kısmı da
 * veritabanına yazılan sabit. Bunları sarmak İngilizce arayüzde karşılaştırmayı
 * bozar ve hata sessiz olur: kod çalışır, yalnızca yanlış çalışır.
 *
 * Bu yüzden betik iki desene bakıyor, ikisi de tanım gereği görüntülenen metin:
 *   1. JSX metin düğümü:      <button>Kaydet</button>
 *   2. Bilinen görünen öznitelik: title="Kaydet", placeholder="…", aria-label="…"
 *
 * Geri kalanı elle geçilmeli; `npm run dil -- --sarilmamis <dosya>` listeler.
 *
 * Kullanım:
 *   node scripts/dil-sar.mjs <dosya...>      # uygular
 *   node scripts/dil-sar.mjs --kuru <dosya>  # yalnızca gösterir
 */

import { readFileSync, writeFileSync } from "node:fs";

// Değeri KESİNLİKLE ekranda görünen öznitelikler. Listeye ekleme yaparken
// ölçüt şu: bu özniteliğe yazılan şey bir kimlik/anahtar/sınıf adı olabilir mi?
// Olabiliyorsa listeye GİRMEZ.
const GORUNEN_OZNITELIKLER = [
  "title", "label", "description", "placeholder", "alt", "aria-label",
  "emptyLabel", "addLabel", "confirmLabel", "cancelLabel", "submitLabel",
  "heading", "subtitle", "hint", "helperText", "tooltip", "emptyText",
];

const TURKCE = /[çğıöşüÇĞİÖŞÜ]/;

/** Kaçış gerektiren karakterleri anahtar hâline getirir. */
function anahtarla(metin) {
  return metin.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function sar(kaynak) {
  let sonuc = kaynak;
  let sayac = 0;

  // 1) Görünen öznitelikler:  title="Kaydet"  →  title={t("Kaydet")}
  const oznitelikDeseni = new RegExp(
    `\\b(${GORUNEN_OZNITELIKLER.join("|")})="([^"\\n]*[çğıöşüÇĞİÖŞÜ][^"\\n]*)"`,
    "g"
  );
  sonuc = sonuc.replace(oznitelikDeseni, (tam, ad, deger) => {
    sayac++;
    return `${ad}={t("${anahtarla(deger)}")}`;
  });

  // 2) JSX metin düğümleri:  >Kaydet<  →  >{t("Kaydet")}<
  //
  // Kenarlardaki boşluk KORUNUYOR: JSX'te satır başındaki girinti render'a
  // girmiyor ama iki öğe arasındaki tek boşluk giriyor. Boşluğu t()'nin içine
  // almak da yanlış olurdu — sözlükte "Kaydet " diye bir anahtar aranırdı.
  // Satır sonu İÇERMEYEN gövde: `[^<>{}\n]`. Newline'a izin verilirse `</>`
  // ile çok aşağıdaki bir `<` eşleşiyor ve arada kalan KOD (yorumlar, ifadeler)
  // t()'nin içine giriyor. Bir kez oldu, dosya derlenmez hâle geldi.
  // Çok satırlı JSX metni bu yüzden elle sarılır; sayıları az.
  sonuc = sonuc.replace(
    /(>)([^<>{}\n]*[çğıöşüÇĞİÖŞÜ][^<>{}\n]*)(<)/g,
    (tam, ac, govde, kapa) => {
      const metin = govde.trim();
      if (!metin || !TURKCE.test(metin)) return tam;
      // Zaten sarılmışsa dokunma.
      if (metin.startsWith("{")) return tam;
      const onBosluk = govde.slice(0, govde.indexOf(metin[0]));
      const sonBosluk = govde.slice(govde.indexOf(metin[0]) + metin.length);
      sayac++;
      return `${ac}${onBosluk}{t("${anahtarla(metin)}")}${sonBosluk}${kapa}`;
    }
  );

  return { sonuc, sayac };
}

const kuru = process.argv.includes("--kuru");
const dosyalar = process.argv.slice(2).filter((a) => !a.startsWith("--"));

let toplam = 0;
for (const dosya of dosyalar) {
  const kaynak = readFileSync(dosya, "utf8");
  const { sonuc, sayac } = sar(kaynak);
  if (sayac === 0) continue;
  toplam += sayac;
  if (kuru) console.log(`${dosya}: ${sayac} metin sarılacak`);
  else {
    writeFileSync(dosya, sonuc);
    console.log(`${dosya}: ${sayac} metin sarıldı`);
  }
}
console.log(`\nToplam ${toplam} metin.`);
console.log("Hatırlatma: bileşene `const t = useT();` eklemeyi ve `npm run typecheck` koşmayı unutma.");
