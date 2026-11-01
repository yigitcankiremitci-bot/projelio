// Hazır 3D modeller (public/ofis/modeller/, kaynaklar ve lisanslar KAYNAKLAR.md'de).
//
// Üç CC0 paket: Kenney Furniture Kit (ofis eşyası), KayKit Furniture Bits
// (yumuşak dekor) ve Quaternius Ultimate Modular Men/Women (animasyonlu
// karakterler). Paketlerin ölçü birimleri farklı; her model burada metreye
// ölçeklenir ve "ayak izi ortada, tabanı y=0" olacak biçimde bir kaba
// oturtulur. Bütün modellerin önü +z yönüne bakar (önizlemeyle doğrulandı).

import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";

const KOK = "/ofis/modeller/";

/**
 * [dosya, ölçek] — ölçek, paketin biriminden metreye. Ölçek yerine
 * { boy } verilirse model o boya (metre) getirilir: Poly Pizza'dan gelen
 * bitkilerin birimi dosyadaki düğüm dönüşümlerinde saklı, tek tip değil.
 */
const TANIMLAR = {
  masa: ["kenney/desk.glb", 1.7],
  ofisSandalyesi: ["kenney/chairDesk.glb", 1.75],
  ekran: ["kenney/computerScreen.glb", 1.6],
  klavye: ["kenney/computerKeyboard.glb", 1.6],
  fare: ["kenney/computerMouse.glb", 1.6],
  laptop: ["kenney/laptop.glb", 1.2],
  saksi: ["kenney/pottedPlant.glb", 1.9],
  agacBuyuk: ["kenney/pottedPlant.glb", 2.9],
  bitkiKucuk1: ["kenney/plantSmall1.glb", 1.8],
  bitkiKucuk2: ["kenney/plantSmall2.glb", 1.8],
  bitkiKucuk3: ["kenney/plantSmall3.glb", 1.8],
  kitaplik: ["kenney/bookcaseOpen.glb", 1.85],
  kitaplar: ["kenney/books.glb", 1.8],
  tv: ["kenney/televisionModern.glb", 2.4],
  bar: ["kenney/kitchenBar.glb", 1.85],
  kahveMakinesi: ["kenney/kitchenCoffeeMachine.glb", 1.5],
  toplantiMasasi: ["kenney/table.glb", 2.0],
  toplantiSandalyesi: ["kenney/chairModernCushion.glb", 2.1],
  askilik: ["kenney/coatRackStanding.glb", 2.0],
  hoparlor: ["kenney/speaker.glb", 1.7],
  yanMasa: ["kenney/sideTable.glb", 1.7],
  radyo: ["kenney/radio.glb", 1.2],
  dinlenmeKoltugu: ["kenney/loungeChair.glb", 1.8],
  kanepe: ["kaykit/couch_pillows.gltf", 0.7],
  koltuk: ["kaykit/armchair_pillows.gltf", 0.7],
  dekorDolabi: ["kaykit/cabinet_medium_decorated.gltf", 0.7],
  alcakRaf: ["kaykit/shelf_B_large_decorated.gltf", 0.7],
  haliOval: ["kaykit/rug_oval_A.gltf", 0.7],
  haliCizgili: ["kaykit/rug_rectangle_stripes_A.gltf", 0.85],
  tabloA: ["kaykit/pictureframe_large_A.gltf", 0.75],
  tabloB: ["kaykit/pictureframe_large_B.gltf", 0.75],
  kaktus: ["kaykit/cactus_medium_A.gltf", 0.75],
  kaktusKucuk: ["kaykit/cactus_small_A.gltf", 0.6],
  ayakliLamba: ["kaykit/lamp_standing.gltf", 0.65],
  alcakSehpa: ["kaykit/table_low.gltf", 0.62],
  monstera: ["bitkiler/bitki_1.glb", { boy: 1.4 }],
  inceMonstera: ["bitkiler/bitki_2.glb", { boy: 1.75 }],
  salonBitkisi: ["bitkiler/bitki_3.glb", { boy: 1.25 }],
  buyukKaktus: ["bitkiler/bitki_4.glb", { boy: 1.6 }],
} as const satisfies Record<string, readonly [string, number | { boy: number }]>;

export type VarlikAdi = keyof typeof TANIMLAR;

/**
 * Kenney paketinin malzemeleri adlı (carpet, wood, metal…) ama renkleri
 * oyuncak gibi doygun: kırmızı sandalye, turkuaz bitki. Yüklerken referans
 * görseldeki ofis paletine boyanır — beyaz masa üstü, sıcak meşe, grafit
 * döşeme, siyah ekran, koyu yeşil yaprak.
 */
