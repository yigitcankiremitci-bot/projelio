import { BadRequestException } from "@nestjs/common";
import * as bcrypt from "bcrypt";

/**
 * Şifre hash'leme — tek kaynak.
 *
 * Daha önce `bcrypt.hash(password, 10)` üç ayrı serviste (kayıt, şifre değiştirme,
 * şifre sıfırlama) tekrarlanıyordu ve birinde "tur sayısı kayıt akışıyla aynı
 * olmalı" diye elle senkron tutulması gereken bir yorum vardı. Buraya alındı ki
 * maliyet tek yerden değişsin.
 */

/**
 * bcrypt maliyet katsayısı.
 *
 * 10'dan 12'ye çıkarıldı: her artış hash süresini iki katına çıkarır, yani 12
 * saldırganın deneme hızını 10'a göre dörtte bire indirir. Modern donanımda
 * 12 ≈ 200-300 ms — kullanıcı giriş yaparken fark etmez, sızdırılmış bir veritabanı
 * üzerinde sözlük saldırısı yapan için ise dört kat maliyet demek.
 *
 * MEVCUT KULLANICILAR ETKİLENMEZ: bcrypt maliyeti hash'in içinde saklı olduğu
 * için eski (10 turlu) hash'ler doğrulanmaya devam eder. Kullanıcı bir dahaki
 * girişinde sessizce yeni maliyetle yeniden hash'lenir (bkz. needsRehash ve
 * auth.service.ts login).
 */
export const BCRYPT_ROUNDS = 12;

/**
 * bcrypt girdiyi 72 BAYTTA keser ve bunu sessizce yapar.
 *
 * NEDEN ÖNEMLİ: 72 bayt, ASCII'de 72 karakter ama Türkçe'de değil — "ş", "ğ", "ı"
 * gibi harfler UTF-8'de 2 bayt tutar. Yani 40 karakterlik Türkçe bir parola 72
 * baytı aşabilir ve sonrası HİÇ dikkate alınmaz. Kullanıcı uzun bir parola
 * seçtiğini sanırken aslında ilk 72 baytı kadar korunur. Sessizce kesmek yerine
 * açık bir hata veriyoruz.
 */
export const MAX_PASSWORD_BYTES = 72;

/**
 * Var olmayan bir hesap için giriş denendiğinde karşılaştırılacak sahte hash.
 *
 * NEDEN: login akışı `if (!user || !(await bcrypt.compare(...)))` şeklindeydi.
 * Kullanıcı yoksa bcrypt hiç çalışmıyor ve yanıt ~200 ms yerine ~5 ms'de
 * dönüyordu. Bu fark ölçülebilir: saldırgan yalnızca yanıt süresine bakarak bir
 * e-postanın kayıtlı olup olmadığını anlayabilirdi. Auth akışının geri kalanı
 * (forgot-password, resend-verification, login mesajları) hesap varlığını
 * sızdırmamak için özellikle tasarlanmış; zamanlama üzerinden geri sızmasın.
 *
 * Açılışta bir kez üretilir — maliyeti BCRYPT_ROUNDS ile otomatik eşleşsin diye
 * sabit metin olarak gömülmedi.
 */
const DUMMY_HASH = bcrypt.hashSync("projelio-zamanlama-esitleyici", BCRYPT_ROUNDS);

/** Şifreyi hash'ler. Çok uzunsa sessizce kesmek yerine hata verir. */
export async function hashPassword(plain: string): Promise<string> {
  assertHashable(plain);
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

/** Şifreyi hash ile karşılaştırır. */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Hesap yokken çağrılır: gerçek bir doğrulama kadar zaman harcar ki yanıt süresi
 * "bu e-posta kayıtlı" bilgisini vermesin. Dönüş değeri her zaman false.
 */
export async function wasteVerifyTime(plain: string): Promise<false> {
  await bcrypt.compare(plain, DUMMY_HASH);
  return false;
}

/** Hash daha düşük bir maliyetle üretilmişse true — girişte yeniden hash'lenmeli. */
export function needsRehash(hash: string): boolean {
  try {
    return bcrypt.getRounds(hash) < BCRYPT_ROUNDS;
  } catch {
    // Tanınmayan biçim: dokunma. Yanlış bir "evet" cevabı çalışan bir hash'i ezerdi.
    return false;
  }
}

function assertHashable(plain: string): void {
  const bytes = Buffer.byteLength(plain, "utf8");
  if (bytes > MAX_PASSWORD_BYTES) {
    throw new BadRequestException(
      `Şifre çok uzun (${bytes} bayt). En fazla ${MAX_PASSWORD_BYTES} bayt olabilir; ` +
        "Türkçe karakterler 2 bayt yer kaplar."
    );
  }
}
