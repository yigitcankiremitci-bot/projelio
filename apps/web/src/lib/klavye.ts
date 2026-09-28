/**
 * YAZILIM KLAVYESİ AÇIKKEN ALTA SABİT ÖĞELERİ GİZLE.
 *
 * NEDEN: telefonda klavye açılınca görünür alan klavyenin üstünde bitiyor ve
 * alta sabitlenmiş her şey — alt menü, ortadaki + düğmesi, Lio balonu, kişi
 * şeridi — klavyenin hemen üstüne biniyordu. Üstteki sabit şerit de yerinde
 * kaldığı için yazılan alana ekranın üçte biri kalıyor, yazılan metin
 * çoğu zaman bu öğelerin arkasında kalıyordu. (1.2.1'deki adjustResize
 * düzeltmesi sayfanın toptan yukarı itilmesini durdurmuştu; bu ondan ayrı,
 * kullanıcı 2026-09-28'de "hâlâ her şey yukarı taşınıyor" diye bildirdi.)
 *
 * Klavye açıkken bu öğelere dokunmanın anlamı yok: önce yazı bitirilir.
 *
 * NASIL: <html data-klavye="acik"> işaretlenir; gizlenecek öğeler
 * `data-klavyede-gizle` taşır ve kuralı index.css uygular. Böylece her
 * bileşen klavyeyi ayrıca dinlemiyor.
 */

import { kabukKlavyesiniDinle } from "./mobilKabuk";

/**
 * Tarayıcıda klavye açık mı? Görsel görünür alan pencerenin belirgin
 * biçimde altına düştüyse evet. Eşik bilerek geniş: adres çubuğunun
 * açılıp kapanması (~60 px) klavye sanılmasın.
 */
export function klavyeAcikGibiMi(pencereYuksekligi: number, gorunurYukseklik: number): boolean {
  if (pencereYuksekligi <= 0) return false;
  return pencereYuksekligi - gorunurYukseklik > Math.max(150, pencereYuksekligi * 0.2);
}

function isaretle(acik: boolean): void {
  const kok = document.documentElement;
  if (acik) kok.dataset.klavye = "acik";
  else delete kok.dataset.klavye;
}

/** Uygulama açılışında bir kez çağrılır; dönen fonksiyon dinlemeyi bırakır. */
export function klavyeyiIzle(): () => void {
  const kabuk = kabukKlavyesiniDinle(isaretle);
  if (kabuk) return kabuk;

  // Tarayıcı yolu: yalnızca dokunmatik cihazda anlamlı; masaüstünde pencereyi
  // küçültmek "klavye açıldı" sayılmamalı.
  const vv = window.visualViewport;
  const dokunmatik = window.matchMedia?.("(pointer: coarse)").matches;
  if (!vv || !dokunmatik) return () => {};
  const olc = () => isaretle(klavyeAcikGibiMi(window.innerHeight, vv.height));
  vv.addEventListener("resize", olc);
  return () => {
    vv.removeEventListener("resize", olc);
    isaretle(false);
  };
}
