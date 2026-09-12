/**
 * Etkinlik sayacının saf kararı (bkz. etkinlikSayaci.ts). Ayrı dosyada, çünkü
 * sayaç api/client'ı içe aktarıyor ve test koşucusu (node --test, tip silme)
 * o dosyayı yükleyemiyor.
 */
export const SINYAL_ARALIGI_MS = 60_000;
export const ETKILESIM_ESIGI_MS = 5 * 60_000;

export function sinyalGonderilmeli(durum: { gorunur: boolean; simdi: number; sonEtkilesim: number }): boolean {
  return durum.gorunur && durum.simdi - durum.sonEtkilesim <= ETKILESIM_ESIGI_MS;
}
