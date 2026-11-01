// 3D ofiste yürüyen kişilerin yol bulması (web: components/ofis3d/OfisMotoru.ts).
//
// Önceden yol sabit ara noktalardan geçiyordu (koltuk → masa sırasının ucu →
// kapı → ortak alan); düzenleyicide taşınan masa, bitki ya da mağazadan
// konan eşya o yolun üstüne gelince kişiler içinden geçip gidiyordu. Şimdi
// zemin bir ızgaraya bölünür: duvarlar (kapı boşlukları hariç) ve eşyaların
// ayak izleri dolu sayılır, yol A* ile bulunur ve görüş hattıyla sadeleştirilir.
//
// Saf modül: three.js'e bağlı değil, eşya ayak izlerini motor çıkarıp verir.

import type { Dikdortgen, Duvar } from "./ofisOyunu";

export interface Nokta {
  x: number;
  z: number;
}

export interface YolIzgarasi {
  x0: number;
  z0: number;
  hucre: number;
  gw: number;
  gd: number;
  /** 1: geçilemez. */
  dolu: Uint8Array;
}

export interface IzgaraAyari {
  /** Hücre kenarı (metre). */
  hucre?: number;
  /** Kişinin yarıçapı: engeller ve duvarlar bu kadar şişirilir. */
  yaricap?: number;
  /** Duvar kalınlığı (motorda kalın duvar 0.16). */
  duvarKalinlik?: number;
}

/**
 * Izgarayı kurar. `sinir` bütün odaları kapsayan dikdörtgen; dışı zaten dış
 * duvarlarla kapalı olduğu için ayrıca doldurulmaz.
 */
export function izgaraKur(sinir: Dikdortgen, duvarlar: Duvar[], engeller: Dikdortgen[], ayar: IzgaraAyari = {}): YolIzgarasi {
  const hucre = ayar.hucre ?? 0.2;
  const yaricap = ayar.yaricap ?? 0.18;
  const yariDuvar = (ayar.duvarKalinlik ?? 0.16) / 2 + yaricap;
  const gw = Math.max(1, Math.ceil(sinir.w / hucre));
  const gd = Math.max(1, Math.ceil(sinir.d / hucre));
  const iz: YolIzgarasi = { x0: sinir.x, z0: sinir.z, hucre, gw, gd, dolu: new Uint8Array(gw * gd) };

  const doldur = (x1: number, z1: number, x2: number, z2: number) => {
    // Hücre ortası dikdörtgenin içindeyse dolu.
    const i1 = Math.max(0, Math.ceil((x1 - iz.x0) / hucre - 0.5));
    const i2 = Math.min(gw - 1, Math.floor((x2 - iz.x0) / hucre - 0.5));
    const j1 = Math.max(0, Math.ceil((z1 - iz.z0) / hucre - 0.5));
    const j2 = Math.min(gd - 1, Math.floor((z2 - iz.z0) / hucre - 0.5));
    for (let j = j1; j <= j2; j++) for (let i = i1; i <= i2; i++) iz.dolu[j * gw + i] = 1;
  };

  for (const d of duvarlar) {
    const yatay = d.z1 === d.z2;
    const bas = yatay ? Math.min(d.x1, d.x2) : Math.min(d.z1, d.z2);
    const son = yatay ? Math.max(d.x1, d.x2) : Math.max(d.z1, d.z2);
    const parcalar: [number, number][] = d.kapi
      ? [
          [bas, d.kapi.orta - d.kapi.genislik / 2],
          [d.kapi.orta + d.kapi.genislik / 2, son],
        ]
      : [[bas, son]];
    const sabit = yatay ? d.z1 : d.x1;
    for (const [a, b] of parcalar) {
      if (b - a <= 0) continue;
      // Uçlar da yarıçap kadar uzar: kapı pervazına sürtünmeden geçilsin.
      if (yatay) doldur(a - yaricap, sabit - yariDuvar, b + yaricap, sabit + yariDuvar);
      else doldur(sabit - yariDuvar, a - yaricap, sabit + yariDuvar, b + yaricap);
    }
  }
  for (const e of engeller) doldur(e.x - yaricap, e.z - yaricap, e.x + e.w + yaricap, e.z + e.d + yaricap);
  return iz;
}

const hucreOf = (iz: YolIzgarasi, p: Nokta): [number, number] => [
  Math.min(iz.gw - 1, Math.max(0, Math.floor((p.x - iz.x0) / iz.hucre))),
  Math.min(iz.gd - 1, Math.max(0, Math.floor((p.z - iz.z0) / iz.hucre))),
];
const merkez = (iz: YolIzgarasi, i: number, j: number): Nokta => ({ x: iz.x0 + (i + 0.5) * iz.hucre, z: iz.z0 + (j + 0.5) * iz.hucre });

