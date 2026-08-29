#!/usr/bin/env node
/**
 * DEMO ANLIK GÖRÜNTÜSÜNÜ ANONİMLEŞTİRİR.
 *
 *   node scripts/demo-anonimlestir.mjs            # dosyayı yerinde temizler
 *   node scripts/demo-anonimlestir.mjs --rapor    # yalnızca sayar, yazmaz
 *
 * NEDEN VAR: `database/demo/celikhan-demo.json` demo şirketinin gerçek
 * verisinden alınıyor ve bu depo HERKESE AÇIK. Anlık görüntüde müşteri/tedarikçi
 * firmaların gerçek e-postaları, telefonları, vergi numaraları ve iletişim
 * kişilerinin adları vardı. Bunlar demo için gerekli DEĞİL (demo "dolu görünsün"
 * istiyor, "gerçek olsun" değil) ama depoya girdiklerinde geri alınamaz biçimde
 * yayımlanmış oluyorlar.
 *
 * NEDEN SNAPSHOT SCRIPTİNİN İÇİNDEN ÇAĞRILIYOR (bkz. demo-anlik-goruntu-al.mjs):
 * ayrı bir adım olsaydı bir sonraki anlık görüntüde unutulur ve sızıntı sessizce
 * geri gelirdi. Temizlik, dosyanın yazılma yolunun üstünde durmalı.
 *
 * NEYE DOKUNMAZ: `@celikhan.test` hesapları (zaten uydurma; `.test` ayrılmış bir
 * alan adı) ve onların password_hash'leri — demo girişi bunlarla çalışıyor.
 *
 * EŞLEME KARARLI: aynı girdi her çalıştırmada aynı sahte değere düşer, böylece
 * iki anlık görüntü arasındaki fark gerçek veri değişikliğini gösterir, sahte
 * isimlerin yeniden dağıtılmasını değil.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FIRMALAR = [
  "Akgün Yapı Malzemeleri", "Beyaz Liman Turizm", "Cengiz Metal İşleme", "Deniz Kıyı Otelcilik",
  "Ege Panorama Sağlık", "Fidan Tarım Ürünleri", "Gökkuşağı Tekstil", "Hisar Endüstriyel Mutfak",
  "Işıklar Elektrik Sistemleri", "Jale Gıda Toptan", "Kavak Lojistik", "Lodos Denizcilik",
  "Marmara Cam Sanayi", "Nilüfer Temizlik Hizmetleri", "Orkinos Su Ürünleri", "Pusula Danışmanlık",
  "Rüzgargülü Enerji", "Selvi Mobilya", "Toros Nakliyat", "Umut Ambalaj",
  "Üzümlü Bağcılık", "Vadi İnşaat Taahhüt", "Yıldıztepe Makine", "Zeytindalı Gıda",
];

const KISILER = [
  "Emre Aydın", "Selin Korkmaz", "Burak Şen", "Deniz Yavuz", "Ceren Aksoy", "Kaan Erdoğan",
  "Melis Tunç", "Onur Balcı", "Pelin Duman", "Serkan Ateş", "Tuğçe Kaplan", "Volkan Özsoy",
  "Yasemin Arı", "Zeki Turan", "Aslı Bulut", "Cem Yıldırım", "Derya Koç", "Ege Sarı",
  "Funda Acar", "Gökhan Uzun",
];

const VERGI_DAIRELERI = ["Bayraklı", "Konak", "Çankaya", "Kadıköy", "Nilüfer", "Seyhan"];
const ILCELER = ["Bornova", "Karşıyaka", "Çiğli", "Buca", "Gaziemir", "Balçova"];

/** Türkçe harfleri e-posta/alan adında kullanılabilir hale getirir. */
function sadelestir(metin) {
  return metin
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u")
    .replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "");
}

/** Girdiye göre kararlı bir sayı — havuzdan hep aynı öğeyi seçmek için. */
function ozet(metin) {
  let h = 0;
  for (const ch of metin) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h;
}

