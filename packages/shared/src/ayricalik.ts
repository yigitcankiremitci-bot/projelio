/**
 * Kullanıcıya özel ayrıcalıklar (kullanıcı kararı, 2026-11-10).
 *
 * Paket sınırları (modül hakkı, kişi hakkı) ve departman kuralı herkes için
 * aynı; ama bazı kullanıcılara — pilot müşteri, iş ortağı, deneme süreci
 * uzatılan biri — paketini değiştirmeden fazladan hak vermek gerekiyor.
 * Sahte abonelik satırı açmak bunun yolu DEĞİL: abonelik satırı kredi
 * yüklemeyi, yenileme işini ve faturayı tetikler.
 *
 * Kurallar:
 * - Ayrıcalık KİŞİYE verilir ve sahibi olduğu şirketlerde geçer (şirketin
 *   paketi de sahibin aboneliğinden geldiği için aynı mantık).
 * - Paketin ÜSTÜNE eklenir, onun yerine geçmez: paketi yükselten kişi
 *   ayrıcalığını kaybetmez.
 * - Yalnızca platform yöneticisi verir (Admin > Kullanıcılar), her değişiklik
 *   işlem kaydına düşer.
 * - Ayrıcalık kaldırılınca AÇIK modüller/kişiler/departmanlar kapanmaz —
 *   paket düşüşüyle aynı: yalnızca YENİSİ açılamaz.
 */

export interface KullaniciAyricaliklari {
  /** Paketin modül hakkına eklenen modül sayısı. */
  ekstraModul: number;
  /** true = modül sayısı sınırsız (ekstraModul yok sayılır). */
  sinirsizModul: boolean;
  /** Şirketin kişi hakkına eklenen kişi sayısı. */
  ekstraKisi: number;
  /** Departman kuralının izin verdiğinin üstüne açılabilecek departman sayısı. */
  ekstraDepartman: number;
  /** Neden verildiği; yalnızca yöneticiler görür. */
  not: string | null;
  guncellendi?: string | null;
}

export const BOS_AYRICALIK: KullaniciAyricaliklari = {
  ekstraModul: 0,
  sinirsizModul: false,
  ekstraKisi: 0,
  ekstraDepartman: 0,
  not: null,
};

/** Tek bir ek hak için tavan; yanlışlıkla 10000 yazılmasın. Sınırsız modül ayrı bayrakla. */
export const AYRICALIK_TAVANI = 500;

export function ayricalikVarMi(a: KullaniciAyricaliklari | null | undefined): boolean {
  return Boolean(a && (a.sinirsizModul || a.ekstraModul > 0 || a.ekstraKisi > 0 || a.ekstraDepartman > 0));
}

/** Panelden gelen girdiyi doğrular; hata varsa metin döner. */
export function ayricalikDogrula(girdi: unknown): { ayricalik: KullaniciAyricaliklari } | { hata: string } {
  const g = (girdi ?? {}) as Record<string, unknown>;
  const sayi = (deger: unknown, ad: string): number | string => {
    if (deger === undefined || deger === null || deger === "") return 0;
    const n = Number(deger);
    if (!Number.isInteger(n) || n < 0) return `${ad} 0 ya da pozitif bir tam sayı olmalı.`;
    if (n > AYRICALIK_TAVANI) return `${ad} en çok ${AYRICALIK_TAVANI} olabilir.`;
    return n;
  };
  const ekstraModul = sayi(g.ekstraModul, "Ek modül");
  const ekstraKisi = sayi(g.ekstraKisi, "Ek kişi");
  const ekstraDepartman = sayi(g.ekstraDepartman, "Ek departman");
  for (const s of [ekstraModul, ekstraKisi, ekstraDepartman]) if (typeof s === "string") return { hata: s };
  const not = typeof g.not === "string" && g.not.trim() ? g.not.trim().slice(0, 500) : null;
  return {
    ayricalik: {
      ekstraModul: ekstraModul as number,
      sinirsizModul: g.sinirsizModul === true,
      ekstraKisi: ekstraKisi as number,
      ekstraDepartman: ekstraDepartman as number,
      not,
    },
  };
}

/** Veritabanı satırı → nesne. Satır yoksa boş ayrıcalık. */
export function ayricalikSatiriniCevir(row: any): KullaniciAyricaliklari {
  if (!row) return { ...BOS_AYRICALIK };
  return {
    ekstraModul: Number(row.ekstra_modul) || 0,
    sinirsizModul: row.sinirsiz_modul === true,
    ekstraKisi: Number(row.ekstra_kisi) || 0,
    ekstraDepartman: Number(row.ekstra_departman) || 0,
    not: row.not_metni ?? null,
    guncellendi: row.updated_at ?? null,
  };
}
