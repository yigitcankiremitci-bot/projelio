import type { PartyActivityType } from "./types";

/**
 * Müşteri / potansiyel müşteri kartının görüşme notları — saf kurallar.
 *
 * Notlar party_activity satırları (bkz. migration 160): yazan ve tarih
 * sunucuda damgalanır, burada yalnızca gösterim ve özet kararları var. Sunucu
 * (liste özeti) ile arayüz (kart) aynı koddan geçer; "son temas" iki yerde
 * farklı hesaplanmasın diye.
 */

/** Kullanıcının seçebildiği görüşme türleri, seçicideki sırayla. `sistem` yok: onu yalnızca sunucu yazar. */
export const GORUSME_TURLERI: readonly Exclude<PartyActivityType, "sistem">[] = [
  "arama",
  "ulasilamadi",
  "toplanti",
  "eposta",
  "teklif",
  "ziyaret",
  "not",
];

// dil:anahtar-baslangic
export const GORUSME_TURU_ETIKETI: Record<PartyActivityType, string> = {
  arama: "Arandı",
  ulasilamadi: "Ulaşılamadı",
  toplanti: "Toplantı",
  eposta: "E-posta",
  teklif: "Teklif verildi",
  ziyaret: "Ziyaret",
  not: "Not",
  sistem: "Sistem",
};
// dil:anahtar-bitis

export const GORUSME_TURU_SIMGESI: Record<PartyActivityType, string> = {
  arama: "📞",
  ulasilamadi: "📵",
  toplanti: "🤝",
  eposta: "✉️",
  teklif: "📄",
  ziyaret: "📍",
  not: "📝",
  sistem: "⚙️",
};

export interface TemasOzeti {
  /** En son görüşme notu (sistem kayıtları sayılmaz). */
  sonTemas?: { type: PartyActivityType; occurredAt: string; userName?: string };
  /** En son notlardan geriye doğru üst üste kaç "Ulaşılamadı" var (0 = son temas başarılı ya da hiç yok). */
  ulasilamadiSerisi: number;
  /** Sistem dışı not sayısı. */
  notSayisi: number;
}

/**
 * Kartın görüşme özeti. Girdi sırası önemsiz; tarihe göre en yeniden geriye
 * bakılır. "Ulaşılamadı" serisi ilk başarılı temasta kesilir — dün açtı,
 * bugün açmadıysa seri 1'dir, 2 değil.
 */
export function temasOzeti(
  notlar: readonly { type: PartyActivityType; occurredAt: string; userName?: string }[]
): TemasOzeti {
  const sirali = notlar
    .filter((n) => n.type !== "sistem")
    .slice()
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  let seri = 0;
  for (const n of sirali) {
    if (n.type !== "ulasilamadi") break;
    seri++;
  }
  const son = sirali[0];
  return {
    sonTemas: son ? { type: son.type, occurredAt: son.occurredAt, userName: son.userName } : undefined,
    ulasilamadiSerisi: seri,
    notSayisi: sirali.length,
  };
}

export type AramaDurumu = "gecikti" | "bugun" | "yakinda";

/** Tekrar arama gününün bugüne göre durumu (YYYY-AA-GG). Boşsa planlı arama yok. */
export function aramaDurumu(sonrakiArama: string | undefined, bugun: string): AramaDurumu | undefined {
  if (!sonrakiArama) return undefined;
  if (sonrakiArama < bugun) return "gecikti";
  if (sonrakiArama === bugun) return "bugun";
  return "yakinda";
}

/** Bir YYYY-AA-GG gününe n gün ekler (saat dilimi kaymasın diye UTC'de). */
export function gunEkle(gun: string, n: number): string {
  const d = new Date(`${gun}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Not formundaki "Tekrar ara" kısayolları. Ulaşılamadıysa ertesi gün, başarılı
 * aramada bir hafta sonrası öne çıkar — en sık seçilen.
 */
export function tekrarAramaOnerileri(bugun: string): { etiket: string; gun: string }[] {
  // dil:anahtar-baslangic
  return [
    { etiket: "Yarın", gun: gunEkle(bugun, 1) },
    { etiket: "3 gün sonra", gun: gunEkle(bugun, 3) },
    { etiket: "1 hafta sonra", gun: gunEkle(bugun, 7) },
    { etiket: "2 hafta sonra", gun: gunEkle(bugun, 14) },
  ];
  // dil:anahtar-bitis
}
