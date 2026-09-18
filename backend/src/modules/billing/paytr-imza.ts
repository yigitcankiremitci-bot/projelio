import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * PayTR imzalama yardımcıları (saf fonksiyonlar, ağ yok).
 *
 * ÜÇ AYRI İMZA VAR, KARIŞTIRILMAMALI. Hepsi HMAC-SHA256 + base64 ama
 * BİRLEŞTİRME SIRALARI FARKLI ve alan adlarıyla değil SIRAYLA tanımlılar:
 *
 *   1. iFRAME ödeme tokeni: merchant_id, user_ip, merchant_oid, email,
 *      payment_amount, user_basket (base64 hâli!), no_installment,
 *      max_installment, currency, test_mode.
 *
 *   2. DİREKT API ödeme tokeni: merchant_id, user_ip, merchant_oid, email,
 *      payment_amount, payment_type, installment_count, currency, test_mode,
 *      non_3d. Sepet YOK, taksit alanları farklı.
 *
 *   3. GELEN bildirim (`hash`): merchant_oid + merchant_salt + status +
 *      total_amount.
 *
 * İKİSİNİ KARIŞTIRMAK CANLIDA YAŞANDI: iFrame ucuna Direkt API sırasıyla
 * imzalanmış istek gönderildi ve PayTR "paytr_token gonderilmedi veya gecersiz"
 * dedi — hangi alanın yanlış olduğunu SÖYLEMİYOR. O yüzden her iki sıra da
 * ayrı fonksiyonda ve ayrı testte duruyor.
 *
 * Sıra ve içerik PayTR'nin kendi Node.js örneklerinden birebir alındı
 * (PayTR_Direkt_API.zip). Ezberden yazılacak bir şey değil: yanlış sıra,
 * iyi ihtimalle her isteğin reddedilmesi, kötü ihtimalle sahte bir bildirimin
 * kabul edilmesi demek.
 *
 * NOT: kart bilgisi imzaya GİRMİYOR. Bu sayede token, müşteri kartını girmeden
 * önce sunucuda üretilebiliyor — kart verisi bizim sunucumuza hiç uğramıyor.
 */

/** iFrame API ödeme tokeninin alanları (bkz. yukarıdaki 1. sıra). */
export interface IframeTokenAlanlari {
  merchantId: string;
  userIp: string;
  merchantOid: string;
  email: string;
  /** Kuruş cinsinden tam sayı, metin olarak. */
  paymentAmount: string;
  /** Sepetin BASE64 hâli — ağa giden metnin birebir aynısı olmalı. */
  userBasketB64: string;
  noInstallment: string;
  maxInstallment: string;
  currency: string;
  testMode: string;
}

/**
 * iFrame API ödeme tokeni. Tek seferlik ödemelerde (Lio Bakiyesi) kullanılan
 * imza budur.
 */
export function iframeTokeni(alanlar: IframeTokenAlanlari, merchantKey: string, merchantSalt: string): string {
  const birlesim =
    alanlar.merchantId +
    alanlar.userIp +
    alanlar.merchantOid +
    alanlar.email +
    alanlar.paymentAmount +
    alanlar.userBasketB64 +
    alanlar.noInstallment +
    alanlar.maxInstallment +
    alanlar.currency +
    alanlar.testMode;
  return createHmac("sha256", merchantKey).update(birlesim + merchantSalt, "utf8").digest("base64");
}

/** Direkt API / Kart Saklama ödeme tokeninin alanları (bkz. yukarıdaki 2. sıra). */
export interface OdemeTokenAlanlari {
  merchantId: string;
  userIp: string;
  merchantOid: string;
  email: string;
  /** PayTR'ye gönderilecek biçimin BİREBİR aynısı olmalı (iFrame'de kuruş cinsinden tam sayı). */
  paymentAmount: string;
  /** Şimdilik her zaman "card". */
  paymentType: string;
  installmentCount: string;
  currency: string;
  testMode: string;
  non3d: string;
}

/**
 * Direkt API ödeme tokeni. Kart saklama ve tekrarlayan çekim bu imzayı
 * kullanıyor; o yetkiler mağazaya tanımlanınca devreye girecek. iFrame
 * akışında KULLANILMAZ.
 *
 * `paymentAmount` bilerek string: sayı verip burada biçimlendirmek, ağa giden
 * değerle imzalanan değerin ayrışmasına açık kapı bırakırdı.
 */
export function direktOdemeTokeni(alanlar: OdemeTokenAlanlari, merchantKey: string, merchantSalt: string): string {
  const birlesim =
    alanlar.merchantId +
    alanlar.userIp +
    alanlar.merchantOid +
    alanlar.email +
    alanlar.paymentAmount +
    alanlar.paymentType +
    alanlar.installmentCount +
    alanlar.currency +
    alanlar.testMode +
    alanlar.non3d;
  return createHmac("sha256", merchantKey).update(birlesim + merchantSalt, "utf8").digest("base64");
}

/** Bildirimde gelmesi gereken `hash` değerini hesaplar. */
export function bildirimHash(
  params: { merchantOid: string; status: string; totalAmount: string },
  merchantKey: string,
  merchantSalt: string
): string {
  const birlesim = params.merchantOid + merchantSalt + params.status + params.totalAmount;
  return createHmac("sha256", merchantKey).update(birlesim, "utf8").digest("base64");
}

