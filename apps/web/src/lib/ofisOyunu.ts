// 3D ofis oyununun saf kuralları (bkz. components/ofis3d/, pages/Yeni.tsx).
//
// React'ten ve three.js'ten bağımsız tutuldu ki test edilebilsin: ofis planı
// (hangi departman nerede, kaç masa), puan hesabı, mağaza kataloğu, eşyanın
// bir yere konup konamayacağı ve tarayıcıdaki kaydın biçimi burada. Sahne
// yalnızca bunu çizer.
//
// Birim: 1 = yaklaşık 1 metre. Kamera güneyden ve biraz doğudan baktığı için
// kuzey (−z) ve batı (−x) duvarları "arka" duvarlardır.
//
// Yerleşim referans görseldeki gibi ASİMETRİK: ortada ortak alan, çevresinde
// boyu, derinliği ve ortak alana uzaklığı birbirinden farklı odalar. Dış hat
// basamaklıdır (toplantı odası aşağı sarkar, bazı odalar geride kalır); oda
// ile ortak alan arasında kalan boşluklar ortak alana katılan "koridor"
// girintileridir. Yaklaşık şekil:
//
//   ┌──────┐┌──────────┐
//   │ Ürün ││Pazarlama │┌────────┐
//   └──────┘└──┬───────┘│Toplantı│
//   ┌─────┐    │        └────────┘
//   │Satış│  Ortak alan   ┌────────┐
//   └─────┘               │Operasyn│
//   ┌────────┐ ┌──────┐   └────────┘
//   │ Finans │ │giriş │  ┌───────┐
//   └────────┘ └──────┘  │  İK   │
//                        └───────┘
//
// Plan önce kutular olarak kurulur, sonra desimetrelik bir ızgaraya dökülür:
// hangi hücre oda, hangisi ortak alan, hangisi dışarısı — duvarlar, kapılar ve
// girintiler bu ızgaradan çıkar. Böylece kaç departman olursa olsun duvarlar
// kendiliğinden doğru yerde biter.

import type { OdaDuzeni } from "@projelio/shared";

export interface Dikdortgen {
  x: number;
  z: number;
  w: number;
  d: number;
}

export type OdaTuru = "departman" | "toplanti" | "ortak" | "giris" | "koridor" | "teras";

export interface Masa {
  x: number;
  z: number;
  /** Sandalye masanın kuzeyinde mi (true) güneyinde mi. Kişi sandalyeye bakar yöne oturur. */
  kuzey: boolean;
  /**
   * Masanın dönüşü (radyan): 0 → kişi kuzeyde oturup güneye bakar, π → tersi.
   * Oda düzenleyicisinde masa döndürülebildiği için `kuzey`in genel hâli.
   */
  don: number;
  /** Departman yöneticisinin geniş masası: ekip sıralarının ucunda, ekibe bakar. */
  patron?: boolean;
}

export interface OfisOdasi extends Dikdortgen {
  id: string;
  tur: OdaTuru;
  /** Ortak alana açılan kapının ortası (duvarın üstünde). */
  kapi: { x: number; z: number };
  /** Kapıdan dışarı (ortak alana) bakan birim yön. */
  kapiYonu: { x: number; z: number };
  masalar: Masa[];
  /** Masalara sığmayan üye sayısı ("+N" olarak gösterilir). */
  sigmayan: number;
  /** Odada eşyası duran modüller ve yerleri (bkz. MODUL_ESYALARI). */
  moduller: ModulYeri[];
  /** Yer kalmadığı için eşyası çizilemeyen modüller (oda panelinde listelenir). */
  sigmayanModuller: string[];
  /** Odanın kendi engelleri (masalar, modül eşyaları, toplantı masası). */
  engeller: Dikdortgen[];
  /** Kullanıcının bu odaya kaydettiği düzen (motor dekor nesnelerine uygular). */
  duzen?: OdaDuzeni;
}

export interface ModulYeri {
  key: string;
  x: number;
  z: number;
  /** Eşyanın önünün baktığı yön (radyan): duvardan odanın içine. */
  don: number;
}

export type DuvarTuru = "kalin" | "alcak" | "cam";

/** Bir duvar parçası: eksene paralel bir doğru, isteğe bağlı kapı boşluğuyla. */
export interface Duvar {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  tur: DuvarTuru;
  /** Kapı boşluğunun ortası (duvar boyunca) ve genişliği. */
  kapi?: { orta: number; genislik: number };
}

export interface OfisPlani {
  genislik: number;
  derinlik: number;
  odalar: OfisOdasi[];
  duvarlar: Duvar[];
  /** Güney kenarındaki giriş (paspasın yeri). */
  giris: { x: number; z: number };
  /** Ortak alandaki oturma grubunun ortası. */
  oturma: { x: number; z: number };
  /** Kahve köşesi: ortak alanın batı duvarında; `don` köşenin baktığı yön (radyan). */
  kahve: { x: number; z: number; don: number };
  /** Büyük ortak alandaki ek köşeler: ikinci oturma grubu, ortak çalışma masası. */
  koseler: { tur: "oturma" | "calisma"; x: number; z: number }[];
  /** Odalara ait olmayan sabit alanlar: oturma grubu, kahve köşesi, giriş, ek köşeler. */
  ortakEngeller: Dikdortgen[];
  /** Eşya konamayacak bütün alanlar: ortak engeller + odaların engelleri. */
  engeller: Dikdortgen[];
}

export const ODA_DERINLIK = 5.4;
const MASA_ARALIK = 1.5;
/** Karşılıklı iki masanın ortaları arası yarım mesafe (Kenney masası ~0,95 m derin). */
const MASA_ORTA = 0.5;
/** Sandalyenin (oturan kişinin) masa ortasına uzaklığı. */
export const KOLTUK_UZAKLIK = 0.82;
/** Yönetici masası daha derin: koltuğu masadan biraz daha geride. */
export const PATRON_KOLTUK = 1.0;
/** Yönetici masasının odaya eklediği genişlik (masa + koltuk + aradaki geçit). */
const PATRON_EK = 3.0;

/** Masaya göre koltuğun uzaklığı (yönetici masası daha derin). */
export function koltukUzakligi(m: Pick<Masa, "patron">): number {
  return m.patron ? PATRON_KOLTUK : KOLTUK_UZAKLIK;
}
const EN_COK_MASA = 8;
const KAPI = 1.3;

// Izgara birimi desimetre: bütün ölçüler bu birimde tam sayıdır.
const DM = 10;
/** Köşe odasının ortak alana taşması gereken en az pay (kapı + iki yanı), dm. */
const TASMA = 24;
const GIRIS_EN = 36;
const EN_DAR_ORTA = 90;
const EN_SIG_ORTA = 70;

// Asimetri desenleri (dm): oda sırası ilerledikçe dönüşümlü uygulanır. Rastgele
// değil — aynı şirket her açılışta aynı ofisi görsün.
/** Oda ile ortak alan arası cep (koridor girintisi). */
const CEP = [0, 12, 4, 0, 9, 6, 14, 2];
/** Oda derinliği (ortak alana dik yön). */
const DERIN = [52, 62, 56, 66, 50, 60, 58];
/** Masa kümesinin ötesinde odaya eklenen genişlik. */
const EK_EN = [6, 0, 12, 4, 9, 2, 14];
/** Yan sütun odalarının boy payları (sütunu bölerken ağırlık). */
const BOY = [10, 7, 9, 6, 8];

function desen(a: number[], i: number): number {
  return a[((i % a.length) + a.length) % a.length];
}

function odaGenisligi(masa: number, patron = false): number {
  const sutun = Math.ceil(masa / 2);
  return Math.max(5, sutun * MASA_ARALIK + 2.6 + (patron ? PATRON_EK : 0));
}

/**
 * Masa kümesi odanın ortasına dizilir (iki karşılıklı sıra). Yöneticisi olan
 * odada küme sola kayar ve sıraların doğu ucuna yöneticinin geniş masası
 * konur; yönetici doğuda oturup batıya, ekibe bakar. Yönetici masası listenin
 * SONUNDADIR: ekip masalarının sırası (ve kayıtlı düzenlerdeki "masa-N") değişmez.
 */
function masalariDiz(oda: Dikdortgen, adet: number, patron = false): Masa[] {
  const sutun = Math.ceil(adet / 2);
  const kume = sutun * MASA_ARALIK;
  const ek = patron ? PATRON_EK : 0;
  const bas = oda.x + (oda.w - kume - ek) / 2 + MASA_ARALIK / 2;
  const orta = oda.z + oda.d / 2;
  const masalar: Masa[] = [];
  for (let i = 0; i < adet; i++) {
    const c = Math.floor(i / 2);
    const kuzey = i % 2 === 0;
    masalar.push({ x: bas + c * MASA_ARALIK, z: kuzey ? orta - MASA_ORTA : orta + MASA_ORTA, kuzey, don: kuzey ? 0 : Math.PI });
  }
  if (patron) {
    // Masa kümenin sağ kenarından yürünecek bir geçit (≈0,7 m) ötede, koltuğu
    // onun da doğusunda. İz masanın 0,65 m önünden koltuğun 1,45 m arkasına
    // uzanır; ekip yoksa bu iz odada ortalanır.
    const sag = bas - MASA_ARALIK / 2 + kume;
    const x = adet ? sag + 1.35 : oda.x + oda.w / 2 - 0.4;
    masalar.push({ x, z: orta, kuzey: false, don: -Math.PI / 2, patron: true });
  }
  return masalar;
}

