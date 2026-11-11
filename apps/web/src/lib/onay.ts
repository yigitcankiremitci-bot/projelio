/**
 * Uygulamanın onay / bilgi / soru pencereleri — tarayıcının confirm(),
 * alert() ve prompt()'unun yerine.
 *
 * Neden: tarayıcının kendi pencereleri Chrome'da adres çubuğunun altında,
 * sayfadan kopuk açılıyor; temaya uymuyor, telefonda kabukta hiç
 * görünmeyebiliyor (kullanıcı geri bildirimi, 2026-11-11). Hepsi artık
 * uygulamanın kendi Modal'ında sorulur (bkz. components/OnayKatmani.tsx).
 *
 * Kullanım tarayıcınınkine benzer, yalnızca beklenir:
 *   if (!(await onayla(t("Sipariş silinsin mi?")))) return;
 *
 * Katman yerleşmemişse (ör. testte, hata ekranında) tarayıcının penceresine
 * düşülür: soru hiç sorulmadan asılı kalmasın.
 */

export type OnaySecenekleri = {
  mesaj: string;
  baslik?: string;
  onayEtiketi?: string;
  vazgecEtiketi?: string;
  /** Onay düğmesi kırmızı mı. Verilmezse mesajdan tahmin edilir (sil, iptal, kaldır…). */
  tehlikeli?: boolean;
};

export type SoruSecenekleri = OnaySecenekleri & { varsayilan?: string };

export type OnayIstegi =
  | ({ tur: "onay" } & OnaySecenekleri & { coz: (v: boolean) => void })
  | ({ tur: "bilgi" } & OnaySecenekleri & { coz: () => void })
  | ({ tur: "soru" } & SoruSecenekleri & { coz: (v: string | null) => void });

let kuyruk: OnayIstegi[] = [];
const dinleyiciler = new Set<() => void>();
let katmanSayisi = 0;

function bildirDegisim() {
  for (const d of dinleyiciler) d();
}

function ekle(istek: OnayIstegi) {
  kuyruk = [...kuyruk, istek];
  bildirDegisim();
}

/** Katman: sıradaki isteği gösterir, yanıtlanınca kuyruktan çıkarır. */
export function onayKuyrugu(): OnayIstegi[] {
  return kuyruk;
}
export function onayKuyrugunuDinle(d: () => void): () => void {
  dinleyiciler.add(d);
  katmanSayisi++;
  return () => {
    dinleyiciler.delete(d);
    katmanSayisi--;
  };
}
export function onayIsteginiKapat(istek: OnayIstegi) {
  kuyruk = kuyruk.filter((x) => x !== istek);
  bildirDegisim();
}

function secenek<T extends OnaySecenekleri>(s: string | T): T {
  return (typeof s === "string" ? { mesaj: s } : s) as T;
}

/** Evet/Vazgeç sorusu; Vazgeç, Esc ve dışarı tıklama `false`. */
export function onayla(s: string | OnaySecenekleri): Promise<boolean> {
  const o = secenek(s);
  if (katmanSayisi === 0) return Promise.resolve(window.confirm(o.mesaj));
  return new Promise((coz) => ekle({ tur: "onay", ...o, coz }));
}

/** Yalnızca "Tamam" düğmeli bilgi penceresi. */
export function bildir(s: string | OnaySecenekleri): Promise<void> {
  const o = secenek(s);
  if (katmanSayisi === 0) {
    window.alert(o.mesaj);
    return Promise.resolve();
  }
  return new Promise((coz) => ekle({ tur: "bilgi", ...o, coz }));
}

/** Tek satırlık metin sorusu; vazgeçilirse `null` (tarayıcının prompt'u gibi). */
export function sor(s: string | SoruSecenekleri): Promise<string | null> {
  const o = secenek<SoruSecenekleri>(s);
  if (katmanSayisi === 0) return Promise.resolve(window.prompt(o.mesaj, o.varsayilan));
  return new Promise((coz) => ekle({ tur: "soru", ...o, coz }));
}

/**
 * Onay düğmesinin rengi için kaba tahmin: geri dönüşü zor işler kırmızı.
 * Yalnızca görünüş; yanılırsa çağıran `tehlikeli` verir.
 */
export function tehlikeliMi(mesaj: string): boolean {
  return /silin|sil\b|kaldırıl|iptal|kesilsin|geri alın|bırakıl|ayrıl|kaybol|çıkarıl|kapatıl|delete|remove|cancel/i.test(mesaj);
}
