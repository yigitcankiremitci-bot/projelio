/**
 * Türkiye'nin 81 ili, plaka koduyla — müşteri haritası (Müşteriler > Haritada
 * göster) ve kartlardaki "Şehir" alanının ile eşlenmesi.
 *
 * Kartlarda şehir serbest metin ("İstanbul", "ISTANBUL", "istanbul/kadıköy",
 * "Afyon", "K.Maraş"); eşleme Türkçe harf ve aksan farkını yok sayar, yaygın
 * kısa adları da tanır. Tanınmayan şehir haritada "İl belirtilmemiş / tanınmadı"
 * altında sayılır — sessizce kaybolmaz.
 */

export interface TurkiyeIli {
  plaka: number;
  ad: string;
}

export const TURKIYE_ILLERI: readonly TurkiyeIli[] = [
  { plaka: 1, ad: "Adana" },
  { plaka: 2, ad: "Adıyaman" },
  { plaka: 3, ad: "Afyonkarahisar" },
  { plaka: 4, ad: "Ağrı" },
  { plaka: 5, ad: "Amasya" },
  { plaka: 6, ad: "Ankara" },
  { plaka: 7, ad: "Antalya" },
  { plaka: 8, ad: "Artvin" },
  { plaka: 9, ad: "Aydın" },
  { plaka: 10, ad: "Balıkesir" },
  { plaka: 11, ad: "Bilecik" },
  { plaka: 12, ad: "Bingöl" },
  { plaka: 13, ad: "Bitlis" },
  { plaka: 14, ad: "Bolu" },
  { plaka: 15, ad: "Burdur" },
  { plaka: 16, ad: "Bursa" },
  { plaka: 17, ad: "Çanakkale" },
  { plaka: 18, ad: "Çankırı" },
  { plaka: 19, ad: "Çorum" },
  { plaka: 20, ad: "Denizli" },
  { plaka: 21, ad: "Diyarbakır" },
  { plaka: 22, ad: "Edirne" },
  { plaka: 23, ad: "Elazığ" },
  { plaka: 24, ad: "Erzincan" },
  { plaka: 25, ad: "Erzurum" },
  { plaka: 26, ad: "Eskişehir" },
  { plaka: 27, ad: "Gaziantep" },
  { plaka: 28, ad: "Giresun" },
  { plaka: 29, ad: "Gümüşhane" },
  { plaka: 30, ad: "Hakkari" },
  { plaka: 31, ad: "Hatay" },
  { plaka: 32, ad: "Isparta" },
  { plaka: 33, ad: "Mersin" },
  { plaka: 34, ad: "İstanbul" },
  { plaka: 35, ad: "İzmir" },
  { plaka: 36, ad: "Kars" },
  { plaka: 37, ad: "Kastamonu" },
  { plaka: 38, ad: "Kayseri" },
  { plaka: 39, ad: "Kırklareli" },
  { plaka: 40, ad: "Kırşehir" },
  { plaka: 41, ad: "Kocaeli" },
  { plaka: 42, ad: "Konya" },
  { plaka: 43, ad: "Kütahya" },
  { plaka: 44, ad: "Malatya" },
  { plaka: 45, ad: "Manisa" },
  { plaka: 46, ad: "Kahramanmaraş" },
  { plaka: 47, ad: "Mardin" },
  { plaka: 48, ad: "Muğla" },
  { plaka: 49, ad: "Muş" },
  { plaka: 50, ad: "Nevşehir" },
  { plaka: 51, ad: "Niğde" },
  { plaka: 52, ad: "Ordu" },
  { plaka: 53, ad: "Rize" },
  { plaka: 54, ad: "Sakarya" },
  { plaka: 55, ad: "Samsun" },
  { plaka: 56, ad: "Siirt" },
  { plaka: 57, ad: "Sinop" },
  { plaka: 58, ad: "Sivas" },
  { plaka: 59, ad: "Tekirdağ" },
  { plaka: 60, ad: "Tokat" },
  { plaka: 61, ad: "Trabzon" },
  { plaka: 62, ad: "Tunceli" },
  { plaka: 63, ad: "Şanlıurfa" },
  { plaka: 64, ad: "Uşak" },
  { plaka: 65, ad: "Van" },
  { plaka: 66, ad: "Yozgat" },
  { plaka: 67, ad: "Zonguldak" },
  { plaka: 68, ad: "Aksaray" },
  { plaka: 69, ad: "Bayburt" },
  { plaka: 70, ad: "Karaman" },
  { plaka: 71, ad: "Kırıkkale" },
  { plaka: 72, ad: "Batman" },
  { plaka: 73, ad: "Şırnak" },
  { plaka: 74, ad: "Bartın" },
  { plaka: 75, ad: "Ardahan" },
  { plaka: 76, ad: "Iğdır" },
  { plaka: 77, ad: "Yalova" },
  { plaka: 78, ad: "Karabük" },
  { plaka: 79, ad: "Kilis" },
  { plaka: 80, ad: "Osmaniye" },
  { plaka: 81, ad: "Düzce" },
];

/** "İstanbul" ~ "ISTANBUL" ~ "istanbul": harf/aksan farkı ve noktalama yok sayılır. */
export function ilAnahtari(raw: unknown): string {
  return String(raw ?? "")
    .replace(/İ/g, "i")
    .replace(/I/g, "ı")
    .toLocaleLowerCase("tr")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/ı/g, "i")
    .replace(/â/g, "a")
    .replace(/[^a-z]/g, "");
}

/** Yaygın kısa ve eski adlar. */
const ES_ADLAR: Record<string, number> = {
  afyon: 3,
  maras: 46,
  kmaras: 46,
  urfa: 63,
  icel: 33,
  antep: 27,
  izmit: 41,
  adapazari: 54,
  hakkari: 30,
  hakari: 30,
};

const ANAHTAR_PLAKA = new Map<string, number>([
  ...TURKIYE_ILLERI.map((il) => [ilAnahtari(il.ad), il.plaka] as [string, number]),
  ...Object.entries(ES_ADLAR),
]);

/**
 * Serbest yazılmış şehirden il. "İstanbul/Kadıköy", "Kadıköy, İstanbul" gibi
 * il + ilçe yazımında parçalardan ili olan seçilir. Tanınmazsa undefined.
 */
export function ilBul(sehir: unknown): TurkiyeIli | undefined {
  const parcalar = [String(sehir ?? ""), ...String(sehir ?? "").split(/[\/,\-–()]+/)];
  for (const p of parcalar) {
    const plaka = ANAHTAR_PLAKA.get(ilAnahtari(p));
    if (plaka) return TURKIYE_ILLERI[plaka - 1];
  }
  return undefined;
}

/** İl başına sayım; tanınmayanlar ayrı. */
export function ilSayimi<T>(kayitlar: readonly T[], sehirOf: (k: T) => unknown): { il: Map<number, number>; tanimsiz: number } {
  const il = new Map<number, number>();
  let tanimsiz = 0;
  for (const k of kayitlar) {
    const bulunan = ilBul(sehirOf(k));
    if (bulunan) il.set(bulunan.plaka, (il.get(bulunan.plaka) ?? 0) + 1);
    else tanimsiz += 1;
  }
  return { il, tanimsiz };
}
