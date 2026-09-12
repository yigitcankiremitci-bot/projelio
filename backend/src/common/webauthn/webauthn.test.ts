import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createHash, generateKeyPairSync, sign as kriptoImzala } from "node:crypto";
import { cborCoz } from "./cbor";
import { authenticatorVerisiniCoz, imzayiDogrula, kaydiDogrula } from "./webauthn";

/**
 * Geçiş anahtarı doğrulamasının testi — GERÇEK bir imza zinciriyle.
 *
 * Sahte authenticator burada kuruluyor: node:crypto ile bir P-256 anahtarı
 * üretilip, tarayıcının gönderdiği yanıtın baytları elle kurgulanıyor ve
 * imzalanıyor. Böylece doğrulama fiziksel bir cihaz olmadan uçtan uca
 * sınanabiliyor — kontrollerden BİRİNİ kaldırınca bu testlerden biri düşüyor.
 *
 * CBOR kodlayıcı yalnızca burada var: uygulama kodu CBOR ÜRETMİYOR, yalnızca
 * okuyor. Üreteci src'ye koymak, hiç çağrılmayan bir yol bırakmak olurdu.
 */

// ============================================================ Minik CBOR kodlayıcı

function cborBaslik(tur: number, uzunluk: number): Buffer {
  if (uzunluk < 24) return Buffer.from([(tur << 5) | uzunluk]);
  if (uzunluk < 256) return Buffer.from([(tur << 5) | 24, uzunluk]);
  const buf = Buffer.alloc(3);
  buf[0] = (tur << 5) | 25;
  buf.writeUInt16BE(uzunluk, 1);
  return buf;
}

function cborKodla(deger: unknown): Buffer {
  if (typeof deger === "number") {
    return deger >= 0 ? cborBaslik(0, deger) : cborBaslik(1, -1 - deger);
  }
  if (Buffer.isBuffer(deger)) return Buffer.concat([cborBaslik(2, deger.length), deger]);
  if (typeof deger === "string") {
    const b = Buffer.from(deger, "utf8");
    return Buffer.concat([cborBaslik(3, b.length), b]);
  }
  if (Array.isArray(deger)) {
    return Buffer.concat([cborBaslik(4, deger.length), ...deger.map(cborKodla)]);
  }
  if (deger instanceof Map) {
    const parcalar: Buffer[] = [cborBaslik(5, deger.size)];
    for (const [k, v] of deger) parcalar.push(cborKodla(k), cborKodla(v));
    return Buffer.concat(parcalar);
  }
  throw new Error("test kodlayıcısı bu türü bilmiyor");
}

// ============================================================ Sahte authenticator

const RP_ID = "app.projelio.app";
const ORIGIN = "https://app.projelio.app";
const CREDENTIAL_ID = Buffer.from("hesaplar-test-kimligi");

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const jwk = publicKey.export({ format: "jwk" }) as { x: string; y: string };

/** COSE biçiminde açık anahtar: kty=EC2, alg=ES256, crv=P-256, x, y. */
function coseAnahtar(): Buffer {
  return cborKodla(
    new Map<number, unknown>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, Buffer.from(jwk.x, "base64url")],
      [-3, Buffer.from(jwk.y, "base64url")],
    ])
  );
}

function rpIdHash(rpId = RP_ID): Buffer {
  return createHash("sha256").update(rpId).digest();
}

function authData(opts: { bayraklar: number; signCount: number; rpId?: string; kimlikli?: boolean }): Buffer {
  const bas = Buffer.alloc(37);
  rpIdHash(opts.rpId).copy(bas, 0);
  bas[32] = opts.bayraklar;
  bas.writeUInt32BE(opts.signCount, 33);
  if (!opts.kimlikli) return bas;

  const uzunluk = Buffer.alloc(2);
  uzunluk.writeUInt16BE(CREDENTIAL_ID.length, 0);
  return Buffer.concat([bas, Buffer.alloc(16, 7), uzunluk, CREDENTIAL_ID, coseAnahtar()]);
}

