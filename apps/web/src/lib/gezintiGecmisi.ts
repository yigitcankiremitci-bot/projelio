/**
 * Uygulama içi gezinti geçmişi: hangi adresten hangi adrese gelindi, o
 * adresin adı neydi.
 *
 * NEDEN: detay sayfalarının geri bağlantısı sabit bir ebeveyne gidiyordu —
 * departmandan "← Departmanlar"a, şirketten "← Organizasyonlar"a. Kullanıcı
 * departmana anasayfadan ya da bir işten girmişse geri tuşu onu hiç görmediği
 * bir sayfaya atıyor, bir kez daha basınca da bir başkasına. İstenen şey
 * tarayıcının geri tuşu gibi davranması: GELİNEN yere dönmek.
 *
 * NEDEN yalnızca `navigate(-1)` DEĞİL: tarayıcı geçmişi uygulamanın dışını da
 * içerir ve bir önceki kaydın ne olduğunu (adını) söylemez. Bu yığın yalnızca
 * uygulamanın içinde gezilen kayıtları tutar; önceki kayıt burada yoksa
 * (doğrudan bağlantıyla gelinmiş, sekme yeni açılmış) sayfa eskisi gibi kendi
 * sabit ebeveynine döner.
 *
 * Yığın sessionStorage'da: sayfa yenilense de sekmenin geçmişi sürdüğü için
 * geri bağlantısı da sürmeli.
 */

export interface GezintiKaydi {
  /** react-router'ın her geçmiş kaydına verdiği anahtar. */
  key: string;
  /** pathname + search */
  to: string;
  /** Sayfanın adı; ancak sayfa kendini tanıttıysa (bkz. adiKaydet) bilinir. */
  label?: string;
}

export interface GezintiDurumu {
  yigin: GezintiKaydi[];
  konum: number;
}

export type GezintiTuru = "PUSH" | "POP" | "REPLACE";

export const BOS_GEZINTI: GezintiDurumu = { yigin: [], konum: -1 };

function yol(to: string): string {
  const i = to.indexOf("?");
  return i === -1 ? to : to.slice(0, i);
}

/** Saf geçiş kuralı: bir gezinti olayı yığını nasıl değiştirir. */
export function gezintiyiIsle(durum: GezintiDurumu, tur: GezintiTuru, key: string, to: string): GezintiDurumu {
  const simdiki = durum.yigin[durum.konum];
  // Aynı kaydı ikinci kez işlemek (StrictMode'un çift render'ı, yeniden
  // render) hiçbir şeyi değiştirmemeli.
  if (simdiki?.key === key) {
    return simdiki.to === to ? durum : degistir(durum, durum.konum, { ...simdiki, to });
  }

  if (tur === "PUSH" || !simdiki) {
    const yigin = durum.yigin.slice(0, durum.konum + 1).concat({ key, to });
    return { yigin, konum: yigin.length - 1 };
  }

  if (tur === "REPLACE") {
    // Sekme değişimi gibi yerinde güncellemeler yeni anahtar üretiyor. Aynı
    // sayfada kalındıysa adı korunur — yoksa sekme değiştiren her sayfa, bir
    // sonraki sayfanın geri bağlantısında adsız kalırdı.
    const label = yol(simdiki.to) === yol(to) ? simdiki.label : undefined;
    return degistir(durum, durum.konum, { key, to, label });
  }

  // POP: tarayıcının geri/ileri tuşu ya da navigate(-1).
  const i = durum.yigin.findIndex((k) => k.key === key);
  if (i !== -1) return { ...durum, konum: i };
  // Tanınmayan kayıt (uygulama dışından dönüldü): önceki bilgiye güvenilemez.
  return { yigin: [{ key, to }], konum: 0 };
}

function degistir(durum: GezintiDurumu, i: number, kayit: GezintiKaydi): GezintiDurumu {
  const yigin = durum.yigin.slice();
  yigin[i] = kayit;
  return { ...durum, yigin };
}

/** Sayfa adını bildirdiğinde o kayda yazar (bkz. usePageHeader). */
export function adiKaydet(durum: GezintiDurumu, key: string, label: string): GezintiDurumu {
  const i = durum.yigin.findIndex((k) => k.key === key);
  if (i === -1 || durum.yigin[i].label === label) return durum;
  return degistir(durum, i, { ...durum.yigin[i], label });
}

/** Bir önceki kayıt — yalnızca adı biliniyorsa; adsız bir geri bağlantısı gösterilemez. */
export function oncekiKayit(durum: GezintiDurumu): GezintiKaydi | null {
  const k = durum.yigin[durum.konum - 1];
  return k?.label ? k : null;
}

// ─────────────────────────────────────────────── Oturum deposu

const ANAHTAR = "projelio.gezinti";
/** Uzun oturumlarda depo şişmesin; bu kadar geriye zaten kimse dönmüyor. */
const TAVAN = 50;

let durum: GezintiDurumu = oku();

function oku(): GezintiDurumu {
  try {
    const ham = JSON.parse(sessionStorage.getItem(ANAHTAR) ?? "null");
    if (ham && Array.isArray(ham.yigin) && typeof ham.konum === "number") return ham;
  } catch {
    // Gizli pencere / engellenmiş depo: boş başlamak yeterli.
  }
  return BOS_GEZINTI;
}

function yaz(yeni: GezintiDurumu) {
  if (yeni === durum) return;
  if (yeni.yigin.length > TAVAN) {
    const fazla = yeni.yigin.length - TAVAN;
    yeni = { yigin: yeni.yigin.slice(fazla), konum: Math.max(0, yeni.konum - fazla) };
  }
  durum = yeni;
  try {
    sessionStorage.setItem(ANAHTAR, JSON.stringify(durum));
  } catch {
    // Yazılamazsa bellek içi kopya bu oturum için yine çalışır.
  }
}

export const gezinti = {
  isle: (tur: GezintiTuru, key: string, to: string) => yaz(gezintiyiIsle(durum, tur, key, to)),
  adiKaydet: (key: string, label: string) => yaz(adiKaydet(durum, key, label)),
  onceki: () => oncekiKayit(durum),
};
