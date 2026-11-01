// "Sakin Projelio" deneme arayüzünün saf kuralları (bkz. pages/Sakin.tsx).
//
// React'ten bağımsız tutuldu ki test edilebilsin: hangi görevlerin "bugünün
// hamlesi" olacağı, haftalık halkaların oranı, departman ışığının rengi ve
// izometrik haritanın yerleşimi burada hesaplanır. Sayfa yalnızca çizer.

import type { PersonalBoardItem } from "@projelio/shared";

export type Durum = "ok" | "warn" | "crit";

/** Yerel saate göre YYYY-MM-DD. toISOString UTC'ye çevirdiği için gece yarısına yakın kayar. */
export function yerelTarih(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const g = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${g}`;
}

/** Haftanın pazartesisi ve pazarı (Türkiye'de hafta pazartesi başlar). */
export function haftaAraligi(bugun: Date): { bas: string; son: string } {
  const gun = (bugun.getDay() + 6) % 7; // pazartesi = 0
  const bas = new Date(bugun.getFullYear(), bugun.getMonth(), bugun.getDate() - gun);
  const son = new Date(bas.getFullYear(), bas.getMonth(), bas.getDate() + 6);
  return { bas: yerelTarih(bas), son: yerelTarih(son) };
}

/** İki YYYY-MM-DD arasındaki gün farkı (b - a). */
export function gunFarki(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00`) - Date.parse(`${a}T00:00:00`);
  return Math.round(ms / 86_400_000);
}

function vade(item: Pick<PersonalBoardItem, "effectiveDueDate">): string | undefined {
  return item.effectiveDueDate ? item.effectiveDueDate.slice(0, 10) : undefined;
}

function acikMi(item: Pick<PersonalBoardItem, "status" | "isHidden">): boolean {
  return item.status !== "completed" && !item.isHidden;
}

/**
 * Bugünün hamleleri: açık işlerden en acil `adet` tanesi.
 * Sıra: vadesi geçmiş (en eskisi önce) → bugün vadeli → yüksek öncelik → yakın vade.
 */
export function hamleleriSec<T extends PersonalBoardItem>(items: T[], bugun: string, adet = 3): T[] {
  const sinif = (i: T): number => {
    const v = vade(i);
    if (v && v < bugun) return 0;
    if (v === bugun) return 1;
    return 2;
  };
  return items
    .filter(acikMi)
    .slice()
    .sort((a, b) => {
      const s = sinif(a) - sinif(b);
      if (s !== 0) return s;
      const p = (b.priority ?? 0) - (a.priority ?? 0);
      if (p !== 0) return p;
      const va = vade(a) ?? "9999-12-31";
      const vb = vade(b) ?? "9999-12-31";
      return va < vb ? -1 : va > vb ? 1 : 0;
    })
    .slice(0, adet);
}

export interface Halka {
  yapilan: number;
  toplam: number;
  yuzde: number;
}

function halka(yapilan: number, toplam: number): Halka {
  return { yapilan, toplam, yuzde: toplam > 0 ? Math.round((yapilan / toplam) * 100) : 100 };
}

/**
 * Üç halka, hepsi kullanıcının kendi panosundan:
 *  - hafta: bu hafta bitirdiklerin / (bitirdiklerin + hafta sonuna kadar vadesi olan açıklar)
 *  - zamaninda: vadeli açık işlerinden kaçının vadesi henüz geçmedi
 *  - bugun: bugün bitirdiklerin / (bugün bitirdiklerin + vadesi bugün ya da geçmiş açıklar)
 */
export function halkalariHesapla(
  items: PersonalBoardItem[],
  bugun: string,
  hafta: { bas: string; son: string }
): { hafta: Halka; zamaninda: Halka; bugun: Halka } {
  const bitisGunu = (i: PersonalBoardItem) => (i.completedAt ? yerelTarih(new Date(i.completedAt)) : undefined);
  const biten = items.filter((i) => i.status === "completed");
  const acik = items.filter(acikMi);

  const haftaBiten = biten.filter((i) => {
    const g = bitisGunu(i);
    return !!g && g >= hafta.bas && g <= hafta.son;
  }).length;
  const haftaAcik = acik.filter((i) => {
    const v = vade(i);
    return !!v && v <= hafta.son;
  }).length;

  const vadeliAcik = acik.filter((i) => !!vade(i));
  const geciken = vadeliAcik.filter((i) => (vade(i) as string) < bugun).length;

  const bugunBiten = biten.filter((i) => bitisGunu(i) === bugun).length;
  const bugunAcik = acik.filter((i) => {
    const v = vade(i);
    return !!v && v <= bugun;
  }).length;

  return {
    hafta: halka(haftaBiten, haftaBiten + haftaAcik),
    zamaninda: halka(vadeliAcik.length - geciken, vadeliAcik.length),
    bugun: halka(bugunBiten, bugunBiten + bugunAcik),
  };
}

