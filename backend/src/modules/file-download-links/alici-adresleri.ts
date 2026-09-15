import { BadRequestException } from "@nestjs/common";
import { isLikelyEmail, normalizeShareEmail } from "@projelio/shared";

/*
 * SERVİSTEN AYRI DOSYA: test koşucusu Node'un yerleşiği (node --test) ve tip
 * sıyırma kipinde Nest'in "parameter property" sözdizimini (constructor'daki
 * `private supabase: ...`) çözemiyor. Servisten içe aktarılan saf bir fonksiyon
 * bile testi patlatıyor; bu yüzden repoda saf mantık hep kendi dosyasında
 * (bkz. butce-erisim.ts, onizleme-turleri.ts).
 */

/**
 * Serbest yazılmış alıcı listesini temiz adreslere çevirir.
 *
 * Kullanıcı adresleri virgülle, noktalı virgülle, boşlukla ya da alt alta
 * yazabiliyor; hepsi aynı şeyi kastediyor ve birini "yanlış biçim" diye
 * reddetmek gereksiz bir engel.
 *
 * TAVAN VAR (20): bu uç, giriş yapmış bir kullanıcının bizim alan adımızdan
 * e-posta göndermesini sağlıyor. Sınırsız bırakmak, ürünü bir toplu posta
 * aracına çevirir ve gönderen itibarımızı (dolayısıyla doğrulama/şifre
 * sıfırlama e-postalarını) riske atardı.
 *
 * Geçersiz adres SESSİZCE ATILMAZ: yazım hatası yapan kişi, mesajın gitmediğini
 * ancak karşı taraf sormayınca öğrenirdi.
 */
const ALICI_TAVANI = 20;

export function adresleriAyikla(girdiler: string[]): string[] {
  const parcalar = girdiler
    .filter((g) => typeof g === "string")
    .flatMap((g) => g.split(/[,;\s]+/))
    .map((p) => normalizeShareEmail(p))
    .filter((p): p is string => Boolean(p));

  const benzersiz = Array.from(new Set(parcalar));
  if (benzersiz.length === 0) throw new BadRequestException("Geçerli bir e-posta adresi girin");

  // Mesajlar ŞABLON DİZESİ DEĞİL, sabit: hata metinleri istemciye çevrilerek
  // gidiyor ve çeviri anahtarı metnin kendisi (bkz. all-exceptions.filter.ts).
  // İçine adres gömülen bir cümle sözlükte hiçbir zaman bulunamaz ve İngilizce
  // arayüzde Türkçe kalırdı. Hangi adresin bozuk olduğu zaten kullanıcının
  // gözünün önündeki kutuda duruyor.
  if (benzersiz.some((a) => !isLikelyEmail(a))) {
    throw new BadRequestException(
      "Girilen adreslerden biri geçerli görünmüyor. Adresleri virgülle ayırdığınızdan emin olun."
    );
  }
  if (benzersiz.length > ALICI_TAVANI) {
    throw new BadRequestException("Tek seferde en fazla 20 adrese gönderilebilir");
  }
  return benzersiz;
}