function istemciVerisi(tur: string, challenge: string, origin = ORIGIN): string {
  return Buffer.from(JSON.stringify({ type: tur, challenge, origin })).toString("base64url");
}

/** UP + UV + AT bayrakları: kayıt yanıtının olağan hâli. */
const KAYIT_BAYRAKLARI = 0x01 | 0x04 | 0x40;
/** UP + UV: doğrulama yanıtı. */
const IMZA_BAYRAKLARI = 0x01 | 0x04;

function kayitYaniti(challenge: string, bayraklar = KAYIT_BAYRAKLARI) {
  const attestation = cborKodla(
    new Map<string, unknown>([
      ["fmt", "none"],
      ["attStmt", new Map()],
      ["authData", authData({ bayraklar, signCount: 0, kimlikli: true })],
    ])
  );
  return {
    clientDataJSON: istemciVerisi("webauthn.create", challenge),
    attestationObject: attestation.toString("base64url"),
    beklenenChallenge: challenge,
    izinliOriginler: [ORIGIN],
    rpId: RP_ID,
  };
}

function imzaYaniti(
  challenge: string,
  kayitli: { spkiDer: string; algorithm: number },
  opts: { bayraklar?: number; signCount?: number; rpId?: string; origin?: string; kayitliSignCount?: number } = {}
) {
  const veri = authData({
    bayraklar: opts.bayraklar ?? IMZA_BAYRAKLARI,
    signCount: opts.signCount ?? 0,
    rpId: opts.rpId,
  });
  const clientDataJSON = istemciVerisi("webauthn.get", challenge, opts.origin);
  const imzalanan = Buffer.concat([
    veri,
    createHash("sha256").update(Buffer.from(clientDataJSON, "base64url")).digest(),
  ]);
  return {
    clientDataJSON,
    authenticatorData: veri.toString("base64url"),
    signature: kriptoImzala("sha256", imzalanan, privateKey).toString("base64url"),
    beklenenChallenge: challenge,
    izinliOriginler: [ORIGIN],
    rpId: RP_ID,
    spkiDer: kayitli.spkiDer,
    algorithm: kayitli.algorithm,
    kayitliSignCount: opts.kayitliSignCount ?? 0,
  };
}

// ============================================================ CBOR

test("CBOR: negatif tamsayı ve iç içe eşleme çözülür", () => {
  const kodlu = cborKodla(
    new Map<number, unknown>([
      [1, 2],
      [3, -7],
      [-1, new Map<number, unknown>([[1, 42]])],
    ])
  );
  const cozulmus = cborCoz(kodlu) as Map<unknown, unknown>;
  assert.equal(cozulmus.get(3), -7);
  assert.equal((cozulmus.get(-1) as Map<unknown, unknown>).get(1), 42);
});

test("CBOR: eksik veri sessizce geçmez", () => {
  assert.throws(() => cborCoz(Buffer.from([0x42, 0x01])), /kısa/);
});

test("CBOR: fazla bayt reddedilir", () => {
  assert.throws(() => cborCoz(Buffer.concat([cborKodla(1), Buffer.from([0x01])])), /fazla/);
});

// ============================================================ Kayıt

test("kayıt: açık anahtar ve kimlik çıkarılır", () => {
  const sonuc = kaydiDogrula(kayitYaniti("meydan-okuma-1"));
  assert.equal(sonuc.credentialId, CREDENTIAL_ID.toString("base64url"));
  assert.equal(sonuc.algorithm, -7);
  assert.ok(sonuc.spkiDer.length > 40);
  assert.equal(sonuc.aaguid, Buffer.alloc(16, 7).toString("hex"));
});

test("kayıt: kullanıcı doğrulaması yapılmayan cihaz kabul edilmez", () => {
  // UV bayrağı yok: kaydı kabul etseydik kilit açma her denemede takılırdı.
  assert.throws(() => kaydiDogrula(kayitYaniti("m", 0x01 | 0x40)), /doğrulamadı/);
});