/** Depo modülüyle aynı kural: miktar kritik seviyeye eşit ya da altındaysa kritik. */
export function stokDurumu(miktar: number, kritik: number): Durum {
  if (!Number.isFinite(kritik) || kritik <= 0) return "ok";
  if (miktar <= kritik) return "crit";
  if (miktar <= kritik * 1.25) return "warn";
  return "ok";
}

/** Departman ışığı: kritik stok ya da 3+ gecikme kırmızı, tek gecikme bile sarı. */
export function departmanDurumu(gecikmis: number, kritikStok: number): Durum {
  if (kritikStok > 0 || gecikmis >= 3) return "crit";
  if (gecikmis > 0) return "warn";
  return "ok";
}

export interface Parsel {
  x: number;
  y: number;
  w: number;
  d: number;
}

/**
 * İzometrik kampüste n bina için parseller. Binalar ızgaraya dizilir; aralarında
 * yol bırakılır. Birimler harita birimi (1 birim ≈ 22 px).
 */
export function kampusYerlesimi(n: number): { genislik: number; derinlik: number; parseller: Parsel[] } {
  const sutun = n <= 3 ? Math.max(n, 1) : n <= 8 ? Math.ceil(n / 2) : Math.ceil(n / 3);
  const satir = Math.max(1, Math.ceil(n / sutun));
  const hucre = 4.4;
  const parseller: Parsel[] = [];
  for (let i = 0; i < n; i++) {
    const c = i % sutun;
    const r = Math.floor(i / sutun);
    parseller.push({ x: 0.9 + c * hucre, y: 0.9 + r * hucre, w: 3, d: 2.8 });
  }
  return { genislik: sutun * hucre + 0.6, derinlik: satir * hucre + 0.6, parseller };
}

/** Binanın yüksekliği açık iş yüküyle büyür ama sınırlı kalır (harita okunur kalsın). */
export function binaYuksekligi(acikIs: number): number {
  return 1.4 + Math.min(2.6, acikIs / 12);
}

export interface Oda extends Parsel {
  /** Ortadaki ortak alan mı (departman değil). */
  ortak?: boolean;
}

/**
 * Ofis planı: departman odaları ızgaraya, aralarına ince duvar payı bırakılarak
 * dizilir. 2–4 sütun; oda sayısı tek ise son satırın boş hücresi "Ortak alan"
 * olur ki plan dikdörtgen kalsın (görseldeki gibi).
 */
export function ofisYerlesimi(n: number): { genislik: number; derinlik: number; odalar: Oda[] } {
  const sutun = n <= 2 ? Math.max(n, 1) : n <= 6 ? 2 + Number(n > 4) : n <= 12 ? 3 + Number(n > 9) : 4;
  const satir = Math.max(1, Math.ceil(n / sutun));
  const W = 4.6;
  const D = 4.2;
  const ara = 0.25;
  const odalar: Oda[] = [];
  for (let i = 0; i < n; i++) {
    const c = i % sutun;
    const r = Math.floor(i / sutun);
    odalar.push({ x: 0.4 + c * (W + ara), y: 0.4 + r * (D + ara), w: W, d: D });
  }
  if (n % sutun !== 0) {
    const c = n % sutun;
    const r = satir - 1;
    odalar.push({ x: 0.4 + c * (W + ara), y: 0.4 + r * (D + ara), w: (sutun - c) * (W + ara) - ara, d: D, ortak: true });
  }
  return { genislik: sutun * (W + ara) + 0.55, derinlik: satir * (D + ara) + 0.55, odalar };
}
