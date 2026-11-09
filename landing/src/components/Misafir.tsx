"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Bricolage_Grotesque } from "next/font/google";
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

// Panelin yazı tipi (apps/web/index.html). Sayfa panelin aynısı görünsün diye.
const yaziTipi = Bricolage_Grotesque({ subsets: ["latin", "latin-ext"], weight: ["400", "500", "600"], display: "swap" });

// 81 ilin yolları ~110 KB: sayfanın ilk paketine binmesin, kart çizilince gelsin.
const MisafirHarita = dynamic(() => import("./MisafirHarita"), { ssr: false, loading: () => <div className="mf-harita" /> });

const LIO_CUBUK_ANAHTARI = "projelio_misafir_lio_cubuk";

type MisafirDict = Dict["misafir"];
type KilitAdi = keyof MisafirDict["kilit"];
type Pencere = { tur: "donus" } | { tur: "kilit"; baslik: string } | null;

export type AltBaglanti = { href: string; label: string; ikon?: IkonAdi };

/** Paneldeki koyu paletin değerleri (packages/shared/src/theme.ts → dark). */
const RENK = { accent: "#D9A868", basari: "#3FBE73", cizgi: "#2A3140", ana: "#8593A8" };

/**
 * Sayfa yüklemesi başına bir kez. Bileşen durumunda tutulamaz: Fiyatlar'a gidip
 * geri gelmek bileşeni yeniden kurar ve kişi yenilemediği hâlde uyarı görürdü.
 */
let yuklemeKarsilandi = false;

/**
 * Üye olmadan kullanılan anasayfa. Görünüş panelin "Ben" anasayfasının aynısı
 * (apps/web/src/components/anasayfa/AnasayfaPanosu.tsx): aynı kartlar, aynı
 * sıra, aynı ölçüler. Ziyaretçi tanıtım okumaz, gerçek ekranda çalışmaya başlar.
 *
 * Yalnızca İşler → Projeler → Yapılacaklar zinciri gerçekten çalışır, çünkü
 * üye olunca hesaba taşınabilen yalnızca bu üçü (bkz. lib/misafir.ts). Takvim
 * ve Pomodoro sunucuya bir şey yazmadığı için onlar da çalışır; geri kalan her
 * düğme "üyelikle açılır" penceresine çıkar.
 */