interface Hucre {
  id: string;
  tur: OdaTuru;
  masa: number;
  /** Departmanın yöneticisi var: odaya geniş yönetici masası konur (masa sayısına dahil değil). */
  patron?: boolean;
  kisi: number;
  moduller: string[];
}

const TOPLANTI: Hucre = { id: "toplanti", tur: "toplanti", masa: 0, kisi: 0, moduller: [] };

// ------------------------------------------------------------------ modül eşyaları

/**
 * Projelio modülleri odada bir eşya olarak durur; eşyaya tıklayınca modül açılır.
 * Eşleştirme kullanıcıyla birlikte kararlaştırıldı (Satış ve Pazarlama ile
 * başlandı); listede olmayan modülün odada eşyası yoktur, yalnızca oda
 * panelinde görünür.
 */
export type ModulEsyasi =
  | "kanban"
  | "dosyaDolabi"
  | "mantarPano"
  | "kure"
  | "kitaplik"
  | "markaPosteri"
  | "personaPanosu"
  | "buyukEkran"
  | "dizustu"
  | "halkaIsik"
  | "mektupKutusu"
  | "reklamPanosu"
  | "urunKutulari"
  | "huni"
  | "dartTahtasi"
  | "kasa"
  | "projeIstasyonu"
  | "kupaRafi";

/**
 * Yönetim odasındaki para kasası: bir modül değil, şirketin Kasa sayfası
 * (gelir/gider defteri). Modül eşyalarıyla aynı yoldan konup taşındığı için
 * sahte bir modül anahtarıyla taşınır; tıklanınca sayfa değil modal açılır.
 * Gerçek modül anahtarlarıyla çakışmasın diye çift alt çizgiyle başlar.
 */
export const KASA_MODULU = "__kasa";

/**
 * Stüdyoda (bkz. lib/studyoOfisi.ts) işin her aktif projesi odada bir iş
 * istasyonudur; biten projeler kupa rafında plaket olarak durur. İkisi de kasa gibi modül
 * eşyası yolundan gider (odada kalır, taşınır, kaydedilir): proje istasyonunun
 * anahtarı "proje_<proje kimliği>".
 */
export const PROJE_ONEKI = "proje_";
export const KUPA_RAFI = "__kupalar";

/** Proje istasyonunun yüzünde (ve kupa rafında) yazanlar. */
export interface IstasyonBilgisi {
  /** Biten / toplam üst görev. */
  biten: number;
  toplam: number;
  /** Teslim günü (YYYY-MM-DD). */
  teslim?: string;
  /** Teslimi geçti ve proje bitmedi: istasyonun ışığı kırmızı yanar. */
  gecikti?: boolean;
  /** Teslime 3 gün ya da daha az kaldı: ışık sarı. */
  yaklasti?: boolean;
  /** Kupa rafı: biten proje sayısı. */
  kupa?: number;
  /** Kupa rafı: rafta plaket olarak duran biten projeler (en yenisi önce). */
  plaketler?: Plaket[];
}

/** Kupa rafında biten bir projenin plaketi: kapağı ve adı yazılı. */
export interface Plaket {
  projeId: string;
  ad: string;
  /** Projenin coverImageUrl'i (fotoğraf ya da "preset:<key>"); boşsa kimlikten türetilir. */
  kapak?: string;
  /** Plaketin altında yazan tarih (YYYY-MM-DD): teslim günü, yoksa açılış. */
  tarih?: string;
}

/** Kupa rafına sığan plaket sayısı (3 raf × 4); fazlası sergi odasına (ileride). */
export const RAF_KAPASITESI = 12;

/** Anahtarın odadaki eşyası (proje istasyonları dahil); yoksa undefined. */
export function modulEsyasiTuru(key: string): ModulEsyasi | undefined {
  return key.startsWith(PROJE_ONEKI) ? "projeIstasyonu" : MODUL_ESYALARI[key];
}

export const MODUL_ESYALARI: Record<string, ModulEsyasi> = {
  // Satış ve İş Geliştirme
  spd_satis_planlama_b2b_b2c: "kanban",
  crm_musteri: "dosyaDolabi",
  baglantilar: "mantarPano",
  spd_ortaklik_dagitim: "kure",
  spd_pazar_arastirma: "kitaplik",
  // Pazarlama ve Büyüme
  pd_marka_kimligi: "markaPosteri",
  pd_rakip_sektor_analizi: "kitaplik",
  pd_hedef_kitle: "personaPanosu",
  pd_dijital_pazarlama: "buyukEkran",
  pd_dijital_pazarlama_seo_sem: "dizustu",
  pd_sosyal_medya: "halkaIsik",
  pd_email: "mektupKutusu",
  pd_reklam: "reklamPanosu",
  pd_urun_stratejileri: "urunKutulari",
  pd_musteri_kazanim_optimizasyonu: "huni",
  pd_buyume_hedefleri: "dartTahtasi",
  [KASA_MODULU]: "kasa",
  [KUPA_RAFI]: "kupaRafi",
};

/**
 * Kameranın yatay bakış yönünün tersi (kameraya doğru), bkz. OfisMotoru
 * KAMERA_YATAY: kamera güneyden ve hafif doğudan bakar.
 */
const KAMERA_YONU = { x: Math.sin(0.17), z: Math.cos(0.17) };

/** Bir modül eşyasının zemindeki izi (duvar boyunca × duvardan içeri), metre. */
const MODUL_IZ = { boy: 0.9, derin: 0.7 };
const MODUL_ARALIK = 1.1;
/** Duvar ile eşyanın arkası arası pay. */
const MODUL_PAY = 0.12;

/**
 * Odanın duvarları boyunca modül eşyalarının yerleri: önce kapının karşısındaki
 * dış duvar, sonra iki yan duvar. Köşeler (bitki) ve kapı tarafı (giriş yolu)
 * boş kalır; masa kümesine değen yer atlanır. Sığan kadar yer döner.
 */
export function modulYerleri(
  oda: Dikdortgen,
  kapiYonu: { x: number; z: number },
  masaEngel: Dikdortgen | null,
  adet: number
): { x: number; z: number; don: number }[] {
  if (adet <= 0) return [];
  const yan = { x: kapiYonu.z, z: kapiYonu.x };
  // İç normaller: dış duvarın normali kapıya doğru (kapiYonu), yan duvarlarınki ona dik.
  // Kameraya dönük duvarlar önce dolar: kameraya yakın (güney) duvardaki pano
  // yüzünü odanın içine, yani kameradan öteye çevirir ve arkasıyla görünürdü.
  // O duvarlar yalnızca başka yer kalmazsa kullanılır.
  const kameraya = (n: { x: number; z: number }) => n.x * KAMERA_YONU.x + n.z * KAMERA_YONU.z;
  const tum = [{ x: kapiYonu.x, z: kapiYonu.z }, yan, { x: -yan.x, z: -yan.z }];
  const duvarlar = [...tum.filter((n) => kameraya(n) > -0.3), ...tum.filter((n) => kameraya(n) <= -0.3)];
  const kapiDuvari = kapiYonu.z !== 0 ? (kapiYonu.z > 0 ? oda.z + oda.d : oda.z) : kapiYonu.x > 0 ? oda.x + oda.w : oda.x;
  const sonuc: { x: number; z: number; don: number; alan: Dikdortgen }[] = [];
  const derinOrta = MODUL_PAY + MODUL_IZ.derin / 2;
  const genis = (r: Dikdortgen, p: number) => ({ x: r.x - p, z: r.z - p, w: r.w + 2 * p, d: r.d + 2 * p });
  // Köşelerde bitki durur (köşeden ~0,5 m, yaprakları ~0,4 m yayılır): köşeye
  // bitişik yerler ancak ikinci turda, başka yer kalmazsa kullanılır — yoksa
  // odadaki tek eşya (ör. Yönetim'deki kasa) bitkinin arkasında kalıyordu.
  for (const koseDahil of [false, true]) {
    for (const n of duvarlar) {
      // Duvarın yeri ve boyu: iç normal +z ise kuzey duvarı, −z ise güney, +x batı, −x doğu.
      const yatay = n.z !== 0;
      const sabit = yatay ? (n.z > 0 ? oda.z : oda.z + oda.d) : n.x > 0 ? oda.x : oda.x + oda.w;
      const bas = yatay ? oda.x : oda.z;
      const boy = yatay ? oda.w : oda.d;
      for (let s = 0.95; s <= boy - 0.95 + 1e-9; s += MODUL_ARALIK) {
        if (!koseDahil && (s < 1.35 || s > boy - 1.35)) continue;
        const x = yatay ? bas + s : sabit + n.x * derinOrta;
        const z = yatay ? sabit + n.z * derinOrta : bas + s;
        const kapiyaUzak = kapiYonu.z !== 0 ? Math.abs(z - kapiDuvari) : Math.abs(x - kapiDuvari);
        if (kapiyaUzak < 1.4) continue;
        const alan: Dikdortgen = yatay
          ? { x: x - MODUL_IZ.boy / 2, z: z - MODUL_IZ.derin / 2, w: MODUL_IZ.boy, d: MODUL_IZ.derin }
          : { x: x - MODUL_IZ.derin / 2, z: z - MODUL_IZ.boy / 2, w: MODUL_IZ.derin, d: MODUL_IZ.boy };
        if (masaEngel && kesisir(genis(alan, 0.15), masaEngel)) continue;
        if (sonuc.some((o) => kesisir(genis(alan, 0.08), o.alan))) continue;
        // Kameradan öteye bakan duvardaki eşya kameraya döner (cam duvarın önünde
        // vitrin gibi); yoksa arkasıyla görünürdü.
        const don = kameraya(n) <= -0.3 ? Math.atan2(-n.x, -n.z) : Math.atan2(n.x, n.z);
        sonuc.push({ x, z, don, alan });
        if (sonuc.length >= adet) break;
      }
      if (sonuc.length >= adet) break;
    }
    if (sonuc.length >= adet) break;
  }
  return sonuc.map(({ x, z, don }) => ({ x, z, don }));
}

