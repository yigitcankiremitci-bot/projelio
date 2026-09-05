#!/usr/bin/env node
/**
 * Dil denetimi: çeviri sözlüğü ile kodun arasındaki farkı gösterir.
 *
 * Kaynak metin anahtar olarak kullanıldığı için (bkz. packages/shared/src/i18n.ts)
 * eksik çeviri sessizdir: metin Türkçe görünür, hata vermez. Bu sessizliği
 * görünür kılan tek şey bu betik.
 *
 * Üç şeyi raporlar:
 *   1. EKSİK   — kodda t() ile sarılmış ama sözlükte karşılığı olmayan metin.
 *   2. ARTIK   — sözlükte duran ama kodda artık geçmeyen anahtar (Türkçe metin
 *                değişince ortaya çıkar; o satır sessizce Türkçeye düşmüştür).
 *   3. SARILMAMIŞ — Türkçe içeren ama t() ile sarılmamış dize. Yaklaşık bir
 *                sayım: kalan işin ölçüsü.
 *
 * Kullanım:
 *   node scripts/dil-denetimi.mjs           # özet
 *   node scripts/dil-denetimi.mjs --eksik   # eksik anahtarları listele
 *   node scripts/dil-denetimi.mjs --artik
 *   node scripts/dil-denetimi.mjs --sarilmamis [dosya-parçası]
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const KOK = join(fileURLToPath(new URL(".", import.meta.url)), "..");

const TARANAN = [
  "apps/web/src",
  "backend/src",
  "packages/shared/src",
];

// Sözlüklerin kendisi taranmaz: içleri zaten Türkçe anahtar dolu.
// Sözlük klasörleri taranmaz: içleri zaten Türkçe anahtar dolu, hepsi
// "sarılmamış metin" diye sayılırdı.
const SOZLUK_KLASORLERI = ["apps/web/src/lib/i18n/en/", "backend/src/common/i18n/en/"];

const TURKCE = /[çğıöşüÇĞİÖŞÜ]/;

/**
 * Türkçesi bilerek korunan, MODELE giden dosyalar.
 *
 * Lio'nun araç tanımları ve sistem promptu kullanıcıya değil dil modeline
 * yazılıyor. Dile göre değişen tek bölüm ayrı bir dosyada
 * (modules/ai-assistant/lio-dil-kurallari.ts); gerekçesi orada yazılı.
 * Buradaki metinleri "kalan iş" saymak, gerçek işin ölçüsünü iki katına
 * çıkarıp raporu işe yaramaz hâle getiriyordu.
 */
/**
 * ZATEN İKİ DİLLİ dosyalar — sözlükten geçmiyorlar.
 *
 * Yasal metinlerin her birinde `text.tr` ve `text.en` yan yana duruyor ve
 * belgenin kendi TR/EN düğmesi var (bkz. components/LegalDocPage.tsx). Açılış
 * dili uygulamanınkini izliyor, ama düğme bilerek KALDI: Türkçe metin hukuken
 * bağlayıcı olan sürüm, İngilizce arayüz kullanan birinin de aslına bakabilmesi
 * gerekiyor. Sözlüğe taşımak çeviriyi ikiye bölerdi.
 */
const ZATEN_IKI_DILLI = [
  "apps/web/src/lib/legal/privacyPolicy.ts",
  "apps/web/src/lib/legal/termsOfService.ts",
  "apps/web/src/lib/legal/kvkkNotice.ts",
];

const MODELE_GIDEN = [
  "backend/src/modules/ai-assistant/ai-assistant.tools.ts",
  "backend/src/modules/ai-assistant/lio-dil-kurallari.ts",
];

function dosyalar(dizin) {
  const sonuc = [];
  const yur = (yol) => {
    for (const ad of readdirSync(yol)) {
      if (ad === "node_modules" || ad === "dist" || ad.startsWith(".")) continue;
      const tam = join(yol, ad);
      if (statSync(tam).isDirectory()) yur(tam);
      else if (/\.(ts|tsx)$/.test(ad)) sonuc.push(tam);
    }
  };
  yur(dizin);
  return sonuc;
}

