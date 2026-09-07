import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * iyzico imzalama yardımcıları (saf fonksiyonlar, ağ yok).
 *
 * İki ayrı imza var ve BİRBİRİNE BENZEMİYORLAR — karıştırmak, isteğin
 * reddedilmesi ya da (daha kötüsü) sahte bir webhook'un kabul edilmesi demek:
 *
 *   1. GİDEN istek: `Authorization: IYZWSv2 <base64>` — HMAC-SHA256(
 *      randomKey + uriPath + gövde, secretKey), hex küçük harf.
 *   2. GELEN webhook: `X-IYZ-SIGNATURE-V3` — abonelik olaylarında birleştirme
 *      sırası TAMAMEN FARKLI (merchantId + secretKey + ... ) ve gövdeyi
 *      kullanmaz; imzaya giren alanlar gövdeden okunur.
 *
 * Resmî `iyzipay` npm paketi bilerek kullanılmadı: yalnızca bu iki imza ve
 * birkaç JSON çağrısı için bir bağımlılık eklemek, dış servise giden her
 * fetch'in zaman aşımlı olması kuralını da (fetch-with-timeout.ts) o paketin
 * kendi HTTP katmanına devretmek demekti.
 */

/** iyzico'nun beklediği rastgele anahtar; her istekte yeni olmalı. */
export function randomKeyUret(): string {
  return `${Date.now()}${randomBytes(6).toString("hex")}`;
}

/**
 * Giden isteğin Authorization başlığını üretir.
 *
 * uriPath, sorgu dizesi DAHİL yol olmalıdır (ör. "/v2/subscription/checkoutform/xyz").
 * Gövde, ağa gidecek metnin BİREBİR kendisi olmalı: burada JSON.stringify edip
 * fetch'e başka bir metin vermek imzayı geçersiz kılar.
 */
export function authorizationHeader(params: {
  apiKey: string;
  secretKey: string;
  uriPath: string;
  body?: string;
  randomKey?: string;
}): { authorization: string; randomKey: string } {
  const randomKey = params.randomKey ?? randomKeyUret();
  const payload = params.body ? randomKey + params.uriPath + params.body : randomKey + params.uriPath;
  const signature = createHmac("sha256", params.secretKey).update(payload, "utf8").digest("hex");
  const authorizationString = `apiKey:${params.apiKey}&randomKey:${randomKey}&signature:${signature}`;
  return {
    // "IYZWSv2" ile base64 arasında TEK boşluk olmalı — fazlası 401 döner.
    authorization: `IYZWSv2 ${Buffer.from(authorizationString, "utf8").toString("base64")}`,
    randomKey,
  };
}

export interface AbonelikWebhookGovdesi {
  iyziEventType?: string;
  subscriptionReferenceCode?: string;
  orderReferenceCode?: string;
  customerReferenceCode?: string;
  iyziReferenceCode?: string;
  iyziEventTime?: number | string;
}

/**
 * Abonelik webhook'unun beklenen imzası.
 *
 * Sıra iyzico dokümanındaki sırayla birebir aynı olmak zorunda; alan boşsa boş
 * dize olarak katılır (iyzico da öyle yapıyor).
 */
export function abonelikWebhookImzasi(params: {
  merchantId: string;
  secretKey: string;
  govde: AbonelikWebhookGovdesi;
}): string {
  const { merchantId, secretKey, govde } = params;
  const payload =
    merchantId +
    secretKey +
    (govde.iyziEventType ?? "") +
    (govde.subscriptionReferenceCode ?? "") +
    (govde.orderReferenceCode ?? "") +
    (govde.customerReferenceCode ?? "");
  return createHmac("sha256", secretKey).update(payload, "utf8").digest("hex");
}

/**
 * Gelen imzayı sabit zamanlı karşılaştırır.
 *
 * Sabit zaman şart: sıradan bir `===` karşılaştırması, imzayı bayt bayt tahmin
 * etmeye açık kapı bırakır (aynı gerekçe whatsapp-webhook-signature.ts'te de var).
 */
export function abonelikWebhookDogrula(params: {
  merchantId: string;
  secretKey: string;
  govde: AbonelikWebhookGovdesi;
  imzaBasligi: string | undefined;
}): boolean {
  const { imzaBasligi } = params;
  if (!imzaBasligi || !params.secretKey || !params.merchantId) return false;

  const beklenen = Buffer.from(abonelikWebhookImzasi(params), "hex");
  let gelen: Buffer;
  try {
    gelen = Buffer.from(imzaBasligi.trim(), "hex");
  } catch {
    return false;
  }
  if (gelen.length === 0 || gelen.length !== beklenen.length) return false;
  return timingSafeEqual(gelen, beklenen);
}
