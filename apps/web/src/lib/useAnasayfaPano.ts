import { useCallback, useEffect, useRef, useState } from "react";
import {
  panoBoyutAyarla,
  panoDuzeniniCoz,
  panoKartEkle,
  panoKartKaldir,
  panoSirala,
  type PanoBoyut,
  type PanoKart,
} from "@projelio/shared";
import { api } from "../api/client";

const PREFIX = "projelio_anasayfa_pano_";

/**
 * Sonradan varsayılana giren kartlar. Kayıtlı düzen olduğu gibi korunduğu için
 * bunlar eski panolarda hiç görünmüyordu ("projeler hâlâ yok"). Her biri tek
 * sefer, varsayılan sırasındaki yerine eklenir; işaret düzende kalır ki kartı
 * sonradan kaldıran birine bir daha dayatılmasın.
 */
const SONRADAN_GELENLER = ["projeler", "haber", "doviz", "borsa", "not"];
const TANITILDI = "tanitildi:";

function yenileriTanit(kartlar: PanoKart[], varsayilan: PanoKart[]): PanoKart[] {
  let sonuc = kartlar;
  for (const id of SONRADAN_GELENLER) {
    if (sonuc.some((k) => k.id === TANITILDI + id)) continue;
    sonuc = [...sonuc];
    const sira = varsayilan.findIndex((k) => k.id === id);
    if (sira >= 0 && !sonuc.some((k) => k.id === id)) {
      const oncekiler = new Set(varsayilan.slice(0, sira).map((k) => k.id));
      let konum = 0;
      sonuc.forEach((k, i) => {
        if (oncekiler.has(k.id)) konum = i + 1;
      });
      sonuc.splice(konum, 0, varsayilan[sira]);
    }
    sonuc.push({ id: TANITILDI + id, boyut: "kucuk" });
  }
  return sonuc;
}

function cihazdanOku(kapsam: string): PanoKart[] | null {
  try {
    const raw = localStorage.getItem(`${PREFIX}${kapsam}`);
    return raw ? panoDuzeniniCoz(JSON.parse(raw)) : null;
  } catch {
    // Bozuk değer ya da kapalı depolama: varsayılan düzen.
    return null;
  }
}

function cihazDuzeni(kapsam: string, varsayilan: PanoKart[]): PanoKart[] {
  const kayitli = cihazdanOku(kapsam);
  if (!kayitli) return yenileriTanit(varsayilan, varsayilan);
  const tanitilmis = yenileriTanit(kayitli, varsayilan);
  // Sunucuda kayıt yoksa (migration uygulanmamış) tek kalıcı yer burası.
  if (tanitilmis !== kayitli) cihazaYaz(kapsam, tanitilmis);
  return tanitilmis;
}

function cihazaYaz(kapsam: string, kartlar: PanoKart[]) {
  try {
    localStorage.setItem(`${PREFIX}${kapsam}`, JSON.stringify(kartlar));
  } catch {
    // Yazılamazsa düzen hesaba yine gider; yalnızca ilk boyama varsayılanla olur.
  }
}

export interface AnasayfaPano {
  kartlar: PanoKart[];
  sirala: (ekrandakiSira: string[]) => void;
  ekle: (id: string, boyut?: PanoBoyut) => void;
  kaldir: (id: string) => void;
  boyutAyarla: (id: string, boyut: PanoBoyut) => void;
  sifirla: () => void;
  /** Yıldızlanan işlerin/projelerin kimlikleri. */
  yildizlar: string[];
  yildizla: (id: string) => void;
}

/**
 * Yıldızlar düzenin içinde, bu önekle saklanıyor: hesaba yazılıyor ve cihazlar
 * arasında geziyor, ayrı tablo gerekmiyor. Katalogda karşılığı olmadığı için
 * kart olarak çizilmez; sürükleme de bilinmeyen kimlikleri silmez.
 */
const YILDIZ = "yildiz:";