/**
 * Kaynaktaki dize sabitlerini konumlarıyla birlikte çıkarır.
 *
 * Yorum satırlarını atlıyor: yorumlar Türkçe ve bu repoda çok — ayıklanmazsa
 * "sarılmamış" sayısı gerçeğin katı çıkardı. Şablon dizeleri (backtick) de
 * atlanıyor; onlar anahtar olarak kullanılamaz, ayrıca raporlanır.
 */
function dizeler(kaynak) {
  const bulunan = [];
  // Dize ve yorumların boşlukla değiştirilmiş hâli: JSX metin düğümlerini
  // ararken bir dizenin içindeki ">" yüzünden yanlış eşleşme olmasın diye.
  // Satır sonları korunuyor ki satır numaraları kaymasın.
  const maske = kaynak.split("");
  const boz = (bas, son) => {
    for (let k = bas; k < son && k < maske.length; k++) if (maske[k] !== "\n") maske[k] = " ";
  };
  let i = 0;
  let satir = 1;
  const n = kaynak.length;
  while (i < n) {
    const c = kaynak[i];
    if (c === "\n") { satir++; i++; continue; }
    // Yorumlar
    if (c === "/" && kaynak[i + 1] === "/") {
      const bas = i;
      while (i < n && kaynak[i] !== "\n") i++;
      boz(bas, i);
      continue;
    }
    if (c === "/" && kaynak[i + 1] === "*") {
      const bas = i;
      i += 2;
      while (i < n && !(kaynak[i] === "*" && kaynak[i + 1] === "/")) {
        if (kaynak[i] === "\n") satir++;
        i++;
      }
      i += 2;
      boz(bas, i);
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const tirnak = c;
      const baslangic = i;
      const baslangicSatir = satir;
      i++;
      let govde = "";
      while (i < n && kaynak[i] !== tirnak) {
        if (kaynak[i] === "\\") { govde += kaynak[i] + kaynak[i + 1]; i += 2; continue; }
        if (kaynak[i] === "\n") satir++;
        govde += kaynak[i];
        i++;
      }
      i++;
      boz(baslangic, i);
      bulunan.push({ tirnak, govde, baslangic, satir: baslangicSatir });
      continue;
    }
    i++;
  }
  return { bulunan, maskeli: maske.join("") };
}