/** Masa kümesinin engel dikdörtgeni (oda içinde, masalar varsa). */
function masaEngeli(kt: Dikdortgen, masalar: Masa[]): Dikdortgen | null {
  if (!masalar.length) return null;
  const ekip = masalar.filter((mm) => !mm.patron);
  const patron = masalar.find((mm) => mm.patron);
  const yari = MASA_ORTA + KOLTUK_UZAKLIK + 0.3;
  const kume = ekip.length
    ? (() => {
        const xs = ekip.map((mm) => mm.x);
        return { x: Math.min(...xs) - 0.75, z: kt.z + kt.d / 2 - yari, w: Math.max(...xs) - Math.min(...xs) + 1.5, d: yari * 2 };
      })()
    : null;
  if (!patron) return kume;
  // Yönetici masası kümeyle birlikte tek engel (modül eşyaları ikisinin arasına girmesin).
  const p = masaAlani(patron);
  if (!kume) return p;
  const x1 = Math.min(kume.x, p.x);
  const z1 = Math.min(kume.z, p.z);
  return { x: x1, z: z1, w: Math.max(kume.x + kume.w, p.x + p.w) - x1, d: Math.max(kume.z + kume.d, p.z + p.d) - z1 };
}

/** Desimetre cinsinden kutu. */
interface K {
  x: number;
  z: number;
  w: number;
  d: number;
}

const DISARI = -9;
const BILINMIYOR = -1;
const ORTAK = -2;
const GIRIS_E = -3;
const KORIDOR = -4;

/**
 * Departmanlardan ofis planı. Departman ve toplantı odası sayısına göre üst
 * sıra, yan sütunlar (her yanda 0–3 oda) ve alt sıra dolar; ofis genişleyerek
 * büyür. Departmanı olmayan şirkette yalnızca ortak alan ve toplantı odası
 * çıkar — olmayan departmanın odası da yoktur.
 */
