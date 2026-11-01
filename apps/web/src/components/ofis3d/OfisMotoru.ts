// 3D ofis sahnesi (bkz. OfisOyunu.tsx, kurallar lib/ofisOyunu.ts, modeller varliklar.ts).
//
// React'ten bağımsız bir sınıf: sahne, kamera, ışık ve kare döngüsü burada.
// React tarafı veriyi `kur` / `esyalariKur` ile verir, olayları geri
// çağırmalarla (onOdaTikla, onYerlestir…) alır. Böyle ayrılmasının nedeni
// kare döngüsünün React'in yeniden çizimleriyle karışmaması: her veride
// sahne sökülüp kurulmaz, yalnızca değişen grup yenilenir.
//
// Hazır modeller ağdan yüklendiği için kurulum eşzamansız: `kur` her zaman
// en son verilen veriyi, modeller hazır olunca çizer (önceki istek düşer).

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import {
  adSayisi,
  aralik,
  GEZINME,
  izgarayaOturt,
  katalogEsyasi,
  yolHakki,
  KOLTUK_UZAKLIK,
  koltukUzakligi,
  PATRON_KOLTUK,
  bolgesi,
  yerlestirilebilir,
  type Duvar,
  type EsyaTuru,
  type OfisOdasi,
  type OfisPlani,
  type YerlesikEsya,
} from "../../lib/ofisOyunu";
import { esyaModeli, kutu, malzeme, tahta } from "./modeller";
import { karakter, varlik, varlikVar, varliklariYukle, type Karakter3D, type VarlikAdi } from "./varliklar";
import { modulEsyasi } from "./modulEsyalari";
import { temaEsyalari } from "./studyoEsyalari";
import type { IsTemasi } from "../../lib/studyoOfisi";
import { KASA_MODULU, KUPA_RAFI, PROJE_ONEKI, TOPLANTI_MASASI, modulEsyasiTuru, type IstasyonBilgisi } from "../../lib/ofisOyunu";
import type { NesneDuzeni } from "@projelio/shared";
import { izgaraKur, yolBul, type YolIzgarasi } from "../../lib/ofisYol";

export interface OdaEtiketi {
  ad: string;
  alt: string;
  /** Simge yerine gösterilecek departman kapağı (CSS arka planı). */
  kapak?: string;
  durum?: "ok" | "warn" | "crit";
  ikon: string;
  ton: string;
}

export interface SahneKisisi {
  id: string;
  ad: string;
  odaId: string;
  cevrimici: boolean;
  ben: boolean;
  /** Tamamladığı görev sayısı: yol verme kuralında daha çok çalışan yol verir. */
  emek: number;
  /** Departman yöneticisi: odadaki yönetici masasında oturur. */
  yonetici?: boolean;
  /** Stüdyo: üzerinde çalıştığı projenin istasyonu (modül anahtarı); masası yerine onun önünde ayakta durur. */
  istasyon?: string;
}

interface Yerlestirme {
  tur: EsyaTuru;
  id?: string;
  don: number;
}

type Durum = "oturuyor" | "yuruyor" | "bekliyor";
type Eylem = keyof Karakter3D["eylemler"];

interface Karakter {
  veri: SahneKisisi;
  k3: Karakter3D;
  halka: THREE.Mesh;
  koltuk: THREE.Vector3;
  koltukYonu: number;
  /** Oturduğu masanın odadaki sırası ("masa-N"): masa taşınınca koltuğu izler. */
  masaNo: number;
  /** Masada oturmaz, "koltuk" bir istasyonun önü: orada ayakta çalışır. */
  ayakta?: boolean;
  oda: OfisOdasi;
  durum: Durum;
  yol: THREE.Vector3[];
  sayac: number;
  adim: number;
  donus: boolean;
  eylem: Eylem | null;
  /** Kahve köşesinde mi bekliyor (orada "Interact" oynar). */
  kahvede: boolean;
  /** Başkasına yol verirken kalan süre (saniye); bu sürede kenara çekilip bekler. */
  yolVer: number;
  /** Yol verirken çekildiği yön. */
  kacis: THREE.Vector3;
  /** Duvara dayanıp ilerleyemediği süre (saniye); uzarsa yol yeniden aranır. */
  takili?: number;
}

const IKONLAR: Record<string, string> = {
  kup: '<path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/>',
  megafon: '<path d="M4 10v4a1 1 0 0 0 1 1h2l6 4V5L7 9H5a1 1 0 0 0-1 1zM17 9.5a3.5 3.5 0 0 1 0 5"/>',
  grafik: '<path d="M5 19v-5M10 19V9M15 19v-7M20 19V5"/>',
  disli: '<circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>',
  para: '<ellipse cx="12" cy="6.5" rx="7" ry="3"/><path d="M5 6.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5M5 11.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/>',
  insanlar: '<circle cx="9" cy="8.5" r="3"/><circle cx="16.5" cy="9.5" r="2.4"/><path d="M3.5 19c.5-3 2.7-4.8 5.5-4.8s5 1.8 5.5 4.8M14.5 14.6c2.8-.4 5.3 1.1 6 4.4"/>',
  video: '<rect x="3" y="6.5" width="12.5" height="11" rx="2"/><path d="m15.5 10.5 5.5-3v9l-5.5-3"/>',
  kahve: '<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10.5h1.5a2.5 2.5 0 0 1 0 5H16"/>',
  bina: '<path d="M4 21V5l8-2v18M12 8l8 2v11M8 8v.01M8 12v.01M8 16v.01M16 13v.01M16 17v.01"/>',
  muzik: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  kamera: '<path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13.5" r="3.5"/>',
  kalem: '<path d="M4 20l1-4L16 5l3 3L8 19zM14 7l3 3"/>',
};

const DUVAR_YUKSEKLIK = 2.6;
/** Kalın duvar oda kenarında ortalı durur: iç yüzü kenardan bunun yarısı kadar içeride. */
const DUVAR_KALINLIK = 0.16;
const CAM_YUKSEKLIK = 2.35;
const ZEMIN_Y = 0.06;
/** Kamera: dikey görüş açısı (derece), güneyden doğuya dönüş ve yerden eğim (radyan) — referans görselin açısı. */
const KAMERA_ACI = 36;
const KAMERA_YATAY = 0.17;
const KAMERA_EGIM = 0.88;
/** Oturan kişinin kalçası sandalyenin oturağına insin diye modelin indirileceği miktar. */
const OTURMA_INIS = 0.36;
const ASAGI = new THREE.Vector3(0, -1, 0);
// Her karede her oturan için yeniden yaratılmasın diye.
const OTUR_ILERI = new THREE.Vector3();
const OTUR_A = new THREE.Vector3();
const OTUR_B = new THREE.Vector3();
const OTUR_Q = new THREE.Quaternion();
const OTUR_Q2 = new THREE.Quaternion();
const OTUR_Y = new THREE.Vector3();
const OTUR_ICE = new THREE.Vector3();
const KISI_ESKI = new THREE.Vector3();
const OTUR_YON = new THREE.Vector3();

/**
 * Departman yöneticisinin masası: ekip masasının genişletilmiş hâli (geniş ve
 * derin üst), iki ekran, isimlik, köşede küçük bitki ve daha büyük koltuk.
 * Ekip masası gibi kişi yerel −z'de oturup +z'ye bakar.
 */
function patronMasasi(): THREE.Group {
  const g = new THREE.Group();
  const masaO = varlik("masa");
  masaO.rotation.y = Math.PI;
  masaO.scale.x *= 1.6;
  masaO.scale.z *= 1.3;
  g.add(masaO);
  for (const x of [-0.36, 0.36]) {
    const ekran = varlik("ekran");
    ekran.position.set(x, 0.645, 0.25);
    ekran.rotation.y = Math.PI + (x < 0 ? -0.18 : 0.18);
    g.add(ekran);
  }
  const klavye = varlik("klavye");
  klavye.position.set(0, 0.645, -0.12);
  klavye.rotation.y = Math.PI;
  g.add(klavye);
  const fare = varlik("fare");
  fare.position.set(0.34, 0.645, -0.12);
  g.add(fare);
  // İsimlik: masanın önünde (ekibe dönük), koyu üstünde açık şerit.
  const isimlik = kutu(0.32, 0.07, 0.04, malzeme("#3E4858"), 0.01);
  isimlik.position.set(0.55, 0.68, 0.42);
  g.add(isimlik);
  const bitki = varlik("bitkiKucuk1");
  bitki.position.set(-0.78, 0.645, 0.3);
  g.add(bitki);
  const koltuk = varlik("ofisSandalyesi");
  koltuk.scale.multiplyScalar(1.15);
  koltuk.position.set(0, 0, -PATRON_KOLTUK);
  g.add(koltuk);
  return g;
}

/** Kemiğin uzunluk ekseni (yerel +Y; çocuk kemik o yönde) dünyada `yon`e baksın. */
function kemigiYonelt(kemik: THREE.Object3D, yon: THREE.Vector3): void {
  if (!kemik.parent) return;
  const dunya = kemik.getWorldQuaternion(OTUR_Q);
  const simdiki = OTUR_Y.set(0, 1, 0).applyQuaternion(dunya);
  const yeniDunya = OTUR_Q2.setFromUnitVectors(simdiki, yon).multiply(dunya);
  kemik.quaternion.copy(kemik.parent.getWorldQuaternion(OTUR_Q).invert().multiply(yeniDunya));
  kemik.updateMatrixWorld(true);
}

// ------------------------------------------------------------------ dokular

