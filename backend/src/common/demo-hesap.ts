import { ForbiddenException } from "@nestjs/common";

/**
 * HERKESE AÇIK DEMO HESABI
 *
 * `ceo@celikhan.test` üye olmadan gezmek isteyenler için yayımlanıyor: şifresi
 * tanıtım sitesinde ve giriş ekranında yazıyor (bkz. apps/web/src/lib/demoHesap.ts).
 * Yani bu hesaba giren kişi "kullanıcı" değil, ZİYARETÇİ — ve aynı anda başka
 * ziyaretçiler de içeride olabilir.
 *
 * Bu yüzden iki koruma var:
 *  1. BURASI: hesabın kendisini ele geçirmeye yarayacak işlemler kapalı.
 *     Şifreyi değiştiren bir ziyaretçi demoyu herkese kapatırdı ve geri
 *     dönüşü yoktu — çünkü sıfırlama akışı da @celikhan.test adresine
 *     e-posta göndermeye çalışırdı ve o adres gerçek değil.
 *  2. DemoSifirlamaService: her girişte demo verisi ilk haline döner.
 *     Yani içerideki her değişiklik geçici; hesabın kendisi ise hiç değişmez.
 */
export const DEMO_HESAP = {
  email: "ceo@celikhan.test",
  /**
   * Demo veri kümesindeki bütün satırların id'si bu ön ekle başlar
   * (ör. ce110001-0000-4000-8000-000000000001). Ziyaretçinin oluşturduğu
   * satırlar rastgele uuid aldığı için "demo verisi mi, ziyaretçi mi yazdı"
   * ayrımı bu ön ekle yapılıyor — bkz. demo-sifirlama.service.ts.
   */
  idOnEki: "ce11",
} as const;

/** Verilen e-posta demo hesabına mı ait? (büyük/küçük harf duyarsız) */
export function demoEpostasiMi(email: string | null | undefined): boolean {
  return typeof email === "string" && email.trim().toLowerCase() === DEMO_HESAP.email;
}

/** Verilen kullanıcı id'si demo veri kümesine mi ait? */
export function demoKullanicisiMi(userId: string | null | undefined): boolean {
  return typeof userId === "string" && userId.toLowerCase().startsWith(DEMO_HESAP.idOnEki);
}

/**
 * Demo hesabında yapılmasına izin verilmeyen işlemleri durdurur.
 *
 * Mesaj bilerek açıklayıcı: ziyaretçi bir hatayla karşılaştığını değil,
 * kasıtlı bir sınır olduğunu görsün ve kendi hesabını açmaya yönelsin.
 */
export function demoHesabindaYasak(userId: string, islem: string): void {
  if (!demoKullanicisiMi(userId)) return;
  throw new ForbiddenException(
    `Bu bir demo hesabı; ${islem} kapalı. Kendi hesabını açarsan her şeyi değiştirebilirsin.`
  );
}
