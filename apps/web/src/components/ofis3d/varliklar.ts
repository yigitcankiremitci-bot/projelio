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
import { KARAKTER_MODELLERI, KIYAFET_PARCALARI, type KarakterGorunumu, type KiyafetParcasi } from "@projelio/shared";

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
  // Mağazanın ikinci dalgası: paketlerde duran ama sahnede kullanılmayan modeller.
  haliYuvarlak: ["kenney/rugRound.glb", 1.8],
  ikiliKanepe: ["kenney/loungeSofa.glb", 1.8],
  koseKoltuk: ["kenney/loungeSofaCorner.glb", 1.8],
  tasarimKanepe: ["kenney/loungeDesignSofa.glb", 1.8],
  modernLamba: ["kenney/lampRoundFloor.glb", 1.8],
  ortaSehpa: ["kenney/tableCoffee.glb", 1.8],
  copKovasi: ["kenney/trashcan.glb", 1.2],
  // Kenney Furniture Kit'in geri kalanından (2026-11-02): mağazanın üçüncü dalgası.
  uzanmaKoltugu: ["kenney/loungeChairRelax.glb", 1.8],
  tasarimBerjer: ["kenney/loungeDesignChair.glb", 1.8],
  buyukKoseKanepe: ["kenney/loungeDesignSofaCorner.glb", 1.8],
  uzanmaliKanepe: ["kenney/loungeSofaLong.glb", 1.8],
  minderPuf: ["kenney/loungeSofaOttoman.glb", 1.8],
  minderliBank: ["kenney/benchCushion.glb", 1.8],
  yerMinderi: ["kenney/benchCushionLow.glb", 1.8],
  barTaburesi: ["kenney/stoolBar.glb", 1.8],
  yuvarlakSandalye: ["kenney/chairRounded.glb", 1.8],
  genisKitaplik: ["kenney/bookcaseClosedWide.glb", 1.8],
  kapakliKitaplik: ["kenney/bookcaseClosedDoors.glb", 1.8],
  alcakKitaplik: ["kenney/bookcaseOpenLow.glb", 1.8],
  tvDolabi: ["kenney/cabinetTelevisionDoors.glb", 1.8],
  koseMasa: ["kenney/deskCorner.glb", 1.8],
  yuvarlakMasa: ["kenney/tableRound.glb", 1.8],
  camSehpa: ["kenney/tableCoffeeGlass.glb", 1.8],
  kareSehpa: ["kenney/tableCoffeeSquare.glb", 1.8],
  ahsapMasa: ["kenney/tableCross.glb", 1.8],
  komodin: ["kenney/cabinetBedDrawerTable.glb", 1.8],
  oyuncakAyi: ["kenney/bear.glb", 1.8],
  kareLambader: ["kenney/lampSquareFloor.glb", 1.8],
  haliDikdortgen: ["kenney/rugRectangle.glb", 1.8],
  haliKoseli: ["kenney/rugRounded.glb", 1.8],
  haliKare: ["kenney/rugSquare.glb", 1.8],
  haliPaspas: ["kenney/rugDoormat.glb", 1.8],
  eskiTelevizyon: ["kenney/televisionVintage.glb", 1.8],
  buzdolabiBuyuk: ["kenney/kitchenFridgeLarge.glb", 1.8],
  buzdolabiDik: ["kenney/kitchenFridge.glb", 1.8],
  ocak: ["kenney/kitchenStoveElectric.glb", 1.8],
  // Yalnızca takımların parçası olarak kullanılanlar.
  sandalyeMinderli: ["kenney/chairCushion.glb", 1.8],
  sandalyeCerceveli: ["kenney/chairModernFrameCushion.glb", 1.8],
  camMasa: ["kenney/tableGlass.glb", 1.8],
  ortuluMasa: ["kenney/tableCloth.glb", 1.8],
  koliKapali: ["kenney/cardboardBoxClosed.glb", 1.8],
  koliAcik: ["kenney/cardboardBoxOpen.glb", 1.8],
  mutfakDolabi: ["kenney/kitchenCabinet.glb", 1.8],
  cekmeceliDolap: ["kenney/kitchenCabinetDrawer.glb", 1.8],
  evye: ["kenney/kitchenSink.glb", 1.8],
  mikrodalga: ["kenney/kitchenMicrowave.glb", 1.8],
  blender: ["kenney/kitchenBlender.glb", 1.8],
  tostMakinesi: ["kenney/toaster.glb", 1.8],
  barUcu: ["kenney/kitchenBarEnd.glb", 1.8],
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
  metalLight: "#C9CDD6",
  glass: "#CFE3EC",
  fur: "#B07A4E",
};

