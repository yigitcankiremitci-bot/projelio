// Müze: biten projelerin değiştirilemez plaketleri (migration 189).
//
// Plaket, projenin bittiği anın kopyasıdır ve veritabanında basılır
// (`muze_plaket_bas`); burada yalnızca okunan biçim ve arayüzle sunucunun
// ortak kuralları var. Projenin düzenlenebilir hâli Arşiv > Biten projeler'de.

/** Plakette adı yazan kişi. userId boşsa kişi hesabını silmiştir ("Eski ekip üyesi"). */
export interface MuzeKatkisi {
  userId: string | null;
  ad: string;
  /** Emeği geçtiği biten görev sayısı (atanan ya da bitiren). */
  gorev: number;
}

/**
 * Plaketin kaynağı olan projenin BUGÜNKÜ hâli — plakete değil, "Arşivde aç"
 * bağlantısına karar verir:
 * - tamamlandi: proje hâlâ bitmiş; Arşiv > Biten projeler'de durur.
 * - yeniden_acildi: proje sonradan yeniden açılmış; plaket yine de kalır.
 * - arsivde: proje arşivlenmiş (Arşiv > Arşivlenenler).
 * - kapali: proje silinmiş ya da bakanın artık projeyi görme hakkı yok.
 */
export type MuzeProjeDurumu = "tamamlandi" | "yeniden_acildi" | "arsivde" | "kapali";

export interface MuzePlaketi {
  id: string;
  projectId: string;
  jobId?: string;
  organizationId?: string;
  groupId?: string;
  projeAdi: string;
  isAdi?: string;
  kapak?: string;
  baslangic?: string;
  teslim?: string;
  /** Bitiş anı (ISO). */
  bitis: string;
  /** Bitiş anı tahmin mi (müzeden önce biten projeler). */
  tahminiTarih: boolean;
  sureGun: number;
  /** Teslim günü − bitiş günü: artı erken, 0 tam gününde, eksi geç. */
  teslimFarkiGun?: number;
  gorevSayisi: number;
  ciktiSayisi: number;
  paylasimSayisi: number;
  katkilar: MuzeKatkisi[];
  sira?: number;
  siraKapsami?: "organizasyon" | "is";
  /** Kaynak projenin bugünkü hâli (bkz. MuzeProjeDurumu). */
  projeDurumu: MuzeProjeDurumu;
  /** Projenin BUGÜNKÜ adı (Arşiv listesi için); proje görülemiyorsa boş. Plakette projeAdi yazar. */
  projeGuncelAdi?: string;
}

/**
 * Plaketi kim görür: bitiş anında projede olanlar (sahip, onaylı üyeler,
 * katkı verenler) ve işi BUGÜN yöneten (iş sahibi, şirket sahibi, departman
 * yöneticisi, holding sahibi — AccessService.seesAllProjectsOfJob). İkincisi
 * proje sayfasındaki kuralla aynı; birincisi plaketin anı olmasından: projeden
 * sonradan çıkarılan kişi emeğinin plaketini görmeye devam eder.
 */
export function plaketiGorebilir(k: { katilimciMi: boolean; isiYonetiyor: boolean }): boolean {
  return k.katilimciMi || k.isiYonetiyor;
}

/** Kaynak projenin bugünkü hâli. Proje yoksa ya da görülemiyorsa "kapali". */
export function muzeProjeDurumu(
  proje: { status: string; archivedAt?: string | null } | null | undefined,
  gorebilir: boolean
): MuzeProjeDurumu {
  if (!proje || !gorebilir) return "kapali";
  if (proje.archivedAt) return "arsivde";
  return proje.status === "completed" ? "tamamlandi" : "yeniden_acildi";
}

/**
 * Katkı verenler ADA göre dizilir — bilerek görev sayısına göre değil: plakette
 * sıralama ya da "en çok katkı" vurgusu yok, kimse kendini geride hissetmesin.
 * Hesabını silenler ("Eski ekip üyesi") sona.
 */
export function katkilariDiz(katkilar: MuzeKatkisi[]): MuzeKatkisi[] {
  return [...katkilar].sort((a, b) => {
    if (!a.userId !== !b.userId) return a.userId ? -1 : 1;
    return a.ad.localeCompare(b.ad, "tr");
  });
}

export type TeslimSonucu = { tur: "erken" | "gec"; gun: number } | { tur: "tam" } | null;

/** Teslim farkından plakete yazılacak sonuç. Teslim günü yoksa null. */
export function teslimSonucu(teslimFarkiGun: number | null | undefined): TeslimSonucu {
  if (teslimFarkiGun === null || teslimFarkiGun === undefined) return null;
  if (teslimFarkiGun === 0) return { tur: "tam" };
  return teslimFarkiGun > 0 ? { tur: "erken", gun: teslimFarkiGun } : { tur: "gec", gun: -teslimFarkiGun };
}

/** Müzenin başındaki toplamlar. Aynı kişi birden çok plakette bir kez sayılır. */
export function muzeOzeti(plaketler: Pick<MuzePlaketi, "sureGun" | "gorevSayisi" | "katkilar">[]): {
  proje: number;
  kisi: number;
  gun: number;
  gorev: number;
} {
  const kisiler = new Set<string>();
  let anonim = 0;
  let gun = 0;
  let gorev = 0;
  for (const p of plaketler) {
    gun += p.sureGun;
    gorev += p.gorevSayisi;
    for (const k of p.katkilar) {
      if (k.userId) kisiler.add(k.userId);
      else anonim += 1;
    }
  }
  return { proje: plaketler.length, kisi: kisiler.size + anonim, gun, gorev };
}

/** Plaketin yılı (süzgeç için), Türkiye saatine göre. */
export function plaketYili(bitis: string): number {
  const d = new Date(bitis);
  // Türkiye UTC+3, yaz saati yok: yıl dönümü gecesi 21:00 UTC'den sonrası yeni yıl.
  return new Date(d.getTime() + 3 * 60 * 60 * 1000).getUTCFullYear();
}
