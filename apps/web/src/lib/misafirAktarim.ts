/**
 * Üye olmadan yapılan çalışmanın hesaba aktarımı.
 *
 * Ziyaretçi projelio.app'te çalışır, taslak orada tarayıcıda durur (bkz.
 * landing/src/lib/misafir.ts; tel biçimi o dosyayla ORTAK sözleşme). Üye olurken
 * `/register#misafir=...` ile buraya gelir ve bu origin'de saklanır: e-posta
 * doğrulaması ve giriş arada geçtiği için aktarım ancak ilk oturumda yapılabilir.
 *
 * Parça dışarıdan gelen veri: bağlantıyı başkası da hazırlayabilir. O yüzden
 * sınırlar burada YENİDEN uygulanıyor ve kayıt ekranı neyin aktarılacağını
 * gösterip vazgeçme imkânı veriyor.
 */

export const MISAFIR_ANAHTAR = "projelio_misafir_aktarim";

const SINIR = { gorev: 10, ad: 80, gorevBaslik: 140 };
/** Doğrulama bağlantısı 24 saat geçerli; ortak bilgisayarda sonsuza dek durmasın. */
const OMUR_MS = 7 * 24 * 60 * 60 * 1000;
/** Kalıcı bir hata girişi her açılışta tekrar tekrar denemesin. */
const AZAMI_DENEME = 3;
const GUN_MS = 24 * 60 * 60 * 1000;

export interface MisafirTaslak {
  is: string;
  proje: string | null;
  gorevler: { baslik: string; bitti: boolean }[];
}

interface Bekleyen {
  taslak: MisafirTaslak;
  alindi: number;
  deneme: number;
  // Yarıda kesilirse kaldığı yerden sürer; baştan başlamak işi iki kez açardı.
  isId?: string;
  projeId?: string;
  aktarilan: number;
}

type Depo = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type Post = <T>(path: string, body: unknown) => Promise<T>;
type Olusturma = { outcome?: string; entity?: { id?: string } };

const metin = (d: unknown, sinir: number): string =>
  typeof d === "string" ? d.trim().slice(0, sinir) : "";

export function parcayiCoz(hash: string): MisafirTaslak | null {
  const eslesme = /^#misafir=([A-Za-z0-9_-]+)$/.exec(hash);
  if (!eslesme) return null;
  try {
    const ikili = atob(eslesme[1].replace(/-/g, "+").replace(/_/g, "/"));
    const tel = JSON.parse(new TextDecoder().decode(Uint8Array.from(ikili, (h) => h.charCodeAt(0))));
    if (tel?.v !== 1) return null;
    const is = metin(tel.i, SINIR.ad);
    if (!is) return null;
    const proje = metin(tel.p, SINIR.ad) || null;
    // Görevler projeye bağlı: proje yoksa gidecek yerleri de yok.
    const gorevler = proje && Array.isArray(tel.g)
      ? tel.g
          .slice(0, SINIR.gorev)
          .map((g: unknown) => ({
            baslik: metin(Array.isArray(g) ? g[0] : "", SINIR.gorevBaslik),
            bitti: Array.isArray(g) && g[1] === 1,
          }))
          .filter((g: { baslik: string }) => g.baslik)
      : [];
    return { is, proje, gorevler };
  } catch {
    return null;
  }
}

function oku(depo: Depo, simdi: number): Bekleyen | null {
  try {
    const ham = depo.getItem(MISAFIR_ANAHTAR);
    if (!ham) return null;
    const k = JSON.parse(ham) as Bekleyen;
    if (!k?.taslak?.is || simdi - k.alindi > OMUR_MS || k.deneme >= AZAMI_DENEME) {
      depo.removeItem(MISAFIR_ANAHTAR);
      return null;
    }
    return k;
  } catch {
    return null;
  }
}

function yaz(depo: Depo, k: Bekleyen): void {
  try {
    depo.setItem(MISAFIR_ANAHTAR, JSON.stringify(k));
  } catch {
    // Depolama kapalıysa aktarım yalnızca bu açılışta denenebilir.
  }
}

/** Adresteki taslağı alır, adresi temizler, bekleyen taslağı döner. */
export function misafirParcasiniYakala(depo: Depo = localStorage, simdi = Date.now()): MisafirTaslak | null {
  const taslak = parcayiCoz(window.location.hash);
  if (taslak) {
    yaz(depo, { taslak, alindi: simdi, deneme: 0, aktarilan: 0 });
    // Geçmişte ve kopyalanan adreste kalmasın.
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }
  return oku(depo, simdi)?.taslak ?? null;
}

export function misafirAktarimBekliyorMu(depo: Depo = localStorage, simdi = Date.now()): boolean {
  return oku(depo, simdi) !== null;
}

export function misafirAktarimindanVazgec(depo: Depo = localStorage): void {
  depo.removeItem(MISAFIR_ANAHTAR);
}

function idAl(yanit: Olusturma | undefined): string {
  const id = yanit?.entity?.id;
  if (!id) throw new Error("Kayıt oluşturulamadı");
  return id;
}

async function aktar(post: Post, depo: Depo, simdi: number) {
  const k = oku(depo, simdi);
  if (!k) return null;
  k.deneme += 1;
  yaz(depo, k);

  if (!k.isId) {
    k.isId = idAl(await post<Olusturma>("/jobs", { title: k.taslak.is }));
    yaz(depo, k);
  }
  if (k.taslak.proje && !k.projeId) {
    // Tarih sütunları zorunlu. Bugünü yazmak yeni açılan işi yarın "gecikti"
    // diye kırmızıya boyardı; kişi gerçek tarihi sonra verir.
    k.projeId = idAl(
      await post<Olusturma>("/projects", {
        jobId: k.isId,
        title: k.taslak.proje,
        totalBudget: 0,
        startDate: new Date(simdi).toISOString(),
        deadline: new Date(simdi + 30 * GUN_MS).toISOString(),
        status: "active",
      })
    );
    yaz(depo, k);
  }
  for (; k.projeId && k.aktarilan < k.taslak.gorevler.length; k.aktarilan++, yaz(depo, k)) {
    const g = k.taslak.gorevler[k.aktarilan];
    await post(`/projects/${k.projeId}/tasks`, {
      title: g.baslik,
      status: g.bitti ? "completed" : "todo",
      deadline: new Date(simdi + 7 * GUN_MS).toISOString(),
    });
  }
  depo.removeItem(MISAFIR_ANAHTAR);
  return { isId: k.isId, projeId: k.projeId };
}

/**
 * Bekleyen taslağı hesaba yazar. Hata fırlatırsa taslak durur, sonraki açılışta
 * kaldığı yerden sürer. İki sekme aynı anda açılırsa kilit tek birine verilir.
 */
export async function misafirTaslaginiAktar(post: Post, depo: Depo = localStorage, simdi = Date.now()) {
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request(MISAFIR_ANAHTAR, { ifAvailable: true }, (kilit) =>
      kilit ? aktar(post, depo, simdi) : null
    );
  }
  return aktar(post, depo, simdi);
}
