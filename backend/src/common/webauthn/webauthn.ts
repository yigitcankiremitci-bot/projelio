import { createHash, createPublicKey, verify as kriptoDogrula, timingSafeEqual } from "node:crypto";
import { cborCoz, cborIlkiCoz } from "./cbor";

/**
 * Geçiş anahtarı (WebAuthn / FIDO2) doğrulaması.
 *
 * NEDEN ELLE: doğrulamanın tamamı standart ilkellerden oluşuyor — SHA-256,
 * bir imza kontrolü ve CBOR ayrıştırması. node:crypto anahtarı JWK'dan
 * kurabildiği için (aşağıya bakın) DER elle üretmek de gerekmiyor. Kalan iş,
 * spesifikasyonun kontrol listesini sırayla uygulamak.
 *
 * ATTESTATION DOĞRULANMIYOR — bilinçli. Attestation ifadesi cihazın MODELİNİ
 * kanıtlar ("bu gerçek bir YubiKey 5"), kullanıcıyı değil; doğrulamak için
 * FIDO metadata servisine ve güncel kök sertifika listesine bağlanmak gerekir.
 * Bizim sorduğumuz soru "bu, kaydı yapan cihaz mı" ve onun cevabı imzada.
 * Kurumsal cihaz politikası gerekirse eklenir.
 *
 * SIRA ÖNEMLİ: her kontrol başarısızlıkta hata atar. Tek bir kontrolü atlamak
 * (ör. origin) doğrulamayı tamamen boşa çıkarır — imzayı başka bir sitede
 * toplanan bir yanıt da taşıyabilir.
 *
 * Bkz. https://www.w3.org/TR/webauthn-2/#sctn-verifying-assertion
 */

// ============================================================ COSE tabloları

/** COSE anahtar türü (label 1). */
const KTY_OKP = 1;
const KTY_EC2 = 2;
const KTY_RSA = 3;

/** COSE eğri kimliği (label -1) → JWK eğri adı. */
const EGRILER: Record<number, string> = { 1: "P-256", 2: "P-384", 3: "P-521", 6: "Ed25519" };

/**
 * COSE algoritma kimliği → doğrulamada kullanılacak özet.
 *
 * `null` = özet fonksiyonu imzanın kendi içinde (Ed25519). Listede olmayan bir
 * algoritma reddedilir: tanımadığımız bir algoritmayı "herhalde SHA-256"
 * varsayarak doğrulamak, imzayı hiç kontrol etmemekten farksız.
 */
const ALGORITMALAR: Record<number, { ozet: string | null; ad: string }> = {
  [-7]: { ozet: "sha256", ad: "ES256" },
  [-35]: { ozet: "sha384", ad: "ES384" },
  [-36]: { ozet: "sha512", ad: "ES512" },
  [-8]: { ozet: null, ad: "EdDSA" },
  [-257]: { ozet: "sha256", ad: "RS256" },
  [-258]: { ozet: "sha384", ad: "RS384" },
  [-259]: { ozet: "sha512", ad: "RS512" },
};

/** Tarayıcıya "şu algoritmaları kabul ediyoruz" derken gönderilen liste. */
export const DESTEKLENEN_ALGORITMALAR = [-7, -257, -8];

// ============================================================ Küçük yardımcılar

export function b64urlCoz(deger: string): Buffer {
  return Buffer.from(deger, "base64url");
}

export function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

/**
 * İki dizeyi sabit sürede karşılaştırır.
 *
 * Meydan okuma (challenge) karşılaştırmasında kullanılıyor: uzunlukları farklı
 * olabildiği için önce uzunluk bakılıyor, o da tek başına sır değil.
 */