export function ofisPlani(departmanlar: { id: string; kisi: number; moduller?: string[]; yonetici?: boolean }[]): OfisPlani {
  const hucreler: Hucre[] = departmanlar.map((d) => {
    // Yönetici kendi masasında oturur; ekip masaları geri kalanlar için.
    const ekip = d.kisi - (d.yonetici ? 1 : 0);
    return {
    id: d.id,
    tur: "departman",
    patron: !!d.yonetici,
    masa: d.yonetici && ekip <= 0 ? 0 : Math.min(EN_COK_MASA, Math.max(2, ekip + (ekip % 2))),
    kisi: d.kisi,
    // Yalnızca odada eşyası olan modüller yer kaplar.
    moduller: (d.moduller ?? []).filter((k) => modulEsyasiTuru(k)),
    };
  });
  const k = hucreler.length + 1;
  const yanSira = k <= 5 ? 0 : k <= 8 ? 1 : k <= 14 ? 2 : 3;
  const kalan = k - 2 * yanSira;
  const ustSay = Math.ceil(kalan / 2);
  const altSay = kalan - ustSay;
  const altSolSay = Math.ceil(altSay / 2);

  // Sıra: üst sıra soldan sağa (son hücre toplantı), sol yan, sağ yan, alt sol (girişten dışa), alt sağ.
  const sirali = [...hucreler];
  const ust = [...sirali.splice(0, ustSay - 1), TOPLANTI];
  const sol = sirali.splice(0, yanSira);
  const sag = sirali.splice(0, yanSira);
  const altSol = sirali.splice(0, altSolSay);
  const altSag = sirali.splice(0, altSay - altSolSay);

  // Modülü çok olan oda, eşyaları duvar boyunca sığsın diye genişler (yarım metre adımlarla).
  const modulEk = (h: Hucre, w: number) => {
    let ek = 0;
    while (ek < 90) {
      const kt = { x: 0, z: 0, w: (w + ek) / DM, d: ODA_DERINLIK };
      const masalar = masalariDiz(kt, h.masa, h.patron);
      // En kısıtlı yönelime göre (sol sütun: kapı doğuda) — oda nereye düşerse düşsün sığsın.
      const sigan = Math.min(
        modulYerleri(kt, { x: 0, z: 1 }, masaEngeli(kt, masalar), h.moduller.length).length,
        modulYerleri(kt, { x: 1, z: 0 }, masaEngeli(kt, masalar), h.moduller.length).length,
        modulYerleri(kt, { x: -1, z: 0 }, masaEngeli(kt, masalar), h.moduller.length).length,
        modulYerleri(kt, { x: 0, z: -1 }, masaEngeli(kt, masalar), h.moduller.length).length
      );
      if (sigan >= h.moduller.length) break;
      ek += 5;
    }
    return ek;
  };
  const en = (h: Hucre, i: number) => {
    const w = Math.round((h.tur === "departman" ? odaGenisligi(h.masa, h.patron) : 5.2) * DM) + desen(EK_EN, i);
    return h.moduller.length ? w + modulEk(h, w) : w;
  };
  const derin = (h: Hucre, i: number) => (h.tur === "toplanti" ? 46 : desen(DERIN, i));
  // Toplantı odası referanstaki gibi aşağı sarkar: ortak alana en yakın oda o.
  const cep = (h: Hucre, i: number) => (h.tur === "toplanti" ? 0 : desen(CEP, i));

  // Yan sütunlar: x yönünde genişlik ve cep, z yönünde boy payı.
  const yanBilgi = (hs: Hucre[], kaydir: number) =>
    hs.map((h, i) => ({ h, w: en(h, i + kaydir), cep: desen(CEP, i + kaydir + 3), boy: desen(BOY, i + kaydir) }));
  const solB = yanBilgi(sol, 2);
  const sagB = yanBilgi(sag, 5);
  const L = Math.max(0, ...solB.map((b) => b.w + b.cep));
  const R = Math.max(0, ...sagB.map((b) => b.w + b.cep));

  const ustB = ust.map((h, i) => ({ h, w: en(h, i), d: derin(h, i), cep: cep(h, i + 1) }));
  if (L && ustB.length > 1) ustB[0].w = Math.max(ustB[0].w, L + TASMA + 6);
  const ustToplam = ustB.reduce((t, b) => t + b.w, 0);

  const altSolB = altSol.map((h, i) => ({ h, w: en(h, i + 4), d: derin(h, i + 3), cep: desen(CEP, i + 5) }));
  const altSagB = altSag.map((h, i) => ({ h, w: en(h, i + 6), d: derin(h, i + 1), cep: desen(CEP, i + 2) }));
  const disHaric = (bs: { w: number }[]) => bs.slice(0, -1).reduce((t, b) => t + b.w, 0);

  // Ortak alanın genişliği: üst sıranın son odası ve alt sıranın en dış odaları
  // da ortak alana değsin (en az TASMA kadar).
  const ortaW = Math.max(
    EN_DAR_ORTA,
    ustB.length > 1 ? ustToplam - ustB[ustB.length - 1].w - L + TASMA : 0,
    altSay ? GIRIS_EN + 2 * Math.max(disHaric(altSolB), disHaric(altSagB)) + 2 * TASMA : 0
  );
  const toplamBoy = (bs: { boy: number }[]) => bs.reduce((t, b) => t + b.boy, 0);
  // Yan sütun odaları ortak alanın derinliğini paylaşır. Modülü olan oda en az
  // bir oda derinliği (5,4 m) alır — eşyaları duvara sığsın; gerekirse sütun
  // (ve ortak alan) uzar, komşu oda sıkıştırılmaz.
  const enAz = (b: (typeof solB)[number]) => (b.h.moduller.length ? Math.round(ODA_DERINLIK * DM) : 40);
  const sutunEnAz = (bs: typeof solB) => bs.reduce((t, b) => t + enAz(b), 0);
  const ortaD = Math.max(EN_SIG_ORTA, yanSira * 50, sutunEnAz(solB), sutunEnAz(sagB));

  const cx0 = L;
  const cx1 = L + ortaW;
  const cz0 = Math.max(...ustB.map((b) => b.d + b.cep));
  const cz1 = cz0 + ortaD;

  const kutular: { h: Hucre; k: K }[] = [];
  // Üst sıra (tek oda varsa ortak alanın üstünde ortalanır)
  let x = ustB.length === 1 ? cx0 + Math.max(0, (ortaW - ustB[0].w) / 2) : 0;
  for (const b of ustB) {
    kutular.push({ h: b.h, k: { x, z: cz0 - b.cep - b.d, w: b.w, d: b.d } });
    x += b.w;
  }
  // Yan sütunlar: boy payına göre ortak alanın derinliğine bölünür.
  const yanDiz = (bs: typeof solB, solda: boolean) => {
    // Önce herkese en az payı, kalan derinlik boy desenine göre (asimetri) dağıtılır.
    const pay = toplamBoy(bs);
    const artan = ortaD - sutunEnAz(bs);
    let z = cz0;
    bs.forEach((b, i) => {
      const d = i === bs.length - 1 ? cz1 - z : enAz(b) + Math.round((artan * b.boy) / pay);
      kutular.push({ h: b.h, k: { x: solda ? cx0 - b.cep - b.w : cx1 + b.cep, z, w: b.w, d } });
      z += d;
    });
  };
  yanDiz(solB, true);
  yanDiz(sagB, false);
  // Alt sıra: girişten dışa doğru.
  const eL = cx0 + Math.round((ortaW - GIRIS_EN) / 2);
  const eR = eL + GIRIS_EN;
  let xs = eL;
  for (const b of altSolB) {
    xs -= b.w;
    kutular.push({ h: b.h, k: { x: xs, z: cz1 + b.cep, w: b.w, d: b.d } });
  }
  xs = eR;
  for (const b of altSagB) {
    kutular.push({ h: b.h, k: { x: xs, z: cz1 + b.cep, w: b.w, d: b.d } });
    xs += b.w;
  }
  const girisD = altSay ? Math.max(...[...altSolB, ...altSagB].map((b) => b.cep + b.d)) : 0;
  const E: K | null = altSay ? { x: eL, z: cz1, w: GIRIS_EN, d: girisD } : null;
  const C: K = { x: cx0, z: cz0, w: ortaW, d: ortaD };

  // Negatif x'e taşan oda olursa her şey sağa kaydırılır.
  const minX = Math.min(0, ...kutular.map((b) => b.k.x));
  if (minX < 0) {
    for (const b of kutular) b.k.x -= minX;
    C.x -= minX;
    if (E) E.x -= minX;
  }
  const GW = Math.max(C.x + C.w, ...kutular.map((b) => b.k.x + b.k.w)) + 2;
  const GD = Math.max(C.z + C.d + (E?.d ?? 0), ...kutular.map((b) => b.k.z + b.k.d)) + 2;

  // ------------------------------------------------ ızgara
  const izgara = new Int16Array(GW * GD).fill(BILINMIYOR);
  const al = (i: number, j: number) => (i < 0 || j < 0 || i >= GW || j >= GD ? DISARI : izgara[j * GW + i]);
  const doldur = (kt: K, deger: number) => {
    for (let j = kt.z; j < kt.z + kt.d; j++) for (let i = kt.x; i < kt.x + kt.w; i++) izgara[j * GW + i] = deger;
  };
  kutular.forEach((b, n) => doldur(b.k, n + 1));
  doldur(C, ORTAK);
  if (E) doldur(E, GIRIS_E);
  // Ortak alandan dört yöne, bir odaya çarpana dek uzanan şeritler koridordur;
  // dışarı açılan şerit (karşısında oda yok) dışarı sayılır.
  const tara = (i0: number, j0: number, di: number, dj: number) => {
    const yol: number[] = [];
    let i = i0;
    let j = j0;
    while (al(i, j) === BILINMIYOR) {
      yol.push(j * GW + i);
      i += di;
      j += dj;
    }
    if (al(i, j) > 0) for (const p of yol) izgara[p] = KORIDOR;
  };
  for (let i = C.x; i < C.x + C.w; i++) {
    tara(i, C.z - 1, 0, -1);
    if (!E || i < E.x || i >= E.x + E.w) tara(i, C.z + C.d, 0, 1);
  }
  for (let j = C.z; j < C.z + C.d; j++) {
    tara(C.x - 1, j, -1, 0);
    tara(C.x + C.w, j, 1, 0);
  }
  // Kalan bilinmeyenler: kenardan ulaşılabilenler dışarı, kapalı cepler koridor.
  const kuyruk: number[] = [];
  for (let i = 0; i < GW; i++) for (const j of [0, GD - 1]) kuyruk.push(j * GW + i);
  for (let j = 0; j < GD; j++) for (const i of [0, GW - 1]) kuyruk.push(j * GW + i);
  while (kuyruk.length) {
    const p = kuyruk.pop()!;
    if (izgara[p] !== BILINMIYOR) continue;
    izgara[p] = DISARI;
    const i = p % GW;
    const j = (p - i) / GW;
    if (i > 0) kuyruk.push(p - 1);
    if (i < GW - 1) kuyruk.push(p + 1);
    if (j > 0) kuyruk.push(p - GW);
    if (j < GD - 1) kuyruk.push(p + GW);
  }
  for (let p = 0; p < izgara.length; p++) if (izgara[p] === BILINMIYOR) izgara[p] = KORIDOR;

  // ------------------------------------------------ duvarlar (hücre sınırları)
  const ortakMi = (l: number) => l === ORTAK || l === GIRIS_E || l === KORIDOR;
  interface Parca {
    dikey: boolean;
    sabit: number;
    bas: number;
    son: number;
    tur: DuvarTuru | null;
    anahtar: string;
    oda?: number;
    /** Oda çizginin küçük tarafında mı (batı/kuzey). */
    odaKucukte?: boolean;
  }
  const parcalar: Parca[] = [];
  const sinifla = (a: number, b: number, dikey: boolean): Omit<Parca, "dikey" | "sabit" | "bas" | "son"> | null => {
    if (a === b || (ortakMi(a) && ortakMi(b)) || (a === DISARI && b === DISARI)) return null;
    if (a > 0 && b > 0) return { tur: "cam", anahtar: `R${Math.min(a, b)}-${Math.max(a, b)}` };
    if (a > 0 || b > 0) {
      const oda = a > 0 ? a : b;
      const diger = a > 0 ? b : a;
      if (ortakMi(diger)) return { tur: "cam", anahtar: `C${oda}`, oda, odaKucukte: a > 0 };
      // Dışarı: kuzey/batı yüksek duvar, güney/doğu cam.
      return { tur: b > 0 ? "kalin" : "cam", anahtar: `O${oda}${b > 0 ? "k" : "c"}` };
    }
    // Ortak alan ↔ dışarı. Girişin güneyi açık.
    const ortakTaraf = ortakMi(a) ? a : b;
    if (!dikey && ortakTaraf === GIRIS_E && ortakMi(a)) return null;
    if (!dikey && ortakTaraf === ORTAK && ortakMi(a) && !E) return null;
    return { tur: ortakMi(b) ? "kalin" : "alcak", anahtar: `D${ortakMi(b) ? "k" : "a"}` };
  };
  const tara2 = (dikey: boolean) => {
    const dis = dikey ? GW : GD;
    const ic = dikey ? GD : GW;
    for (let s = 0; s <= dis; s++) {
      let acik: Parca | null = null;
      for (let t = 0; t <= ic; t++) {
        const s1 = t < ic ? (dikey ? sinifla(al(s - 1, t), al(s, t), true) : sinifla(al(t, s - 1), al(t, s), false)) : null;
        if (acik && (!s1 || s1.anahtar !== acik.anahtar)) {
          acik.son = t;
          parcalar.push(acik);
          acik = null;
        }
        if (s1 && !acik) acik = { dikey, sabit: s, bas: t, son: t, ...s1 };
      }
    }
  };
  tara2(true);
  tara2(false);

  // ------------------------------------------------ odalar ve kapılar
  const m = (v: number) => v / DM;
  const odalar: OfisOdasi[] = [];
  const engeller: Dikdortgen[] = [];
  const kapiParcalari = new Map<Parca, number>();
  kutular.forEach((b, n) => {
    const no = n + 1;
    const adaylar = parcalar.filter((p) => p.anahtar === `C${no}` && p.son - p.bas >= KAPI * DM + 3);
    const p = adaylar.sort((a, c) => c.son - c.bas - (a.son - a.bas))[0];
    const kt: Dikdortgen = { x: m(b.k.x), z: m(b.k.z), w: m(b.k.w), d: m(b.k.d) };
    let kapi = { x: kt.x + kt.w / 2, z: kt.z + kt.d };
    let kapiYonu = { x: 0, z: 1 };
    if (p) {
      const orta = (p.bas + p.son) / 2;
      kapiParcalari.set(p, orta);
      kapi = p.dikey ? { x: m(p.sabit), z: m(orta) } : { x: m(orta), z: m(p.sabit) };
      // Oda çizginin küçük tarafındaysa kapı büyük tarafa (doğu/güney) açılır.
      kapiYonu = p.dikey ? { x: p.odaKucukte ? 1 : -1, z: 0 } : { x: 0, z: p.odaKucukte ? 1 : -1 };
    }
    const masalar = b.h.tur === "departman" ? masalariDiz(kt, b.h.masa, b.h.patron) : [];
    const masaEngel = masaEngeli(kt, masalar);
    const yerler = modulYerleri(kt, kapiYonu, masaEngel, b.h.moduller.length);
    const moduller = yerler.map((y, i) => ({ key: b.h.moduller[i], ...y }));
    const oda: OfisOdasi = {
      ...kt,
      id: b.h.id,
      tur: b.h.tur,
      kapi,
      kapiYonu,
      masalar,
      sigmayan: Math.max(0, b.h.kisi - masalar.length),
      moduller,
      sigmayanModuller: b.h.moduller.slice(yerler.length),
      engeller: [],
    };
    oda.engeller = odaEngelleri(oda);
    odalar.push(oda);
  });

  const duvarlar: Duvar[] = parcalar
    .filter((p) => p.tur)
    .map((p) => {
      const orta = kapiParcalari.get(p);
      const d: Duvar = p.dikey
        ? { x1: m(p.sabit), z1: m(p.bas), x2: m(p.sabit), z2: m(p.son), tur: p.tur! }
        : { x1: m(p.bas), z1: m(p.sabit), x2: m(p.son), z2: m(p.sabit), tur: p.tur! };
      if (orta !== undefined) d.kapi = { orta: m(orta), genislik: KAPI };
      return d;
    });

  // Ortak alan, giriş ve koridor girintileri (koridor hücreleri dikdörtgenlere bölünür).
  const Cm: Dikdortgen = { x: m(C.x), z: m(C.z), w: m(C.w), d: m(C.d) };
  odalar.push({ id: "ortak", tur: "ortak", ...Cm, kapi: { x: Cm.x + Cm.w / 2, z: Cm.z + Cm.d }, kapiYonu: { x: 0, z: 1 }, masalar: [], sigmayan: 0, moduller: [], sigmayanModuller: [], engeller: [] });
  if (E) {
    const Em = { x: m(E.x), z: m(E.z), w: m(E.w), d: m(E.d) };
    odalar.push({ id: "giris", tur: "giris", ...Em, kapi: { x: Em.x + Em.w / 2, z: Em.z + Em.d }, kapiYonu: { x: 0, z: 1 }, masalar: [], sigmayan: 0, moduller: [], sigmayanModuller: [], engeller: [] });
  }
  koridorlariBol(izgara, GW, GD).forEach((r, i) =>
    odalar.push({ id: `koridor-${i}`, tur: "koridor", x: m(r.x), z: m(r.z), w: m(r.w), d: m(r.d), kapi: { x: 0, z: 0 }, kapiYonu: { x: 0, z: 1 }, masalar: [], sigmayan: 0, moduller: [], sigmayanModuller: [], engeller: [] })
  );

  const giris = E ? { x: m(E.x + E.w / 2), z: m(E.z + E.d) } : { x: Cm.x + Cm.w / 2, z: Cm.z + Cm.d };
  const oturma = { x: Cm.x + Cm.w / 2 + 0.6, z: Cm.z + Cm.d / 2 };
  engeller.push({ x: oturma.x - 1.9, z: oturma.z - 1.4, w: 3.8, d: 2.8 });
  const kahve = { x: Cm.x + 0.3, z: Cm.z + 1.3, don: Math.PI / 2 };
  engeller.push({ x: Cm.x, z: kahve.z - 0.8, w: 0.6, d: 1.6 });
  engeller.push({ x: giris.x - 1.2, z: giris.z - 2.0, w: 2.4, d: 1.4 });

  // Geniş ortak alanın iki yanı boş kalmasın: solda ortak çalışma masası, sağda
  // ikinci oturma köşesi (kapıların önünü kapatmasınlar diye kenarlardan içeride).
  const koseler: OfisPlani["koseler"] = [];
  if (Cm.w >= 15) {
    const solX = Cm.x + 2.2 + 1.6;
    const sagX = Cm.x + Cm.w - 2.2 - 1.2;
    if (oturma.x - 1.9 - (solX + 1.7) > 0.8) {
      koseler.push({ tur: "calisma", x: solX, z: oturma.z });
      engeller.push({ x: solX - 1.7, z: oturma.z - 1.4, w: 3.4, d: 2.8 });
    }
    if (sagX - 1.4 - (oturma.x + 1.9) > 0.8) {
      koseler.push({ tur: "oturma", x: sagX, z: oturma.z });
      engeller.push({ x: sagX - 1.4, z: oturma.z - 1.5, w: 2.8, d: 2.6 });
    }
  }

  const tumEngeller = [...engeller, ...odalar.flatMap((o) => o.engeller)];
  return { genislik: m(GW - 2), derinlik: m(GD - 2), odalar, duvarlar, giris, oturma, kahve, koseler, ortakEngeller: engeller, engeller: tumEngeller };
}

