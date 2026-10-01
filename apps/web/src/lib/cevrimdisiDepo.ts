import { useSyncExternalStore } from "react";
import { kabuktaMi } from "./mobilKabuk";
import {
  ONBELLEK_TAVANI,
  YANIT_BOYUT_TAVANI,
  bayatlariAyikla,
  kuyrugaEkle,
  kuyrukKarari,
  type BekleyenYazma,
} from "./cevrimdisi";

/**
 * ÇEVRİMDIŞI ÇALIŞMANIN CİHAZ TARAFI: saklanan yanıtlar, bekleyen yazmalar ve
 * "bağlantı var mı" durumu. Kararlar `cevrimdisi.ts`'te, istemciye bağlandığı
 * yer `api/client.ts`. Bu dosya client.ts'i İÇE AKTARMAZ (döngü olurdu);
 * kuyruğu göndermek için gereken istek fonksiyonu oradan kurulurken verilir.
 */

/**
 * Yalnızca mobil kabukta açık.
 *
 * NEDEN TARAYICIDA KAPALI: tarayıcı ortak bir bilgisayar olabilir; iş verisini
 * kullanıcı çıkış yaptıktan sonra da diskte bırakmak orada kabul edilemez.
 * Telefondaki uygulama kişinin kendi cihazı ve kesintinin asıl yaşandığı yer.
 * Tarayıcıda denemek için: localStorage.projelio_cevrimdisi_dene = "1".
 */
export function cevrimdisiEtkin(): boolean {
  if (kabuktaMi()) return true;
  try {
    return localStorage.getItem("projelio_cevrimdisi_dene") === "1";
  } catch {
    return false;
  }
}