/**
 * Gelen bildirimin PayTR'den geldiğini doğrular.
 *
 * Karşılaştırma sabit zamanlı: imza doğrulamasında erken çıkan bir karşılaştırma,
 * saldırgana doğru imzayı bayt bayt arama imkânı verir.
 */
export function bildirimGecerliMi(
  govde: { merchant_oid?: string; status?: string; total_amount?: string | number; hash?: string },
  merchantKey: string,
  merchantSalt: string
): boolean {
  const gelen = String(govde?.hash ?? "");
  if (!gelen) return false;

  const beklenen = bildirimHash(
    {
      merchantOid: String(govde?.merchant_oid ?? ""),
      status: String(govde?.status ?? ""),
      // total_amount ağdan metin olarak gelir; Number'a çevirip geri yazmak
      // "0" ile "0.00" gibi biçimleri ayrıştırır ve imzayı bozar.
      totalAmount: String(govde?.total_amount ?? ""),
    },
    merchantKey,
    merchantSalt
  );

  const a = Buffer.from(gelen, "utf8");
  const b = Buffer.from(beklenen, "utf8");
  // timingSafeEqual farklı uzunlukta fırlatır; uzunluk zaten sır değil.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Durum sorgu servisinin token'ı — ödeme token'ından FARKLI ve çok daha kısa:
 * merchant_id + merchant_oid + merchant_salt. Sıra PayTR'nin durum-sorgu
 * örneğinden alındı; ödeme token'ındaki gibi "oid önce" yazmak isteği
 * reddettirir.
 */
export function durumSorguTokeni(
  params: { merchantId: string; merchantOid: string },
  merchantKey: string,
  merchantSalt: string
): string {
  return createHmac("sha256", merchantKey)
    .update(params.merchantId + params.merchantOid + merchantSalt, "utf8")
    .digest("base64");
}

/**
 * Sipariş numarası (merchant_oid) üretimi ve çözümü.
 *
 * PayTR sipariş numarasının ALFANUMERİK ve en fazla 64 karakter olmasını
 * istiyor; bizim sipariş kimliklerimiz tireli UUID, yani doğrudan kullanılamaz.
 *
 * Biçim: "LIO" + tiresiz uuid (32) + base36 zaman damgası.
 *
 * Zaman damgası NEDEN VAR: PayTR aynı sipariş numarasını ikinci kez kabul
 * etmiyor. Ödemesi başarısız olan bir siparişi kullanıcı yeniden denediğinde
 * numarayı değiştirmezsek ikinci deneme daha başlamadan reddedilirdi.
 * Sipariş kimliği sabit kaldığı için bildirimden siparişi bulmak yine mümkün.
 */
const OID_ONEK = "LIO";
const UUID_UZUNLUK = 32;

export function siparisNumarasiUret(orderId: string, simdi = Date.now()): string {
  return OID_ONEK + orderId.replace(/-/g, "") + simdi.toString(36);
}

/** Bildirimden gelen sipariş numarasını tireli UUID'ye geri çevirir; tanınmazsa null. */
export function siparisNumarasiCoz(merchantOid: string): string | null {
  if (!merchantOid?.startsWith(OID_ONEK)) return null;
  const ham = merchantOid.slice(OID_ONEK.length, OID_ONEK.length + UUID_UZUNLUK);
  if (!/^[0-9a-f]{32}$/i.test(ham)) return null;
  return [ham.slice(0, 8), ham.slice(8, 12), ham.slice(12, 16), ham.slice(16, 20), ham.slice(20)]
    .join("-")
    .toLowerCase();
}

/**
 * PayTR'nin `user_phone` alanı ZORUNLU ve boş gönderilirse istek reddediliyor
 * ("Zorunlu alan degeri gecersiz veya gonderilmedi (get-token): user_phone").
 * Kullanıcılarımızın çoğunda telefon kayıtlı değil ve ürün sanal olduğu için
 * telefon gerçekten gerekmiyor.
 *
 * Bu yüzden boşsa yer tutucu gidiyor — fatura adresinde verilen kararın aynısı.
 * Telefon toplamaya başlanırsa yer tutucu kendiliğinden devre dışı kalır.
 * Rakam dışındaki karakterler ayıklanıyor: "+90 (541) 863..." gibi bir değer
 * 20 karakter sınırını aşabiliyor.
 */
const TELEFON_YER_TUTUCU = "0000000000";

export function telefonAlani(telefon?: string | null): string {
  const rakamlar = String(telefon ?? "").replace(/\D/g, "");
  if (!rakamlar) return TELEFON_YER_TUTUCU;
  return rakamlar.slice(0, 20);
}

/**
 * Tutarı PayTR'nin iFrame API'sinin beklediği biçime çevirir: kuruş, tam sayı.
 * 34.56 TL -> "3456". Yuvarlama bilerek `Math.round`: kayan nokta artığı
 * yüzünden 1 kuruş eksik göndermek imzayı değil tutarı bozardı.
 */
export function kurusaCevir(tutar: number): string {
  return String(Math.round(tutar * 100));
}
