"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Dict, Locale } from "@/i18n";
import {
  BOS_TASLAK,
  SINIR,
  doluMu,
  kayitAdresi,
  taslakOku,
  taslakSil,
  taslakYaz,
  type Taslak,
} from "@/lib/misafir";
import "./misafir.css";

type Pencere = { tur: "donus" } | { tur: "kilit"; baslik: string } | null;

type Baglanti = { href: string; label: string };

/**
 * Sayfa yüklemesi başına bir kez. Bileşen durumunda tutulamaz: Fiyatlar'a gidip
 * geri gelmek bileşeni yeniden kurar ve kişi yenilemediği hâlde uyarı görürdü.
 */
let yuklemeKarsilandi = false;

function Kilit() {
  return (
    <svg className="mf-kilit" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 1.5A3.5 3.5 0 0 0 4.5 5v1.5H4A1.5 1.5 0 0 0 2.5 8v5A1.5 1.5 0 0 0 4 14.5h8a1.5 1.5 0 0 0 1.5-1.5V8A1.5 1.5 0 0 0 12 6.5h-.5V5A3.5 3.5 0 0 0 8 1.5ZM6 6.5V5a2 2 0 1 1 4 0v1.5H6Z"
      />
    </svg>
  );
}

export default function Misafir({
  dict,
  locale,
  girisHref,
  kayitHref,
  altBaglantilar,
  digerDil,
}: {
  dict: Dict["misafir"];
  locale: Locale;
  girisHref: string;
  kayitHref: string;
  altBaglantilar: Baglanti[];
  digerDil: Baglanti;
}) {
  const [taslak, setTaslak] = useState<Taslak>(BOS_TASLAK);
  const [girdi, setGirdi] = useState("");
  const [pencere, setPencere] = useState<Pencere>(null);
  const [silmeOnayi, setSilmeOnayi] = useState(false);
  const girdiRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Üye olmaya giderken tarayıcının "ayrılıyorsun" uyarısı çıkmasın.
  const devrediliyor = useRef(false);
  // Ad tamamen silinip çıkılırsa boş başlık kalmasın, önceki ada dönülür.
  const oncekiAd = useRef("");

  const dolu = doluMu(taslak);

  useEffect(() => {
    const t = taslakOku();
    setTaslak(t);
    if (!yuklemeKarsilandi && doluMu(t)) setPencere({ tur: "donus" });
    yuklemeKarsilandi = true;

    // Masaüstünde doğrudan yazmaya başlansın; telefonda klavye ekranı kapatırdı.
    if (!doluMu(t) && window.matchMedia("(min-width: 768px)").matches) girdiRef.current?.focus();

    // Başka sekmede değiştiyse bu sekme eski taslağı geri yazmasın.
    const depoDegisti = () => setTaslak(taslakOku());
    // Üye olma ekranından geri tuşuyla dönüş: sayfa önbellekten olduğu gibi gelir.
    const geriDondu = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      devrediliyor.current = false;
      if (doluMu(taslakOku())) setPencere({ tur: "donus" });
    };
    window.addEventListener("storage", depoDegisti);
    window.addEventListener("pageshow", geriDondu);
    return () => {
      window.removeEventListener("storage", depoDegisti);
      window.removeEventListener("pageshow", geriDondu);
    };
  }, []);

  // Tarayıcılar bu uyarının metnine ve düğmelerine dokundurmuyor. "Üye ol / Sil"
  // seçimi bu yüzden yenilemeden SONRA, aşağıdaki pencerede soruluyor; buradaki
  // yalnızca yanlışlıkla kapatmaya karşı bir fren.
  useEffect(() => {
    if (!dolu) return;
    const uyar = (e: BeforeUnloadEvent) => {
      if (devrediliyor.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", uyar);
    return () => window.removeEventListener("beforeunload", uyar);
  }, [dolu]);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (pencere && !d.open) d.showModal();
    if (!pencere && d.open) d.close();
  }, [pencere]);

  const uygula = (sonraki: Taslak) => {
    setTaslak(sonraki);
    taslakYaz(sonraki);
  };

  const uyeOl = () => {
    const sonraki = dolu ? { ...taslak, devredildi: Date.now() } : taslak;
    if (dolu) taslakYaz(sonraki);
    devrediliyor.current = true;
    window.location.href = kayitAdresi(kayitHref, sonraki);
  };

  const hepsiniSil = () => {
    taslakSil();
    setTaslak(BOS_TASLAK);
    setSilmeOnayi(false);
    setPencere(null);
  };

  const kilitli = (baslik: string) => setPencere({ tur: "kilit", baslik });

  const adim = !taslak.is ? "is" : !taslak.proje ? "proje" : "gorev";
  const dolduMu = taslak.gorevler.length >= SINIR.gorev;

  const ekle = (e: React.FormEvent) => {
    e.preventDefault();
    const metin = girdi.trim();
    if (!metin) return;
    if (adim === "is") uygula({ ...taslak, is: metin });
    else if (adim === "proje") uygula({ ...taslak, proje: metin });
    else if (!dolduMu) {
      uygula({
        ...taslak,
        gorevler: [...taslak.gorevler, { id: crypto.randomUUID(), baslik: metin, bitti: false }],
      });
    }
    setGirdi("");
    girdiRef.current?.focus();
  };

  const rehber = dict.adim[adim];
  const ipucu =
    adim === "gorev" && taslak.gorevler.length > 0 ? dict.gorevIpucu : rehber.ipucu;

  const ozet = dict.ozet
    .replace("{proje}", String(taslak.proje ? 1 : 0))
    .replace("{gorev}", String(taslak.gorevler.length));

  return (
    <div className="mf">
      <header className="mf-ust">
        <span className="mf-marka">
          <Image src="/brand/logo.png" alt="" width={26} height={26} priority />
          Projelio
        </span>
        <nav className="mf-hesap" aria-label={dict.hesapMenu}>
          <a href={girisHref}>{dict.giris}</a>
          <button type="button" className="mf-birincil" onClick={uyeOl}>
            {dict.uyeOl}
          </button>
        </nav>
      </header>

      <div className="mf-govde">
        <nav className="mf-yan" aria-label={dict.bolumler}>
          <span className="mf-bolum etkin" aria-current="page">
            {dict.gorevler}
          </span>
          {dict.kilitliBolumler.map((b) => (
            <button
              key={b}
              type="button"
              className="mf-bolum"
              onClick={() => kilitli(dict.bolumKilidi.replace("{bolum}", b))}
            >
              {b}
              <Kilit />
            </button>
          ))}
        </nav>

        <main id="main" className="mf-alan">
          {!dolu && (
            <div className="mf-giris">
              <h1>{dict.baslik}</h1>
              <p>{dict.altBaslik}</p>
            </div>
          )}

          {dolu && (
            <div className="mf-yol">
              <input
                aria-label={dict.isAdi}
                className="mf-ad mf-ad-is"
                value={taslak.is ?? ""}
                maxLength={SINIR.ad}
                onFocus={(e) => (oncekiAd.current = e.target.value)}
                onChange={(e) => uygula({ ...taslak, is: e.target.value })}
                onBlur={(e) => !e.target.value.trim() && uygula({ ...taslak, is: oncekiAd.current })}
              />
              <button type="button" className="mf-arti" onClick={() => kilitli(dict.isKilidi)}>
                {dict.yeniIs}
                <Kilit />
              </button>
              {taslak.proje !== null && (
                <>
                  <span className="mf-ayrac" aria-hidden="true">
                    /
                  </span>
                  <input
                    aria-label={dict.projeAdi}
                    className="mf-ad"
                    value={taslak.proje}
                    maxLength={SINIR.ad}
                    onFocus={(e) => (oncekiAd.current = e.target.value)}
                    onChange={(e) => uygula({ ...taslak, proje: e.target.value })}
                    onBlur={(e) => !e.target.value.trim() && uygula({ ...taslak, proje: oncekiAd.current })}
                  />
                  <button type="button" className="mf-arti" onClick={() => kilitli(dict.projeKilidi)}>
                    {dict.yeniProje}
                    <Kilit />
                  </button>
                </>
              )}
            </div>
          )}

          {dolduMu ? (
            <div className="mf-sinir">
              <p>{dict.sinir}</p>
              <button type="button" className="mf-birincil" onClick={uyeOl}>
                {dict.ucretsizUyeOl}
              </button>
            </div>
          ) : (
            <form className="mf-form" onSubmit={ekle}>
              <label htmlFor="mf-girdi">{rehber.soru}</label>
              <div className="mf-satir">
                <input
                  id="mf-girdi"
                  ref={girdiRef}
                  value={girdi}
                  onChange={(e) => setGirdi(e.target.value)}
                  placeholder={rehber.ornek}
                  maxLength={adim === "gorev" ? SINIR.gorevBaslik : SINIR.ad}
                  autoComplete="off"
                />
                <button type="submit" className="mf-birincil" disabled={!girdi.trim()}>
                  {rehber.dugme}
                </button>
              </div>
              <p className="mf-ipucu">{ipucu}</p>
            </form>
          )}

          {taslak.gorevler.length > 0 && (
            <>
              <ul className="mf-liste">
                {taslak.gorevler.map((g) => (
                  <li key={g.id} className={g.bitti ? "bitti" : undefined}>
                    <label>
                      <input
                        type="checkbox"
                        checked={g.bitti}
                        onChange={() =>
                          uygula({
                            ...taslak,
                            gorevler: taslak.gorevler.map((x) =>
                              x.id === g.id ? { ...x, bitti: !x.bitti } : x,
                            ),
                          })
                        }
                      />
                      <span>{g.baslik}</span>
                    </label>
                    <button
                      type="button"
                      aria-label={dict.gorevSil.replace("{gorev}", g.baslik)}
                      onClick={() =>
                        uygula({ ...taslak, gorevler: taslak.gorevler.filter((x) => x.id !== g.id) })
                      }
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mf-sayac">
                {dict.sayac
                  .replace("{n}", String(taslak.gorevler.length))
                  .replace("{sinir}", String(SINIR.gorev))}
              </p>
            </>
          )}

          {dolu && !dolduMu && (
            <p className="mf-kayit">
              {dict.yerelNot}{" "}
              <button type="button" onClick={uyeOl}>
                {dict.kaydetmekIcin}
              </button>
            </p>
          )}
        </main>
      </div>

      <footer className="mf-alt">
        {altBaglantilar.map((b) => (
          <Link key={b.href} href={b.href}>
            {b.label}
          </Link>
        ))}
        <Link href={digerDil.href} hrefLang={locale === "tr" ? "en" : "tr"}>
          {digerDil.label}
        </Link>
      </footer>

      <dialog
        ref={dialogRef}
        className="mf-pencere"
        aria-labelledby="mf-pencere-baslik"
        // Geri dönüş sorusu cevapsız kapatılamaz: iki seçenek de bilinçli olmalı.
        onCancel={(e) => {
          e.preventDefault();
          if (pencere?.tur === "kilit") setPencere(null);
        }}
      >
        {pencere?.tur === "donus" && (
          <>
            <h2 id="mf-pencere-baslik">{dict.donus.baslik}</h2>
            <p>
              <strong>{taslak.is}</strong> · {ozet}
            </p>
            <p>{dict.donus.metin}</p>
            <div className="mf-pencere-dugmeler">
              <button type="button" className="mf-birincil" autoFocus onClick={uyeOl}>
                {dict.donus.uyeOl}
              </button>
              {silmeOnayi ? (
                <button type="button" className="mf-tehlike" onClick={hepsiniSil}>
                  {dict.donus.eminSil}
                </button>
              ) : (
                <button type="button" className="mf-ikincil" onClick={() => setSilmeOnayi(true)}>
                  {dict.donus.sil}
                </button>
              )}
            </div>
          </>
        )}
        {pencere?.tur === "kilit" && (
          <>
            <h2 id="mf-pencere-baslik">{pencere.baslik}</h2>
            <p>{dict.kilitMetni}</p>
            <div className="mf-pencere-dugmeler">
              <button type="button" className="mf-birincil" autoFocus onClick={uyeOl}>
                {dict.ucretsizUyeOl}
              </button>
              <button type="button" className="mf-ikincil" onClick={() => setPencere(null)}>
                {dict.simdiDegil}
              </button>
            </div>
          </>
        )}
      </dialog>
    </div>
  );
}
