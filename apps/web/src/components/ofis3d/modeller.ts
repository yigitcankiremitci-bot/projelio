// 3D ofisin kodla çizilen parçaları (bkz. OfisMotoru.ts).
//
// Eşyaların çoğu hazır modellerden geliyor (varliklar.ts). Burada yalnızca
// hazır paketlerde karşılığı olmayanlar duruyor: akvaryum, langırt, oyun
// makinesi, heykel ve beyaz tahta — bir de bunları kurmaya yarayan küçük
// yardımcılar. Mağaza eşyasının hangi modelden çizileceği `esyaModeli`nde.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { EsyaTuru } from "../../lib/ofisOyunu";
import { hayaletYap, varlik } from "./varliklar";

export type Malzeme = (renk: string, o?: { parlak?: number; isik?: string; opak?: number; metal?: number }) => THREE.Material;

const onbellek = new Map<string, THREE.MeshStandardMaterial>();

/** Ortak malzeme: aynı renk tek malzeme (yüzlerce masa için yüzlerce malzeme açılmasın). */
export const malzeme: Malzeme = (renk, o = {}) => {
  const anahtar = `${renk}|${o.parlak ?? ""}|${o.isik ?? ""}|${o.opak ?? ""}|${o.metal ?? ""}`;
  let m = onbellek.get(anahtar);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: renk,
      roughness: o.parlak !== undefined ? 1 - o.parlak : 0.78,
      metalness: o.metal ?? 0,
      emissive: o.isik ?? "#000000",
      emissiveIntensity: o.isik ? 1.1 : 0,
      transparent: o.opak !== undefined,
      opacity: o.opak ?? 1,
      depthWrite: o.opak === undefined || o.opak > 0.6,
    });
    onbellek.set(anahtar, m);
  }
  return m;
};

/** Yerleştirme önizlemesi için yarı saydam, paylaşılmayan malzeme. */
export const hayaletMalzeme: Malzeme = (renk) =>
  new THREE.MeshStandardMaterial({ color: renk, transparent: true, opacity: 0.62, roughness: 0.6, depthWrite: false });

const kutuOnbellek = new Map<string, THREE.BufferGeometry>();
function kutuGeo(w: number, h: number, d: number, r: number): THREE.BufferGeometry {
  const k = `${w}|${h}|${d}|${r}`;
  let g = kutuOnbellek.get(k);
  if (!g) {
    const rr = Math.min(r, w / 2, h / 2, d / 2);
    g = rr > 0.005 ? new RoundedBoxGeometry(w, h, d, 3, rr) : new THREE.BoxGeometry(w, h, d);
    kutuOnbellek.set(k, g);
  }
  return g;
}

export function kutu(w: number, h: number, d: number, mat: THREE.Material, r = 0.04): THREE.Mesh {
  const m = new THREE.Mesh(kutuGeo(w, h, d, r), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function silindir(rUst: number, rAlt: number, h: number, mat: THREE.Material, parca = 20): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rUst, rAlt, h, parca), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function kure(r: number, mat: THREE.Material, detay = 1): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, detay), mat);
  m.castShadow = true;
  return m;
}

function yerlestir<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T {
  o.position.set(x, y, z);
  return o;
}

function kupa(m: Malzeme): THREE.Mesh {
  return silindir(0.04, 0.035, 0.09, m("#E86F51"), 12);
}

