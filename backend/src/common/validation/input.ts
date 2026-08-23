import { BadRequestException } from "@nestjs/common";

/**
 * Sunucu tarafı girdi doğrulama yardımcıları.
 *
 * NEDEN ELLE, ValidationPipe VARKEN: main.ts'teki global ValidationPipe yalnızca
 * class-validator dekoratörü taşıyan DTO SINIFLARI üzerinde çalışır. Bu repodaki
 * uçların çoğu gövdeyi satır içi TypeScript tipiyle alıyor (`@Body() body: { amount?: number }`)
 * ya da `any` ile. Bu tipler derlemede silindiği için pipe metatype'ı `Object`
 * görür ve doğrulamayı — whitelist dahil — tamamen ATLAR. Yani o uçlarda pipe
 * fiilen devre dışıdır; oralarda doğrulama buradaki gibi açıkça yapılmalı.
 *
 * Tüm uçları DTO sınıfına çevirmek doğru hedef ama büyük bir dönüşüm; bu modül
 * o dönüşüme kadar en riskli alanları (para, rol gibi kararı etkileyen alanlar)
 * kapatmak için var. Yeni uç yazarken tercih sırası: DTO sınıfı > bu yardımcılar.
 *
 * Dekoratör kullanmıyor: test koşucusu (node --test) tipleri sıyırıyor ama
 * dekoratörleri çalıştıramıyor (bkz. login-attempt.service.ts'teki aynı not).
 */

/**
 * budget_transactions.amount sütunu DECIMAL(12,2) — yani en fazla 9.999.999.999,99.
 * Bunun üstü Postgres'te taşma hatası verir ve kullanıcıya 500 olarak döner;
 * sınırı burada bilerek tutup düzgün bir 400 veriyoruz.
 */
export const MAX_MONEY_AMOUNT = 9_999_999_999.99;

/**
 * Para tutarı doğrular ve sayıya çevirir.
 *
 * NEDEN NEGATİF YASAK: işlemin yönü `type` alanında (income/expense/payout).
 * Negatif tutar bu yönü sessizce tersine çevirir — negatif bir "expense",
 * toplam gideri DÜŞÜRÜP kârı olduğundan yüksek gösterirdi (bkz. budget.service.ts
 * içindeki toplama fonksiyonları). Veritabanında amount için CHECK kısıtı yok,
 * yani bu kontrol tek savunma. Ön yüzdeki `min={0}` yalnızca arayüz kolaylığı;
 * istek doğrudan API'ye atıldığında hiçbir hükmü yok.
 *
 * Metin de kabul edilir ("1500"): ön yüz Number() ile çeviriyor ama Lio'nun araç
 * çağrıları ve mobil istemci metin gönderebiliyor. Kabul et, ama sayıya çevrilmiyorsa reddet.
 */
export function requireAmount(value: unknown, field = "Tutar"): number {
  const amount = typeof value === "string" && value.trim() !== "" ? Number(value) : value;

  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    throw new BadRequestException(`${field} geçerli bir sayı olmalı.`);
  }
  if (amount < 0) {
    throw new BadRequestException(`${field} negatif olamaz.`);
  }
  if (amount > MAX_MONEY_AMOUNT) {
    throw new BadRequestException(`${field} çok büyük.`);
  }
  return amount;
}

/**
 * Değerin izin verilen listede olmasını şart koşar.
 *
 * Rol, durum, tür gibi alanlar için: bunların TypeScript tipi ("manager" | "employee")
 * çalışma anında yok olduğu için gövdeden gelen HERHANGİ bir metin geçebiliyordu.
 * Çoğu tabloda CHECK kısıtı var, yani veri bozulmuyor — ama hata Postgres'ten
 * dönüyor ve kullanıcı sebebini anlamadığı bir 500 görüyor. Burada durdurunca
 * hem net bir 400 mesajı çıkıyor hem de kısıtı olmayan tablolar için gerçek bir
 * savunma ekleniyor (derinlemesine savunma: veritabanı son çare olmalı, tek çare değil).
 */
export function requireOneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new BadRequestException(`${field} şunlardan biri olmalı: ${allowed.join(", ")}`);
  }
  return value as T;
}

/** requireOneOf'un opsiyonel hali: alan hiç gönderilmemişse dokunmaz. */
export function optionalOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string
): T | undefined {
  if (value === undefined || value === null) return undefined;
  return requireOneOf(value, allowed, field);
}

/** RFC 4122 biçimi; sürüm/varyant basamaklarına takılmıyoruz, biçim yeterli. */
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Değerin UUID olmasını şart koşar.
 *
 * NEDEN VAR: birkaç yerde bir kimlik, PostgREST'in `.or()` filtre METNİNE
 * gömülüyor (`department_id.eq.${id},department_id.is.null`). O metin sunucuda
 * ayrıştırıldığı için, içine giren virgül yeni bir koşul açar — yani kimlik
 * alanı filtre sözdizimine dönüşür. `.eq()` gibi çağrılarda böyle bir risk yok
 * (değer parametre olarak gider); risk yalnızca metin kuran çağrılarda.
 *
 * Mümkünse `.or()` yerine ayrı sorgular tercih edilmeli (bkz. UsersService.search).
 * Ayrılamayan yerlerde ise gömülecek değer BURADAN geçmeli.
 */
export function requireUuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID_SHAPE.test(value)) {
    throw new BadRequestException(`${field} geçerli bir kimlik değil.`);
  }
  return value;
}