class Sozluk {
  constructor(havuz, sonek = "") {
    this.havuz = havuz;
    this.sonek = sonek;
    this.eslesme = new Map();
  }
  al(gercek) {
    if (this.eslesme.has(gercek)) return this.eslesme.get(gercek);
    // Çakışma olursa bir sonrakine kay: iki gerçek firma tek sahte ada düşerse
    // demo verisi kendi içinde tutarsız görünürdü.
    let i = ozet(gercek) % this.havuz.length;
    let aday = this.havuz[i];
    const kullanilan = new Set(this.eslesme.values());
    let tur = 0;
    while (kullanilan.has(aday) && tur < this.havuz.length) {
      i = (i + 1) % this.havuz.length;
      aday = this.havuz[i];
      tur++;
    }
    // Havuz tükendiyse numaralandır — sessizce tekrar etmesin.
    if (kullanilan.has(aday)) aday = `${aday} ${this.eslesme.size + 1}`;
    const deger = aday + this.sonek;
    this.eslesme.set(gercek, deger);
    return deger;
  }
}

const EPOSTA = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/**
 * Telefon deseni — BİLEREK DAR.
 *
 * AYIKLANAN HATA: gevşek bir desen ("10-12 hane say") uuid'lerin ve tarihlerin
 * içine giriyor, ilk denemede 8109 sahte eşleşme üretiyordu; yani veriyi
 * temizlemek yerine bozuyordu. Artık başında `+90` ya da `0` olması ZORUNLU,
 * alan kodu gerçek bir Türkiye kodu (5xx cep, 2xx-4xx sabit) ve iki yanında
 * rakam/tire olmamalı — `ce110000-0000-...` gibi diziler eşleşmiyor.
 */
const TELEFON = /(?<![\d\-])(?:\+90[\s.\-]?|0)\(?([2-5]\d{2})\)?[\s.\-]?\d{3}[\s.\-]?\d{2}[\s.\-]?\d{2}(?![\d\-])/g;
/** Kimlik/zaman damgası görünümlü metinlerde telefon aranmaz. */
const KIMLIK_GORUNUMLU = /^[0-9a-f]{8}-[0-9a-f]{4}-|^\d{4}-\d{2}-\d{2}/i;
const KORUNAN_ALAN = "celikhan.test";