/** Kaçışları çözer: kaynaktaki \" ve \n gerçek karaktere döner. */
function coz(govde) {
  return govde.replace(/\\(["'`\\nrt])/g, (_, k) =>
    ({ n: "\n", r: "\r", t: "\t" }[k] ?? k)
  );
}

const kullanilan = new Map(); // anahtar -> [konum]
const sarilmamis = [];
const sablonUyarilari = [];

for (const kok of TARANAN) {
  for (const dosya of dosyalar(join(KOK, kok))) {
    const goreli = relative(KOK, dosya);
    if (SOZLUK_KLASORLERI.some((k) => goreli.startsWith(k))) continue;
    if (MODELE_GIDEN.includes(goreli) || ZATEN_IKI_DILLI.includes(goreli)) continue;
    if (/\.test\.tsx?$/.test(goreli)) continue;

    const kaynak = readFileSync(dosya, "utf8");

    // Dosya düzeyinde işaret: `// dil:anahtar-dosya`
    //
    // Bazı dosyaların İÇİNDEKİ her metin tanım gereği görüntülenen bir
    // etikettir — modül konfigürasyonları böyle: alan adları, başlıklar, boş
    // durum cümleleri. Hepsi modül düzeyinde sabit olduğu için t() ile
    // sarılamıyor, çeviri render anında yapılıyor. 450 satıra tek tek işaret
    // koymak yerine dosyanın başına bir kez yazılıyor.
    //
    // Satır işaretiyle aynı anlam: SUSTURUCU DEĞİL, yükümlülük. İçerideki her
    // metin sözlükte aranıyor, bulunamazsa "eksik çeviri" raporlanıyor.
    const dosyaAnahtar = /\/\/\s*dil:anahtar-dosya/.test(kaynak.slice(0, 2000));

    // Blok işareti: `// dil:atla-baslangic` … `// dil:atla-bitis`
    //
    // Bazı dosyalar KARIŞIK. ai-assistant.service.ts hem Lio'nun kullanıcıya
    // gösterdiği onay metinlerini ("Görev silindi.") hem de 330 satırlık
    // sistem promptunu taşıyor. Prompt modele yazılıyor, çevrilmiyor; ama
    // dosyanın tamamını dışlamak gerçek arayüz metinlerini de gizlerdi.
    // Aynı mekanizmanın ikinci hâli: `dil:anahtar-baslangic`/`-bitis`.
    // Arada kalan metinler ANAHTAR sayılır — modül düzeyindeki etiket
    // sabitleri için (t() orada çağrılamıyor, çeviri kullanım yerinde).
    const bloklar = (bas, bit) => {
      const sonuc = [];
      let acik = null;
      let konum = 0;
      for (const satir of kaynak.split("\n")) {
        if (bas.test(satir)) acik = konum;
        else if (bit.test(satir) && acik !== null) {
          sonuc.push([acik, konum + satir.length]);
          acik = null;
        }
        konum += satir.length + 1;
      }
      return sonuc;
    };
    const atlanan = bloklar(/\/\/\s*dil:atla-baslangic/, /\/\/\s*dil:atla-bitis/);
    const anahtarBloklari = bloklar(/\/\/\s*dil:anahtar-baslangic/, /\/\/\s*dil:anahtar-bitis/);
    const atlanmis = (konum) => atlanan.some(([a, b]) => konum >= a && konum <= b);
    const anahtarBlogunda = (konum) => anahtarBloklari.some(([a, b]) => konum >= a && konum <= b);
    if (!TURKCE.test(kaynak) && !kaynak.includes("t(")) continue;

    const { bulunan, maskeli } = dizeler(kaynak);

    // Birleştirme zincirinde YUTULMUŞ parçaların bitiş konumu.
    //
    // `"a " + "b " + "c"` üç ayrı dize sabiti ama TEK bir anahtar. Zincirin
    // başındaki dize hepsini birleştirip kaydediyor; devamındakiler yeniden
    // işlenirse aynı mesaj için üç farklı anahtar üretilir ("abc", "bc", "c")
    // ve ikisi sözlükte hiç karşılığı olmayan hayalet kayıt olur.
    let zincirSonu = -1;

    // Bildirim çağrılarının kapsadığı aralıklar.
    //
    // notifyUser / notifyUserSafe'e verilen başlık ve gövde, ALICININ dilinde
    // yazılıp veritabanına çevrilmiş giriyor (bkz. notifications.service.ts).
    // Yani oradaki Türkçe dize zaten bir sözlük ANAHTARI — t() ile sarılmış
    // olanlardan farkı yok. Aralığı bilmezsek bu metinler hem "kalan iş" diye
    // sayılır hem de sözlükte karşılıkları aranmaz; ikisi de yanlış.
    //
    // Aynı şey istisna mesajları için de geçerli: `throw new BadRequestException(
    // "Ad soyad boş olamaz")` içindeki Türkçe metin doğrudan kullanıcının
    // ekranına çıkıyor ve çevirisi HTTP sınırında, global filtrede yapılıyor
    // (bkz. common/filters/all-exceptions.filter.ts). Yani o da bir anahtar.
    //
    // DOMException DIŞARIDA: o bir tarayıcı ilkelinin taklidi, HTTP yanıtına
    // hiç dönüşmüyor. Tek kullanımı iptal sinyali ve mesajı zaten yutuluyor
    // (bkz. web api/client.ts `ignoreAbort`).
    // Log çağrıları: metni geliştirici okuyor, çevrilmez. Şablon dizesi
    // olduklarından "sarılmamış metin" diye sayılıyor ve gerçek işi
    // olduğundan büyük gösteriyorlardı.
    const logAraliklari = [];
    for (const eslesme of maskeli.matchAll(/\blogger\.(?:log|warn|error|debug|verbose)\s*\(/g)) {
      let derinlik = 0;
      let i = eslesme.index + eslesme[0].length - 1;
      for (; i < maskeli.length; i++) {
        if (maskeli[i] === "(") derinlik++;
        else if (maskeli[i] === ")") {
          derinlik--;
          if (derinlik === 0) break;
        }
      }
      logAraliklari.push([eslesme.index, i]);
    }
    const logIcinde = (konum) => logAraliklari.some(([a, b]) => konum > a && konum < b);

    const bildirimAraliklari = [];
    for (const eslesme of maskeli.matchAll(/\b(?:notifyUser(?:Safe)?|new (?!DOMException)\w*Exception)\s*\(/g)) {
      let derinlik = 0;
      let i = eslesme.index + eslesme[0].length - 1;
      for (; i < maskeli.length; i++) {
        if (maskeli[i] === "(") derinlik++;
        else if (maskeli[i] === ")") {
          derinlik--;
          if (derinlik === 0) break;
        }
      }
      bildirimAraliklari.push([eslesme.index, i]);
    }
    const bildirimIcinde = (konum) => bildirimAraliklari.some(([a, b]) => konum > a && konum < b);

    for (const dize of bulunan) {
      // Bir önceki zincirin içinde kalan parça: anahtarı zaten yazıldı.
      if (dize.baslangic < zincirSonu) continue;
      // `dil:atla-baslangic`/`-bitis` arasındaki blok: modele giden metin.
      if (atlanmis(dize.baslangic)) continue;
      if (logIcinde(dize.baslangic)) continue;

      const metin = coz(dize.govde);

      // Bu dize bir t(...) çağrısının ilk argümanı mı?
      const once = kaynak.slice(Math.max(0, dize.baslangic - 40), dize.baslangic);
      // `t("…")` ya da anında çağrılan çevirmen: `cevirmen(locale)("…")`.
      // İkincisi, çevirmeni bir kez kurmanın anlamsız olduğu tek kullanımlık
      // yerlerde geçiyor; denetim onu görmezse metin "artık anahtar" sanılır.
      const sarili =
        /\bt\(\s*$/.test(once) ||
        /\bt\(\s*$/.test(once.replace(/\s+$/, " ")) ||
        /\bcevirmen\([^)]*\)\(\s*$/.test(once);

      // Bildirim çağrısının içindeki metin de anahtardır (yukarıdaki gerekçe).
      // Ama çağrının son argümanı bir BAĞLANTI ("/projects/…") ve o çevrilmez;
      // yol gibi görünen dizeler eleniyor.
      // Aynı çağrının ikinci argümanı bildirim TÜRÜ ("task_assigned"): bir
      // enum değeri, kullanıcıya hiç görünmüyor. Tür adlarının tamamı
      // snake_case ve küçük harf; hiçbir arayüz metni öyle yazılmıyor.
      // `metin:` alanının değeri her zaman bir anahtardır: bildirim gövdeleri
      // çoğu zaman çağrının İÇİNDE değil, önce bir değişkende kuruluyor
      //     const body: Metin = { metin: "…", params: { … } };
      // ve o hâlde notifyUser aralığına düşmüyor.
      // Yalnızca backend'de: `Metin` tipi orada tanımlı (common/i18n). Web'de
      // "metin" yaygın bir alan adı ve alakasız nesnelere takılıyordu.
      // `metin:` → bildirim gövdesi (Metin tipi).
      // `message:` → class-validator doğrulama mesajı (@Matches, @MinLength…).
      //   Bunlar da doğrudan kullanıcının ekranına çıkıyor ve çevirisi HTTP
      //   sınırındaki filtrede yapılıyor — yani sözlük ANAHTARI. Denetim bunu
      //   görmediği sürece kaynakla sözlük arasındaki tek sözcüklük bir fark
      //   sessizce metni Türkçe bırakıyordu; bir kez öyle oldu.
      const metinAlani =
        goreli.startsWith("backend/") &&
        /\b(metin|message):\s*$/.test(kaynak.slice(Math.max(0, dize.baslangic - 20), dize.baslangic));

      const yolGibi = /^\/|^https?:\/\//.test(metin);
      const turGibi = /^[a-z][a-z0-9_]*$/.test(metin);

      // Uzun metinler kaynakta `"..." + "..."` diye bölünüyor (satır uzunluğu).
      // Çalışma zamanında t() de, bildirim/istisna yolu da BİRLEŞMİŞ dizeyi
      // görüyor — anahtar da o.
      //
      // Bu hesap eskiden yalnızca t() dalındaydı ve sonucu sinsiydi: uzun
      // istisna mesajları sözlüğe PARÇA parça giriyordu, denetim "eksik yok"
      // diyordu ama çalışma anında birleşik metin aranıp bulunamıyor ve mesaj
      // sessizce Türkçe kalıyordu. Tam olarak bu tasarımın önlemesi gereken
      // hata; bu yüzden birleştirme artık dallanmadan ÖNCE, herkes için.
      let bitis = dize.baslangic + dize.govde.length + 2;
      let anahtarMetni = metin;
      for (;;) {
        const devam = kaynak.slice(bitis).match(/^\s*\+\s*"((?:[^"\\]|\\.)*)"/);
        if (!devam) break;
        anahtarMetni += coz(devam[1]);
        bitis += devam[0].length;
      }
      zincirSonu = bitis;

      if (!sarili && !yolGibi && !turGibi && (metinAlani || bildirimIcinde(dize.baslangic))) {
        // Şablon dizesi burada ÇEVRİLEMEZ ve bu bir eksiklik değil, bir sınır:
        // filtre `exception.message` alanını görüyor, yani değişken çoktan
        // gömülmüş oluyor ve sözlükte hiçbir zaman bulunamaz. Bunlar "eksik
        // çeviri" diye CI'ı kırmamalı ama görünmez de olmamalı — uyarı olarak
        // raporlanıyor. Çevrilmesi isteniyorsa mesajın yeniden yazılması,
        // değişkenin metinden çıkarılması gerekir.
        if (dize.tirnak === "`") {
          sablonUyarilari.push(`${goreli}:${dize.satir}  ${anahtarMetni.slice(0, 70)}`);
          continue;
        }
        if (!kullanilan.has(anahtarMetni)) kullanilan.set(anahtarMetni, []);
        kullanilan.get(anahtarMetni).push(`${goreli}:${dize.satir}`);
        continue;
      }

      // t() içindeki dize, Türkçeye özgü karakter içermese de ("Ayarlar",
      // "Kaydet", "Proje") bir anahtardır. Bu kontrolü karakter süzgecinin
      // ÜSTÜNDE yapmak şart: yoksa o metinler sözlükte "artık anahtar" diye
      // görünür ve gerçekten artmış olanlarla karışırdı.
      if (sarili) {
        if (dize.tirnak === "`") {
          sablonUyarilari.push(`${goreli}:${dize.satir}  ${metin.slice(0, 60)}`);
          continue;
        }

        // Bağlam ikinci argümanda; anahtarı kurmak için ctx'i de okumalıyız.
        const sonra = kaynak.slice(bitis, bitis + 120);
        const ctx = sonra.match(/^\s*,\s*\{[^}]*\bctx:\s*"([^"]+)"/);
        const anahtar = ctx ? `${anahtarMetni} ##${ctx[1]}` : anahtarMetni;
        if (!kullanilan.has(anahtar)) kullanilan.set(anahtar, []);
        kullanilan.get(anahtar).push(`${goreli}:${dize.satir}`);
      } else {
        const satirMetni = kaynak.split("\n")[dize.satir - 1] ?? "";

        // `// dil:atla` — bu metin HİÇ çevrilmeyecek (marka adı, dil adı).
        // Sayıma girmez, sözlükten bir şey beklenmez.
        if (/\/\/\s*dil:atla/.test(satirMetni)) continue;

        // `// dil:anahtar` — metin modül düzeyinde bir sabitte duruyor, orada
        // t() çağrılamıyor ve çeviri kullanıldığı yerde yapılıyor.
        //
        // Bu işaret bir SUSTURUCU DEĞİL, YÜKÜMLÜLÜK: metin sarılmış sayılıyor,
        // yani sözlükte karşılığı yoksa "eksik çeviri" olarak raporlanıyor.
        // Aksi halde işaret koymak işi bitirmiş gibi gösterirdi — bir kez
        // öyle oldu, 111 çevrilmemiş metin "tamam" görünüyordu.
        if (dosyaAnahtar || anahtarBlogunda(dize.baslangic) || /\/\/\s*dil:anahtar/.test(satirMetni)) {
          // Dosya düzeyi işaret bütün dosyayı kapsıyor, yani içindeki her dizeyi
          // görüyor — import yollarını, hesaplanan özet şablonlarını, sayıları da.
          // Bunlar etiket değil; elenmezlerse sözlüğe çevrilemeyecek anahtarlar
          // girer ve denetim gerçek işi göstermez olur.
          if (dize.tirnak === "`") continue;
          if (metin.includes("${")) continue;
          if (/^\.\.?\//.test(metin)) continue;
          // Renk kodu (#C0813F), paket adı (@projelio/shared), CSS değeri.
          // Dosya düzeyi işaret bütün dosyayı kapsadığı için bunlar da geliyor.
          if (/^[#@]/.test(metin)) continue;
          // Sayı ve ayraçlar: "0", " · ", " → ", "—". Bunlar metin değil,
          // biçimlendirme; çeviride de aynı kalırlar.
          if (/^[\d.,%\s+\-−·—→/]*$/.test(metin)) continue;
          // İşaret SATIRA konuyor ama satırda genelde iki dize var:
          //     { key: "durum", label: "Durum" }, // dil:anahtar
          // Anahtar adı ("durum") arayüz metni değil. Tanımlayıcı ve yol
          // görünümlü dizeler eleniyor; gerçek arayüz metni ya büyük harfle
          // başlıyor, ya birden fazla sözcük, ya da Türkçe karakter taşıyor.
          // Tanımlayıcılar: camelCase, snake_case ve kebab-case
          // (tur adım kimlikleri böyle: "ana-sayfa-sekmeleri").
          if (/^[a-z][a-zA-Z0-9_-]*$/.test(metin)) continue;
          if (/^\/|^https?:\/\//.test(metin)) continue;
          if (!kullanilan.has(anahtarMetni)) kullanilan.set(anahtarMetni, []);
          kullanilan.get(anahtarMetni).push(`${goreli}:${dize.satir}`);
          continue;
        }

        // İŞARETLER YUKARIDA, bu süzgeçten ÖNCE bakılıyor. Sıra tersken
        // "Rutinler", "Bronz", "Sosyal" gibi Türkçeye özgü karakteri olmayan
        // işaretli metinler hiç kaydedilmiyor, sözlükteki karşılıkları da
        // "artık anahtar" diye görünüyordu.
        // Sarılmamış tarafta Türkçeye özgü karakter aranıyor. Bu YAKLAŞIK bir
        // ölçü ve eksik sayar: "Kaydet", "Proje", "Sil" gibi metinler
        // buraya düşmez. Alternatifi (her dizeyi aday saymak) CSS değerlerini,
        // alan adlarını ve olay adlarını da listeye doldururdu; o gürültüde
        // gerçek iş görünmez olur. JSX metin düğümleri ve görünen öznitelikler
        // aşağıda ayrıca, karakter şartı ARANMADAN taranıyor.
        if (!TURKCE.test(metin)) continue;

        sarilmamis.push({ dosya: goreli, satir: dize.satir, metin });
      }
    }

    // JSX metin düğümleri: <button>Kaydet</button> gibi, tırnaksız yazılan
    // ve React'in doğrudan bastığı metinler. Dize taramasına takılmıyorlar
    // ama arayüzde en görünür metinlerin çoğu bunlar.
    // Şablon dizesi İÇİNDEKİ t() çağrıları.
    //
    // Tarayıcı bir şablon dizesini TEK parça olarak alıyor, yani içindeki
    // `${t("…")}` görünmüyordu ve o metinler sözlükte "artık anahtar" diye
    // duruyordu. Ham kaynak üzerinde ek bir geçiş yapılıyor; zaten kayıtlı
    // olanlar tekrar eklenmiyor.
    for (const eslesme of kaynak.matchAll(/\$\{[^}]*?\bt\(\s*"((?:[^"\\]|\\.)*)"/g)) {
      const anahtar = coz(eslesme[1]);
      if (kullanilan.has(anahtar)) continue;
      const satir = kaynak.slice(0, eslesme.index).split("\n").length;
      kullanilan.set(anahtar, [`${goreli}:${satir}`]);
    }

    // JSX metin düğümünde Türkçe karakter ARANMIYOR: etiketler arasına yazılan
    // her şey tanım gereği ekrana çıkıyor, "Ayarlar" da "Görünüm" kadar
    // çevrilmeli. Yalnızca metin sayılmayacaklar eleniyor.
    //
    // Satır sonu İZİNLİ, çünkü JSX metni çoğu zaman kendi satırında durur:
    //     <button>
    //       Vazgeç
    //     </button>
    // Satır sonunu yasaklarken bu düğümlerin tamamı gözden kaçıyordu. Buna
    // karşılık kırpılmış metnin İÇİNDE satır sonu kalıyorsa bu bir metin değil,
    // araya giren koddur (`</>` ile aşağıdaki bir `<` eşleşmiş demektir) —
    // aşağıda eleniyor.
    // Açan `>`ın öncesi `=` ya da `]` ise bu bir JSX etiketi değil: ok
    // fonksiyonu (`map((k) =>`) ya da jenerik tip kapanışı (`Promise<T[]>`).
    // Aynı kurallar dil-sar.mjs'te de var; ikisi de gerçek derleme hatalarından
    // sonra eklendi.
    for (const eslesme of maskeli.matchAll(/(^|[^=\]])>([^<>{}]*)</g)) {
      const metin = eslesme[2].trim();
      if (metin.includes("\n")) continue;
      // Görünen metin harf ya da rakamla başlar.
      if (!/^[\p{L}\p{N}"'“(]/u.test(metin)) continue;
      // Harf içermeyen (boşluk, noktalama, tire) düğümler metin değil.
      if (!metin || !/[a-zA-ZçğıöşüÇĞİÖŞÜ]/.test(metin)) continue;
      // JSX metni ararken `>`...`<` deseni TypeScript'in jeneriklerine
      // (`Record<string, unknown>`) ve karşılaştırmalara (`a >= 2 && b < c`)
      // da uyuyor. Metin olmayanları elemek için: içinde kod noktalaması
      // varsa metin değildir. Arayüz metinleri bu karakterleri taşımıyor.
      if (/[(){}=;&|?]|=>|::/.test(metin)) continue;
      // Şablon dizesi içindeki `${t(...)}` zaten sarılmış demektir.
      if (metin.includes("${")) continue;
      const satir = maskeli.slice(0, eslesme.index).split("\n").length;
      // JSX metninde işaret aynı satıra sığmıyor (araya yazılan her şey metnin
      // parçası olurdu), bu yüzden bir ÜST satırdaki JSX yorumu da kabul edilir:
      //   {/* dil:atla — marka adı */}
      //   <span>Projelio</span>
      const satirlar = kaynak.split("\n");
      const isaretli = [satirlar[satir - 1], satirlar[satir - 2]].some((l) => /dil:atla/.test(l ?? ""));
      if (isaretli) continue;
      sarilmamis.push({ dosya: goreli, satir, metin, jsx: true });
    }
  }
}

// Sözlükleri oku. TS dosyası olduğu için ayrıştırmak yerine anahtarları
// düzenli ifadeyle çekiyoruz: sözlük düz bir nesne sabiti, yapısı sabit.
function sozlukAnahtarlari(yol) {
  let kaynak;
  try {
    kaynak = readFileSync(join(KOK, yol), "utf8");
  } catch {
    return new Set();
  }
  const anahtarlar = new Set();
  for (const dize of dizeler(kaynak).bulunan) {
    if (dize.tirnak === "`") continue;
    const sonrasi = kaynak.slice(dize.baslangic + dize.govde.length + 2).match(/^\s*:/);
    if (sonrasi) anahtarlar.add(coz(dize.govde));
  }
  // Tırnaksız yazılmış anahtarlar (ör. `Kapat: "Close"`) — Türkçe karakter
  // içermeyenler tırnaksız yazılabiliyor.
  for (const eslesme of kaynak.matchAll(/^\s{2}([A-Za-zÇĞİÖŞÜçğıöşü_][\wÇĞİÖŞÜçğıöşü]*)\s*:/gm)) {
    anahtarlar.add(eslesme[1]);
  }
  return anahtarlar;
}

// Sözlük alan alan bölünmüş; hepsi taranıp tek küme yapılıyor.
const sozluk = new Set();
for (const klasor of SOZLUK_KLASORLERI) {
  for (const dosya of readdirSync(join(KOK, klasor))) {
    if (dosya === "index.ts") continue;
    for (const anahtar of sozlukAnahtarlari(join(klasor, dosya))) sozluk.add(anahtar);
  }
}

const eksik = [...kullanilan.keys()].filter((k) => !sozluk.has(k)).sort();
const artik = [...sozluk].filter((k) => !kullanilan.has(k)).sort();

const bayrak = process.argv[2];
const suzgec = process.argv[3];

if (bayrak === "--eksik") {
  for (const anahtar of eksik) console.log(`${anahtar}\n    ${kullanilan.get(anahtar).slice(0, 3).join(", ")}`);
} else if (bayrak === "--artik") {
  for (const anahtar of artik) console.log(anahtar);
} else if (bayrak === "--sarilmamis") {
  const liste = suzgec ? sarilmamis.filter((s) => s.dosya.includes(suzgec)) : sarilmamis;
  for (const s of liste) console.log(`${s.dosya}:${s.satir}  ${s.metin.slice(0, 80)}`);
} else {
  const dosyaBasi = new Map();
  for (const s of sarilmamis) dosyaBasi.set(s.dosya, (dosyaBasi.get(s.dosya) ?? 0) + 1);
  const enYogun = [...dosyaBasi.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);

  const toplam = kullanilan.size + sarilmamis.length;
  const oran = toplam === 0 ? 0 : Math.round((kullanilan.size / toplam) * 100);

  console.log(`Sarılmış metin   : ${kullanilan.size}`);
  console.log(`Sarılmamış metin : ${sarilmamis.length}   (yaklaşık, yorumlar hariç)`);
  console.log(`İlerleme         : %${oran}`);
  console.log(`Sözlükte         : ${sozluk.size} anahtar`);
  console.log(`EKSİK çeviri     : ${eksik.length}   (t() ile sarılı, sözlükte yok)`);
  console.log(`ARTIK anahtar    : ${artik.length}   (sözlükte var, kodda yok)`);
  if (sablonUyarilari.length) {
    console.log(`\n⚠ Şablon dizesi t() içinde (anahtar olamaz): ${sablonUyarilari.length}`);
    for (const u of sablonUyarilari.slice(0, 5)) console.log(`   ${u}`);
  }
  if (enYogun.length) {
    console.log("\nEn çok sarılmamış metin olan dosyalar:");
    for (const [dosya, sayi] of enYogun) console.log(`  ${String(sayi).padStart(4)}  ${dosya}`);
  }
}

// EKSİK çeviri bir hatadır: sarılmış ama çevrilmemiş metin, İngilizce arayüzde
// Türkçe görünür. CI bunu kırmızıya düşürsün diye çıkış kodu veriyoruz.
if (bayrak === "--ci" && eksik.length) process.exit(1);
