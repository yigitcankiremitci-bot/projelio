/**
 * Bağımlılıksız, SIKIŞTIRMASIZ ("store") zip yazıcısı.
 *
 * NEDEN: Dosyalar ekranında birden çok dosya/klasör indirmek için tek paket
 * gerekiyor. Ayrı ayrı indirmek tarayıcının "birden fazla indirme" engeline
 * takılıyor ve klasör yapısını kaybettiriyor. Fotoğraf/PDF zaten sıkışık
 * olduğundan sıkıştırma kazandırmıyor; yeni bağımlılık eklememek için de
 * yalnızca gereken kadarı yazıldı.
 *
 * Sınır: Zip64 YOK — toplam ve tek dosya 4 GB'ın altında olmalı (çağıran
 * bunu bellek gerekçesiyle zaten çok daha aşağıdan sınırlıyor).
 */

export interface ZipGirdisi {
  /** Zip içindeki yol; klasörler "/" ile ayrılır. */
  yol: string;
  veri: Uint8Array;
}

let crcTablosu: Uint32Array | null = null;

export function crc32(veri: Uint8Array): number {
  if (!crcTablosu) {
    crcTablosu = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTablosu[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < veri.length; i++) c = crcTablosu[(c ^ veri[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Aynı yol iki kez gelirse "ad (2).uzantı" — zip'te çakışan ad, açarken biri ötekini ezer. */
export function benzersizYollar(yollar: string[]): string[] {
  const gorulen = new Set<string>();
  return yollar.map((yol) => {
    let aday = yol;
    let n = 2;
    while (gorulen.has(aday.toLowerCase())) {
      const nokta = yol.lastIndexOf(".");
      const ayrim = yol.lastIndexOf("/");
      aday =
        nokta > ayrim + 1 ? `${yol.slice(0, nokta)} (${n})${yol.slice(nokta)}` : `${yol} (${n})`;
      n++;
    }
    gorulen.add(aday.toLowerCase());
    return aday;
  });
}

export function zipYaz(girdiler: ZipGirdisi[], tarih: Date = new Date()): Blob {
  const enc = new TextEncoder();
  const dosyaSaati =
    ((tarih.getHours() << 11) | (tarih.getMinutes() << 5) | (tarih.getSeconds() >> 1)) & 0xffff;
  const dosyaGunu =
    ((Math.max(0, tarih.getFullYear() - 1980) << 9) | ((tarih.getMonth() + 1) << 5) | tarih.getDate()) &
    0xffff;

  const parcalar: Uint8Array[] = [];
  const merkez: Uint8Array[] = [];
  let konum = 0;

  for (const g of girdiler) {
    const ad = enc.encode(g.yol);
    const crc = crc32(g.veri);

    const yerel = new DataView(new ArrayBuffer(30));
    yerel.setUint32(0, 0x04034b50, true);
    yerel.setUint16(4, 20, true);
    yerel.setUint16(6, 0x0800, true); // UTF-8 dosya adı
    yerel.setUint16(8, 0, true); // store
    yerel.setUint16(10, dosyaSaati, true);
    yerel.setUint16(12, dosyaGunu, true);
    yerel.setUint32(14, crc, true);
    yerel.setUint32(18, g.veri.length, true);
    yerel.setUint32(22, g.veri.length, true);
    yerel.setUint16(26, ad.length, true);
    yerel.setUint16(28, 0, true);
    parcalar.push(new Uint8Array(yerel.buffer), ad, g.veri);

    const m = new DataView(new ArrayBuffer(46));
    m.setUint32(0, 0x02014b50, true);
    m.setUint16(4, 20, true);
    m.setUint16(6, 20, true);
    m.setUint16(8, 0x0800, true);
    m.setUint16(10, 0, true);
    m.setUint16(12, dosyaSaati, true);
    m.setUint16(14, dosyaGunu, true);
    m.setUint32(16, crc, true);
    m.setUint32(20, g.veri.length, true);
    m.setUint32(24, g.veri.length, true);
    m.setUint16(28, ad.length, true);
    m.setUint32(42, konum, true);
    merkez.push(new Uint8Array(m.buffer), ad);

    konum += 30 + ad.length + g.veri.length;
  }

  const merkezBoyu = merkez.reduce((t, p) => t + p.length, 0);
  const son = new DataView(new ArrayBuffer(22));
  son.setUint32(0, 0x06054b50, true);
  son.setUint16(8, girdiler.length, true);
  son.setUint16(10, girdiler.length, true);
  son.setUint32(12, merkezBoyu, true);
  son.setUint32(16, konum, true);

  return new Blob([...parcalar, ...merkez, new Uint8Array(son.buffer)] as BlobPart[], {
    type: "application/zip",
  });
}