export function anonimlestir(veriKumesi) {
  const firmaSozlugu = new Sozluk(FIRMALAR);
  const kisiSozlugu = new Sozluk(KISILER);
  const epostaSozlugu = new Map();
  const telefonSozlugu = new Map();
  const sayac = { firma: 0, kisi: 0, eposta: 0, telefon: 0, vergi: 0, adres: 0, not: 0 };

  const tablo = (ad) => veriKumesi.find((t) => t.table === ad)?.rows ?? [];

  // 1) Gerçek firma ve kişi adları -> sahte karşılıkları. Adlar yalnızca kendi
  //    satırlarında değil, görev başlıklarında ve modül kayıtlarının serbest
  //    metinlerinde de geçiyor; o yüzden eşleme önce kurulup SONRA tüm metinlere
  //    uygulanıyor.
  const adEslemesi = new Map();
  for (const r of tablo("party")) {
    for (const alan of ["display_name", "legal_name"]) {
      const gercek = r[alan];
      if (typeof gercek === "string" && gercek.trim() && !adEslemesi.has(gercek)) {
        adEslemesi.set(gercek, firmaSozlugu.al(gercek));
      }
    }
  }
  for (const r of tablo("party_contact")) {
    const gercek = r.name;
    if (typeof gercek === "string" && gercek.trim() && !adEslemesi.has(gercek)) {
      adEslemesi.set(gercek, kisiSozlugu.al(gercek));
    }
  }
  // Uzun adlar önce: "Ege Panorama" kısa adı, "Ege Panorama Sağlık"ın içini
  // yiyip yarım bir sonuç bırakmasın.
  const adlarUzunOnce = [...adEslemesi.keys()].sort((a, b) => b.length - a.length);

  const sahteEposta = (gercek) => {
    if (gercek.toLowerCase().endsWith(`@${KORUNAN_ALAN}`)) return gercek;
    if (epostaSozlugu.has(gercek)) return epostaSozlugu.get(gercek);
    const n = epostaSozlugu.size + 1;
    const kisi = KISILER[ozet(gercek) % KISILER.length];
    const [ad, soyad = "ornek"] = kisi.split(" ");
    const deger = `${sadelestir(ad)}.${sadelestir(soyad)}${n}@ornekfirma.test`;
    epostaSozlugu.set(gercek, deger);
    return deger;
  };

  const sahteTelefon = (gercek) => {
    if (telefonSozlugu.has(gercek)) return telefonSozlugu.get(gercek);
    const n = telefonSozlugu.size;
    const deger = `+90 555 ${String(100 + (n % 900)).padStart(3, "0")} ${String(10 + (n % 90)).padStart(2, "0")} ${String(10 + ((n * 7) % 90)).padStart(2, "0")}`;
    telefonSozlugu.set(gercek, deger);
    return deger;
  };

  // 2) Her metin değerinden geç: adlar, e-postalar ve telefonlar süpürülür.
  //    Alan bazlı temizlik yetmiyordu — aynı bilgi `notes` gibi serbest metin
  //    alanlarının içinde de duruyor.
  const metniTemizle = (metin) => {
    let sonuc = metin;
    for (const gercek of adlarUzunOnce) {
      if (sonuc.includes(gercek)) {
        sonuc = sonuc.split(gercek).join(adEslemesi.get(gercek));
        sayac.firma++;
      }
    }
    sonuc = sonuc.replace(EPOSTA, (e) => {
      if (e.toLowerCase().endsWith(`@${KORUNAN_ALAN}`)) return e;
      sayac.eposta++;
      return sahteEposta(e);
    });
    if (!KIMLIK_GORUNUMLU.test(sonuc)) {
      sonuc = sonuc.replace(TELEFON, (t) => {
        const rakam = t.replace(/\D/g, "");
        if (rakam.length < 10 || rakam.length > 12) return t;
        sayac.telefon++;
        return sahteTelefon(t);
      });
    }
    return sonuc;
  };

  const gez = (dugum) => {
    if (typeof dugum === "string") return metniTemizle(dugum);
    if (Array.isArray(dugum)) return dugum.map(gez);
    if (dugum && typeof dugum === "object") {
      const yeni = {};
      for (const [k, v] of Object.entries(dugum)) yeni[k] = gez(v);
      return yeni;
    }
    return dugum;
  };

  const temiz = veriKumesi.map((t) => ({ table: t.table, rows: gez(t.rows) }));

  // 3) Alan bazlı, metin süpürmesinin yakalayamayacağı kimlikler.
  for (const r of temiz.find((t) => t.table === "party")?.rows ?? []) {
    if (r.tax_number) {
      // Kararlı ama uydurma 10 hane. Gerçek VKN/TCKN depoya girmemeli.
      r.tax_number = String(1000000000 + (ozet(String(r.tax_number)) % 8999999999)).slice(0, 10);
      sayac.vergi++;
    }
    if (r.tax_office) r.tax_office = VERGI_DAIRELERI[ozet(String(r.tax_office)) % VERGI_DAIRELERI.length];
    if (r.address) {
      const i = ozet(String(r.address));
      r.address = `${ILCELER[i % ILCELER.length]} / İzmir, ${100 + (i % 800)}. Sokak No: ${1 + (i % 60)}`;
      sayac.adres++;
    }
    if (r.website) r.website = `https://${sadelestir(r.display_name ?? "ornek")}.test`;
    // Serbest not: adlar/e-postalar yukarıda temizlendi ama geri kalanı da
    // gerçek bir iş yazışması olabilir. Demo için içeriğin kendisi gerekmiyor.
    if (r.notes) { r.notes = "Demo kaydı — örnek not."; sayac.not++; }
  }
  for (const r of temiz.find((t) => t.table === "party_contact")?.rows ?? []) {
    if (r.notes) { r.notes = "Demo kaydı — örnek not."; sayac.not++; }
  }

  sayac.kisi = kisiSozlugu.eslesme.size;
  sayac.firma = firmaSozlugu.eslesme.size;
  return { veri: temiz, sayac };
}

// --------------------------------------------------------------------- CLI
const buDosya = fileURLToPath(import.meta.url);
if (process.argv[1] === buDosya) {
  const kok = join(dirname(buDosya), "..");
  const hedef = join(kok, "database/demo/celikhan-demo.json");
  const { veri, sayac } = anonimlestir(JSON.parse(readFileSync(hedef, "utf8")));
  console.log(
    `firma: ${sayac.firma}  kişi: ${sayac.kisi}  e-posta: ${sayac.eposta}  ` +
      `telefon: ${sayac.telefon}  vergi no: ${sayac.vergi}  adres: ${sayac.adres}  not: ${sayac.not}`
  );
  if (process.argv.includes("--rapor")) {
    console.log("Rapor modu: dosya yazılmadı.");
  } else {
    writeFileSync(hedef, JSON.stringify(veri));
    console.log(`Anonimleştirildi: ${hedef}`);
  }
}