/** Kodla çizilen parke dokusu: referanstaki sıcak, açık meşe zemin. */
function parkeDokusu(taban: string, cizgi: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const x = c.getContext("2d")!;
  x.fillStyle = taban;
  x.fillRect(0, 0, 512, 512);
  const tahtaY = 64;
  for (let r = 0; r < 512 / tahtaY; r++) {
    const kayma = (r * 173) % 512;
    for (let i = -1; i < 3; i++) {
      const bas = i * 256 + kayma;
      // Her tahtaya hafif ton farkı: düz renk zemin "plastik" görünüyordu.
      const ton = ((r * 7 + i * 13) % 5) - 2;
      x.fillStyle = `rgba(${ton > 0 ? 255 : 120},${ton > 0 ? 240 : 90},${ton > 0 ? 220 : 60},${Math.abs(ton) * 0.025})`;
      x.fillRect(bas, r * tahtaY, 256, tahtaY);
      x.fillStyle = cizgi;
      x.fillRect(bas, r * tahtaY, 2, tahtaY);
    }
    x.fillStyle = cizgi;
    x.fillRect(0, r * tahtaY, 512, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/**
 * Marka renkleri: uygulama temasının köke yazdığı --color-* değişkenlerinden
 * (bkz. ThemeProvider). Kullanıcının seçtiği vurgu rengi sahneye de yansısın;
 * değişkenler yoksa (ör. testte) marka varsayılanları.
 */
function marka(): { vurgu: string; vurguKoyu: string; ana: string; anaKoyu: string; basari: string; tehlike: string } {
  const st = typeof document !== "undefined" ? getComputedStyle(document.documentElement) : null;
  const al = (ad: string, yedek: string) => st?.getPropertyValue(ad).trim() || yedek;
  return {
    vurgu: al("--color-accent", "#C0813F"),
    vurguKoyu: al("--color-accent-dark", "#8C5A28"),
    ana: al("--color-primary", "#3E4858"),
    anaKoyu: al("--color-primary-dark", "#1C222C"),
    basari: al("--color-success", "#2E9E5B"),
    tehlike: al("--color-danger", "#C13434"),
  };
}

/**
 * Girişteki paspas: markanın koyu zemini, beyaz kutuda Projelio logosu ve adı
 * (kenar çubuğundaki gibi). Logo görseli yüklenince doku tazelenir.
 */
function paspasDokusu(): THREE.CanvasTexture {
  const m = marka();
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const x = c.getContext("2d")!;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  const ciz = (logo?: HTMLImageElement) => {
    x.clearRect(0, 0, 512, 256);
    x.fillStyle = m.anaKoyu;
    x.beginPath();
    x.roundRect(0, 0, 512, 256, 36);
    x.fill();
    x.strokeStyle = "rgba(255,255,255,0.12)";
    x.lineWidth = 6;
    x.beginPath();
    x.roundRect(18, 18, 476, 220, 26);
    x.stroke();
    x.fillStyle = "#FFFFFF";
    x.beginPath();
    x.roundRect(74, 86, 84, 84, 18);
    x.fill();
    if (logo) x.drawImage(logo, 86, 98, 60, 60);
    x.fillStyle = m.vurgu;
    x.font = "600 70px 'Bricolage Grotesque', system-ui, sans-serif";
    x.textBaseline = "middle";
    x.fillText("Projelio", 182, 132);
    t.needsUpdate = true;
  };
  ciz();
  const logo = new Image();
  logo.onload = () => ciz(logo);
  logo.src = "/logo.png";
  return t;
}

// ------------------------------------------------------------------ motor

interface LioRobotu {
  obj: THREE.Group;
  /** Süzülen kısım (gövde + gözler); gölge yerde kalır. */
  govde: THREE.Group;
  gozler: THREE.Group;
  golge: THREE.Mesh;
  yol: { x: number; z: number }[];
  /** Hedefe varınca bekleyeceği süre (sn). */
  bekle: number;
  /** Bakmak istediği yön (rotation.y). */
  yon: number;
  /** Bir sonraki göz kırpmaya kalan süre. */
  kirp: number;
}

/** Ajan robotunun hâli (Ajan MVP, migration 177): Mac'teki programın durumundan gelir. */
export interface AjanRobotBilgisi {
  ad: string;
  hal: "uyuyor" | "bosta" | "calisiyor";
  /** Okunmamış rapor ya da onay bekleyen öneri var: antende turuncu ışık. */
  haber: boolean;
  not?: string | null;
}

interface AjanRobotu extends LioRobotu {
  isik: THREE.Mesh;
  ekran: THREE.Mesh;
}

export class OfisMotoru {
  onOdaTikla?: (odaId: string) => void;
  onEsyaTikla?: (esyaId: string, ekran: { x: number; y: number }) => void;
  onYerlestir?: (e: { id?: string; tur: EsyaTuru; x: number; z: number; don: number }) => void;
  onIptal?: () => void;
  /** Esc ile odadan çıkılınca (React panelini kapatsın diye). */
  onOdadanCikildi?: () => void;
  /** Odadaki bir modül eşyasına tıklanınca (modül sayfası açılır). */
  onModulTikla?: (odaId: string, modulKey: string) => void;
  /** Ofiste gezen Lio robotuna tıklanınca (Lio sohbeti açılır). */
  onLioTikla?: () => void;
  /** Ajan robotuna tıklanınca (ajan paneli açılır). */
  onAjanTikla?: () => void;
  /** Stüdyoda proje istasyonlarının ve kupa rafının bilgisi (anahtar: modül anahtarı). */
  private istasyonBilgileri = new Map<string, IstasyonBilgisi>();
  /** Stüdyoda odanın döşemesi (oda kimliği → tema). */
  private odaTemalari = new Map<string, string>();
  /** Modül adları (üzerine gelince gösterilir); React tarafı katalogdan doldurur. */
  modulAdlari = new Map<string, string>();
  /** Modeller yüklenince (ya da yüklenemeyince) bir kez çağrılır. */
  onHazir?: (hata?: unknown) => void;

  private kap: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private etiketRenderer: CSS2DRenderer;
  private birlestirici: EffectComposer | null = null;
  private aoGecisi: GTAOPass | null = null;
  private sahne = new THREE.Scene();
  private kamera: THREE.PerspectiveCamera;
  private kontrol: OrbitControls;
  private gunes: THREE.DirectionalLight;
  private saat = new THREE.Clock();
  private kare = 0;
  private gozlemci: ResizeObserver;
  private hazir: Promise<void>;
  private kurulumSirasi = 0;

  private yapi = new THREE.Group();
  private esyaGrubu = new THREE.Group();
  private kisiGrubu = new THREE.Group();
  private efektler = new THREE.Group();
  private zeminler: THREE.Mesh[] = [];
  private hareketliler: THREE.Object3D[] = [];
  private karakterler: Karakter[] = [];
  private esyaNesneleri = new Map<string, THREE.Group>();
  /** Odalardaki modül eşyaları: anahtar "odaId|modulKey". */
  private modulNesneleri = new Map<string, THREE.Object3D>();
  /** Oda düzenleyicisinde taşınabilen nesneler: anahtar "odaId|nesneId". */
  private nesneler = new Map<string, { obj: THREE.Object3D; oda: OfisOdasi; nesneId: string }>();
  /**
   * Zemine konan, içinden geçilemeyen her şey (masa, kanepe, bitki…): yürüyüş
   * ızgarasının ve düzenleyicideki çakışma denetiminin kaynağı. Halılar ve
   * yüksekteki (duvara asılı, masa üstündeki) eşyalar girmez.
   */
  private zeminEsyalari: THREE.Object3D[] = [];
  /** Yürüyüş ızgarası; sahne ya da eşyalar değişince bayatlar, gerekince kurulur. */
  private yolIzgarasi: YolIzgarasi | null = null;
  /** Düzenleyicide yer olmadığında (ör. döndürmeye) kullanıcıya söylenecek. */
  onUyari?: (metin: string) => void;
  /** Düzenlenen oda (yoksa düzenleme kapalı). */
  private duzenlenenOda: string | null = null;
  private seciliNesne: string | null = null;
  private surukleme: { anahtar: string; fark: THREE.Vector3; bas: THREE.Vector3; kutular?: THREE.Box3[] } | null = null;
  private secimIzi: THREE.Mesh | null = null;
  /** Düzenleyicide bir nesne değişince (taşındı, döndü, kaldırıldı): odaya göre konum. */
  onNesneDegisti?: (odaId: string, nesneId: string, d: NesneDuzeni) => void;
  /** Düzenleyicide seçili nesne değişince (yoksa null). */
  onNesneSecildi?: (nesneId: string | null) => void;
  private parcaciklar: { m: THREE.Mesh; h: THREE.Vector3; omur: number }[] = [];
  private dokular: THREE.Texture[] = [];

  private plan: OfisPlani | null = null;
  private planImza = "";
  private esyalar: YerlesikEsya[] = [];
  private bekleyenEsyalar: YerlesikEsya[] | null = null;
  private yerlestirme: Yerlestirme | null = null;
  private hayalet: THREE.Group | null = null;
  private hayaletZemin: THREE.Mesh | null = null;
  private hayaletGecerli = false;
  private duzenleme = false;
  /**
   * Ortak alana tıklanıp girilebilir mi: yalnızca onu düzenleyebilene (bitkileri
   * taşımak için). Diğerleri için ortak zemin eskisi gibi tıklanmaz.
   */
  ortakGirilebilir = false;

  private isin = new THREE.Raycaster();
  private fare = new THREE.Vector2();
  private fareVar = false;
  private basilan: { x: number; y: number } | null = null;
  private ustteki: { tur: "oda" | "kisi" | "esya" | "modul" | "lio" | "ajan"; id: string } | null = null;
  /** Ortalıkta gezen Lio robotu (ilk kurulumda bir kez yaratılır). */
  private lio: LioRobotu | null = null;
  /** Ajan robotu: yalnızca ajanı açık hesapta, ajaniAyarla ile görünür. */
  private ajan: AjanRobotu | null = null;
  private ajanBilgisi: AjanRobotBilgisi | null = null;
  private kisiEtiketi: CSS2DObject;
  private girisAnimasyonu = 0;
  private gecis: { t: number; hedefBas: THREE.Vector3; hedefSon: THREE.Vector3; konumBas: THREE.Vector3; konumSon: THREE.Vector3 } | null = null;
  /** Kameranın içine girdiği oda (yoksa bütün ofis görünüyor). */
  icerdekiOda: string | null = null;
  /** Ofisin kadraja oturduğu kamera uzaklığı (bkz. kadrajla). */
  private uzaklik = 40;
  private uzakMi = false;

  constructor(kap: HTMLElement) {
    this.kap = kap;
    const { clientWidth: w, clientHeight: h } = kap;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.86;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    kap.appendChild(this.renderer.domElement);

    this.etiketRenderer = new CSS2DRenderer();
    this.etiketRenderer.setSize(w, h);
    this.etiketRenderer.domElement.className = "of-etiketler";
    kap.appendChild(this.etiketRenderer.domElement);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.sahne.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.sahne.environmentIntensity = 0.35;
    pmrem.dispose();

    // Referans görsel hafif perspektifli bir "maket fotoğrafı": dar açılı
    // perspektif kamera, eş ölçülü (ortografik) bakıştan daha sıcak duruyor.
    this.kamera = new THREE.PerspectiveCamera(KAMERA_ACI, w / h, 0.5, 400);
    this.kontrol = new OrbitControls(this.kamera, this.renderer.domElement);
    this.kontrol.enableDamping = true;
    this.kontrol.dampingFactor = 0.08;
    // Gezinme, harita oyunlarındaki gibi: sol tık / tek parmak sürükleyince
    // kaydırır, sağ tık / touchpad'de iki parmakla tıklayıp sürükleyince döndürür,
    // tekerlek / iki parmak kaydırma yaklaştırır. Kaydırma zemine paralel
    // (ekrana değil): ofis yukarı kayıp havaya kalkmasın.
    this.kontrol.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    this.kontrol.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
    this.kontrol.screenSpacePanning = false;
    this.kontrol.panSpeed = 1.1;
    // Ok tuşlarıyla gezinme: sahne kabı odaklanabilir; üstüne tıklanınca odak alır.
    kap.tabIndex = 0;
    this.kontrol.listenToKeyEvents(kap);
    this.kontrol.keyPanSpeed = 18;
    this.kontrol.minPolarAngle = 0.35;
    this.kontrol.maxPolarAngle = 1.2;
    this.kontrol.rotateSpeed = 0.6;
    this.kontrol.zoomToCursor = true;

    this.sahne.add(new THREE.HemisphereLight("#ffffff", "#cdbfae", 0.95));
    this.gunes = new THREE.DirectionalLight("#fff1e0", 2.4);
    this.gunes.castShadow = true;
    this.gunes.shadow.mapSize.set(2048, 2048);
    this.gunes.shadow.bias = -0.0004;
    this.gunes.shadow.normalBias = 0.025;
    this.gunes.shadow.radius = 5;
    this.sahne.add(this.gunes, this.gunes.target);

    this.sahne.add(this.yapi, this.esyaGrubu, this.kisiGrubu, this.efektler);

    // Ortam gölgelemesi (köşelerde, eşyaların dibinde yumuşak kararma) —
    // referanstaki "render" hissinin çoğu bundan. Desteklemeyen cihazda düz çizime düşer.
    try {
      const b = new EffectComposer(this.renderer);
      b.addPass(new RenderPass(this.sahne, this.kamera));
      const ao = new GTAOPass(this.sahne, this.kamera, w, h);
      ao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.5, thickness: 1.2, scale: 1 });
      ao.blendIntensity = 0.85;
      b.addPass(ao);
      b.addPass(new OutputPass());
      b.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      b.setSize(w, h);
      this.birlestirici = b;
      this.aoGecisi = ao;
    } catch {
      this.birlestirici = null;
    }

    const div = document.createElement("div");
    div.className = "of-kisi-etiketi";
    this.kisiEtiketi = new CSS2DObject(div);
    this.kisiEtiketi.visible = false;
    this.sahne.add(this.kisiEtiketi);

    const tuval = this.renderer.domElement;
    tuval.addEventListener("pointermove", this.fareHareket);
    tuval.addEventListener("pointerdown", this.fareBas);
    // Düzenleyicide nesneyi tutmak OrbitControls'tan ÖNCE yakalanmalı (o da
    // aynı tuvali dinliyor): yakalama evresinde kaptan dinlenir.
    kap.addEventListener("pointerdown", this.duzenBas, true);
    window.addEventListener("pointerup", this.duzenBirak);
    tuval.addEventListener("pointerup", this.fareBirak);
    tuval.addEventListener("pointerleave", this.fareCik);
    window.addEventListener("keydown", this.tus);

    this.gozlemci = new ResizeObserver(() => this.boyutla());
    this.gozlemci.observe(kap);

    this.hazir = varliklariYukle();
    this.hazir.then(
      () => this.onHazir?.(),
      (e) => this.onHazir?.(e)
    );

    this.renderer.setAnimationLoop(this.ciz);
    // Geliştirmede sahneyi konsoldan incelemek için.
    if (import.meta.env.DEV) (window as unknown as { __ofisMotoru?: OfisMotoru }).__ofisMotoru = this;
  }

  // ------------------------------------------------------------ dışa açık

  async kur(plan: OfisPlani, etiketler: Record<string, OdaEtiketi>, kisiler: SahneKisisi[]): Promise<void> {
    const sira = ++this.kurulumSirasi;
    await this.hazir;
    if (sira !== this.kurulumSirasi) return;
    const ilk = !this.plan;
    const imza = JSON.stringify(plan);
    this.plan = plan;
    if (imza !== this.planImza) {
      this.planImza = imza;
      this.yapiyiKur(plan);
      // Veri geç gelip plan yeniden kurulduğunda (ör. modüller yüklenince) bir
      // odanın içindeysek kamera o odada kalır; bütün ofise sıfırlanmaz.
      const oda = this.icerdekiOda && plan.odalar.some((o) => o.id === this.icerdekiOda) ? this.icerdekiOda : null;
      if (oda && this.duzenlenenOda === oda) {
        // Düzenleyicide her değişiklik planı yeniden kurar; kamera kullanıcının
        // bıraktığı yerde kalır, seçim de korunur.
        const secili = this.seciliNesne;
        this.seciliNesne = null;
        if (secili && this.nesneAl(secili)) this.secimiAyarla(secili, false);
      } else {
        this.kamerayiYerlestir(ilk);
        if (oda) {
          this.odayaGir(oda);
          if (this.gecis) this.gecis.t = 1; // sıçramadan, doğrudan yeni yerine
        } else this.icerdekiOda = null;
      }
    }
    this.etiketleriKur(plan, etiketler);
    // Plan değişince (duvarlar, eşyalar) mağaza eşyalarına yeniden bakılır.
    this.esyalariKur(this.bekleyenEsyalar ?? this.esyalar);
    await this.kisileriKur(plan, kisiler, sira);
    if (sira !== this.kurulumSirasi) return;
    this.lioyuKur(plan);
    this.ajaniKur(plan);
  }

  /**
   * Proje istasyonlarının bilgisi (ilerleme, teslim). Bilgi değiştiyse sahne bir
   * sonraki kur()'da yeniden çizilir: plan aynı kalsa da pano yüzleri tazelenmeli.
   */
  istasyonlariAyarla(bilgiler: Map<string, IstasyonBilgisi>): void {
    const imza = (m: Map<string, IstasyonBilgisi>) => JSON.stringify([...m].sort(([a], [b]) => a.localeCompare(b)));
    if (imza(bilgiler) === imza(this.istasyonBilgileri)) return;
    this.istasyonBilgileri = bilgiler;
    this.planImza = "";
  }

  /** Stüdyo odalarının teması (işin türü); değiştiyse sahne bir sonraki kur()'da yeniden döşenir. */
  temalariAyarla(temalar: Map<string, string>): void {
    const imza = (m: Map<string, string>) => JSON.stringify([...m].sort(([a], [b]) => a.localeCompare(b)));
    if (imza(temalar) === imza(this.odaTemalari)) return;
    this.odaTemalari = temalar;
    this.planImza = "";
  }

  /**
   * Temanın eşyalarını odaya koyar: dış duvarın önünden başlayarak en yakın
   * boş yere (masalar, modül eşyaları ve köşe bitkileri konduktan sonra).
   * Sığmayan konmaz. Kimlikleri "dekor:tema-N": düzenleyicide taşınabilir.
   */
  private temayiDose(oda: OfisOdasi, tema: IsTemasi, iceDonus: number): void {
    const dis = { x: -oda.kapiYonu.x, z: -oda.kapiYonu.z };
    const yan = { x: dis.z, z: dis.x };
    const cx = oda.x + oda.w / 2;
    const cz = oda.z + oda.d / 2;
    // Dış duvarın 1 m önü; eşyalar duvar boyunca sırayla sola/sağa açılır.
    const derin = (dis.x !== 0 ? oda.w : oda.d) / 2 - 1;
    temaEsyalari(tema).forEach((obj, i) => {
      const kayma = (i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2) * 1.3;
      const bas = { x: cx + dis.x * derin + yan.x * kayma, z: cz + dis.z * derin + yan.z * kayma };
      obj.position.set(bas.x, ZEMIN_Y, bas.z);
      obj.rotation.y = iceDonus;
      const nesneId = `dekor:tema-${i}`;
      const yer = this.bosYer(obj, oda, nesneId, oda, bas, true);
      if (yer) this.nesneKoy(oda, nesneId, obj, yer.x, yer.z, iceDonus);
    });
  }

  // ------------------------------------------------------------ Ajan

  /**
   * Ajanın hâlini değiştirir; null robotu gizler (ajanı kapalı hesap). Plan
   * henüz kurulmadıysa bilgi saklanır, robot plan kurulunca yaratılır.
   */
  ajaniAyarla(bilgi: AjanRobotBilgisi | null): void {
    this.ajanBilgisi = bilgi;
    if (this.plan) this.ajaniKur(this.plan);
    if (this.ustteki?.tur === "ajan") {
      // Etiket yeni hâli göstersin.
      const u = this.ustteki;
      this.ustteki = null;
      this.ustteyiAyarla(u);
    }
  }

  /**
   * Ajan: Lio'nun yanında gezen küçük, kutu gövdeli robot — koyu ekran yüz,
   * iki parlak göz, tepesinde durum ışığı. Lio şirketin asistanı, ajan ise
   * kullanıcının kendi Mac'inde çalışan kişisel yardımcısı; ayrı görünsünler.
   */
  private ajaniKur(plan: OfisPlani): void {
    if (!this.ajanBilgisi) {
      if (this.ajan) this.ajan.obj.visible = false;
      return;
    }
    if (this.ajan) {
      this.ajan.obj.visible = true;
      const p = this.ajan.obj.position;
      if (!plan.odalar.some((o) => p.x > o.x && p.x < o.x + o.w && p.z > o.z && p.z < o.z + o.d)) this.ajaniKoseyeKoy(plan);
      this.ajan.yol = [];
      return;
    }
    const obj = new THREE.Group();
    const govde = new THREE.Group();
    const kafa = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.42), malzeme("#3E4858", { parlak: 0.35 }));
    kafa.castShadow = true;
    govde.add(kafa);
    const ekran = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.27, 0.02), new THREE.MeshStandardMaterial({ color: "#1C222C", roughness: 0.3 }));
    ekran.position.set(0, 0, 0.215);
    govde.add(ekran);
    const gozler = new THREE.Group();
    for (const x of [-0.08, 0.08]) {
      const goz = new THREE.Mesh(
        new THREE.CircleGeometry(0.035, 20),
        new THREE.MeshStandardMaterial({ color: "#7FE3D2", emissive: "#7FE3D2", emissiveIntensity: 0.9 })
      );
      goz.position.set(x, 0.02, 0.227);
      gozler.add(goz);
    }
    govde.add(gozler);
    const anten = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 8), malzeme("#66707F"));
    anten.position.set(0, 0.28, 0);
    govde.add(anten);
    const isik = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), new THREE.MeshStandardMaterial({ color: "#9AA3B2", emissive: "#000000" }));
    isik.position.set(0, 0.38, 0);
    govde.add(isik);
    // Kulak gibi iki yan çıkıntı: uzaktan bakınca da yüzün hangi yana döndüğü belli olsun.
    for (const x of [-0.27, 0.27]) {
      const kulak = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 16), malzeme("#C0813F", { parlak: 0.4 }));
      kulak.rotation.z = Math.PI / 2;
      kulak.position.set(x, 0, 0);
      govde.add(kulak);
    }
    obj.add(govde);
    const golge = new THREE.Mesh(
      new THREE.CircleGeometry(0.28, 32),
      new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.16, depthWrite: false })
    );
    golge.rotation.x = -Math.PI / 2;
    golge.position.y = 0.012;
    obj.add(golge);
    obj.traverse((c) => (c.userData.ajan = true));
    this.sahne.add(obj);
    this.ajan = { obj, govde, gozler, golge, yol: [], bekle: 1, yon: 0, kirp: 2, isik, ekran };
    this.ajaniKoseyeKoy(plan);
  }

  private ajaniKoseyeKoy(plan: OfisPlani): void {
    const ortak = plan.odalar.find((o) => o.tur === "ortak");
    if (!this.ajan || !ortak) return;
    this.ajan.obj.position.set(ortak.x + 1, ZEMIN_Y, ortak.z + 1);
  }

  private ajaniOynat(dt: number, t: number): void {
    const a = this.ajan;
    const bilgi = this.ajanBilgisi;
    if (!a || !bilgi || !a.obj.visible) return;
    const uyuyor = bilgi.hal === "uyuyor";
    const calisiyor = bilgi.hal === "calisiyor";
    // Uyurken yere yakın, gözleri kısık ve ışığı sönük; çalışırken ışık yeşil
    // yanıp söner, haber varsa turuncu.
    const salinim = Math.sin(t * (calisiyor ? 4 : 2));
    a.govde.position.y = (uyuyor ? 0.42 : 0.78) + salinim * (uyuyor ? 0.01 : 0.04);
    a.golge.scale.setScalar(1 - salinim * 0.08);
    a.kirp -= dt;
    if (a.kirp <= 0) a.kirp = 2.5 + Math.random() * 4;
    a.gozler.scale.y = uyuyor ? 0.15 : a.kirp < 0.12 ? 0.2 : 1;
    const isik = a.isik.material as THREE.MeshStandardMaterial;
    const renk = uyuyor ? "#66707F" : bilgi.haber ? "#E9935F" : calisiyor ? "#2E9E5B" : "#7FE3D2";
    isik.color.set(renk);
    isik.emissive.set(uyuyor ? "#000000" : renk);
    isik.emissiveIntensity = uyuyor ? 0 : calisiyor || bilgi.haber ? 0.5 + 0.5 * Math.abs(Math.sin(t * 3)) : 0.4;
    if (uyuyor) return; // uyuyan robot gezmez
    if (this.ustteki?.tur === "ajan") {
      a.yon = Math.atan2(this.kamera.position.x - a.obj.position.x, this.kamera.position.z - a.obj.position.z);
    } else if (calisiyor) {
      // Çalışırken bir yere gitmez, olduğu yerde "düşünür": yavaşça döner.
      a.yon += dt * 0.6;
    } else this.robotuYurut(a, dt, 0.9);
    const fark = Math.atan2(Math.sin(a.yon - a.obj.rotation.y), Math.cos(a.yon - a.obj.rotation.y));
    a.obj.rotation.y += fark * Math.min(1, dt * 4);
  }

  /** Lio ile ajanın ortak yürüyüşü: yolu izler, varınca bekler, sonra yeni hedef seçer. */
  private robotuYurut(l: LioRobotu, dt: number, hiz: number): void {
    const g = l.obj;
    if (l.yol.length) {
      const h = l.yol[0];
      const dx = h.x - g.position.x;
      const dz = h.z - g.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.05) {
        l.yol.shift();
        if (!l.yol.length) l.bekle = 2 + Math.random() * 5;
      } else {
        const adim = Math.min(d, hiz * dt);
        g.position.x += (dx / d) * adim;
        g.position.z += (dz / d) * adim;
        l.yon = Math.atan2(dx, dz);
      }
    } else if ((l.bekle -= dt) <= 0) {
      l.bekle = 3; // yol bulunamazsa bir süre sonra yeniden dener
      this.robotHedefSec(l);
    }
  }

  // ------------------------------------------------------------ Lio

  /**
   * Lio: maskotun (lio-base.png) yüzen küre hâli — şeftali gövde, üstünde
   * benekler, kapalı gülen gözler. Kişiler gibi yürüyüş ızgarasında yol bulur
   * ama yerden yüksekte süzülür; çoğunlukla ortak alanda, arada odalarda gezer.
   */
  private lioyuKur(plan: OfisPlani): void {
    if (this.lio) {
      // Plan değişti (ör. oda eklendi): Lio ofisin dışında kaldıysa ortak alana döner.
      const p = this.lio.obj.position;
      if (!plan.odalar.some((o) => p.x > o.x && p.x < o.x + o.w && p.z > o.z && p.z < o.z + o.d)) this.lioyuOrtayaKoy(plan);
      this.lio.yol = [];
      return;
    }
    const obj = new THREE.Group();
    const govde = new THREE.Group();
    const kure = new THREE.Mesh(new THREE.SphereGeometry(0.34, 40, 28), new THREE.MeshStandardMaterial({ color: "#F4A98A", roughness: 0.5, emissive: "#F4A98A", emissiveIntensity: 0.12 }));
    kure.castShadow = true;
    govde.add(kure);
    // Maskottaki benekler: gövdeye gömülü küçük renkli kabarcıklar.
    const benekRenk = ["#F6D37A", "#E9935F", "#F2C46B", "#E8865A"];
    for (let i = 0; i < 16; i++) {
      const a = (i * 2.399) % (Math.PI * 2);
      const y = 1 - (2 * (i + 0.5)) / 16;
      const r = Math.sqrt(1 - y * y);
      const yon = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
      // Yüzün (gözlerin) üstüne gelenler atlanır.
      if (yon.z > 0.55 && Math.abs(yon.y) < 0.45) continue;
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.018 + (i % 3) * 0.008, 10, 8), malzeme(benekRenk[i % benekRenk.length], { parlak: 0.5 }));
      b.position.copy(yon.multiplyScalar(0.338));
      govde.add(b);
    }
    // Gözler: kapalı, gülen yaylar (yarım simit), önü +z.
    const gozler = new THREE.Group();
    for (const x of [-0.115, 0.115]) {
      const goz = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.016, 8, 20, Math.PI), malzeme("#5A3A1E", { parlak: 0.3 }));
      goz.position.set(x, 0.045, 0.325);
      goz.rotation.x = -0.12;
      gozler.add(goz);
    }
    govde.add(gozler);
    obj.add(govde);
    // Yerdeki yumuşak gölge: süzülürken büyüyüp küçülür.
    const golge = new THREE.Mesh(
      new THREE.CircleGeometry(0.3, 32),
      new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.16, depthWrite: false })
    );
    golge.rotation.x = -Math.PI / 2;
    golge.position.y = 0.012;
    obj.add(golge);
    obj.traverse((c) => (c.userData.lio = true));
    this.sahne.add(obj);
    this.lio = { obj, govde, gozler, golge, yol: [], bekle: 2, yon: 0, kirp: 3 };
    this.lioyuOrtayaKoy(plan);
  }

  private lioyuOrtayaKoy(plan: OfisPlani): void {
    const ortak = plan.odalar.find((o) => o.tur === "ortak");
    if (!this.lio || !ortak) return;
    this.lio.obj.position.set(ortak.x + ortak.w / 2, ZEMIN_Y, ortak.z + ortak.d / 2);
  }

  private robotHedefSec(l: LioRobotu): void {
    const plan = this.plan;
    const iz = this.izgara();
    if (!l || !plan || !iz) return;
    const ortak = plan.odalar.find((o) => o.tur === "ortak");
    const odalar = plan.odalar.filter((o) => o.tur !== "ortak");
    const oda = Math.random() < 0.65 || !odalar.length ? ortak : odalar[Math.floor(Math.random() * odalar.length)];
    if (!oda) return;
    const hedef = { x: oda.x + 0.8 + Math.random() * Math.max(0, oda.w - 1.6), z: oda.z + 0.8 + Math.random() * Math.max(0, oda.d - 1.6) };
    const yol = yolBul(iz, { x: l.obj.position.x, z: l.obj.position.z }, hedef);
    if (yol) l.yol = yol;
  }

  private lioyuOynat(dt: number, t: number): void {
    const l = this.lio;
    if (!l) return;
    const g = l.obj;
    const salinim = Math.sin(t * 2.2);
    l.govde.position.y = 0.82 + salinim * 0.05;
    l.govde.rotation.z = Math.sin(t * 1.1) * 0.05;
    l.golge.scale.setScalar(1 - salinim * 0.1);
    // Arada göz kırpar.
    l.kirp -= dt;
    if (l.kirp <= 0) l.kirp = 3 + Math.random() * 4;
    l.gozler.scale.y = l.kirp < 0.15 ? 0.25 : 1;
    if (this.ustteki?.tur === "lio") {
      // Üzerine gelinince durur ve kameraya döner.
      l.yon = Math.atan2(this.kamera.position.x - g.position.x, this.kamera.position.z - g.position.z);
    } else this.robotuYurut(l, dt, 0.75);
    const fark = Math.atan2(Math.sin(l.yon - g.rotation.y), Math.cos(l.yon - g.rotation.y));
    g.rotation.y += fark * Math.min(1, dt * 4);
  }

  esyalariKur(esyalar: YerlesikEsya[]): void {
    if (!this.plan) {
      this.bekleyenEsyalar = esyalar;
      return;
    }
    this.yolIzgarasi = null;
    this.bekleyenEsyalar = null;
    const yeni = new Set(esyalar.map((e) => e.id));
    for (const [id, nesne] of this.esyaNesneleri) {
      if (!yeni.has(id)) {
        this.esyaGrubu.remove(nesne);
        this.hareketliler = this.hareketliler.filter((h) => h !== nesne);
        this.esyaNesneleri.delete(id);
      }
    }
    for (const e of esyalar) {
      let n = this.esyaNesneleri.get(e.id);
      if (!n || n.userData.tur !== e.tur) {
        if (n) this.esyaGrubu.remove(n);
        n = esyaModeli(e.tur);
        n.userData.tur = e.tur;
        n.userData.esyaId = e.id;
        n.traverse((c) => (c.userData.esyaId = e.id));
        this.esyaGrubu.add(n);
        this.esyaNesneleri.set(e.id, n);
        if (n.userData.guncelle) this.hareketliler.push(n);
      }
      n.position.set(e.x, ZEMIN_Y, e.z);
      n.rotation.y = (-e.don * Math.PI) / 2;
      n.visible = !(this.yerlestirme?.id === e.id);
    }
    this.esyalar = esyalar;
    // Eskiden yerleştirme duvara bakmıyordu: duvarın içinde kalmış eşya en
    // yakın uygun yerde GÖSTERİLİR. Kayda yazılmaz: plan departmanlar yüklenirken
    // eksik kurulabiliyor, eksik plana göre "düzeltip" kaydetmek eşyayı yanlış
    // odaya taşırdı. Plan her kurulduğunda yeniden bakılır; kullanıcı eşyayı
    // taşıyınca doğru yer zaten kaydedilir.
    for (const e of esyalar) {
      const n = this.esyaNesneleri.get(e.id);
      if (!n || !this.sahneyeCarpiyor(n, e, true)) continue;
      const yer = this.esyaIcinYer(n, e);
      if (yer) n.position.set(yer.x, ZEMIN_Y, yer.z);
    }
  }

  /**
   * Mağaza eşyası (ya da yerleştirme hayaleti) gerçek modeliyle duvara ya da
   * sahnedeki bir zemin eşyasına (masa, kanepe, bitki…) giriyor mu. Katalogdaki
   * kaba ayak izi ve oda dikdörtgenleri yetmiyordu: ortak alanın dikdörtgeni
   * komşu odaları da kapsadığından eşya oda duvarının üstüne konabiliyordu.
   */
  private sahneyeCarpiyor(model: THREE.Object3D, e: Pick<YerlesikEsya, "tur">, yalnizDuvar = false): boolean {
    // Üst gruplar da (hayalet bu karede yeni taşınmış olabilir) güncellensin.
    model.updateWorldMatrix(true, true);
    const kutu = new THREE.Box3().setFromObject(model).expandByScalar(-0.04);
    if (this.duvarKutulari().some((d) => d.intersectsBox(kutu))) return true;
    if (yalnizDuvar || e.tur === "hali") return false;
    return this.zeminEsyalari.some((o) => new THREE.Box3().setFromObject(o).intersectsBox(kutu));
  }

  /** Duvara girmiş mağaza eşyası için en yakın uygun yer (ızgarada, 3 m'ye kadar); yoksa null. */
  private esyaIcinYer(n: THREE.Object3D, e: YerlesikEsya): { x: number; z: number } | null {
    const plan = this.plan;
    if (!plan) return null;
    const eski = n.position.clone();
    for (let r = 1; r <= 12; r++)
      for (let i = 0; i < 8 * r; i++) {
        const a = (i / (8 * r)) * Math.PI * 2;
        const x = izgarayaOturt(e.x + Math.cos(a) * r * 0.25);
        const z = izgarayaOturt(e.z + Math.sin(a) * r * 0.25);
        n.position.set(x, ZEMIN_Y, z);
        if (yerlestirilebilir({ ...e, x, z }, plan, this.esyalar, e.id) && !this.sahneyeCarpiyor(n, e)) {
          n.position.copy(eski);
          return { x, z };
        }
      }
    n.position.copy(eski);
    return null;
  }

  yerlestirmeModu(y: Yerlestirme | null): void {
    if (this.hayalet) {
      this.efektler.remove(this.hayalet);
      this.hayalet = null;
    }
    this.yerlestirme = y;
    for (const [id, n] of this.esyaNesneleri) n.visible = !(y?.id === id);
    if (!y || !this.plan) {
      this.kap.style.cursor = "";
      return;
    }
    const g = new THREE.Group();
    g.add(esyaModeli(y.tur, true));
    this.hayaletZemin = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: marka().basari, transparent: true, opacity: 0.4, depthWrite: false })
    );
    this.hayaletZemin.rotation.x = -Math.PI / 2;
    this.hayaletZemin.position.y = 0.02;
    g.add(this.hayaletZemin);
    g.visible = false;
    this.hayalet = g;
    this.efektler.add(g);
    this.hayaletiGuncelle();
  }

  duzenlemeModu(acik: boolean): void {
    this.duzenleme = acik;
  }

  /** Satın alınan eşyanın yerinde kısa bir konfeti patlaması. */
  kutla(x: number, z: number): void {
    const m = marka();
    const renkler = [m.vurgu, m.ana, m.basari, m.vurguKoyu, "#FFFFFF"];
    for (let i = 0; i < 46; i++) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.07, 0.02),
        new THREE.MeshBasicMaterial({ color: renkler[i % renkler.length], transparent: true })
      );
      m.position.set(x, 0.6, z);
      const a = Math.random() * Math.PI * 2;
      const hiz = 1.2 + Math.random() * 2.2;
      this.efektler.add(m);
      this.parcaciklar.push({ m, h: new THREE.Vector3(Math.cos(a) * hiz * 0.5, 3 + Math.random() * 2.5, Math.sin(a) * hiz * 0.5), omur: 1.6 });
    }
  }

  kamerayiSifirla(): void {
    this.icerdekiOda = null;
    this.kamerayiYerlestir(false);
  }

  /** Dışarıdan (düğmeyle) döndürmek için. */
  dondur(): void {
    if (!this.yerlestirme) return;
    this.yerlestirme.don = (this.yerlestirme.don + 1) % 4;
    this.hayaletiGuncelle();
  }

  /**
   * Mağaza için eşyaların küçük resimleri: her eşya ayrı, küçük bir sahnede
   * çizilip PNG'ye çevrilir. Emoji simgeler hazır modellerin yanında ucuz duruyordu.
   */
  async kucukResimler(turler: EsyaTuru[]): Promise<Partial<Record<EsyaTuru, string>>> {
    await this.hazir;
    const boy = 160;
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setSize(boy, boy);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.outputColorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Scene();
    s.environment = this.sahne.environment;
    s.environmentIntensity = 0.5;
    s.add(new THREE.HemisphereLight("#ffffff", "#cdbfae", 1.4));
    const isik = new THREE.DirectionalLight("#fff1e0", 2.2);
    isik.position.set(-2, 4, 3);
    s.add(isik);
    const kam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
    const sonuc: Partial<Record<EsyaTuru, string>> = {};
    for (const tur of turler) {
      const o = esyaModeli(tur);
      s.add(o);
      const kutuB = new THREE.Box3().setFromObject(o);
      const orta = kutuB.getCenter(new THREE.Vector3());
      const yaricap = kutuB.getBoundingSphere(new THREE.Sphere()).radius;
      kam.left = kam.bottom = -yaricap * 1.08;
      kam.right = kam.top = yaricap * 1.08;
      kam.position.copy(orta).add(new THREE.Vector3(1, 0.9, 1).normalize().multiplyScalar(10));
      kam.lookAt(orta);
      kam.updateProjectionMatrix();
      r.render(s, kam);
      sonuc[tur] = r.domElement.toDataURL("image/png");
      s.remove(o);
    }
    r.dispose();
    return sonuc;
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.gozlemci.disconnect();
    window.removeEventListener("keydown", this.tus);
    const tuval = this.renderer.domElement;
    tuval.removeEventListener("pointermove", this.fareHareket);
    tuval.removeEventListener("pointerdown", this.fareBas);
    this.kap.removeEventListener("pointerdown", this.duzenBas, true);
    window.removeEventListener("pointerup", this.duzenBirak);
    tuval.removeEventListener("pointerup", this.fareBirak);
    tuval.removeEventListener("pointerleave", this.fareCik);
    this.kontrol.dispose();
    for (const k of this.karakterler) k.k3.karisici.stopAllAction();
    this.dokular.forEach((t) => t.dispose());
    this.birlestirici?.dispose();
    this.renderer.dispose();
    tuval.remove();
    this.etiketRenderer.domElement.remove();
  }

  // ------------------------------------------------------------ kurulum

  private boyutla(): void {
    const { clientWidth: w, clientHeight: h } = this.kap;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.etiketRenderer.setSize(w, h);
    this.birlestirici?.setSize(w, h);
    this.aoGecisi?.setSize(w, h);
    this.olcekle();
  }

  private olcekle(): void {
    const { clientWidth: w, clientHeight: h } = this.kap;
    this.kamera.aspect = w / h;
    this.kamera.updateProjectionMatrix();
  }

  /** Bakış yönü: hedeften kameraya giden birim vektör. */
  private bakis(): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(KAMERA_YATAY) * Math.cos(KAMERA_EGIM), Math.sin(KAMERA_EGIM), Math.cos(KAMERA_YATAY) * Math.cos(KAMERA_EGIM));
  }

  /**
   * Ofisin bütün köşeleri kadrajın içinde kalacak en yakın uzaklık (ikili arama).
   * Dar ekranda (telefon) ofisin tamamı karınca kadar kalacağı için yakından başlanır.
   */
  private kadrajla(
    merkez: THREE.Vector3,
    kutuK?: { x: number; z: number; w: number; d: number },
    sinir = this.kap.clientWidth < 600 ? 1.6 : 1.0,
    yon = this.bakis()
  ): number {
    const p = this.plan!;
    const k0 = kutuK ?? { x: 0, z: 0, w: p.genislik, d: p.derinlik };
    const koseler: THREE.Vector3[] = [];
    for (const x of [k0.x, k0.x + k0.w]) for (const y of [0, DUVAR_YUKSEKLIK]) for (const z of [k0.z, k0.z + k0.d]) koseler.push(new THREE.Vector3(x, y, z));
    const kayit = { p: this.kamera.position.clone(), q: this.kamera.quaternion.clone() };
    let alt = 2;
    let ust = 300;
    for (let i = 0; i < 24; i++) {
      const d = (alt + ust) / 2;
      this.kamera.position.copy(merkez).addScaledVector(yon, d);
      this.kamera.lookAt(merkez);
      this.kamera.updateMatrixWorld(true);
      const sigar = koseler.every((k) => {
        const v = k.clone().project(this.kamera);
        return Math.abs(v.x) <= sinir && Math.abs(v.y) <= sinir;
      });
      if (sigar) ust = d;
      else alt = d;
    }
    // Arama kamerayı oynattı; çağıran kendi konumunu kuracak ama araya bir kare
    // girerse sıçrama görünmesin.
    this.kamera.position.copy(kayit.p);
    this.kamera.quaternion.copy(kayit.q);
    return ust;
  }

  /** Kamerayı yumuşakça bir hedefe ve uzaklığa taşır. */
  private gecisBaslat(hedef: THREE.Vector3, uzaklik: number, yon = this.bakis()): void {
    this.girisAnimasyonu = 0;
    this.gecis = {
      t: 0,
      hedefBas: this.kontrol.target.clone(),
      hedefSon: hedef.clone(),
      konumBas: this.kamera.position.clone(),
      konumSon: hedef.clone().addScaledVector(yon, uzaklik),
    };
  }

  /** Odaya "girer": kamera odanın üstüne iner, oda kadrajı doldurur. */
  odayaGir(odaId: string): void {
    const oda = this.plan?.odalar.find((o) => o.id === odaId);
    if (!oda) return;
    const merkez = new THREE.Vector3(oda.x + oda.w / 2, 0.4, oda.z + oda.d / 2);
    // Odanın içine "girer gibi": güneydoğudan, alçak (~38°) ve yakın bir açı —
    // masalar, sandalyeler ve arka duvar karşıdan görünsün. Kadraj odanın
    // kendisine göre; oda ekranı biraz taşabilir, içerisi dolu görünsün.
    const egim = 0.66;
    const yatay = 0.5;
    const yon = new THREE.Vector3(Math.sin(yatay) * Math.cos(egim), Math.sin(egim), Math.cos(yatay) * Math.cos(egim));
    merkez.y = 0.7;
    const d = this.kadrajla(merkez, oda, this.kap.clientWidth < 600 ? 1.15 : 1.0, yon) * 0.92;
    this.gecisBaslat(merkez, d, yon);
    this.icerdekiOda = odaId;
  }

  /** Odadan çıkıp bütün ofise döner. */
  odadanCik(): void {
    if (!this.plan) return;
    this.icerdekiOda = null;
    const merkez = new THREE.Vector3(this.plan.genislik / 2, 0.4, this.plan.derinlik / 2);
    this.gecisBaslat(merkez, this.uzaklik);
  }

  private kamerayiYerlestir(animasyon: boolean): void {
    if (!this.plan) return;
    this.olcekle();
    const merkez = new THREE.Vector3(this.plan.genislik / 2, 0.4, this.plan.derinlik / 2);
    this.uzaklik = this.kadrajla(merkez);
    this.kamera.position.copy(merkez).addScaledVector(this.bakis(), this.uzaklik * (animasyon ? 1.35 : 1));
    this.kontrol.target.copy(merkez);
    this.kontrol.minDistance = this.uzaklik * 0.22;
    this.kontrol.maxDistance = this.uzaklik * 1.6;
    this.kontrol.minAzimuthAngle = KAMERA_YATAY - 0.75;
    this.kontrol.maxAzimuthAngle = KAMERA_YATAY + 0.75;
    this.kontrol.update();
    if (animasyon) this.girisAnimasyonu = 1;

    const r = Math.max(this.plan.genislik, this.plan.derinlik) * 0.75 + 2;
    this.gunes.position.set(merkez.x - 9, 22, merkez.z - 6);
    this.gunes.target.position.copy(merkez);
    const k = this.gunes.shadow.camera;
    k.left = -r;
    k.right = r;
    k.top = r;
    k.bottom = -r;
    k.near = 1;
    k.far = 70;
    k.updateProjectionMatrix();
  }

  private yapiyiKur(plan: OfisPlani): void {
    this.yapi.traverse((o) => {
      if (o instanceof CSS2DObject) o.element.remove();
    });
    this.yapi.clear();
    this.dokular.forEach((t) => t.dispose());
    this.dokular = [];
    this.zeminler = [];
    this.modulNesneleri.clear();
    this.nesneler.clear();
    this.zeminEsyalari = [];
    this.yolIzgarasi = null;
    this.hareketliler = this.hareketliler.filter((h) => this.esyaGrubu.children.includes(h));
    const { genislik: G, derinlik: D } = plan;

    // Ofis doğrudan sahnenin zemininde durur: altındaki beyaz taban levhası
    // kaldırıldı (basamaklı dış hatta odaların arasında beyaz boşluklar olarak
    // görünüyordu). Yalnızca görünmez bir gölge düzlemi kalır.
    const golge = new THREE.Mesh(new THREE.PlaneGeometry(G * 3, D * 3), new THREE.ShadowMaterial({ opacity: 0.12 }));
    golge.rotation.x = -Math.PI / 2;
    golge.position.set(G / 2, 0.001, D / 2);
    golge.receiveShadow = true;
    this.yapi.add(golge);

    const parke = parkeDokusu("#D2A574", "rgba(110,72,40,0.28)");
    const acikParke = parkeDokusu("#DDBA8E", "rgba(110,72,40,0.22)");
    this.dokular.push(parke, acikParke);

    for (const oda of plan.odalar) {
      let zm: THREE.MeshStandardMaterial;
      if (oda.tur === "toplanti") zm = new THREE.MeshStandardMaterial({ color: "#D9D3EE", roughness: 0.95 });
      else {
        const doku = (oda.tur === "ortak" || oda.tur === "giris" || oda.tur === "koridor" ? acikParke : parke).clone();
        doku.repeat.set(oda.w / 3.2, oda.d / 3.2);
        doku.needsUpdate = true;
        this.dokular.push(doku);
        zm = new THREE.MeshStandardMaterial({ map: doku, roughness: 0.7 });
      }
      const zemin = new THREE.Mesh(new THREE.BoxGeometry(oda.w - 0.02, 0.06, oda.d - 0.02), zm);
      zemin.position.set(oda.x + oda.w / 2, 0.03, oda.z + oda.d / 2);
      zemin.receiveShadow = true;
      zemin.userData.odaId = oda.id;
      this.yapi.add(zemin);
      this.zeminler.push(zemin);
    }

    for (const d of plan.duvarlar) this.duvarCiz(d);
    for (const oda of plan.odalar) this.odayiDose(oda, plan);
  }

  private duvarCiz(d: Duvar): void {
    const yatay = d.z1 === d.z2;
    const bas = yatay ? d.x1 : d.z1;
    const son = yatay ? d.x2 : d.z2;
    // Kapı boşluğu duvarı ikiye böler.
    const parcalar: [number, number][] = d.kapi
      ? [
          [bas, d.kapi.orta - d.kapi.genislik / 2],
          [d.kapi.orta + d.kapi.genislik / 2, son],
        ]
      : [[bas, son]];
    const sabit = yatay ? d.z1 : d.x1;
    for (const [a, b] of parcalar) {
      const uz = b - a;
      if (uz <= 0.05) continue;
      const orta = (a + b) / 2;
      const yer = (y: number, m: THREE.Object3D) => {
        m.position.set(yatay ? orta : sabit, y, yatay ? sabit : orta);
        this.yapi.add(m);
      };
      if (d.tur === "kalin") {
        yer(DUVAR_YUKSEKLIK / 2, kutu(yatay ? uz + 0.16 : 0.16, DUVAR_YUKSEKLIK, yatay ? 0.16 : uz + 0.16, malzeme("#F2EEE8"), 0.02));
        // Üst kenardaki koyu şerit: kesit görünümü (referanstaki "maket" hissi).
        yer(DUVAR_YUKSEKLIK + 0.012, kutu(yatay ? uz + 0.16 : 0.16, 0.025, yatay ? 0.16 : uz + 0.16, malzeme("#A69D92"), 0.004));
        // Süpürgelik
        yer(0.1, kutu(yatay ? uz + 0.17 : 0.17, 0.12, yatay ? 0.17 : uz + 0.17, malzeme("#E2DBD2"), 0.01));
      } else if (d.tur === "alcak") {
        yer(0.2, kutu(yatay ? uz + 0.14 : 0.14, 0.4, yatay ? 0.14 : uz + 0.14, malzeme("#ECE7E0"), 0.03));
        yer(0.41, kutu(yatay ? uz + 0.14 : 0.14, 0.02, yatay ? 0.14 : uz + 0.14, malzeme("#A69D92"), 0.004));
      } else {
        const cam = new THREE.Mesh(
          new THREE.BoxGeometry(yatay ? uz : 0.03, CAM_YUKSEKLIK, yatay ? 0.03 : uz),
          malzeme("#D4E6F2", { opak: 0.18, parlak: 0.95 })
        );
        yer(CAM_YUKSEKLIK / 2, cam);
        const cerceve = malzeme("#F7F7F9", { parlak: 0.4 });
        for (const y of [0.04, CAM_YUKSEKLIK]) yer(y, kutu(yatay ? uz : 0.05, 0.05, yatay ? 0.05 : uz, cerceve, 0.01));
        // Dikmeler seyrek: sık dikme camı ızgaraya çevirip sahneyi kalabalıklaştırıyordu.
        const adet = Math.max(1, Math.round(uz / 2.6));
        for (let i = 0; i <= adet; i++) {
          const t = a + (uz * i) / adet;
          const c = kutu(0.045, CAM_YUKSEKLIK, 0.045, cerceve, 0.01);
          c.position.set(yatay ? t : sabit, CAM_YUKSEKLIK / 2, yatay ? sabit : t);
          this.yapi.add(c);
        }
      }
    }
  }

  /** Bir modeli zemine koyar; `y` duvara asılı eşyalar için. */
  private koy(ad: VarlikAdi | THREE.Object3D, x: number, z: number, don = 0, y = ZEMIN_Y): THREE.Object3D {
    const o = typeof ad === "string" ? varlik(ad) : ad;
    o.position.set(x, y, z);
    o.rotation.y = don;
    this.yapi.add(o);
    if (o.userData.guncelle) this.hareketliler.push(o);
    const hali = typeof ad === "string" ? ad.startsWith("hali") : !!ad.userData.hali;
    if (y <= ZEMIN_Y + 0.05 && !hali) this.zeminEsyalari.push(o);
    return o;
  }

  /**
   * Düzenlenebilir bir nesne koyar: dekor nesnesine odanın kayıtlı düzeni
   * uygulanır (taşınmış/döndürülmüş ya da kaldırılmış). Masa ve modül
   * eşyalarının düzeni planda zaten uygulanmıştır (duzeniUygula).
   */
  private nesneKoy(oda: OfisOdasi, nesneId: string, ad: VarlikAdi | THREE.Object3D, x: number, z: number, don = 0, y = ZEMIN_Y): THREE.Object3D | null {
    const serbestNesne = nesneId.startsWith("dekor:") || nesneId.startsWith("ek:");
    if (serbestNesne) {
      const d = oda.duzen?.nesneler[nesneId];
      if (d?.gizli) return null;
      if (d) {
        // Ortak alana çıkarılmış olabilir: bulunduğu bölgenin içine kırpılır.
        const b = this.nesneBolgesi(oda, nesneId, oda.x + d.dx, oda.z + d.dz);
        x = b.x + Math.min(b.w, Math.max(0, oda.x + d.dx - b.x));
        z = b.z + Math.min(b.d, Math.max(0, oda.z + d.dz - b.z));
        don = d.don;
      }
    }
    const o = this.koy(ad, x, z, don, y);
    // Ortak alana devredilirse aynı model "ek:" olarak yeniden kurulabilsin diye.
    if (typeof ad === "string") o.userData.model = ad;
    // Zemindeki dekor duvarın içinde kalsın: kayıtlı (eski ya da elle bozulmuş)
    // olanlar da, varsayılan yerindekiler de — köşe bitkilerinin yaprakları
    // duvara giriyordu. Duvara asılı olanlar (tahta, televizyon) dokunulmaz.
    if (serbestNesne && y <= ZEMIN_Y + 0.05)
      this.duvaraSigdir(o, this.nesneBolgesi(oda, nesneId, o.position.x, o.position.z));
    const anahtar = `${oda.id}|${nesneId}`;
    o.traverse((c) => (c.userData.nesne = anahtar));
    this.nesneler.set(anahtar, { obj: o, oda, nesneId });
    return o;
  }

  private odayiDose(oda: OfisOdasi, plan: OfisPlani): void {
    const cx = oda.x + oda.w / 2;
    const cz = oda.z + oda.d / 2;
    // Odanın "dış" yönü kapının tersi: kitaplık ve köşe bitkileri o duvara yaslanır.
    const dx = -oda.kapiYonu.x;
    const dz = -oda.kapiYonu.z;
    const yatayKapi = dz !== 0; // kapı kuzey/güney duvarında
    /** Dış duvarın iki köşesine yakın noktalar. */
    const koseler: [number, number][] = yatayKapi
      ? [
          [oda.x + 0.5, dz < 0 ? oda.z + 0.5 : oda.z + oda.d - 0.5],
          [oda.x + oda.w - 0.5, dz < 0 ? oda.z + 0.5 : oda.z + oda.d - 0.5],
        ]
      : [
          [dx < 0 ? oda.x + 0.5 : oda.x + oda.w - 0.5, oda.z + 0.5],
          [dx < 0 ? oda.x + 0.5 : oda.x + oda.w - 0.5, oda.z + oda.d - 0.5],
        ];
    // Duvara yaslanan eşyanın dönüşü: önü odanın içine (kapıya doğru) baksın.
    const iceDonus = Math.atan2(-dx, -dz);

    if (oda.tur === "departman") {
      for (const m of oda.masalar) {
        if (m.patron) {
          this.nesneKoy(oda, `masa-${oda.masalar.indexOf(m)}`, patronMasasi(), m.x, m.z, m.don);
          continue;
        }
        const g = new THREE.Group();
        // Kenney modellerinin önü +z; kişi −z'de oturup +z'ye bakacağı için masa ve ekran çevrilir.
        const masaO = varlik("masa");
        masaO.rotation.y = Math.PI;
        g.add(masaO);
        const ekran = varlik("ekran");
        ekran.position.set(0, 0.645, 0.2);
        ekran.rotation.y = Math.PI;
        g.add(ekran);
        const klavye = varlik("klavye");
        klavye.position.set(0, 0.645, -0.12);
        klavye.rotation.y = Math.PI;
        g.add(klavye);
        const fare = varlik("fare");
        fare.position.set(0.32, 0.645, -0.12);
        g.add(fare);
        const sandalye = varlik("ofisSandalyesi");
        sandalye.position.set(0, 0, -KOLTUK_UZAKLIK);
        g.add(sandalye);
        this.nesneKoy(oda, `masa-${oda.masalar.indexOf(m)}`, g, m.x, m.z, m.don);
      }
      // Köşelerde biri büyük bitki (odadan odaya değişir), biri saksı.
      const buyuk = (["inceMonstera", "salonBitkisi", "monstera", "buyukKaktus"] as const)[oda.masalar.length % 4];
      this.nesneKoy(oda, "dekor:kose-0", buyuk, koseler[0][0], koseler[0][1]);
      this.nesneKoy(oda, "dekor:kose-1", "saksi", koseler[1][0], koseler[1][1]);
      // Modül eşyaları duvar boyunca (yerleri planda). Modülü olan odada genel
      // tahta/kitaplık dekoru konmaz: duvarlar modüllere ayrılır.
      for (const y of oda.moduller) {
        const tur = modulEsyasiTuru(y.key);
        if (!tur) continue;
        const o = modulEsyasi(tur, { ad: this.modulAdlari.get(y.key), bilgi: this.istasyonBilgileri.get(y.key) });
        this.nesneKoy(oda, `modul:${y.key}`, o, y.x, y.z, y.don);
        o.traverse((c) => (c.userData.modul = `${oda.id}|${y.key}`));
        this.modulNesneleri.set(`${oda.id}|${y.key}`, o);
      }
      // Dış duvar boyunca yer paylaşımı: tahta duvarın bir yanında, kitaplık öbür
      // yanında — ikisi aynı noktaya gelince tahta kitaplığın üstüne biniyordu.
      // Yalnızca yüksek dış duvara (kuzey/batı) bir şey asılır; cam duvara asılmaz.
      if (oda.moduller.length) {
        // modül eşyaları duvarları kullanıyor
      } else if (dz < 0) {
        // Kuzey duvarı (üst sıra)
        this.nesneKoy(oda, "dekor:tahta", tahta(), oda.x + oda.w * 0.32, oda.z + 0.11, 0, 1.5);
        this.nesneKoy(oda, "dekor:kitaplik", "kitaplik", oda.x + oda.w * 0.74, oda.z + 0.3, 0);
      } else if (dx < 0) {
        // Batı duvarı (sol sütun)
        this.nesneKoy(oda, "dekor:tahta", tahta(), oda.x + 0.11, oda.z + oda.d * 0.32, Math.PI / 2, 1.5);
        this.nesneKoy(oda, "dekor:kitaplik", "kitaplik", oda.x + 0.3, oda.z + oda.d * 0.74, Math.PI / 2);
      } else if (dx > 0) {
        // Doğu cam duvarı (sağ sütun): yalnızca kitaplık, duvara asılı bir şey yok.
        this.nesneKoy(oda, "dekor:kitaplik", "kitaplik", oda.x + oda.w - 0.3, oda.z + oda.d * 0.7, -Math.PI / 2);
      }
      // Kapının iç yanında askılık ve küçük bitki.
      const ix = oda.kapi.x - oda.kapiYonu.x * 0.45;
      const iz = oda.kapi.z - oda.kapiYonu.z * 0.45;
      if (yatayKapi) {
        this.nesneKoy(oda, "dekor:askilik", "askilik", ix - 1.1, iz);
        this.nesneKoy(oda, "dekor:kapi-bitkisi", "bitkiKucuk2", ix + 1.1, iz);
      } else {
        this.nesneKoy(oda, "dekor:askilik", "askilik", ix, iz - 1.1);
        this.nesneKoy(oda, "dekor:kapi-bitkisi", "bitkiKucuk2", ix, iz + 1.1);
      }
      const tema = this.odaTemalari.get(oda.id) as IsTemasi | undefined;
      if (tema) this.temayiDose(oda, tema, iceDonus);
    } else if (oda.tur === "toplanti") {
      // Masa ve altı sandalye tek parça: düzenleyicide birlikte taşınır.
      const grup = new THREE.Group();
      for (const x of [-0.84, 0.84]) {
        const t = varlik("toplantiMasasi");
        t.position.x = x;
        grup.add(t);
      }
      for (let i = 0; i < 3; i++)
        for (const yon of [-1, 1]) {
          const s2 = varlik("toplantiSandalyesi");
          s2.position.set(-1.1 + i * 1.1, 0, yon * 0.85);
          s2.rotation.y = yon > 0 ? Math.PI : 0;
          grup.add(s2);
        }
      this.nesneKoy(oda, TOPLANTI_MASASI, grup, cx, cz);
      if (oda.kapiYonu.z === 1) this.nesneKoy(oda, "dekor:tv", "tv", cx, oda.z + 0.14, 0, 1.0);
      this.nesneKoy(oda, "dekor:kose-0", "monstera", koseler[0][0] + 0.2, koseler[0][1] + 0.2);
      this.nesneKoy(oda, "dekor:kose-1", "salonBitkisi", koseler[1][0], koseler[1][1]);
    } else if (oda.tur === "teras") {
      this.koy("haliOval", cx, cz);
      this.koy("koltuk", cx - 0.8, cz - 0.3, 0.35);
      this.koy("koltuk", cx + 0.9, cz - 0.2, -0.35);
      this.koy("yanMasa", cx, cz + 0.6);
      for (const [x, z] of koseler) this.koy("saksi", x, z);
    } else if (oda.tur === "ortak") {
      // Referanstaki oturma köşesi: halı, karşılıklı kanepeler, sehpa, yanda koltuk.
      // Ortak alanın her eşyası düzenleyicide taşınabilir (yalnızca şirket sahibi;
      // bkz. odaDuzenleyebilir). Masa/sehpa üstündekiler altındakiyle bir grup:
      // sehpa taşınınca üstündeki saksı havada kalmasın.
      const { x: ox, z: oz } = plan.oturma;
      this.nesneKoy(oda, "dekor:ortak-hali", "haliCizgili", ox, oz);
      this.nesneKoy(oda, "dekor:ortak-kanepe", "kanepe", ox, oz - 1.05);
      this.nesneKoy(oda, "dekor:ortak-koltuk", "koltuk", ox - 1.55, oz + 0.75, 0.6);
      const sehpa = new THREE.Group();
      sehpa.add(varlik("alcakSehpa"));
      const sehpaBitkisi = varlik("bitkiKucuk3");
      sehpaBitkisi.position.set(-0.3, 0.31, 0);
      sehpa.add(sehpaBitkisi);
      this.nesneKoy(oda, "dekor:ortak-sehpa", sehpa, ox, oz + 0.15);
      this.nesneKoy(oda, "dekor:ortak-lamba", "ayakliLamba", ox + 1.8, oz - 1.1);
      this.nesneKoy(oda, "dekor:ortak-saksi", "saksi", ox - 1.8, oz - 1.1);
      // Batı duvarında kahve köşesi, köşelerde büyük bitkiler.
      this.nesneKoy(oda, "dekor:kahve-kosesi", esyaModeli("kahve"), plan.kahve.x, plan.kahve.z, plan.kahve.don);
      this.nesneKoy(oda, "dekor:ortak-ince-monstera", "inceMonstera", oda.x + oda.w - 0.6, oda.z + 0.6);
      this.nesneKoy(oda, "dekor:ortak-kaktus", "buyukKaktus", oda.x + oda.w - 0.6, oda.z + oda.d - 0.6);
      this.nesneKoy(oda, "dekor:ortak-monstera", "monstera", oda.x + 0.75, oda.z + oda.d - 0.75);
      // Büyük ofiste ortak alan boş bir meydana dönüyordu: plandaki ek köşeler döşenir.
      plan.koseler.forEach((k, i) => {
        if (k.tur === "oturma") {
          this.nesneKoy(oda, `dekor:kose-${i}-hali`, "haliOval", k.x, k.z);
          this.nesneKoy(oda, `dekor:kose-${i}-koltuk-a`, "koltuk", k.x - 0.85, k.z, Math.PI / 2 - 0.3);
          this.nesneKoy(oda, `dekor:kose-${i}-koltuk-b`, "koltuk", k.x + 0.85, k.z, -Math.PI / 2 + 0.3);
          this.nesneKoy(oda, `dekor:kose-${i}-yan-masa`, "yanMasa", k.x, k.z - 0.15);
          this.nesneKoy(oda, `dekor:kose-agaci-${i}`, "agacBuyuk", k.x, k.z - 1.2);
        } else {
          // Çalışma masası, sandalyeleri ve üstündekiler tek parça (toplantı odasındaki gibi).
          const grup = new THREE.Group();
          for (const x of [-0.84, 0.84]) {
            const t = varlik("toplantiMasasi");
            t.position.x = x;
            grup.add(t);
          }
          for (let s2i = 0; s2i < 3; s2i++)
            for (const yon of [-1, 1]) {
              const s2 = varlik("toplantiSandalyesi");
              s2.position.set(-1.1 + s2i * 1.1, 0, yon * 0.85);
              s2.rotation.y = yon > 0 ? Math.PI : 0;
              grup.add(s2);
            }
          const laptop = varlik("laptop");
          laptop.position.set(-0.6, 0.66, -0.15);
          grup.add(laptop);
          const bitki = varlik("bitkiKucuk1");
          bitki.position.set(0.9, 0.66, 0);
          grup.add(bitki);
          this.nesneKoy(oda, `dekor:kose-${i}-masa`, grup, k.x, k.z);
        }
      });
    } else if (oda.tur === "giris") {
      // Giriş: "projelio" paspası, iki yanında bitki.
      const doku = paspasDokusu();
      this.dokular.push(doku);
      const koyu = malzeme("#4A4656");
      const paspas = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.025, 1.2), [
        koyu,
        koyu,
        new THREE.MeshStandardMaterial({ map: doku, roughness: 0.9 }),
        koyu,
        koyu,
        koyu,
      ]);
      paspas.position.set(plan.giris.x, ZEMIN_Y + 0.015, plan.giris.z - 1.4);
      paspas.rotation.y = -0.18;
      paspas.receiveShadow = true;
      this.yapi.add(paspas);
      // Girişin iki yanındaki bitkiler ortak alanın düzenine aittir (orada taşınır).
      const ortakOda = plan.odalar.find((o) => o.tur === "ortak");
      if (ortakOda) {
        this.nesneKoy(ortakOda, "dekor:giris-bitki-0", "salonBitkisi", plan.giris.x - 1.6, plan.giris.z - 0.5);
        this.nesneKoy(ortakOda, "dekor:giris-bitki-1", "inceMonstera", plan.giris.x + 1.6, plan.giris.z - 0.5);
      } else {
        this.koy("salonBitkisi", plan.giris.x - 1.6, plan.giris.z - 0.5);
        this.koy("inceMonstera", plan.giris.x + 1.6, plan.giris.z - 0.5);
      }
    }
    // Düzenleyicide sonradan eklenen eşyalar ("ek:…", türleri düzende yazılı).
    // Tür ya mağaza kataloğundan ya da (odadan ortak alana devredilen dekorda) hazır model adı.
    for (const [id, d] of Object.entries(oda.duzen?.nesneler ?? {})) {
      if (!id.startsWith("ek:") || d.gizli || !d.tur) continue;
      const katalog = katalogEsyasi(d.tur as EsyaTuru);
      if (!katalog && !varlikVar(d.tur)) continue;
      const o = katalog ? esyaModeli(d.tur as EsyaTuru) : varlik(d.tur as VarlikAdi);
      if (d.tur === "hali") o.userData.hali = true;
      o.userData.model = d.tur;
      this.nesneKoy(oda, id, o, oda.x + d.dx, oda.z + d.dz, d.don);
    }
  }

  /** Odaların görünen adları (düzenleyicideki uyarılarda). */
  private etiketAdlari: Record<string, string> = {};

  private etiketleriKur(plan: OfisPlani, etiketler: Record<string, OdaEtiketi>): void {
    this.etiketAdlari = Object.fromEntries(Object.entries(etiketler).map(([id, e]) => [id, e.ad]));
    this.yapi.children.filter((c) => c instanceof CSS2DObject).forEach((c) => {
      (c as CSS2DObject).element.remove();
      this.yapi.remove(c);
    });
    for (const oda of plan.odalar) {
      const e = etiketler[oda.id];
      if (!e) continue;
      const div = document.createElement("button");
      div.type = "button";
      div.className = `of-etiket t-${e.ton}${e.durum && e.durum !== "ok" ? ` durum-${e.durum}` : ""}${e.kapak ? " kapakli" : " seffaf"}`;
      div.setAttribute("aria-label", `${e.ad}: ${e.alt}`);
      div.innerHTML = `<span class="of-e-ikon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${IKONLAR[e.ikon] ?? IKONLAR.bina}</svg></span><span class="of-e-yazi"><b></b><small></small></span>`;
      // Departmanın kapağı simgenin yerine geçer (uygulamadaki departman kartıyla aynı görsel).
      if (e.kapak) (div.querySelector(".of-e-ikon") as HTMLElement).style.background = e.kapak;
      (div.querySelector("b") as HTMLElement).textContent = e.ad;
      (div.querySelector("small") as HTMLElement).textContent = e.alt;
      if (e.durum && e.durum !== "ok") {
        const n = document.createElement("i");
        n.className = `of-e-nokta ${e.durum}`;
        div.querySelector("b")!.appendChild(n);
      }
      div.addEventListener("click", () => this.onOdaTikla?.(oda.id));
      div.tabIndex = -1;
      div.addEventListener("pointerdown", (ev) => ev.stopPropagation());
      // Düğme odak alınca tarayıcı sayfayı ona kaydırıyordu; odak sahnede kalsın.
      div.addEventListener("mousedown", (ev) => ev.preventDefault());
      // CSS2DRenderer etiketi `transform` ile konumlar; belirme animasyonu ve
      // hover da transform kullandığı için ikisi aynı öğede çakışıp etiketleri
      // köşeye yığıyordu. Konum dıştaki kapta, animasyon içteki düğmede.
      const kap = document.createElement("div");
      kap.className = "of-etiket-kap";
      kap.appendChild(div);
      const o = new CSS2DObject(kap);
      // Ortak alanın etiketi oturma grubunun üstünde, odalarınki odanın ortasında.
      if (oda.tur === "ortak") o.position.set(plan.oturma.x, 1.7, plan.oturma.z);
      else o.position.set(oda.x + oda.w / 2, DUVAR_YUKSEKLIK + 0.4, oda.z + oda.d / 2);
      this.yapi.add(o);
    }
  }

  private async kisileriKur(plan: OfisPlani, kisiler: SahneKisisi[], sira: number): Promise<void> {
    const eski = new Map(this.karakterler.map((k) => [k.veri.id + "|" + k.veri.odaId, k]));
    const doluluk = new Map<string, number>();
    const patronDolu = new Set<string>();
    const yerler: { v: SahneKisisi; oda: OfisOdasi; koltuk: THREE.Vector3; koltukYonu: number; masaNo: number; ayakta?: boolean }[] = [];
    const istasyonda = new Map<string, number>();
    for (const v of kisiler) {
      const oda = plan.odalar.find((o) => o.id === v.odaId);
      if (!oda) continue;
      // Stüdyo: üzerinde çalıştığı projenin istasyonu odadaysa onun önünde,
      // yüzü panoya dönük ayakta durur (aynı istasyondakiler yan yana).
      const ist = v.istasyon ? this.modulNesneleri.get(`${oda.id}|${v.istasyon}`) : undefined;
      if (ist) {
        const sira = istasyonda.get(v.istasyon!) ?? 0;
        istasyonda.set(v.istasyon!, sira + 1);
        const don = ist.rotation.y;
        const yan = (sira % 2 === 0 ? 1 : -1) * Math.ceil(sira / 2) * 0.5;
        yerler.push({
          v,
          oda,
          koltuk: new THREE.Vector3(
            ist.position.x + Math.sin(don) * 0.8 + Math.cos(don) * yan,
            ZEMIN_Y,
            ist.position.z + Math.cos(don) * 0.8 - Math.sin(don) * yan
          ),
          koltukYonu: don + Math.PI,
          masaNo: -1,
          ayakta: true,
        });
        continue;
      }
      // Yönetici (ilki) yönetici masasına; diğerleri sırayla ekip masalarına.
      const patronNo = oda.masalar.findIndex((m) => m.patron);
      let s: number;
      if (v.yonetici && patronNo >= 0 && !patronDolu.has(oda.id)) {
        s = patronNo;
        patronDolu.add(oda.id);
      } else {
        s = doluluk.get(oda.id) ?? 0;
        if (oda.masalar[s]?.patron) continue; // ekip masaları doldu
        doluluk.set(oda.id, s + 1);
      }
      const masaYeri = oda.masalar[s];
      if (!masaYeri) continue; // masaya sığmayan kişi çizilmez, etikette "+N" yazar
      const uz = koltukUzakligi(masaYeri);
      yerler.push({
        v,
        oda,
        // Sandalye masanın yerel −z'sinde; masa döndürülmüş olabilir.
        koltuk: new THREE.Vector3(masaYeri.x - uz * Math.sin(masaYeri.don), ZEMIN_Y, masaYeri.z - uz * Math.cos(masaYeri.don)),
        koltukYonu: masaYeri.don,
        masaNo: s,
      });
    }
    const yeni = await Promise.all(
      yerler.map(async ({ v, oda, koltuk, koltukYonu, masaNo, ayakta }): Promise<Karakter | null> => {
        const anahtar = v.id + "|" + v.odaId;
        const onceki = eski.get(anahtar);
        if (onceki) {
          eski.delete(anahtar);
          this.halkaRengi(onceki.halka, v);
          return { ...onceki, veri: v, koltuk, koltukYonu, masaNo, oda, ayakta };
        }
        let k3: Karakter3D;
        try {
          k3 = await karakter(adSayisi(v.ad));
        } catch {
          return null;
        }
        const halka = new THREE.Mesh(
          new THREE.RingGeometry(0.3, 0.38, 40),
          new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, depthWrite: false })
        );
        halka.rotation.x = -Math.PI / 2;
        halka.position.y = 0.015;
        this.halkaRengi(halka, v);
        k3.nesne.add(halka);
        k3.nesne.traverse((c) => (c.userData.kisiId = v.id));
        k3.nesne.position.copy(koltuk);
        k3.nesne.rotation.y = koltukYonu;
        // Yeni gelen kişi küçükten büyüyerek belirir.
        k3.nesne.scale.setScalar(0.01);
        const k: Karakter = {
          veri: v,
          k3,
          halka,
          koltuk,
          koltukYonu,
          masaNo,
          ayakta,
          oda,
          durum: "oturuyor",
          yol: [],
          sayac: aralik(GEZINME.ilk),
          adim: 0,
          donus: false,
          eylem: null,
          kahvede: false,
          yolVer: 0,
          kacis: new THREE.Vector3(),
        };
        this.eylemeGec(k, "Idle_Neutral", 0);
        // Herkes aynı anda nefes almasın.
        k3.karisici.update(Math.random() * 3);
        return k;
      })
    );
    if (sira !== this.kurulumSirasi) return;
    // Artık olmayan kişiler (departmandan ayrılan) sahneden çıkar.
    for (const k of eski.values()) {
      k.k3.karisici.stopAllAction();
      this.kisiGrubu.remove(k.k3.nesne);
    }
    this.ustteyiAyarla(null);
    this.karakterler = yeni.filter((k): k is Karakter => !!k);
    for (const k of this.karakterler) if (k.k3.nesne.parent !== this.kisiGrubu) this.kisiGrubu.add(k.k3.nesne);
  }

  private halkaRengi(halka: THREE.Mesh, v: SahneKisisi): void {
    const m = halka.material as THREE.MeshBasicMaterial;
    const mk = marka();
    const renk = v.ben ? mk.vurgu : v.cevrimici ? mk.basari : null;
    m.color.set(renk ?? "#ffffff");
    m.opacity = renk ? 0.9 : 0;
  }

  private eylemeGec(k: Karakter, ad: Eylem, gecis = 0.3): void {
    if (k.eylem === ad) return;
    const yeni = k.k3.eylemler[ad] ?? k.k3.eylemler.Idle;
    if (!yeni) return;
    const eski = k.eylem ? k.k3.eylemler[k.eylem] : undefined;
    yeni.reset().setEffectiveWeight(1).play();
    if (ad === "Wave") {
      yeni.setLoop(THREE.LoopOnce, 1);
      yeni.clampWhenFinished = true;
    }
    if (eski && eski !== yeni) yeni.crossFadeFrom(eski, gecis, false);
    k.eylem = ad;
  }

  // ------------------------------------------------------------ kare döngüsü

  private ciz = (): void => {
    const dt = Math.min(this.saat.getDelta(), 0.05);
    const t = this.saat.elapsedTime;
    this.kare++;

    if (this.gecis) {
      const g = this.gecis;
      g.t = Math.min(1, g.t + dt / 0.9);
      const e = g.t < 0.5 ? 4 * g.t * g.t * g.t : 1 - Math.pow(-2 * g.t + 2, 3) / 2;
      this.kontrol.target.lerpVectors(g.hedefBas, g.hedefSon, e);
      this.kamera.position.lerpVectors(g.konumBas, g.konumSon, e);
      if (g.t >= 1) this.gecis = null;
    } else if (this.girisAnimasyonu > 0) {
      this.girisAnimasyonu = Math.max(0, this.girisAnimasyonu - dt * 0.9);
      const e = 1 - Math.pow(this.girisAnimasyonu, 3);
      const yon = this.kamera.position.clone().sub(this.kontrol.target).normalize();
      this.kamera.position.copy(this.kontrol.target).addScaledVector(yon, this.uzaklik * (1.35 - 0.35 * e));
    }
    // Kaydırırken ofisten çok uzaklaşılmasın: hedef ofisin çevresinde tutulur.
    if (this.plan) {
      const h = this.kontrol.target;
      const x = THREE.MathUtils.clamp(h.x, -2, this.plan.genislik + 2);
      const z = THREE.MathUtils.clamp(h.z, -2, this.plan.derinlik + 2);
      if (x !== h.x || z !== h.z) {
        this.kamera.position.x += x - h.x;
        this.kamera.position.z += z - h.z;
        h.x = x;
        h.z = z;
      }
    }
    this.kontrol.update();

    for (const h of this.hareketliler) h.userData.guncelle?.(t);
    for (const k of this.karakterler) {
      const eski = KISI_ESKI.copy(k.k3.nesne.position);
      this.karakteriOynat(k, dt);
      if (k.durum !== "oturuyor") this.duvardanGecirme(k, eski, dt);
    }
    this.lioyuOynat(dt, t);
    this.ajaniOynat(dt, t);

    for (let i = this.parcaciklar.length - 1; i >= 0; i--) {
      const p = this.parcaciklar[i];
      p.omur -= dt;
      p.h.y -= 9 * dt;
      p.m.position.addScaledVector(p.h, dt);
      p.m.rotation.x += dt * 8;
      p.m.rotation.y += dt * 6;
      if (p.m.position.y < 0.08) {
        p.m.position.y = 0.08;
        p.h.set(p.h.x * 0.6, 0, p.h.z * 0.6);
      }
      (p.m.material as THREE.MeshBasicMaterial).opacity = Math.min(1, p.omur * 1.5);
      if (p.omur <= 0) {
        this.efektler.remove(p.m);
        p.m.geometry.dispose();
        this.parcaciklar.splice(i, 1);
      }
    }

    if (this.fareVar && this.kare % 2 === 0) this.isinla();

    // Uzaktan bakınca etiketler yalnızca simge: yazılar birbirine biniyordu.
    if (this.kare % 10 === 0) {
      // Hedefteki bir metrenin ekrandaki piksel boyu.
      const mesafe = this.kamera.position.distanceTo(this.kontrol.target);
      const pikselMetre = this.kap.clientHeight / (2 * mesafe * Math.tan(THREE.MathUtils.degToRad(KAMERA_ACI / 2)));
      const uzak = pikselMetre < 14;
      if (uzak !== this.uzakMi) {
        this.uzakMi = uzak;
        this.etiketRenderer.domElement.classList.toggle("uzak", uzak);
      }
    }

    if (this.birlestirici) this.birlestirici.render(dt);
    else this.renderer.render(this.sahne, this.kamera);
    this.etiketRenderer.render(this.sahne, this.kamera);
  };

  private karakteriOynat(k: Karakter, dt: number): void {
    const n = k.k3.nesne;
    if (n.scale.x < 1) n.scale.setScalar(Math.min(1, n.scale.x + dt * 2.5));
    k.k3.karisici.update(dt);

    if (k.durum === "oturuyor") {
      n.rotation.y = k.koltukYonu;
      if (k.ayakta) n.position.set(k.koltuk.x, ZEMIN_Y, k.koltuk.z);
      else {
        n.position.set(k.koltuk.x, k.koltuk.y - OTURMA_INIS, k.koltuk.z);
        this.oturt(k);
      }
      k.sayac -= dt;
      if (k.sayac <= 0) this.yolaCik(k);
      return;
    }

    if (k.durum === "bekliyor") {
      k.sayac -= dt;
      if (k.sayac <= 0) {
        // Dönüş yolu: gidişin tersi, koltukta biter.
        k.yol = k.yol.slice().reverse();
        k.yol.push(k.koltuk.clone());
        k.adim = 0;
        k.donus = true;
        k.durum = "yuruyor";
        k.kahvede = false;
        this.eylemeGec(k, "Walk");
      }
      return;
    }

    const hedef = k.yol[k.adim];
    if (!hedef) {
      if (k.donus) {
        k.durum = "oturuyor";
        k.sayac = aralik(k.veri.cevrimici ? GEZINME.masadaCevrimici : GEZINME.masadaDiger);
        k.yol = [];
        this.eylemeGec(k, "Idle_Neutral");
      } else {
        k.durum = "bekliyor";
        k.sayac = aralik(GEZINME.ayakta);
        // Kahve köşesinde kahve alır, ortada biriyle karşılaşmış gibi el sallar ya da dinlenir.
        this.eylemeGec(k, k.kahvede ? "Interact" : Math.random() < 0.35 ? "Wave" : "Idle");
        if (k.kahvede) n.rotation.y = this.kahveYeri().don + Math.PI; // bara dön
      }
      return;
    }
    n.position.y = ZEMIN_Y;

    // Yol veriyor: önce kenara çekilir, sonra karşıdaki geçene kadar bekler.
    if (k.yolVer > 0) {
      const once = k.yolVer;
      k.yolVer -= dt;
      if (once > 0.9) n.position.addScaledVector(k.kacis, 0.7 * dt);
      if (k.yolVer <= 0) this.eylemeGec(k, "Walk");
      this.ayrik(k);
      return;
    }

    const fark = new THREE.Vector3().subVectors(hedef, n.position);
    fark.y = 0;
    const mesafe = fark.length();
    if (mesafe < 0.05) {
      k.adim++;
      return;
    }
    fark.normalize();

    // Önündeki karakterle karşılaşma: yolu kesişen yürüyenlerden biri yol verir;
    // ayakta durana (ya da yol vermek için bekleyene) çarpmamak için etrafından dolaşılır.
    const kacin = new THREE.Vector3();
    for (const o of this.karakterler) {
      if (o === k || o.durum === "oturuyor") continue;
      const op = o.k3.nesne.position;
      const dx = op.x - n.position.x;
      const dz = op.z - n.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 1.1 || d < 1e-4) continue;
      const onde = (dx * fark.x + dz * fark.z) / d;
      if (onde < 0.35) continue; // arkada ya da yanda: sorun yok
      // Karşıdakinin solunda mı sağında mı kalıyorum: o yana çekil / o yandan dolaş.
      const yan = new THREE.Vector3(-fark.z, 0, fark.x);
      if (yan.x * dx + yan.z * dz > 0) yan.negate();
      if (o.durum === "yuruyor" && o.yolVer <= 0 && d < 0.95) {
        const ben = { id: k.veri.id, kadin: k.k3.kadin, emek: k.veri.emek };
        const karsi = { id: o.veri.id, kadin: o.k3.kadin, emek: o.veri.emek };
        if (!yolHakki(ben, karsi)) {
          k.yolVer = 1.6;
          k.kacis.copy(yan);
          this.eylemeGec(k, "Idle", 0.2);
          n.rotation.y = Math.atan2(dx, dz); // karşıdakine dönüp bekler
          return;
        }
      }
      // Yol hakkı bende ya da karşıdaki duruyor: etrafından dolaş.
      kacin.addScaledVector(yan, (1.1 - d) * 1.4);
    }
    if (kacin.lengthSq() > 0) fark.add(kacin).normalize();
    n.position.addScaledVector(fark, Math.min(mesafe, 1.25 * dt));
    this.ayrik(k);
    const aci = Math.atan2(fark.x, fark.z);
    let d = aci - n.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    n.rotation.y += d * Math.min(1, dt * 9);
  }

  /** Son güvence: iki ayaktaki karakter iç içe girmesin (omuz payı kadar itilir). */
  private ayrik(k: Karakter): void {
    const n = k.k3.nesne.position;
    for (const o of this.karakterler) {
      if (o === k || o.durum === "oturuyor") continue;
      const op = o.k3.nesne.position;
      const dx = n.x - op.x;
      const dz = n.z - op.z;
      const d = Math.hypot(dx, dz);
      if (d >= 0.5 || d < 1e-4) continue;
      const it = (0.5 - d) / 2;
      n.x += (dx / d) * it;
      n.z += (dz / d) * it;
    }
  }

  /**
   * Animasyonun üstüne oturma pozu: uyluk ileri (yatay), baldır dik aşağı.
   * Kemiklerin yerel eksenleri karakterden karaktere döndürülmüş durduğu için
   * yerel rotateX ile bükmek bacağı geriye, sandalyenin etrafına kıvırıyordu;
   * yönler dünyada verilir. Ayaklar Root'a bağlı (IK düzeni): animasyon onları
   * yerde, ayaktaki yerinde tutar — baldırın ucuna ayrıca taşınır, yoksa baldır
   * ayağa doğru geriye uzayıp sandalyeye sarılıyordu.
   */
  private oturt(k: Karakter): void {
    const b = k.k3.bacaklar;
    const n = k.k3.nesne;
    n.updateMatrixWorld(true);
    const ileri = OTUR_ILERI.set(Math.sin(k.koltukYonu), 0, Math.cos(k.koltukYonu));
    for (const [ust, alt, ayak] of [
      [b.ustSol, b.altSol, b.ayakSol],
      [b.ustSag, b.altSag, b.ayakSag],
    ] as const) {
      if (!ust || !alt) continue;
      // Baldır boyu: animasyonun pozunda diz ile ayak bileği arası.
      const baldir = ayak ? alt.getWorldPosition(OTUR_A).distanceTo(ayak.getWorldPosition(OTUR_B)) : 0;
      kemigiYonelt(ust, ileri);
      kemigiYonelt(alt, ASAGI);
      if (ayak?.parent) {
        const bilek = alt.getWorldPosition(OTUR_A).addScaledVector(ASAGI, baldir);
        ayak.position.copy(ayak.parent.worldToLocal(bilek));
        ayak.updateMatrixWorld(true);
      }
    }
    // Eller klavyede: üst kol hafif öne-aşağı (dirsek gövdenin yanında), ön kol
    // masaya doğru ileri ve biraz içe, bilek tuşlara eğik. İçe yön iki omzun
    // ortasına göre bulunur; böylece sağ/sol işaretiyle uğraşılmaz.
    const kol = k.k3.kollar;
    if (kol.ustSol && kol.ustSag) {
      const orta = kol.ustSol.getWorldPosition(OTUR_A).add(kol.ustSag.getWorldPosition(OTUR_B)).multiplyScalar(0.5);
      for (const [ust, alt, bilek] of [
        [kol.ustSol, kol.altSol, kol.bilekSol],
        [kol.ustSag, kol.altSag, kol.bilekSag],
      ] as const) {
        if (!ust || !alt) continue;
        const omuz = ust.getWorldPosition(OTUR_B);
        const ice = OTUR_ICE.set(orta.x - omuz.x, 0, orta.z - omuz.z).normalize();
        kemigiYonelt(ust, OTUR_YON.copy(ileri).multiplyScalar(0.35).addScaledVector(ASAGI, 0.94).normalize());
        kemigiYonelt(alt, OTUR_YON.copy(ileri).addScaledVector(ASAGI, 0.12).addScaledVector(ice, 0.3).normalize());
        if (bilek) kemigiYonelt(bilek, OTUR_YON.copy(ileri).addScaledVector(ASAGI, 0.4).addScaledVector(ice, 0.1).normalize());
      }
    }
  }

  /**
   * Yürüyen kişi duvarın içinden geçmesin. Yol ızgarada duvarlardan uzak
   * bulunuyor ama yol verirken kenara çekilme, birbirinden uzaklaşma ve
   * karşıdakinden kaçınma kişiyi yanlara itiyordu — kalabalık ofiste duvarın
   * öbür yanına. Yeni yer bir duvara değiyorsa önce tek eksende kaydırılır,
   * olmazsa kişi o karede yerinde kalır. Zaten duvara değerek başlamışsa
   * (ör. duvara yakın koltuktan kalkarken) serbest bırakılır, sıkışıp kalmasın.
   */
  private duvardanGecirme(k: Karakter, eski: THREE.Vector3, dt: number): void {
    const p = k.k3.nesne.position;
    const r = 0.14;
    const degiyor = (x: number, z: number) =>
      this.duvarKutulari().some((d) => x > d.min.x - r && x < d.max.x + r && z > d.min.z - r && z < d.max.z + r);
    if (!degiyor(p.x, p.z) || degiyor(eski.x, eski.z)) return;
    if (!degiyor(p.x, eski.z)) p.z = eski.z;
    else if (!degiyor(eski.x, p.z)) p.x = eski.x;
    else {
      p.x = eski.x;
      p.z = eski.z;
      // Duvara dayanıp kaldıysa (ör. ızgarada yol bulunamayıp eski ara
      // noktalara düşülmüşse) bir buçuk saniye sonra bulunduğu yerden yol yeniden aranır.
      k.takili = (k.takili ?? 0) + dt;
      if (k.takili > 1.5) {
        k.takili = 0;
        const izgara = this.izgara();
        const hedef = k.yol[k.yol.length - 1];
        const yeni = izgara && hedef ? yolBul(izgara, p, hedef) : null;
        if (yeni) {
          k.yol = yeni.map((y) => new THREE.Vector3(y.x, ZEMIN_Y, y.z));
          k.adim = 0;
        }
      }
      return;
    }
    k.takili = 0;
  }

  /** Kahve köşesinin bugünkü yeri: düzenleyicide taşınmış olabilir, plandaki yer ilk hâli. */
  private kahveYeri(): { x: number; z: number; don: number } {
    const o = this.nesneler.get("ortak|dekor:kahve-kosesi")?.obj;
    if (o) return { x: o.position.x, z: o.position.z, don: o.rotation.y };
    return this.plan?.kahve ?? { x: 0, z: 0, don: 0 };
  }

  /** Taşınan/döndürülen masadaki kişilerin koltuğu masayla birlikte gelir (bırakmayı beklemeden). */
  private masadakileriTasi(n: { obj: THREE.Object3D; oda: OfisOdasi; nesneId: string }): void {
    if (!n.nesneId.startsWith("masa-")) return;
    const no = Number(n.nesneId.slice(5));
    const { x, z } = n.obj.position;
    const don = n.obj.rotation.y;
    for (const k of this.karakterler) {
      if (k.oda.id !== n.oda.id || k.masaNo !== no) continue;
      const uz = koltukUzakligi(n.oda.masalar[no] ?? {});
      k.koltuk.set(x - uz * Math.sin(don), ZEMIN_Y, z - uz * Math.cos(don));
      k.koltukYonu = don;
    }
  }

  /** Masadan kalkıp kapıdan ortak alana, rastgele bir noktaya (çoğu zaman kahve köşesine) yürür. */
  private yolaCik(k: Karakter): void {
    const plan = this.plan;
    if (!plan) return;
    const ortak = plan.odalar.find((o) => o.tur === "ortak");
    if (!ortak) return;
    const { kapi, kapiYonu: y } = k.oda;
    const ic = new THREE.Vector3(kapi.x - y.x * 0.7, ZEMIN_Y, kapi.z - y.z * 0.7);
    const dis = new THREE.Vector3(kapi.x + y.x * 0.8, ZEMIN_Y, kapi.z + y.z * 0.8);
    // Sandalyeden geri çekilip masa sırasının kapı tarafındaki ucundan dolaşır.
    const kalkis = k.koltuk.clone();
    // Sandalyeden geriye (masanın tersine) bir adım; masa döndürülmüş olabilir.
    kalkis.x -= 0.4 * Math.sin(k.koltukYonu);
    kalkis.z -= 0.4 * Math.cos(k.koltukYonu);
    const masaX = k.oda.masalar.map((m) => m.x);
    // Kümenin kapıya yakın ucundan dolaşılır (kapı kuzey/güney duvarındaysa kapının olduğu yana).
    const masaOrta = masaX.reduce((t, v) => t + v, 0) / masaX.length;
    const sagdan = y.x > 0 || (y.x === 0 && kapi.x >= masaOrta);
    const uc = sagdan ? Math.max(...masaX) + 1.0 : Math.min(...masaX) - 1.0;
    const kenarX = Math.min(k.oda.x + k.oda.w - 0.4, Math.max(k.oda.x + 0.4, uc));
    const kenar = new THREE.Vector3(kenarX, ZEMIN_Y, kalkis.z);
    const kahve = Math.random() < 0.45;
    let hedef: THREE.Vector3;
    if (kahve) {
      // Barın önüne (bar taşınmış/döndürülmüş olabilir), biraz sağına ya da soluna.
      const { x, z, don } = this.kahveYeri();
      const yan = (Math.random() - 0.5) * 0.8;
      hedef = new THREE.Vector3(x + 0.9 * Math.sin(don) + yan * Math.cos(don), ZEMIN_Y, z + 0.9 * Math.cos(don) - yan * Math.sin(don));
    } else {
      // Oturma grubunun yanlarından ya da koridor boyunca bir nokta (grubun içine girmesin).
      const yan = Math.random() < 0.5 ? -1 : 1;
      hedef = new THREE.Vector3(
        ortak.x + ortak.w / 2 + yan * (2.3 + Math.random() * 0.6),
        ZEMIN_Y,
        Math.min(ortak.z + ortak.d - 1.6, Math.max(ortak.z + 1.6, k.oda.kapi.z + (Math.random() - 0.5) * 3))
      );
    }
    // Kapı bir koridor girintisine açılıyor olabilir: önce ortak alanın içine
    // (kapıya en yakın noktasına) girilir, sonra hedefe yürünür — duvarlardan geçmesin.
    const giris = new THREE.Vector3(
      Math.min(ortak.x + ortak.w - 0.6, Math.max(ortak.x + 0.6, dis.x)),
      ZEMIN_Y,
      Math.min(ortak.z + ortak.d - 0.6, Math.max(ortak.z + 0.6, dis.z))
    );
    // Yol ızgarada bulunur: duvarlar kapıdan, eşyaların (taşınmış olanlar ve
    // mağazadan konanlar dahil) etrafından dolaşılır. Bulunamazsa (ör. kapının
    // önü kapatılmış) eski sabit ara noktalara düşülür.
    const izgara = this.izgara();
    const bulunan = izgara ? yolBul(izgara, kalkis, hedef) : null;
    k.yol = bulunan
      ? [kalkis, ...bulunan.map((p) => new THREE.Vector3(p.x, ZEMIN_Y, p.z))]
      : [kalkis, kenar, new THREE.Vector3(kenarX, ZEMIN_Y, ic.z), ic, dis, giris, hedef];
    k.adim = 0;
    k.donus = false;
    k.kahvede = kahve;
    k.durum = "yuruyor";
    this.eylemeGec(k, "Walk");
  }

  // ------------------------------------------------------------ fare

  private fareKonumu(e: PointerEvent): void {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.fare.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  private fareHareket = (e: PointerEvent): void => {
    this.fareKonumu(e);
    this.fareVar = true;
    if (this.yerlestirme) this.hayaletiGuncelle();
    if (this.surukleme) this.surukle();
  };

  // ------------------------------------------------------------ oda düzenleyicisi

  /** Bir odayı düzenlemeye başlar (null: bitirir). Düzenleme sırasında nesneler tutulup taşınır. */
  duzenle(odaId: string | null): void {
    this.duzenlenenOda = odaId;
    this.esyaOdalari.clear();
    // Önceden (devir kuralından önce) ortak alana çıkarılmış eşyalar şimdi devredilir;
    // Kaydet ile kalıcı olur. Oda düzenlenirken o odanınkiler, ortak alan
    // düzenlenirken bütün odalarınkiler (yoksa "X düzenine ait" diye seçilemiyorlardı).
    if (odaId)
      for (const n of [...this.nesneler.values()]) if (odaId === "ortak" || n.oda.id === odaId) this.devret(n);
    this.surukleme = null;
    this.kontrol.enabled = true;
    this.secimiAyarla(null);
  }

  /**
   * Seçili nesneyi kendi etrafında döndürür: artı derece saat yönünde (yukarıdan
   * bakınca), eksi tersine. Sonuç 45°'lik ızgaraya oturur, açı −180…180'de kalır.
   */
  seciliyiDondur(derece = 90): void {
    const n = this.seciliNesne ? this.nesneAl(this.seciliNesne) : undefined;
    if (!n) return;
    const adim = Math.PI / 4;
    const yeni = Math.round((n.obj.rotation.y - (derece * Math.PI) / 180) / adim) * adim;
    const eskiDon = n.obj.rotation.y;
    const eskiYer = n.obj.position.clone();
    const onceCakisiyordu = this.cakisiyor(n.obj, n.oda, undefined, undefined, undefined, n.nesneId);
    n.obj.rotation.y = Math.atan2(Math.sin(yeni), Math.cos(yeni));
    // Döndürünce uzun kenar duvara taşabilir: içeri it.
    this.duvaraSigdir(n.obj, this.nesneBolgesi(n.oda, n.nesneId, n.obj.position.x, n.obj.position.z));
    if (!onceCakisiyordu && this.cakisiyor(n.obj, n.oda, undefined, undefined, undefined, n.nesneId)) {
      n.obj.rotation.y = eskiDon;
      n.obj.position.copy(eskiYer);
      this.onUyari?.("Döndürmeye yer yok: önce eşyayı biraz boşluğa çek");
      return;
    }
    this.masadakileriTasi(n);
    // İz döndürülmüş ayak iziyle yeniden kurulsun.
    this.secimiAyarla(this.seciliNesne, false);
    this.bildir(this.seciliNesne!);
  }

  /** Yürüyüşe engel her şeyin zemindeki kutusu (oda eşyaları + mağazadan konanlar, halılar hariç). */
  private engelKutulari(): THREE.Box3[] {
    const halilar = new Set(this.esyalar.filter((e) => e.tur === "hali").map((e) => e.id));
    const nesneler = [
      ...this.zeminEsyalari,
      ...[...this.esyaNesneleri].filter(([id, n]) => !halilar.has(id) && n.visible).map(([, n]) => n),
    ];
    return nesneler.map((o) => new THREE.Box3().setFromObject(o));
  }

  private izgara(): YolIzgarasi | null {
    const plan = this.plan;
    if (!plan) return null;
    if (!this.yolIzgarasi) {
      const x0 = Math.min(...plan.odalar.map((o) => o.x)) - 1;
      const z0 = Math.min(...plan.odalar.map((o) => o.z)) - 1;
      const x1 = Math.max(...plan.odalar.map((o) => o.x + o.w)) + 1;
      const z1 = Math.max(...plan.odalar.map((o) => o.z + o.d)) + 1;
      const engeller = this.engelKutulari()
        .filter((k) => !k.isEmpty())
        .map((k) => ({ x: k.min.x, z: k.min.z, w: k.max.x - k.min.x, d: k.max.z - k.min.z }));
      this.yolIzgarasi = izgaraKur({ x: x0, z: z0, w: x1 - x0, d: z1 - z0 }, plan.duvarlar, engeller, { duvarKalinlik: DUVAR_KALINLIK });
    }
    return this.yolIzgarasi;
  }

  /**
   * Nesne, aynı odadaki başka bir zemin eşyasının içine giriyor mu (ayak izleri;
   * yükseklikte örtüşmeyenler — duvardaki tahta ile altındaki dolap — sayılmaz).
   * Biraz tolerans var: yan yana dayanmış eşyalar çakışmış sayılmasın.
   */
  private cakisiyor(
    obj: THREE.Object3D,
    oda: OfisOdasi,
    digerleri = this.digerKutulari(obj, oda),
    zemin = this.zeminMi(obj),
    /** Eksi: yan yana dayanmaya tolerans; artı: otomatik yerleştirmede bırakılacak boşluk. */
    pay = -0.04,
    /** Verilirse nesnenin girebildiği odalar hesaba katılır (ortak alanın eşyası her odaya). */
    nesneId?: string
  ): boolean {
    // Halılar ve duvara asılı olanlar (zemin eşyası sayılmayanlar) serbest.
    if (!zemin) return false;
    obj.updateMatrixWorld(true);
    const kutu = new THREE.Box3().setFromObject(obj).expandByScalar(pay);
    if (digerleri.some((k) => k.intersectsBox(kutu))) return true;
    // Oda eşyası kapıdan başka bir odaya girmez (ortak alanın dikdörtgeni o odaları
    // da kapsıyor); ortak alanın eşyası ise bulunduğu odaya girebilir.
    const merkezi = kutu.getCenter(OTUR_B);
    const bolgem = nesneId ? this.nesneBolgesi(oda, nesneId, merkezi.x, merkezi.z) : oda;
    if (
      this.plan?.odalar.some(
        (o) =>
          o !== oda &&
          o !== bolgem &&
          (o.tur === "departman" || o.tur === "toplanti") &&
          merkezi.x > o.x &&
          merkezi.x < o.x + o.w &&
          merkezi.z > o.z &&
          merkezi.z < o.z + o.d
      )
    )
      return true;
    // Duvarlar da (kapı boşlukları hariç): ortak alanın dikdörtgeni komşu
    // odaların duvarlarını da kapsıyor, yalnızca oda sınırına sığdırmak yetmiyor.
    return this.duvarKutulari().some((k) => k.intersectsBox(kutu));
  }

  /** Düzenleyicide mağaza eşyalarının bu oturumdaki odası (eşya ortak alana taşınsa da). */
  private esyaOdalari = new Map<string, OfisOdasi>();

  /**
   * Düzenleyicideki bir nesne: oda düzeninden ("odaId|nesneId") ya da kişinin
   * mağazadan aldığı eşya ("esya|<id>"; nesneId "esya:<id>", odası bulunduğu yer).
   */
  private nesneAl(anahtar: string): { obj: THREE.Object3D; oda: OfisOdasi; nesneId: string } | undefined {
    if (!anahtar.startsWith("esya|")) return this.nesneler.get(anahtar);
    const id = anahtar.slice(5);
    const obj = this.esyaNesneleri.get(id);
    if (!obj) return undefined;
    const oda = this.esyaOdalari.get(id) ?? this.esyaninOdasi(obj);
    return oda ? { obj, oda, nesneId: `esya:${id}` } : undefined;
  }

  /** Mağaza eşyasının durduğu oda; odaların dışındaysa ortak alan. */
  private esyaninOdasi(obj: THREE.Object3D): OfisOdasi | undefined {
    const { x, z } = obj.position;
    const icinde = (o: OfisOdasi) => x >= o.x && x <= o.x + o.w && z >= o.z && z <= o.z + o.d;
    const odalar = this.plan?.odalar ?? [];
    return odalar.find((o) => (o.tur === "departman" || o.tur === "toplanti") && icinde(o)) ?? odalar.find((o) => o.tur === "ortak" && icinde(o));
  }

  /** Çakışmada sayılan zemin eşyası mı (oda düzenindekiler ve halı olmayan mağaza eşyaları). */
  private zeminMi(obj: THREE.Object3D): boolean {
    return this.zeminEsyalari.includes(obj) || (!!obj.userData.esyaId && obj.userData.tur !== "hali");
  }

  /** Modül eşyası odasından çıkmaz; diğerleri ortak alana da çıkabilir (bkz. bolgesi). */
  private nesneBolgesi(oda: OfisOdasi, nesneId: string, x: number, z: number): OfisOdasi {
    // Modül eşyası departmana aittir; masada departmanın kişisi oturur: ikisi de odasından çıkmaz.
    if (nesneId.startsWith("modul:") || nesneId.startsWith("masa-")) return oda;
    // Ortak alanın eşyası her odaya (ve girişe) konabilir: bulunduğu oda bölgesidir.
    if (oda.tur === "ortak") {
      const icinde = (o: OfisOdasi) => x >= o.x && x <= o.x + o.w && z >= o.z && z <= o.z + o.d;
      return this.plan?.odalar.find((o) => (o.tur === "departman" || o.tur === "toplanti" || o.tur === "giris") && icinde(o)) ?? oda;
    }
    return bolgesi(oda, this.plan?.odalar.find((o) => o.tur === "ortak"), x, z);
  }

  /**
   * Odanın eşyası ortak alana taşınınca departmandan kopar, şirketin eşyası olur
   * (bkz. devret). Bunu ortak alanın düzenini kaydedebilen (şirket sahibi) yapar.
   */
  ortagaTasinabilir = false;
  /**
   * Eşyası ortak alana devredilebilen odalar; null: hepsi (şirkette sahip her
   * odayı yazabilir). Stüdyoda yalnızca sahibi olunan işlerin odaları: ekipte
   * olunan başkasının işinin odası değiştirilemez (sunucu da reddeder).
   */
  devirOdalari: Set<string> | null = null;
  /** Odanın eşyası ortak alana bırakıldı: odadan çıkarılıp ortak alana "ek:" olarak eklenmeli. */
  onOrtagaDevir?: (odaId: string, nesneId: string, ortakta: NesneDuzeni & { tur: string }) => void;

  /**
   * Tek parça bir modelden kurulan, zemindeki oda eşyası mı (bitki, kitaplık,
   * askılık, eklenen eşya). Tahta, televizyon, toplantı masası gibi parçalı ya
   * da duvara asılı olanlar ve masalar, modül eşyaları devredilemez.
   */
  private devredilebilir(n: { obj: THREE.Object3D; oda: OfisOdasi; nesneId: string }): boolean {
    if (n.oda.tur === "ortak" || !(n.nesneId.startsWith("dekor:") || n.nesneId.startsWith("ek:"))) return false;
    if (this.devirOdalari && !this.devirOdalari.has(n.oda.id)) return false;
    return typeof n.obj.userData.model === "string" && n.obj.position.y <= ZEMIN_Y + 0.05;
  }

  /** Sürüklenen/taşınan nesnenin girebileceği bölge: devredilemeyen oda eşyası odasında kalır. */
  private izinliBolge(n: { obj: THREE.Object3D; oda: OfisOdasi; nesneId: string }, x: number, z: number): OfisOdasi {
    const b = this.nesneBolgesi(n.oda, n.nesneId, x, z);
    if (b.tur !== "ortak" || n.oda.tur === "ortak" || n.nesneId.startsWith("esya:")) return b;
    return this.ortagaTasinabilir && this.devredilebilir(n) ? b : n.oda;
  }

  /** Seçili nesne düzenlenen yerin değil, bir odanın eşyası mı (ortak alandan tutulan). */
  seciliBaskaOdanin(): boolean {
    const n = this.seciliNesne ? this.nesneAl(this.seciliNesne) : undefined;
    return !!n && !n.nesneId.startsWith("esya:") && n.oda.id !== this.duzenlenenOda;
  }

  /** Seçili nesne ortak alana gönderilebilir mi (menüdeki "Ortak alana taşı"). */
  seciliOrtagaGidebilir(): boolean {
    const n = this.seciliNesne ? this.nesneAl(this.seciliNesne) : undefined;
    if (!n || n.oda.tur === "ortak") return false;
    return n.nesneId.startsWith("esya:") || (this.ortagaTasinabilir && this.devredilebilir(n));
  }

  /**
   * Ortak alana düşmüş oda eşyasını devreder: odanın düzeninden çıkıp ortak
   * alanın düzenine şirketin eşyası olarak girer (React iki taslağı da günceller,
   * Kaydet ikisini birlikte yazar). Devredildiyse true.
   */
  private devret(n: { obj: THREE.Object3D; oda: OfisOdasi; nesneId: string }): boolean {
    const ortak = this.plan?.odalar.find((o) => o.tur === "ortak");
    if (!ortak || !this.ortagaTasinabilir || !this.devredilebilir(n)) return false;
    if (this.nesneBolgesi(n.oda, n.nesneId, n.obj.position.x, n.obj.position.z) !== ortak) return false;
    if (this.seciliNesne === `${n.oda.id}|${n.nesneId}`) this.secimiAyarla(null);
    this.onOrtagaDevir?.(n.oda.id, n.nesneId, {
      tur: n.obj.userData.model as string,
      dx: Math.round((n.obj.position.x - ortak.x) * 100) / 100,
      dz: Math.round((n.obj.position.z - ortak.z) * 100) / 100,
      don: n.obj.rotation.y,
    });
    return true;
  }

  /** Seçili nesnenin şu an bulunduğu bölgenin (oda ya da ortak alan) kimliği. */
  seciliBolgesi(): string | null {
    const n = this.seciliNesne ? this.nesneAl(this.seciliNesne) : undefined;
    return n ? this.nesneBolgesi(n.oda, n.nesneId, n.obj.position.x, n.obj.position.z).id : null;
  }

  /** Odadaki (ve ortak alandaki) öbür zemin eşyalarının kutuları (sürükleme boyunca değişmez, başta bir kez). */
  private digerKutulari(obj: THREE.Object3D, oda: OfisOdasi): THREE.Box3[] {
    const ortak = this.plan?.odalar.find((o) => o.tur === "ortak");
    // Ortak alanın eşyası her odaya girebildiği için her yerdekiler sayılır.
    const bolgeler = oda.tur === "ortak" ? (this.plan?.odalar ?? [oda]) : ortak ? [oda, ortak] : [oda];
    const halilar = new Set(this.esyalar.filter((e) => e.tur === "hali").map((e) => e.id));
    const digerleri = [
      ...this.zeminEsyalari,
      ...[...this.esyaNesneleri].filter(([id, n]) => !halilar.has(id) && n.visible).map(([, n]) => n),
    ];
    const kutular: THREE.Box3[] = [];
    for (const o of digerleri) {
      if (o === obj) continue;
      const k = new THREE.Box3().setFromObject(o);
      const c = k.getCenter(OTUR_A);
      if (bolgeler.some((b) => c.x > b.x && c.x < b.x + b.w && c.z > b.z && c.z < b.z + b.d)) kutular.push(k);
    }
    return kutular;
  }

  private duvarKutulariOnbellek: { plan: OfisPlani; kutular: THREE.Box3[] } | null = null;

  private duvarKutulari(): THREE.Box3[] {
    const plan = this.plan;
    if (!plan) return [];
    if (this.duvarKutulariOnbellek?.plan === plan) return this.duvarKutulariOnbellek.kutular;
    const y = DUVAR_KALINLIK / 2;
    const kutular: THREE.Box3[] = [];
    for (const d of plan.duvarlar) {
      const yatay = d.z1 === d.z2;
      const bas = yatay ? Math.min(d.x1, d.x2) : Math.min(d.z1, d.z2);
      const son = yatay ? Math.max(d.x1, d.x2) : Math.max(d.z1, d.z2);
      const parcalar: [number, number][] = d.kapi
        ? [
            [bas, d.kapi.orta - d.kapi.genislik / 2],
            [d.kapi.orta + d.kapi.genislik / 2, son],
          ]
        : [[bas, son]];
      for (const [a, b2] of parcalar) {
        if (b2 - a <= 0) continue;
        kutular.push(
          yatay
            ? new THREE.Box3(new THREE.Vector3(a, 0, d.z1 - y), new THREE.Vector3(b2, DUVAR_YUKSEKLIK, d.z1 + y))
            : new THREE.Box3(new THREE.Vector3(d.x1 - y, 0, a), new THREE.Vector3(d.x1 + y, DUVAR_YUKSEKLIK, b2))
        );
      }
    }
    this.duvarKutulariOnbellek = { plan, kutular };
    return kutular;
  }

  /**
   * Nesneyi, gerçek (döndürülmüş) ayak izi duvarın İÇ yüzünü geçmeyecek kadar
   * odaya iter. Yalnızca merkezi sınırlamak yetmiyordu: masa, kitaplık gibi
   * büyük eşyalar duvarın içinden geçip komşu odaya taşıyordu. Oda nesneden
   * darsa nesne o eksende ortalanır.
   */
  private duvaraSigdir(obj: THREE.Object3D, oda: OfisOdasi): void {
    const ic = DUVAR_KALINLIK / 2 + 0.01;
    obj.updateMatrixWorld(true);
    const kutu = new THREE.Box3().setFromObject(obj);
    const sigdir = (min: number, max: number, alt: number, ust: number): number => {
      if (max - min > ust - alt) return (alt + ust) / 2 - (min + max) / 2;
      if (min < alt) return alt - min;
      if (max > ust) return ust - max;
      return 0;
    };
    obj.position.x += sigdir(kutu.min.x, kutu.max.x, oda.x + ic, oda.x + oda.w - ic);
    obj.position.z += sigdir(kutu.min.z, kutu.max.z, oda.z + ic, oda.z + oda.d - ic);
  }

  /**
   * Nesnenin `bolge` içinde, `bas`a en yakın, hiçbir şeye çarpmadığı yer
   * (genişleyen halkalarda çeyrek metre adımlarla). Nesne geçici olarak oraya
   * konup denenir; bulunamazsa eski yerine döner ve null.
   */
  private bosYer(obj: THREE.Object3D, oda: OfisOdasi, nesneId: string, bolge: OfisOdasi, bas: { x: number; z: number }, zemin: boolean): THREE.Vector3 | null {
    const eski = obj.position.clone();
    const kutular = this.digerKutulari(obj, oda);
    // Önce çeyrek metre boşluk bırakarak (kendiliğinden konan eşya ötekilere
    // yapışıp önündekini gizlemesin), yer yoksa dibine dayanarak aranır.
    for (const pay of [0.25, -0.04]) {
      const uygun = (x: number, z: number) => {
        obj.position.x = x;
        obj.position.z = z;
        this.duvaraSigdir(obj, bolge);
        return this.nesneBolgesi(oda, nesneId, obj.position.x, obj.position.z) === bolge && !this.cakisiyor(obj, oda, kutular, zemin, pay, nesneId);
      };
      const enCok = Math.ceil(Math.max(bolge.w, bolge.d) / 0.25);
      for (let r = 0; r <= enCok; r++) {
        const adim = Math.max(1, Math.round(r * 2 * Math.PI));
        for (let i = 0; i < adim; i++) {
          const a = (i / adim) * Math.PI * 2;
          if (uygun(bas.x + Math.cos(a) * r * 0.25, bas.z + Math.sin(a) * r * 0.25)) {
            const yer = obj.position.clone();
            obj.position.copy(eski);
            return yer;
          }
        }
      }
    }
    obj.position.copy(eski);
    return null;
  }

  /**
   * Düzenleyicide eklenecek eşya için odada boş bir yer (oda köşesine göre);
   * yoksa null. Eşya henüz sahnede değil, geçici bir kopyasıyla denenir.
   */
  eklenecekYer(odaId: string, tur: EsyaTuru): { dx: number; dz: number } | null {
    const oda = this.plan?.odalar.find((o) => o.id === odaId);
    if (!oda) return null;
    const o = esyaModeli(tur);
    o.position.set(oda.x + oda.w / 2, ZEMIN_Y, oda.z + oda.d / 2);
    const yer = this.bosYer(o, oda, "ek:yeni", oda, { x: oda.x + oda.w / 2, z: oda.z + oda.d / 2 }, tur !== "hali");
    return yer ? { dx: Math.round((yer.x - oda.x) * 100) / 100, dz: Math.round((yer.z - oda.z) * 100) / 100 } : null;
  }

  /** Seçili nesne ortak alanda mı (odasından çıkarılmış mı). */
  seciliOrtakta(): boolean {
    const n = this.seciliNesne ? this.nesneAl(this.seciliNesne) : undefined;
    return !!n && n.oda.tur !== "ortak" && this.nesneBolgesi(n.oda, n.nesneId, n.obj.position.x, n.obj.position.z) !== n.oda;
  }

  /**
   * Seçili nesneyi ortak alana (odanın kapısının hemen dışına en yakın boş
   * yere) ya da — zaten ortaktaysa — odasına geri taşır. Yer yoksa uyarır.
   */
  seciliyiTasi(hedef: string): void {
    const n = this.seciliNesne ? this.nesneAl(this.seciliNesne) : undefined;
    const ortak = this.plan?.odalar.find((o) => o.tur === "ortak");
    if (!n || !ortak || n.nesneId.startsWith("modul:")) return;
    // "ortak": ortak alana (bulunduğu odanın kapısının dışına); "oda": odasına
    // geri; başka bir kimlik: o odaya (yalnızca ortak alanın eşyaları).
    const simdiki = this.nesneBolgesi(n.oda, n.nesneId, n.obj.position.x, n.obj.position.z);
    const bolge = hedef === "ortak" ? ortak : hedef === "oda" ? n.oda : this.plan?.odalar.find((o) => o.id === hedef);
    if (!bolge) return;
    const kapidan = simdiki.tur === "ortak" ? n.oda : simdiki;
    const bas =
      hedef === "ortak"
        ? { x: kapidan.kapi.x + kapidan.kapiYonu.x * 1.6, z: kapidan.kapi.z + kapidan.kapiYonu.z * 1.6 }
        : { x: bolge.x + bolge.w / 2, z: bolge.z + bolge.d / 2 };
    const yer = this.bosYer(n.obj, n.oda, n.nesneId, bolge, bas, this.zeminMi(n.obj));
    if (!yer) {
      this.onUyari?.(hedef === "ortak" ? "Ortak alanda boş yer yok" : "Odada boş yer yok");
      return;
    }
    n.obj.position.copy(yer);
    this.masadakileriTasi(n);
    this.yolIzgarasi = null;
    if (this.devret(n)) return;
    this.secimiAyarla(this.seciliNesne, false);
    this.bildir(this.seciliNesne!);
  }

  /** Seçili nesnenin ekrandaki yeri (tuvalin sol üstüne göre, nesnenin tepesi): menü oraya iliştirilir. */
  seciliEkranKonumu(): { x: number; y: number } | null {
    const n = this.seciliNesne ? this.nesneAl(this.seciliNesne) : undefined;
    if (!n) return null;
    const kutu = new THREE.Box3().setFromObject(n.obj);
    const p = new THREE.Vector3((kutu.min.x + kutu.max.x) / 2, kutu.max.y, (kutu.min.z + kutu.max.z) / 2).project(this.kamera);
    if (p.z > 1) return null; // kameranın arkasında
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: ((p.x + 1) / 2) * r.width, y: ((1 - p.y) / 2) * r.height };
  }

  /** Seçimi kaldırır (menüden Esc ya da dışarı tıklayınca). */
  secimiBirak(): void {
    this.secimiAyarla(null);
  }

  /** Seçili nesneyi odadan kaldırır (masalar kaldırılamaz: oturan kişi var). */
  seciliyiKaldir(): void {
    const n = this.seciliNesne ? this.nesneAl(this.seciliNesne) : undefined;
    // Masada oturan biri olabilir; mağaza eşyası kişisel, ekibin deposuna girmez (Düzenle > Sat).
    if (!n || n.nesneId.startsWith("masa-") || n.nesneId.startsWith("esya:")) return;
    const { oda, nesneId, obj } = n;
    this.secimiAyarla(null);
    this.onNesneDegisti?.(oda.id, nesneId, { dx: obj.position.x - oda.x, dz: obj.position.z - oda.z, don: obj.rotation.y, gizli: true });
  }

  private bildir(anahtar: string): void {
    const n = this.nesneAl(anahtar);
    if (!n) return;
    // Mağaza eşyası kişiseldir ve tarayıcıda saklanır: oda düzenine değil kendi kaydına yazılır.
    if (n.nesneId.startsWith("esya:")) {
      const e = this.esyalar.find((x) => x.id === n.nesneId.slice(5));
      if (!e) return;
      this.onYerlestir?.({
        id: e.id,
        tur: e.tur,
        x: Math.round(n.obj.position.x * 100) / 100,
        z: Math.round(n.obj.position.z * 100) / 100,
        // Çeyrek tur birimi; düzenleyicide 45° de döndürülebildiği için yarımlı.
        don: Math.round((-n.obj.rotation.y / (Math.PI / 2)) * 2) / 2,
      });
      return;
    }
    this.onNesneDegisti?.(n.oda.id, n.nesneId, {
      dx: Math.round((n.obj.position.x - n.oda.x) * 100) / 100,
      dz: Math.round((n.obj.position.z - n.oda.z) * 100) / 100,
      don: n.obj.rotation.y,
    });
  }

  private secimiAyarla(anahtar: string | null, bildir = true): void {
    if (this.secimIzi) {
      this.secimIzi.parent?.remove(this.secimIzi);
      this.secimIzi.geometry.dispose();
      this.secimIzi = null;
    }
    this.seciliNesne = anahtar;
    const n = anahtar ? this.nesneAl(anahtar) : undefined;
    if (n) {
      // Seçimin zemindeki izi: nesnenin ayak izi kadar, vurgu renginde.
      n.obj.updateMatrixWorld(true);
      const kutuB = new THREE.Box3().setFromObject(n.obj);
      const boy = kutuB.getSize(new THREE.Vector3());
      const iz = new THREE.Mesh(
        new THREE.PlaneGeometry(Math.max(0.5, boy.x + 0.2), Math.max(0.5, boy.z + 0.2)),
        new THREE.MeshBasicMaterial({ color: marka().vurgu, transparent: true, opacity: 0.35, depthWrite: false })
      );
      iz.rotation.x = -Math.PI / 2;
      const orta = kutuB.getCenter(new THREE.Vector3());
      iz.position.set(orta.x, ZEMIN_Y + 0.01, orta.z);
      this.efektler.add(iz);
      this.secimIzi = iz;
    }
    if (bildir) this.onNesneSecildi?.(n ? n.nesneId : null);
  }

  /** Düzenlenen odada imlecin altındaki nesne. */
  private altindakiNesne(): string | null {
    if (!this.duzenlenenOda) return null;
    this.isin.setFromCamera(this.fare, this.kamera);
    // Ortak alan düzenlenirken odaların devredilebilir eşyaları da tutulabilir:
    // ortak alana bırakılınca şirketin eşyası olur (bkz. devret).
    const ortaktan = this.duzenlenenOda === "ortak" && this.ortagaTasinabilir;
    const hedefler = [...this.nesneler.values()]
      .filter((n) => n.oda.id === this.duzenlenenOda || (ortaktan && this.devredilebilir(n)))
      .map((n) => n.obj);
    // Odadaki (düzenlenen ortak alansa ortaktaki) mağaza eşyaları da tutulup taşınabilir.
    for (const [id, o] of this.esyaNesneleri) if (o.visible && this.nesneAl(`esya|${id}`)?.oda.id === this.duzenlenenOda) hedefler.push(o);
    const vuruslar = this.isin.intersectObjects(hedefler, true);
    const anahtari = (ud: Record<string, unknown>) =>
      (ud.nesne as string | undefined) ?? (ud.esyaId ? `esya|${ud.esyaId as string}` : undefined);
    // Seçili nesne başka birinin arkasında/içinde kalsa da yeniden tutulabilsin.
    const secili = vuruslar.find((v) => anahtari(v.object.userData) === this.seciliNesne);
    const v = secili ?? vuruslar[0];
    return (v && anahtari(v.object.userData)) ?? null;
  }

  /**
   * Tıklanan eşya düzenlenen odaya ait değilse (ör. bir odadan ortak alana
   * çıkarılmış bitki) neden seçilemediği söylenir: o eşya kendi odasının düzenidir.
   */
  private baskasininNesnesi(): void {
    this.isin.setFromCamera(this.fare, this.kamera);
    const hedefler = [...this.nesneler.values()].filter((n) => n.oda.id !== this.duzenlenenOda).map((n) => n.obj);
    const v = this.isin.intersectObjects(hedefler, true)[0];
    const n = v ? this.nesneler.get(v.object.userData.nesne as string) : undefined;
    if (!n) return;
    const ad = this.etiketAdlari[n.oda.id] ?? (n.oda.tur === "ortak" ? "Ortak alan" : "başka bir oda");
    this.onUyari?.(`Bu eşya ${ad} düzenine ait; onu orayı düzenlerken taşıyabilirsin`);
  }

  private duzenBas = (e: PointerEvent): void => {
    if (!this.duzenlenenOda || this.yerlestirme || e.button !== 0) return;
    this.fareKonumu(e);
    const anahtar = this.altindakiNesne();
    if (!anahtar) {
      this.baskasininNesnesi();
      return;
    }
    // Kamera kaydırması bu sürüklemede devre dışı (OrbitControls'un dinleyicisinden önce).
    this.kontrol.enabled = false;
    const n = this.nesneAl(anahtar)!;
    // Mağaza eşyasının bu oturumdaki odası sabitlenir: ortak alana taşınınca da "odası" bilinsin.
    if (n.nesneId.startsWith("esya:") && !this.esyaOdalari.has(n.nesneId.slice(5))) this.esyaOdalari.set(n.nesneId.slice(5), n.oda);
    const p = this.zemineDegen();
    this.surukleme = { anahtar, fark: p ? n.obj.position.clone().sub(p).setY(0) : new THREE.Vector3(), bas: n.obj.position.clone() };
    if (this.seciliNesne !== anahtar) this.secimiAyarla(anahtar);
    this.kap.style.cursor = "grabbing";
  };

  private surukle(): void {
    const s2 = this.surukleme;
    const n = s2 ? this.nesneAl(s2.anahtar) : undefined;
    const p = this.zemineDegen();
    if (!s2 || !n || !p) return;
    const hx = Math.round((p.x + s2.fark.x) * 10) / 10;
    const hz = Math.round((p.z + s2.fark.z) * 10) / 10;
    // Hedefin bölgesi: kendi odası ya da (modül eşyası değilse) ortak alan.
    const hb = this.izinliBolge(n, hx, hz);
    const x = Math.min(hb.x + hb.w, Math.max(hb.x, hx));
    const z = Math.min(hb.z + hb.d, Math.max(hb.z, hz));
    const eski = n.obj.position.clone();
    const eskiBolge = this.izinliBolge(n, eski.x, eski.z);
    // Başka bir eşyanın içine girmez: önce tam hareket, olmazsa tek eksende
    // kayarak (duvara/eşyaya sürtünerek ilerler), o da olmazsa yerinde kalır.
    // Zaten çakışık başladıysa (eski bir kayıt) serbestçe çekip çıkarılabilir.
    s2.kutular ??= this.digerKutulari(n.obj, n.oda);
    const kutular = s2.kutular;
    const serbest = this.cakisiyor(n.obj, n.oda, kutular, undefined, undefined, n.nesneId);
    const dene = (nx: number, nz: number) => {
      n.obj.position.x = nx;
      n.obj.position.z = nz;
      this.duvaraSigdir(n.obj, this.izinliBolge(n, nx, nz));
      return serbest || !this.cakisiyor(n.obj, n.oda, kutular, undefined, undefined, n.nesneId);
    };
    // Küçük adımlarla ilerlenir: hızlı bir fare hareketi tek seferde duvarın ya
    // da eşyanın öbür yanına sıçrayıp içinden geçmesin.
    const adimSayisi = Math.max(1, Math.ceil(Math.hypot(x - eski.x, z - eski.z) / 0.1));
    let cx = eski.x;
    let cz = eski.z;
    for (let i = 1; i <= adimSayisi; i++) {
      const tx = eski.x + ((x - eski.x) * i) / adimSayisi;
      const tz = eski.z + ((z - eski.z) * i) / adimSayisi;
      if (dene(tx, tz) || dene(tx, cz) || dene(cx, tz)) {
        cx = n.obj.position.x;
        cz = n.obj.position.z;
      } else break;
    }
    // Odadan ortak alana (ya da geri) geçerken kapı çoğu eşyaya dar (masa +
    // sandalye 1,4 m, kapı 1,3 m): adımlar duvarda takılırsa ve hedef boşsa
    // eşya doğrudan hedefe konur — "taşıyıp öbür tarafa bırakmak".
    if ((cx !== x || cz !== z) && hb !== eskiBolge && dene(x, z)) {
      cx = n.obj.position.x;
      cz = n.obj.position.z;
    }
    n.obj.position.x = cx;
    n.obj.position.z = cz;
    this.masadakileriTasi(n);
    if (this.secimIzi) {
      n.obj.updateMatrixWorld(true);
      const orta = new THREE.Box3().setFromObject(n.obj).getCenter(new THREE.Vector3());
      this.secimIzi.position.set(orta.x, ZEMIN_Y + 0.01, orta.z);
    }
  }

  private duzenBirak = (): void => {
    if (!this.surukleme) return;
    const { anahtar, bas } = this.surukleme;
    this.surukleme = null;
    this.kontrol.enabled = true;
    this.kap.style.cursor = "grab";
    // Yalnızca tıklandıysa (yer değişmediyse) düzene yazılmaz: yoksa seçmek
    // bile nesneyi "taşınmış" sayıyor, "İlk yerine döndür" boşuna çıkıyordu.
    const n = this.nesneAl(anahtar);
    if (n && n.obj.position.distanceTo(bas) < 0.001) return;
    this.yolIzgarasi = null;
    if (n && this.devret(n)) return;
    this.bildir(anahtar);
  };

  private fareCik = (): void => {
    this.fareVar = false;
    this.ustteyiAyarla(null);
    if (this.hayalet) this.hayalet.visible = false;
  };

  private fareBas = (e: PointerEvent): void => {
    this.basilan = { x: e.clientX, y: e.clientY };
    // Ok tuşları çalışsın diye sahne odak alır (sayfa kaymaz).
    this.kap.focus({ preventScroll: true });
    // Kullanıcı kamerayı tutunca süren geçiş bırakılır.
    this.gecis = null;
    this.girisAnimasyonu = 0;
  };

  private fareBirak = (e: PointerEvent): void => {
    if (!this.basilan) return;
    const surukleme = Math.hypot(e.clientX - this.basilan.x, e.clientY - this.basilan.y) > 6;
    this.basilan = null;
    if (surukleme) return;
    this.fareKonumu(e);
    // Düzenleyicide boş yere tıklamak seçimi bırakır; oda/modül tıklaması çalışmaz.
    if (this.duzenlenenOda && !this.yerlestirme) {
      if (!this.altindakiNesne()) this.secimiAyarla(null);
      return;
    }
    if (this.yerlestirme) {
      this.hayaletiGuncelle();
      if (this.hayaletGecerli && this.hayalet) {
        this.onYerlestir?.({ id: this.yerlestirme.id, tur: this.yerlestirme.tur, x: this.hayalet.position.x, z: this.hayalet.position.z, don: this.yerlestirme.don });
      }
      return;
    }
    this.isinla();
    const u = this.ustteki;
    if (!u) return;
    if (u.tur === "esya" && this.duzenleme) this.onEsyaTikla?.(u.id, { x: e.clientX, y: e.clientY });
    else if (u.tur === "oda") this.onOdaTikla?.(u.id);
    else if (u.tur === "lio") this.onLioTikla?.();
    else if (u.tur === "ajan") this.onAjanTikla?.();
    else if (u.tur === "modul") {
      const [odaId, key] = u.id.split("|");
      this.onModulTikla?.(odaId, key);
    }
  };

  private tus = (e: KeyboardEvent): void => {
    if (this.duzenlenenOda && !this.yerlestirme) {
      // Yazı alanındayken (ör. Lio kutusu) tuşlar düzenleyiciye gitmesin.
      const hedef = e.target as HTMLElement | null;
      if (hedef && (hedef.tagName === "INPUT" || hedef.tagName === "TEXTAREA" || hedef.isContentEditable)) return;
      if (!this.seciliNesne) return;
      // R: 90°, Shift+R: 45° (saat yönünde); Q / E: 45° sola / sağa.
      if (e.key === "r" || e.key === "R") this.seciliyiDondur(e.shiftKey ? 45 : 90);
      else if (e.key === "q" || e.key === "Q") this.seciliyiDondur(-45);
      else if (e.key === "e" || e.key === "E") this.seciliyiDondur(45);
      else if (e.key === "Delete" || e.key === "Backspace") this.seciliyiKaldir();
      else if (e.key === "Escape") this.secimiAyarla(null);
      return;
    }
    if (!this.yerlestirme) {
      if (e.key === "Escape" && this.icerdekiOda) {
        this.odadanCik();
        this.onOdadanCikildi?.();
      }
      return;
    }
    if (e.key === "r" || e.key === "R") this.dondur();
    else if (e.key === "Escape") this.onIptal?.();
  };

  private zemineDegen(): THREE.Vector3 | null {
    this.isin.setFromCamera(this.fare, this.kamera);
    const p = new THREE.Vector3();
    return this.isin.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -ZEMIN_Y), p) ? p : null;
  }

  private hayaletiGuncelle(): void {
    const y = this.yerlestirme;
    if (!y || !this.hayalet || !this.plan) return;
    const p = this.zemineDegen();
    if (!p) return;
    const x = izgarayaOturt(p.x);
    const z = izgarayaOturt(p.z);
    this.hayalet.visible = true;
    this.hayalet.position.set(x, ZEMIN_Y, z);
    this.hayalet.rotation.y = (-y.don * Math.PI) / 2;
    this.hayaletGecerli =
      yerlestirilebilir({ tur: y.tur, x, z, don: y.don }, this.plan, this.esyalar, y.id) &&
      // Hayaletin ilk çocuğu modelin kendisi (ikincisi zemin izi düzlemi).
      !this.sahneyeCarpiyor(this.hayalet.children[0], y);
    // Zemin izi grupla birlikte döndüğü için dönmemiş ölçüyle ölçeklenir.
    const kat = katalogEsyasi(y.tur);
    this.hayaletZemin!.scale.set(kat?.w ?? 1, kat?.d ?? 1, 1);
    (this.hayaletZemin!.material as THREE.MeshBasicMaterial).color.set(this.hayaletGecerli ? marka().basari : marka().tehlike);
    this.kap.style.cursor = this.hayaletGecerli ? "copy" : "not-allowed";
  }

  private isinla(): void {
    if (this.yerlestirme) return;
    if (this.duzenlenenOda) {
      if (!this.surukleme) this.kap.style.cursor = this.altindakiNesne() ? "grab" : "";
      return;
    }
    this.isin.setFromCamera(this.fare, this.kamera);
    const hedefler: THREE.Object3D[] = [
      ...this.kisiGrubu.children,
      ...(this.lio ? [this.lio.obj] : []),
      ...(this.ajan?.obj.visible ? [this.ajan.obj] : []),
      ...(this.duzenleme ? this.esyaGrubu.children : []),
      ...this.modulNesneleri.values(),
      ...this.zeminler,
    ];
    const vurus = this.isin.intersectObjects(hedefler, true)[0];
    let yeni: OfisMotoru["ustteki"] = null;
    if (vurus) {
      const ud = vurus.object.userData;
      if (ud.kisiId) yeni = { tur: "kisi", id: ud.kisiId };
      else if (ud.lio) yeni = { tur: "lio", id: "lio" };
      else if (ud.ajan) yeni = { tur: "ajan", id: "ajan" };
      else if (ud.modul && !this.duzenleme) yeni = { tur: "modul", id: ud.modul };
      else if (ud.esyaId) yeni = { tur: "esya", id: ud.esyaId };
      else if (ud.odaId) {
        const oda = this.plan?.odalar.find((o) => o.id === ud.odaId);
        if (oda && (oda.tur === "departman" || oda.tur === "toplanti" || (oda.tur === "ortak" && this.ortakGirilebilir)))
          yeni = { tur: "oda", id: ud.odaId };
      }
    }
    this.ustteyiAyarla(yeni);
  }

  private ustteyiAyarla(yeni: OfisMotoru["ustteki"]): void {
    const eski = this.ustteki;
    if (eski?.tur === yeni?.tur && eski?.id === yeni?.id) return;
    if (eski?.tur === "oda") {
      const z = this.zeminler.find((m) => m.userData.odaId === eski.id);
      if (z) (z.material as THREE.MeshStandardMaterial).emissive.set("#000000");
    }
    if (eski?.tur === "esya") this.esyaNesneleri.get(eski.id)?.scale.setScalar(1);
    if (eski?.tur === "modul") this.modulNesneleri.get(eski.id)?.scale.setScalar(1);
    this.ustteki = yeni;
    this.kisiEtiketi.visible = false;
    this.kap.style.cursor = "";
    if (!yeni) return;
    if (yeni.tur === "oda") {
      const z = this.zeminler.find((m) => m.userData.odaId === yeni.id);
      if (z) (z.material as THREE.MeshStandardMaterial).emissive.set(marka().vurgu).multiplyScalar(0.18);
      this.kap.style.cursor = "pointer";
    } else if (yeni.tur === "esya") {
      this.esyaNesneleri.get(yeni.id)?.scale.setScalar(1.08);
      this.kap.style.cursor = "pointer";
    } else if (yeni.tur === "modul") {
      // Modül eşyası: hafifçe büyür, üstünde modülün adı ve "aç" ipucu.
      const o = this.modulNesneleri.get(yeni.id);
      if (o) {
        o.scale.setScalar(1.05);
        const el = this.kisiEtiketi.element;
        el.textContent = "";
        const b = document.createElement("b");
        b.textContent = this.modulAdlari.get(yeni.id.split("|")[1]) ?? "Modül";
        el.appendChild(b);
        const s = document.createElement("small");
        const key = yeni.id.split("|")[1];
        s.textContent =
          key === KASA_MODULU ? "Tıkla, kasayı aç" : key.startsWith(PROJE_ONEKI) ? "Tıkla, projeyi aç" : key === KUPA_RAFI ? "Biten projeler" : "Tıkla, modülü aç";
        el.appendChild(s);
        this.sahne.add(this.kisiEtiketi);
        this.kisiEtiketi.position.set(o.position.x, 2.05, o.position.z);
        this.kisiEtiketi.visible = true;
      }
      this.kap.style.cursor = "pointer";
    } else if (yeni.tur === "ajan") {
      if (this.ajan && this.ajanBilgisi) {
        const el = this.kisiEtiketi.element;
        el.textContent = "";
        const b = document.createElement("b");
        b.textContent = this.ajanBilgisi.ad;
        el.appendChild(b);
        const s = document.createElement("small");
        const hal = this.ajanBilgisi.hal;
        s.textContent =
          hal === "uyuyor"
            ? "Uyuyor (Mac kapalı) · Tıkla"
            : hal === "calisiyor"
              ? `${this.ajanBilgisi.not ?? "Çalışıyor"} · Tıkla`
              : this.ajanBilgisi.haber
                ? "Sana haberi var · Tıkla"
                : "Tıkla, konuş";
        el.appendChild(s);
        this.ajan.obj.add(this.kisiEtiketi);
        this.kisiEtiketi.position.set(0, 1.55, 0);
        this.kisiEtiketi.visible = true;
        this.kap.style.cursor = "pointer";
      }
    } else if (yeni.tur === "lio") {
      if (this.lio) {
        const el = this.kisiEtiketi.element;
        el.textContent = "";
        const b = document.createElement("b");
        b.textContent = "Lio";
        el.appendChild(b);
        const s = document.createElement("small");
        s.textContent = "Tıkla, sohbet et";
        el.appendChild(s);
        this.lio.obj.add(this.kisiEtiketi);
        this.kisiEtiketi.position.set(0, 1.45, 0);
        this.kisiEtiketi.visible = true;
        this.kap.style.cursor = "pointer";
      }
    } else {
      const k = this.karakterler.find((c) => c.veri.id === yeni.id);
      if (k) {
        const el = this.kisiEtiketi.element;
        el.textContent = "";
        const b = document.createElement("b");
        b.textContent = k.veri.ben ? `${k.veri.ad} (sen)` : k.veri.ad;
        el.appendChild(b);
        if (k.veri.cevrimici) {
          const s = document.createElement("small");
          s.textContent = "çevrimiçi";
          el.appendChild(s);
        }
        k.k3.nesne.add(this.kisiEtiketi);
        this.kisiEtiketi.position.set(0, 2.0, 0);
        this.kisiEtiketi.visible = true;
      }
    }
  }
}
