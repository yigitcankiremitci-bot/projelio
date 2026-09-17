import {
  DEMO_ANAHTAR_SINIRI,
  DEMO_CIHAZLAR,
  DEMO_OLAY_TURLERI,
  DEMO_PAKET_SINIRI,
  DEMO_SAYFA_SURE_TAVANI,
  uuidMi,
  type DemoCihaz,
  type DemoKaynak,
  type DemoOlayTuru,
} from "@projelio/shared";

export interface TemizOlay {
  sira: number;
  at: string;
  tur: DemoOlayTuru;
  anahtar: string;
  sayfa: string;
  sure_sn: number | null;
}

export interface TemizPaket {
  ziyaretId: string;
  cihaz: DemoCihaz;
  kaynak: DemoKaynak | null;
  dil: string | null;
  olaylar: TemizOlay[];
}

/** Olay zamanı en fazla bu kadar geriye gidebilir (sayfa uzun süre açık kaldıysa). */
const AZAMI_GECMIS_MS = 12 * 3600_000;

const DENETIM_KARAKTERI = /[\x00-\x1f\x7f]/g;

function metin(deger: unknown, sinir: number): string {
  // Denetim karakterleri atılır: etiket bir panoda gösterilecek.
  return typeof deger === "string" ? deger.replace(DENETIM_KARAKTERI, " ").trim().slice(0, sinir) : "";
}

/**
 * İstemci paketini doğrular. Uç kimliği doğrulanmış demo oturumuna açık ama
 * gövde yine de ziyaretçinin elinde — bozuk olanı HATA VERMEDEN atar: ölçüm
 * bir istatistik, ziyaretçinin ekranında bir şey bozmamalı.
 *
 * ZAMAN: istemci saati yanlış olabilir. Olayın zamanı "sunucu saati − (paketin
 * gönderildiği an − olayın anı)" olarak hesaplanır; yalnızca aradaki FARKA
 * güveniliyor, mutlak saate değil.
 */
export function demoPaketiniTemizle(govde: unknown, sunucuSimdi: number): TemizPaket | null {
  if (!govde || typeof govde !== "object") return null;
  const g = govde as Record<string, unknown>;
  if (!uuidMi(g.ziyaretId)) return null;
  const istemciSimdi = typeof g.simdi === "number" && Number.isFinite(g.simdi) ? g.simdi : null;
  if (istemciSimdi === null || !Array.isArray(g.olaylar)) return null;

  const olaylar: TemizOlay[] = [];
  for (const ham of g.olaylar.slice(0, DEMO_PAKET_SINIRI)) {
    if (!ham || typeof ham !== "object") continue;
    const o = ham as Record<string, unknown>;
    const tur = o.tur as DemoOlayTuru;
    if (!DEMO_OLAY_TURLERI.includes(tur)) continue;
    if (!Number.isInteger(o.sira) || (o.sira as number) < 0 || (o.sira as number) > 1_000_000) continue;
    if (typeof o.t !== "number" || !Number.isFinite(o.t)) continue;
    const anahtar = metin(o.anahtar, DEMO_ANAHTAR_SINIRI);
    const sayfa = metin(o.sayfa, DEMO_ANAHTAR_SINIRI);
    if (!anahtar || !sayfa) continue;
    const fark = Math.min(Math.max(istemciSimdi - o.t, 0), AZAMI_GECMIS_MS);
    let sure: number | null = null;
    if (tur === "sayfa" && typeof o.sure === "number" && Number.isFinite(o.sure)) {
      sure = Math.round(Math.min(Math.max(o.sure, 0), DEMO_SAYFA_SURE_TAVANI) * 10) / 10;
    }
    olaylar.push({
      sira: o.sira as number,
      at: new Date(sunucuSimdi - fark).toISOString(),
      tur,
      anahtar,
      sayfa,
      sure_sn: sure,
    });
  }

  return {
    ziyaretId: g.ziyaretId.toLowerCase(),
    cihaz: DEMO_CIHAZLAR.includes(g.cihaz as DemoCihaz) ? (g.cihaz as DemoCihaz) : "masaustu",
    kaynak: g.kaynak === "tanitim" || g.kaynak === "giris" ? g.kaynak : null,
    dil: g.dil === "tr" || g.dil === "en" ? g.dil : null,
    olaylar,
  };
}
