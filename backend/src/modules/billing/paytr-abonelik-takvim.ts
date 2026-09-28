import type { BillingPeriod } from "./billing.plans";

/**
 * PayTR aboneliğinin zaman ve tutar kararları (saf fonksiyonlar, ağ/veritabanı yok).
 *
 * PayTR'de yenilemeyi sağlayıcı değil BİZ yürütüyoruz; iyzico'nun kendi
 * içinde verdiği "ne zaman yeniden denenir, ne zaman biter, ne kadar çekilir"
 * kararları burada. Saat başı çalışan iş (PayTRAbonelikService.yenilemeleriCalistir)
 * yalnızca bu kararları uygular.
 *
 * KARARLAR (kullanıcı, 2026-09-28):
 *   · Başarısız çekimde 14 gün tolerans. Vade günü ilk deneme, sonra vadeden
 *     1, 3, 7 ve 14 gün sonra yeniden. Hepsi düşerse abonelik biter. Tolerans
 *     boyunca erişim AÇIK (past_due hak verir, bkz. BillingService HAK_VEREN).
 *   · Yenilemede güncel fiyat çekilir AMA fiyat değiştiyse 7 gün önce haber
 *     verilir. Haber verilmemiş bir tutar ÇEKİLMEZ; o dönem eski tutar geçerli.
 *   · Yıllık abonelere yenilemeden 7 gün önce her durumda hatırlatma.
 */

const GUN_MS = 24 * 60 * 60 * 1000;

/** Vadeden kaç gün sonra yeniden denenir. İlk deneme vade anında. */
export const YENIDEN_DENEME_GUNLERI = [1, 3, 7, 14] as const;
/** İlk deneme + yeniden denemeler. */
export const EN_COK_DENEME = 1 + YENIDEN_DENEME_GUNLERI.length;
/** Yenileme öncesi hatırlatmanın kaç gün önce gideceği. */
export const HATIRLATMA_GUN = 7;

/**
 * Hatırlatma penceresi 7 gün önce açılıyor ve iş saat başı koşuyor. Fiyat
 * değişikliği pencere açıldıktan SONRA yapılırsa haber 7 günden az kalmışken
 * gider — o dönem yeni fiyat duyurulmaz, bir sonrakine kalır. Bir günlük pay,
 * saat başı koşan işin kaçırdığı saatleri de karşılıyor.
 */
const FIYAT_DUYURUSU_EN_AZ_MS = (HATIRLATMA_GUN - 1) * GUN_MS;

function gunEkle(tarih: Date, gun: number): Date {
  return new Date(tarih.getTime() + gun * GUN_MS);
}

/**
 * Ödemesi düşmüş (past_due) PayTR aboneliğinin hak vermeyi SÜRDÜRDÜĞÜ son an:
 * son yeniden denemeden bir gün sonrası. Asıl kapatmayı saat başı iş yapıyor
 * (beşinci deneme düşünce 'expired'); bu sınır iş gecikirse hakkın sızmaması için.
 */
export function toleransSonu(vade: Date): Date {
  return gunEkle(vade, YENIDEN_DENEME_GUNLERI[YENIDEN_DENEME_GUNLERI.length - 1] + 1);
}

/**
 * Bu dönem için bir sonraki denemenin zamanı. `yapilanBasarisiz` = bu vade için
 * şimdiye kadar düşmüş deneme sayısı. Hak bittiyse null.
 */
export function sonrakiDenemeZamani(vade: Date, yapilanBasarisiz: number): Date | null {
  if (yapilanBasarisiz <= 0) return vade;
  const gun = YENIDEN_DENEME_GUNLERI[yapilanBasarisiz - 1];
  return gun === undefined ? null : gunEkle(vade, gun);
}

export type YenilemeKarari =
  | { tur: "cek"; deneme: number }
  | { tur: "bekle"; sonraki: Date }
  | { tur: "bitir" };

