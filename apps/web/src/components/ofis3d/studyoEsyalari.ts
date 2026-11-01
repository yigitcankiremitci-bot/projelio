// Stüdyom: işin türüne göre odanın döşemesi (tema: lib/studyoOfisi.ts isTemasi).
//
// Müzik işi kayıt masası, mikrofon ve akustik panelle; video işi kurgu
// masası, kamera ve softbox'la; fotoğraf işi fon, kamera ve iki softbox'la;
// tasarım işi çizim masası ve ilham panosuyla döşenir. Eşyalar dekordur
// (tıklanmaz); motor onları odada boş yere koyar (OfisMotoru.temayiDose).
// Önü +z: motor yüzünü odanın içine çevirir.

import * as THREE from "three";
import type { IsTemasi } from "../../lib/studyoOfisi";
import { kutu, malzeme } from "./modeller";
import { modulEsyasi } from "./modulEsyalari";
import { varlik } from "./varliklar";

function yerlestir<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T {
  o.position.set(x, y, z);
  return o;
}

function silindir(r1: number, r2: number, h: number, m: THREE.Material, p = 16): THREE.Mesh {
  const s = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, p), m);
  s.castShadow = true;
  s.receiveShadow = true;
  return s;
}

const SIYAH = () => malzeme("#22252B", { metal: 0.4, parlak: 0.5 });
/** Kenney masasının üst yüzü. */
const MASA_UST = 0.645;

/** Üç ayaklı sehpa (ayaklar tepede birleşir) ve ortada `boy` yüksekliğinde direk. */
function sehpa(boy: number): THREE.Group {
  const g = new THREE.Group();
  const s = SIYAH();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const ayak = kutu(0.025, 0.85, 0.025, s, 0.008);
    ayak.position.set(Math.sin(a) * 0.16, 0.4, Math.cos(a) * 0.16);
    ayak.rotation.set(-Math.cos(a) * 0.38, 0, Math.sin(a) * 0.38);
    g.add(ayak);
  }
  g.add(yerlestir(kutu(0.03, boy - 0.75, 0.03, s, 0.01), 0, 0.75 + (boy - 0.75) / 2, 0));
  return g;
}

/** Stüdyo monitör hoparlörü (önünde iki koni). */
function monitorHoparlor(): THREE.Group {
  const g = new THREE.Group();
  g.add(yerlestir(kutu(0.17, 0.27, 0.2, malzeme("#1E2127", { parlak: 0.35 }), 0.02), 0, 0.135, 0));
  for (const [y, r] of [
    [0.09, 0.055],
    [0.21, 0.025],
  ] as const) {
    const koni = silindir(r, r, 0.01, malzeme("#C9CDD6", { metal: 0.5, parlak: 0.6 }), 20);
    koni.rotation.x = Math.PI / 2;
    koni.position.set(0, y, 0.1);
    g.add(koni);
  }
  return g;
}

/** Kayıt masası: masa, üstünde mikser konsolu (kanal şeritleri, düğmeler) ve iki monitör hoparlör. */
function kayitMasasi(): THREE.Group {
  const g = new THREE.Group();
  g.add(varlik("masa"));
  const konsol = new THREE.Group();
  konsol.add(yerlestir(kutu(0.8, 0.05, 0.34, malzeme("#2B2F38", { parlak: 0.4 }), 0.015), 0, 0.025, 0));
  const fader = malzeme("#E8EAEE", { parlak: 0.5 });
  const dugme = malzeme("#C0813F", { metal: 0.3, parlak: 0.5 });
  for (let i = 0; i < 10; i++) {
    const x = -0.34 + i * 0.075;
    konsol.add(yerlestir(kutu(0.008, 0.004, 0.12, malzeme("#111316"), 0.002), x, 0.052, 0.07));
    konsol.add(yerlestir(kutu(0.022, 0.014, 0.018, fader, 0.004), x, 0.058, 0.05 + ((i * 37) % 7) * 0.012));
    for (const z of [-0.06, -0.12]) konsol.add(yerlestir(silindir(0.011, 0.011, 0.014, dugme, 10), x, 0.058, z));
  }
  // Konsol kullanıcıya doğru hafif eğik.
  konsol.rotation.x = 0.12;
  konsol.position.set(0, MASA_UST + 0.01, 0.05);
  g.add(konsol);
  for (const x of [-0.58, 0.58]) {
    const h = monitorHoparlor();
    h.position.set(x, MASA_UST, -0.12);
    h.rotation.y = -x * 0.35;
    g.add(h);
  }
  return g;
}