/**
 * Panonun düzeni. Asıl kayıt hesapta (telefonla bilgisayar aynı panoyu görsün
 * diye, migration 183); cihazdaki kopya ilk boyamayı karşılar ki kartlar
 * yanıt gelince yerinden zıplamasın, sunucu kaydı yoksa da düzen kaybolmasın.
 */
export function useAnasayfaPano(kapsam: string, varsayilan: PanoKart[]): AnasayfaPano {
  const [kartlar, setKartlar] = useState<PanoKart[]>(() => cihazDuzeni(kapsam, varsayilan));
  // Kullanıcı düzeni değiştirdikten sonra gelen (eski) sunucu yanıtı, az önce
  // yaptığı taşımayı geri almasın.
  const dokunuldu = useRef(false);
  const zamanlayici = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bekleyen = useRef<{ kapsam: string; kartlar: PanoKart[] } | null>(null);

  const gonder = useCallback(() => {
    if (zamanlayici.current) clearTimeout(zamanlayici.current);
    zamanlayici.current = null;
    const is = bekleyen.current;
    bekleyen.current = null;
    // Kaydedilemezse (çevrimdışı, migration yok) düzen bu cihazda yine geçerli;
    // bir görünüm tercihi için hata göstermeye değmez.
    if (is) api.patch(`/users/me/anasayfa-pano/${is.kapsam}`, { kartlar: is.kartlar }).catch(() => {});
  }, []);

  useEffect(() => {
    dokunuldu.current = false;
    setKartlar(cihazDuzeni(kapsam, varsayilan));
    let iptal = false;
    api
      .get<{ kartlar: PanoKart[] | null }>(`/users/me/anasayfa-pano/${kapsam}`)
      .then((yanit) => {
        if (iptal || dokunuldu.current || !yanit.kartlar) return;
        const tanitilmis = yenileriTanit(yanit.kartlar, varsayilan);
        setKartlar(tanitilmis);
        cihazaYaz(kapsam, tanitilmis);
        if (tanitilmis !== yanit.kartlar) {
          bekleyen.current = { kapsam, kartlar: tanitilmis };
          gonder();
        }
      })
      .catch(() => {});
    return () => {
      iptal = true;
      // Sayfadan hemen çıkılırsa son değişiklik yolda kalmasın.
      gonder();
    };
    // varsayilan bilerek dışarıda: her render'da yeni dizi gelebilir, kapsam belirleyici.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kapsam, gonder]);

  const uygula = (donustur: (onceki: PanoKart[]) => PanoKart[]) => {
    dokunuldu.current = true;
    setKartlar((onceki) => {
      const yeni = donustur(onceki);
      cihazaYaz(kapsam, yeni);
      bekleyen.current = { kapsam, kartlar: yeni };
      return yeni;
    });
    // Boyut düğmesine art arda basınca her tık için ayrı istek gitmesin.
    if (zamanlayici.current) clearTimeout(zamanlayici.current);
    zamanlayici.current = setTimeout(gonder, 500);
  };

  return {
    kartlar,
    sirala: (sira) => uygula((k) => panoSirala(k, sira)),
    ekle: (id, boyut) => uygula((k) => panoKartEkle(k, id, boyut)),
    kaldir: (id) => uygula((k) => panoKartKaldir(k, id)),
    boyutAyarla: (id, boyut) => uygula((k) => panoBoyutAyarla(k, id, boyut)),
    // Yıldız bir düzen tercihi değil: "varsayılan düzene dön" onları silmesin.
    sifirla: () => uygula((k) => [...varsayilan, ...k.filter((x) => x.id.startsWith(YILDIZ) || x.id.startsWith(TANITILDI))]),
    yildizlar: kartlar.filter((k) => k.id.startsWith(YILDIZ)).map((k) => k.id.slice(YILDIZ.length)),
    yildizla: (id) =>
      uygula((k) => (k.some((x) => x.id === YILDIZ + id) ? panoKartKaldir(k, YILDIZ + id) : panoKartEkle(k, YILDIZ + id))),
  };
}
