import type { Locale } from "@projelio/shared";

/**
 * Randevu saatleri HER ZAMAN yöneticinin saat diliminde gösterilir (Türkiye
 * saati), ziyaretçinin tarayıcısınınkinde değil: e-posta, takvim ve admin
 * paneli aynı saati söylesin. Tarayıcı farklı bir dilimdeyse sayfa ayrıca
 * uyarı gösteriyor (bkz. farkliDilimde).
 */
const yer = (locale: Locale) => (locale === "en" ? "en-GB" : "tr-TR");

export function gunAnahtari(iso: string, saatDilimi: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: saatDilimi, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(iso)
  );
}

export function gunEtiketi(iso: string, saatDilimi: string, locale: Locale): { hafta: string; gun: string; ay: string } {
  const d = new Date(iso);
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(yer(locale), { timeZone: saatDilimi, ...o }).format(d);
  return { hafta: f({ weekday: "short" }), gun: f({ day: "numeric" }), ay: f({ month: "short" }) };
}

export function saatMetni(iso: string, saatDilimi: string, locale: Locale): string {
  return new Intl.DateTimeFormat(yer(locale), { timeZone: saatDilimi, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export function uzunTarih(baslangic: string, bitis: string, saatDilimi: string, locale: Locale): string {
  const gun = new Intl.DateTimeFormat(yer(locale), {
    timeZone: saatDilimi,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(baslangic));
  return `${gun} · ${saatMetni(baslangic, saatDilimi, locale)}–${saatMetni(bitis, saatDilimi, locale)}`;
}

export function farkliDilimde(saatDilimi: string): boolean {
  try {
    const simdi = new Date();
    const hedef =
      (Date.parse(simdi.toLocaleString("en-US", { timeZone: saatDilimi })) -
        Date.parse(simdi.toLocaleString("en-US", { timeZone: "UTC" }))) /
      60_000;
    return Math.round(hedef) !== -simdi.getTimezoneOffset();
  } catch {
    return false;
  }
}
