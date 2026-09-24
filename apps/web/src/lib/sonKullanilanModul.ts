/**
 * Modüllerin "son kullanıldı" sırası — anasayfadaki Modüller listesinde en son
 * kullanılan en üstte dursun diye.
 *
 * İki sinyal var ve ÖNCELİK SIRASI bilerek böyle:
 *   1. Bu cihazda modülün en son AÇILDIĞI an. Her modül ModuleSurface'ten
 *      geçerek açılıyor (bkz. o dosyadaki not), işaret de orada konuyor.
 *      Tarayıcıda tutuluyor: sunucuya tıklama günlüğü yazmak için fazla
 *      önemsiz bir görünüm tercihi. Açılmış modüller HER ZAMAN önde —
 *      "son kullandığım en üstte" isteği, ekipten birinin başka bir modüle
 *      kayıt girmesiyle bozulmasın.
 *   2. Sunucudaki son kayıt hareketi (module-stats lastActivityAt) — yalnızca
 *      bu cihazda hiç açılmamış modülleri kendi aralarında dizer.
 *      İLERİ TARİHLİ hareket yok sayılır: planlanmış bir sosyal medya
 *      gönderisi "30 Eylül" diye görünüp yeni açılan modülü geçiyordu.
 */
const ANAHTAR = "projelio.son-kullanilan-moduller";

type Kayitlar = Record<string, number>;

function oku(): Kayitlar {
  try {
    const ham = localStorage.getItem(ANAHTAR);
    const veri = ham ? JSON.parse(ham) : {};
    return veri && typeof veri === "object" ? (veri as Kayitlar) : {};
  } catch {
    // Gizli sekme / bozuk kayıt: sıra yalnızca sunucu sinyaline düşer.
    return {};
  }
}

export function modulKullanildi(moduleKey: string, simdi = Date.now()): void {
  try {
    localStorage.setItem(ANAHTAR, JSON.stringify({ ...oku(), [moduleKey]: simdi }));
  } catch {
    // Depolama kapalıysa sıra yalnızca sunucu sinyaline göre kurulur.
  }
}

export function sonAcilislar(): Kayitlar {
  return oku();
}

/**
 * Önce bu cihazda açılanlar (yeniden eskiye), sonra açılmamışlar sunucudaki
 * son harekete göre. Hiç sinyali olmayanlar gelen sırayı korur (sort kararlı).
 */
export function sonKullanimaGoreSirala<T>(
  ogeler: T[],
  anahtar: (oge: T) => string,
  acilislar: Kayitlar,
  sunucuHareketi: Record<string, string | undefined> = {},
  simdi = Date.now()
): T[] {
  const sunucu = (k: string): number => {
    const t = sunucuHareketi[k] ? Date.parse(sunucuHareketi[k] as string) : 0;
    return Number.isNaN(t) || t > simdi ? 0 : t;
  };
  return [...ogeler].sort((a, b) => {
    const ka = anahtar(a);
    const kb = anahtar(b);
    const acA = acilislar[ka] ?? 0;
    const acB = acilislar[kb] ?? 0;
    if (acA !== acB) return acB - acA;
    return sunucu(kb) - sunucu(ka);
  });
}
