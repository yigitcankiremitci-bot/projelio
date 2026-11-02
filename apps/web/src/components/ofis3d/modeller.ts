// 3D ofisin kodla çizilen parçaları (bkz. OfisMotoru.ts).
//
// Eşyaların çoğu hazır modellerden geliyor (varliklar.ts). Burada yalnızca
// hazır paketlerde karşılığı olmayanlar duruyor: akvaryum, langırt, oyun
// makinesi, heykel, masa tenisi, bilardo, piyano, şömine gibi mağaza eşyaları
// ve beyaz tahta — bir de bunları kurmaya yarayan küçük yardımcılar. Mağaza eşyasının hangi modelden çizileceği `esyaModeli`nde.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { EsyaTuru } from "../../lib/ofisOyunu";
import { hayaletYap, varlik, type VarlikAdi } from "./varliklar";

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


function armut(m: Malzeme): THREE.Group {
  const g = new THREE.Group();
  const govde = yerlestir(kure(0.45, m("#D86F4F"), 3), 0, 0.29, 0);
  govde.scale.set(1, 0.65, 1);
  const sirt = yerlestir(kure(0.32, m("#D86F4F"), 3), 0, 0.5, -0.15);
  sirt.scale.set(1, 0.8, 0.7);
  g.add(govde, sirt);
  return g;
}

function yerKuresi(m: Malzeme): THREE.Group {
  const g = new THREE.Group();
  g.add(yerlestir(silindir(0.22, 0.25, 0.05, m("#8A6446")), 0, 0.025, 0));
  g.add(yerlestir(silindir(0.025, 0.025, 0.7, m("#8A6446")), 0, 0.4, 0));
  const kap = new THREE.Group();
  kap.position.y = 1.0;
  kap.rotation.z = 0.41; // dünyanın eksen eğikliği
  const halka = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.012, 8, 40, Math.PI * 1.2), m("#C0813F", { metal: 0.5, parlak: 0.5 }));
  halka.rotation.z = -Math.PI * 0.6;
  kap.add(halka);
  const top = new THREE.Group();
  top.add(kure(0.24, m("#3D7DD8"), 3));
  // Kıtalar: kürenin yüzeyine yassı yeşil lekeler.
  for (const [enlem, boylam, r] of [
    [0.6, 0.3, 0.09],
    [0.1, 1.6, 0.1],
    [-0.4, 2.0, 0.07],
    [0.3, 3.4, 0.11],
    [-0.5, 4.6, 0.08],
    [0.7, 5.4, 0.07],
  ]) {
    const l = kure(r, m("#5FA35B"), 1);
    l.scale.set(1, 1, 0.35);
    const yon = new THREE.Vector3(Math.cos(enlem) * Math.sin(boylam), Math.sin(enlem), Math.cos(enlem) * Math.cos(boylam));
    l.position.copy(yon.clone().multiplyScalar(0.225));
    l.lookAt(yon.multiplyScalar(2));
    top.add(l);
  }
  kap.add(top);
  g.add(kap);
  g.userData.guncelle = (t: number) => {
    top.rotation.y = t * 0.4;
  };
  return g;
}

