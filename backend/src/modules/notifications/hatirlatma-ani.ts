/**
 * Görev hatırlatmasının "ne zaman gitmeli" hesabı — saf fonksiyonlar.
 *
 * NEDEN AYRI DOSYA: kullanıcının girdiği bitiş saati bir DUVAR SAATİ
 * ("16:35, İstanbul"), veritabanında saat dilimi yok. Eskiden işleyici bu saati
 * `new Date(y, m, d, h, dk)` ile sürecin yerel saatine göre kuruyordu; backend
 * konteyneri UTC'de çalıştığı için 16:35'lik hatırlatma 19:35'te gidiyordu —
 * kullanıcı çoğu zaman o saatte görevi çoktan kapatmış oluyor, yani bildirim
 * fiilen HİÇ gelmiyordu (2026-09-24). Hesap artık saat dilimini açıkça alıyor.
 */

/**
 * Konteynerde TZ tanımlı değil (UTC); tanımlanırsa o geçerli olur. Diğer
 * modüllerle (siparis, worklog, shopify) aynı kural.
 */
export const HATIRLATMA_SAAT_DILIMI = process.env.TZ?.trim() || "Europe/Istanbul";

const bicimlendiriciler = new Map<string, Intl.DateTimeFormat>();

function bicimlendirici(timezone: string): Intl.DateTimeFormat {
  let mevcut = bicimlendiriciler.get(timezone);
  if (!mevcut) {
    mevcut = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    bicimlendiriciler.set(timezone, mevcut);
  }
  return mevcut;
}

/** Bir anın o saat dilimindeki ofseti (ms): yerel duvar saati − UTC. */
function ofset(an: Date, timezone: string): number {
  const p = bicimlendirici(timezone).formatToParts(an);
  const al = (tip: Intl.DateTimeFormatPartTypes) => Number(p.find((x) => x.type === tip)?.value ?? 0);
  // hourCycle h23 verilmesine rağmen bazı ortamlarda gece yarısı "24" dönüyor.
  const yerel = Date.UTC(al("year"), al("month") - 1, al("day"), al("hour") % 24, al("minute"), al("second"));
  return yerel - Math.floor(an.getTime() / 1000) * 1000;
}

/**
 * `gun` (YYYY-MM-DD ya da "YYYY-MM-DDTHH:MM:SS" — yalnızca ilk 10 karakter
 * okunur) ile `saat` ("HH:MM" / "HH:MM:SS") birleşip o saat dilimindeki
 * gerçek anı verir.
 *
 * Gün kısmı neden kesilip okunuyor: `tasks.deadline` kimi satırda gece yarısı,
 * kimi satırda 23:59:59 olarak yazılmış (timestamp, dilimsiz). İkisinde de
 * takvim günü ilk 10 karakter; saat kısmı zaten `deadline_time`'dan geliyor.
 */
export function duvarSaatiAni(gun: string | null | undefined, saat: string | null | undefined, timezone = HATIRLATMA_SAAT_DILIMI): Date | null {
  if (!gun || !saat) return null;
  const g = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(gun));
  const s = /^(\d{1,2}):(\d{2})/.exec(String(saat));
  if (!g || !s) return null;
  const naif = Date.UTC(Number(g[1]), Number(g[2]) - 1, Number(g[3]), Number(s[1]), Number(s[2]), 0, 0);
  if (Number.isNaN(naif)) return null;
  // İki geçişli düzeltme: ilk tahminin ofseti yaz saati sınırında yanlış
  // olabilir, ikinci tur o anın gerçek ofsetini alır.
  let an = naif - ofset(new Date(naif), timezone);
  an = naif - ofset(new Date(an), timezone);
  return new Date(an);
}

/** O saat dilimindeki bugünün tarihi, "YYYY-MM-DD". */
export function yerelBugun(simdi = new Date(), timezone = HATIRLATMA_SAAT_DILIMI): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(simdi);
}