/** Vadesi gelmiş bir abonelik için şimdi ne yapılmalı. */
export function yenilemeKarari(vade: Date, yapilanBasarisiz: number, simdi: Date): YenilemeKarari {
  const zaman = sonrakiDenemeZamani(vade, yapilanBasarisiz);
  if (!zaman) return { tur: "bitir" };
  if (simdi.getTime() >= zaman.getTime()) return { tur: "cek", deneme: yapilanBasarisiz + 1 };
  return { tur: "bekle", sonraki: zaman };
}

export type HatirlatmaTuru = "yillik" | "fiyat";

export interface HatirlatmaDurumu {
  period: BillingPeriod;
  vade: Date;
  simdi: Date;
  /** Bu vade için zaten hatırlatma gittiyse o vade. */
  gonderilenVade: Date | null;
  /** Son dönemde çekilen tutar (abonelik satırındaki price_amount). */
  sonTutar: number | null;
  /** Bugünkü liste tutarı. */
  guncelTutar: number | null;
}

/**
 * Yenileme öncesi hatırlatma gerekiyor mu ve DUYURULACAK tutar ne.
 *
 * Duyurulan tutar yenilemede çekilecek tutardır (bkz. yenilemeTutari). Yeni
 * fiyat yalnızca 7 günlük süre gerçekten tanınabiliyorsa duyurulur; yoksa
 * eski tutar duyurulur ve çekilir.
 */
export function hatirlatmaKarari(d: HatirlatmaDurumu): { tur: HatirlatmaTuru; tutar: number } | null {
  if (d.gonderilenVade && d.gonderilenVade.getTime() === d.vade.getTime()) return null;
  const kalan = d.vade.getTime() - d.simdi.getTime();
  if (kalan <= 0 || kalan > HATIRLATMA_GUN * GUN_MS) return null;

  const eski = d.sonTutar ?? d.guncelTutar;
  if (eski === null) return null;
  const fiyatDegisti = d.guncelTutar !== null && d.sonTutar !== null && d.guncelTutar !== d.sonTutar;
  const yeniDuyurulabilir = fiyatDegisti && kalan >= FIYAT_DUYURUSU_EN_AZ_MS;
  const tutar = yeniDuyurulabilir ? d.guncelTutar! : eski;

  if (d.period === "yearly") return { tur: "yillik", tutar };
  if (yeniDuyurulabilir) return { tur: "fiyat", tutar };
  return null;
}

/**
 * Yenilemede çekilecek tutar: bu vade için duyurulan tutar varsa o, yoksa son
 * çekilen tutar. Güncel liste fiyatı BURAYA GİRMEZ — duyurulmamış bir fiyatı
 * çekmek "7 gün önce haber" sözünü bozardı.
 */
export function yenilemeTutari(p: {
  vade: Date;
  sonTutar: number | null;
  hatirlatmaVadesi: Date | null;
  hatirlatmaTutari: number | null;
}): number | null {
  if (p.hatirlatmaVadesi && p.hatirlatmaVadesi.getTime() === p.vade.getTime() && p.hatirlatmaTutari !== null) {
    return p.hatirlatmaTutari;
  }
  return p.sonTutar;
}

/**
 * PayTR'nin bildirimi saklanan kartın ctoken'ını DÖNDÜRMÜYOR (yalnızca utoken).
 * Form açılırken alınan liste ile bildirimden sonraki liste karşılaştırılıyor:
 * önceden olmayan kart yeni saklanandır.
 *
 * Yeni kart bulunamazsa (müşteri zaten saklı olan kartı yeniden girdi ve PayTR
 * yeni kayıt açmadı) listedeki SON kart döner — PayTR yeni kaydı sona ekliyor;
 * tahmin yanlışsa bile çekim müşterinin kendi kartından yapılır.
 */
export function saklananKart<T extends { ctoken: string }>(onceki: string[] | null, sonraki: T[]): T | null {
  if (sonraki.length === 0) return null;
  const eski = new Set(onceki ?? []);
  const yeni = sonraki.filter((k) => !eski.has(k.ctoken));
  return yeni[yeni.length - 1] ?? sonraki[sonraki.length - 1];
}