function ayakliSaat(m: Malzeme): THREE.Group {
  const g = new THREE.Group();
  g.add(yerlestir(kutu(0.5, 1.9, 0.34, m("#7A4E32"), 0.04), 0, 0.95, 0));
  g.add(yerlestir(kutu(0.58, 0.1, 0.4, m("#5E3B26"), 0.03), 0, 1.92, 0));
  const kadran = silindir(0.18, 0.18, 0.02, m("#F7F2E6"), 32);
  kadran.rotation.x = Math.PI / 2;
  g.add(yerlestir(kadran, 0, 1.6, 0.175));
  const yelkovan = new THREE.Group();
  yelkovan.position.set(0, 1.6, 0.19);
  yelkovan.add(yerlestir(kutu(0.012, 0.15, 0.005, m("#22252B"), 0.002), 0, 0.07, 0));
  const akrep = new THREE.Group();
  akrep.position.set(0, 1.6, 0.188);
  akrep.add(yerlestir(kutu(0.016, 0.1, 0.005, m("#22252B"), 0.002), 0, 0.045, 0));
  g.add(yelkovan, akrep);
  g.add(yerlestir(kutu(0.3, 0.75, 0.01, m("#2A2522", { opak: 0.85 }), 0.005), 0, 0.85, 0.172));
  const sarkac = new THREE.Group();
  sarkac.position.set(0, 1.18, 0.15);
  sarkac.add(yerlestir(kutu(0.015, 0.5, 0.01, m("#C0813F", { metal: 0.6, parlak: 0.6 }), 0.004), 0, -0.25, 0));
  const disk = silindir(0.06, 0.06, 0.015, m("#D9A54A", { metal: 0.7, parlak: 0.7 }), 20);
  disk.rotation.x = Math.PI / 2;
  sarkac.add(yerlestir(disk, 0, -0.5, 0));
  g.add(sarkac);
  g.userData.guncelle = (t: number) => {
    sarkac.rotation.z = Math.sin(t * 2.2) * 0.25;
    yelkovan.rotation.z = -t * 0.3;
    akrep.rotation.z = -t * 0.025;
  };
  return g;
}

function somine(m: Malzeme): THREE.Group {
  const g = new THREE.Group();
  g.add(yerlestir(kutu(1.4, 1.1, 0.5, m("#E8E2D8"), 0.03), 0, 0.55, 0));
  g.add(yerlestir(kutu(1.5, 0.08, 0.56, m("#8A6446"), 0.02), 0, 1.14, 0));
  g.add(yerlestir(kutu(0.82, 0.58, 0.06, m("#2A2522"), 0.02), 0, 0.39, 0.23));
  for (const [x, don] of [
    [-0.1, 0.3],
    [0.1, -0.3],
  ]) {
    const kutuk = silindir(0.05, 0.05, 0.5, m("#6E4630"), 10);
    kutuk.rotation.set(0, don, Math.PI / 2);
    g.add(yerlestir(kutuk, x, 0.16, 0.2));
  }
  const alevler: THREE.Mesh[] = [];
  for (const [x, boy, renk] of [
    [-0.15, 0.24, "#FF8A3D"],
    [0, 0.34, "#FFB13D"],
    [0.15, 0.22, "#FF6A1F"],
  ] as [number, number, string][]) {
    const a = new THREE.Mesh(new THREE.ConeGeometry(0.08, boy, 8), m(renk, { isik: renk }));
    a.position.set(x, 0.2 + boy / 2, 0.22);
    g.add(a);
    alevler.push(a);
  }
  // Rafta iki küçük süs.
  g.add(yerlestir(silindir(0.05, 0.06, 0.18, m("#5FBE94")), -0.5, 1.27, 0));
  g.add(yerlestir(kutu(0.2, 0.25, 0.04, m("#C0813F"), 0.02), 0.45, 1.305, -0.1));
  g.userData.guncelle = (t: number) => {
    alevler.forEach((a, i) => {
      a.scale.y = 0.85 + Math.sin(t * (7 + i * 2) + i) * 0.15;
      a.scale.x = a.scale.z = 1 + Math.sin(t * (5 + i) + i * 2) * 0.08;
    });
  };
  return g;
}