/** Döndürülmüş, yerel bir dikdörtgenin dünyadaki sınır kutusu. */
function donmusAlan(x: number, z: number, don: number, sol: number, sag: number, arka: number, on: number): Dikdortgen {
  const c = Math.cos(don);
  const s = Math.sin(don);
  const xs: number[] = [];
  const zs: number[] = [];
  for (const [lx, lz] of [
    [sol, arka],
    [sag, arka],
    [sol, on],
    [sag, on],
  ]) {
    // three.js y ekseni dönüşü: (x, z) → (x·cos + z·sin, −x·sin + z·cos)
    xs.push(x + lx * c + lz * s);
    zs.push(z - lx * s + lz * c);
  }
  return { x: Math.min(...xs), z: Math.min(...zs), w: Math.max(...xs) - Math.min(...xs), d: Math.max(...zs) - Math.min(...zs) };
}

/** Masa + arkasındaki sandalye ve oturan kişinin kapladığı alan. */
export function masaAlani(m: Pick<Masa, "x" | "z" | "don" | "patron">): Dikdortgen {
  if (m.patron) return donmusAlan(m.x, m.z, m.don, -1.15, 1.15, -(PATRON_KOLTUK + 0.45), 0.65);
  return donmusAlan(m.x, m.z, m.don, -0.7, 0.7, -(KOLTUK_UZAKLIK + 0.4), 0.5);
}

function modulAlani(y: { x: number; z: number; don: number }): Dikdortgen {
  return donmusAlan(y.x, y.z, y.don, -MODUL_IZ.boy / 2, MODUL_IZ.boy / 2, -MODUL_IZ.derin / 2, MODUL_IZ.derin / 2);
}

/** Duvarın iç yüzü oda kenarından bu kadar içeride (motorda kalın duvar 0.16, ortalı). */
const DUVAR_IC = 0.09;

/**
 * Bir ayak izini duvarların içine sığacak kadar kaydırır; `yer`in kaydırılmış
 * hâlini döner. Oda izden darsa o eksende ortalar.
 */
function odayaIt(alan: Dikdortgen, oda: Dikdortgen, yer: { x: number; z: number }): { x: number; z: number } {
  const it = (min: number, boy: number, alt: number, ust: number) => {
    if (boy > ust - alt) return (alt + ust) / 2 - (min + boy / 2);
    if (min < alt) return alt - min;
    if (min + boy > ust) return ust - (min + boy);
    return 0;
  };
  return {
    x: yer.x + it(alan.x, alan.w, oda.x + DUVAR_IC, oda.x + oda.w - DUVAR_IC),
    z: yer.z + it(alan.z, alan.d, oda.z + DUVAR_IC, oda.z + oda.d - DUVAR_IC),
  };
}

/**
 * Odadan taşınabilen (modül eşyası olmayan) bir nesnenin bulunduğu bölge:
 * kendi odası ya da — odanın dışında, ortak alanın içindeyse — ortak alan.
 * Ortak alanın dikdörtgeni komşu odaları da kapsayabildiği için önce oda bakılır.
 */
export function bolgesi(oda: OfisOdasi, ortak: OfisOdasi | undefined, x: number, z: number): OfisOdasi {
  const icinde = (r: Dikdortgen) => x >= r.x && x <= r.x + r.w && z >= r.z && z <= r.z + r.d;
  if (!ortak || oda.tur === "ortak" || icinde(oda) || !icinde(ortak)) return oda;
  return ortak;
}

/** Toplantı masasının varsayılan yeri (odanın ortası); düzenleyicide taşınabilir. */
export const TOPLANTI_MASASI = "dekor:toplanti-masasi";

function odaEngelleri(oda: OfisOdasi): Dikdortgen[] {
  const e = oda.masalar.map(masaAlani);
  for (const y of oda.moduller) e.push(modulAlani(y));
  if (oda.tur === "toplanti") {
    const d = oda.duzen?.nesneler[TOPLANTI_MASASI];
    if (!d?.gizli) {
      const x = d ? oda.x + d.dx : oda.x + oda.w / 2;
      const z = d ? oda.z + d.dz : oda.z + oda.d / 2;
      e.push(donmusAlan(x, z, d?.don ?? 0, -1.6, 1.6, -1.2, 1.2));
    }
  }
  return e;
}

/**
 * Kaydedilmiş oda düzenlerini plana uygular: masalar ve modül eşyaları taşınır
 * ya da (modüller) kaldırılır, odanın engelleri yeniden hesaplanır. Dekor
 * nesnelerini (bitki, kitaplık…) motor `oda.duzen`den okuyup kendisi uygular.
 * Konumlar odanın köşesine göre saklıdır; odanın dışına taşan değer içeri kırpılır.
 */
