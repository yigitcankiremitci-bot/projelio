import type { ModuleCatalogEntry } from "@projelio/shared";
import { metniNormallestir } from "@projelio/shared";

/**
 * Serbest çalışanın Modüller sekmesi: arama, kategori, durum ve sıralama.
 *
 * Liste 35+ modüle çıkınca tek uzun sütunda aranan modülü bulmak zorlaştı.
 * Kurallar burada saf tutuluyor ki bileşen yalnızca çizsin ve davranış
 * test edilebilsin.
 *
 * KATEGORİ = modülün birincil departmanı, ama serbest çalışana "departman"
 * demek anlamsız (şirketi yok); o yüzden departman anahtarına iş diliyle bir
 * ad veriliyor. Sıra da bir serbest çalışanın en sık baktığından başlıyor.
 */

// dil:anahtar-baslangic
export const KATEGORILER: { key: string; ad: string }[] = [
  { key: "satis_is_gelistirme", ad: "Satış ve bağlantılar" },
  { key: "musteri_iliskileri", ad: "Müşteri ilişkileri" },
  { key: "pazarlama_buyume", ad: "Pazarlama" },
  { key: "finans_muhasebe", ad: "Finans" },
  { key: "yonetim", ad: "Strateji ve ekip" },
  { key: "urun_yonetimi", ad: "Ürünler" },
  { key: "hukuk_uyum", ad: "Hukuk" },
  { key: "bilgi_teknolojileri_yazilim", ad: "Teknoloji ve hesaplar" },
  { key: "insan_kaynaklari", ad: "Kişisel gelişim" },
  { key: "operasyon_uretim", ad: "Operasyon" },
];
export const DIGER_KATEGORI = { key: "diger", ad: "Diğer" };
// dil:anahtar-bitis

export type ModulDurumu = "hepsi" | "atanmis" | "atanmamis";
export type ModulSiralama = "onerilen" | "ad" | "kullanim";

export interface ModulFiltresi {
  arama: string;
  kategori: string; // "hepsi" ya da KATEGORILER[].key / "diger"
  durum: ModulDurumu;
  siralama: ModulSiralama;
}

export const VARSAYILAN_FILTRE: ModulFiltresi = { arama: "", kategori: "hepsi", durum: "hepsi", siralama: "onerilen" };

const BILINEN = new Set(KATEGORILER.map((k) => k.key));

export function kategoriAnahtari(m: Pick<ModuleCatalogEntry, "departmentKey">): string {
  return m.departmentKey && BILINEN.has(m.departmentKey) ? m.departmentKey : DIGER_KATEGORI.key;
}

function kategoriSirasi(key: string): number {
  const i = KATEGORILER.findIndex((k) => k.key === key);
  return i === -1 ? KATEGORILER.length : i;
}

/**
 * Arama puanı: her kelime adda ya da açıklamada geçmeli (VE). Adda geçen
 * kelime açıklamadakinden ağır basar — "fatura" yazan Fatura modülünü,
 * açıklamasında "fatura" geçen beş modülün altında aramasın. Eşleşmezse null.
 */
export function aramaPuani(m: Pick<ModuleCatalogEntry, "name" | "description">, arama: string): number | null {
  const kelimeler = metniNormallestir(arama).split(" ").filter(Boolean);
  if (!kelimeler.length) return 0;
  const ad = metniNormallestir(m.name);
  const aciklama = metniNormallestir(m.description ?? "");
  let puan = 0;
  for (const k of kelimeler) {
    if (ad.startsWith(k)) puan += 3;
    else if (ad.includes(k)) puan += 2;
    else if (aciklama.includes(k)) puan += 1;
    else return null;
  }
  return puan;
}

/**
 * Filtreyi uygular ve sıralar. `atamaSayisi` modül başına kaç işe atandığı.
 *
 * Arama varken "Önerilen" sıralama alaka sırasına döner; kullanıcı açıkça
 * A-Z ya da kullanım seçtiyse ona uyulur.
 */
export function modulleriSuz(
  katalog: ModuleCatalogEntry[],
  filtre: ModulFiltresi,
  atamaSayisi: (key: string) => number
): ModuleCatalogEntry[] {
  const puanli: { m: ModuleCatalogEntry; puan: number }[] = [];
  for (const m of katalog) {
    if (filtre.kategori !== "hepsi" && kategoriAnahtari(m) !== filtre.kategori) continue;
    const n = atamaSayisi(m.key);
    if (filtre.durum === "atanmis" && n === 0) continue;
    if (filtre.durum === "atanmamis" && n > 0) continue;
    const puan = aramaPuani(m, filtre.arama);
    if (puan === null) continue;
    puanli.push({ m, puan });
  }

  const adSirasi = (a: ModuleCatalogEntry, b: ModuleCatalogEntry) => a.name.localeCompare(b.name, "tr");
  puanli.sort((a, b) => {
    if (filtre.siralama === "ad") return adSirasi(a.m, b.m);
    if (filtre.siralama === "kullanim") return atamaSayisi(b.m.key) - atamaSayisi(a.m.key) || adSirasi(a.m, b.m);
    if (filtre.arama.trim() && b.puan !== a.puan) return b.puan - a.puan;
    return (
      kategoriSirasi(kategoriAnahtari(a.m)) - kategoriSirasi(kategoriAnahtari(b.m)) ||
      a.m.sortOrder - b.m.sortOrder ||
      adSirasi(a.m, b.m)
    );
  });
  return puanli.map((p) => p.m);
}

/**
 * Listeyi kategori başlıklarıyla çizmek mantıklı mı? Yalnızca "Önerilen"
 * sırada, arama yokken ve tüm kategoriler görünürken — A-Z ya da alaka
 * sırasında başlıklar listeyi parçalara bölüp sırayı bozardı.
 */
export function kategoriyeGoreGrupla(filtre: ModulFiltresi): boolean {
  return filtre.siralama === "onerilen" && filtre.kategori === "hepsi" && !filtre.arama.trim();
}