function susHavuzu(m: Malzeme): THREE.Group {
  const g = new THREE.Group();
  g.add(yerlestir(silindir(0.7, 0.7, 0.3, m("#BFB6A8"), 32), 0, 0.15, 0));
  g.add(yerlestir(silindir(0.62, 0.62, 0.02, m("#6FC3E0", { isik: "#2E8FBF", opak: 0.75 }), 32), 0, 0.29, 0));
  g.add(yerlestir(silindir(0.08, 0.12, 0.5, m("#BFB6A8"), 16), 0, 0.45, 0));
  g.add(yerlestir(silindir(0.25, 0.08, 0.08, m("#BFB6A8"), 20), 0, 0.72, 0));
  const fiskiye = yerlestir(silindir(0.02, 0.04, 0.25, m("#BFE7F5", { isik: "#6FC3E0", opak: 0.7 }), 10), 0, 0.88, 0);
  fiskiye.castShadow = false;
  g.add(fiskiye);
  for (const [x, z] of [
    [0.35, 0.2],
    [-0.3, -0.35],
  ]) {
    const yaprak = silindir(0.09, 0.09, 0.01, m("#3F8B4E"), 14);
    g.add(yerlestir(yaprak, x, 0.305, z));
  }
  const baliklar: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const b = kure(0.04, m(["#FF8A3D", "#FFD23F", "#F2F1EE"][i], { isik: "#FF8A3D" }), 0);
    b.scale.set(1.7, 0.8, 0.8);
    g.add(b);
    baliklar.push(b);
  }
  g.userData.guncelle = (t: number) => {
    fiskiye.scale.y = 0.85 + Math.sin(t * 6) * 0.15;
    baliklar.forEach((b, i) => {
      const a = t * (0.6 + i * 0.15) + i * 2.1;
      const r = 0.38 + i * 0.06;
      b.position.set(Math.cos(a) * r, 0.25, Math.sin(a) * r);
      b.rotation.y = -a;
    });
  };
  return g;
}

function roket(m: Malzeme): THREE.Group {
  const g = new THREE.Group();
  g.add(yerlestir(silindir(0.42, 0.45, 0.12, m("#3E4858")), 0, 0.06, 0));
  const ust = new THREE.Group();
  ust.add(yerlestir(silindir(0.2, 0.2, 1.3, m("#F4F1EC", { parlak: 0.4 }), 24), 0, 0.95, 0));
  ust.add(yerlestir(new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.45, 24), m("#E86F51", { parlak: 0.4 })), 0, 1.825, 0));
  const pencere = silindir(0.08, 0.08, 0.02, m("#7FD3F0", { isik: "#3AA6D9" }), 20);
  pencere.rotation.x = Math.PI / 2;
  ust.add(yerlestir(pencere, 0, 1.3, 0.2));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const kanat = kutu(0.04, 0.4, 0.26, m("#E86F51", { parlak: 0.4 }), 0.01);
    kanat.position.set(Math.sin(a) * 0.26, 0.45, Math.cos(a) * 0.26);
    kanat.rotation.y = a;
    ust.add(kanat);
  }
  const alev = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.25, 12), m("#FFB13D", { isik: "#FF6A1F" }));
  alev.rotation.x = Math.PI;
  alev.position.y = 0.18;
  ust.add(alev);
  g.add(ust);
  g.userData.guncelle = (t: number) => {
    ust.position.y = 0.04 + Math.sin(t * 1.4) * 0.04;
    alev.scale.y = 0.8 + Math.sin(t * 12) * 0.2;
  };
  return g;
}

let satrancDokusu: THREE.DataTexture | undefined;
function satrancTahtasi(): THREE.Material {
  if (!satrancDokusu) {
    const veri = new Uint8Array(8 * 8 * 4);
    for (let i = 0; i < 64; i++) {
      const acik = ((i % 8) + Math.floor(i / 8)) % 2 === 0;
      veri.set(acik ? [240, 226, 200, 255] : [110, 70, 48, 255], i * 4);
    }
    satrancDokusu = new THREE.DataTexture(veri, 8, 8);
    satrancDokusu.magFilter = THREE.NearestFilter;
    satrancDokusu.colorSpace = THREE.SRGBColorSpace;
    satrancDokusu.needsUpdate = true;
  }
  return new THREE.MeshStandardMaterial({ map: satrancDokusu, roughness: 0.6 });
}

