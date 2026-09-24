import { takvimGunEkle, takvimGunu } from "@projelio/shared";

/**
 * "Şimdi eşitle" düğmesinin penceresi — sunucunun arka plan turuyla aynı
 * (7 gün geri, 60 gün ileri; bkz. GoogleTakvimService.cronTuru).
 */
export function takvimAraligi(): { from: string; to: string } {
  const bugun = takvimGunu(new Date());
  return { from: takvimGunEkle(bugun, -7), to: takvimGunEkle(bugun, 60) };
}