/** Ayaklı mikrofon: sehpa, bum kolu, mikrofon ve pop filtresi. */
function mikrofon(): THREE.Group {
  const g = sehpa(1.45);
  const s = SIYAH();
  const kol = kutu(0.022, 0.022, 0.42, s, 0.008);
  kol.position.set(0, 1.47, 0.18);
  kol.rotation.x = -0.25;
  g.add(kol);
  const mik = silindir(0.035, 0.03, 0.16, malzeme("#B9BEC7", { metal: 0.7, parlak: 0.6 }), 16);
  mik.position.set(0, 1.4, 0.38);
  g.add(mik);
  const pop = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.006, 6, 28), s);
  pop.position.set(0, 1.42, 0.48);
  g.add(pop);
  const ag = new THREE.Mesh(
    new THREE.CircleGeometry(0.075, 28),
    new THREE.MeshStandardMaterial({ color: "#111316", transparent: true, opacity: 0.55, side: THREE.DoubleSide })
  );
  ag.position.copy(pop.position);
  g.add(ag);
  return g;
}

/** Ayaklı akustik panel: koyu köpük, piramit dokulu. */
function akustikPanel(): THREE.Group {
  const g = new THREE.Group();
  const ayak = malzeme("#3E4858", { metal: 0.4 });
  for (const x of [-0.36, 0.36]) {
    g.add(yerlestir(kutu(0.04, 0.03, 0.36, ayak, 0.01), x, 0.015, 0));
    g.add(yerlestir(kutu(0.03, 1.5, 0.03, ayak, 0.01), x, 0.76, 0));
  }
  g.add(yerlestir(kutu(0.7, 1.25, 0.06, malzeme("#3A3F4B"), 0.01), 0, 0.9, 0));
  const kopuk = malzeme("#4A5160");
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 7; j++) {
      const p = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.06, 4), kopuk);
      p.rotation.x = Math.PI / 2;
      p.rotation.y = Math.PI / 4;
      p.position.set(-0.24 + i * 0.16, 0.38 + j * 0.16, 0.06);
      g.add(p);
    }
  return g;
}

/** Kurgu masası: masa, iki ekran, klavye ve jog tekerleği. */
function kurguMasasi(): THREE.Group {
  const g = new THREE.Group();
  g.add(varlik("masa"));
  for (const x of [-0.3, 0.3]) {
    const e = varlik("ekran");
    e.position.set(x, MASA_UST, -0.15);
    e.rotation.y = -x * 0.5;
    g.add(e);
  }
  const k = varlik("klavye");
  k.position.set(-0.08, MASA_UST, 0.12);
  g.add(k);
  g.add(yerlestir(kutu(0.16, 0.03, 0.12, malzeme("#2B2F38"), 0.01), 0.36, MASA_UST + 0.015, 0.12));
  g.add(yerlestir(silindir(0.04, 0.04, 0.02, malzeme("#C0813F", { metal: 0.4, parlak: 0.5 }), 20), 0.36, MASA_UST + 0.04, 0.12));
  return g;
}

/** Sehpada kamera: gövde, objektif, vizör. */
function kameraSehpasi(): THREE.Group {
  const g = sehpa(1.35);
  const govde = malzeme("#1C1E24", { parlak: 0.5 });
  g.add(yerlestir(kutu(0.14, 0.1, 0.09, govde, 0.015), 0, 1.42, 0));
  const objektif = silindir(0.035, 0.04, 0.12, malzeme("#2B2F38", { parlak: 0.6 }), 18);
  objektif.rotation.x = Math.PI / 2;
  objektif.position.set(0, 1.42, 0.1);
  g.add(objektif);
  const cam = silindir(0.028, 0.028, 0.005, malzeme("#5F7FB0", { parlak: 0.95, metal: 0.3 }), 18);
  cam.rotation.x = Math.PI / 2;
  cam.position.set(0, 1.42, 0.162);
  g.add(cam);
  g.add(yerlestir(kutu(0.04, 0.035, 0.05, govde, 0.008), -0.04, 1.49, -0.01));
  return g;
}