function akvaryum(m: Malzeme): THREE.Group {
  const g = new THREE.Group();
  g.add(yerlestir(kutu(1.4, 0.7, 0.6, m("#3B3F4C"), 0.03), 0, 0.35, 0));
  g.add(yerlestir(kutu(1.36, 0.62, 0.56, m("#7FD3F0", { isik: "#3AA6D9", opak: 0.45 }), 0.02), 0, 1.02, 0));
  g.add(yerlestir(kutu(1.36, 0.08, 0.56, m("#E8D6A8"), 0.01), 0, 0.75, 0));
  const baliklar: THREE.Mesh[] = [];
  const renk = ["#FF8A3D", "#FFD23F", "#FF5D73"];
  for (let i = 0; i < 4; i++) {
    const b = kure(0.05, m(renk[i % 3], { isik: renk[i % 3] }), 0);
    b.scale.set(1.6, 1, 0.6);
    g.add(b);
    baliklar.push(b);
  }
  g.userData.guncelle = (t: number) => {
    baliklar.forEach((b, i) => {
      const a = t * (0.5 + i * 0.12) + i * 1.7;
      b.position.set(Math.sin(a) * 0.5, 0.9 + ((i * 0.13) % 0.35) + Math.sin(a * 2) * 0.03, Math.cos(a * 0.7) * 0.15);
      b.rotation.y = Math.cos(a) > 0 ? 0 : Math.PI;
    });
  };
  return g;
}

function langirt(m: Malzeme): THREE.Group {
  const g = new THREE.Group();
  g.add(yerlestir(kutu(1.5, 0.22, 0.9, m("#8A5A3B"), 0.04), 0, 0.82, 0));
  g.add(yerlestir(kutu(1.36, 0.02, 0.76, m("#3FA35B"), 0.005), 0, 0.93, 0));
  for (const [x, z] of [
    [-0.65, -0.35],
    [0.65, -0.35],
    [-0.65, 0.35],
    [0.65, 0.35],
  ])
    g.add(yerlestir(kutu(0.1, 0.72, 0.1, m("#6E4630"), 0.02), x, 0.36, z));
  const cubuklar: THREE.Object3D[] = [];
  for (let i = 0; i < 6; i++) {
    const c = new THREE.Group();
    c.position.set(-0.55 + i * 0.22, 1.0, 0);
    const cubuk = silindir(0.012, 0.012, 1.2, m("#C9CDD6", { metal: 0.8, parlak: 0.6 }), 8);
    cubuk.rotation.x = Math.PI / 2;
    c.add(cubuk);
    for (const z of [-0.2, 0, 0.2]) c.add(yerlestir(kutu(0.05, 0.14, 0.04, m(i % 2 ? "#E8705B" : "#3D7DD8"), 0.01), 0, -0.05, z));
    g.add(c);
    cubuklar.push(c);
  }
  const top = yerlestir(kure(0.03, m("#ffffff"), 1), 0, 0.96, 0);
  g.add(top);
  g.userData.guncelle = (t: number) => {
    cubuklar.forEach((c, i) => (c.rotation.z = Math.sin(t * 3 + i) * 0.5));
    top.position.x = Math.sin(t * 1.3) * 0.6;
    top.position.z = Math.sin(t * 2.1) * 0.3;
  };
  return g;
}

function oyunMakinesi(m: Malzeme): THREE.Group {
  const g = new THREE.Group();
  g.add(yerlestir(kutu(0.85, 1.75, 0.75, m("#5B4CF0", { parlak: 0.4 }), 0.05), 0, 0.875, 0));
  const ekran = yerlestir(kutu(0.62, 0.46, 0.02, m("#5FBE94", { isik: "#5FBE94" }), 0.01), 0, 1.32, 0.38);
  ekran.castShadow = false;
  g.add(ekran);
  g.add(yerlestir(kutu(0.8, 0.08, 0.32, m("#2F3140"), 0.02), 0, 0.98, 0.42));
  g.add(yerlestir(kure(0.04, m("#FF4D6D", { isik: "#FF4D6D" })), -0.18, 1.05, 0.46));
  g.add(yerlestir(kure(0.035, m("#FFD23F", { isik: "#FFD23F" })), 0.12, 1.04, 0.46));
  g.add(yerlestir(kutu(0.85, 0.14, 0.75, m("#FF8A3D", { isik: "#FF8A3D" }), 0.04), 0, 1.68, 0));
  const ekranMat = ekran.material as THREE.MeshStandardMaterial;
  g.userData.guncelle = (t: number) => {
    ekranMat.emissiveIntensity = 0.9 + Math.sin(t * 6) * 0.25;
  };
  return g;
}