test("kayıt: başka bir sitenin yanıtı kabul edilmez", () => {
  const yanit = { ...kayitYaniti("m"), rpId: "baska-site.example" };
  assert.throws(() => kaydiDogrula(yanit), /başka bir site/);
});

test("kayıt: meydan okuma eşleşmezse reddedilir", () => {
  const yanit = { ...kayitYaniti("dogru"), beklenenChallenge: "baska" };
  assert.throws(() => kaydiDogrula(yanit), /eşleşmedi/);
});

// ============================================================ Doğrulama

test("doğrulama: gerçek imza kabul edilir", () => {
  const kayitli = kaydiDogrula(kayitYaniti("m1"));
  const sonuc = imzayiDogrula(imzaYaniti("m2", kayitli, { signCount: 5 }));
  assert.equal(sonuc.signCount, 5);
});

test("doğrulama: kurcalanmış imza reddedilir", () => {
  const kayitli = kaydiDogrula(kayitYaniti("m1"));
  const girdi = imzaYaniti("m2", kayitli);
  // Tek baytı bozmak yetiyor: DER imzanın içeriği değişiyor.
  const bozuk = Buffer.from(girdi.signature, "base64url");
  bozuk[bozuk.length - 1] ^= 0xff;
  assert.throws(
    () => imzayiDogrula({ ...girdi, signature: bozuk.toString("base64url") }),
    /doğrulanamadı|beklenmedik/
  );
});

test("doğrulama: başka adresten gelen yanıt reddedilir", () => {
  const kayitli = kaydiDogrula(kayitYaniti("m1"));
  assert.throws(
    () => imzayiDogrula(imzaYaniti("m2", kayitli, { origin: "https://kotu-site.example" })),
    /beklenen adresten/
  );
});

test("doğrulama: rpId eşleşmezse reddedilir", () => {
  const kayitli = kaydiDogrula(kayitYaniti("m1"));
  assert.throws(() => imzayiDogrula(imzaYaniti("m2", kayitli, { rpId: "baska.example" })), /başka bir site/);
});

test("doğrulama: kullanıcı doğrulanmadıysa sır gösterilmez", () => {
  const kayitli = kaydiDogrula(kayitYaniti("m1"));
  assert.throws(() => imzayiDogrula(imzaYaniti("m2", kayitli, { bayraklar: 0x01 })), /doğrulamadı/);
});

test("doğrulama: sayaç geri giderse cihaz klonlanmış sayılır", () => {
  const kayitli = kaydiDogrula(kayitYaniti("m1"));
  assert.throws(
    () => imzayiDogrula(imzaYaniti("m2", kayitli, { signCount: 3, kayitliSignCount: 9 })),
    /beklenmedik bir durumda/
  );
});

test("doğrulama: sayacı hep 0 bırakan cihazlar çalışmaya devam eder", () => {
  // Touch ID / Windows Hello böyle davranıyor; 0 iken 0 kontrol edilmemeli.
  const kayitli = kaydiDogrula(kayitYaniti("m1"));
  assert.equal(imzayiDogrula(imzaYaniti("m2", kayitli, { signCount: 0, kayitliSignCount: 0 })).signCount, 0);
});

// ============================================================ authenticatorData

test("authenticatorData: kimlik verisi olmayan yanıtta anahtar aranmaz", () => {
  const veri = authenticatorVerisiniCoz(authData({ bayraklar: IMZA_BAYRAKLARI, signCount: 2 }));
  assert.equal(veri.credentialId, undefined);
  assert.equal(veri.userVerified, true);
  assert.equal(veri.signCount, 2);
});

test("authenticatorData: kısa veri hata verir", () => {
  assert.throws(() => authenticatorVerisiniCoz(Buffer.alloc(10)), /çok kısa/);
});