function satranc(m: Malzeme, hayalet: boolean): THREE.Group {
  const g = new THREE.Group();
  g.add(yerlestir(kutu(1.0, 0.06, 0.6, m("#8A6446"), 0.02), 0, 0.69, 0));
  for (const [x, z] of [
    [-0.42, -0.24],
    [0.42, -0.24],
    [-0.42, 0.24],
    [0.42, 0.24],
  ])
    g.add(yerlestir(kutu(0.05, 0.66, 0.05, m("#6E4630"), 0.01), x, 0.33, z));
  g.add(yerlestir(kutu(0.42, 0.02, 0.42, hayalet ? m("#C9A87E") : satrancTahtasi(), 0.005), 0, 0.73, 0));
  // Oyun ortasında birkaç taş.
  for (const [x, z, beyaz, boy] of [
    [-0.13, 0.16, true, 0.06],
    [0.03, 0.08, true, 0.09],
    [-0.08, -0.03, true, 0.05],
    [0.13, -0.14, false, 0.06],
    [0.08, -0.03, false, 0.09],
    [-0.03, -0.14, false, 0.05],
  ] as [number, number, boolean, number][])
    g.add(yerlestir(silindir(0.016, 0.022, boy, m(beyaz ? "#F7F5F0" : "#22252B"), 10), x, 0.74 + boy / 2, z));
  for (const x of [-0.5, 0.5]) g.add(yerlestir(silindir(0.13, 0.13, 0.45, m("#3E4858"), 18), x, 0.225, 0));
  return g;
}

function boksTorbasi(m: Malzeme): THREE.Group {
  const g = new THREE.Group();
  g.add(yerlestir(kutu(0.7, 0.06, 0.7, m("#2F3140"), 0.02), 0, 0.03, 0));
  g.add(yerlestir(kutu(0.07, 2.0, 0.07, m("#3B4048"), 0.02), -0.3, 1.0, 0));
  g.add(yerlestir(kutu(0.45, 0.06, 0.06, m("#3B4048"), 0.02), -0.08, 1.97, 0));
  const torba = new THREE.Group();
  torba.position.set(0.12, 1.94, 0);
  torba.add(yerlestir(kutu(0.015, 0.25, 0.015, m("#C9CDD6", { metal: 0.8 }), 0.005), 0, -0.125, 0));
  torba.add(yerlestir(silindir(0.17, 0.17, 0.85, m("#C83F3A", { parlak: 0.3 }), 20), 0, -0.675, 0));
  g.add(torba);
  g.userData.guncelle = (t: number) => {
    torba.rotation.x = Math.sin(t * 1.5) * 0.12;
    torba.rotation.z = Math.sin(t * 1.1) * 0.06;
  };
  return g;
}

function kosuBandi(m: Malzeme): THREE.Group {
  const g = new THREE.Group();
  g.add(yerlestir(kutu(0.75, 0.15, 1.6, m("#2F3140"), 0.04), 0, 0.075, 0.05));
  g.add(yerlestir(kutu(0.55, 0.02, 1.4, m("#1A1C22"), 0.005), 0, 0.16, 0.05));
  const seritler: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const c = yerlestir(kutu(0.55, 0.005, 0.03, m("#4A4F5A"), 0), 0, 0.172, 0);
    c.castShadow = false;
    g.add(c);
    seritler.push(c);
  }
  for (const x of [-0.33, 0.33]) g.add(yerlestir(kutu(0.05, 1.15, 0.05, m("#ECEBE8"), 0.01), x, 0.72, -0.72));
  const panel = yerlestir(kutu(0.7, 0.12, 0.25, m("#ECEBE8"), 0.03), 0, 1.3, -0.68);
  panel.rotation.x = -0.4;
  g.add(panel);
  const ekran = yerlestir(kutu(0.3, 0.01, 0.12, m("#5FBE94", { isik: "#5FBE94" }), 0), 0, 1.37, -0.64);
  ekran.rotation.x = -0.4;
  g.add(ekran);
  g.userData.guncelle = (t: number) => {
    seritler.forEach((c, i) => {
      c.position.z = 0.75 - ((t * 0.8 + i * 0.28) % 1.4);
    });
  };
  return g;
}