export function duzeniUygula(plan: OfisPlani, duzenler: Record<string, OdaDuzeni | undefined>): OfisPlani {
  const odalar = plan.odalar.map((oda) => {
    const duzen = duzenler[oda.id];
    if (!duzen || !Object.keys(duzen.nesneler).length) return oda;
    const icine = (dx: number, dz: number) => ({
      x: oda.x + Math.min(oda.w - 0.3, Math.max(0.3, dx)),
      z: oda.z + Math.min(oda.d - 0.3, Math.max(0.3, dz)),
    });
    const masalar = oda.masalar.map((m, i) => {
      const d = duzen.nesneler[`masa-${i}`];
      if (!d) return m;
      // Masada departmanın kişisi oturur: masa odasından çıkmaz. (Eski kayıtta
      // ortak alana çıkarılmışsa odaya geri kırpılır.)
      const b = oda;
      const yer = {
        x: b.x + Math.min(b.w - 0.3, Math.max(0.3, oda.x + d.dx - b.x)),
        z: b.z + Math.min(b.d - 0.3, Math.max(0.3, oda.z + d.dz - b.z)),
        don: d.don,
      };
      // Merkezi kırpmak yetmiyordu: duvara dayanmış masanın arkasındaki
      // sandalye (1,2 m geride) duvarın içinde kalıyordu. Bütün ayak izi içeri itilir.
      // İz: masa + sandalyenin arkası (motorun sürüklerken duvara sığdırdığı
      // kutuyla aynı; oturan kişinin payı katılırsa her bırakışta masa öne sıçrıyordu).
      const iz = m.patron
        ? donmusAlan(yer.x, yer.z, yer.don, -1.15, 1.15, -(PATRON_KOLTUK + 0.35), 0.65)
        : donmusAlan(yer.x, yer.z, yer.don, -0.7, 0.7, -(KOLTUK_UZAKLIK + 0.3), 0.5);
      return { ...m, ...yer, ...odayaIt(iz, b, yer), kuzey: Math.cos(d.don) > 0 };
    });
    const kaldirilan: string[] = [];
    const moduller = oda.moduller.flatMap((y) => {
      const d = duzen.nesneler[`modul:${y.key}`];
      if (!d) return [y];
      if (d.gizli) {
        kaldirilan.push(y.key);
        return [];
      }
      const yer = { ...icine(d.dx, d.dz), don: d.don };
      return [{ ...y, ...yer, ...odayaIt(modulAlani(yer), oda, yer) }];
    });
    const yeni: OfisOdasi = { ...oda, masalar, moduller, sigmayanModuller: [...oda.sigmayanModuller, ...kaldirilan], duzen };
    yeni.engeller = odaEngelleri(yeni);
    return yeni;
  });
  return { ...plan, odalar, engeller: [...plan.ortakEngeller, ...odalar.flatMap((o) => o.engeller)] };
}

/** Koridor hücrelerini dikdörtgenlere böler: satır satır koşular, aynı koşu alt satırda sürerse birleşir. */
function koridorlariBol(izgara: Int16Array, GW: number, GD: number): K[] {
  const sonuc: K[] = [];
  let acik = new Map<string, K>();
  for (let j = 0; j < GD; j++) {
    const yeni = new Map<string, K>();
    let i = 0;
    while (i < GW) {
      if (izgara[j * GW + i] !== KORIDOR) {
        i++;
        continue;
      }
      const bas = i;
      while (i < GW && izgara[j * GW + i] === KORIDOR) i++;
      const anahtar = `${bas}-${i}`;
      const onceki = acik.get(anahtar);
      if (onceki) {
        onceki.d++;
        yeni.set(anahtar, onceki);
      } else yeni.set(anahtar, { x: bas, z: j, w: i - bas, d: 1 });
    }
    for (const [a, r] of acik) if (!yeni.has(a)) sonuc.push(r);
    acik = yeni;
  }
  sonuc.push(...acik.values());
  // Kıl payı şeritler (ör. 1 dm) zemin olarak anlamsız; yine de boşluk kalmasın diye tutulur.
  return sonuc;
}

// ------------------------------------------------------------------ karakterler

/**
 * Karakterlerin masadan kalkma sıklığı (saniye, [en az, en çok]). Masada uzun
 * kalınır, ara sıra kalkılır: herkesin sürekli gezindiği ofis kalabalık ve
 * yorucu görünüyordu.
 */
export const GEZINME = {
  /** Sayfa açıldığında ilk kalkışa kadar. */
  ilk: [25, 90] as const,
  /** Döndükten sonra yeniden kalkana kadar; çevrimiçi olan biraz daha hareketli. */
  masadaCevrimici: [70, 160] as const,
  masadaDiger: [120, 300] as const,
  /** Kahve köşesinde ya da ortak alanda ayakta durma. */
  ayakta: [4, 9] as const,
  /** Kullanıcının tıklayıp götürdüğü yerde durma; sonra kendiliğinden masasına döner. */
  goturulunce: [25, 40] as const,
};

export function aralik([en, cok]: readonly [number, number], r = Math.random()): number {
  return en + (cok - en) * r;
}

export interface Yoldas {
  id: string;
  kadin: boolean;
  /** Ne kadar çalıştığı: tamamladığı görev sayısı. */
  emek: number;
}

/**
 * İki karakterin yolu kesişince yol hakkı `a`da mı. Erkek kadına yol verir;
 * aynı cinsiyetten iki kişide daha çok çalışan (emeği fazla olan) diğerine yol
 * verir. Eşitlikte kimlik sırası karar verir — iki taraf da aynı sonuca varsın
 * ki ikisi birden durup kilitlenmesin.
 */
export function yolHakki(a: Yoldas, b: Yoldas): boolean {
  if (a.kadin !== b.kadin) return a.kadin;
  if (a.emek !== b.emek) return a.emek < b.emek;
  return a.id < b.id;
}

// ------------------------------------------------------------------ puan

/** Şirkette tamamlanan her görev ofise bu kadar puan kazandırır. */
export const GOREV_PUANI = 10;
/** Satılan eşyanın bedelinin geri dönen payı. */
export const GERI_SATIS_ORANI = 0.5;

export function kazanilanPuan(bitenGorev: number): number {
  return Math.max(0, bitenGorev) * GOREV_PUANI;
}

/** Ofis seviyesi: her seviye bir öncekinden biraz daha fazla puan ister. */
export function ofisSeviyesi(kazanilan: number): { seviye: number; ilerleme: number; sonraki: number } {
  let seviye = 1;
  let esik = 0;
  let adim = 100;
  while (kazanilan >= esik + adim) {
    esik += adim;
    seviye++;
    adim = Math.round(adim * 1.35);
  }
  return { seviye, ilerleme: (kazanilan - esik) / adim, sonraki: esik + adim };
}

// ------------------------------------------------------------------ mağaza

export type EsyaTuru =
  // bitkiler
  | "bitki"
  | "agac"
  | "monstera"
  | "inceMonstera"
  | "salonBitkisi"
  | "buyukKaktus"
  | "kaktusKucuk"
  | "bitkiliSehpa"
  | "agacBuyuk"
  // oturma
  | "puf"
  | "kanepe"
  | "armut"
  | "dinlenmeKoltugu"
  | "ikiliKanepe"
  | "tasarimKanepe"
  | "koseKoltuk"
  | "minderPuf"
  | "yerMinderi"
  | "barTaburesi"
  | "yuvarlakSandalye"
  | "minderliBank"
  | "uzanmaKoltugu"
  | "tasarimBerjer"
  | "okumaKosesi"
  | "uzanmaliKanepe"
  | "buyukKoseKanepe"
  // mobilya
  | "kitaplik"
  | "dolap"
  | "yanSehpa"
  | "ortaSehpa"
  | "alcakSehpa"
  | "alcakRaf"
  | "askilik"
  | "copKovasi"
  | "calismaKosesi"
  | "masaTakimi"
  | "koliYigini"
  | "komodin"
  | "kareSehpa"
  | "alcakKitaplik"
  | "camSehpa"
  | "tvDolabi"
  | "kapakliKitaplik"
  | "ahsapMasa"
  | "yuvarlakMasa"
  | "genisKitaplik"
  | "koseMasa"
  | "yemekMasasi"
  | "camToplantiMasasi"
  // dekor
  | "lamba"
  | "modernLamba"
  | "hali"
  | "haliYuvarlak"
  | "haliCizgili"
  | "kure"
  | "saat"
  | "somine"
  | "havuz"
  | "akvaryum"
  | "roket"
  | "heykel"
  | "haliPaspas"
  | "oyuncakAyi"
  | "kareLambader"
  | "haliKare"
  | "haliDikdortgen"
  | "haliKoseli"
  // eğlence
  | "radyoSehpasi"
  | "hoparlorler"
  | "satranc"
  | "boksTorbasi"
  | "medya"
  | "kosuBandi"
  | "langirt"
  | "masaTenisi"
  | "oyun"
  | "piyano"
  | "bilardo"
  | "eskiTelevizyon"
  // mutfak
  | "suSebili"
  | "buzdolabi"
  | "kahve"
  | "barTezgahi"
  | "otomat"
  | "ocak"
  | "buzdolabiDik"
  | "barKosesi"
  | "buzdolabiBuyuk"
  | "mutfakTezgahi";

export type EsyaKategorisi = "bitki" | "oturma" | "mobilya" | "dekor" | "eglence" | "mutfak";

/** Mağazadaki sekmeler, sırasıyla. */
export const KATEGORILER: { key: EsyaKategorisi; ad: string }[] = [
  { key: "bitki", ad: "Bitkiler" },
  { key: "oturma", ad: "Oturma" },
  { key: "mobilya", ad: "Mobilya" },
  { key: "dekor", ad: "Dekor" },
  { key: "eglence", ad: "Eğlence" },
  { key: "mutfak", ad: "Mutfak" },
];

export interface KatalogEsyasi {
  tur: EsyaTuru;
  ad: string;
  fiyat: number;
  /** Zeminde kapladığı alan (dönmemiş hâli). */
  w: number;
  d: number;
  /** Bu seviyeye gelmeden alınamaz — mağazada ilerleme hissi için. */
  seviye: number;
  kategori: EsyaKategorisi;
}

