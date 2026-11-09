/**
 * Üye olmadan kullanım: taslağın kuralları ve panele devri.
 *
 * VERİ BİLEREK SUNUCUYA GİTMİYOR. Ziyaretçi için sunucuda kayıt açsaydık her bot
 * ziyareti veritabanında çöp bırakır, üyeliksiz uçlar kötüye kullanıma açılır,
 * henüz aydınlatma metnini görmemiş birinin verisi de bizde dururdu. Taslak bu
 * tarayıcıda kalır; sunucuya ancak kişi üye olunca, kendi hesabıyla yazılır.
 * Sınırlar da bu yüzden yalnızca burada: elle aşılsa bile kaybedilen bir şey
 * yok, panel aktarırken aynı sınırları yeniden uygular.
 *
 * Tel biçimi `apps/web/src/lib/misafirAktarim.ts` ile ORTAK sözleşmedir; landing
 * npm workspace'i olmadığı için kodu paylaşamıyor. Biri değişirse öbürü de değişmeli.
 */

export const SINIR = { gorev: 10, ad: 80, gorevBaslik: 140 } as const;

export type MisafirGorev = { id: string; baslik: string; bitti: boolean };

export type Taslak = {
  is: string | null;
  proje: string | null;
  gorevler: MisafirGorev[];
  /** Panele devredildiği an. Kişi üye olduysa buradaki kopyayı silebilecek kimse yok. */
  devredildi?: number;
  /** İşin yazıldığı an; yalnızca İşler kartındaki "kuruldu" satırı için, panele gitmez. */
  isTarihi?: number;
};

export const BOS_TASLAK: Taslak = { is: null, proje: null, gorevler: [] };

const ANAHTAR = "projelio_misafir_taslak";

/** Panel doğrulama bağlantısı 24 saat geçerli; birkaç gün pay bırakılıyor. */
const DEVIR_OMRU_MS = 7 * 24 * 60 * 60 * 1000;

export const doluMu = (t: Taslak) => t.is !== null;

/**
 * localStorage her zaman yok: gizli pencere ya da kapatılmış site verisi okurken
 * bile hata fırlatabiliyor. O zaman uygulama bellekte çalışmaya devam eder.
 */
export function taslakOku(): Taslak {
  try {
    const ham = window.localStorage.getItem(ANAHTAR);
    if (!ham) return BOS_TASLAK;
    const t = JSON.parse(ham) as Taslak;
    if (typeof t?.is !== "string" || !Array.isArray(t.gorevler)) return BOS_TASLAK;
    if (t.devredildi && Date.now() - t.devredildi > DEVIR_OMRU_MS) {
      taslakSil();
      return BOS_TASLAK;
    }
    return t;
  } catch {
    return BOS_TASLAK;
  }
}

export function taslakYaz(t: Taslak): void {
  try {
    window.localStorage.setItem(ANAHTAR, JSON.stringify(t));
  } catch {
    // Kota dolu ya da depolama kapalı: taslak yalnızca bu sayfa açıkken yaşar.
  }
}

export function taslakSil(): void {
  try {
    window.localStorage.removeItem(ANAHTAR);
  } catch {
    // Silinecek bir şey yoksa yapılacak bir şey de yok.
  }
}

function base64url(metin: string): string {
  let ikili = "";
  new TextEncoder().encode(metin).forEach((b) => (ikili += String.fromCharCode(b)));
  return btoa(ikili).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Taslağı panele taşıyan adres.
 *
 * projelio.app ile app.projelio.app ayrı origin: panel buradaki localStorage'ı
 * okuyamaz. Taslak `#` parçasında gidiyor çünkü parça sunucuya, Caddy günlüğüne
 * ve Referer başlığına hiç yazılmaz; sorgu parametresi hepsine yazılırdı.
 */
export function kayitAdresi(kayitUrl: string, t: Taslak): string {
  if (!doluMu(t)) return kayitUrl;
  const tel = {
    v: 1,
    i: t.is,
    p: t.proje,
    g: t.gorevler.slice(0, SINIR.gorev).map((g) => [g.baslik, g.bitti ? 1 : 0]),
  };
  return `${kayitUrl}#misafir=${base64url(JSON.stringify(tel))}`;
}