/** Noktaya en yakın boş hücre (genişleyen halkalarla); hiç yoksa null. */
export function enYakinBos(iz: YolIzgarasi, p: Nokta, enCok = 12): [number, number] | null {
  const [ci, cj] = hucreOf(iz, p);
  if (!iz.dolu[cj * iz.gw + ci]) return [ci, cj];
  let en: [number, number] | null = null;
  let enD = Infinity;
  for (let r = 1; r <= enCok; r++) {
    for (let j = cj - r; j <= cj + r; j++)
      for (let i = ci - r; i <= ci + r; i++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue;
        if (i < 0 || j < 0 || i >= iz.gw || j >= iz.gd || iz.dolu[j * iz.gw + i]) continue;
        const m = merkez(iz, i, j);
        const d = (m.x - p.x) ** 2 + (m.z - p.z) ** 2;
        if (d < enD) {
          enD = d;
          en = [i, j];
        }
      }
    if (en) return en;
  }
  return null;
}

/** İki nokta arası boş mu (yarım hücre adımlarla örnekler). */
export function gorusVar(iz: YolIzgarasi, a: Nokta, b: Nokta): boolean {
  const uz = Math.hypot(b.x - a.x, b.z - a.z);
  const adim = Math.max(1, Math.ceil(uz / (iz.hucre / 2)));
  for (let s = 0; s <= adim; s++) {
    const t = s / adim;
    const [i, j] = hucreOf(iz, { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    if (iz.dolu[j * iz.gw + i]) return false;
  }
  return true;
}

/**
 * `bas`tan `son`a yol: ilk ve son nokta en yakın boş hücreye oturtulmuş
 * hâlleridir (kişi koltuktan kalkarken masanın ayak izi içinde olabilir).
 * Dönen noktalar yürünecek ara hedeflerdir, ilki bas'ın oturtulmuşu. Yol
 * yoksa null.
 */
export function yolBul(iz: YolIzgarasi, bas: Nokta, son: Nokta): Nokta[] | null {
  const b = enYakinBos(iz, bas);
  const s = enYakinBos(iz, son);
  if (!b || !s) return null;
  const { gw, gd, dolu } = iz;
  const hedef = s[1] * gw + s[0];
  const g = new Float64Array(gw * gd).fill(Infinity);
  const onceki = new Int32Array(gw * gd).fill(-1);
  const kapali = new Uint8Array(gw * gd);
  const h = (k: number) => {
    const dx = Math.abs((k % gw) - s[0]);
    const dz = Math.abs(Math.floor(k / gw) - s[1]);
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
  };
  // İkili yığın: [öncelik, hücre].
  const yigin: [number, number][] = [];
  const it = (e: [number, number]) => {
    yigin.push(e);
    let i = yigin.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (yigin[p][0] <= yigin[i][0]) break;
      [yigin[p], yigin[i]] = [yigin[i], yigin[p]];
      i = p;
    }
  };
  const al = (): [number, number] => {
    const ust = yigin[0];
    const son2 = yigin.pop()!;
    if (yigin.length) {
      yigin[0] = son2;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let k = i;
        if (l < yigin.length && yigin[l][0] < yigin[k][0]) k = l;
        if (r < yigin.length && yigin[r][0] < yigin[k][0]) k = r;
        if (k === i) break;
        [yigin[k], yigin[i]] = [yigin[i], yigin[k]];
        i = k;
      }
    }
    return ust;
  };
  const basK = b[1] * gw + b[0];
  g[basK] = 0;
  it([h(basK), basK]);
  let bulundu = false;
  while (yigin.length) {
    const [, k] = al();
    if (kapali[k]) continue;
    if (k === hedef) {
      bulundu = true;
      break;
    }
    kapali[k] = 1;
    const i = k % gw;
    const j = Math.floor(k / gw);
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= gw || nj >= gd) continue;
        const nk = nj * gw + ni;
        if (dolu[nk] || kapali[nk]) continue;
        // Çaprazda köşe kesilmez: iki komşu da boş olmalı.
        if (di && dj && (dolu[j * gw + ni] || dolu[nj * gw + i])) continue;
        const yeni = g[k] + (di && dj ? Math.SQRT2 : 1);
        if (yeni < g[nk]) {
          g[nk] = yeni;
          onceki[nk] = k;
          it([yeni + h(nk), nk]);
        }
      }
  }
  if (!bulundu) return null;
  const hucreler: Nokta[] = [];
  for (let k = hedef; k !== -1; k = onceki[k]) hucreler.push(merkez(iz, k % gw, Math.floor(k / gw)));
  hucreler.reverse();
  // Görüş hattıyla sadeleştir: her noktadan görülebilen en uzak noktaya atla.
  const yol: Nokta[] = [hucreler[0]];
  let i = 0;
  while (i < hucreler.length - 1) {
    let j = hucreler.length - 1;
    while (j > i + 1 && !gorusVar(iz, hucreler[i], hucreler[j])) j--;
    yol.push(hucreler[j]);
    i = j;
  }
  return yol;
}
