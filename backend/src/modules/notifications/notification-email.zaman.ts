/**
 * Günlük özetin "sırası geldi mi" hesabı — saf fonksiyonlar, veritabanı yok.
 *
 * NEDEN AYRI DOSYA: bu mantığın tek zor tarafı SAAT DİLİMİ ve tam da orada
 * sessizce yanlış olması mümkün (yaz saati, 30 dakikalık ofsetler, gece yarısı
 * sınırı). İşleyicinin içinde kalsaydı ancak canlıda yanlış saatte giden bir
 * e-postayla fark edilirdi; burada testle sabitlenmiş durumda.
 */

const VARSAYILAN_ZAMAN_DILIMI = "Europe/Istanbul";

const bicimlendiriciler = new Map<string, Intl.DateTimeFormat>();

/**
 * Saat dilimi GEÇERLİ Mİ. Kullanıcı tarayıcısından geliyor
 * (Intl.DateTimeFormat().resolvedOptions().timeZone) ama uçtan doğrudan da
 * yazılabilir; geçersiz bir değer Intl'de RangeError fırlatır ve doğrulanmazsa
 * o kullanıcının özeti HER turda patlardı.
 */
export function zamanDilimiGecerliMi(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function bicimlendirici(timezone: string): Intl.DateTimeFormat {
  const anahtar = zamanDilimiGecerliMi(timezone) ? timezone : VARSAYILAN_ZAMAN_DILIMI;
  let mevcut = bicimlendiriciler.get(anahtar);
  if (!mevcut) {
    mevcut = new Intl.DateTimeFormat("en-GB", {
      timeZone: anahtar,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
    });
    bicimlendiriciler.set(anahtar, mevcut);
  }
  return mevcut;
}

export interface YerelAn {
  /** YYYY-MM-DD — kullanıcının saat dilimindeki takvim günü. */
  gun: string;
  /** 0-23 */
  saat: number;
}

/** Bir anı kullanıcının saat diliminde "hangi gün, saat kaç" diye çözer. */
export function yerelAn(an: Date, timezone: string): YerelAn {
  const parcalar = bicimlendirici(timezone).formatToParts(an);
  const al = (tip: Intl.DateTimeFormatPartTypes) => parcalar.find((p) => p.type === tip)?.value ?? "";
  // hourCycle h23 verilmesine rağmen bazı ortamlarda gece yarısı "24" dönüyor.
  const saat = Number(al("hour")) % 24;
  return { gun: `${al("year")}-${al("month")}-${al("day")}`, saat };
}

/**
 * Günlük özet şimdi gönderilmeli mi?
 *
 * Kural: kullanıcının yerel saati seçtiği saate ULAŞTIYSA ve o yerel günün
 * özeti henüz gönderilmediyse. "Tam o saatte" değil "o saatten sonra" olması
 * bilinçli: sunucu yeniden başlatılır, tur kaçar, iş yükü gecikir — eşitlik
 * arayan bir kural o gün özeti hiç göndermezdi. Bu kural en kötü ihtimalle
 * özeti geç gönderir, ama hiç atlamaz.
 */
export function gunlukOzetSirasiGeldiMi(params: {
  simdi: Date;
  timezone: string;
  dailyHour: number;
  /** Son gönderilen özetin yerel günü (YYYY-MM-DD) — hiç gönderilmediyse null. */
  sonOzetGunu: string | null;
}): { gonder: boolean; gun: string } {
  const { gun, saat } = yerelAn(params.simdi, params.timezone);
  if (params.sonOzetGunu === gun) return { gonder: false, gun };
  return { gonder: saat >= params.dailyHour, gun };
}
