import { createTranslator, defaultLocale, isLocale, parseAcceptLanguage, resolveLocale } from "@projelio/shared";
import type { Locale, Translate } from "@projelio/shared";
import { en } from "./en/index";

/**
 * Sunucu tarafı çeviri.
 *
 * Sunucunun ürettiği kullanıcı metinleri arayüzden bağımsız yollarla gidiyor:
 * doğrulama e-postası, şifre sıfırlama, push bildirimi, WhatsApp mesajı, günlük
 * özet ve Lio'nun yanıtları. Bunların hiçbiri tarayıcı açıkken üretilmek zorunda
 * değil — bu yüzden dil bilgisi sunucuda olmalı (bkz. migration 087).
 *
 * Anahtar olarak Türkçe metnin kendisi kullanılıyor; gerekçe
 * packages/shared/src/i18n.ts başında.
 */

const cevirmenler = new Map<Locale, Translate>();

/** Bir dil için çevirmen döndürür (aynı dil için hep aynı örnek). */
export function cevirmen(locale: Locale): Translate {
  let mevcut = cevirmenler.get(locale);
  if (!mevcut) {
    mevcut = createTranslator(locale, en);
    cevirmenler.set(locale, mevcut);
  }
  return mevcut;
}

/**
 * Çevrilebilir metin.
 *
 * Düz dize en sık hâl. Nesne biçimi, içinde değişken geçen metinler için:
 * şablon dizesi (`${ad} seni ekledi`) anahtar OLAMAZ, çünkü her çağrıda farklı
 * bir dize üretir ve sözlükte hiçbir zaman bulunmaz. Değişkenler bu yüzden yer
 * tutucuyla yazılıp ayrıca geçiliyor.
 *
 *   cevir("en", { metin: '{atayan}, seni "{gorev}" görevine atadı.',
 *                 params: { atayan: "Can", gorev: "Kapak tasarımı" } })
 */
export type Metin = string | { metin: string; params?: Record<string, string | number | undefined> };

/** Metni verilen dile çevirir. Karşılığı yoksa Türkçesi döner. */
export function cevir(locale: Locale, metin: Metin): string {
  const t = cevirmen(locale);
  return typeof metin === "string" ? t(metin) : t(metin.metin, metin.params);
}

/**
 * İsteğin dilini çıkarır: hesap tercihi > Accept-Language > Türkçe.
 *
 * Hesap tercihi null olabilir ve bu "Türkçe" DEĞİL "seçim yapılmadı" demektir;
 * o hâlde tarayıcının gönderdiği başlığa bakılır.
 */
export function istekDili(hesapDili: unknown, acceptLanguage?: string | null): Locale {
  if (isLocale(hesapDili)) return hesapDili;
  const adaylar = parseAcceptLanguage(acceptLanguage);
  return adaylar.length ? resolveLocale(adaylar) : defaultLocale;
}

/**
 * Yeni açılan hesaba yazılacak dil: tarayıcının Accept-Language başlığı.
 *
 * Başlık yoksa `undefined` — hesabın dili boş kalır ("seçim yapılmadı").
 * Kayıt anında dili yazmamak şu hataya yol açıyordu: sunucu, tarayıcı
 * kapalıyken ürettiği her şeyde (doğrulama e-postası, örnek iş, ipuçları,
 * bildirimler) dili YALNIZCA hesaptan öğrenebiliyor ve boşsa Türkçeye
 * düşüyor. Arayüzü İngilizce gören yabancı kullanıcı, kendisine ilk giden
 * her şeyi Türkçe alıyordu.
 */
export function tarayiciDili(req: { headers: Record<string, string | string[] | undefined> }): Locale | undefined {
  const baslik = req.headers["accept-language"];
  return typeof baslik === "string" && baslik.trim() ? istekDili(null, baslik) : undefined;
}

/**
 * İstemcinin O AN gösterdiği arayüz dili (`X-Projelio-Locale` başlığı).
 *
 * Accept-Language'den farkı: bu bir tarayıcı İPUCU değil, arayüzün hangi dilde
 * çizildiğinin kesin bilgisi — istemci hesap tercihini de hesaba katarak zaten
 * hesaplamış durumda (bkz. apps/web lib/i18n/depo.ts `etkinDil`).
 *
 * Başlık yoksa `undefined`: istek tarayıcıdan gelmiyor (WhatsApp köprüsü,
 * zamanlanmış işler). Çağıran o zaman hesabın diline düşmeli.
 *
 * NEDEN GEREKLİ: Lio dili yalnızca `users.locale`'dan okuyordu. Demo hesapları
 * PAYLAŞILDIĞI için oraya dil YAZILMIYOR (bir ziyaretçinin seçimi diğerinin
 * arayüzünü değiştirirdi), dolayısıyla kolon hep boş kalıyor ve Türkçeye
 * düşülüyordu: arayüzü İngilizce gezen ziyaretçiye Lio Türkçe cevap veriyordu.
 */
export function istemciDili(req: { headers: Record<string, string | string[] | undefined> }): Locale | undefined {
  const baslik = req.headers["x-projelio-locale"];
  return isLocale(baslik) ? baslik : undefined;
}

/**
 * Değişken içeren bir istisna mesajını çevrilebilir hâle getirir.
 *
 * ## Sorun
 *
 * `throw new BadRequestException(`Şifre çok uzun (${bytes} bayt).`)` yazıldığında
 * hata mesajı, değişken ÇOKTAN gömülmüş bir dize oluyor. Global filtre
 * (all-exceptions.filter.ts) o dizeyi sözlükte arıyor ve hiçbir zaman
 * bulamıyor — çünkü her çağrıda farklı. Mesaj sessizce Türkçe kalıyor ve
 * bunu hiçbir denetim yakalayamıyor.
 *
 * ## Çözüm
 *
 * Nest istisnaları gövde olarak nesne kabul ediyor. Türkçe mesaj `message`
 * alanında olduğu gibi duruyor (yani bir şey ters giderse kullanıcı yine
 * anlamlı bir metin görüyor), yanına da çeviri için gereken anahtar ve
 * parametreler ekleniyor. Filtre `i18n` alanını görürse onu çevirip
 * `message`in üzerine yazıyor ve alanı yanıttan düşürüyor.
 *
 * Kullanımı:
 *   throw new BadRequestException(
 *     hataMetni("Şifre çok uzun ({n} bayt). En fazla {sinir} bayt olabilir.", {
 *       n: bytes,
 *       sinir: MAX_PASSWORD_BYTES,
 *     })
 *   );
 */
export function hataMetni(
  metin: string,
  params?: Record<string, string | number | undefined>
): { message: string; i18n: { metin: string; params?: Record<string, string | number | undefined> } } {
  return {
    // Türkçe karşılık şimdi hesaplanıyor: filtre hiç çalışmasa bile (ör. hata
    // başka bir katmanda yakalanıp loglanırsa) okunabilir bir metin kalsın.
    message: cevir(defaultLocale, { metin, params }),
    i18n: { metin, params },
  };
}