function masaTenisi(m: Malzeme): THREE.Group {
  const g = new THREE.Group();
  g.add(yerlestir(kutu(2.1, 0.05, 1.2, m("#2E6FB7"), 0.01), 0, 0.76, 0));
  g.add(yerlestir(kutu(2.1, 0.004, 0.02, m("#F7F5F0"), 0), 0, 0.787, 0));
  const ag = yerlestir(kutu(0.02, 0.15, 1.3, m("#F2F1EE", { opak: 0.7 }), 0), 0, 0.86, 0);
  ag.castShadow = false;
  g.add(ag);
  for (const [x, z] of [
    [-0.9, -0.48],
    [0.9, -0.48],
    [-0.9, 0.48],
    [0.9, 0.48],
  ])
    g.add(yerlestir(kutu(0.06, 0.74, 0.06, m("#3B4048"), 0.01), x, 0.37, z));
  for (const [x, renk] of [
    [-0.7, "#C83F3A"],
    [0.75, "#22252B"],
  ] as [number, string][]) {
    const raket = silindir(0.08, 0.08, 0.015, m(renk), 16);
    g.add(yerlestir(raket, x, 0.795, 0.4));
  }
  const top = yerlestir(kure(0.025, m("#FFFFFF", { isik: "#FFE7A8" }), 1), 0, 0.85, 0);
  g.add(top);
  g.userData.guncelle = (t: number) => {
    top.position.x = Math.sin(t * 2) * 0.9;
    top.position.y = 0.81 + Math.abs(Math.cos(t * 4)) * 0.25;
    top.position.z = Math.sin(t * 1.3) * 0.3;
  };
  return g;
}

function bilardo(m: Malzeme): THREE.Group {
  const g = new THREE.Group();
  g.add(yerlestir(kutu(2.2, 0.22, 1.2, m("#6E4630"), 0.05), 0, 0.69, 0));
  g.add(yerlestir(kutu(2.0, 0.03, 1.0, m("#2F7D4F"), 0.005), 0, 0.81, 0));
  for (const [x, z] of [
    [-0.95, -0.45],
    [0.95, -0.45],
    [-0.95, 0.45],
    [0.95, 0.45],
  ])
    g.add(yerlestir(kutu(0.14, 0.58, 0.14, m("#5E3B26"), 0.03), x, 0.29, z));
  for (const x of [-0.98, 0, 0.98])
    for (const z of [-0.48, 0.48]) g.add(yerlestir(silindir(0.045, 0.045, 0.02, m("#1A1C22"), 12), x, 0.82, z));
  const renkler = ["#FFD23F", "#3D7DD8", "#E8705B", "#8C5AE0", "#FF8A3D", "#3FA35B", "#22252B", "#C83F3A", "#E0B077", "#5FBE94"];
  let i = 0;
  for (let sira = 0; sira < 4; sira++)
    for (let k = 0; k <= sira; k++) {
      const top = kure(0.028, m(renkler[i++ % renkler.length], { parlak: 0.7 }), 2);
      g.add(yerlestir(top, 0.45 + sira * 0.05, 0.853, (k - sira / 2) * 0.058));
    }
  const beyaz = yerlestir(kure(0.028, m("#F7F5F0", { parlak: 0.7 }), 2), -0.5, 0.853, 0);
  g.add(beyaz);
  const isteka = silindir(0.008, 0.016, 1.3, m("#C99A6B"), 8);
  isteka.rotation.z = Math.PI / 2 - 0.08;
  g.add(yerlestir(isteka, -0.3, 0.88, 0.3));
  return g;
}

