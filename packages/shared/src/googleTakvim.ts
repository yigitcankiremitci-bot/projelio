/**
 * Google Takvim entegrasyonu — web ve backend'in ortak tipleri ve saf
 * yardımcıları (bkz. backend modules/google-takvim, migration 133).
 */

export type TakvimIsleme = "yeni" | "gorev" | "yoksay";
export type TakvimEtkinlikKaynagi = "google" | "projelio";

export interface GoogleTakvimOzeti {
  id: string;
  ad: string;
  renk?: string;
  birincil: boolean;
  /** Etkinlik yazılabiliyor mu (sahip/yazar). Hedef takvim yalnızca bunlardan seçilir. */
  yazilabilir: boolean;
  /** Projelio'da gösterilip eşitleniyor mu. */
  secili: boolean;
}

export interface GoogleTakvimDurumu {
  /** Sunucuda Google anahtarları tanımlı mı. false → kart "yakında" der. */
  yapilandirildi: boolean;
  bagli: boolean;
  eposta: string | null;
  /** Google erişimi geri aldı; kullanıcı yeniden bağlanmalı. */
  kopuk: boolean;
  takvimler: GoogleTakvimOzeti[];
  hedefTakvimId: string;
  sonEsitleme: string | null;
  sonHata: string | null;
}

export interface GoogleTakvimEtkinligi {
  id: string;
  takvimId: string;
  takvimAdi?: string;
  takvimRengi?: string;
  baslik: string;
  aciklama?: string;
  konum?: string;
  /** ISO. Tüm gün etkinliklerde gece yarısı UTC. */
  baslangic: string;
  /** ISO, HARİÇ. */
  bitis: string;
  tumGun: boolean;
  htmlLink?: string;
  meetLink?: string;
  katilimciSayisi?: number;
  duzenleyen?: string;
  kaynak: TakvimEtkinlikKaynagi;
  planBlokId?: string;
  gorevId?: string;
  gorevBasligi?: string;
  isleme: TakvimIsleme;
}

/** Projelio'dan Google'a yeni etkinlik. Saatler kullanıcının yerel saatidir. */
export interface GoogleTakvimEtkinlikGirdisi {
  baslik: string;
  aciklama?: string;
  konum?: string;
  /** YYYY-MM-DD */
  tarih: string;
  /** HH:MM — tümGün değilse zorunlu. */
  baslangicSaati?: string;
  bitisSaati?: string;
  tumGun?: boolean;
  /** Tüm gün etkinlikte son gün (DAHİL). Boşsa tek gün. */
  bitisTarihi?: string;
}

// ---------------------------------------------------------------- yardımcılar

const iki = (n: number) => String(n).padStart(2, "0");

/** Date → yerel YYYY-MM-DD. (Tarayıcıda kullanıcının, sunucuda sürecin saat dilimi.) */
export function takvimGunu(d: Date): string {
  return `${d.getFullYear()}-${iki(d.getMonth() + 1)}-${iki(d.getDate())}`;
}

export function takvimSaati(d: Date): string {
  return `${iki(d.getHours())}:${iki(d.getMinutes())}`;
}

/** YYYY-MM-DD'ye gün ekler; saat dilimi kaymasın diye UTC üzerinden. */
export function takvimGunEkle(tarih: string, gun: number): string {
  const d = new Date(`${tarih}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + gun);
  return d.toISOString().slice(0, 10);
}

/**
 * Tüm gün etkinliğin kapsadığı günler (dahil). Google bitişi HARİÇ tutar:
 * 24 Eylül'lük tek günlük etkinlik 24 → 25 gelir. Bunu unutan her takvim
 * etkinliği bir gün fazla gösterir — en sık yapılan entegrasyon hatası.
 */
export function tumGunGunleri(baslangicIso: string, bitisIso: string): string[] {
  const ilk = baslangicIso.slice(0, 10);
  const son = takvimGunEkle(bitisIso.slice(0, 10), -1);
  const gunler: string[] = [];
  // Güvenlik freni: bozuk veri sonsuz döngü üretmesin.
  for (let g = ilk, i = 0; g <= son && i < 400; g = takvimGunEkle(g, 1), i++) gunler.push(g);
  return gunler.length ? gunler : [ilk];
}

export interface SaatliParca {
  /** YYYY-MM-DD */
  gun: string;
  /** HH:MM */
  baslangic: string;
  /** HH:MM — gün sonuna taşan parça "24:00" değil "23:59" ile biter. */
  bitis: string;
}

/**
 * Saatli bir etkinliği yerel saatte güne göre parçalar. Gece yarısını aşan
 * etkinlik (23:00–01:00) iki güne bölünür; aksi hâlde ızgarada bitişi
 * başlangıçtan önce görünen, çizilemeyen bir kutu olurdu.
 */
export function saatliParcalar(baslangicIso: string, bitisIso: string): SaatliParca[] {
  const bas = new Date(baslangicIso);
  const bit = new Date(bitisIso);
  if (!(bit > bas)) return [{ gun: takvimGunu(bas), baslangic: takvimSaati(bas), bitis: takvimSaati(bas) }];

  const parcalar: SaatliParca[] = [];
  let imlec = bas;
  for (let i = 0; i < 31 && imlec < bit; i++) {
    const gunSonu = new Date(imlec.getFullYear(), imlec.getMonth(), imlec.getDate() + 1);
    const parcaSonu = bit < gunSonu ? bit : gunSonu;
    parcalar.push({
      gun: takvimGunu(imlec),
      baslangic: takvimSaati(imlec),
      bitis: parcaSonu === gunSonu ? "23:59" : takvimSaati(parcaSonu),
    });
    imlec = gunSonu;
  }
  return parcalar;
}

/** Etkinliğin görüneceği günler — ay görünümü ve gün listeleri için. */
export function etkinlikGunleri(e: Pick<GoogleTakvimEtkinligi, "baslangic" | "bitis" | "tumGun">): string[] {
  return e.tumGun ? tumGunGunleri(e.baslangic, e.bitis) : saatliParcalar(e.baslangic, e.bitis).map((p) => p.gun);
}
