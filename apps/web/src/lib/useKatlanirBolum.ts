import { useCallback, useState } from "react";

/**
 * Anasayfadaki bir bölümün (ürün/hizmet, departmanlar) açık/kapalı tercihi.
 *
 * Tarayıcıda saklanıyor: kullanıcı en son nasıl bıraktıysa öyle açılsın.
 * Sunucuya taşımak için fazla önemsiz bir görünüm tercihi (bkz.
 * lib/fileViewMode.ts'teki aynı karar). Varsayılan AÇIK.
 *
 * `etkin` false ise bölüm hep açık kalır ve tercih okunmaz — aynı panel
 * ayrı sekmesinde de kullanılıyor ve orada listeyi gizlemek sekmenin
 * kendisini anlamsızlaştırırdı.
 */
export function useKatlanirBolum(anahtar: string, etkin = true): [boolean, () => void] {
  const [kapali, setKapali] = useState<boolean>(() => {
    if (!etkin) return false;
    try {
      return localStorage.getItem(anahtar) === "1";
    } catch {
      // Gizli sekmede / depolama kapalıyken erişim hata fırlatabiliyor.
      return false;
    }
  });

  const degistir = useCallback(() => {
    const sonraki = !kapali;
    setKapali(sonraki);
    try {
      localStorage.setItem(anahtar, sonraki ? "1" : "0");
    } catch {
      // Depolama kapalıysa tercih oturumluk kalır; işlevi bozmaz.
    }
  }, [anahtar, kapali]);

  return [etkin && kapali, degistir];
}