function esitMi(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function sha256(veri: Buffer): Buffer {
  return createHash("sha256").update(veri).digest();
}

// ============================================================ authenticatorData

export interface AuthenticatorVerisi {
  rpIdHash: Buffer;
  /** Kullanıcı hazır bulundu (dokundu/tıkladı). */
  userPresent: boolean;
  /** Kullanıcı DOĞRULANDI (biyometri / PIN). Kasa kilidinin şartı. */
  userVerified: boolean;
  signCount: number;
  credentialId?: Buffer;
  /** COSE eşlemesi — açık anahtar. Yalnızca kayıt yanıtında dolu. */
  coseKey?: Map<unknown, unknown>;
  aaguid?: string;
}

/**
 * authenticatorData'yı ayrıştırır.
 *
 * Yerleşim (WebAuthn §6.1): rpIdHash(32) | flags(1) | signCount(4) |
 * [aaguid(16) | credIdLen(2) | credId | COSE anahtar] | [uzantılar]
 */
export function authenticatorVerisiniCoz(buf: Buffer): AuthenticatorVerisi {
  if (buf.length < 37) throw new Error("Geçiş anahtarı yanıtı bozuk: authenticatorData çok kısa");

  const bayraklar = buf[32];
  const sonuc: AuthenticatorVerisi = {
    rpIdHash: buf.subarray(0, 32),
    userPresent: (bayraklar & 0x01) !== 0,
    userVerified: (bayraklar & 0x04) !== 0,
    signCount: buf.readUInt32BE(33),
  };

  // AT (attested credential data) bayrağı: yalnızca kayıt yanıtında set.
  if ((bayraklar & 0x40) === 0) return sonuc;

  if (buf.length < 55) throw new Error("Geçiş anahtarı yanıtı bozuk: kimlik verisi eksik");
  const aaguid = buf.subarray(37, 53);
  const kimlikUzunlugu = buf.readUInt16BE(53);
  if (buf.length < 55 + kimlikUzunlugu) throw new Error("Geçiş anahtarı yanıtı bozuk: kimlik uzunluğu tutmuyor");

  sonuc.aaguid = aaguid.toString("hex");
  sonuc.credentialId = buf.subarray(55, 55 + kimlikUzunlugu);

  // Anahtardan sonra uzantı verisi gelebilir; nerede bittiğini çözücü söyler.
  const { deger } = cborIlkiCoz(buf.subarray(55 + kimlikUzunlugu));
  if (!(deger instanceof Map)) throw new Error("Geçiş anahtarı yanıtı bozuk: açık anahtar okunamadı");
  sonuc.coseKey = deger;

  return sonuc;
}

// ============================================================ COSE → açık anahtar

/**
 * COSE anahtarını node:crypto anahtarına çevirir ve saklanacak biçimi üretir.
 *
 * JWK ÜZERİNDEN gidiliyor: node:crypto JWK'dan anahtar kurabiliyor, yani
 * ASN.1/DER'i elle kodlamak gerekmiyor. DER'i elle yazmak bu dosyanın en
 * hataya açık kısmı olurdu ve hatası "imza her zaman geçersiz" ya da daha
 * kötüsü "her imza geçerli" olarak çıkardı.
 *
 * Saklama biçimi SPKI DER (base64): doğrulama anında tek satırda geri kuruluyor
 * ve algoritmadan bağımsız tek bir sütun yetiyor.
 */
export function coseAnahtariniCoz(cose: Map<unknown, unknown>): { spkiDer: string; algorithm: number } {
  const kty = cose.get(1);
  const alg = cose.get(3);
  if (typeof alg !== "number" || !ALGORITMALAR[alg]) {
    throw new Error("Bu cihazın imza algoritması desteklenmiyor");
  }

  const bayt = (etiket: number): Buffer => {
    const deger = cose.get(etiket);
    if (!Buffer.isBuffer(deger)) throw new Error("Geçiş anahtarı yanıtı bozuk: anahtar alanı eksik");
    return deger;
  };

  let jwk: Record<string, string>;
  if (kty === KTY_EC2) {
    const egri = EGRILER[cose.get(-1) as number];
    if (!egri) throw new Error("Bu cihazın eğrisi desteklenmiyor");
    jwk = { kty: "EC", crv: egri, x: b64url(bayt(-2)), y: b64url(bayt(-3)) };
  } else if (kty === KTY_RSA) {
    jwk = { kty: "RSA", n: b64url(bayt(-1)), e: b64url(bayt(-2)) };
  } else if (kty === KTY_OKP) {
    const egri = EGRILER[cose.get(-1) as number];
    if (egri !== "Ed25519") throw new Error("Bu cihazın eğrisi desteklenmiyor");
    jwk = { kty: "OKP", crv: "Ed25519", x: b64url(bayt(-2)) };
  } else {
    throw new Error("Bu cihazın anahtar türü desteklenmiyor");
  }

  const anahtar = createPublicKey({ key: jwk as any, format: "jwk" });
  return { spkiDer: anahtar.export({ type: "spki", format: "der" }).toString("base64"), algorithm: alg };
}

// ============================================================ İstemci verisi

interface IstemciVerisi {
  type: string;
  challenge: string;
  origin: string;
}

/**
 * clientDataJSON'u çözer ve üç şeyi doğrular: işlem türü, meydan okuma, origin.
 *
 * ORIGIN NEDEN LİSTE: yerelde geliştirme adresi, üretimde uygulama adresi
 * geçerli ve ikisi aynı kurulumda bulunabiliyor (önizleme dağıtımları).
 * Yine de KAPALI bir liste: "her origin" demek, kullanıcıyı kandırıp başka bir
 * siteden imza toplayan birine kapıyı açmak olurdu.
 */
function istemciVerisiniDogrula(
  clientDataJSON: Buffer,
  beklenenTur: "webauthn.create" | "webauthn.get",
  beklenenChallenge: string,
  izinliOriginler: string[]
): IstemciVerisi {
  let veri: IstemciVerisi;
  try {
    veri = JSON.parse(clientDataJSON.toString("utf8"));
  } catch {
    throw new Error("Geçiş anahtarı yanıtı bozuk: istemci verisi okunamadı");
  }

  if (veri.type !== beklenenTur) throw new Error("Geçiş anahtarı yanıtı bu işleme ait değil");
  if (!veri.challenge || !esitMi(veri.challenge, beklenenChallenge)) {
    throw new Error("Doğrulama isteği eşleşmedi; lütfen yeniden deneyin");
  }
  const origin = veri.origin?.replace(/\/+$/, "").toLowerCase();
  if (!origin || !izinliOriginler.includes(origin)) {
    throw new Error("Doğrulama beklenen adresten gelmedi");
  }
  return veri;
}

// ============================================================ Kayıt

export interface KayitGirdisi {
  clientDataJSON: string;
  attestationObject: string;
  beklenenChallenge: string;
  izinliOriginler: string[];
  rpId: string;
}

export interface KayitliAnahtar {
  credentialId: string;
  spkiDer: string;
  algorithm: number;
  signCount: number;
  aaguid?: string;
}

export function kaydiDogrula(girdi: KayitGirdisi): KayitliAnahtar {
  istemciVerisiniDogrula(
    b64urlCoz(girdi.clientDataJSON),
    "webauthn.create",
    girdi.beklenenChallenge,
    girdi.izinliOriginler
  );

  const attestation = cborCoz(b64urlCoz(girdi.attestationObject));
  if (!(attestation instanceof Map)) throw new Error("Geçiş anahtarı yanıtı bozuk: attestation okunamadı");
  const authData = attestation.get("authData");
  if (!Buffer.isBuffer(authData)) throw new Error("Geçiş anahtarı yanıtı bozuk: authenticatorData yok");

  const veri = authenticatorVerisiniCoz(authData);
  if (!veri.rpIdHash.equals(sha256(Buffer.from(girdi.rpId)))) {
    throw new Error("Geçiş anahtarı başka bir site için oluşturulmuş");
  }
  if (!veri.userPresent) throw new Error("Cihaz kullanıcı onayı almadı");
  // KULLANICI DOĞRULAMASI KAYITTA DA ŞART. Kilidi açmak için UV gerekiyor;
  // UV yapamayan bir cihaz kaydedilirse kullanıcı kaydı başarıyla tamamlar ve
  // sonra her kilit açma denemesinde takılır — sebebi de görünmez. Hatayı
  // kayıt anında vermek, sonra vermekten iyidir.
  if (!veri.userVerified) {
    throw new Error("Cihaz sizi doğrulamadı. Ekran kilidi (biyometri ya da PIN) açık bir cihaz kullanın.");
  }
  if (!veri.credentialId || !veri.coseKey) throw new Error("Geçiş anahtarı yanıtı bozuk: anahtar gelmedi");

  const { spkiDer, algorithm } = coseAnahtariniCoz(veri.coseKey);
  return {
    credentialId: b64url(veri.credentialId),
    spkiDer,
    algorithm,
    signCount: veri.signCount,
    aaguid: veri.aaguid,
  };
}

// ============================================================ Doğrulama (assertion)

export interface ImzaGirdisi {
  clientDataJSON: string;
  authenticatorData: string;
  signature: string;
  beklenenChallenge: string;
  izinliOriginler: string[];
  rpId: string;
  /** Kayıtta saklanan açık anahtar (SPKI DER, base64). */
  spkiDer: string;
  algorithm: number;
  /** Veritabanındaki sayaç. Yeni sayaç bunu geçmezse cihaz klonlanmış olabilir. */
  kayitliSignCount: number;
}

export function imzayiDogrula(girdi: ImzaGirdisi): { signCount: number } {
  istemciVerisiniDogrula(
    b64urlCoz(girdi.clientDataJSON),
    "webauthn.get",
    girdi.beklenenChallenge,
    girdi.izinliOriginler
  );

  const authData = b64urlCoz(girdi.authenticatorData);
  const veri = authenticatorVerisiniCoz(authData);

  if (!veri.rpIdHash.equals(sha256(Buffer.from(girdi.rpId)))) {
    throw new Error("Doğrulama başka bir site için yapılmış");
  }
  if (!veri.userPresent) throw new Error("Cihaz kullanıcı onayı almadı");
  if (!veri.userVerified) {
    throw new Error("Cihaz sizi doğrulamadı. Parmak izi, yüz ya da PIN ile onaylamanız gerekiyor.");
  }

  const alg = ALGORITMALAR[girdi.algorithm];
  if (!alg) throw new Error("Bu cihazın imza algoritması desteklenmiyor");

  // İmzalanan veri: authenticatorData || SHA-256(clientDataJSON).
  const imzalanan = Buffer.concat([authData, sha256(b64urlCoz(girdi.clientDataJSON))]);
  const anahtar = createPublicKey({
    key: Buffer.from(girdi.spkiDer, "base64"),
    format: "der",
    type: "spki",
  });

  const gecerli = kriptoDogrula(alg.ozet, imzalanan, anahtar, b64urlCoz(girdi.signature));
  if (!gecerli) throw new Error("Geçiş anahtarı doğrulanamadı");

  // SAYAÇ GERİ GİTTİYSE cihaz klonlanmış olabilir. Çoğu platform
  // authenticator'ı (Touch ID, Windows Hello) sayacı hep 0 bırakıyor — bu
  // normaldir ve "0 iken 0" hâli kontrol edilmez, yoksa hiçbiri çalışmazdı.
  if (veri.signCount > 0 && girdi.kayitliSignCount > 0 && veri.signCount <= girdi.kayitliSignCount) {
    throw new Error("Geçiş anahtarı beklenmedik bir durumda; cihazı yeniden kaydedin");
  }

  return { signCount: veri.signCount };
}

/**
 * Origin listesinden RP ID (alan adı) çıkarır.
 *
 * RP ID, origin'in HOST kısmıdır: "https://app.projelio.app" → "app.projelio.app".
 * Ayrı bir ortam değişkeni zorunlu tutulmuyor; yanlış yazılmış bir RP ID'nin
 * belirtisi "cihaz hiç açılmıyor" oluyor ve sebebi hiçbir yerde görünmüyor.
 */
export function rpIdCikar(origin: string): string {
  try {
    return new URL(origin).hostname;
  } catch {
    return origin;
  }
}
