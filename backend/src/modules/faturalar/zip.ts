/**
 * En küçük ZIP yazıcısı — sıkıştırmasız ("store").
 *
 * NEDEN PAKET YOK: bu repoda test koşucusundan e-posta istemcisine kadar her
 * şey bağımlılık eklemeden yazıldı (bkz. CLAUDE.md, email.service.ts). ZIP'in
 * kendisi zaten basit bir kapsayıcı; asıl iş sıkıştırmadır ve BURADA
 * SIKIŞTIRMANIN FAYDASI YOK: arşive giren her şey PDF ya da JPEG, ikisi de
 * zaten sıkıştırılmış. Deflate uygulamak hem yüzlerce satır hem de kazancı
 * ölçülemeyen bir CPU yükü olurdu.
 *
 * Sınır: tek dosya da toplam da 4 GB'ın altında olmalı (ZIP64 yok). Ay sonu
 * fatura arşivi için fazlasıyla yeterli; çağıran zaten çok daha düşük bir
 * tavan uyguluyor (bkz. ARSIV_TAVANI).
 */

/** CRC-32 (IEEE 802.3) — ZIP her girdi için bunu istiyor. */
const CRC_TABLOSU = (() => {
  const tablo = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tablo[i] = c;
  }
  return tablo;
})();

export function crc32(buf: Buffer): number {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLOSU[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** Tarih/saat DOS biçiminde. 1980 öncesi temsil edilemiyor; taban ona sabitli. */
function dosTarihi(d: Date): { saat: number; tarih: number } {
  const yil = Math.max(1980, d.getFullYear());
  return {
    saat: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    tarih: ((yil - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export interface ZipGirdisi {
  /** Arşiv içindeki yol. Türkçe karakter serbest: UTF-8 bayrağı açık. */
  ad: string;
  icerik: Buffer;
  tarih?: Date;
}

/**
 * Aynı adın ikinci kez gelmesi.
 *
 * İki farklı faturanın eki aynı adı taşıyabiliyor (telefondan çekilen her
 * fotoğraf "image.jpg"). Üzerine yazmak belge kaybettirir, hata vermek ay sonu
 * gönderimini tamamen durdururdu; ad numaralanıyor.
 */
function benzersizAd(ad: string, kullanilan: Set<string>): string {
  if (!kullanilan.has(ad)) {
    kullanilan.add(ad);
    return ad;
  }
  const nokta = ad.lastIndexOf(".");
  const govde = nokta > 0 ? ad.slice(0, nokta) : ad;
  const uzanti = nokta > 0 ? ad.slice(nokta) : "";
  for (let i = 2; ; i++) {
    const aday = `${govde} (${i})${uzanti}`;
    if (!kullanilan.has(aday)) {
      kullanilan.add(aday);
      return aday;
    }
  }
}

export function zipOlustur(girdiler: ZipGirdisi[]): Buffer {
  const yerel: Buffer[] = [];
  const merkez: Buffer[] = [];
  const kullanilan = new Set<string>();
  let ofset = 0;

  for (const girdi of girdiler) {
    const ad = Buffer.from(benzersizAd(girdi.ad, kullanilan), "utf8");
    const { saat, tarih } = dosTarihi(girdi.tarih ?? new Date());
    const crc = crc32(girdi.icerik);
    const boy = girdi.icerik.length;

    const baslik = Buffer.alloc(30);
    baslik.writeUInt32LE(0x04034b50, 0); // yerel başlık imzası
    baslik.writeUInt16LE(20, 4); // gereken sürüm: 2.0
    baslik.writeUInt16LE(0x0800, 6); // bayrak: ad ve yorum UTF-8
    baslik.writeUInt16LE(0, 8); // yöntem: 0 = store
    baslik.writeUInt16LE(saat, 10);
    baslik.writeUInt16LE(tarih, 12);
    baslik.writeUInt32LE(crc, 14);
    baslik.writeUInt32LE(boy, 18); // sıkıştırılmış boy = ham boy (store)
    baslik.writeUInt32LE(boy, 22);
    baslik.writeUInt16LE(ad.length, 26);
    baslik.writeUInt16LE(0, 28); // ek alan yok
    yerel.push(baslik, ad, girdi.icerik);

    const kayit = Buffer.alloc(46);
    kayit.writeUInt32LE(0x02014b50, 0); // merkezî dizin imzası
    kayit.writeUInt16LE(20, 4); // oluşturan sürüm
    kayit.writeUInt16LE(20, 6); // gereken sürüm
    kayit.writeUInt16LE(0x0800, 8);
    kayit.writeUInt16LE(0, 10);
    kayit.writeUInt16LE(saat, 12);
    kayit.writeUInt16LE(tarih, 14);
    kayit.writeUInt32LE(crc, 16);
    kayit.writeUInt32LE(boy, 20);
    kayit.writeUInt32LE(boy, 24);
    kayit.writeUInt16LE(ad.length, 28);
    kayit.writeUInt16LE(0, 30); // ek alan
    kayit.writeUInt16LE(0, 32); // yorum
    kayit.writeUInt16LE(0, 34); // disk numarası
    kayit.writeUInt16LE(0, 36); // iç öznitelik
    kayit.writeUInt32LE(0, 38); // dış öznitelik
    kayit.writeUInt32LE(ofset, 42); // yerel başlığın dosyadaki yeri
    merkez.push(kayit, ad);

    ofset += baslik.length + ad.length + boy;
  }

  const merkezBoyu = merkez.reduce((t, b) => t + b.length, 0);
  const son = Buffer.alloc(22);
  son.writeUInt32LE(0x06054b50, 0); // EOCD imzası
  son.writeUInt16LE(0, 4);
  son.writeUInt16LE(0, 6);
  son.writeUInt16LE(girdiler.length, 8);
  son.writeUInt16LE(girdiler.length, 10);
  son.writeUInt32LE(merkezBoyu, 12);
  son.writeUInt32LE(ofset, 16);
  son.writeUInt16LE(0, 20); // yorum yok

  return Buffer.concat([...yerel, ...merkez, son]);
}