export const KATALOG: KatalogEsyasi[] = [
  // Ölçüler hazır modellerin (components/ofis3d/varliklar.ts) ölçeklenmiş ayak
  // izi; kodla çizilenlerinki (modeller.ts) çizimle aynı. Kategori içinde ucuzdan
  // pahalıya.
  { tur: "kaktusKucuk", ad: "Mini kaktüs", fiyat: 20, w: 0.35, d: 0.35, seviye: 1, kategori: "bitki" },
  { tur: "bitki", ad: "Saksı bitkisi", fiyat: 30, w: 0.5, d: 0.55, seviye: 1, kategori: "bitki" },
  { tur: "bitkiliSehpa", ad: "Bitkili sehpa", fiyat: 55, w: 0.95, d: 0.4, seviye: 1, kategori: "bitki" },
  { tur: "agac", ad: "Kaktüs", fiyat: 70, w: 0.7, d: 0.7, seviye: 2, kategori: "bitki" },
  // Büyük bitkiler: yapraklar yukarıda yayıldığı için ayak izi saksının kendisi.
  { tur: "salonBitkisi", ad: "Salon bitkisi", fiyat: 80, w: 0.8, d: 0.8, seviye: 1, kategori: "bitki" },
  { tur: "inceMonstera", ad: "Uzun monstera", fiyat: 95, w: 0.7, d: 0.7, seviye: 2, kategori: "bitki" },
  { tur: "buyukKaktus", ad: "Büyük kaktüs", fiyat: 110, w: 0.8, d: 0.8, seviye: 2, kategori: "bitki" },
  { tur: "agacBuyuk", ad: "Saksı ağacı", fiyat: 120, w: 0.7, d: 0.75, seviye: 3, kategori: "bitki" },
  { tur: "monstera", ad: "Gür monstera", fiyat: 130, w: 0.9, d: 0.9, seviye: 3, kategori: "bitki" },

  { tur: "barTaburesi", ad: "Bar taburesi", fiyat: 20, w: 0.5, d: 0.45, seviye: 1, kategori: "oturma" },
  { tur: "yuvarlakSandalye", ad: "Yuvarlak sandalye", fiyat: 20, w: 0.4, d: 0.4, seviye: 1, kategori: "oturma" },
  { tur: "minderPuf", ad: "Minder puf", fiyat: 25, w: 0.8, d: 0.85, seviye: 1, kategori: "oturma" },
  { tur: "yerMinderi", ad: "Yer minderi", fiyat: 25, w: 0.8, d: 0.45, seviye: 1, kategori: "oturma" },
  { tur: "minderliBank", ad: "Minderli bank", fiyat: 35, w: 0.75, d: 0.4, seviye: 1, kategori: "oturma" },
  { tur: "armut", ad: "Armut koltuk", fiyat: 40, w: 0.9, d: 0.9, seviye: 1, kategori: "oturma" },
  { tur: "puf", ad: "Koltuk", fiyat: 45, w: 1.3, d: 1.15, seviye: 1, kategori: "oturma" },
  { tur: "dinlenmeKoltugu", ad: "Dinlenme koltuğu", fiyat: 55, w: 0.9, d: 0.8, seviye: 1, kategori: "oturma" },
  { tur: "uzanmaKoltugu", ad: "Uzanma koltuğu", fiyat: 70, w: 0.9, d: 1.25, seviye: 2, kategori: "oturma" },
  { tur: "tasarimBerjer", ad: "Tasarım berjer", fiyat: 75, w: 1.35, d: 0.8, seviye: 2, kategori: "oturma" },
  { tur: "okumaKosesi", ad: "Okuma köşesi", fiyat: 95, w: 1.25, d: 1.25, seviye: 2, kategori: "oturma" },
  { tur: "ikiliKanepe", ad: "İkili kanepe", fiyat: 120, w: 1.8, d: 0.8, seviye: 2, kategori: "oturma" },
  { tur: "kanepe", ad: "Kanepe", fiyat: 140, w: 2.1, d: 1.15, seviye: 3, kategori: "oturma" },
  { tur: "tasarimKanepe", ad: "Tasarım kanepe", fiyat: 160, w: 2.05, d: 0.8, seviye: 3, kategori: "oturma" },
  { tur: "uzanmaliKanepe", ad: "Uzanmalı kanepe", fiyat: 180, w: 1.8, d: 1.5, seviye: 4, kategori: "oturma" },
  { tur: "koseKoltuk", ad: "Köşe koltuk", fiyat: 210, w: 1.8, d: 1.8, seviye: 4, kategori: "oturma" },
  { tur: "buyukKoseKanepe", ad: "Büyük köşe kanepe", fiyat: 260, w: 2.45, d: 2.45, seviye: 5, kategori: "oturma" },

  { tur: "copKovasi", ad: "Çöp kovası", fiyat: 10, w: 0.4, d: 0.45, seviye: 1, kategori: "mobilya" },
  { tur: "koliYigini", ad: "Koli yığını", fiyat: 15, w: 1.1, d: 0.5, seviye: 1, kategori: "mobilya" },
  { tur: "komodin", ad: "Komodin", fiyat: 30, w: 0.5, d: 0.4, seviye: 1, kategori: "mobilya" },
  { tur: "askilik", ad: "Askılık", fiyat: 35, w: 0.6, d: 0.6, seviye: 1, kategori: "mobilya" },
  { tur: "yanSehpa", ad: "Yan sehpa", fiyat: 40, w: 0.95, d: 0.4, seviye: 1, kategori: "mobilya" },
  { tur: "kareSehpa", ad: "Kare sehpa", fiyat: 45, w: 0.75, d: 0.75, seviye: 1, kategori: "mobilya" },
  { tur: "alcakKitaplik", ad: "Alçak kitaplık", fiyat: 50, w: 0.75, d: 0.5, seviye: 1, kategori: "mobilya" },
  { tur: "ortaSehpa", ad: "Orta sehpa", fiyat: 65, w: 1.2, d: 0.75, seviye: 1, kategori: "mobilya" },
  { tur: "alcakSehpa", ad: "Alçak sehpa", fiyat: 70, w: 1.5, d: 0.95, seviye: 2, kategori: "mobilya" },
  { tur: "camSehpa", ad: "Cam sehpa", fiyat: 70, w: 1.2, d: 0.75, seviye: 2, kategori: "mobilya" },
  { tur: "alcakRaf", ad: "Alçak raf", fiyat: 75, w: 1.45, d: 0.4, seviye: 2, kategori: "mobilya" },
  { tur: "tvDolabi", ad: "TV dolabı", fiyat: 80, w: 1.45, d: 0.5, seviye: 2, kategori: "mobilya" },
  { tur: "kapakliKitaplik", ad: "Kapaklı kitaplık", fiyat: 85, w: 0.75, d: 0.5, seviye: 2, kategori: "mobilya" },
  { tur: "ahsapMasa", ad: "Ahşap masa", fiyat: 85, w: 1.55, d: 0.85, seviye: 2, kategori: "mobilya" },
  { tur: "kitaplik", ad: "Kitaplık", fiyat: 90, w: 0.75, d: 0.5, seviye: 2, kategori: "mobilya" },
  { tur: "yuvarlakMasa", ad: "Yuvarlak masa", fiyat: 90, w: 1.3, d: 1.45, seviye: 2, kategori: "mobilya" },
  { tur: "dolap", ad: "Dekor dolabı", fiyat: 100, w: 1.45, d: 0.75, seviye: 2, kategori: "mobilya" },
  { tur: "genisKitaplik", ad: "Geniş kitaplık", fiyat: 110, w: 1.45, d: 0.5, seviye: 3, kategori: "mobilya" },
  { tur: "koseMasa", ad: "Köşe masa", fiyat: 120, w: 1.8, d: 1.8, seviye: 3, kategori: "mobilya" },
  { tur: "calismaKosesi", ad: "Çalışma köşesi", fiyat: 150, w: 1.3, d: 1.2, seviye: 3, kategori: "mobilya" },
  { tur: "yemekMasasi", ad: "Yemek masası", fiyat: 160, w: 1.55, d: 1.6, seviye: 3, kategori: "mobilya" },
  { tur: "masaTakimi", ad: "Masa takımı", fiyat: 180, w: 1.75, d: 1.8, seviye: 3, kategori: "mobilya" },
  { tur: "camToplantiMasasi", ad: "Cam toplantı masası", fiyat: 230, w: 1.55, d: 1.6, seviye: 4, kategori: "mobilya" },

  { tur: "haliPaspas", ad: "Paspas", fiyat: 10, w: 0.8, d: 0.45, seviye: 1, kategori: "dekor" },
  { tur: "oyuncakAyi", ad: "Oyuncak ayı", fiyat: 30, w: 0.7, d: 0.5, seviye: 1, kategori: "dekor" },
  { tur: "modernLamba", ad: "Modern lambader", fiyat: 40, w: 0.35, d: 0.35, seviye: 1, kategori: "dekor" },
  { tur: "kareLambader", ad: "Kare lambader", fiyat: 40, w: 0.25, d: 0.25, seviye: 1, kategori: "dekor" },
  { tur: "lamba", ad: "Ayaklı lamba", fiyat: 50, w: 0.65, d: 0.65, seviye: 1, kategori: "dekor" },
  { tur: "haliYuvarlak", ad: "Yuvarlak halı", fiyat: 55, w: 1.7, d: 1.7, seviye: 1, kategori: "dekor" },
  { tur: "haliKare", ad: "Kare halı", fiyat: 55, w: 1.65, d: 1.7, seviye: 1, kategori: "dekor" },
  { tur: "hali", ad: "Oval halı", fiyat: 60, w: 2.1, d: 1.4, seviye: 1, kategori: "dekor" },
  { tur: "haliDikdortgen", ad: "Büyük halı", fiyat: 70, w: 2.85, d: 1.7, seviye: 2, kategori: "dekor" },
  { tur: "haliCizgili", ad: "Çizgili halı", fiyat: 75, w: 2.6, d: 1.75, seviye: 2, kategori: "dekor" },
  { tur: "haliKoseli", ad: "Yumuşak köşeli halı", fiyat: 75, w: 2.85, d: 1.7, seviye: 2, kategori: "dekor" },
  { tur: "kure", ad: "Yer küresi", fiyat: 85, w: 0.8, d: 0.7, seviye: 2, kategori: "dekor" },
  { tur: "saat", ad: "Ayaklı saat", fiyat: 150, w: 0.6, d: 0.4, seviye: 3, kategori: "dekor" },
  { tur: "akvaryum", ad: "Akvaryum", fiyat: 220, w: 1.4, d: 0.6, seviye: 4, kategori: "dekor" },
  { tur: "somine", ad: "Şömine", fiyat: 240, w: 1.5, d: 0.6, seviye: 4, kategori: "dekor" },
  { tur: "havuz", ad: "Süs havuzu", fiyat: 280, w: 1.4, d: 1.4, seviye: 5, kategori: "dekor" },
  { tur: "roket", ad: "Roket maketi", fiyat: 420, w: 0.9, d: 0.9, seviye: 6, kategori: "dekor" },
  { tur: "heykel", ad: "Projelio heykeli", fiyat: 500, w: 1, d: 1, seviye: 6, kategori: "dekor" },

  { tur: "radyoSehpasi", ad: "Radyo sehpası", fiyat: 50, w: 0.95, d: 0.4, seviye: 1, kategori: "eglence" },
  { tur: "hoparlorler", ad: "Hoparlör çifti", fiyat: 60, w: 0.95, d: 0.3, seviye: 2, kategori: "eglence" },
  { tur: "eskiTelevizyon", ad: "Eski televizyon", fiyat: 60, w: 0.75, d: 0.5, seviye: 2, kategori: "eglence" },
  { tur: "satranc", ad: "Satranç masası", fiyat: 120, w: 1.3, d: 0.7, seviye: 2, kategori: "eglence" },
  { tur: "boksTorbasi", ad: "Boks torbası", fiyat: 130, w: 0.8, d: 0.8, seviye: 3, kategori: "eglence" },
  { tur: "medya", ad: "Medya ünitesi", fiyat: 170, w: 1.85, d: 0.4, seviye: 3, kategori: "eglence" },
  { tur: "kosuBandi", ad: "Koşu bandı", fiyat: 200, w: 0.8, d: 1.7, seviye: 4, kategori: "eglence" },
  { tur: "langirt", ad: "Langırt masası", fiyat: 260, w: 1.5, d: 0.9, seviye: 4, kategori: "eglence" },
  { tur: "masaTenisi", ad: "Masa tenisi", fiyat: 280, w: 2.2, d: 1.3, seviye: 4, kategori: "eglence" },
  { tur: "oyun", ad: "Oyun makinesi", fiyat: 320, w: 0.9, d: 0.8, seviye: 5, kategori: "eglence" },
  { tur: "piyano", ad: "Piyano", fiyat: 340, w: 1.5, d: 1.0, seviye: 5, kategori: "eglence" },
  { tur: "bilardo", ad: "Bilardo masası", fiyat: 380, w: 2.3, d: 1.3, seviye: 5, kategori: "eglence" },

  { tur: "suSebili", ad: "Su sebili", fiyat: 45, w: 0.45, d: 0.45, seviye: 1, kategori: "mutfak" },
  { tur: "buzdolabi", ad: "Mini buzdolabı", fiyat: 90, w: 0.6, d: 0.6, seviye: 2, kategori: "mutfak" },
  { tur: "ocak", ad: "Elektrikli ocak", fiyat: 90, w: 0.8, d: 0.85, seviye: 3, kategori: "mutfak" },
  { tur: "kahve", ad: "Kahve köşesi", fiyat: 110, w: 1.45, d: 0.45, seviye: 2, kategori: "mutfak" },
  { tur: "buzdolabiDik", ad: "Buzdolabı", fiyat: 120, w: 0.8, d: 0.55, seviye: 3, kategori: "mutfak" },
  { tur: "barTezgahi", ad: "Bar tezgâhı", fiyat: 130, w: 2.45, d: 0.45, seviye: 3, kategori: "mutfak" },
  { tur: "barKosesi", ad: "Bar köşesi", fiyat: 140, w: 1.8, d: 0.85, seviye: 3, kategori: "mutfak" },
  { tur: "buzdolabiBuyuk", ad: "Büyük buzdolabı", fiyat: 150, w: 0.95, d: 0.75, seviye: 3, kategori: "mutfak" },
  { tur: "otomat", ad: "İçecek otomatı", fiyat: 190, w: 0.95, d: 0.8, seviye: 4, kategori: "mutfak" },
  { tur: "mutfakTezgahi", ad: "Mutfak tezgâhı", fiyat: 200, w: 2.35, d: 0.85, seviye: 4, kategori: "mutfak" },
];