function heykel(m: Malzeme): THREE.Group {
  const g = new THREE.Group();
  g.add(yerlestir(kutu(0.9, 0.5, 0.9, m("#F4F1EC"), 0.05), 0, 0.25, 0));
  const ust = new THREE.Group();
  ust.position.y = 1.05;
  // Logonun iki rengi: bronz ve gri-lacivert.
  const a = kutu(0.36, 0.5, 0.08, m("#C0813F", { parlak: 0.5, metal: 0.3 }), 0.07);
  a.rotation.z = 0.2;
  a.position.x = -0.1;
  const b = kutu(0.36, 0.5, 0.08, m("#3E4858", { parlak: 0.5, metal: 0.3 }), 0.07);
  b.rotation.z = -0.2;
  b.position.set(0.1, 0, 0.06);
  ust.add(a, b);
  g.add(ust);
  g.userData.guncelle = (t: number) => {
    ust.rotation.y = t * 0.8;
    ust.position.y = 1.05 + Math.sin(t * 1.6) * 0.05;
  };
  return g;
}

/** Hazır modellerden birkaçını tek gruba dizer ([ad, x, z, dönüş]). */
function dizi(parcalar: [Parameters<typeof varlik>[0], number, number, number?][]): THREE.Group {
  const g = new THREE.Group();
  for (const [ad, x, z, don] of parcalar) {
    const o = varlik(ad);
    o.position.set(x, 0, z);
    o.rotation.y = don ?? 0;
    g.add(o);
  }
  return g;
}

/** Mağaza eşyasının modeli. `hayalet` yerleştirme önizlemesi içindir (yarı saydam). */
export function esyaModeli(tur: EsyaTuru, hayalet = false): THREE.Group {
  const m: Malzeme = hayalet ? hayaletMalzeme : malzeme;
  let g: THREE.Group;
  switch (tur) {
    case "bitki":
      g = varlik("saksi");
      break;
    case "agac":
      g = varlik("kaktus");
      break;
    case "monstera":
    case "inceMonstera":
    case "salonBitkisi":
    case "buyukKaktus":
      g = varlik(tur);
      break;
    case "puf":
      g = varlik("koltuk");
      break;
    case "lamba":
      g = varlik("ayakliLamba");
      break;
    case "kitaplik":
      g = dizi([["kitaplik", 0, 0], ["kitaplar", 0, 0.02]]);
      g.children[1].position.y = 0.5;
      break;
    case "dolap":
      g = varlik("dekorDolabi");
      break;
    case "kahve":
      g = dizi([["bar", -0.36, 0], ["bar", 0.36, 0], ["kahveMakinesi", -0.36, 0]]);
      g.children[2].position.y = 0.78;
      break;
    case "hali":
      g = varlik("haliOval");
      break;
    case "kanepe":
      g = varlik("kanepe");
      break;
    case "akvaryum":
      return akvaryum(m);
    case "langirt":
      return langirt(m);
    case "oyun":
      return oyunMakinesi(m);
    case "heykel":
      return heykel(m);
  }
  if (hayalet) hayaletYap(g);
  return g;
}

// ------------------------------------------------------------------ sabit oda eşyaları

export function tahta(): THREE.Group {
  const g = new THREE.Group();
  g.add(yerlestir(kutu(1.5, 0.9, 0.04, malzeme("#FFFFFF", { parlak: 0.5 }), 0.02), 0, 0, 0));
  // Yapışkan notlar: marka paletinin açık tonları (bronz, kum, çam, çivit).
  const notlar = ["#E0B077", "#F7ECDD", "#5FBE94", "#8C9BE8", "#D29A58"];
  notlar.forEach((r, i) => {
    const n = yerlestir(kutu(0.18, 0.18, 0.01, malzeme(r), 0.005), -0.5 + (i % 3) * 0.32, 0.18 - Math.floor(i / 3) * 0.3, 0.025);
    n.rotation.z = (i % 2 ? 1 : -1) * 0.06;
    n.castShadow = false;
    g.add(n);
  });
  return g;
}
