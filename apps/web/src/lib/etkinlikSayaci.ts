import { useEffect } from "react";
import { api } from "../api/client";
import { ETKILESIM_ESIGI_MS, SINYAL_ARALIGI_MS, sinyalGonderilmeli } from "./etkinlikKarari";

/**
 * Uygulamada geçirilen süre için sinyal (Admin > Kullanıcılar'daki süre sütunları).
 *
 * İSTEMCİ SÜRE ÖLÇMÜYOR, yalnızca "şu an buradayım" diyor. Süreyi sunucu iki
 * sinyal arasındaki farktan hesaplıyor (migration 109) — birden fazla sekme
 * süreyi katlamıyor, bir sekmenin uyuyup uyanması da boşluğu saymıyor.
 *
 * "BURADAYIM" İKİ KOŞULA BAĞLI:
 *   1. Sekme görünür. Arkada açık unutulmuş sekme kullanım değil.
 *   2. Son ETKILESIM_ESIGI_MS içinde bir dokunuş/tuş/kaydırma var. Ekranı açık
 *      bırakıp kalkan kişinin süresi sayılmasın. 5 dakika: uzun bir görev
 *      açıklamasını ya da raporu okuyan kişi fareye dokunmadan da çalışıyor.
 */

/** Olay dinleyicileri çok sık tetikleniyor (mousemove, scroll); zamanı yazmak yeter, işlem yok. */
const OLAYLAR = ["pointerdown", "pointermove", "keydown", "wheel", "scroll", "touchstart"] as const;

export function useEtkinlikSayaci(etkin: boolean): void {
  useEffect(() => {
    if (!etkin) return;
    let sonEtkilesim = Date.now();
    let sonSinyal = 0;

    const gonder = () => {
      const simdi = Date.now();
      if (!sinyalGonderilmeli({ gorunur: document.visibilityState === "visible", simdi, sonEtkilesim })) return;
      // Boşluktan dönüşte hemen gönderilen sinyal ile zamanlayıcınınki üst üste
      // binmesin; sunucu zaten saymaz ama boş istek atmanın anlamı yok.
      if (simdi - sonSinyal < SINYAL_ARALIGI_MS / 2) return;
      sonSinyal = simdi;
      // Sayaç bir istatistik: hatası kullanıcıya gösterilmez.
      api.post("/users/me/etkinlik", {}).catch(() => {});
    };

    const etkilesim = () => {
      const simdi = Date.now();
      const bosluktanDonus = simdi - sonEtkilesim > ETKILESIM_ESIGI_MS;
      sonEtkilesim = simdi;
      // Boşluktan dönüşte bir dakika beklemeden saati başlat: yoksa her dönüşün
      // ilk dakikası kaybolurdu.
      if (bosluktanDonus) gonder();
    };

    const gorunurlukDegisti = () => {
      if (document.visibilityState === "visible") {
        sonEtkilesim = Date.now();
        gonder();
      }
    };

    for (const olay of OLAYLAR) window.addEventListener(olay, etkilesim, { passive: true, capture: true });
    document.addEventListener("visibilitychange", gorunurlukDegisti);
    gonder();
    const zamanlayici = window.setInterval(gonder, SINYAL_ARALIGI_MS);

    return () => {
      for (const olay of OLAYLAR) window.removeEventListener(olay, etkilesim, { capture: true });
      document.removeEventListener("visibilitychange", gorunurlukDegisti);
      window.clearInterval(zamanlayici);
    };
  }, [etkin]);
}