function piyano(m: Malzeme): THREE.Group {
  const g = new THREE.Group();
  const cila = m("#1E1F24", { parlak: 0.75 });
  g.add(yerlestir(kutu(1.45, 1.25, 0.5, cila, 0.03), 0, 0.625, -0.22));
  g.add(yerlestir(kutu(1.45, 0.08, 0.32, cila, 0.02), 0, 0.72, 0.17));
  g.add(yerlestir(kutu(1.3, 0.03, 0.18, m("#F7F5F0"), 0.005), 0, 0.775, 0.2));
  for (let i = 0; i < 18; i++) {
    if ([2, 6, 9, 13, 16].includes(i % 18)) continue;
    g.add(yerlestir(kutu(0.022, 0.025, 0.1, m("#14151A"), 0.003), -0.6 + i * 0.07, 0.795, 0.16));
  }
  for (const x of [-0.66, 0.66]) g.add(yerlestir(kutu(0.07, 0.68, 0.07, cila, 0.02), x, 0.34, 0.25));
  const nota = yerlestir(kutu(0.4, 0.28, 0.02, m("#F7F2E6"), 0.005), 0, 1.0, 0.02);
  nota.rotation.x = -0.25;
  g.add(nota);
  // Tabure
  g.add(yerlestir(kutu(0.75, 0.07, 0.32, cila, 0.03), 0, 0.5, 0.33));
  for (const x of [-0.32, 0.32]) g.add(yerlestir(kutu(0.05, 0.47, 0.25, cila, 0.01), x, 0.235, 0.33));
  return g;
}

function suSebili(m: Malzeme): THREE.Group {
  const g = new THREE.Group();
  g.add(yerlestir(kutu(0.38, 1.0, 0.38, m("#ECEBE8"), 0.04), 0, 0.5, 0));
  g.add(yerlestir(silindir(0.16, 0.16, 0.4, m("#8FD0F0", { opak: 0.55 }), 20), 0, 1.24, 0));
  g.add(yerlestir(silindir(0.05, 0.08, 0.06, m("#8FD0F0", { opak: 0.55 }), 12), 0, 1.03, 0));
  g.add(yerlestir(kutu(0.04, 0.05, 0.05, m("#3D7DD8"), 0.01), -0.07, 0.8, 0.2));
  g.add(yerlestir(kutu(0.04, 0.05, 0.05, m("#C83F3A"), 0.01), 0.07, 0.8, 0.2));
  g.add(yerlestir(kutu(0.26, 0.02, 0.12, m("#8E939C"), 0.005), 0, 0.66, 0.16));
  const kabarcik = kure(0.02, m("#E6F6FC", { opak: 0.8 }), 1);
  g.add(kabarcik);
  g.userData.guncelle = (t: number) => {
    const d = (t * 0.35) % 1;
    kabarcik.position.set(Math.sin(t * 3) * 0.04, 1.08 + d * 0.32, 0.03);
  };
  return g;
}

function buzdolabi(m: Malzeme): THREE.Group {
  const g = new THREE.Group();
  g.add(yerlestir(kutu(0.55, 0.85, 0.55, m("#F2F1EE"), 0.05), 0, 0.425, 0));
  g.add(yerlestir(kutu(0.5, 0.005, 0.01, m("#C9CDD6"), 0), 0, 0.63, 0.276));
  g.add(yerlestir(kutu(0.03, 0.3, 0.03, m("#8E939C", { metal: 0.6 }), 0.01), 0.2, 0.42, 0.29));
  for (const [x, renk] of [
    [-0.12, "#C83F3A"],
    [0, "#3D7DD8"],
    [0.12, "#3FA35B"],
  ] as [number, string][])
    g.add(yerlestir(silindir(0.035, 0.035, 0.12, m(renk, { parlak: 0.5 }), 12), x, 0.91, 0));
  return g;
}

