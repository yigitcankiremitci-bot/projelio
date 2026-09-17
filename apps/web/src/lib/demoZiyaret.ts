import { useEffect } from "react";
import {
  DEMO_PAKET_SINIRI,
  demoCihazSinifi,
  demoSayfaAnahtari,
  type DemoKaynak,
  type DemoOlayGirdisi,
  type DemoPaketi,
} from "@projelio/shared";
import { API_URL } from "../api/client";
import { en } from "./i18n/en/index";
import { getLocale } from "./i18n/depo";
import { isLioPanelOpen, onLioPanelChange } from "./lioPanel";
import { ETKILESIM_ESIGI_MS } from "./etkinlikKarari";

/**
 * Demo ziyaretçisinin gezinmesi (Admin > Demo ziyaretleri, migration 116).
 *
 * YALNIZCA DEMO HESABINDA çalışır; gerçek kullanıcıların gezinmesi ölçülmez
 * (sunucu da demo dışındaki paketleri atıyor). Giriş ekranındaki demo kutusu
 * ve gizlilik politikası bu ölçümü açıkça söylüyor.
 *
 * NE YAZILIR: hangi sayfa (kimlikler atılmış anahtar), orada etkin geçen süre,
 * Lio panelinin açılması ve tıklanan düğmenin ETİKETİ. Etiket yalnızca
 * arayüzün kendi metniyse yazılır (çeviri sözlüğünde karşılığı olan bir
 * metin ya da `data-izle` işareti): düğmenin içinde ziyaretçinin yazdığı bir
 * görev başlığı varsa o, sözlükte olmadığı için hiç kaydedilmez. Form
 * alanları ve Lio'ya yazılanlar hiç okunmaz.
 *
 * Sayfa olayı SAYFAYA GİRİLDİĞİ AN sırasını alır ve her gönderimde o anki
 * süresiyle yeniden yollanır; sunucu aynı sırayı günceller. Böylece sekme
 * kapanırken son paket kaybolsa bile süre en fazla bir gönderim aralığı kadar
 * eksik kalır.
 */

const DEPO_ANAHTARI = "projelio_demo_ziyaret";
/** Yönlendirici yol değişimini izleyiciye bu olayla iletir. */
const YOL_OLAYI = "projelio:demo-yol";
const GONDERIM_ARALIGI_MS = 20_000;
const SAYAC_ARALIGI_MS = 2_000;
const ETIKET_SINIRI = 40;

interface ZiyaretDurumu {
  id: string;
  sira: number;
  kaynak: DemoKaynak | null;
}

function durumuOku(): ZiyaretDurumu | null {
  try {
    const ham = sessionStorage.getItem(DEPO_ANAHTARI);
    if (!ham) return null;
    const d = JSON.parse(ham) as ZiyaretDurumu;
    return typeof d.id === "string" && typeof d.sira === "number" ? d : null;
  } catch {
    return null;
  }
}

function durumuYaz(d: ZiyaretDurumu): void {
  try {
    sessionStorage.setItem(DEPO_ANAHTARI, JSON.stringify(d));
  } catch {
    // Gizli pencerede depo kapalı olabilir: ziyaret bu sekmeyle sınırlı kalır.
  }
}

function yeniId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // Eski tarayıcı: v4 biçiminde rastgele kimlik.
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16)
  );
}

/**
 * Demo girişinde çağrılır: her giriş YENİ bir ziyarettir. `tanitim` = tanıtım
 * sitesinin "Demo hesabıyla gez" bağlantısından geldi.
 */
export function demoZiyaretiBaslat(kaynak: DemoKaynak): void {
  durumuYaz({ id: yeniId(), sira: 0, kaynak });
}

let arayuzMetinleri: Map<string, string> | null = null;

/**
 * Arayüz metni mi? Türkçe anahtarı döner — İngilizce arayüzde tıklanan
 * "Add task" da "Görev ekle" olarak sayılsın, iki dil ayrı satır olmasın.
 */
function arayuzMetni(metin: string): string | null {
  if (!arayuzMetinleri) {
    arayuzMetinleri = new Map();
    for (const [tr, ing] of Object.entries(en as Record<string, string>)) {
      arayuzMetinleri.set(tr, tr);
      if (typeof ing === "string" && !arayuzMetinleri.has(ing)) arayuzMetinleri.set(ing, tr);
    }
  }
  return arayuzMetinleri.get(metin) ?? null;
}

const TIKLANABILIR = '[data-izle],button,a[href],[role="button"],[role="tab"],[role="menuitem"],[role="option"],[role="switch"]';

/** Tıklanan öğenin kaydedilebilir etiketi; kaydedilecek bir şey yoksa null. */
function tiklamaEtiketi(hedef: Element): string | null {
  const oge = hedef.closest(TIKLANABILIR);
  if (!oge) return null;
  const isaret = oge.getAttribute("data-izle");
  if (isaret) return isaret.slice(0, ETIKET_SINIRI);
  for (const aday of [oge.getAttribute("aria-label"), oge.getAttribute("title"), oge.textContent]) {
    const temiz = (aday ?? "").replace(/\s+/g, " ").trim();
    if (!temiz || temiz.length > 80) continue;
    const tr = arayuzMetni(temiz);
    if (tr) return tr.slice(0, ETIKET_SINIRI);
  }
  // Uygulama içi bağlantı: metni değil, gittiği sayfayı yaz.
  const href = oge.tagName === "A" ? oge.getAttribute("href") : null;
  if (href && href.startsWith("/")) return `→ ${demoSayfaAnahtari(href)}`.slice(0, ETIKET_SINIRI);
  return null;
}