export default function Misafir({
  dict,
  locale,
  girisHref,
  kayitHref,
  studyoHref,
  altBaglantilar,
  digerDil,
}: {
  dict: MisafirDict;
  locale: Locale;
  girisHref: string;
  kayitHref: string;
  /** Panelin girişsiz misafir stüdyosu (apps/web/src/pages/MisafirStudyo.tsx). */
  studyoHref: string;
  altBaglantilar: AltBaglanti[];
  digerDil: AltBaglanti;
}) {
  const [taslak, setTaslak] = useState<Taslak>(BOS_TASLAK);
  const [pencere, setPencere] = useState<Pencere>(null);
  const [silmeOnayi, setSilmeOnayi] = useState(false);
  const [kaydirildi, setKaydirildi] = useState(false);
  const isRef = useRef<HTMLInputElement>(null);
  const projeRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Üye olmaya giderken tarayıcının "ayrılıyorsun" uyarısı çıkmasın.
  const devrediliyor = useRef(false);

  const dolu = doluMu(taslak);

  useEffect(() => {
    const t = taslakOku();
    setTaslak(t);
    if (!yuklemeKarsilandi && doluMu(t)) setPencere({ tur: "donus" });
    yuklemeKarsilandi = true;

    // Başka sekmede değiştiyse bu sekme eski taslağı geri yazmasın.
    const depoDegisti = () => setTaslak(taslakOku());
    // Üye olma ekranından geri tuşuyla dönüş: sayfa önbellekten olduğu gibi gelir.
    const geriDondu = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      devrediliyor.current = false;
      if (doluMu(taslakOku())) setPencere({ tur: "donus" });
    };
    // Paneldeki gibi: sayfa kayınca üstte başlıklı sabit şerit belirir.
    const kaydi = () => setKaydirildi(window.scrollY > 40);
    kaydi();
    window.addEventListener("storage", depoDegisti);
    window.addEventListener("pageshow", geriDondu);
    window.addEventListener("scroll", kaydi, { passive: true });
    return () => {
      window.removeEventListener("storage", depoDegisti);
      window.removeEventListener("pageshow", geriDondu);
      window.removeEventListener("scroll", kaydi);
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

  const kilitli = (ad: KilitAdi) => setPencere({ tur: "kilit", baslik: dict.kilit[ad] });

  /** Sıradaki adımın kutusuna götürür: görev için proje, proje için iş gerekir. */
  const eksigeGit = () => {
    const hedef = !taslak.is ? isRef.current : projeRef.current;
    hedef?.scrollIntoView({ block: "center", behavior: "smooth" });
    hedef?.focus({ preventScroll: true });
  };

  // + düğmesi panelde iş/şirket ekler; burada ilk işi açar, sonrası üyelikle.
  const fab = () => (taslak.is ? kilitli("is") : eksigeGit());

  return (
    <div className={`mf ${yaziTipi.className}`}>
      <div className={`mf-serit${kaydirildi ? " gorunur" : ""}`} aria-hidden="true">
        <span>{dict.anaSayfa}</span>
      </div>

      <button type="button" className="mf-menu-ac" onClick={() => kilitli("menu")} aria-label={dict.menuAc} title={dict.menuAc}>
        <Ikon ad="sag" boyut={18} />
      </button>

      <nav className="mf-hesap" aria-label={dict.uyeOl}>
        <a className="mf-yuvarlak" href={girisHref} aria-label={dict.giris} title={dict.giris}>
          <Ikon ad="giris" boyut={18} />
        </a>
        <button type="button" className="mf-uye" onClick={uyeOl} title={dolu ? dict.kaydetmekIcin : dict.ucretsizUyeOl}>
          <Ikon ad="uyeOl" boyut={17} />
          <span>{dolu ? dict.kaydetmekIcin : dict.uyeOl}</span>
        </button>
      </nav>

      <header className="mf-bant">
        {/* Görünmüyor ama duruyor: ekran okuyucular ve arama motorları sayfanın ne olduğunu buradan anlıyor. */}
        <h1 className="mf-gizli">{`${dict.baslik} ${dict.altBaslik}`}</h1>
        <nav className="mf-gorunum" aria-label={dict.gorunum}>
          <span className="mf-hap secili" aria-current="page">
            <Ikon ad="kisi" boyut={15} />
            {dict.ben}
          </span>
          <button type="button" className="mf-hap kesik" onClick={() => kilitli("sirket")} aria-label={dict.sirketEkle} title={dict.sirketEkle}>
            <Ikon ad="bina" boyut={15} />
            <Ikon ad="arti" boyut={13} />
          </button>
        </nav>
      </header>

      <main id="main" className="mf-pano">
        {/*
          Sıra dört sütunda boşluk bırakmayacak biçimde dizildi:
          1: Projelio nedir (2) · Yapılacaklar · Takvim
          2: Projelio nedir (2) · Yapılacaklar · Takvim
          3: İşler · Projeler (2) · Pomodoro
          4: İşler · Kasa · Müşteriler · Modüller
          5: 3D stüdyo (2) · Müşteriler · Dosyalar
          6: 3D stüdyo (2) · Notlar (2)
          Bir kartın boyunu ya da yerini değiştirirsen bu tabloyu da güncelle.
        */}
        <div className="mf-izgara">
          <NedirKarti dict={dict} dene={eksigeGit} uyeOl={uyeOl} />
          <Yapilacaklar dict={dict} taslak={taslak} uygula={uygula} eksigeGit={eksigeGit} uyeOl={uyeOl} kilitli={kilitli} />
          <Takvim dict={dict} locale={locale} />
          <IslerKarti dict={dict} locale={locale} taslak={taslak} uygula={uygula} isRef={isRef} kilitli={kilitli} />
          <ProjelerKarti dict={dict} taslak={taslak} uygula={uygula} projeRef={projeRef} eksigeGit={eksigeGit} kilitli={kilitli} />
          <Pomodoro dict={dict} />
          <KasaKarti dict={dict} kilitli={kilitli} />
          <MusterilerKarti dict={dict} kilitli={kilitli} />
          <KilitliOzet ad={dict.kart.moduller} ikon="isilti" onClick={() => kilitli("moduller")} cipler={[dict.sonKullanilan, dict.enCokKayit]} />

          <div className="mf-hucre orta" style={{ gridRow: "span 2" }}>
            {/* Yeni sekmede: buradaki taslak (ve "ayrılıyorsun" uyarısı) bu sekmede kalsın. */}
            <a className="mf-kart mf-tam" href={studyoHref} target="_blank" rel="noopener" aria-label={dict.studyoGir}>
              <span className="mf-ofis">
                <span className="mf-ofis-ad">
                  <Ikon ad="katman" boyut={17} renk="var(--mf-accent-dark)" />
                  {dict.kart.studyo}
                </span>
                <img src="/brand/ofis-onizleme.webp" alt="" draggable={false} />
                <span className="mf-ofis-gir">
                  {dict.studyoGir}
                  <Ikon ad="sag" boyut={15} />
                </span>
              </span>
            </a>
          </div>

          <KilitliOzet ad={dict.kart.dosyalar} ikon="dosya" onClick={() => kilitli("dosyalar")} cipler={[dict.tumu, `${dict.projeDosyalari} 0`, `${dict.isDosyalari} 0`]} />

          <div className="mf-hucre orta">
            <div className="mf-kart" role="group" aria-label={dict.kart.notlar}>
              <KartBasligi ad={dict.kart.notlar} ikon="not" />
              <div className="mf-cipler">
                <span className="mf-cip secili">{dict.yeniNot}</span>
                <button type="button" className="mf-cip kesik" onClick={() => kilitli("notlar")} aria-label={dict.kilit.notlar}>
                  <Ikon ad="arti" boyut={12} />
                </button>
              </div>
              <button type="button" className="mf-not" onClick={() => kilitli("notlar")} aria-label={dict.kilit.notlar}>
                <span className="mf-not-araclar" aria-hidden="true">
                  <b>H</b>
                  <span>¶</span>
                  <i className="ara" />
                  <b>B</b>
                  <em>I</em>
                  <u>U</u>
                  <s>S</s>
                  <i className="ara" />
                  <span>•</span>
                  <span>1.</span>
                  <span>❝</span>
                  <i className="ara" />
                  <span>Tx</span>
                </span>
                <span className="mf-not-yer">{dict.notBaslik}</span>
              </button>
            </div>
          </div>
        </div>

        <footer className="mf-alt">
          {/* Gizlilik bağlantısı yazıyla kalıyor: Google OAuth ve ödeme kuruluşu incelemesi ana sayfada onu arıyor. */}
          {altBaglantilar.map((b) => (
            <Link key={b.href} href={b.href} aria-label={b.label} title={b.label}>
              {b.ikon ? <Ikon ad={b.ikon} boyut={16} /> : b.label}
            </Link>
          ))}
          <Link href={digerDil.href} hrefLang={locale === "tr" ? "en" : "tr"} aria-label={digerDil.label} title={digerDil.label}>
            {locale === "tr" ? "EN" : "TR"}
          </Link>
        </footer>
      </main>

      <Lio dict={dict} onGonder={() => kilitli("lio")} />

      <div className="mf-fab-kutu">
        <button type="button" className="mf-fab" onClick={fab} aria-label={dict.fab} title={dict.fab}>
          <Ikon ad="arti" boyut={26} renk="#1B2028" kalinlik={2.2} />
        </button>
      </div>

      <dialog
        ref={dialogRef}
        className={`mf-pencere ${yaziTipi.className}`}
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
        onClick={(e) => {
          // Zemine tıklamak kilit penceresini kapatır (paneldeki pencereler gibi).
          if (e.target === e.currentTarget && pencere?.tur === "kilit") setPencere(null);
        }}
      >
        {pencere?.tur === "donus" && (
          <div className="mf-pencere-ic">
            <span className="mf-pencere-ikon">
              <Ikon ad="bulut" boyut={22} />
            </span>
            <h2 id="mf-pencere-baslik">{dict.donus.baslik}</h2>
            <p>{dict.donus.aciklama}</p>
            <div className="mf-ozet">
              <span>
                <Ikon ad="is" boyut={15} />
                {taslak.is}
              </span>
              <span>
                <Ikon ad="proje" boyut={15} />
                {taslak.proje ? 1 : 0}
              </span>
              <span>
                <Ikon ad="liste" boyut={15} />
                {taslak.gorevler.length}
              </span>
            </div>
            <div className="mf-pencere-dugmeler">
              <button type="button" className="mf-birincil" autoFocus onClick={uyeOl}>
                <Ikon ad="uyeOl" boyut={17} />
                {dict.donus.uyeOl}
              </button>
              {silmeOnayi ? (
                <button type="button" className="mf-tehlike" onClick={hepsiniSil}>
                  <Ikon ad="cop" boyut={17} />
                  {dict.donus.eminSil}
                </button>
              ) : (
                <button type="button" className="mf-ikincil" onClick={() => setSilmeOnayi(true)}>
                  <Ikon ad="cop" boyut={17} />
                  {dict.donus.sil}
                </button>
              )}
            </div>
          </div>
        )}
        {pencere?.tur === "kilit" && (
          <div className="mf-pencere-ic">
            <span className="mf-pencere-ikon">
              <Ikon ad="kilit" boyut={22} />
            </span>
            <h2 id="mf-pencere-baslik">{pencere.baslik}</h2>
            <p>{dict.kilitAciklama}</p>
            <div className="mf-pencere-dugmeler">
              <button type="button" className="mf-birincil" autoFocus onClick={uyeOl}>
                <Ikon ad="uyeOl" boyut={17} />
                {dict.ucretsizUyeOl}
              </button>
              <button type="button" className="mf-ikincil" onClick={() => setPencere(null)}>
                {dict.simdiDegil}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}

type KartOrtak = { dict: MisafirDict; kilitli: (ad: KilitAdi) => void };
type TaslakOrtak = { taslak: Taslak; uygula: (t: Taslak) => void };

function KartBasligi({ ad, ikon, sag }: { ad: string; ikon: IkonAdi; sag?: React.ReactNode }) {
  return (
    <span className="mf-baslik">
      <span className="mf-baslik-ad">
        <Ikon ad={ikon} boyut={17} renk="var(--mf-accent-dark)" />
        <span>{ad}</span>
      </span>
      {sag}
    </span>
  );
}

/** Adı yerinde düzenlenen alan: tamamen silinip çıkılırsa önceki ada döner. */
function AdAlani({ deger, etiket, sinif, degistir }: { deger: string; etiket: string; sinif: string; degistir: (v: string) => void }) {
  const onceki = useRef(deger);
  return (
    <input
      aria-label={etiket}
      className={sinif}
      value={deger}
      maxLength={SINIR.ad}
      onFocus={(e) => (onceki.current = e.target.value)}
      onChange={(e) => degistir(e.target.value)}
      onBlur={(e) => !e.target.value.trim() && degistir(onceki.current)}
    />
  );
}

function KasaKarti({ dict, kilitli }: KartOrtak) {
  const [sekme, setSekme] = useState(0);
  return (
    <div className="mf-hucre">
      <div className="mf-kart" role="group" aria-label={dict.kart.kasa}>
        <KartBasligi ad={dict.kart.kasa} ikon="kasa" />
        <div className="mf-cipler" role="tablist">
          {[dict.tumu, dict.gelir, dict.gider].map((s, i) => (
            <button key={s} type="button" role="tab" aria-selected={sekme === i} className={`mf-cip${sekme === i ? " secili" : ""}`} onClick={() => setSekme(i)}>
              {s}
            </button>
          ))}
        </div>
        <div className="mf-buyuk-sayi">0 ₺</div>
        <div className="mf-kasa-cubuk" />
      </div>
      <button type="button" className="mf-hizli" onClick={() => kilitli("kasa")} aria-label={dict.yeniKayit} title={dict.yeniKayit}>
        <Ikon ad="arti" boyut={14} />
      </button>
    </div>
  );
}

function Halka({ boyut, kalinlik, oran, renk, children }: { boyut: number; kalinlik: number; oran: number; renk: string; children?: React.ReactNode }) {
  const r = boyut / 2 - kalinlik / 2 - 1.5;
  const cevre = 2 * Math.PI * r;
  const m = boyut / 2;
  return (
    <div className="mf-halka" style={{ width: boyut, height: boyut }}>
      <svg width={boyut} height={boyut} aria-hidden="true">
        <circle cx={m} cy={m} r={r} fill="none" stroke={RENK.cizgi} strokeWidth={kalinlik} />
        <circle
          cx={m}
          cy={m}
          r={r}
          fill="none"
          stroke={renk}
          strokeWidth={kalinlik}
          strokeLinecap="round"
          strokeDasharray={`${cevre * Math.min(1, Math.max(0, oran))} ${cevre}`}
          transform={`rotate(-90 ${m} ${m})`}
        />
      </svg>
      {children && <div className="mf-halka-ic">{children}</div>}
    </div>
  );
}

function Yapilacaklar({ dict, taslak, uygula, eksigeGit, uyeOl, kilitli }: KartOrtak & TaslakOrtak & { eksigeGit: () => void; uyeOl: () => void }) {
  const [girdi, setGirdi] = useState("");
  const girdiRef = useRef<HTMLInputElement>(null);
  const gorevler = taslak.gorevler;
  const acik = gorevler.filter((g) => !g.bitti).length;
  const biten = gorevler.length - acik;
  const dolduMu = gorevler.length >= SINIR.gorev;
  const hazir = taslak.proje !== null;
  const sayac = dict.sayac.replace("{n}", String(gorevler.length)).replace("{sinir}", String(SINIR.gorev));

  const ekle = (e: React.FormEvent) => {
    e.preventDefault();
    const metin = girdi.trim();
    if (!metin || !hazir || dolduMu) return;
    uygula({ ...taslak, gorevler: [...gorevler, { id: crypto.randomUUID(), baslik: metin, bitti: false }] });
    setGirdi("");
    girdiRef.current?.focus();
  };

  return (
    <div className="mf-hucre" style={{ gridRow: "span 2" }}>
      <div className="mf-kart" role="group" aria-label={dict.kart.yapilacaklar}>
        <KartBasligi ad={dict.kart.yapilacaklar} ikon="liste" sag={gorevler.length > 0 ? <span className="mf-rozet">{sayac}</span> : undefined} />
        <div className="mf-kart-govde">
          <div className="mf-cipler">
            <span className="mf-cip secili">{dict.tumu}</span>
            <button type="button" className="mf-cip kesik" onClick={() => kilitli("liste")} aria-label={dict.yeniListe} title={dict.yeniListe}>
              <Ikon ad="arti" boyut={12} />
            </button>
          </div>
          <div className="mf-sayi-satiri">
            <div className="mf-buyuk-sayi">{acik}</div>
            <Halka boyut={36} kalinlik={7} oran={gorevler.length ? biten / gorevler.length : 0} renk={RENK.basari} />
          </div>
          <ul className="mf-gorevler">
            {gorevler.map((g) => (
              <li key={g.id} className={g.bitti ? "bitti" : undefined}>
                <button
                  type="button"
                  className="mf-tik"
                  aria-label={g.bitti ? dict.geriAl : dict.tamamla}
                  title={g.bitti ? dict.geriAl : dict.tamamla}
                  aria-pressed={g.bitti}
                  onClick={() => uygula({ ...taslak, gorevler: gorevler.map((x) => (x.id === g.id ? { ...x, bitti: !x.bitti } : x)) })}
                >
                  {g.bitti && <Ikon ad="onay" boyut={11} kalinlik={3} />}
                </button>
                <span className="mf-gorev-ad">{g.baslik}</span>
                <button
                  type="button"
                  className="mf-gorev-sil"
                  aria-label={dict.gorevSil.replace("{gorev}", g.baslik)}
                  title={dict.gorevSil.replace("{gorev}", g.baslik)}
                  onClick={() => uygula({ ...taslak, gorevler: gorevler.filter((x) => x.id !== g.id) })}
                >
                  <Ikon ad="kapat" boyut={13} />
                </button>
              </li>
            ))}
          </ul>
          {dolduMu ? (
            <button type="button" className="mf-gorev-ekle sinir" onClick={uyeOl}>
              <Ikon ad="kilit" boyut={15} />
              <span>{dict.sinir}</span>
            </button>
          ) : hazir ? (
            <form className="mf-gorev-ekle" onSubmit={ekle}>
              <Ikon ad="arti" boyut={15} />
              <input
                ref={girdiRef}
                aria-label={dict.gorevEkle}
                placeholder={dict.gorevEkle}
                value={girdi}
                maxLength={SINIR.gorevBaslik}
                autoComplete="off"
                onChange={(e) => setGirdi(e.target.value)}
              />
            </form>
          ) : (
            <button type="button" className="mf-gorev-ekle" onClick={eksigeGit}>
              <Ikon ad="arti" boyut={15} />
              <span>{taslak.is ? dict.onceProje : dict.onceIs}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function gunAnahtari(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function Takvim({ dict, locale }: { dict: MisafirDict; locale: Locale }) {
  // Sunucuda çizilen sayfada tarih yok: bugünün işareti ancak tarayıcıda belli olur.
  const [bugun, setBugun] = useState<Date | null>(null);
  const [ay, setAy] = useState<Date | null>(null);
  const [secili, setSecili] = useState<string | null>(null);
  useEffect(() => {
    const d = new Date();
    setBugun(d);
    setAy(new Date(d.getFullYear(), d.getMonth(), 1));
  }, []);
  const dil = locale === "tr" ? "tr-TR" : "en-US";
  const haftaGunleri = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(dil, { weekday: "narrow" }));
  const bosluk = ay ? (ay.getDay() + 6) % 7 : 0; // Hafta pazartesi başlar.
  const gunSayisi = ay ? new Date(ay.getFullYear(), ay.getMonth() + 1, 0).getDate() : 0;
  const kaydir = (yon: number) => ay && setAy(new Date(ay.getFullYear(), ay.getMonth() + yon, 1));

  return (
    <div className="mf-hucre" style={{ gridRow: "span 2" }}>
      <div className="mf-kart" role="group" aria-label={dict.kart.takvim}>
        <KartBasligi ad={dict.kart.takvim} ikon="takvim" />
        <div className="mf-takvim-ust">
          <span>{ay?.toLocaleDateString(dil, { month: "long", year: "numeric" })}</span>
          <span>
            <button type="button" onClick={() => kaydir(-1)} aria-label={dict.onceki} title={dict.onceki}>
              <Ikon ad="sol" boyut={14} />
            </button>
            <button type="button" onClick={() => kaydir(1)} aria-label={dict.sonraki} title={dict.sonraki}>
              <Ikon ad="sag" boyut={14} />
            </button>
          </span>
        </div>
        <div className="mf-takvim">
          {haftaGunleri.map((g, i) => (
            <span key={i} className="mf-hafta">
              {g}
            </span>
          ))}
          {Array.from({ length: bosluk }, (_, i) => (
            <span key={`b${i}`} />
          ))}
          {ay &&
            Array.from({ length: gunSayisi }, (_, i) => {
              const anahtar = gunAnahtari(new Date(ay.getFullYear(), ay.getMonth(), i + 1));
              const buGun = bugun !== null && anahtar === gunAnahtari(bugun);
              return (
                <button key={anahtar} type="button" onClick={() => setSecili(anahtar)} aria-pressed={secili === anahtar}>
                  <span className={buGun ? "bugun" : secili === anahtar ? "secili" : undefined}>{i + 1}</span>
                </button>
              );
            })}
        </div>
      </div>
    </div>
  );
}

function IslerKarti({ dict, locale, taslak, uygula, isRef, kilitli }: KartOrtak & TaslakOrtak & { locale: Locale; isRef: React.RefObject<HTMLInputElement | null> }) {
  const [girdi, setGirdi] = useState("");
  const ekle = (e: React.FormEvent) => {
    e.preventDefault();
    const metin = girdi.trim();
    if (!metin) return;
    uygula({ ...taslak, is: metin, isTarihi: Date.now() });
    setGirdi("");
  };
  const tarih = taslak.isTarihi ? new Date(taslak.isTarihi).toLocaleDateString(locale === "tr" ? "tr-TR" : "en-US") : null;
  return (
    <div className="mf-hucre" style={{ gridRow: "span 2" }}>
      <div className="mf-kart mf-tam" role="group" aria-label={dict.kart.isler}>
        <div className="mf-isler">
          {/* Paneldeki iş kartı gibi kapak fotoğraflı: boş degrade kart yarım kalmış görünüyordu. */}
          <div className="mf-kapak">
            <img src="/brand/is-kapak.jpg" alt="" draggable={false} />
          </div>
          <span className="mf-isler-hap">
            <Ikon ad="is" boyut={14} renk="var(--mf-accent-dark)" />
            {dict.kart.isler} <span>{taslak.is ? 1 : 0}</span>
          </span>
          {taslak.is && (
            <button type="button" className="mf-kapak-arti" onClick={() => kilitli("is")} aria-label={dict.kilit.is} title={dict.kilit.is}>
              <Ikon ad="arti" boyut={15} renk="#fff" />
            </button>
          )}
          <div className="mf-is-govde">
            {taslak.is !== null ? (
              <>
                <AdAlani deger={taslak.is} etiket={dict.isAdi} sinif="mf-is-ad" degistir={(v) => uygula({ ...taslak, is: v })} />
                <div className="mf-is-satir">
                  <Ikon ad="kisi" boyut={15} />
                  <span>{dict.ben}</span>
                </div>
                {tarih && (
                  <div className="mf-is-satir">
                    <Ikon ad="takvim" boyut={15} />
                    <span>{dict.kuruldu.replace("{tarih}", tarih)}</span>
                  </div>
                )}
              </>
            ) : (
              <form className="mf-ilk" onSubmit={ekle}>
                <p className="mf-is-ipucu">{dict.isIpucu}</p>
                <input
                  ref={isRef}
                  aria-label={dict.isYer}
                  placeholder={dict.isYer}
                  value={girdi}
                  maxLength={SINIR.ad}
                  autoComplete="off"
                  onChange={(e) => setGirdi(e.target.value)}
                />
                <button type="submit" className="mf-birincil" disabled={!girdi.trim()}>
                  {dict.isBaslat}
                </button>
              </form>
            )}
            <div className="mf-is-alt">
              <Ikon ad="klasor" boyut={15} />
              <span>{dict.projeSayisi.replace("{n}", String(taslak.proje ? 1 : 0))}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProjelerKarti({ dict, taslak, uygula, projeRef, eksigeGit, kilitli }: KartOrtak & TaslakOrtak & { projeRef: React.RefObject<HTMLInputElement | null>; eksigeGit: () => void }) {
  const [girdi, setGirdi] = useState("");
  const ekle = (e: React.FormEvent) => {
    e.preventDefault();
    const metin = girdi.trim();
    if (!metin || !taslak.is) return;
    uygula({ ...taslak, proje: metin });
    setGirdi("");
  };
  return (
    <div className="mf-hucre orta">
      <div className="mf-kart" role="group" aria-label={dict.kart.projeler}>
        <KartBasligi ad={dict.kart.projeler} ikon="proje" sag={<span className="mf-rozet">{taslak.proje ? 1 : 0}</span>} />
        <div className="mf-cipler">
          <span className="mf-cip secili">{dict.tumu}</span>
          {taslak.is && <span className="mf-cip">{taslak.is}</span>}
        </div>
        <div className="mf-serit-liste">
          {taslak.proje !== null ? (
            <>
              <div className="mf-proje-kutu">
                <AdAlani deger={taslak.proje} etiket={dict.projeAdi} sinif="mf-proje-ad" degistir={(v) => uygula({ ...taslak, proje: v })} />
              </div>
              <button type="button" className="mf-proje-kutu kesik" onClick={() => kilitli("proje")} aria-label={dict.kilit.proje} title={dict.kilit.proje}>
                <Ikon ad="arti" boyut={20} />
              </button>
            </>
          ) : taslak.is ? (
            <form className="mf-proje-kutu kesik form" onSubmit={ekle}>
              <input
                ref={projeRef}
                aria-label={dict.projeYer}
                placeholder={dict.projeYer}
                value={girdi}
                maxLength={SINIR.ad}
                autoComplete="off"
                onChange={(e) => setGirdi(e.target.value)}
              />
              <button type="submit" className="mf-birincil" disabled={!girdi.trim()}>
                {dict.projeEkle}
              </button>
            </form>
          ) : (
            <button type="button" className="mf-proje-kutu kesik" onClick={eksigeGit}>
              <Ikon ad="arti" boyut={18} />
              <span>{dict.onceIs}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const CALISMA_SN = 25 * 60;
const MOLA_SN = 5 * 60;

function Pomodoro({ dict }: { dict: MisafirDict }) {
  const [mola, setMola] = useState(false);
  const [kalan, setKalan] = useState(CALISMA_SN);
  const [calisiyor, setCalisiyor] = useState(false);
  const toplam = mola ? MOLA_SN : CALISMA_SN;

  useEffect(() => {
    if (!calisiyor) return;
    const bitis = Date.now() + kalan * 1000;
    // Sekme arka plandayken aralıklar yavaşlıyor; kalan süre saatten hesaplanır.
    const id = window.setInterval(() => {
      const sn = Math.max(0, Math.round((bitis - Date.now()) / 1000));
      if (sn > 0) return setKalan(sn);
      // Süre bitince sıradaki aşamaya geçilir: çalışmadan sonra mola, moladan sonra çalışma.
      setCalisiyor(false);
      setMola(!mola);
      setKalan(mola ? CALISMA_SN : MOLA_SN);
    }, 250);
    return () => window.clearInterval(id);
    // kalan bilerek dışarıda: her saniye yeni bir aralık kurulmasın.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calisiyor]);

  const dk = String(Math.floor(kalan / 60)).padStart(2, "0");
  const sn = String(kalan % 60).padStart(2, "0");
  return (
    <div className="mf-hucre">
      <div className="mf-kart" role="group" aria-label={dict.kart.pomodoro}>
        <KartBasligi ad={dict.kart.pomodoro} ikon="saat" />
        <div className="mf-pomodoro">
          <Halka boyut={76} kalinlik={7} oran={1 - kalan / toplam} renk={RENK.accent}>
            <span className="mf-sure">
              {dk}:{sn}
              <small>{mola ? dict.mola : dict.calisma}</small>
            </span>
          </Halka>
          <div className="mf-pomodoro-dugmeler">
            <button type="button" className="oynat" onClick={() => setCalisiyor((c) => !c)} aria-label={calisiyor ? dict.duraklat : dict.baslat} title={calisiyor ? dict.duraklat : dict.baslat}>
              <Ikon ad={calisiyor ? "duraklat" : "oynat"} boyut={14} renk="#1B2028" />
            </button>
            <button
              type="button"
              onClick={() => {
                setCalisiyor(false);
                setKalan(toplam);
              }}
              aria-label={dict.sifirla}
              title={dict.sifirla}
            >
              <Ikon ad="sifirla" boyut={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function KilitliOzet({ ad, ikon, cipler, onClick }: { ad: string; ikon: IkonAdi; cipler: string[]; onClick: () => void }) {
  return (
    <div className="mf-hucre">
      <button type="button" className="mf-kart mf-tik-kart" onClick={onClick} aria-label={ad}>
        <KartBasligi ad={ad} ikon={ikon} />
        <span className="mf-cipler">
          {cipler.map((c, i) => (
            <span key={c} className={`mf-cip${i === 0 ? " secili" : ""}`}>
              {c}
            </span>
          ))}
        </span>
        <span className="mf-buyuk-sayi">0</span>
      </button>
    </div>
  );
}

/**
 * Panelde olmayan tek kart: ziyaretçi neye baktığını ve Projelio'nun neden
 * var olduğunu burada okur. Tanıtım sayfası yerine panonun içinde, çünkü
 * anlatılan şey zaten etrafındaki kartlar.
 */
function NedirKarti({ dict, dene, uyeOl }: { dict: MisafirDict; dene: () => void; uyeOl: () => void }) {
  const n = dict.nedir;
  return (
    <div className="mf-hucre orta" style={{ gridRow: "span 2" }}>
      <section className="mf-kart mf-nedir" aria-labelledby="mf-nedir-baslik">
        <span className="mf-nedir-soru">
          <img src="/brand/logo.png" alt="" width={18} height={18} />
          {n.soru}
        </span>
        <h2 id="mf-nedir-baslik">{n.baslik}</h2>
        <p>{n.metin}</p>
        <ul>
          {n.nedenler.map((x) => (
            <li key={x}>
              <span className="mf-nedir-tik">
                <Ikon ad="onay" boyut={12} kalinlik={2.6} />
              </span>
              {x}
            </li>
          ))}
        </ul>
        <div className="mf-nedir-dugmeler">
          <button type="button" className="mf-birincil" onClick={uyeOl}>
            <Ikon ad="uyeOl" boyut={16} />
            {n.basla}
          </button>
          <button type="button" className="mf-ikincil" onClick={dene}>
            {n.dene}
            <Ikon ad="sag" boyut={15} />
          </button>
        </div>
        {/* Lio iki katman: gövde ve gözler (paneldeki AiLauncher gibi). */}
        <span className="mf-nedir-lio" aria-hidden="true">
          <img src="/brand/lio-base.png" alt="" draggable={false} />
          <img src="/brand/lio-eyes.png" alt="" draggable={false} />
        </span>
      </section>
    </div>
  );
}

function MusterilerKarti({ dict, kilitli }: KartOrtak) {
  return (
    <div className="mf-hucre" style={{ gridRow: "span 2" }}>
      <div className="mf-kart" role="group" aria-label={dict.kart.musteriler}>
        <KartBasligi ad={dict.kart.musteriler} ikon="musteri" />
        <div className="mf-cipler" role="tablist">
          <span className="mf-cip secili" role="tab" aria-selected="true">
            {dict.harita}
          </span>
          {[dict.musteriSekme, dict.potansiyel].map((s) => (
            <button key={s} type="button" role="tab" aria-selected="false" className="mf-cip" onClick={() => kilitli("musteriler")}>
              {s} <span className="mf-cip-sayi">0</span>
            </button>
          ))}
        </div>
        <div className="mf-buyuk-sayi">0</div>
        <MisafirHarita etiket={dict.kilit.musteriler} sayiMetni={dict.ilSayisi} onAc={() => kilitli("musteriler")} />
      </div>
    </div>
  );
}

/** Kutunun açık/kapalı tercihi panelde de kalıcı; yalnızca bu tarayıcıda tutulur. */
function lioCubukAcikMi(): boolean {
  try {
    return window.localStorage.getItem(LIO_CUBUK_ANAHTARI) !== "0";
  } catch {
    return true;
  }
}

/**
 * Paneldeki gibi (apps/web/src/components/AiLauncher.tsx): anasayfada Lio
 * altta yazmaya hazır bir kutu; çarpıyla kapatılınca sağ altta Lio'nun kendisi
 * belirir, ona basınca kutu geri gelir.
 */
function Lio({ dict, onGonder }: { dict: MisafirDict; onGonder: () => void }) {
  const [cubukAcik, setCubukAcikHam] = useState(true);
  const [metin, setMetin] = useState("");
  const [gozKapali, setGozKapali] = useState(false);
  useEffect(() => setCubukAcikHam(lioCubukAcikMi()), []);
  const setCubukAcik = (acik: boolean) => {
    setCubukAcikHam(acik);
    try {
      window.localStorage.setItem(LIO_CUBUK_ANAHTARI, acik ? "1" : "0");
    } catch {
      // Depolama kapalıysa tercih yalnızca bu sayfa açıkken geçerli.
    }
  };

  // Ara sıra göz kırpar; panelde de Lio böyle canlı duruyor.
  useEffect(() => {
    if (cubukAcik) return;
    let zamanlayici = 0;
    const kirp = () => {
      setGozKapali(true);
      zamanlayici = window.setTimeout(() => {
        setGozKapali(false);
        zamanlayici = window.setTimeout(kirp, 2500 + Math.random() * 3500);
      }, 160);
    };
    zamanlayici = window.setTimeout(kirp, 2000);
    return () => window.clearTimeout(zamanlayici);
  }, [cubukAcik]);

  if (!cubukAcik) {
    return (
      <button type="button" className="mf-lio-simge" onClick={() => setCubukAcik(true)} aria-label={dict.lioAc} title={dict.lioAc}>
        <span>
          <img src="/brand/lio-base.png" alt="" draggable={false} />
          <img src="/brand/lio-eyes.png" alt="" draggable={false} style={{ opacity: gozKapali ? 0 : 1 }} />
        </span>
      </button>
    );
  }

  const gonder = () => {
    if (!metin.trim()) return;
    onGonder();
  };
  return (
    <div className="mf-lio">
      <img src="/brand/lio-open.png" alt="" draggable={false} />
      <input
        value={metin}
        onChange={(e) => setMetin(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) gonder();
        }}
        placeholder={dict.lioYaz}
        aria-label={dict.lioYaz}
      />
      <button type="button" className={metin.trim() ? "dolu" : undefined} onClick={gonder} aria-label={dict.gonder} title={dict.gonder}>
        <Ikon ad="gonder" boyut={16} />
      </button>
      <button type="button" onClick={() => setCubukAcik(false)} aria-label={dict.kapat} title={dict.kapat}>
        <Ikon ad="kapat" boyut={16} />
      </button>
    </div>
  );
}
