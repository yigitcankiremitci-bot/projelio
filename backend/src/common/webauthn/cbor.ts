/**
 * Asgari CBOR çözücü — yalnızca WebAuthn'ın ihtiyaç duyduğu kadarı.
 *
 * NEDEN ELLE YAZILDI: WebAuthn'da iki yerde CBOR var (kayıt yanıtındaki
 * attestationObject ve içindeki COSE açık anahtarı) ve ikisi de KÜÇÜK, KAPALI
 * bir alt küme kullanıyor: tamsayı, bayt dizisi, metin, dizi, eşleme. Bunun
 * için bir bağımlılık eklemek — hem de kimlik doğrulama yolunun tam ortasına —
 * bakım ve güvenlik açısından bu 90 satırdan pahalıdır. Repo geneli kural da
 * aynı yöne bakıyor (bkz. CLAUDE.md: yeni bağımlılık eklemeden yaz).
 *
 * BİLEREK DESTEKLENMEYENLER:
 *   - Belirsiz uzunluklu (indefinite) diziler/eşlemeler: authenticator'lar
 *     üretmiyor ve kabul etmek, aynı veriyi iki farklı biçimde okumak demek.
 *   - Kayan sayı ve etiket (tag) dışındaki basit değerler: COSE anahtarında
 *     geçmiyor.
 *
 * Çözücü SIKI davranır: tanımadığı her şeyde hata atar. Sessizce yanlış
 * ayrıştırılan bir açık anahtar, doğrulamayı hiç yapmamakla aynı şey.
 */

/** En büyük kabul edilen dizi/eşleme/dize uzunluğu — şişme saldırısına karşı. */
const EN_COK_UZUNLUK = 1_000_000;

class Okuyucu {
  offset = 0;
  // Parametre özelliği (`constructor(private buf)`) KULLANILMIYOR: test
  // koşucusu tipleri silerek çalışıyor ve o kısayolu ayrıştıramıyor
  // (bkz. vade.ts'teki aynı not).
  private readonly buf: Buffer;

  constructor(buf: Buffer) {
    this.buf = buf;
  }

  private kalan(n: number): void {
    if (this.offset + n > this.buf.length) throw new Error("CBOR: veri beklenenden kısa");
  }

  bayt(): number {
    this.kalan(1);
    return this.buf[this.offset++];
  }

  /** Ek bilgi alanının (additional info) sayısal değeri. */
  private uzunluk(ek: number): number {
    if (ek < 24) return ek;
    if (ek === 24) return this.bayt();
    if (ek === 25) {
      this.kalan(2);
      const v = this.buf.readUInt16BE(this.offset);
      this.offset += 2;
      return v;
    }
    if (ek === 26) {
      this.kalan(4);
      const v = this.buf.readUInt32BE(this.offset);
      this.offset += 4;
      return v;
    }
    if (ek === 27) {
      this.kalan(8);
      const v = this.buf.readBigUInt64BE(this.offset);
      this.offset += 8;
      if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("CBOR: sayı çok büyük");
      return Number(v);
    }
    // 28-30 ayrılmış, 31 belirsiz uzunluk.
    throw new Error(`CBOR: desteklenmeyen uzunluk biçimi (${ek})`);
  }

  private dizeyiOku(n: number): Buffer {
    if (n > EN_COK_UZUNLUK) throw new Error("CBOR: dize çok uzun");
    this.kalan(n);
    const dilim = this.buf.subarray(this.offset, this.offset + n);
    this.offset += n;
    return dilim;
  }

  oku(): unknown {
    const ilk = this.bayt();
    const tur = ilk >> 5;
    const ek = ilk & 0x1f;

    switch (tur) {
      case 0:
        return this.uzunluk(ek);
      // Negatif tamsayı: -1 - n. COSE'da algoritma ve eğri kimlikleri böyle.
      case 1:
        return -1 - this.uzunluk(ek);
      case 2:
        return this.dizeyiOku(this.uzunluk(ek));
      case 3:
        return this.dizeyiOku(this.uzunluk(ek)).toString("utf8");
      case 4: {
        const n = this.uzunluk(ek);
        if (n > EN_COK_UZUNLUK) throw new Error("CBOR: dizi çok uzun");
        const sonuc: unknown[] = [];
        for (let i = 0; i < n; i++) sonuc.push(this.oku());
        return sonuc;
      }
      case 5: {
        const n = this.uzunluk(ek);
        if (n > EN_COK_UZUNLUK) throw new Error("CBOR: eşleme çok uzun");
        // Map (düz nesne değil): COSE anahtarlarının anahtarları TAMSAYI ve
        // nesneye çevirince "-1" ile "-1" metni birbirine karışırdı.
        const sonuc = new Map<unknown, unknown>();
        for (let i = 0; i < n; i++) {
          const anahtar = this.oku();
          sonuc.set(typeof anahtar === "object" ? String(anahtar) : anahtar, this.oku());
        }
        return sonuc;
      }
      // Etiket: değeri süslemekten başka bir şey yapmıyor, içeriği okunur.
      case 6: {
        this.uzunluk(ek);
        return this.oku();
      }
      case 7: {
        if (ek === 20) return false;
        if (ek === 21) return true;
        if (ek === 22) return null;
        if (ek === 23) return undefined;
        throw new Error(`CBOR: desteklenmeyen basit değer (${ek})`);
      }
      default:
        throw new Error("CBOR: bilinmeyen tür");
    }
  }
}

/**
 * İlk CBOR öğesini çözer ve kaç bayt tükettiğini söyler.
 *
 * Tüketilen bayt sayısı gerekiyor çünkü authenticatorData'nın sonunda COSE
 * anahtarından SONRA uzantı verisi olabiliyor: anahtarın nerede bittiğini
 * ancak çözücü bilir.
 */
export function cborIlkiCoz(buf: Buffer): { deger: unknown; okunan: number } {
  const okuyucu = new Okuyucu(buf);
  const deger = okuyucu.oku();
  return { deger, okunan: okuyucu.offset };
}

/** Tek bir CBOR öğesi çözer; artan bayt varsa hata verir. */
export function cborCoz(buf: Buffer): unknown {
  const { deger, okunan } = cborIlkiCoz(buf);
  if (okunan !== buf.length) throw new Error("CBOR: beklenmeyen fazla veri");
  return deger;
}