function kenneyBoya(o: THREE.Object3D): void {
  o.traverse((c) => {
    const m = (c as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (!m || Array.isArray(m) || !m.isMeshStandardMaterial) return;
    // Paketin bazı dosyalarında ad sonda boşlukla geliyor ("wood ").
    const ad = m.name.trim();
    const renk = KENNEY_PALET[ad];
    if (renk) m.color.set(renk);
    m.metalness = 0;
    m.roughness = ad.startsWith("metal") ? 0.45 : 0.75;
    // Cam sehpa/masa: opak açık mavi bir levha gibi duruyordu.
    if (ad === "glass") {
      m.transparent = true;
      m.opacity = 0.45;
      m.roughness = 0.1;
      m.depthWrite = false;
    }
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

/**
 * Yüklenmiş modelin bir kopyası (malzemeler paylaşılır). Kökü hangi modelden
 * geldiğini userData.varlik'te taşır: motor tıklanan şeyin oturulacak bir yer
 * olup olmadığını buradan anlar (bkz. OTURAKLAR).
 */
export function varlik(ad: VarlikAdi): THREE.Group {
  const o = ornekler.get(ad);
  if (!o) throw new Error(`Model yüklenmedi: ${ad}`);
  const k = o.clone(true) as THREE.Group;
  k.userData.varlik = ad;
  return k;
}

/**
 * Üstüne oturulabilen modeller ve oturağın yerden yüksekliği (m). `uzun`:
 * birden çok kişilik (kanepe, bank) — tıklanan yere en yakın oturağa oturulur.
 */
export const OTURAKLAR: Partial<Record<VarlikAdi, { yukseklik: number; uzun?: boolean }>> = {
  ofisSandalyesi: { yukseklik: 0.46 },
  toplantiSandalyesi: { yukseklik: 0.46 },
  sandalyeMinderli: { yukseklik: 0.46 },
  sandalyeCerceveli: { yukseklik: 0.46 },
  yuvarlakSandalye: { yukseklik: 0.46 },
  barTaburesi: { yukseklik: 0.72 },
  koltuk: { yukseklik: 0.42 },
  dinlenmeKoltugu: { yukseklik: 0.4 },
  uzanmaKoltugu: { yukseklik: 0.4 },
  tasarimBerjer: { yukseklik: 0.42 },
  minderPuf: { yukseklik: 0.38 },
  yerMinderi: { yukseklik: 0.22 },
  kanepe: { yukseklik: 0.42, uzun: true },
  ikiliKanepe: { yukseklik: 0.4, uzun: true },
  tasarimKanepe: { yukseklik: 0.4, uzun: true },
  uzanmaliKanepe: { yukseklik: 0.4, uzun: true },
  koseKoltuk: { yukseklik: 0.4, uzun: true },
  buyukKoseKanepe: { yukseklik: 0.4, uzun: true },
  minderliBank: { yukseklik: 0.44, uzun: true },
};

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

const KARAKTERLER = KARAKTER_MODELLERI.map((m) => m.dosya);

const SAC = /^(Hair|Hair_Brown|Hair_Blond|Eyebrows|Moustache)$/;
const TEN = /^(Skin|Skin_Darker)$/;

type Parca = KiyafetParcasi | "bas";

/** Parçanın kemik bölgeleri; geri kalan her şey (gövde, kollar) üst. Kalça sayılmaz: hem etekte hem gömlek ucunda. */
const BOLGELER: [RegExp, Parca][] = [
  [/^Head/, "bas"],
  [/^(Foot|PT)/, "ayakkabi"],
  [/^(UpperLeg|LowerLeg)/, "alt"],
];
const parcaOnbellek = new WeakMap<THREE.BufferGeometry, Parca>();

/**
 * Ağın ait olduğu parça bütünü. Birden çok malzemeli ağ (ör. sandaletin teni
 * ve kayışı) GLTFLoader'da bir grubun altında malzeme başına ayrı ağ olur;
 * parça grup olarak sınıflanır ve taşınır, yoksa sandaletin teni pantolonla gidiyordu.
 */
const parcaGrubu = (m: THREE.SkinnedMesh): THREE.Object3D => {
  const e = m.parent;
  return e && e.children.length > 1 && e.children.every((c) => (c as THREE.SkinnedMesh).isSkinnedMesh) ? e : m;
};
const grubunAglari = (g: THREE.Object3D): THREE.SkinnedMesh[] =>
  (g as THREE.SkinnedMesh).isSkinnedMesh ? [g as THREE.SkinnedMesh] : (g.children as THREE.SkinnedMesh[]);

/**
 * Ağ hangi parça: parçasının köşeleri en çok hangi bölgenin kemiklerine bağlı.
 * Modellerde ağ adları (Cube.012…) ve sırası tutarsız, ağırlıklar tutarlı.
 */
function parcasi(m: THREE.SkinnedMesh): Parca {
  const aglar = grubunAglari(parcaGrubu(m));
  // Kopyalar geometriyi paylaşır: grubun ilk geometrisi anahtar.
  const onceki = parcaOnbellek.get(aglar[0].geometry);
  if (onceki) return onceki;
  const puan: Record<Parca, number> = { bas: 0, ust: 0, alt: 0, ayakkabi: 0 };
  for (const a of aglar) {
    const idx = a.geometry.getAttribute("skinIndex");
    const agirlik = a.geometry.getAttribute("skinWeight");
    if (!idx || !agirlik) continue;
    const bolge = a.skeleton.bones.map((b) => (/^Hips/.test(b.name) ? null : (BOLGELER.find(([r]) => r.test(b.name))?.[1] ?? "ust")));
    for (let i = 0; i < idx.count; i++)
      for (let c = 0; c < 4; c++) {
        const b = bolge[idx.getComponent(i, c)];
        if (b) puan[b] += agirlik.getComponent(i, c);
      }
  }
  // Ayakkabının bilek kısmı baldıra bağlı: ağırlığı ayakla baldır arasında
  // yarı yarıya. Pantolonda ayağa hiç ağırlık yok; ayağa belirgin bağlı olan ayakkabıdır.
  const toplam = puan.bas + puan.ust + puan.alt + puan.ayakkabi;
  const sonuc =
    puan.ayakkabi > toplam * 0.25 ? "ayakkabi" : (Object.keys(puan) as Parca[]).reduce((a, b) => (puan[b] > puan[a] ? b : a), "ust");
  parcaOnbellek.set(aglar[0].geometry, sonuc);
  return sonuc;
}

const deriliAglar = (o: THREE.Object3D): THREE.SkinnedMesh[] => {
  const r: THREE.SkinnedMesh[] = [];
  o.traverse((c) => {
    if ((c as THREE.SkinnedMesh).isSkinnedMesh) r.push(c as THREE.SkinnedMesh);
  });
  return r;
};
const tekMalzeme = (m: THREE.Mesh): THREE.Material => (Array.isArray(m.material) ? m.material[0] : m.material);

function karakterYukle(ad: string): Promise<GLTF> {
  let p = karakterOnbellek.get(ad);
  if (!p) {
    p = yukleyici.loadAsync(`${KOK}karakterler/${ad}.glb`);
    karakterOnbellek.set(ad, p);
    p.catch(() => karakterOnbellek.delete(ad));
  }
  return p;
}

/**
 * Seçilen parçaları başka modellerden giydirir. Bütün modeller aynı iskelette
 * (aynı adlı 62 kemik): kaynak ağın geometrisi karakterin kemiklerine adla
 * bağlanır, kendi bağlama matrisleriyle. Kadın ve erkek iskeletin oranları
 * biraz farklı; parça bu sayede giyenin bedenine göre oturur.
 */
async function parcalariGiydir(kopya: THREE.Object3D, ad: string, g: KarakterGorunumu): Promise<void> {
  const kemikler = new Map<string, THREE.Bone>();
  kopya.traverse((c) => {
    if ((c as THREE.Bone).isBone) kemikler.set(c.name, c as THREE.Bone);
  });
  for (const { alan } of KIYAFET_PARCALARI) {
    const kaynakAd = g[alan];
    if (!kaynakAd || kaynakAd === ad || !KARAKTERLER.includes(kaynakAd)) continue;
    const gruplar = (o: THREE.Object3D) => [...new Set(deriliAglar(o).filter((m) => parcasi(m) === alan).map(parcaGrubu))];
    const kaynak = gruplar((await karakterYukle(kaynakAd)).scene);
    const eski = gruplar(kopya);
    const ebeveyn = eski[0]?.parent;
    if (!kaynak.length || !ebeveyn) continue;
    for (const e of eski) e.removeFromParent();
    for (const kg of kaynak) {
      // Grup ise grubun kendisi de (yerel konumuyla) kopyalanır, ağlar altına.
      const hedef: THREE.Object3D = kg === grubunAglari(kg)[0] ? ebeveyn : new THREE.Group();
      if (hedef !== ebeveyn) {
        hedef.name = kg.name;
        hedef.position.copy(kg.position);
        hedef.quaternion.copy(kg.quaternion);
        hedef.scale.copy(kg.scale);
        ebeveyn.add(hedef);
      }
      for (const s of grubunAglari(kg)) {
        const bag = s.skeleton.bones.map((b) => kemikler.get(b.name));
        if (bag.some((b) => !b)) continue;
        const yeni = new THREE.SkinnedMesh(s.geometry, s.material);
        yeni.name = s.name;
        yeni.position.copy(s.position);
        yeni.quaternion.copy(s.quaternion);
        yeni.scale.copy(s.scale);
        yeni.frustumCulled = false;
        hedef.add(yeni);
        yeni.bind(new THREE.Skeleton(bag as THREE.Bone[], s.skeleton.boneInverses.map((x) => x.clone())), s.bindMatrix.clone());
      }
    }
  }
}

/**
 * Seçilen renkleri karakterin kendi kopyasına boyar. Malzemeler bütün
 * kopyalarda ortak: önce klonlanır, yoksa aynı modeldeki herkes boyanırdı.
 * Kıyafet rengi parçanın ANA malzemesine gider (ten, saç, göz dışında en
 * büyük alanı kaplayan): kravat, düğme gibi ayrıntılar kendi renginde kalır.
 * Aynı malzeme iki parçada olabilir (takım elbisenin ceketi ve pantolonu):
 * klon parça başına, yoksa üstü boyamak pantolonu da boyardı.
 */
function boya(kopya: THREE.Object3D, g: KarakterGorunumu): void {
  const aglar = deriliAglar(kopya);
  const ana = new Map<Parca, { malzeme: THREE.Material; alan: number }>();
  for (const m of aglar) {
    const x = tekMalzeme(m);
    if (TEN.test(x.name) || SAC.test(x.name) || /^Eye/.test(x.name)) continue;
    const alan = m.geometry.index?.count ?? m.geometry.getAttribute("position").count;
    const p = parcasi(m);
    if ((ana.get(p)?.alan ?? -1) < alan) ana.set(p, { malzeme: x, alan });
  }
  const parcaRengi: Partial<Record<Parca, string>> = {};
  for (const p of KIYAFET_PARCALARI) if (g[p.renk]) parcaRengi[p.alan] = g[p.renk];
  const klonlar = new Map<string, THREE.Material>();
  for (const m of aglar) {
    const x = tekMalzeme(m);
    const p = parcasi(m);
    let r: { renk: string; kat?: number } | undefined;
    if (g.ten && x.name === "Skin") r = { renk: g.ten };
    // Elin/yüzün gölgeli yanı: tenin biraz koyusu.
    else if (g.ten && x.name === "Skin_Darker") r = { renk: g.ten, kat: 0.8 };
    else if (g.sac && SAC.test(x.name)) r = { renk: g.sac, kat: x.name === "Eyebrows" ? 0.7 : 1 };
    else if (parcaRengi[p] && ana.get(p)?.malzeme === x) r = { renk: parcaRengi[p]! };
    if (!r || !(x as THREE.MeshStandardMaterial).color) continue;
    const anahtar = `${p}|${x.uuid}`;
    let k = klonlar.get(anahtar);
    if (!k) {
      k = x.clone();
      (k as THREE.MeshStandardMaterial).color.set(r.renk).multiplyScalar(r.kat ?? 1);
      klonlar.set(anahtar, k);
    }
    m.material = k;
  }
}

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
  /** Otururken öne eğilmek için omurga kemikleri (karından boyna). */
  govde: {
    karin?: THREE.Bone;
    bel?: THREE.Bone;
    gogus?: THREE.Bone;
    boyun?: THREE.Bone;
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
  /**
   * Dinlenme pozunda ölçülen boylar (karakterin ölçeğinde; 0: ölçülemedi).
   * Oturma pozu bunlarla kurulur: baldır her karede animasyondan ölçülünce
   * ayak bileği iki yükseklik arasında zıplıyor, ayaklar titriyordu.
   */
  boylar: { baldir: number; ustKol: number; onKol: number };
  /** Karakter modeli kadın mı (yol verme kuralı için; kişinin verisinden değil, görünen modelden). */
  kadin: boolean;
}

/**
 * Kişinin seçtiği görünümle (bkz. shared karakterGorunumu.ts) ya da seçmediyse
 * adından türetilen sayıyla karakter kurar; aynı kişi hep aynı görünür.
 */
export async function karakter(sayi: number, gorunum?: KarakterGorunumu | null): Promise<Karakter3D> {
  const ad = gorunum && KARAKTERLER.includes(gorunum.model) ? gorunum.model : KARAKTERLER[sayi % KARAKTERLER.length];
  const g = await karakterYukle(ad);
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
  if (gorunum) {
    await parcalariGiydir(kopya, ad, gorunum);
    boya(kopya, gorunum);
    golgeAc(kopya);
  }
  const nesne = new THREE.Group();
  nesne.add(kopya);
  const karisici = new THREE.AnimationMixer(kopya);
  const eylem = (n: string) => {
    const klip = g.animations.find((a) => a.name === n);
    return klip ? karisici.clipAction(klip) : undefined;
  };
  // GLTFLoader kemik adlarındaki noktayı siler: "UpperLeg.L" → "UpperLegL".
  const kemik = (n: string) => (kopya.getObjectByName(n) ?? kopya.getObjectByName(n.replace(".", ""))) as THREE.Bone | undefined;
  const iskeletler: THREE.Skeleton[] = [];
  kopya.traverse((c) => {
    if ((c as THREE.SkinnedMesh).isSkinnedMesh) iskeletler.push((c as THREE.SkinnedMesh).skeleton);
  });
  // İki kemik arası, bağlama (dinlenme) pozunda: kemiğin ters bağlama matrisinin tersi onun yeri.
  const boy = (a: string, b: string): number => {
    const ka = kemik(a);
    const kb = kemik(b);
    const sk = iskeletler.find((s) => ka && kb && s.bones.includes(ka) && s.bones.includes(kb));
    if (!sk || !ka || !kb) return 0;
    const yer = (k: THREE.Bone) => new THREE.Vector3().setFromMatrixPosition(sk.boneInverses[sk.bones.indexOf(k)].clone().invert());
    return yer(ka).distanceTo(yer(kb)) * KARAKTER_OLCEK;
  };
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
    govde: { karin: kemik("Abdomen"), bel: kemik("Torso"), gogus: kemik("Chest"), boyun: kemik("Neck") },
    boylar: { baldir: boy("LowerLeg.L", "Foot.L"), ustKol: boy("UpperArm.L", "LowerArm.L"), onKol: boy("LowerArm.L", "Wrist.L") },
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
