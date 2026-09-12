import type { RecurrenceInterval, ServiceAccountCategory } from "@projelio/shared";

/**
 * Aboneliğin kasadaki düzenli gider satırına çevrilmesi — saf hesap.
 *
 * NEDEN AYRI DOSYA: bu kararın üç hâli var (kur / güncelle / pasifleştir) ve
 * yanlışı pahalı — abonelik işareti kaldırılınca satır SİLİNMEZSE her ay
 * gider yazmaya devam eder, silinirse geçmiş aylardaki gerçek ödemelerin
 * bağlantısı kopar. Kararı veritabanından ayırmak, üç hâlin de testlenebilmesi
 * demek. Ayrıca test koşucusu NestJS servislerini import edemiyor (bkz.
 * budget/vade.ts başındaki not).
 */

export type AbonelikEylemi = "olustur" | "guncelle" | "pasiflestir" | "yok";

export interface AbonelikGirdisi {
  isPaid: boolean;
  amount?: number | null;
  currency?: string | null;
  billingInterval?: RecurrenceInterval | null;
  nextDueDate?: string | null;
  /** Hesabın adı ve planı — defterde ne yazacağını belirler. */
  name: string;
  plan?: string | null;
  category?: ServiceAccountCategory | null;
  /** Hesapta zaten bir düzenli ödeme bağlı mı. */
  mevcutId?: string | null;
}

export interface AbonelikSatiri {
  type: "expense";
  amount: number;
  currency: string;
  category: string;
  description: string;
  interval: RecurrenceInterval;
  next_due_date: string;
  anchor_day: number;
  active: true;
}

export interface AbonelikKarari {
  eylem: AbonelikEylemi;
  /** olustur/guncelle için yazılacak alanlar. */
  satir?: AbonelikSatiri;
}

export interface AbonelikSecenekleri {
  /**
   * Kullanıcı vadeyi bu kaydetmede DEĞİŞTİRDİ mi.
   *
   * NEDEN GEREKLİ: defterdeki düzenli ödemenin vadesi her işlemede gecelik
   * cron tarafından ilerliyor (bkz. recurring-payments.processor.ts). Hesap
   * satırındaki tarih ise kullanıcının yazdığı tarih olarak kalıyor. Bu bayrak
   * olmasaydı, hesabın adını düzeltmek için yapılan bir kaydetme vadeyi geriye
   * çeker ve aynı ay ikinci kez gider yazılırdı.
   */
  vadeDegisti?: boolean;
}

/**
 * Defterdeki kategori.
 *
 * Hesabın kategorisi DEĞİL sabit "Abonelik": defter kategorisi finansal bir
 * kırılım ("Kira", "Yazılım", "Vergi") ve orada 10 ayrı hesap kategorisi
 * görmek nakit akışı tablosunu okunamaz hâle getiriyordu. Hangi hesap olduğu
 * açıklamada yazılı.
 */
const DEFTER_KATEGORISI = "Abonelik";

/**
 * Aboneliğin deftere yazılacak hâli.
 *
 * PASİFLEŞTİRİLİR, SİLİNMEZ: geçmiş aylarda gerçekten ödenmiş tutarlar
 * defterde duruyor ve `recurring_payment_id` ile bu satıra bağlı. Satır
 * silinince (ON DELETE SET NULL) o bağ kopar, yani "bu 40 dolar neyin
 * ödemesiydi" sorusu cevapsız kalır. Pasif satır ise ne gider üretir ne
 * geçmişi bozar.
 */
export function abonelikKarari(girdi: AbonelikGirdisi, secenekler: AbonelikSecenekleri = {}): AbonelikKarari {
  if (!girdi.isPaid) {
    return { eylem: girdi.mevcutId ? "pasiflestir" : "yok" };
  }

  if (typeof girdi.amount !== "number" || !Number.isFinite(girdi.amount) || girdi.amount <= 0) {
    throw new Error("Ücretli abonelik için tutar gerekli");
  }
  if (!girdi.billingInterval) {
    throw new Error("Ücretli abonelik için ödeme aralığı gerekli");
  }

  // Vade girilmemişse BUGÜN: kullanıcı "bu abonelik var" demiş, ilk kesintinin
  // tarihini bilmiyor olabilir. Bugünden başlamak, gecenin cron'unda ilk
  // gideri yazar ve kullanıcı tarihi sonra düzeltir. Boş bırakıp hiç
  // yazmamak, aboneliğin kasada görünmemesi demekti.
  const vade = (girdi.nextDueDate || new Date().toISOString()).slice(0, 10);

  const satir: AbonelikSatiri = {
    type: "expense",
    amount: girdi.amount,
    currency: (girdi.currency || "TRY").toUpperCase(),
    category: DEFTER_KATEGORISI,
    description: girdi.plan?.trim() ? `${girdi.name} — ${girdi.plan.trim()}` : girdi.name,
    interval: girdi.billingInterval,
    next_due_date: vade,
    // Çapa gün vadeden türetilir: "her ayın 31'i" olan bir ödeme Şubat'ta 28'e
    // çekilse de sonraki ay 31'e dönebilsin diye (bkz. budget/vade.ts).
    anchor_day: Number(vade.slice(8, 10)),
    active: true,
  };

  if (!girdi.mevcutId) return { eylem: "olustur", satir };

  // Vade DOKUNULMADAN güncelleniyor: yukarıdaki gerekçe (bkz.
  // AbonelikSecenekleri.vadeDegisti). Tutar, ritim ve açıklama yine
  // güncelleniyor — onların geçmişe etkisi yok.
  if (!secenekler.vadeDegisti) {
    const { next_due_date, anchor_day, ...dokunulmayan } = satir;
    void next_due_date;
    void anchor_day;
    return { eylem: "guncelle", satir: dokunulmayan as AbonelikSatiri };
  }

  return { eylem: "guncelle", satir };
}