/** Softbox: sehpada, öne bakan ışıklı kutu. */
function softbox(): THREE.Group {
  const g = sehpa(1.6);
  const kutuG = new THREE.Group();
  kutuG.add(yerlestir(kutu(0.5, 0.5, 0.22, malzeme("#22252B"), 0.02), 0, 0, 0));
  kutuG.add(
    yerlestir(
      new THREE.Mesh(
        new THREE.PlaneGeometry(0.46, 0.46),
        new THREE.MeshStandardMaterial({ color: "#FFF8EE", emissive: "#FFF1DA", emissiveIntensity: 1.2 })
      ),
      0,
      0,
      0.111
    )
  );
  kutuG.position.set(0, 1.62, 0.05);
  kutuG.rotation.x = 0.25;
  g.add(kutuG);
  return g;
}

/** Fotoğraf fonu: iki direk, üst çubuk ve yere sarkan kâğıt. */
function fon(): THREE.Group {
  const g = new THREE.Group();
  const s = SIYAH();
  for (const x of [-0.75, 0.75]) {
    g.add(yerlestir(kutu(0.3, 0.02, 0.3, s, 0.01), x, 0.01, -0.1));
    g.add(yerlestir(kutu(0.03, 2.1, 0.03, s, 0.01), x, 1.05, -0.1));
  }
  const rulo = silindir(0.05, 0.05, 1.5, malzeme("#ECE8E1"), 16);
  rulo.rotation.z = Math.PI / 2;
  rulo.position.set(0, 2.05, -0.1);
  g.add(rulo);
  const kagit = malzeme("#ECE8E1", { parlak: 0.15 });
  g.add(yerlestir(kutu(1.46, 2.0, 0.01, kagit, 0.002), 0, 1.05, -0.12));
  // Yere kıvrılan kısım
  g.add(yerlestir(kutu(1.46, 0.01, 0.6, kagit, 0.002), 0, 0.005, 0.18));
  return g;
}

/** Çizim masası: eğik tabla, üstünde kâğıt ve kalem, yanında lamba kolu. */
function cizimMasasi(): THREE.Group {
  const g = new THREE.Group();
  const ahsap = malzeme("#B98B5E");
  for (const x of [-0.5, 0.5]) for (const z of [-0.25, 0.25]) g.add(yerlestir(kutu(0.04, 0.8, 0.04, ahsap, 0.01), x, 0.4, z));
  const tabla = new THREE.Group();
  tabla.add(yerlestir(kutu(1.1, 0.04, 0.62, malzeme("#E6D3B8"), 0.01), 0, 0, 0));
  tabla.add(yerlestir(kutu(0.5, 0.004, 0.36, malzeme("#FFFFFF"), 0.002), -0.12, 0.024, 0.02));
  tabla.add(yerlestir(kutu(0.32, 0.012, 0.22, malzeme("#2B2F38", { parlak: 0.5 }), 0.01), 0.3, 0.026, 0.05));
  tabla.position.set(0, 0.85, 0);
  tabla.rotation.x = 0.3;
  g.add(tabla);
  const kol = malzeme("#C0813F", { metal: 0.4, parlak: 0.5 });
  g.add(yerlestir(kutu(0.025, 0.55, 0.025, kol, 0.008), 0.5, 1.1, -0.25));
  const bas = silindir(0.03, 0.08, 0.1, kol, 16);
  bas.position.set(0.42, 1.38, -0.1);
  bas.rotation.x = 0.6;
  g.add(bas);
  return g;
}

/** Temanın eşyaları, konma sırasıyla (önce büyük olan). */
export function temaEsyalari(tema: IsTemasi): THREE.Object3D[] {
  switch (tema) {
    case "muzik":
      return [kayitMasasi(), mikrofon(), akustikPanel()];
    case "video":
      return [kurguMasasi(), kameraSehpasi(), softbox()];
    case "foto":
      return [fon(), kameraSehpasi(), softbox(), softbox()];
    case "tasarim":
      return [cizimMasasi(), modulEsyasi("markaPosteri")];
  }
}