/**
 * Halı mı: halı yerde serili durur, üstüne eşya konabilir ve yalnızca başka
 * halılarla çakışamaz. Hazır modellerin adları da aynı önekle başlıyor
 * (haliOval, haliCizgili), sahnedeki sabit dekor da bu kurala uyar.
 */
export function haliMi(tur: string): boolean {
  return tur.startsWith("hali");
}

export function katalogEsyasi(tur: EsyaTuru): KatalogEsyasi | undefined {
  return KATALOG.find((k) => k.tur === tur);
}

export interface YerlesikEsya {
  id: string;
  tur: EsyaTuru;
  x: number;
  z: number;
  /** Çeyrek tur sayısı (0–3). */
  don: number;
}

/** Dönmüş eşyanın zemindeki dikdörtgeni (x, z eşyanın ortası). */
export function esyaAlani(e: Pick<YerlesikEsya, "tur" | "x" | "z" | "don">): Dikdortgen {
  const k = katalogEsyasi(e.tur);
  const w0 = k?.w ?? 1;
  const d0 = k?.d ?? 1;
  // 45°'deki (yarım çeyrek) eşya için yaklaşık: en yakın çeyreğe yuvarlanır.
  const [w, d] = Math.round(e.don) % 2 ? [d0, w0] : [w0, d0];
  return { x: e.x - w / 2, z: e.z - d / 2, w, d };
}

function kesisir(a: Dikdortgen, b: Dikdortgen): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.z < b.z + b.d && b.z < a.z + a.d;
}

function icinde(ic: Dikdortgen, dis: Dikdortgen, pay: number): boolean {
  return ic.x >= dis.x + pay && ic.z >= dis.z + pay && ic.x + ic.w <= dis.x + dis.w - pay && ic.z + ic.d <= dis.z + dis.d - pay;
}

/**
 * Eşya buraya konabilir mi: tamamen tek bir odanın içinde (duvarlardan pay
 * bırakarak), sabit alanlara ve diğer eşyalara değmeden. Halı yerde serili
 * durduğu için yalnızca başka halılarla çakışamaz; üstüne eşya konabilir.
 */
export function yerlestirilebilir(
  aday: Pick<YerlesikEsya, "tur" | "x" | "z" | "don">,
  plan: OfisPlani,
  esyalar: YerlesikEsya[],
  haric?: string
): boolean {
  const alan = esyaAlani(aday);
  if (!plan.odalar.some((o) => icinde(alan, o, 0.2))) return false;
  const hali = haliMi(aday.tur);
  if (!hali && plan.engeller.some((e) => kesisir(alan, e))) return false;
  return !esyalar.some((e) => e.id !== haric && haliMi(e.tur) === hali && kesisir(alan, esyaAlani(e)));
}

/** Zemindeki bir noktayı eşya ızgarasına oturtur (çeyrek metre). */
export function izgarayaOturt(v: number): number {
  return Math.round(v * 4) / 4;
}

// ------------------------------------------------------------------ kayıt

export interface OfisKaydi {
  harcanan: number;
  esyalar: YerlesikEsya[];
}

export const BOS_KAYIT: OfisKaydi = { harcanan: 0, esyalar: [] };

/**
 * Tarayıcıdaki kaydı okur. Bozuk ya da eski biçimdeki kayıt sessizce boş
 * sayılır: oyunun durumu yüzünden sayfa açılmaz hâle gelmemeli.
 */
export function kaydiCoz(ham: string | null): OfisKaydi {
  if (!ham) return BOS_KAYIT;
  try {
    const v = JSON.parse(ham) as Partial<OfisKaydi>;
    const esyalar = Array.isArray(v.esyalar)
      ? v.esyalar.filter(
          (e): e is YerlesikEsya =>
            !!e &&
            typeof e.id === "string" &&
            !!katalogEsyasi(e.tur) &&
            Number.isFinite(e.x) &&
            Number.isFinite(e.z) &&
            // Çeyrek tur; oda düzenleyicisinde 45° de döndürülebildiği için yarımlı olabilir.
            Number.isInteger(e.don * 2)
        )
      : [];
    return { harcanan: Number.isFinite(v.harcanan) ? Math.max(0, Number(v.harcanan)) : 0, esyalar };
  } catch {
    return BOS_KAYIT;
  }
}

export function kayitAnahtari(kapsam: string): string {
  return `projelio:ofis-oyunu:${kapsam}`;
}

/** Bir kişinin adından sabit bir sayı — karakterin rengi her açılışta aynı kalsın. */
export function adSayisi(ad: string): number {
  let h = 2166136261;
  for (let i = 0; i < ad.length; i++) {
    h ^= ad.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
