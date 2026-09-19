"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import type { Dict, Locale } from "@/i18n";
import { apiUrl, path, site } from "@/lib/site";

/**
 * Canlı demo takvimi — tanıtım sitesinin kendi bileşeni.
 *
 * Takvim uygulamadaki sayfayla (apps/web/src/pages/DemoRandevu.tsx) AYNI
 * uçları kullanıyor: `/public/demo/musaitlik` ve `/public/demo/randevu`.
 * Bloklar sunucuda üretiliyor; burada yalnızca gösteriliyor, yani hangi saatin
 * açık olduğu kararı tek yerde (backend demoSlotlariUret).
 *
 * Landing npm workspace'i olmadığı için @projelio/shared'ı içe aktaramıyor;
 * ihtiyaç duyulan iki tip aşağıda elle yazılı. Sunucu yanıtı değişirse
 * burası da güncellenmeli.
 *
 * API'ye tarayıcıdan gidiliyor (landing sunucusu üzerinden değil): formun hız
 * sınırı IP başına ve vekil tüm ziyaretçileri tek IP'de toplardı. CORS izni
 * yalnızca bu uçlar için ve çerezsiz (bkz. backend common/config/cors-karari.ts).
 *
 * Randevuyu yönetme (saat değiştirme, iptal) uygulamada kalıyor: e-postadaki
 * bağlantı oraya gidiyor.
 */

interface Slot {
  baslangic: string;
  bitis: string;
}
interface Musaitlik {
  aktif: boolean;
  sureDk: number;
  saatDilimi: string;
  slotlar: Slot[];
}
interface Randevu {
  id: string;
  baslangic: string;
  bitis: string;
  eposta: string;
  saatDilimi: string;
  yonetimToken: string;
  hesapGerekli: boolean;
}

const yer = (locale: Locale) => (locale === "en" ? "en-GB" : "tr-TR");

function gunAnahtari(iso: string, tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}
function bicim(iso: string, tz: string, locale: Locale, o: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(yer(locale), { timeZone: tz, ...o }).format(new Date(iso));
}
function saat(iso: string, tz: string, locale: Locale) {
  return bicim(iso, tz, locale, { hour: "2-digit", minute: "2-digit" });
}
function uzunTarih(bas: string, bit: string, tz: string, locale: Locale) {
  return `${bicim(bas, tz, locale, { weekday: "long", day: "numeric", month: "long" })} · ${saat(bas, tz, locale)}–${saat(bit, tz, locale)}`;
}
function farkliDilimde(tz: string) {
  try {
    const simdi = new Date();
    const hedef =
      (Date.parse(simdi.toLocaleString("en-US", { timeZone: tz })) - Date.parse(simdi.toLocaleString("en-US", { timeZone: "UTC" }))) /
      60_000;
    return Math.round(hedef) !== -simdi.getTimezoneOffset();
  } catch {
    return false;
  }
}