const KENNEY_PALET: Record<string, string> = {
  carpet: "#565B67",
  carpetBlue: "#7483A6",
  carpetDarker: "#8C5A44",
  carpetWhite: "#F2F1EE",
  metal: "#ECEBE8",
  metalDark: "#22252B",
  metalMedium: "#3B4048",
  plant: "#3F8B4E",
  wood: "#C99A6B",
  woodDark: "#8A6446",
  lamp: "#FFE7A8",
};

function kenneyBoya(o: THREE.Object3D): void {
  o.traverse((c) => {
    const m = (c as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (!m || Array.isArray(m) || !m.isMeshStandardMaterial) return;
    const renk = KENNEY_PALET[m.name];
    if (renk) m.color.set(renk);
    m.metalness = 0;
    m.roughness = m.name.startsWith("metal") ? 0.45 : 0.75;
  });
}

const yukleyici = new GLTFLoader();
const ornekler = new Map<VarlikAdi, THREE.Object3D>();
let tumu: Promise<void> | null = null;

function golgeAc(o: THREE.Object3D): void {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });
}

/** Modeli ölçekler ve ayak izini ortaya, tabanını y=0'a getiren bir kaba koyar. */
function kabaOturt(sahne: THREE.Object3D, olcek: number | { boy: number }): THREE.Group {
  const ic = sahne;
  if (typeof olcek === "number") ic.scale.multiplyScalar(olcek);
  else {
    ic.updateMatrixWorld(true);
    const boy = new THREE.Box3().setFromObject(ic).getSize(new THREE.Vector3()).y;
    ic.scale.multiplyScalar(olcek.boy / boy);
  }
  ic.updateMatrixWorld(true);
  const kutu = new THREE.Box3().setFromObject(ic);
  const orta = kutu.getCenter(new THREE.Vector3());
  ic.position.x -= orta.x;
  ic.position.z -= orta.z;
  ic.position.y -= kutu.min.y;
  const kap = new THREE.Group();
  kap.add(ic);
  golgeAc(kap);
  return kap;
}

/** Bütün eşya modellerini (karakterler hariç) bir kez yükler. */
export function varliklariYukle(): Promise<void> {
  if (!tumu) {
    tumu = Promise.all(
      (Object.keys(TANIMLAR) as VarlikAdi[]).map(async (ad) => {
        const [dosya, olcek] = TANIMLAR[ad];
        const g = await yukleyici.loadAsync(KOK + dosya);
        if (dosya.startsWith("kenney/")) kenneyBoya(g.scene);
        ornekler.set(ad, kabaOturt(g.scene, olcek));
      })
    ).then(() => undefined);
    // Başarısız yükleme önbellekte kalmasın; sonraki deneme yeniden indirsin.
    tumu.catch(() => (tumu = null));
  }
  return tumu;
}

/** Bu adda bir hazır model var mı (ortak alana devredilen dekorun türü böyle bir ad olabilir). */
export function varlikVar(ad: string): ad is VarlikAdi {
  return ornekler.has(ad as VarlikAdi);
}

/** Yüklenmiş modelin bir kopyası (malzemeler paylaşılır). */
export function varlik(ad: VarlikAdi): THREE.Group {
  const o = ornekler.get(ad);
  if (!o) throw new Error(`Model yüklenmedi: ${ad}`);
  return o.clone(true) as THREE.Group;
}

/** Bir modelin yerleşik ölçüsü (en, boy, derinlik) — yerleşim hesapları için. */
export function varlikOlcusu(ad: VarlikAdi): THREE.Vector3 {
  const o = ornekler.get(ad);
  return o ? new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()) : new THREE.Vector3(1, 1, 1);
}

/** Yerleştirme önizlemesi: kopyanın malzemelerini yarı saydam yapar (asıl malzemeler bozulmasın). */
export function hayaletYap(o: THREE.Object3D): void {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = false;
    const yap = (x: THREE.Material) => {
      const k = x.clone();
      k.transparent = true;
      k.opacity = 0.6;
      k.depthWrite = false;
      return k;
    };
    m.material = Array.isArray(m.material) ? m.material.map(yap) : yap(m.material);
  });
}

// ------------------------------------------------------------------ karakterler

const KARAKTERLER = [
  "erkek_suit",
  "kadin_casual",
  "erkek_casual2",
  "kadin_formal",
  "erkek_hoodie",
  "kadin_suit",
  "erkek_worker",
  "kadin_worker",
] as const;