function otomat(m: Malzeme): THREE.Group {
  const g = new THREE.Group();
  g.add(yerlestir(kutu(0.9, 1.85, 0.75, m("#D9483B", { parlak: 0.4 }), 0.04), 0, 0.925, 0));
  const cam = yerlestir(kutu(0.55, 1.2, 0.02, m("#CFE8F5", { isik: "#9BD3F0", opak: 0.45 }), 0.01), -0.1, 1.15, 0.38);
  cam.castShadow = false;
  g.add(cam);
  const renkler = ["#FFD23F", "#3D7DD8", "#3FA35B", "#FF8A3D"];
  for (let sira = 0; sira < 4; sira++)
    for (let k = 0; k < 4; k++)
      g.add(yerlestir(silindir(0.04, 0.04, 0.13, m(renkler[(sira + k) % 4], { parlak: 0.5 }), 10), -0.31 + k * 0.14, 0.7 + sira * 0.28, 0.3));
  g.add(yerlestir(kutu(0.2, 0.5, 0.02, m("#2F3140"), 0.01), 0.3, 1.2, 0.38));
  for (let i = 0; i < 6; i++)
    g.add(yerlestir(kutu(0.04, 0.04, 0.02, m("#C9CDD6"), 0.005), 0.26 + (i % 2) * 0.08, 1.35 - Math.floor(i / 2) * 0.08, 0.395));
  g.add(yerlestir(kutu(0.55, 0.15, 0.02, m("#1A1C22"), 0.01), -0.1, 0.27, 0.38));
  const camMat = cam.material as THREE.MeshStandardMaterial;
  g.userData.guncelle = (t: number) => {
    camMat.emissiveIntensity = 0.8 + Math.sin(t * 1.5) * 0.15;
  };
  return g;
}

