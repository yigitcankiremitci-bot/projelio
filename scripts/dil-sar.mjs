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
  // Satır sonuna İZİN VAR ama kırpılmış metnin İÇİNDE satır sonu kalmamalı.
  //
  // JSX metni çoğu zaman kendi satırında durur:
  //     <h3>
  //       Dosyalar
  //     </h3>
  // Satır sonunu tümden yasaklarken bunlar atlanıyordu. Sınırsız izin vermek de
  // olmuyor: `</>` ile çok aşağıdaki bir `<` eşleşip arada kalan KODU t()'nin
  // içine alıyor ve dosya derlenmez hâle geliyor (bir kez oldu). İkisinin
  // ortası: kırpılınca tek satır kalan metinler sarılır, kalmayanlar elde.
  // `(^|[^=])` — açan `>` bir OK FONKSİYONUNUN parçası olmasın.
  //
  // `map((key) =>\n  api.get<Tip[]>(…))` içinde `=>` ile `<` arasındaki
  // "api.get" metin sanılıp t() içine alınmış ve dosya derlenmez hâle gelmişti.
  // Ok işaretinden sonra gelen şey hiçbir zaman JSX metni değildir.
  // Açan `>`ın ÖNCESİ de eleniyor:
  //   `=` → ok fonksiyonu (`map((k) =>`)
  //   `]` → jenerik tip kapanışı (`Promise<Tip[]>, Promise<…>`)
  // İkisinde de sonrasında gelen şey JSX metni değil, koddur; sarılırsa dosya
  // derlenmez. İkisi de gerçekten başımıza geldi.
  sonuc = sonuc.replace(
    /(^|[^=\]])(>)([^<>{}]*)(<)/g,
    (tam, onceki, ac, govde, kapa) => {
      const metin = govde.trim();
      // Türkçeye özgü karakter ARANMIYOR: etiketler arasına yazılan her şey
      // tanım gereği ekrana çıkıyor ve "Kapat" da "Vazgeç" kadar çevrilmeli.
      // Harf içermeyen düğümler (boşluk, tire, nokta) metin değildir.
      if (!metin || !/[a-zA-ZçğıöşüÇĞİÖŞÜ]/.test(metin)) return tam;
      if (metin.includes("\n")) return tam;
      // Görünen metin harfle ya da rakamla başlar. Virgül/noktalı virgül/
      // parantezle başlayan şey bir ifadenin ortasıdır (`, Promise`).
      if (!/^[\p{L}\p{N}"'“(]/u.test(metin)) return tam;
      // Kod noktalaması taşıyan "metin" aslında bir ifadedir: `a > b && c < d`
      // ya da `Record<string, unknown>` gibi. Sarılırsa kod bozulur.
      if (/[(){}=;&|?]|=>|::/.test(metin)) return tam;
      // Zaten sarılmışsa dokunma.
      if (metin.startsWith("{")) return tam;
      const onBosluk = govde.slice(0, govde.indexOf(metin[0]));
      const sonBosluk = govde.slice(govde.indexOf(metin[0]) + metin.length);
      sayac++;
      return `${onceki}${ac}${onBosluk}{t("${anahtarla(metin)}")}${sonBosluk}${kapa}`;
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
