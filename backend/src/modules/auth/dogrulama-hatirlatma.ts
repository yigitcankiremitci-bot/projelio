/**
 * "Hesabını onayla" hatırlatmasının kuralı — saf, test edilebilir.
 * İşleyici: dogrulama-hatirlatma.processor.ts. Gerekçe: migration 119.
 */

/** En fazla kaç hatırlatma. Günde bir olduğu için ~iki hafta. */
export const DOGRULAMA_HATIRLATMA_TAVANI = 14;

/**
 * Bundan eski doğrulanmamış hesaba hatırlatma gitmez. 90 gün: EMAIL_FROM
 * tanımsızken kayıt olanların doğrulama e-postası hiç ulaşmadı, o dönemin
 * hesapları da kapsansın; daha eskisi büyük ihtimalle ölü bir adres.
 */
export const DOGRULAMA_HATIRLATMA_YAS_SINIRI_GUN = 90;

/** Kayıttan sonra ilk hatırlatmaya kadar: kayıttaki e-posta zaten gitti. */
export const ILK_HATIRLATMA_BEKLEMESI_SAAT = 20;

/** İki hatırlatma arası en az bu kadar — "günde bir", ızgara kaysa da. */
export const HATIRLATMA_ARALIGI_SAAT = 20;

/** Türkiye saatiyle bu saatten önce gönderilmez (gece bildirimi olmasın). */
export const HATIRLATMA_SAATI = 10;

const SAAT = 3_600_000;

export function dogrulamaHatirlatmasiGonderilsinMi(p: {
  simdi: Date;
  hesapAcilis: Date | null;
  sonHatirlatma: Date | null;
  gonderilen: number;
  /** Türkiye saati (0-23). */
  yerelSaat: number;
}): boolean {
  if (!p.hesapAcilis || Number.isNaN(p.hesapAcilis.getTime())) return false;
  if (p.gonderilen >= DOGRULAMA_HATIRLATMA_TAVANI) return false;
  if (p.yerelSaat < HATIRLATMA_SAATI) return false;
  const yas = p.simdi.getTime() - p.hesapAcilis.getTime();
  if (yas < ILK_HATIRLATMA_BEKLEMESI_SAAT * SAAT) return false;
  if (yas > DOGRULAMA_HATIRLATMA_YAS_SINIRI_GUN * 24 * SAAT) return false;
  if (p.sonHatirlatma && p.simdi.getTime() - p.sonHatirlatma.getTime() < HATIRLATMA_ARALIGI_SAAT * SAAT) return false;
  return true;
}