/** Hazır modellerden birkaçını tek gruba dizer ([ad, x, z, dönüş, yükseklik]). */
function dizi(parcalar: [Parameters<typeof varlik>[0], number, number, number?, number?][]): THREE.Group {
  const g = new THREE.Group();
  for (const [ad, x, z, don, y] of parcalar) {
    const o = varlik(ad);
    o.position.set(x, y ?? 0, z);
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
    case "kaktusKucuk":
    case "agacBuyuk":
    case "dinlenmeKoltugu":
    case "ikiliKanepe":
    case "tasarimKanepe":
    case "koseKoltuk":
    case "ortaSehpa":
    case "alcakSehpa":
    case "alcakRaf":
    case "askilik":
    case "copKovasi":
    case "modernLamba":
    case "haliYuvarlak":
    case "haliCizgili":
    case "uzanmaKoltugu":
    case "tasarimBerjer":
    case "buyukKoseKanepe":
    case "uzanmaliKanepe":
    case "minderPuf":
    case "minderliBank":
    case "yerMinderi":
    case "barTaburesi":
    case "yuvarlakSandalye":
    case "genisKitaplik":
    case "kapakliKitaplik":
    case "alcakKitaplik":
    case "tvDolabi":
    case "koseMasa":
    case "yuvarlakMasa":
    case "camSehpa":
    case "kareSehpa":
    case "ahsapMasa":
    case "komodin":
    case "oyuncakAyi":
    case "kareLambader":
    case "haliDikdortgen":
    case "haliKoseli":
    case "haliKare":
    case "haliPaspas":
    case "eskiTelevizyon":
    case "buzdolabiBuyuk":
    case "buzdolabiDik":
    case "ocak":
      g = varlik(tur);
      break;
    case "koliYigini":
      g = dizi([["koliKapali", -0.3, 0], ["koliKapali", -0.3, 0, 0.3, 0.51], ["koliAcik", 0.2, 0.03]]);
      break;
    case "okumaKosesi":
      g = dizi([["uzanmaKoltugu", -0.2, 0], ["kareLambader", 0.45, -0.4]]);
      break;
    case "yemekMasasi":
      g = dizi([
        ["ortuluMasa", 0, 0],
        ["sandalyeMinderli", -0.4, 0.6, Math.PI],
        ["sandalyeMinderli", 0.4, 0.6, Math.PI],
        ["sandalyeMinderli", -0.4, -0.6],
        ["sandalyeMinderli", 0.4, -0.6],
      ]);
      break;
    case "camToplantiMasasi":
      g = dizi([
        ["camMasa", 0, 0],
        ...([-0.5, 0, 0.5].flatMap((x) => [
          ["sandalyeCerceveli", x, 0.6, Math.PI],
          ["sandalyeCerceveli", x, -0.6],
        ]) as [VarlikAdi, number, number, number?][]),
      ]);
      break;
    case "barKosesi":
      g = dizi([["bar", -0.49, -0.23], ["bar", 0.31, -0.23], ["barUcu", 0.8, -0.23], ["barTaburesi", -0.49, 0.22], ["barTaburesi", 0.31, 0.22]]);
      break;
    case "mutfakTezgahi":
      g = dizi([
        ["cekmeceliDolap", -0.77, 0],
        ["evye", 0, 0],
        ["mutfakDolabi", 0.77, 0],
        ["mikrodalga", 0.77, -0.1, 0, 0.81],
        ["tostMakinesi", -0.9, -0.1, 0, 0.81],
        ["blender", -0.6, -0.15, 0, 0.81],
      ]);
      break;
    case "yanSehpa":
      g = varlik("yanMasa");
      break;
    case "bitkiliSehpa":
      g = dizi([["yanMasa", 0, 0], ["bitkiKucuk1", -0.3, 0, 0, 0.65], ["bitkiKucuk2", 0, 0, 0.6, 0.65], ["bitkiKucuk3", 0.3, 0, 0, 0.65]]);
      break;
    case "radyoSehpasi":
      g = dizi([["yanMasa", 0, 0], ["radyo", 0.15, 0, -0.3, 0.65], ["kitaplar", -0.25, 0, 0, 0.65]]);
      break;
    case "hoparlorler":
      g = dizi([["hoparlor", -0.35, 0], ["hoparlor", 0.35, 0]]);
      break;
    case "medya":
      g = dizi([["yanMasa", -0.46, 0], ["yanMasa", 0.46, 0], ["tv", 0, 0, 0, 0.65]]);
      break;
    case "calismaKosesi":
      g = dizi([["masa", 0, -0.25], ["ofisSandalyesi", 0, 0.3, Math.PI], ["laptop", 0, -0.3, 0, 0.65]]);
      break;
    case "masaTakimi":
      g = dizi([
        ["toplantiMasasi", 0, 0],
        ["toplantiSandalyesi", -0.4, 0.62, Math.PI],
        ["toplantiSandalyesi", 0.4, 0.62, Math.PI],
        ["toplantiSandalyesi", -0.4, -0.62],
        ["toplantiSandalyesi", 0.4, -0.62],
      ]);
      break;
    case "barTezgahi":
      g = dizi([["bar", -0.8, 0], ["bar", 0, 0], ["bar", 0.8, 0]]);
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
    case "armut":
      return armut(m);
    case "kure":
      return yerKuresi(m);
    case "saat":
      return ayakliSaat(m);
    case "somine":
      return somine(m);
    case "havuz":
      return susHavuzu(m);
    case "roket":
      return roket(m);
    case "satranc":
      return satranc(m, hayalet);
    case "boksTorbasi":
      return boksTorbasi(m);
    case "kosuBandi":
      return kosuBandi(m);
    case "masaTenisi":
      return masaTenisi(m);
    case "bilardo":
      return bilardo(m);
    case "piyano":
      return piyano(m);
    case "suSebili":
      return suSebili(m);
    case "buzdolabi":
      return buzdolabi(m);
    case "otomat":
      return otomat(m);
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