export function useDemoZiyaret(etkin: boolean, yol: string): void {
  // Oturum kapsamındaki tüm durum tek bir effect'te; yol değişimi aşağıdaki
  // ikinci effect'le olay olarak iletiliyor.
  useEffect(() => {
    if (!etkin) return;
    let durum = durumuOku();
    if (!durum) {
      // Giriş ekranından geçmeden gelindi (yeni sekme, sayfa yenileme sonrası
      // depo temizlenmiş): kaynağı bilinmeyen yeni bir ziyaret.
      durum = { id: yeniId(), sira: 0, kaynak: null };
      durumuYaz(durum);
    }
    const z = durum;
    let kuyruk: DemoOlayGirdisi[] = [];
    let sayfa: { olay: DemoOlayGirdisi; sn: number } | null = null;
    let sonEtkilesim = Date.now();
    let sonSayac = Date.now();

    const siraAl = () => {
      z.sira += 1;
      durumuYaz(z);
      return z.sira;
    };

    const olay = (tur: DemoOlayGirdisi["tur"], anahtar: string) => {
      kuyruk.push({ sira: siraAl(), t: Date.now(), tur, anahtar, sayfa: sayfa?.olay.anahtar ?? "/" });
    };

    const say = () => {
      const simdi = Date.now();
      const gecen = Math.min(simdi - sonSayac, SAYAC_ARALIGI_MS * 3);
      sonSayac = simdi;
      if (sayfa && document.visibilityState === "visible" && simdi - sonEtkilesim < ETKILESIM_ESIGI_MS) {
        sayfa.sn += gecen / 1000;
      }
    };

    const gonder = () => {
      say();
      const olaylar = [...kuyruk];
      if (sayfa) olaylar.push({ ...sayfa.olay, sure: Math.round(sayfa.sn * 10) / 10 });
      if (olaylar.length === 0) return;
      kuyruk = [];
      const token = localStorage.getItem("projelio_token");
      if (!token) return;
      for (let i = 0; i < olaylar.length; i += DEMO_PAKET_SINIRI) {
        const paket: DemoPaketi = {
          ziyaretId: z.id,
          cihaz: demoCihazSinifi(window.innerWidth),
          kaynak: z.kaynak,
          dil: getLocale(),
          simdi: Date.now(),
          olaylar: olaylar.slice(i, i + DEMO_PAKET_SINIRI),
        };
        // api istemcisi bilerek kullanılmıyor: ölçüm isteğinin 401'i oturumu
        // kapatmamalı (client.ts'teki merkezi oturum sonlandırma), ve
        // `keepalive` sekme kapanırken de isteğin çıkmasını sağlıyor.
        fetch(`${API_URL}/demo/ziyaret`, {
          method: "POST",
          keepalive: true,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(paket),
        }).catch(() => {});
      }
    };

    const sayfayaGir = (yeniYol: string) => {
      const anahtar = demoSayfaAnahtari(yeniYol);
      if (sayfa?.olay.anahtar === anahtar) return;
      say();
      if (sayfa) kuyruk.push({ ...sayfa.olay, sure: Math.round(sayfa.sn * 10) / 10 });
      sayfa = { olay: { sira: siraAl(), t: Date.now(), tur: "sayfa", anahtar, sayfa: anahtar }, sn: 0 };
    };

    const tiklama = (e: MouseEvent) => {
      if (!(e.target instanceof Element)) return;
      const etiket = tiklamaEtiketi(e.target);
      if (etiket) olay("tikla", etiket);
    };

    const etkilesim = () => {
      const simdi = Date.now();
      // Boşluktan dönüş: aradaki süre sayılmasın.
      if (simdi - sonEtkilesim >= ETKILESIM_ESIGI_MS) sonSayac = simdi;
      sonEtkilesim = simdi;
    };

    const gorunurluk = () => {
      if (document.visibilityState === "hidden") gonder();
      else {
        sonSayac = Date.now();
        sonEtkilesim = Date.now();
      }
    };

    let lioAcik = isLioPanelOpen();
    const lioCikis = onLioPanelChange(() => {
      const acik = isLioPanelOpen();
      if (acik && !lioAcik) olay("ozellik", "lio");
      lioAcik = acik;
    });

    const yolDinleyici = (e: Event) => sayfayaGir((e as CustomEvent<string>).detail);
    window.addEventListener(YOL_OLAYI, yolDinleyici);
    sayfayaGir(window.location.pathname);

    const etkilesimOlaylari = ["pointerdown", "keydown", "wheel", "scroll", "touchstart"] as const;
    for (const o of etkilesimOlaylari) window.addEventListener(o, etkilesim, { passive: true, capture: true });
    document.addEventListener("click", tiklama, { capture: true });
    document.addEventListener("visibilitychange", gorunurluk);
    window.addEventListener("pagehide", gonder);
    const sayacZ = window.setInterval(say, SAYAC_ARALIGI_MS);
    const gonderZ = window.setInterval(gonder, GONDERIM_ARALIGI_MS);

    return () => {
      gonder();
      lioCikis();
      window.removeEventListener(YOL_OLAYI, yolDinleyici);
      for (const o of etkilesimOlaylari) window.removeEventListener(o, etkilesim, { capture: true });
      document.removeEventListener("click", tiklama, { capture: true });
      document.removeEventListener("visibilitychange", gorunurluk);
      window.removeEventListener("pagehide", gonder);
      window.clearInterval(sayacZ);
      window.clearInterval(gonderZ);
    };
  }, [etkin]);

  useEffect(() => {
    if (etkin) window.dispatchEvent(new CustomEvent(YOL_OLAYI, { detail: yol }));
  }, [etkin, yol]);
}
