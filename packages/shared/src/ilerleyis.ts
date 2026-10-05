import { performansDegeri } from "./icerikAnalizi";
import type { SocialAccountMediaItem, SocialMetricSnapshot } from "./types";

/**
 * İlerleyiş grafiklerinin saf hesapları.
 *
 * NEDEN ORTAK DOSYADA: günlük artış sunucuda (geçmiş tablosundan), haftalık
 * yayın özeti ve büyüme eğrisi tarayıcıda hesaplanıyor; ikisi de aynı
 * "kıyas değeri" kuralını (önce izlenme, yoksa erişim) kullanmalı — bkz.
 * icerikAnalizi.ts > performansDegeri.
 */

/** Anlık görüntünün kıyas değeri: izlenme, yoksa erişim. */
export function goruntuDegeri(g: Pick<SocialMetricSnapshot, "views" | "reach">): number | null {
  if (typeof g.views === "number") return g.views;
  if (typeof g.reach === "number") return g.reach;
  return null;
}

export interface GunlukNokta {
  gun: string;
  deger: number;
}

/**
 * Gönderilerin günlük KAZANDIĞI izlenme.
 *
 * Instagram yalnızca o anki toplamı veriyor; günlük kazanç ardışık iki okuma
 * arasındaki farktan çıkar ve SONRAKİ okumanın gününe yazılır. Negatif fark
 * (Meta'nın düzeltmesi, silinen etkileşim) sıfır sayılır — düşüş "izlenme
 * kaybı" değil, ölçüm gürültüsü. Bir gönderinin İLK okuması kazanç sayılmaz:
 * o sayı gönderinin geçmişteki bütün izlenmesi, tek güne yığılıp grafiği
 * bozardı.
 *
 * `gunAl` günü belirler (sunucuda UTC, "YYYY-MM-DD"). `baslangic` verilirse
 * ondan önceki günler sonuca girmez — ama o günlerin okumaları fark tabanı
 * olarak kullanılır.
 */
export function gunlukArtislar(
  goruntuler: { mediaId: string; capturedAt: string; views?: number | null; reach?: number | null }[],
  gunAl: (iso: string) => string,
  baslangic?: string
): GunlukNokta[] {
  const gonderiler = new Map<string, { zaman: number; iso: string; deger: number }[]>();
  for (const g of goruntuler) {
    const deger = goruntuDegeri({ views: g.views ?? undefined, reach: g.reach ?? undefined });
    const zaman = Date.parse(g.capturedAt);
    if (deger === null || !Number.isFinite(zaman)) continue;
    const liste = gonderiler.get(g.mediaId) ?? [];
    liste.push({ zaman, iso: g.capturedAt, deger });
    gonderiler.set(g.mediaId, liste);
  }

  const gunler = new Map<string, number>();
  for (const liste of gonderiler.values()) {
    liste.sort((a, b) => a.zaman - b.zaman);
    for (let i = 1; i < liste.length; i++) {
      const fark = Math.max(0, liste[i].deger - liste[i - 1].deger);
      const gun = gunAl(liste[i].iso);
      if (baslangic && gun < baslangic) continue;
      gunler.set(gun, (gunler.get(gun) ?? 0) + fark);
    }
  }
  return Array.from(gunler, ([gun, deger]) => ({ gun, deger })).sort((a, b) => a.gun.localeCompare(b.gun));
}

/**
 * Boş günleri 0 ile doldurur: grafikte veri olmayan gün "atlanmış" değil
 * "kazanç yok" görünmeli. Yalnızca ilk ve son veri günü arasını doldurur —
 * geçmiş birikmeden önceki günler 0 değil, BİLİNMİYOR.
 */
export function gunleriDoldur(noktalar: GunlukNokta[]): GunlukNokta[] {
  if (noktalar.length < 2) return noktalar;
  const harita = new Map(noktalar.map((n) => [n.gun, n.deger]));
  const sonuc: GunlukNokta[] = [];
  const gun = new Date(`${noktalar[0].gun}T00:00:00Z`);
  const son = new Date(`${noktalar[noktalar.length - 1].gun}T00:00:00Z`);
  while (gun <= son) {
    const anahtar = gun.toISOString().slice(0, 10);
    sonuc.push({ gun: anahtar, deger: harita.get(anahtar) ?? 0 });
    gun.setUTCDate(gun.getUTCDate() + 1);
  }
  return sonuc;
}

export interface HaftaOzeti {
  /** Haftanın pazartesisi, "YYYY-MM-DD" (çağıranın saat diliminde). */
  hafta: string;
  gonderi: number;
  /** O hafta yayınlanan gönderilerin bugünkü toplam izlenmesi. */
  izlenme: number;
}

/**
 * Yayın haftasına göre: kaç gönderi atıldı, bugün toplam ne kadar izlendi.
 *
 * Geçmiş tablosu gerektirmez (gönderilerin bugünkü değerinden) — yani
 * migration 147'den önceki haftalar da görünür. `pazartesi`, ISO tarihinden
 * haftanın pazartesisini verir; saat dilimi çağıranın (tarayıcı yerel saati).
 */
export function haftalikYayin(
  medya: SocialAccountMediaItem[],
  pazartesi: (iso: string) => string,
  haftaSayisi = 12
): HaftaOzeti[] {
  const haftalar = new Map<string, HaftaOzeti>();
  for (const m of medya) {
    if (!m.postedAt) continue;
    const hafta = pazartesi(m.postedAt);
    const h = haftalar.get(hafta) ?? { hafta, gonderi: 0, izlenme: 0 };
    h.gonderi++;
    h.izlenme += performansDegeri(m) ?? 0;
    haftalar.set(hafta, h);
  }
  return Array.from(haftalar.values())
    .sort((a, b) => a.hafta.localeCompare(b.hafta))
    .slice(-haftaSayisi);
}

export interface EgriNoktasi {
  /** Paylaşımdan bu yana geçen saat. */
  saat: number;
  deger: number;
}

/** Gönderinin büyüme eğrisi: paylaşımdan bu yana saat → izlenme. */
export function buyumeEgrisi(postedAt: string | undefined, noktalar: SocialMetricSnapshot[]): EgriNoktasi[] {
  const bas = postedAt ? Date.parse(postedAt) : NaN;
  const sonuc: EgriNoktasi[] = [];
  for (const n of noktalar) {
    const deger = goruntuDegeri(n);
    const zaman = Date.parse(n.capturedAt);
    if (deger === null || !Number.isFinite(zaman)) continue;
    const saat = Number.isFinite(bas) ? Math.max(0, (zaman - bas) / 3_600_000) : 0;
    sonuc.push({ saat: Math.round(saat * 10) / 10, deger });
  }
  // Paylaşım anı 0 izlenme: eğri sıfırdan başlasın (ilk okuma geç yapıldıysa
  // bile şekil doğru okunur).
  if (sonuc.length && Number.isFinite(bas) && sonuc[0].saat > 0) sonuc.unshift({ saat: 0, deger: 0 });
  return sonuc.sort((a, b) => a.saat - b.saat);
}