export default function DemoBooking({ dict, locale }: { dict: Dict; locale: Locale }) {
  const b = dict.liveDemo.booking;
  const [musaitlik, setMusaitlik] = useState<Musaitlik | null>(null);
  const [yukHata, setYukHata] = useState(false);
  const [gun, setGun] = useState<string | null>(null);
  const [secili, setSecili] = useState<string | null>(null);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [hata, setHata] = useState("");
  const [sonuc, setSonuc] = useState<Randevu | "tamam" | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const yukle = () =>
    fetch(`${apiUrl}/public/demo/musaitlik`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((m: Musaitlik) => setMusaitlik(m))
      .catch(() => setYukHata(true));

  useEffect(() => {
    void yukle();
  }, []);

  const tz = musaitlik?.saatDilimi ?? "Europe/Istanbul";
  const gunler = useMemo(() => {
    const harita = new Map<string, Slot[]>();
    for (const s of musaitlik?.slotlar ?? []) {
      const k = gunAnahtari(s.baslangic, tz);
      harita.set(k, [...(harita.get(k) ?? []), s]);
    }
    return [...harita.entries()];
  }, [musaitlik, tz]);

  useEffect(() => {
    setGun((g) => (g && gunler.some(([k]) => k === g) ? g : (gunler[0]?.[0] ?? null)));
  }, [gunler]);

  const sec = (bas: string) => {
    setSecili(bas);
    setHata("");
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  async function gonder(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!secili) return;
    const veri = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
    setGonderiliyor(true);
    setHata("");
    try {
      const res = await fetch(`${apiUrl}/public/demo/randevu`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Projelio-Locale": locale },
        body: JSON.stringify({
          baslangic: secili,
          ad: veri.ad,
          eposta: veri.eposta,
          telefon: veri.telefon,
          sirket: veri.sirket,
          ekipBuyuklugu: veri.ekipBuyuklugu,
          not: veri.not,
          kvkkOnay: veri.kvkk === "on",
          website: veri.website,
          dil: locale,
        }),
      });
      const govde = await res.json().catch(() => null);
      if (!res.ok) {
        // Sunucunun mesajı zaten isteğin dilinde (X-Projelio-Locale).
        const mesaj = Array.isArray(govde?.message) ? govde.message.join(", ") : govde?.message;
        throw new Error(mesaj || b.genericError);
      }
      setSonuc(govde && "id" in govde ? (govde as Randevu) : "tamam");
    } catch (err) {
      setHata(err instanceof Error ? err.message : b.genericError);
      // Blok dolmuş olabilir: takvimi tazele, aynı saati yeniden seçtirme.
      setSecili(null);
      void yukle();
    } finally {
      setGonderiliyor(false);
    }
  }

  if (sonuc) {
    const r = sonuc === "tamam" ? null : sonuc;
    return (
      <div className="card demo-booking">
        <h3 className="h3">{b.successTitle}</h3>
        {r && <div className="demo-summary">{uzunTarih(r.baslangic, r.bitis, r.saatDilimi, locale)}</div>}
        {r && <p>{b.successText.replace("{eposta}", r.eposta)}</p>}
        <div className="demo-warn">{b.inboxWarning}</div>
        {r?.hesapGerekli && (
          <div className="demo-hesap">
            <strong>{b.accountTitle}</strong>
            <p>{b.accountText}</p>
            <a className="btn btn-primary btn-sm" href={`${site.appUrl}/register?email=${encodeURIComponent(r.eposta)}`}>
              {b.accountCta}
            </a>
          </div>
        )}
        {r && (
          <a className="small" href={`${site.appUrl}/demo-randevu/${r.yonetimToken}`}>
            {b.manage} →
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="card demo-booking">
      <h3 className="h3">{b.title}</h3>

      {yukHata && <div className="alert alert-err">{b.loadError}</div>}
      {!yukHata && !musaitlik && <p className="muted">{b.loading}</p>}
      {musaitlik && !musaitlik.aktif && <p className="muted">{b.closed}</p>}
      {musaitlik?.aktif && gunler.length === 0 && <p className="muted">{b.empty}</p>}

      {musaitlik?.aktif && gunler.length > 0 && (
        <>
          <div className="demo-days" role="listbox" aria-label={b.title}>
            {gunler.map(([k, s]) => (
              <button
                key={k}
                type="button"
                role="option"
                aria-selected={k === gun}
                className={`demo-day${k === gun ? " is-active" : ""}`}
                onClick={() => setGun(k)}
              >
                <span>{bicim(s[0].baslangic, tz, locale, { weekday: "short" })}</span>
                <b>{bicim(s[0].baslangic, tz, locale, { day: "numeric" })}</b>
                <span>{bicim(s[0].baslangic, tz, locale, { month: "short" })}</span>
              </button>
            ))}
          </div>
          <div className="demo-slots">
            {(gunler.find(([k]) => k === gun)?.[1] ?? []).map((s) => (
              <button
                key={s.baslangic}
                type="button"
                aria-pressed={s.baslangic === secili}
                className={`demo-slot${s.baslangic === secili ? " is-active" : ""}`}
                onClick={() => sec(s.baslangic)}
              >
                {saat(s.baslangic, tz, locale)}
              </button>
            ))}
          </div>
          <p className="xsmall muted" style={{ marginTop: 10 }}>
            {tz === "Europe/Istanbul" ? b.tzNote : tz}
            {farkliDilimde(tz) ? ` ${b.tzDiff}` : ""}
          </p>
        </>
      )}

      {!secili && hata && <div className="alert alert-err">{hata}</div>}

      {secili && musaitlik && (
        <form ref={formRef} onSubmit={gonder} className="demo-form">
          <div className="demo-summary">
            {uzunTarih(secili, new Date(Date.parse(secili) + musaitlik.sureDk * 60_000).toISOString(), tz, locale)}
            <button type="button" className="demo-link" onClick={() => setSecili(null)}>
              {b.change}
            </button>
          </div>
          <h4>{b.detailsTitle}</h4>
          {hata && <div className="alert alert-err">{hata}</div>}
          <div className="field-row">
            <div className="field">
              <label htmlFor="demo-ad">{b.name}</label>
              <input id="demo-ad" name="ad" required autoComplete="name" />
            </div>
            <div className="field">
              <label htmlFor="demo-eposta">{b.email}</label>
              <input id="demo-eposta" name="eposta" type="email" required autoComplete="email" />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="demo-telefon">{b.phone}</label>
              <input id="demo-telefon" name="telefon" type="tel" required autoComplete="tel" placeholder="+90 5xx xxx xx xx" />
            </div>
            <div className="field">
              <label htmlFor="demo-sirket">{b.company}</label>
              <input id="demo-sirket" name="sirket" autoComplete="organization" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="demo-ekip">{b.teamSize}</label>
            {/* Değer Türkçe gider: yönetici panelinde ve e-postada o dille okunuyor. */}
            <select id="demo-ekip" name="ekipBuyuklugu" defaultValue="">
              <option value="">—</option>
              {dict.liveDemo.booking.teamSizes.map((etiket, i) => (
                <option key={etiket} value={["Yalnızım", "2-5", "6-20", "21-50", "50+"][i]}>
                  {etiket}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="demo-not">{b.note}</label>
            <textarea id="demo-not" name="not" maxLength={1000} placeholder={b.notePlaceholder} style={{ minHeight: 90 }} />
          </div>
          {/* spam tuzağı — insanlar görmez, botlar doldurur */}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="demo-trap" />
          <label className="demo-consent">
            <input type="checkbox" name="kvkk" required />
            <span>
              {b.consent}{" "}
              <Link href={path(locale, "legal/kvkk")} target="_blank">
                {b.consentLink}
              </Link>
            </span>
          </label>
          <button type="submit" className="btn btn-primary btn-block" disabled={gonderiliyor}>
            {gonderiliyor ? b.sending : b.submit}
          </button>
        </form>
      )}

      <p className="xsmall muted" style={{ marginTop: 16 }}>
        {b.memberNote}
      </p>
    </div>
  );
}
