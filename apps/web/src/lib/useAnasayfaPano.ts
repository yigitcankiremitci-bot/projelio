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

function cihazdanOku(kapsam: string): PanoKart[] | null {
  try {
    const raw = localStorage.getItem(`${PREFIX}${kapsam}`);
    return raw ? panoDuzeniniCoz(JSON.parse(raw)) : null;
  } catch {
    // Bozuk değer ya da kapalı depolama: varsayılan düzen.
    return null;
  }
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
}

/**
 * Panonun düzeni. Asıl kayıt hesapta (telefonla bilgisayar aynı panoyu görsün
 * diye, migration 183); cihazdaki kopya ilk boyamayı karşılar ki kartlar
 * yanıt gelince yerinden zıplamasın, sunucu kaydı yoksa da düzen kaybolmasın.
 */
export function useAnasayfaPano(kapsam: string, varsayilan: PanoKart[]): AnasayfaPano {
  const [kartlar, setKartlar] = useState<PanoKart[]>(() => cihazdanOku(kapsam) ?? varsayilan);
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
    setKartlar(cihazdanOku(kapsam) ?? varsayilan);
    let iptal = false;
    api
      .get<{ kartlar: PanoKart[] | null }>(`/users/me/anasayfa-pano/${kapsam}`)
      .then((yanit) => {
        if (iptal || dokunuldu.current || !yanit.kartlar) return;
        setKartlar(yanit.kartlar);
        cihazaYaz(kapsam, yanit.kartlar);
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
    sifirla: () => uygula(() => varsayilan),
  };
}