const SILAH = /pistol|gun|rifle|sword|knife|weapon/i;

/** Quaternius karakterleri ~1,86 birim boyunda; ofis ölçeğine göre biraz kısaltılır. */
export const KARAKTER_OLCEK = 0.86;

const karakterOnbellek = new Map<string, Promise<GLTF>>();

export interface Karakter3D {
  nesne: THREE.Group;
  karisici: THREE.AnimationMixer;
  eylemler: Record<"Idle" | "Idle_Neutral" | "Walk" | "Wave" | "Interact", THREE.AnimationAction | undefined>;
  /**
   * Oturma pozunu vermek için bacak kemikleri. Ayaklar (IK düzeni) baldırın
   * çocuğu DEĞİL, Root'a bağlı: bacak bükülünce ayrıca taşınmaları gerekir.
   */
  bacaklar: {
    ustSol?: THREE.Bone;
    ustSag?: THREE.Bone;
    altSol?: THREE.Bone;
    altSag?: THREE.Bone;
    ayakSol?: THREE.Bone;
    ayakSag?: THREE.Bone;
  };
  /** Otururken elleri klavyeye uzatmak için kol kemikleri. */
  kollar: {
    ustSol?: THREE.Bone;
    ustSag?: THREE.Bone;
    altSol?: THREE.Bone;
    altSag?: THREE.Bone;
    bilekSol?: THREE.Bone;
    bilekSag?: THREE.Bone;
  };
  /** Karakter modeli kadın mı (yol verme kuralı için; kişinin verisinden değil, görünen modelden). */
  kadin: boolean;
}

/** Kişinin adından türetilen sayıyla karakter seçer; aynı kişi hep aynı görünür. */
export async function karakter(sayi: number): Promise<Karakter3D> {
  const ad = KARAKTERLER[sayi % KARAKTERLER.length];
  let p = karakterOnbellek.get(ad);
  if (!p) {
    p = yukleyici.loadAsync(`${KOK}karakterler/${ad}.glb`);
    karakterOnbellek.set(ad, p);
    p.catch(() => karakterOnbellek.delete(ad));
  }
  const g = await p;
  const kopya = SkeletonUtils.clone(g.scene) as THREE.Group;
  kopya.scale.setScalar(KARAKTER_OLCEK);
  golgeAc(kopya);
  kopya.traverse((c) => {
    // Deri kaplı ağlar hareket edince sınır kutusu yanlış kalıp kırpılabiliyor.
    if ((c as THREE.SkinnedMesh).isSkinnedMesh) c.frustumCulled = false;
    // Quaternius karakterlerinin bazıları elinde silahla geliyor (Suit'te "Pistol").
    // Dosyadan çıkarıldı; yeni eklenen bir karakterde de görünmesin diye burada da gizlenir.
    if (SILAH.test(c.name)) c.visible = false;
  });
  const nesne = new THREE.Group();
  nesne.add(kopya);
  const karisici = new THREE.AnimationMixer(kopya);
  const eylem = (n: string) => {
    const klip = g.animations.find((a) => a.name === n);
    return klip ? karisici.clipAction(klip) : undefined;
  };
  // GLTFLoader kemik adlarındaki noktayı siler: "UpperLeg.L" → "UpperLegL".
  const kemik = (n: string) => (kopya.getObjectByName(n) ?? kopya.getObjectByName(n.replace(".", ""))) as THREE.Bone | undefined;
  return {
    kadin: ad.startsWith("kadin"),
    nesne,
    karisici,
    eylemler: { Idle: eylem("Idle"), Idle_Neutral: eylem("Idle_Neutral"), Walk: eylem("Walk"), Wave: eylem("Wave"), Interact: eylem("Interact") },
    bacaklar: {
      ustSol: kemik("UpperLeg.L"),
      ustSag: kemik("UpperLeg.R"),
      altSol: kemik("LowerLeg.L"),
      altSag: kemik("LowerLeg.R"),
      ayakSol: kemik("Foot.L"),
      ayakSag: kemik("Foot.R"),
    },
    kollar: {
      ustSol: kemik("UpperArm.L"),
      ustSag: kemik("UpperArm.R"),
      altSol: kemik("LowerArm.L"),
      altSag: kemik("LowerArm.R"),
      bilekSol: kemik("Wrist.L"),
      bilekSag: kemik("Wrist.R"),
    },
  };
}