/** Tarayıcının kendi "ağ yok" bilgisi. Android WebView'de uçak modu / sinyal yok anında güvenilir. */
export function agYok(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

// ─────────────────────────────────────────────────────────── durum (şerit)

export interface CevrimdisiDurum {
  /** Son istek sunucuya ulaşamadı (ya da cihaz ağsız). */
  cevrimdisi: boolean;
  /** Bağlantı kopukken saklı veri gösterildi — dönüşte "yenile" önerilir. */
  eskiVeriGosterildi: boolean;
  /** Bağlantı kopup geri geldi; şerit kısa bir süre bunu söyler. */
  geriGeldi: boolean;
  /** Kuyrukta bekleyen yazma sayısı. */
  bekleyen: number;
  /** Sunucunun reddettiği için atılan yazma sayısı (kullanıcı kapatana dek). */
  gonderilemeyen: number;
}

let durum: CevrimdisiDurum = {
  cevrimdisi: false,
  eskiVeriGosterildi: false,
  geriGeldi: false,
  bekleyen: 0,
  gonderilemeyen: 0,
};
const dinleyiciler = new Set<() => void>();

function guncelle(degisim: Partial<CevrimdisiDurum>): void {
  const yeni = { ...durum, ...degisim };
  if ((Object.keys(degisim) as (keyof CevrimdisiDurum)[]).every((k) => yeni[k] === durum[k])) return;
  durum = yeni;
  for (const fn of dinleyiciler) fn();
}

export function useCevrimdisiDurum(): CevrimdisiDurum {
  return useSyncExternalStore(
    (fn) => {
      dinleyiciler.add(fn);
      return () => {
        dinleyiciler.delete(fn);
      };
    },
    () => durum
  );
}

/** Sunucuya ulaşıldı (yanıt ne olursa olsun: 4xx de ulaşıldı demektir). */
export function ulasildi(): void {
  if (durum.cevrimdisi) {
    guncelle({ cevrimdisi: false, geriGeldi: durum.eskiVeriGosterildi || durum.bekleyen > 0 });
    void kuyruguGonder();
  }
}

export function ulasilamadi(): void {
  guncelle({ cevrimdisi: true, geriGeldi: false });
  yoklamayiBaslat();
}

export function eskiVeriGosterildiIsaretle(): void {
  guncelle({ eskiVeriGosterildi: true });
  ulasilamadi();
}

export function geriGeldiyiKapat(): void {
  guncelle({ geriGeldi: false, eskiVeriGosterildi: false });
}

export function gonderilemeyeniKapat(): void {
  guncelle({ gonderilemeyen: 0 });
}

// ─────────────────────────────────────────────────────────── saklanan yanıtlar

const DB_ADI = "projelio-cevrimdisi";
const DEPO = "yanitlar";

interface SakliYanit {
  anahtar: string;
  govde: string;
  zaman: number;
}

let dbSozu: Promise<IDBDatabase | null> | null = null;

/**
 * Veritabanını bir kez açar. Açılamazsa (WebView'de depolama kapalı, kota
 * dolu) null döner ve her şey önbelleksiz eski davranışla sürer — çevrimdışı
 * destek bir kolaylık, uygulamanın çalışma şartı değil.
 */
function db(): Promise<IDBDatabase | null> {
  if (!dbSozu) {
    dbSozu = new Promise((resolve) => {
      try {
        const istek = indexedDB.open(DB_ADI, 1);
        istek.onupgradeneeded = () => {
          const depo = istek.result.createObjectStore(DEPO, { keyPath: "anahtar" });
          depo.createIndex("zaman", "zaman");
        };
        istek.onsuccess = () => resolve(istek.result);
        istek.onerror = () => resolve(null);
        istek.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbSozu;
}

export async function sakliYanitiOku(anahtar: string): Promise<string | undefined> {
  const d = await db();
  if (!d) return undefined;
  return new Promise((resolve) => {
    try {
      const istek = d.transaction(DEPO, "readonly").objectStore(DEPO).get(anahtar);
      istek.onsuccess = () => resolve((istek.result as SakliYanit | undefined)?.govde);
      istek.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

let yazmaSayaci = 0;

export async function yanitiSakla(anahtar: string, govde: string): Promise<void> {
  if (govde.length > YANIT_BOYUT_TAVANI) return;
  const d = await db();
  if (!d) return;
  try {
    const tx = d.transaction(DEPO, "readwrite");
    tx.objectStore(DEPO).put({ anahtar, govde, zaman: Date.now() } satisfies SakliYanit);
    // Tahliye her yazmada değil: sayım bir indeks taraması, her GET'te yapmaya değmez.
    if (++yazmaSayaci % 25 === 0) tahliyeEt(tx.objectStore(DEPO));
  } catch {
    // Kota dolu vb. — saklanamadıysa bir dahaki sefere yine ağdan gelir.
  }
}

/** Tavanın üstündeki en eski yanıtları siler. */
function tahliyeEt(depo: IDBObjectStore): void {
  const sayim = depo.count();
  sayim.onsuccess = () => {
    let fazla = sayim.result - ONBELLEK_TAVANI;
    if (fazla <= 0) return;
    const imlec = depo.index("zaman").openCursor();
    imlec.onsuccess = () => {
      const c = imlec.result;
      if (!c || fazla <= 0) return;
      c.delete();
      fazla--;
      c.continue();
    };
  };
}

let temizlendi = false;

/**
 * Oturum yokken cihazdaki her şeyi siler (bir kez).
 *
 * Çıkış yapılan yerler dağınık (Navbar, Ayarlar, hesap silme, süresi dolan
 * oturum — sonuncusu client.ts'te ve oraya dokunulmuyor). Hepsine ayrı satır
 * eklemek yerine "jetonsuz istek görüldü = kimse oturmuyor" kuralı tek yerden
 * yakalıyor: hepsi giriş ekranına düşüyor ve orada jetonsuz istek atılıyor.
 */
export function oturumsuzTemizle(): void {
  if (temizlendi) return;
  temizlendi = true;
  void db().then((d) => {
    if (!d) return;
    try {
      d.transaction(DEPO, "readwrite").objectStore(DEPO).clear();
    } catch {
      /* temizlenemediyse veri yine sahibine göre ayrık duruyor */
    }
  });
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(KUYRUK_ONEKI)) localStorage.removeItem(k);
    }
  } catch {
    /* localStorage yoksa kuyruk da yoktur */
  }
  guncelle({ bekleyen: 0 });
}

// ─────────────────────────────────────────────────────────── bekleyen yazmalar

const KUYRUK_ONEKI = "projelio_cevrimdisi_kuyruk:";

/** Kuyruğu gönderen ve sunucuyu yoklayan fonksiyonlar — client.ts kurar. */
interface Baglanti {
  sahip: () => string | null;
  /** Yazmayı gönderir; başarısızsa ApiError benzeri { status } fırlatır. */
  gonder: (y: BekleyenYazma) => Promise<unknown>;
  /** Sunucu ayakta mı? Hata fırlatmaz. */
  yokla: () => Promise<boolean>;
}

let baglanti: Baglanti | null = null;

function kuyrukAnahtari(): string | null {
  const s = baglanti?.sahip();
  return s ? KUYRUK_ONEKI + s : null;
}

function kuyruguOku(): BekleyenYazma[] {
  const a = kuyrukAnahtari();
  if (!a) return [];
  try {
    const ham = JSON.parse(localStorage.getItem(a) ?? "[]");
    return Array.isArray(ham) ? bayatlariAyikla(ham as BekleyenYazma[], Date.now()) : [];
  } catch {
    return [];
  }
}

function kuyruguYaz(k: BekleyenYazma[]): void {
  const a = kuyrukAnahtari();
  if (!a) return;
  try {
    if (k.length) localStorage.setItem(a, JSON.stringify(k));
    else localStorage.removeItem(a);
  } catch {
    /* yazılamadıysa kuyruk bellekte de yok; değişiklik kaybolur ama uygulama sürer */
  }
  guncelle({ bekleyen: k.length });
}

/** Gönderilmeyi bekleyen yazmalar (saklı veriye uygulamak için, bkz. bekleyenleriUygula). */
export function bekleyenYazmalar(): BekleyenYazma[] {
  return kuyruguOku();
}

export function kuyrukBosMu(): boolean {
  return kuyruguOku().length === 0;
}

export function kuyrugaAl(y: BekleyenYazma): void {
  kuyruguYaz(kuyrugaEkle(kuyruguOku(), y));
  yoklamayiBaslat();
}

let gonderiliyor = false;

/**
 * Bekleyen yazmaları SIRAYLA gönderir. Biri "beklet" derse durur — sıra
 * bozulmamalı (bkz. kuyrukKarari). Aynı anda tek gönderim.
 */
export async function kuyruguGonder(): Promise<void> {
  if (!baglanti || gonderiliyor) return;
  gonderiliyor = true;
  try {
    for (;;) {
      const kuyruk = kuyruguOku();
      const ilk = kuyruk[0];
      if (!ilk) break;
      let karar: ReturnType<typeof kuyrukKarari>;
      try {
        await baglanti.gonder(ilk);
        karar = "tamam";
      } catch (e) {
        const status = typeof (e as { status?: unknown })?.status === "number" ? (e as { status: number }).status : 0;
        karar = kuyrukKarari(status);
      }
      if (karar === "beklet") break;
      if (karar === "at") guncelle({ gonderilemeyen: durum.gonderilemeyen + 1 });
      // Gönderim sürerken yeni yazma eklenmiş olabilir: yeniden okuyup yalnızca
      // gönderileni çıkar.
      kuyruguYaz(kuyruguOku().filter((k) => !(k.zaman === ilk.zaman && k.path === ilk.path)));
    }
  } finally {
    gonderiliyor = false;
  }
}

// ─────────────────────────────────────────────────────────── yoklama

let yoklamaZamanlayici: ReturnType<typeof setInterval> | null = null;

/**
 * Kopukken sunucuyu ara ara yoklar.
 *
 * NEDEN: kullanıcı hiçbir şeye dokunmazsa istek de gitmez; bağlantı gelse bile
 * şerit "çevrimdışısın" demeye, kuyruk beklemeye devam ederdi. `online` olayı
 * tek başına yetmiyor — "kısmen kopuk" durumda cihaz hep çevrimiçi sanıyor.
 */
function yoklamayiBaslat(): void {
  if (yoklamaZamanlayici || !baglanti) return;
  yoklamaZamanlayici = setInterval(async () => {
    if (!durum.cevrimdisi && durum.bekleyen === 0) {
      if (yoklamaZamanlayici) clearInterval(yoklamaZamanlayici);
      yoklamaZamanlayici = null;
      return;
    }
    if (agYok() || !baglanti) return;
    if (await baglanti.yokla()) {
      ulasildi();
      void kuyruguGonder();
    }
  }, 15_000);
}

/** client.ts yüklenirken bir kez çağrılır. Kapalıysa (tarayıcı) hiçbir şey yapmaz. */
export function cevrimdisiKur(b: Baglanti): void {
  if (!cevrimdisiEtkin() || baglanti) return;
  baglanti = b;
  window.addEventListener("offline", () => ulasilamadi());
  window.addEventListener("online", () => {
    void b.yokla().then((ayakta) => (ayakta ? ulasildi() : ulasilamadi()));
    void kuyruguGonder();
  });
  const bekleyen = kuyruguOku().length;
  guncelle({ bekleyen, cevrimdisi: agYok() });
  if (bekleyen) {
    // Açılışta önceki oturumdan kalan yazmalar: ilk boyamayı bekletmeden gönder.
    setTimeout(() => void kuyruguGonder(), 2_000);
    yoklamayiBaslat();
  }
}
