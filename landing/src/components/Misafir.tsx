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
import Ikon, { type IkonAdi } from "./MisafirIkon";
import "./misafir.css";

type Pencere = { tur: "donus" } | { tur: "kilit"; baslik: string } | null;

export type AltBaglanti = { href: string; label: string; ikon?: IkonAdi };

/** dict.kilitliBolumler ile aynı sırada. */
const BOLUM_IKONLARI: IkonAdi[] = ["takvim", "ekip", "dosya", "butce", "musteri", "lio"];

const ADIMLAR = ["is", "proje", "gorev"] as const;
const ADIM_IKONU: Record<(typeof ADIMLAR)[number], IkonAdi> = { is: "is", proje: "proje", gorev: "gorev" };

/**
 * Sayfa yüklemesi başına bir kez. Bileşen durumunda tutulamaz: Fiyatlar'a gidip
 * geri gelmek bileşeni yeniden kurar ve kişi yenilemediği hâlde uyarı görürdü.
 */
let yuklemeKarsilandi = false;

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
  altBaglantilar: AltBaglanti[];
  digerDil: AltBaglanti;
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
  const adimSirasi = ADIMLAR.indexOf(adim);
  const dolduMu = taslak.gorevler.length >= SINIR.gorev;
  const gorevVar = taslak.gorevler.length > 0;

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
  const sayacMetni = dict.sayac
    .replace("{n}", String(taslak.gorevler.length))
    .replace("{sinir}", String(SINIR.gorev));

  return (
    <div className="mf">
      <header className="mf-ust">
        <span className="mf-marka">
          <Image src="/brand/logo.png" alt="" width={26} height={26} priority />
          Projelio
        </span>
        <nav className="mf-hesap" aria-label={dict.hesapMenu}>
          <a className="mf-simge" href={girisHref} aria-label={dict.giris} title={dict.giris}>
            <Ikon ad="giris" />
          </a>
          <button type="button" className="mf-birincil mf-kare" onClick={uyeOl} aria-label={dict.uyeOl} title={dict.uyeOl}>
            <Ikon ad="uyeOl" />
          </button>
        </nav>
      </header>

      <div className="mf-govde">
        <nav className="mf-yan" aria-label={dict.bolumler}>
          <span className="mf-bolum etkin" aria-current="page" aria-label={dict.gorevler} title={dict.gorevler}>
            <Ikon ad="gorev" />
          </span>
          {dict.kilitliBolumler.map((b, i) => {
            const baslik = dict.bolumKilidi.replace("{bolum}", b);
            return (
              <button key={b} type="button" className="mf-bolum" aria-label={baslik} title={b} onClick={() => kilitli(baslik)}>
                <Ikon ad={BOLUM_IKONLARI[i]} />
                <span className="mf-rozet">
                  <Ikon ad="kilit" boyut={10} />
                </span>
              </button>
            );
          })}
        </nav>

        <main id="main" className={`mf-alan${dolu ? "" : " bos"}`}>
          {/* Görünmüyor ama duruyor: ekran okuyucular ve arama motorları sayfanın ne olduğunu buradan anlıyor. */}
          <h1 className="mf-gizli">{`${dict.baslik} ${dict.altBaslik}`}</h1>

          {!gorevVar && (
            <ol className="mf-adimlar" aria-hidden="true">
              {ADIMLAR.map((a, i) => (
                <li key={a} className={i < adimSirasi ? "tamam" : i === adimSirasi ? "simdi" : undefined}>
                  <Ikon ad={i < adimSirasi ? "onay" : ADIM_IKONU[a]} boyut={22} />
                </li>
              ))}
            </ol>
          )}

          {dolu && (
            <div className="mf-yol">
              <span className="mf-yol-ikon">
                <Ikon ad="is" boyut={17} />
              </span>
              <input
                aria-label={dict.isAdi}
                className="mf-ad mf-ad-is"
                value={taslak.is ?? ""}
                maxLength={SINIR.ad}
                onFocus={(e) => (oncekiAd.current = e.target.value)}
                onChange={(e) => uygula({ ...taslak, is: e.target.value })}
                onBlur={(e) => !e.target.value.trim() && uygula({ ...taslak, is: oncekiAd.current })}
              />
              <button type="button" className="mf-arti" aria-label={dict.isKilidi} title={dict.isKilidi} onClick={() => kilitli(dict.isKilidi)}>
                <Ikon ad="arti" boyut={13} />
                <Ikon ad="kilit" boyut={11} />
              </button>
              {taslak.proje !== null && (
                <>
                  <span className="mf-yol-ikon">
                    <Ikon ad="proje" boyut={17} />
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
                  <button type="button" className="mf-arti" aria-label={dict.projeKilidi} title={dict.projeKilidi} onClick={() => kilitli(dict.projeKilidi)}>
                    <Ikon ad="arti" boyut={13} />
                    <Ikon ad="kilit" boyut={11} />
                  </button>
                </>
              )}
            </div>
          )}

          {dolduMu ? (
            <div className="mf-sinir" role="group" aria-label={dict.sinir}>
              <Ikon ad="kilit" boyut={20} />
              <button type="button" className="mf-birincil mf-kare" onClick={uyeOl} aria-label={dict.ucretsizUyeOl} title={dict.ucretsizUyeOl}>
                <Ikon ad="uyeOl" />
              </button>
            </div>
          ) : (
            <form className="mf-form" onSubmit={ekle}>
              <div className="mf-satir">
                <span className="mf-girdi-ikon">
                  <Ikon ad={ADIM_IKONU[adim]} />
                </span>
                <input
                  ref={girdiRef}
                  aria-label={rehber.soru}
                  value={girdi}
                  onChange={(e) => setGirdi(e.target.value)}
                  placeholder={rehber.yer}
                  maxLength={adim === "gorev" ? SINIR.gorevBaslik : SINIR.ad}
                  autoComplete="off"
                />
                <button type="submit" className="mf-birincil mf-kare" disabled={!girdi.trim()} aria-label={rehber.dugme} title={rehber.dugme}>
                  <Ikon ad={adim === "gorev" ? "arti" : "ok"} />
                </button>
              </div>
            </form>
          )}

          {gorevVar && (
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
                      <Ikon ad="kapat" boyut={16} />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mf-cubuk" role="img" aria-label={sayacMetni} title={sayacMetni}>
                {Array.from({ length: SINIR.gorev }, (_, i) => (
                  <i key={i} className={i < taslak.gorevler.length ? "dolu" : undefined} />
                ))}
              </div>
            </>
          )}

          {dolu && !dolduMu && (
            <button type="button" className="mf-kaydet" onClick={uyeOl} aria-label={dict.kaydetmekIcin} title={dict.kaydetmekIcin}>
              <Ikon ad="bulut" />
            </button>
          )}
        </main>
      </div>

      <footer className="mf-alt">
        {/* Gizlilik bağlantısı yazıyla kalıyor: Google OAuth ve ödeme kuruluşu incelemesi ana sayfada onu arıyor. */}
        {altBaglantilar.map((b) => (
          <Link key={b.href} href={b.href} aria-label={b.label} title={b.label}>
            {b.ikon ? <Ikon ad={b.ikon} boyut={17} /> : b.label}
          </Link>
        ))}
        <Link href={digerDil.href} hrefLang={locale === "tr" ? "en" : "tr"} aria-label={digerDil.label} title={digerDil.label}>
          {locale === "tr" ? "EN" : "TR"}
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
        // Sayfaya henüz dokunulmadıysa tarayıcı Esc'i onCancel'a sormadan pencereyi
        // kapatıyor; yenilemeden hemen sonraki soru böyle atlanmasın diye geri açılır.
        onClose={() => {
          if (pencere?.tur === "donus") dialogRef.current?.showModal();
          else if (pencere) setPencere(null);
        }}
      >
        {pencere?.tur === "donus" && (
          <>
            <h2 id="mf-pencere-baslik" className="mf-gizli">
              {dict.donus.baslik}
            </h2>
            <span className="mf-buyuk-ikon">
              <Ikon ad="bulut" boyut={30} />
            </span>
            <p className="mf-pencere-ad">{taslak.is}</p>
            <div className="mf-ozet">
              <span>
                <Ikon ad="proje" boyut={17} />
                {taslak.proje ? 1 : 0}
              </span>
              <span>
                <Ikon ad="gorev" boyut={17} />
                {taslak.gorevler.length}
              </span>
            </div>
            {/* Yalnızca bu iki düğmede yazı var: Sil geri alınamıyor, simgeden tahmin edilmesin. */}
            <div className="mf-pencere-dugmeler">
              <button type="button" className="mf-birincil" autoFocus onClick={uyeOl}>
                <Ikon ad="uyeOl" boyut={18} />
                {dict.donus.uyeOl}
              </button>
              {silmeOnayi ? (
                <button type="button" className="mf-tehlike" onClick={hepsiniSil}>
                  <Ikon ad="cop" boyut={18} />
                  {dict.donus.eminSil}
                </button>
              ) : (
                <button type="button" className="mf-ikincil" onClick={() => setSilmeOnayi(true)}>
                  <Ikon ad="cop" boyut={18} />
                  {dict.donus.sil}
                </button>
              )}
            </div>
          </>
        )}
        {pencere?.tur === "kilit" && (
          <>
            <h2 id="mf-pencere-baslik" className="mf-gizli">
              {pencere.baslik}
            </h2>
            <span className="mf-buyuk-ikon">
              <Ikon ad="kilit" boyut={30} />
            </span>
            <div className="mf-pencere-dugmeler">
              <button type="button" className="mf-birincil" autoFocus onClick={uyeOl} aria-label={dict.ucretsizUyeOl} title={dict.ucretsizUyeOl}>
                <Ikon ad="uyeOl" />
              </button>
              <button type="button" className="mf-ikincil" onClick={() => setPencere(null)} aria-label={dict.simdiDegil} title={dict.simdiDegil}>
                <Ikon ad="kapat" />
              </button>
            </div>
          </>
        )}
      </dialog>
    </div>
  );
}
