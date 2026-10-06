import { useEffect, useState } from "react";

/**
 * TAM EKRAN SABİT BİR PANELİ, KLAVYENİN ÜSTÜNDE KALAN ALANA SIĞDIRIR.
 *
 * NEDEN: Lio penceresi telefonda `position: fixed; top: 0; bottom: 0` ile
 * ekranı kaplıyor ve yazma kutusu en altta. Klavye açılınca WebView her
 * zaman küçülmüyor — telefon tarayıcısında (Chrome yalnızca GÖRSEL alanı
 * küçültür), iOS'ta ve kabuğun klavye eklentisinin tutmadığı Android
 * sürümlerinde `bottom: 0` hâlâ ekranın dibini, yani klavyenin arkasını
 * gösteriyor. Kullanıcı yazdığını göremiyordu (2026-10-06).
 *
 * lib/yaziGorunur.ts burada yardımcı olamıyor: o, imleci saran kapları
 * KAYDIRARAK görünür yapar; sabit bir panelin kaydırılacak bir üstü yok.
 *
 * NASIL: panelin tepesi ve boyu görsel görünür alandan (visualViewport)
 * alınır. WebView zaten küçülmüşse görsel alan pencereyle aynıdır ve hiçbir
 * şey değişmez — iki yolda da sonuç doğru, üst üste binmez.
 */

export interface GorunurAlan {
  top: number;
  height: number;
}

/**
 * Görsel alan pencereden belirgin biçimde kısaysa panelin kutusu; değilse
 * null (panel kendi `top: 0; bottom: 0`'ını kullanır). Saf, test edilebilir.
 *
 * Birkaç piksellik fark (adres çubuğu, yuvarlama) için kutu dayatılmıyor:
 * her kaydırmada panel boyunun titremesine değmez.
 */
export function gorunurAlanKutusu(
  pencereYuksekligi: number,
  gorunurYukseklik: number,
  gorunurUst: number,
): GorunurAlan | null {
  if (!(gorunurYukseklik > 0) || pencereYuksekligi <= 0) return null;
  if (pencereYuksekligi - gorunurYukseklik < 40 && gorunurUst < 1) return null;
  return { top: Math.max(0, Math.round(gorunurUst)), height: Math.round(gorunurYukseklik) };
}

/** `aktif` iken görsel alanı izler; masaüstünde ve kapalıyken null döner. */
export function useGorunurAlan(aktif: boolean): GorunurAlan | null {
  const [alan, setAlan] = useState<GorunurAlan | null>(null);

  useEffect(() => {
    const vv = window.visualViewport;
    const dokunmatik = window.matchMedia?.("(pointer: coarse)").matches;
    if (!aktif || !vv || !dokunmatik) {
      setAlan(null);
      return;
    }
    let kare = 0;
    const olc = () => {
      cancelAnimationFrame(kare);
      kare = requestAnimationFrame(() => {
        const yeni = gorunurAlanKutusu(window.innerHeight, vv.height, vv.offsetTop);
        setAlan((eski) =>
          eski?.top === yeni?.top && eski?.height === yeni?.height ? eski : yeni,
        );
      });
    };
    olc();
    // iOS klavye açılınca sayfayı kaydırır (offsetTop değişir), boy aynı kalabilir.
    vv.addEventListener("resize", olc);
    vv.addEventListener("scroll", olc);
    return () => {
      cancelAnimationFrame(kare);
      vv.removeEventListener("resize", olc);
      vv.removeEventListener("scroll", olc);
    };
  }, [aktif]);

  return alan;
}
