// 3D ofis oyunu: sahne + oyun arayüzü (puan, seviye, mağaza, son hareketler).
//
// Sahneyi OfisMotoru çizer; bu bileşen veriyi ona verir ve oyunun durumunu
// (alınan eşyalar, harcanan puan) tutar. Durum şimdilik TARAYICIDA, şirket
// başına ayrı anahtarda (bkz. lib/ofisOyunu.ts kayitAnahtari): ekip ortak
// görsün diye backend'e taşınması sonraki adım. Puan ise veriden gelir —
// şirkette tamamlanan her görev ofise puan kazandırır.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  GERI_SATIS_ORANI,
  KATALOG,
  KATEGORILER,
  kaydiCoz,
  kayitAnahtari,
  katalogEsyasi,
  kazanilanPuan,
  duzeniUygula,
  ofisPlani,
  ofisSeviyesi,
  KASA_MODULU,
  KUPA_RAFI,
  PROJE_ONEKI,
  adSayisi,
  type IstasyonBilgisi,
  type EsyaKategorisi,
  type EsyaTuru,
  type OfisKaydi,
  type YerlesikEsya,
} from "../../lib/ofisOyunu";
import { openLio } from "../../lib/askLio";
import { isTemasi } from "../../lib/studyoOfisi";
import { OfisMotoru, type OdaEtiketi, type SahneKisisi } from "./OfisMotoru";
import {
  KARAKTER_MODELLERI,
  karakterGorunumuTemizle,
  odaDuzeniTemizle,
  type KarakterGorunumu,
  type NesneDuzeni,
  type OdaDuzeni,
} from "@projelio/shared";
import KarakterDuzenleyici from "./KarakterDuzenleyici";
import { api, ApiError } from "../../api/client";
import { ajanApi } from "../../api/ajan";
import AjanPaneli from "../ajan/AjanPaneli";
import type { AjanDurumu } from "@projelio/shared";
import "./OfisOyunu.css";

export interface OyunDepartmani {
  id: string;
  ad: string;
  /** Departman kapağının CSS arka planı (fotoğraf ya da hazır kapak). */
  kapak?: string;
  /** Departmanda açık modüller; eşyası olanlar odada da durur (MODUL_ESYALARI). */
  moduller?: { key: string; ad: string; bilgi?: IstasyonBilgisi }[];
  /**
   * emek: tamamladığı görev sayısı; yonetici: departman yöneticisi (yönetici masasında oturur);
   * istasyon: stüdyoda üzerinde çalıştığı projenin istasyonu (orada ayakta çalışır).
   */
  kisiler: { id: string; ad: string; emek?: number; yonetici?: boolean; istasyon?: string }[];
  /** Stüdyoda odanın döşemesi (bkz. lib/studyoOfisi.ts isTemasi). */
  tema?: string;
  acikGorev: number;
  gecikmis: number;
}

export interface OyunHareketi {
  id: string;
  kim: string;
  ne: string;
}

interface Props {
  kapsam: string;
  /**
   * Stüdyom: odalar departman değil serbest işler (bkz. lib/studyoOfisi.ts);
   * metinler ona göre ("İş sayfasını aç", "Görüşme Odası").
   */
  studyo?: boolean;
  /**
   * İlk veriler (departmanlar, üyeler, modüller…) tamamlandı mı. Gelmeden sahne
   * kurulmaz, "Ofis kuruluyor…" görünür: odalar parça parça belirmesin.
   */
  veriHazir?: boolean;
  departmanlar: OyunDepartmani[];
  bugunToplanti: number | null;
  bitenGorev: number;
  hareketler: OyunHareketi[];
  cevrimici: Set<string>;
  benId?: string;
  /** Odanın panelindeki "sayfasını aç" düğmesi: departman sayfası ya da takvim. */
  onOdaSayfasi: (odaId: string) => void;
  /** Bir modül açılır (odadaki eşyasına ya da paneldeki adına tıklanınca). */
  onModulAc: (odaId: string, modulKey: string) => void;
  /**
   * Modülü şirkette kapatır (düzenleyicide eşyanın menüsünden; yalnızca sahip).
   * Kayıtlar silinmez, geri alınabilir. Verilmezse menüde görünmez.
   */
  onModulKapat?: (modulKey: string) => Promise<void>;
}

/** Odadan ortak alana devredilen dekorun (türü hazır model adı) okunur adı. */
const MODEL_ADLARI: Record<string, string> = {
  saksi: "Saksı bitkisi",
  bitkiKucuk2: "Küçük bitki",
  askilik: "Askılık",
  kitaplik: "Kitaplık",
  agacBuyuk: "Ağaç",
  koltuk: "Koltuk",
  kanepe: "Kanepe",
  ayakliLamba: "Ayaklı lamba",
};

/** Düzenleyicide nesnenin okunur adı (kimlik: "masa-0", "modul:…", "dekor:…"). */
function nesneAdi(nesneId: string, modulAdlari: Map<string, string>): string {
  if (nesneId.startsWith("masa-")) return `Masa ${Number(nesneId.slice(5)) + 1}`;
  if (nesneId.startsWith("modul:")) return modulAdlari.get(nesneId.slice(6)) ?? "Modül eşyası";
  if (nesneId.startsWith("dekor:kose-agaci-")) return "Ağaç";
  if (/^dekor:kose-\d+-hali$/.test(nesneId)) return "Halı";
  if (/^dekor:kose-\d+-koltuk-/.test(nesneId)) return "Koltuk";
  if (/^dekor:kose-\d+-yan-masa$/.test(nesneId)) return "Yan masa";
  if (/^dekor:kose-\d+-masa$/.test(nesneId)) return "Çalışma masası";
  return (
    {
      "dekor:kose-0": "Büyük bitki",
      "dekor:kose-1": "Saksı bitkisi",
      "dekor:tahta": "Yazı tahtası",
      "dekor:kitaplik": "Kitaplık",
      "dekor:askilik": "Askılık",
      "dekor:kapi-bitkisi": "Küçük bitki",
      "dekor:toplanti-masasi": "Toplantı masası",
      "dekor:tv": "Televizyon",
      "dekor:ortak-saksi": "Saksı bitkisi",
      "dekor:giris-bitki-0": "Giriş bitkisi",
      "dekor:giris-bitki-1": "Giriş bitkisi",
      "dekor:ortak-hali": "Halı",
      "dekor:ortak-kanepe": "Kanepe",
      "dekor:ortak-koltuk": "Koltuk",
      "dekor:ortak-sehpa": "Sehpa",
      "dekor:ortak-lamba": "Ayaklı lamba",
      "dekor:kahve-kosesi": "Kahve köşesi",
      "dekor:ortak-ince-monstera": "Büyük bitki",
      "dekor:ortak-kaktus": "Kaktüs",
      "dekor:ortak-monstera": "Büyük bitki",
    } as Record<string, string>
  )[nesneId] ?? "Eşya";
}

/** Ekip düzeni ucu canlıya çıkmadıysa (404) düzen geçici olarak burada tutulur. */
const yerelDuzenAnahtari = (kapsam: string) => `projelio:ofis-duzeni:${kapsam}`;
/** Karakter ucu henüz yayında değilken (404) kendi karakterin tarayıcıda tutulur. */
const yerelKarakterAnahtari = (kisi: string) => `projelio:ofis-karakter:${kisi}`;

// Küçük resimler (motorun çizdiği) gelene kadar ve metin içinde kullanılan yedek simgeler.
const SIMGE: Record<EsyaTuru, string> = {
  bitki: "🪴",
  agac: "🌵",
  monstera: "🪴",
  inceMonstera: "🪴",
  salonBitkisi: "🪴",
  buyukKaktus: "🌵",
  kaktusKucuk: "🌵",
  bitkiliSehpa: "🌱",
  agacBuyuk: "🌳",
  puf: "🛋️",
  kanepe: "🛋️",
  armut: "🫘",
  dinlenmeKoltugu: "🪑",
  ikiliKanepe: "🛋️",
  tasarimKanepe: "🛋️",
  koseKoltuk: "🛋️",
  kitaplik: "📚",
  dolap: "🗄️",
  yanSehpa: "🪵",
  ortaSehpa: "🪵",
  alcakSehpa: "🪵",
  alcakRaf: "🗃️",
  askilik: "🧥",
  copKovasi: "🗑️",
  calismaKosesi: "💻",
  masaTakimi: "🍽️",
  lamba: "💡",
  modernLamba: "💡",
  hali: "🟣",
  haliYuvarlak: "🟠",
  haliCizgili: "🟫",
  kure: "🌍",
  saat: "🕰️",
  somine: "🔥",
  havuz: "⛲",
  akvaryum: "🐠",
  roket: "🚀",
  heykel: "🏆",
  radyoSehpasi: "📻",
  hoparlorler: "🔊",
  satranc: "♟️",
  boksTorbasi: "🥊",
  medya: "📺",
  kosuBandi: "🏃",
  langirt: "⚽",
  masaTenisi: "🏓",
  oyun: "🕹️",
  piyano: "🎹",
  bilardo: "🎱",
  suSebili: "🚰",
  buzdolabi: "🧊",
  kahve: "☕",
  barTezgahi: "🍸",
  otomat: "🥤",
  minderPuf: "🟫",
  yerMinderi: "🟫",
  barTaburesi: "🪑",
  yuvarlakSandalye: "🪑",
  minderliBank: "🪑",
  uzanmaKoltugu: "🛋️",
  tasarimBerjer: "🛋️",
  okumaKosesi: "📖",
  uzanmaliKanepe: "🛋️",
  buyukKoseKanepe: "🛋️",
  koliYigini: "📦",
  komodin: "🗄️",
  kareSehpa: "🪵",
  alcakKitaplik: "📚",
  camSehpa: "🪟",
  tvDolabi: "🗄️",
  kapakliKitaplik: "📚",
  ahsapMasa: "🪵",
  yuvarlakMasa: "🪵",
  genisKitaplik: "📚",
  koseMasa: "🖥️",
  yemekMasasi: "🍽️",
  camToplantiMasasi: "🪟",
  haliPaspas: "🟫",
  oyuncakAyi: "🧸",
  kareLambader: "💡",
  haliKare: "🟦",
  haliDikdortgen: "🟪",
  haliKoseli: "🟩",
  eskiTelevizyon: "📺",
  ocak: "🍳",
  buzdolabiDik: "🧊",
  barKosesi: "🍹",
  buzdolabiBuyuk: "🧊",
  mutfakTezgahi: "🚰",
};

/** Departman (stüdyoda iş) adından etiket simgesi ve rengi — referans görseldeki oda kartları gibi. */
function odaGorunumu(ad: string, sira: number, studyo = false): { ikon: string; ton: string } {
  const a = ad.toLocaleLowerCase("tr");
  if (studyo) {
    // Serbest işler çoğunlukla bir zanaat: önce onlara bakılır (odanın döşemesiyle aynı karar).
    const tema = isTemasi(ad);
    if (tema) return { muzik: { ikon: "muzik", ton: "turuncu" }, video: { ikon: "video", ton: "kirmizi" }, foto: { ikon: "kamera", ton: "mavi" }, tasarim: { ikon: "kalem", ton: "pembe" } }[tema];
  }
  if (/pazarlama|marketing|sosyal|reklam|iletişim|marka|medya/.test(a)) return { ikon: "megafon", ton: "mavi" };
  if (/satış|satis|sales|müşteri|ticaret/.test(a)) return { ikon: "grafik", ton: "turuncu" };
  if (/finans|muhasebe|mali|bütçe|kasa/.test(a)) return { ikon: "para", ton: "yesil" };
  if (/insan|^ik\b|\bik\b|hr|personel|kadro|idari/.test(a)) return { ikon: "insanlar", ton: "pembe" };
  if (/operasyon|lojistik|depo|sevkiyat|tedarik|üretim|fabrika/.test(a)) return { ikon: "disli", ton: "turuncu" };
  if (/ürün|urun|tasarım|ar-?ge|geliştirme|yazılım|teknoloji/.test(a)) return { ikon: "kup", ton: "mor" };
  return { ikon: "bina", ton: ["mor", "mavi", "yesil", "pembe", "turuncu"][sira % 5] };
}

function kaydiOku(anahtar: string): OfisKaydi {
  try {
    return kaydiCoz(localStorage.getItem(anahtar));
  } catch {
    return kaydiCoz(null);
  }
}

function kaydiYaz(anahtar: string, k: OfisKaydi): void {
  try {
    localStorage.setItem(anahtar, JSON.stringify(k));
  } catch {
    // Gizli pencere / kota: oyun bu oturumda yine çalışır, yalnızca hatırlanmaz.
  }
}

export default function OfisOyunu({
  kapsam,
  studyo = false,
  veriHazir = true,
  departmanlar,
  bugunToplanti,
  bitenGorev,
  hareketler,
  cevrimici,
  benId,
  onOdaSayfasi,
  onModulAc,
  onModulKapat,
}: Props) {
  const kapRef = useRef<HTMLDivElement>(null);
  const kokRef = useRef<HTMLDivElement>(null);
  const motorRef = useRef<OfisMotoru | null>(null);
  // Ajan robotu (migration 177): yalnızca ajanı açık hesapta görünür.
  const [ajanDurumu, setAjanDurumu] = useState<AjanDurumu | null>(null);
  const [ajanAcik, setAjanAcik] = useState(false);
  const anahtar = kayitAnahtari(kapsam);
  const [kayit, setKayit] = useState<OfisKaydi>(() => kaydiOku(anahtar));
  const [magaza, setMagaza] = useState(false);
  const [magazaKategorisi, setMagazaKategorisi] = useState<EsyaKategorisi>(KATEGORILER[0].key);
  const [duzenle, setDuzenle] = useState(false);
  const [yerlestirilen, setYerlestirilen] = useState<{ tur: EsyaTuru; id?: string } | null>(null);
  const [secili, setSecili] = useState<{ id: string; x: number; y: number } | null>(null);
  const [bildiri, setBildiri] = useState<string | null>(null);
  const [destekYok, setDestekYok] = useState(false);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [resimler, setResimler] = useState<Partial<Record<EsyaTuru, string>>>({});
  /** Kameranın girdiği oda: tıklanınca sayfaya gitmek yerine odaya girilir. */
  const [icerdekiOda, setIcerdekiOda] = useState<string | null>(null);
  /** Kupa rafının karşısında göz hizasında mıyız (gezinme kapalı, yalnızca plaketler). */
  const [rafta, setRafta] = useState<false | "raf" | "pano">(false);
  /** Kişilerin seçtiği karakter görünümleri (migration 182); kaydı olmayan adından türetilir. */
  const [gorunumler, setGorunumler] = useState<Record<string, KarakterGorunumu>>({});
  /** Kendi karakterini düzenlerken taslak (null: kayıtlı görünüm yok, adından türetilen). */
  const [karakterTaslagi, setKarakterTaslagi] = useState<{ g: KarakterGorunumu | null } | null>(null);
  const [karakterKaydediliyor, setKarakterKaydediliyor] = useState(false);
  /** Sahnede seçili kişi: kendisiyse sol üstte "Karakterini düzenle" çıkar. */
  const [seciliKisi, setSeciliKisi] = useState<string | null>(null);
  /** Kendi karakteri seçiliyken tıklanan masa: orada "Çalışma masası yap" düğmesi çıkar. */
  const [masaTeklifi, setMasaTeklifi] = useState<{ odaId: string; masaNo: number; x: number; y: number } | null>(null);
  const [masaKaydediliyor, setMasaKaydediliyor] = useState(false);
  const benIdRef = useRef(benId);
  benIdRef.current = benId;
  /** Oda paneli kapatılabilir; kapatmak kamerayı odadan çıkarmaz (yalnızca "Ofise dön" ve Esc çıkarır). */
  const [panelAcik, setPanelAcik] = useState(false);
  // Oda düzenleri: ekipte ortak (sunucu); uç yoksa geçici olarak tarayıcıda.
  const [duzenler, setDuzenler] = useState<Record<string, OdaDuzeni>>({});
  const [duzenleyebilir, setDuzenleyebilir] = useState<"hepsi" | string[]>([]);
  const [yerelDuzen, setYerelDuzen] = useState(false);
  const [duzenlenen, setDuzenlenen] = useState<string | null>(null);
  const [taslak, setTaslak] = useState<OdaDuzeni | null>(null);
  /**
   * Düzenlenen odadan başka taslaklar: ortak alana devredilen eşya hem eski
   * odasının hem ortak alanın düzenini değiştirir (oda düzenlenirken ortak alan,
   * ortak alan düzenlenirken eşyanın eski odaları). Kaydet hepsini birlikte
   * yazar, Vazgeç hepsini birlikte atar.
   */
  const [ekTaslaklar, setEkTaslaklar] = useState<Record<string, OdaDuzeni>>({});
  const duzenlerRef = useRef(duzenler);
  duzenlerRef.current = duzenler;
  /** Motorun geri çağırmaları hangi taslağı güncelleyeceğini buradan bilir (durum gecikmeli gelir). */
  const duzenlenenRef = useRef<string | null>(null);
  const [seciliNesne, setSeciliNesne] = useState<string | null>(null);
  const [kaydediliyor, setKaydediliyor] = useState(false);

  // Oda düzenlerinin ucu: şirketin (migration 171) ya da stüdyonun (175).
  // Şirketsiz kişisel ofiste (stüdyo değilse) düzen yok.
  const duzenUcu = studyo ? "/ofis-duzeni/studyo" : kapsam !== "kisisel" ? `/organizations/${kapsam}/ofis-duzeni` : null;
  /** Uç henüz yayında değilken (404) düzenin tarayıcıda tutulduğu anahtar. */
  const yerelKapsam = studyo ? "studyo" : kapsam;

  useEffect(() => {
    if (!duzenUcu) return;
    const ac = new AbortController();
    api
      .get<{ odalar: Record<string, unknown>; duzenleyebilir: "hepsi" | string[] }>(duzenUcu, ac.signal)
      .then((y) => {
        const odalar: Record<string, OdaDuzeni> = {};
        for (const [k, v] of Object.entries(y?.odalar ?? {})) odalar[k] = odaDuzeniTemizle(v);
        setDuzenler(odalar);
        setDuzenleyebilir(y?.duzenleyebilir ?? []);
        setYerelDuzen(false);
      })
      .catch((e) => {
        if (ac.signal.aborted) return;
        // Uç henüz yayında değil: düzen bu tarayıcıda tutulur, herkes düzenleyebilir.
        if (e instanceof ApiError && e.status === 404) {
          setYerelDuzen(true);
          setDuzenleyebilir("hepsi");
          try {
            const ham = JSON.parse(localStorage.getItem(yerelDuzenAnahtari(yerelKapsam)) ?? "{}") as Record<string, unknown>;
            const odalar: Record<string, OdaDuzeni> = {};
            for (const [k, v] of Object.entries(ham)) odalar[k] = odaDuzeniTemizle(v);
            setDuzenler(odalar);
          } catch {
            setDuzenler({});
          }
        }
      });
    return () => ac.abort();
  }, [duzenUcu, yerelKapsam]);

  const odaDuzenlenebilir = (odaId: string) =>
    // Ortak alan da düzenlenir (bitkileri); şirkette sunucu gibi yalnızca sahibe
    // açık. Stüdyoda ortak alan kişinin kendisinin: listede gelir.
    !!duzenUcu && (duzenleyebilir === "hepsi" || ((odaId !== "ortak" || studyo) && duzenleyebilir.includes(odaId)));
  const ortakDuzenlenebilir = odaDuzenlenebilir("ortak");
  // Son hareketler açılışta birkaç saniye görünür, sonra kendiliğinden kapanır;
  // sol alttaki düğmeyle yeniden açılır. Tek tek de kapatılabilir.
  const [akisAcik, setAkisAcik] = useState(true);
  const [kapatilanlar, setKapatilanlar] = useState<Set<string>>(() => new Set());
  const [ipucuAcik, setIpucuAcik] = useState(true);
  const [tamEkran, setTamEkran] = useState(false);
  /** Tarayıcı tam ekrana izin vermezse (gömülü görünüm, eski Safari) ofis pencereyi kaplar. */
  const [sahteTamEkran, setSahteTamEkran] = useState(false);
  const gorunenHareketler = hareketler.filter((h) => !kapatilanlar.has(h.id)).slice(0, 4);

  useEffect(() => {
    const z = window.setTimeout(() => setAkisAcik(false), 8000);
    const z2 = window.setTimeout(() => setIpucuAcik(false), 12000);
    return () => {
      window.clearTimeout(z);
      window.clearTimeout(z2);
    };
  }, []);

  // Tam ekran: tarayıcının kendi tam ekranı; Esc ile de çıkılır, durum olaydan okunur.
  useEffect(() => {
    const degisti = () => {
      const acik = document.fullscreenElement === kokRef.current;
      setTamEkran(acik);
      if (acik) setSahteTamEkran(false);
    };
    document.addEventListener("fullscreenchange", degisti);
    return () => document.removeEventListener("fullscreenchange", degisti);
  }, []);
  function tamEkranCevir() {
    const kok = kokRef.current;
    if (!kok) return;
    if (sahteTamEkran) setSahteTamEkran(false);
    else if (document.fullscreenElement) void document.exitFullscreen();
    else if (kok.requestFullscreen) {
      kok.requestFullscreen().catch(() => setSahteTamEkran(true));
      // Bazı gömülü görünümlerde istek reddedilmiyor, yanıtsız kalıyor: kısa
      // sürede tam ekrana geçilmezse pencereyi kaplayan görünüme düşülür.
      window.setTimeout(() => {
        if (!document.fullscreenElement) setSahteTamEkran(true);
      }, 700);
    } else setSahteTamEkran(true);
  }
  useEffect(() => {
    if (!sahteTamEkran) return;
    const tus = (e: KeyboardEvent) => {
      // Odadayken (ya da raftayken) Esc önce oradan çıkarır; tam ekrandan ikinci
      // Esc ile çıkılır. Motorun dinleyicisi önce çalışıp Esc'i işlediyse
      // defaultPrevented'dır: o anda odadan çoktan çıkılmış görünür.
      if (e.key === "Escape" && !e.defaultPrevented && !motorRef.current?.icerdekiOda && !motorRef.current?.raftaMi) setSahteTamEkran(false);
    };
    window.addEventListener("keydown", tus);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", tus);
      document.body.style.overflow = "";
    };
  }, [sahteTamEkran]);
  const tam = tamEkran || sahteTamEkran;

  useEffect(() => setKayit(kaydiOku(anahtar)), [anahtar]);

  const kazanilan = kazanilanPuan(bitenGorev);
  const puan = Math.max(0, kazanilan - kayit.harcanan);
  const seviye = ofisSeviyesi(kazanilan);

  // Son ziyaretten beri kazanılan puan: oyun hissinin yarısı bu "+30" anı.
  useEffect(() => {
    if (!bitenGorev) return;
    const k = `${anahtar}:gorulen`;
    let onceki = 0;
    try {
      onceki = Number(localStorage.getItem(k)) || 0;
      localStorage.setItem(k, String(bitenGorev));
    } catch {
      return;
    }
    if (onceki && bitenGorev > onceki) bildir(`Son gelişinden beri ${bitenGorev - onceki} görev bitti: +${kazanilanPuan(bitenGorev - onceki)} puan`);
  }, [anahtar, bitenGorev]);

  const zamanlayici = useRef<number | undefined>(undefined);
  function bildir(metin: string) {
    window.clearTimeout(zamanlayici.current);
    setBildiri(metin);
    zamanlayici.current = window.setTimeout(() => setBildiri(null), 3800);
  }
  useEffect(() => () => window.clearTimeout(zamanlayici.current), []);

  const hamPlan = useMemo(
    () =>
      ofisPlani(
        departmanlar.map((d) => ({
          id: d.id,
          kisi: d.kisiler.length,
          moduller: (d.moduller ?? []).map((m) => m.key),
          yonetici: d.kisiler.some((k) => k.yonetici),
        }))
      ),
    [departmanlar]
  );
  // Kayıtlı düzenler + düzenlenen odanın taslağı plana uygulanır (masalar, modül eşyaları, dekor).
  const plan = useMemo(
    () =>
      duzeniUygula(
        hamPlan,
        duzenlenen && taslak ? { ...duzenler, ...ekTaslaklar, [duzenlenen]: taslak } : duzenler
      ),
    [hamPlan, duzenler, duzenlenen, taslak, ekTaslaklar]
  );
  const modulAdlari = useMemo(
    () => new Map(departmanlar.flatMap((d) => (d.moduller ?? []).map((x) => [x.key, x.ad] as [string, string]))),
    [departmanlar]
  );
  // Modül adları motora (eşyanın üzerine gelince gösterilir).
  useEffect(() => {
    const m = motorRef.current;
    if (!m) return;
    m.modulAdlari = new Map(departmanlar.flatMap((d) => (d.moduller ?? []).map((x) => [x.key, x.ad] as [string, string])));
  }, [departmanlar]);

  const etiketler = useMemo(() => {
    const e: Record<string, OdaEtiketi> = {};
    departmanlar.forEach((d, i) => {
      const oda = plan.odalar.find((o) => o.id === d.id);
      const g = odaGorunumu(d.ad, i, studyo);
      const sigmayan = oda?.sigmayan ? ` · +${oda.sigmayan}` : "";
      e[d.id] = {
        ad: d.ad,
        alt: `${d.kisiler.length} kişi${sigmayan} · ${d.acikGorev} görev`,
        durum: d.gecikmis >= 3 ? "crit" : d.gecikmis > 0 ? "warn" : "ok",
        kapak: d.kapak,
        ...g,
      };
    });
    e.toplanti = {
      ad: studyo ? "Görüşme Odası" : "Toplantı Odası",
      alt: bugunToplanti === null ? "…" : bugunToplanti ? `Bugün ${bugunToplanti} toplantı` : "Bugün toplantı yok",
      ikon: "video",
      ton: "kirmizi",
    };
    e.ortak = { ad: "Ortak Alan", alt: cevrimici.size ? `${cevrimici.size} kişi çevrimiçi` : "Ekip çevrimiçi", ikon: "kahve", ton: "gri" };
    return e;
  }, [departmanlar, plan, bugunToplanti, cevrimici, studyo]);

  const sahneKisileri = useMemo<SahneKisisi[]>(() => {
    const kisiOdasi = new Map<string, string>();
    // Stüdyoda önce üzerinde çalıştığı projenin odası (istasyonunda durur).
    for (const d of departmanlar) for (const k of d.kisiler) if (k.istasyon && !kisiOdasi.has(k.id)) kisiOdasi.set(k.id, d.id);
    for (const d of departmanlar) for (const k of d.kisiler) if (k.yonetici && !kisiOdasi.has(k.id)) kisiOdasi.set(k.id, d.id);
    for (const d of departmanlar) for (const k of d.kisiler) if (!kisiOdasi.has(k.id)) kisiOdasi.set(k.id, d.id);
    return (
      // Birden çok departmanda olan kişi ofiste bir kez gezer: (stüdyoda
      // çalıştığı projenin odasında,) yöneticisi olduğu odada, yoksa ilk departmanında (oda panelindeki kadro listesi
      // değişmez, orada her departmanda görünür).
      departmanlar.flatMap((d) =>
        d.kisiler.filter((k) => kisiOdasi.get(k.id) === d.id).map((k) => ({
          id: k.id,
          ad: k.ad,
          odaId: d.id,
          cevrimici: cevrimici.has(k.id),
          ben: k.id === benId,
          emek: k.emek ?? 0,
          yonetici: !!k.yonetici,
          istasyon: k.istasyon,
          masa: gorunumler[k.id]?.masalar?.[d.id],
        }))
      )
    );
  }, [departmanlar, cevrimici, benId, gorunumler]);

  // Ajanın hâli dakikada bir yoklanır (panel açıkken panel 5 sn'de bir yoklar).
  // Uç yoksa ya da hesap izinli değilse robot hiç çıkmaz.
  useEffect(() => {
    const ac = new AbortController();
    const yokla = () => {
      if (document.hidden) return;
      // Hata (uç henüz yayında değil, ağ yok) robotu yalnızca gizler.
      ajanApi.durum(ac.signal).then(setAjanDurumu).catch(() => undefined);
    };
    yokla();
    const z = setInterval(yokla, 60_000);
    return () => {
      clearInterval(z);
      ac.abort();
    };
  }, []);

  useEffect(() => {
    const d = ajanDurumu;
    motorRef.current?.ajaniAyarla(
      d?.izinli
        ? {
            ad: d.ad,
            hal: !d.bagli ? "uyuyor" : d.calisiyor ? "calisiyor" : "bosta",
            haber: d.okunmamisRapor + d.bekleyenOneri > 0,
            not: d.not,
          }
        : null
    );
  }, [ajanDurumu, yukleniyor]);

  // Motor bir kez kurulur; geri çağırmalar her zaman güncel duruma ref'ten bakar.
  // Ofisteki kişilerin karakter görünümleri: kişi listesi değişince yeniden sorulur.
  const kisiKimlikleri = useMemo(() => [...new Set(sahneKisileri.map((k) => k.id))].sort().join(","), [sahneKisileri]);
  useEffect(() => {
    if (!kisiKimlikleri) return;
    const ac = new AbortController();
    api
      .get<Record<string, unknown>>(`/ofis-duzeni/karakterler?kisiler=${encodeURIComponent(kisiKimlikleri)}`, ac.signal)
      .then((y) => {
        const temiz: Record<string, KarakterGorunumu> = {};
        for (const [id, g] of Object.entries(y ?? {})) {
          const t = karakterGorunumuTemizle(g);
          if (t) temiz[id] = t;
        }
        setGorunumler(temiz);
      })
      .catch((e) => {
        if (ac.signal.aborted || !benId) return;
        // Uç henüz yayında değil: yalnızca kendi karakterin bu tarayıcıdan gelir.
        if (e instanceof ApiError && e.status === 404) {
          try {
            const t = karakterGorunumuTemizle(JSON.parse(localStorage.getItem(yerelKarakterAnahtari(benId)) ?? "null"));
            setGorunumler(t ? { [benId]: t } : {});
          } catch {
            setGorunumler({});
          }
        }
      });
    return () => ac.abort();
  }, [kisiKimlikleri, benId]);

  // Düzenlerken taslak sahnedeki kendi karakterine uygulanır (önizleme); vazgeçince kayıtlıya döner.
  useEffect(() => {
    const m = new Map(Object.entries(gorunumler));
    if (karakterTaslagi && benId) {
      if (karakterTaslagi.g) m.set(benId, karakterTaslagi.g);
      else m.delete(benId);
    }
    motorRef.current?.gorunumleriAyarla(m);
  }, [gorunumler, karakterTaslagi, benId]);

  const benAdi = sahneKisileri.find((k) => k.ben)?.ad ?? "";
  const varsayilanModel = KARAKTER_MODELLERI[adSayisi(benAdi) % KARAKTER_MODELLERI.length].dosya;

  function karakteriDuzenle() {
    if (!benId) return;
    setKarakterTaslagi({ g: gorunumler[benId] ?? null });
    setPanelAcik(false);
    setMagaza(false);
    motorRef.current?.kisiyeOdaklan(benId);
  }

  /**
   * Kendi karakter kaydını yazar ve sahneye uygular; uç henüz yayında değilse
   * (404) tarayıcıda tutar. Sunucunun kaydettiği hâl dönülür: sunucu bir
   * seçimi tanımayıp atarsa (ör. eski sürüm) "kaydedildi" denip seçim
   * sessizce kayboluyordu — artık söylenir.
   */
  async function karakterKaydiYaz(g: KarakterGorunumu): Promise<"sunucu" | "tarayici" | "eksik"> {
    if (!benId) throw new Error("Oturum yok");
    try {
      const kayitli = karakterGorunumuTemizle(await api.post<unknown>("/ofis-duzeni/karakter", g)) ?? g;
      setGorunumler((o) => ({ ...o, [benId]: kayitli }));
      return JSON.stringify(kayitli) === JSON.stringify(karakterGorunumuTemizle(g)) ? "sunucu" : "eksik";
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 404)) throw e;
      try {
        localStorage.setItem(yerelKarakterAnahtari(benId), JSON.stringify(g));
      } catch {
        // Tarayıcı depolaması kapalı: bu oturumluk kalır.
      }
      setGorunumler((o) => ({ ...o, [benId]: g }));
      return "tarayici";
    }
  }

  async function karakteriKaydet() {
    if (!benId || !karakterTaslagi) return;
    setKarakterKaydediliyor(true);
    try {
      const sonuc = await karakterKaydiYaz(karakterTaslagi.g ?? { model: varsayilanModel });
      setKarakterTaslagi(null);
      bildir(
        sonuc === "sunucu"
          ? "Karakterin kaydedildi"
          : sonuc === "tarayici"
            ? "Karakterin bu tarayıcıda kaydedildi"
            : "Karakterin kaydedildi ama bazı seçimler sunucuda henüz desteklenmiyor; sayfa yenilenince kaybolabilir"
      );
    } catch (e) {
      bildir(e instanceof ApiError ? e.message : "Karakter kaydedilemedi");
    } finally {
      setKarakterKaydediliyor(false);
    }
  }

  async function calismaMasasiYap() {
    if (!benId || !masaTeklifi) return;
    const g = gorunumler[benId] ?? { model: varsayilanModel };
    setMasaKaydediliyor(true);
    try {
      const sonuc = await karakterKaydiYaz({ ...g, masalar: { ...g.masalar, [masaTeklifi.odaId]: masaTeklifi.masaNo } });
      setMasaTeklifi(null);
      bildir(sonuc === "eksik" ? "Masa seçimi sunucuda henüz desteklenmiyor" : "Çalışma masan değişti");
    } catch (e) {
      bildir(e instanceof ApiError ? e.message : "Masa kaydedilemedi");
    } finally {
      setMasaKaydediliyor(false);
    }
  }

  // Kendi karakteri seçiliyken sol üstte (oda düğmelerinin yanında). Kişinin başının
  // üstünde dururken karakterle birlikte kayıyor, tıklaması zorlaşıyordu.
  const karakterDugmesi =
    seciliKisi && seciliKisi === benId && !karakterTaslagi && !duzenlenen && !rafta ? (
      <button type="button" className="of-btn birincil" onClick={karakteriDuzenle}>
        Karakterini düzenle
      </button>
    ) : null;

  const durumRef = useRef({ kayit, puan, anahtar, onModulAc });
  durumRef.current = { kayit, puan, anahtar, onModulAc };

  useEffect(() => {
    const kap = kapRef.current;
    if (!kap) return;
    let motor: OfisMotoru;
    try {
      motor = new OfisMotoru(kap);
    } catch {
      setDestekYok(true);
      return;
    }
    motorRef.current = motor;
    motor.onHazir = (hata) => {
      setYukleniyor(false);
      if (hata) {
        setDestekYok(true);
        return;
      }
      motor
        .kucukResimler(KATALOG.map((k) => k.tur))
        .then(setResimler)
        .catch(() => undefined);
    };
    motor.onOdaTikla = (id) => {
      motor.odayaGir(id);
      setIcerdekiOda(id);
      setPanelAcik(true);
      setMagaza(false);
    };
    motor.onOdadanCikildi = () => setIcerdekiOda(null);
    motor.onMasaTeklifi = setMasaTeklifi;
    motor.onKisiSecildi = (id) => {
      setSeciliKisi(id);
      // Oda paneli de sol üstte: kendi karakterini seçince düzenleme düğmesine yer açılır.
      if (id && id === benIdRef.current) setPanelAcik(false);
    };
    motor.onRafDegisti = (acik) => {
      setRafta(acik);
      // Raf ekranın ortasında: oda paneli önünü kapatmasın.
      if (acik) setPanelAcik(false);
    };
    motor.onModulTikla = (odaId, key) => durumRef.current.onModulAc(odaId, key);
    motor.onLioTikla = () => openLio();
    motor.onAjanTikla = () => setAjanAcik(true);
    motor.onNesneDegisti = (odaId: string, nesneId: string, d: NesneDuzeni) => {
      // Eklenen eşyanın türü motorun bildirdiğinde yok: kaybolmasın.
      const yaz = (t: OdaDuzeni | null | undefined): OdaDuzeni => {
        const tur = t?.nesneler[nesneId]?.tur;
        return { nesneler: { ...(t?.nesneler ?? {}), [nesneId]: tur ? { ...d, tur } : d } };
      };
      // Ortak alan düzenlenirken bir odanın eşyası döndürülürse o odanın taslağına yazılır.
      if (odaId === duzenlenenRef.current) setTaslak(yaz);
      else setEkTaslaklar((m) => ({ ...m, [odaId]: yaz(m[odaId] ?? duzenlerRef.current[odaId]) }));
    };
    motor.onNesneSecildi = (id) => setSeciliNesne(id);
    motor.onUyari = (metin) => bildir(metin);
    // Odanın eşyası ortak alana bırakıldı: odadan çıkar (eklenen eşya tümden,
    // varsayılan dekor depoya düşmeden gizlenir), ortak alana şirketin eşyası olarak girer.
    motor.onOrtagaDevir = (odaId, nesneId, ortakta) => {
      // Düzenlenen odanın taslağı ya da (başka bir odaysa) onun ek taslağı güncellenir.
      const guncelle = (hedef: string, f: (d: OdaDuzeni) => OdaDuzeni) => {
        if (hedef === duzenlenenRef.current) setTaslak((t) => f(t ?? { nesneler: {} }));
        else setEkTaslaklar((m) => ({ ...m, [hedef]: f(m[hedef] ?? duzenlerRef.current[hedef] ?? { nesneler: {} }) }));
      };
      guncelle(odaId, (d) => {
        const n = { ...d.nesneler };
        if (nesneId.startsWith("ek:")) delete n[nesneId];
        else n[nesneId] = { dx: 0, dz: 0, don: 0, gizli: true, devir: true };
        return { nesneler: n };
      });
      const id = `ek:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
      guncelle("ortak", (d) => ({ nesneler: { ...d.nesneler, [id]: ortakta } }));
      bildir("Eşya ortak alana taşındı; artık şirketin eşyası");
    };
    motor.onEsyaTikla = (id, ekran) => {
      const r = kap.getBoundingClientRect();
      setSecili({ id, x: ekran.x - r.left, y: ekran.y - r.top });
    };
    motor.onIptal = () => setYerlestirilen(null);
    motor.onYerlestir = ({ id, tur, x, z, don }) => {
      const { kayit: k, puan: p, anahtar: a } = durumRef.current;
      const kat = katalogEsyasi(tur);
      if (!kat) return;
      let yeni: OfisKaydi;
      if (id) {
        yeni = { ...k, esyalar: k.esyalar.map((e) => (e.id === id ? { ...e, x, z, don } : e)) };
      } else {
        if (p < kat.fiyat) return;
        const esya: YerlesikEsya = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, tur, x, z, don };
        yeni = { harcanan: k.harcanan + kat.fiyat, esyalar: [...k.esyalar, esya] };
        motor.kutla(x, z);
        bildir(`${kat.ad} ofise yerleşti`);
      }
      kaydiYaz(a, yeni);
      setKayit(yeni);
      setYerlestirilen(null);
    };
    return () => {
      motor.dispose();
      motorRef.current = null;
    };
  }, []);

  // Motoru kuran etkiden SONRA durmalı: ilk çalışmada motor hazır olsun.
  useEffect(() => {
    if (!motorRef.current) return;
    motorRef.current.ortakGirilebilir = ortakDuzenlenebilir;
    // Ortak alana devretmek ortak alanın düzenini yazmak demek: yalnızca onu düzenleyebilen.
    motorRef.current.ortagaTasinabilir = ortakDuzenlenebilir;
    motorRef.current.devirOdalari = studyo && Array.isArray(duzenleyebilir) ? new Set(duzenleyebilir) : null;
  }, [ortakDuzenlenebilir, studyo, duzenleyebilir]);

  useEffect(() => {
    const m = motorRef.current;
    if (!m || !veriHazir) return;
    m.temalariAyarla(new Map(departmanlar.flatMap((d) => (d.tema ? [[d.id, d.tema] as [string, string]] : []))));
    // Stüdyonun proje istasyonları: ilerleme/teslim değişince panoları tazelenir.
    m.istasyonlariAyarla(
      new Map(
        departmanlar.flatMap((d) => (d.moduller ?? []).flatMap((x) => (x.bilgi ? [[`${d.id}|${x.key}`, x.bilgi] as [string, IstasyonBilgisi]] : [])))
      )
    );
    m.kur(plan, etiketler, sahneKisileri);
  }, [plan, etiketler, sahneKisileri, departmanlar, veriHazir]);

  useEffect(() => {
    motorRef.current?.esyalariKur(kayit.esyalar);
  }, [kayit.esyalar]);

  useEffect(() => {
    const m = motorRef.current;
    if (!m) return;
    m.yerlestirmeModu(yerlestirilen ? { ...yerlestirilen, don: kayit.esyalar.find((e) => e.id === yerlestirilen.id)?.don ?? 0 } : null);
    m.esyalariKur(kayit.esyalar);
    // Yalnızca yerleştirme değişince: eşya listesi değişimini yukarıdaki etki çiziyor.
  }, [yerlestirilen]);

  useEffect(() => {
    motorRef.current?.duzenlemeModu(duzenle);
    if (!duzenle) setSecili(null);
  }, [duzenle]);

  function duzenlemeyeBasla(odaId: string) {
    setDuzenlenen(odaId);
    duzenlenenRef.current = odaId;
    setTaslak(duzenler[odaId] ?? { nesneler: {} });
    setEkTaslaklar({});
    setSeciliNesne(null);
    setPanelAcik(false);
    setMagaza(false);
    setDuzenle(false);
    motorRef.current?.duzenle(odaId);
  }

  function duzenlemeyiBitir() {
    motorRef.current?.duzenle(null);
    setDuzenlenen(null);
    setTaslak(null);
    setEkTaslaklar({});
    duzenlenenRef.current = null;
    setSeciliNesne(null);
  }

  /** Bir odanın düzenini yazar (sunucuya ya da uç yoksa tarayıcıya). */
  async function odaDuzeniniYaz(odaId: string, duzen: OdaDuzeni) {
    const bos = Object.keys(duzen.nesneler).length === 0;
    if (yerelDuzen) {
      setDuzenler((d) => {
        const yeni = { ...d, [odaId]: duzen };
        if (bos) delete yeni[odaId];
        try {
          localStorage.setItem(yerelDuzenAnahtari(yerelKapsam), JSON.stringify(yeni));
        } catch {
          // kota / gizli pencere: bu oturumda yine geçerli
        }
        return yeni;
      });
    } else if (bos) {
      await api.delete(`${duzenUcu}/${odaId}`);
      setDuzenler((d) => {
        const y = { ...d };
        delete y[odaId];
        return y;
      });
    } else {
      const kayitli = await api.post<unknown>(`${duzenUcu}/${odaId}`, duzen);
      setDuzenler((d) => ({ ...d, [odaId]: odaDuzeniTemizle(kayitli) }));
    }
  }

  async function duzeniKaydet() {
    if (!duzenlenen || !taslak) return;
    setKaydediliyor(true);
    try {
      // Önce ortak alan: devredilen eşya oraya yazılmadan odasından silinmesin
      // (sonraki yazım düşerse eşya en kötü iki yerde görünür, kaybolmaz).
      const yazilacak: [string, OdaDuzeni][] = [...Object.entries(ekTaslaklar), [duzenlenen, taslak]];
      yazilacak.sort(([a], [b]) => Number(b === "ortak") - Number(a === "ortak"));
      for (const [odaId, duzen] of yazilacak) await odaDuzeniniYaz(odaId, duzen);
      bildir(yerelDuzen ? "Oda düzeni bu tarayıcıya kaydedildi" : "Oda düzeni kaydedildi; ekip de böyle görecek");
      duzenlemeyiBitir();
    } catch (e) {
      bildir(e instanceof Error ? e.message : "Düzen kaydedilemedi");
    } finally {
      setKaydediliyor(false);
    }
  }

  // Seçili eşyanın menüsü eşyanın tepesine iliştirilir; kamera ve eşya
  // hareket ettikçe her karede yerine taşınır (React durumuna dokunmadan).
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!duzenlenen || !seciliNesne) return;
    let kareNo = 0;
    const kare = () => {
      const k = motorRef.current?.seciliEkranKonumu();
      const el = menuRef.current;
      if (el) {
        el.style.visibility = k ? "visible" : "hidden";
        if (k) {
          el.style.transform = `translate(${Math.round(k.x)}px, ${Math.round(k.y)}px)`;
          // Kenara yakınsa menü öbür yana / yukarı açılır, ekrandan taşmasın.
          const kap = el.parentElement;
          el.classList.toggle("sola", !!kap && k.x > kap.clientWidth - 250);
          el.classList.toggle("yukari", !!kap && k.y > kap.clientHeight - 260);
        }
      }
      kareNo = requestAnimationFrame(kare);
    };
    kare();
    return () => cancelAnimationFrame(kareNo);
  }, [duzenlenen, seciliNesne]);

  /** Ortak alanın eşyasının taşınabileceği odalar (menüdeki "Odaya taşı" listesi). */
  const odaListesi = plan.odalar
    .filter((o) => o.tur === "departman" || o.tur === "toplanti")
    .map((o) => ({ id: o.id, ad: etiketler[o.id]?.ad ?? (o.tur === "toplanti" ? "Toplantı odası" : "Oda") }));

  /** Düzenleyicide nesnenin adı; eklenenlerin adı türünden. */
  const duzenNesneAdi = (id: string) => {
    // Kişinin mağazadan aldığı eşya: adı katalogdan.
    if (id.startsWith("esya:")) {
      const e = kayit.esyalar.find((x) => x.id === id.slice(5));
      return (e && katalogEsyasi(e.tur)?.ad) || "Eşya";
    }
    if (id.startsWith("ek:")) {
      const tur = taslak?.nesneler[id]?.tur;
      return (tur && (katalogEsyasi(tur as EsyaTuru)?.ad ?? MODEL_ADLARI[tur])) || "Eşya";
    }
    // Yönetici masası: planda işaretli.
    if (id.startsWith("masa-") && duzenlenen && plan.odalar.find((o) => o.id === duzenlenen)?.masalar[Number(id.slice(5))]?.patron)
      return "Yönetici masası";
    return nesneAdi(id, modulAdlari);
  };

  function taslaktanCikar(id: string) {
    setTaslak((t) => {
      const n = { ...(t?.nesneler ?? {}) };
      delete n[id];
      return { nesneler: n };
    });
  }

  /** Depodaki eşyayı geri koyar: varsayılan nesne ilk yerine, eklenen eşya bıraktığı yere. */
  function depodanGeriGetir(id: string) {
    if (!id.startsWith("ek:")) return taslaktanCikar(id);
    setTaslak((t) => {
      const once = t?.nesneler[id];
      if (!once) return t;
      const { gizli: _gizli, ...kalan } = once;
      return { nesneler: { ...(t?.nesneler ?? {}), [id]: kalan } };
    });
  }

  function esyaEkle(tur: EsyaTuru) {
    if (!duzenlenen) return;
    const yer = motorRef.current?.eklenecekYer(duzenlenen, tur);
    if (!yer) {
      bildir("Odada bu eşyaya boş yer yok");
      return;
    }
    const id = `ek:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    setTaslak((t) => ({ nesneler: { ...(t?.nesneler ?? {}), [id]: { ...yer, don: 0, tur } } }));
    bildir(`${katalogEsyasi(tur)?.ad ?? "Eşya"} eklendi; tutup istediğin yere sürükle`);
  }

  async function modulKapat(key: string) {
    if (!onModulKapat) return;
    try {
      await onModulKapat(key);
      motorRef.current?.secimiBirak();
      bildir(`${modulAdlari.get(key) ?? "Modül"} kapatıldı; kayıtları duruyor, geri alınabilir`);
    } catch (e) {
      bildir(e instanceof Error ? e.message : "Modül kapatılamadı");
    }
  }

  function satinAl(tur: EsyaTuru) {
    setMagaza(false);
    setSecili(null);
    setYerlestirilen({ tur });
  }

  function sat(id: string) {
    const e = kayit.esyalar.find((x) => x.id === id);
    const kat = e && katalogEsyasi(e.tur);
    if (!e || !kat) return;
    const iade = Math.floor(kat.fiyat * GERI_SATIS_ORANI);
    const yeni = { harcanan: Math.max(0, kayit.harcanan - iade), esyalar: kayit.esyalar.filter((x) => x.id !== id) };
    kaydiYaz(anahtar, yeni);
    setKayit(yeni);
    setSecili(null);
    bildir(`${kat.ad} satıldı: +${iade} puan`);
  }

  const seciliEsya = secili ? kayit.esyalar.find((e) => e.id === secili.id) : undefined;
  const seciliKat = seciliEsya ? katalogEsyasi(seciliEsya.tur) : undefined;
  const yerlestirilenKat = yerlestirilen ? katalogEsyasi(yerlestirilen.tur) : undefined;

  return (
    <div ref={kokRef} className={`of${tam ? " tam-ekran" : ""}${sahteTamEkran ? " sahte-tam" : ""}`}>
      <div ref={kapRef} className="of-sahne" />
      {destekYok && <div className="of-destek">Ofis yüklenemedi. Tarayıcın 3D çizimi (WebGL) desteklemiyor ya da modeller indirilemedi.</div>}
      {(yukleniyor || !veriHazir) && !destekYok && (
        <div className="of-yukleniyor" role="status">
          <span className="of-yk-halka" />
          Ofis kuruluyor…
        </div>
      )}

      <div className="of-hud of-sol-ust">
        <div className="of-seviye" title={`Sonraki seviye: ${seviye.sonraki} puan`}>
          <span className="of-sv-rozet">{seviye.seviye}</span>
          <span className="of-sv-yazi">
            <small>Ofis seviyesi</small>
            <span className="of-sv-bar">
              <span style={{ width: `${Math.round(seviye.ilerleme * 100)}%` }} />
            </span>
          </span>
        </div>
        <div className="of-puan" title={`Tamamlanan her görev ${kazanilanPuan(1)} puan`}>
          <span className="of-coin" />
          <b>{puan.toLocaleString("tr-TR")}</b>
          <small>puan</small>
        </div>
      </div>

      <div className="of-hud of-sag-ust">
        <button type="button" className={`of-btn${duzenle ? " on" : ""}`} onClick={() => setDuzenle((d) => !d)} aria-pressed={duzenle}>
          {duzenle ? "Bitti" : "Düzenle"}
        </button>
        <button type="button" className="of-btn birincil" onClick={() => setMagaza((m) => !m)}>
          Mağaza
        </button>
        <button type="button" className="of-btn ikon" onClick={() => motorRef.current?.kamerayiSifirla()} aria-label="Görünümü sıfırla" title="Görünümü sıfırla">
          ⟲
        </button>
        <button
          type="button"
          className="of-btn ikon"
          onClick={tamEkranCevir}
          aria-label={tam ? "Tam ekrandan çık" : "Tam ekran"}
          title={tam ? "Tam ekrandan çık (Esc)" : "Tam ekran"}
        >
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {tam ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
          </svg>
        </button>
      </div>

      {gorunenHareketler.length > 0 && !yerlestirilen && !icerdekiOda && (
        akisAcik ? (
          <div className="of-hud of-akis" aria-label="Son hareketler">
            <div className="of-akis-bas">
              <span>Son hareketler</span>
              <button type="button" onClick={() => setAkisAcik(false)} aria-label="Son hareketleri gizle" title="Gizle">
                ×
              </button>
            </div>
            <ul>
              {gorunenHareketler.map((h, i) => (
                <li key={h.id} style={{ animationDelay: `${i * 0.12}s` }}>
                  <span className="of-tik">✓</span>
                  <span className="of-akis-yazi">
                    <b>{h.kim}</b> {h.ne}
                  </span>
                  <span className="of-arti">+{kazanilanPuan(1)}</span>
                  <button
                    type="button"
                    className="of-akis-kapat"
                    onClick={() => setKapatilanlar((k) => new Set(k).add(h.id))}
                    aria-label={`${h.ne} bildirimini kapat`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <button type="button" className="of-hud of-akis-ac" onClick={() => setAkisAcik(true)}>
            <span className="of-tik">✓</span>
            Son hareketler
            <b>{gorunenHareketler.length}</b>
          </button>
        )
      )}

      {ipucuAcik && !yerlestirilen && !yukleniyor && !destekYok && (
        <div className="of-hud of-gezinme" aria-hidden="true">
          <b>Sürükle</b> kaydır · <b>Sağ tık</b> ya da <b>iki parmakla tıkla-sürükle</b> döndür
          <br />
          <b>Tekerlek</b> yaklaş · <b>Ok tuşları</b> gez · <b>Odaya tıkla</b> içeri gir
          <br />
          <b>Kişiye, sonra bir yere ya da koltuğa tıkla</b> oraya yürüsün, otursun
        </div>
      )}

      {yerlestirilen && (
        <div className="of-hud of-ipucu">
          <span>
            {SIMGE[yerlestirilen.tur]} <b>{yerlestirilenKat?.ad}</b> — yerleştirmek için zemine tıkla
          </span>
          <button type="button" className="of-btn" onClick={() => motorRef.current?.dondur()}>
            Döndür (R)
          </button>
          <button type="button" className="of-btn" onClick={() => setYerlestirilen(null)}>
            Vazgeç
          </button>
        </div>
      )}

      {duzenle && !yerlestirilen && !secili && <div className="of-hud of-ipucu sade">Taşımak ya da satmak için bir eşyaya tıkla</div>}

      {secili && seciliKat && (
        <div className="of-hud of-secim" style={{ left: secili.x, top: secili.y }}>
          <b>
            {SIMGE[seciliKat.tur]} {seciliKat.ad}
          </b>
          <div>
            <button type="button" className="of-btn" onClick={() => (setYerlestirilen({ tur: seciliKat.tur, id: secili.id }), setSecili(null))}>
              Taşı
            </button>
            <button type="button" className="of-btn tehlike" onClick={() => sat(secili.id)}>
              Sat +{Math.floor(seciliKat.fiyat * GERI_SATIS_ORANI)}
            </button>
            <button type="button" className="of-btn ikon" onClick={() => setSecili(null)} aria-label="Kapat">
              ×
            </button>
          </div>
        </div>
      )}

      <aside className={`of-magaza${magaza ? " acik" : ""}`} aria-hidden={!magaza}>
        <div className="of-m-bas">
          <h3>Mağaza</h3>
          <button type="button" className="of-btn ikon" onClick={() => setMagaza(false)} aria-label="Kapat">
            ×
          </button>
        </div>
        <p className="of-m-not">Ekibin bitirdiği her görev ofise {kazanilanPuan(1)} puan kazandırır.</p>
        <div className="of-m-sekmeler" role="tablist" aria-label="Eşya türü">
          {KATEGORILER.map((k) => (
            <button
              key={k.key}
              type="button"
              role="tab"
              aria-selected={magazaKategorisi === k.key}
              className={magazaKategorisi === k.key ? "on" : ""}
              onClick={() => setMagazaKategorisi(k.key)}
              tabIndex={magaza ? 0 : -1}
            >
              {k.ad}
            </button>
          ))}
        </div>
        <div className="of-m-liste">
          {KATALOG.filter((k) => k.kategori === magazaKategorisi).map((k) => {
            const kilitli = seviye.seviye < k.seviye;
            const yetmez = puan < k.fiyat;
            return (
              <button key={k.tur} type="button" className="of-urun" disabled={kilitli || yetmez} onClick={() => satinAl(k.tur)} tabIndex={magaza ? 0 : -1}>
                <span className="of-u-simge">
                  {resimler[k.tur] ? <img src={resimler[k.tur]} alt="" className={kilitli ? "kilitli" : ""} /> : SIMGE[k.tur]}
                  {kilitli && <span className="of-u-kilit">🔒</span>}
                </span>
                <b>{k.ad}</b>
                <small className={yetmez && !kilitli ? "eksik" : ""}>{kilitli ? `Seviye ${k.seviye}` : <><span className="of-coin sm" />{k.fiyat}</>}</small>
              </button>
            );
          })}
        </div>
      </aside>

      {duzenlenen && taslak && (
        <DuzenCubugu
          odaAdi={etiketler[duzenlenen]?.ad ?? (duzenlenen === "ortak" ? "Ortak alan" : "Oda")}
          taslak={taslak}
          adi={duzenNesneAdi}
          yerel={yerelDuzen}
          kaydediliyor={kaydediliyor}
          resimler={resimler}
          onEkle={esyaEkle}
          onGeriGetir={depodanGeriGetir}
          onSil={taslaktanCikar}
          onSifirla={() => {
            motorRef.current?.duzenle(duzenlenen);
            setSeciliNesne(null);
            setTaslak({ nesneler: {} });
          }}
          onVazgec={duzenlemeyiBitir}
          onKaydet={duzeniKaydet}
        />
      )}

      {duzenlenen && taslak && seciliNesne && (
        <NesneMenusu
          key={seciliNesne}
          baskaOdanin={!!motorRef.current?.seciliBaskaOdanin()}
          konumRef={menuRef}
          ad={duzenNesneAdi(seciliNesne)}
          nesneId={seciliNesne}
          tasinabilir={!!motorRef.current?.seciliOrtagaGidebilir()}
          ortakta={!!motorRef.current?.seciliOrtakta()}
          odalar={duzenlenen === "ortak" ? odaListesi : undefined}
          bolgeId={motorRef.current?.seciliBolgesi() ?? null}
          varsayilandanFarkli={!seciliNesne.startsWith("ek:") && !seciliNesne.startsWith("esya:") && !!taslak.nesneler[seciliNesne]}
          modulKapatabilir={!!onModulKapat && duzenleyebilir === "hepsi"}
          onDondur={(derece) => motorRef.current?.seciliyiDondur(derece)}
          onTasi={(hedef) => motorRef.current?.seciliyiTasi(hedef)}
          onVarsayilan={() => taslaktanCikar(seciliNesne)}
          onDepo={() => motorRef.current?.seciliyiKaldir()}
          onModulAc={() => onModulAc(duzenlenen, seciliNesne.slice(6))}
          onModulKapat={() => modulKapat(seciliNesne.slice(6))}
          onKapat={() => motorRef.current?.secimiBirak()}
        />
      )}

      {karakterTaslagi && (
        <KarakterDuzenleyici
          gorunum={karakterTaslagi.g}
          varsayilanModel={varsayilanModel}
          kaydediliyor={karakterKaydediliyor}
          onDegis={(g) => setKarakterTaslagi({ g })}
          onKaydet={() => void karakteriKaydet()}
          onVazgec={() => setKarakterTaslagi(null)}
        />
      )}

      {rafta && !duzenlenen && (
        <div className="of-hud of-oda-mini">
          <span className="of-raf-ipucu">
            {rafta === "pano" ? "Panoya yine tıkla, projeyi aç · ‹ › ile yandaki panoya geç" : "Bir plakete tıkla, projeyi aç"}
          </span>
          {rafta === "pano" && (motorRef.current?.panoSayisi ?? 0) > 1 && (
            <>
              <button type="button" className="of-btn" aria-label="Soldaki pano" onClick={() => motorRef.current?.yandakiPano(-1)}>
                ‹
              </button>
              <button type="button" className="of-btn" aria-label="Sağdaki pano" onClick={() => motorRef.current?.yandakiPano(1)}>
                ›
              </button>
            </>
          )}
          <button type="button" className="of-btn" onClick={() => motorRef.current?.raftanCik()}>
            {rafta === "pano" ? "Geri dön" : "Raftan çık"}
          </button>
        </div>
      )}

      {!(icerdekiOda && !panelAcik) && karakterDugmesi && <div className="of-hud of-oda-mini">{karakterDugmesi}</div>}
      {masaTeklifi && seciliKisi === benId && (
        <button
          type="button"
          className="of-btn birincil of-masa-teklifi"
          style={{ left: masaTeklifi.x, top: masaTeklifi.y }}
          onClick={() => void calismaMasasiYap()}
          disabled={masaKaydediliyor}
        >
          {masaKaydediliyor ? "Kaydediliyor…" : "Çalışma masası yap"}
        </button>
      )}

      {icerdekiOda && !panelAcik && !duzenlenen && !rafta && (
        <div className="of-hud of-oda-mini">
          <button type="button" className="of-btn" onClick={() => setPanelAcik(true)}>
            {etiketler[icerdekiOda]?.ad ?? "Oda"}
          </button>
          <button
            type="button"
            className="of-btn"
            onClick={() => {
              motorRef.current?.odadanCik();
              setIcerdekiOda(null);
            }}
          >
            Ofise dön
          </button>
          {karakterDugmesi}
        </div>
      )}

      {icerdekiOda && panelAcik && !duzenlenen && (
        <OdaPaneli
          odaId={icerdekiOda}
          departman={departmanlar.find((d) => d.id === icerdekiOda)}
          etiket={etiketler[icerdekiOda]}
          cevrimici={cevrimici}
          benId={benId}
          bugunToplanti={bugunToplanti}
          studyo={studyo}
          onSayfa={icerdekiOda === "ortak" ? undefined : () => onOdaSayfasi(icerdekiOda)}
          onModul={(key) => onModulAc(icerdekiOda, key)}
          onDuzenle={odaDuzenlenebilir(icerdekiOda) ? () => duzenlemeyeBasla(icerdekiOda) : undefined}
          onKapat={() => setPanelAcik(false)}
          onCik={() => {
            motorRef.current?.odadanCik();
            setIcerdekiOda(null);
          }}
        />
      )}

      {bildiri && (
        <div className="of-bildiri" role="status">
          {bildiri}
        </div>
      )}

      {ajanAcik && <AjanPaneli onClose={() => setAjanAcik(false)} onDurum={setAjanDurumu} />}
    </div>
  );
}

function OdaPaneli({
  odaId,
  departman,
  etiket,
  cevrimici,
  benId,
  bugunToplanti,
  studyo,
  onSayfa,
  onModul,
  onDuzenle,
  onKapat,
  onCik,
}: {
  odaId: string;
  departman?: OyunDepartmani;
  etiket?: OdaEtiketi;
  cevrimici: Set<string>;
  benId?: string;
  bugunToplanti: number | null;
  studyo: boolean;
  /** Odanın sayfası (ortak alanın sayfası yok). */
  onSayfa?: () => void;
  onModul: (key: string) => void;
  /** Odayı düzenleme (yalnızca yetkisi olana verilir). */
  onDuzenle?: () => void;
  onKapat: () => void;
  onCik: () => void;
}) {
  const toplanti = odaId === "toplanti";
  // Stüdyoda projeler ayrı listelenir; kupa rafı listede yer almaz (odada durur).
  const projeler = (departman?.moduller ?? []).filter((m) => m.key.startsWith(PROJE_ONEKI));
  const digerModuller = (departman?.moduller ?? []).filter((m) => !m.key.startsWith(PROJE_ONEKI) && m.key !== KUPA_RAFI);
  return (
    <div className="of-hud of-oda-paneli" role="dialog" aria-label={etiket?.ad ?? "Oda"}>
      <div className="of-op-bas">
        <span className={`of-op-ikon t-${etiket?.ton ?? "gri"}`} style={etiket?.kapak ? { background: etiket.kapak } : undefined} />
        <div>
          <h3>{etiket?.ad ?? (odaId === "ortak" ? "Ortak alan" : "Oda")}</h3>
          <small>{toplanti ? (bugunToplanti ? `Bugün ${bugunToplanti} toplantı` : "Bugün toplantı yok") : etiket?.alt}</small>
        </div>
        <button type="button" className="of-btn ikon" onClick={onKapat} aria-label="Paneli kapat" title="Paneli kapat">
          ×
        </button>
      </div>
      {departman && (
        <>
          <div className="of-op-sayilar">
            <span>
              <b>{departman.kisiler.length}</b>
              <small>kişi</small>
            </span>
            <span>
              <b>{departman.acikGorev}</b>
              <small>açık görev</small>
            </span>
            <span className={departman.gecikmis ? "gec" : ""}>
              <b>{departman.gecikmis}</b>
              <small>gecikmiş</small>
            </span>
          </div>
          {projeler.length > 0 && (
            <div className="of-op-projeler">
              <small>Projeler</small>
              <ul>
                {projeler.map((m) => (
                  <li key={m.key}>
                    <button type="button" onClick={() => onModul(m.key)}>
                      <span>{m.ad}</span>
                      {m.bilgi && (
                        <small className={m.bilgi.gecikti ? "gec" : m.bilgi.yaklasti ? "yakin" : ""}>
                          {m.bilgi.biten}/{m.bilgi.toplam}
                          {m.bilgi.teslim && ` · ${m.bilgi.gecikti ? "gecikti" : new Date(m.bilgi.teslim + "T00:00").toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}`}
                        </small>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {digerModuller.length > 0 && (
            <div className="of-op-moduller">
              <small>Modüller</small>
              <div>
                {digerModuller.map((m) => (
                  <button key={m.key} type="button" onClick={() => onModul(m.key)}>
                    {m.ad}
                  </button>
                ))}
              </div>
            </div>
          )}
          {departman.kisiler.length > 0 && (
            <ul className="of-op-kisiler">
              {departman.kisiler.slice(0, 8).map((k) => (
                <li key={k.id}>
                  <i className={k.id === benId ? "ben" : cevrimici.has(k.id) ? "acik" : ""} />
                  {k.ad}
                  {k.id === benId && <small> (sen)</small>}
                </li>
              ))}
              {departman.kisiler.length > 8 && <li className="daha">+{departman.kisiler.length - 8} kişi daha</li>}
            </ul>
          )}
        </>
      )}
      <div className="of-op-dugmeler">
        {onDuzenle && (
          <button type="button" className="of-btn" onClick={onDuzenle} title="Masaları ve eşyaları taşı, döndür, kaldır">
            Odayı düzenle
          </button>
        )}
        {onSayfa && (
          <button type="button" className="of-btn birincil" onClick={onSayfa}>
            {toplanti ? "Takvimi aç" : studyo ? "İş sayfasını aç" : "Departman sayfasını aç"}
          </button>
        )}
        <button type="button" className="of-btn" onClick={onCik}>
          Ofise dön
        </button>
      </div>
    </div>
  );
}

/** Oda düzenleyicisinin çubuğu: ipucu, eşya ekleme, depo, kaydet. Seçili eşyanın işleri kendi menüsünde. */
function DuzenCubugu({
  odaAdi,
  taslak,
  adi,
  yerel,
  kaydediliyor,
  resimler,
  onEkle,
  onGeriGetir,
  onSil,
  onSifirla,
  onVazgec,
  onKaydet,
}: {
  odaAdi: string;
  taslak: OdaDuzeni;
  adi: (id: string) => string;
  yerel: boolean;
  kaydediliyor: boolean;
  resimler: Partial<Record<EsyaTuru, string>>;
  onEkle: (tur: EsyaTuru) => void;
  onGeriGetir: (id: string) => void;
  /** Eklenen eşyayı düzenden tümden siler (varsayılanlar silinmez, depoda bekler). */
  onSil: (id: string) => void;
  onSifirla: () => void;
  onVazgec: () => void;
  onKaydet: () => void;
}) {
  const [ekleme, setEkleme] = useState(false);
  const depo = Object.entries(taslak.nesneler)
    // Ortak alana devredilenler odanın deposunda değil, ortak alanda.
    .filter(([, d]) => d.gizli && !d.devir)
    .map(([id]) => id);
  return (
    <div className="of-hud of-duzen" role="toolbar" aria-label={`${odaAdi} düzenleniyor`}>
      <div className="of-dz-bas">
        <b>{odaAdi}</b>
        <small>Düzenliyorsun</small>
      </div>
      <p className="of-dz-ipucu">
        Bir eşyayı tutup sürükle. Tıklayınca üstünde <b>⋯</b> menüsü çıkar: döndür, depoya gönder, ortak alana taşı. Kısayollar: Q / E 45°, R 90°,
        Delete depoya.
      </p>
      <button type="button" className={`of-btn of-dz-ekle${ekleme ? " on" : ""}`} onClick={() => setEkleme((e) => !e)} aria-expanded={ekleme}>
        ＋ Eşya ekle
      </button>
      {ekleme && (
        <div className="of-dz-katalog" role="list">
          {KATALOG.map((k) => (
            <button
              key={k.tur}
              type="button"
              role="listitem"
              onClick={() => {
                onEkle(k.tur);
                setEkleme(false);
              }}
              title={`${k.ad} ekle`}
            >
              {resimler[k.tur] ? <img src={resimler[k.tur]} alt="" /> : <span aria-hidden="true">{SIMGE[k.tur]}</span>}
              <small>{k.ad}</small>
            </button>
          ))}
        </div>
      )}
      {depo.length > 0 && (
        <div className="of-dz-kaldirilan">
          <small>Depo</small>
          {depo.map((id) => (
            <span key={id} className="of-dz-depo">
              <button type="button" onClick={() => onGeriGetir(id)} title="Odaya geri koy">
                {adi(id)} <span aria-hidden="true">↺</span>
              </button>
              {id.startsWith("ek:") && (
                <button type="button" className="sil" onClick={() => onSil(id)} title="Tümden sil" aria-label={`${adi(id)}: tümden sil`}>
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {yerel && <p className="of-dz-not">Ekip kaydı henüz yayında değil; düzen şimdilik yalnızca bu tarayıcıda saklanır.</p>}
      <div className="of-dz-alt">
        <button type="button" className="of-btn" onClick={onSifirla} title="Odayı ilk düzenine döndür (eklenenler de gider)">
          Varsayılan
        </button>
        <button type="button" className="of-btn" onClick={onVazgec}>
          Vazgeç
        </button>
        <button type="button" className="of-btn birincil" onClick={onKaydet} disabled={kaydediliyor}>
          {kaydediliyor ? "Kaydediliyor…" : "Kaydet"}
        </button>
      </div>
    </div>
  );
}

/**
 * Düzenleyicide seçili eşyanın tepesindeki ⋯ düğmesi ve açılan menüsü.
 * Yeri her karede dışarıdan (konumRef) verilir.
 */
function NesneMenusu({
  konumRef,
  ad,
  nesneId,
  tasinabilir,
  baskaOdanin,
  ortakta,
  odalar,
  bolgeId,
  varsayilandanFarkli,
  modulKapatabilir,
  onDondur,
  onTasi,
  onVarsayilan,
  onDepo,
  onModulAc,
  onModulKapat,
  onKapat,
}: {
  konumRef: React.RefObject<HTMLDivElement>;
  ad: string;
  nesneId: string;
  /** Odadan ortak alana çıkarılabilir mi (modül eşyası değil, ortak alanın kendisi düzenlenmiyor). */
  tasinabilir: boolean;
  /** Ortak alan düzenlenirken tutulan bir odanın eşyası: yalnızca döndürülür ya da ortak alana alınır. */
  baskaOdanin: boolean;
  ortakta: boolean;
  /** Ortak alan düzenlenirken: eşyanın konabileceği odalar. */
  odalar?: { id: string; ad: string }[];
  /** Eşyanın şu an bulunduğu bölge (oda kimliği ya da "ortak"). */
  bolgeId: string | null;
  varsayilandanFarkli: boolean;
  modulKapatabilir: boolean;
  /** Artı derece saat yönünde. */
  onDondur: (derece: number) => void;
  /** "ortak", "oda" (odasına geri) ya da bir oda kimliği. */
  onTasi: (hedef: string) => void;
  onVarsayilan: () => void;
  onDepo: () => void;
  onModulAc: () => void;
  onModulKapat: () => void;
  onKapat: () => void;
}) {
  const [acik, setAcik] = useState(false);
  const [kapatOnay, setKapatOnay] = useState(false);
  const [odaSec, setOdaSec] = useState(false);
  // Kasa modül eşyası gibi davranır ama bir modül değil: kapatılamaz.
  const kasa = nesneId === `modul:${KASA_MODULU}`;
  const proje = nesneId.startsWith(`modul:${PROJE_ONEKI}`);
  const kupa = nesneId === `modul:${KUPA_RAFI}`;
  const modul = nesneId.startsWith("modul:");
  const masa = nesneId.startsWith("masa-");
  // Mağazadan alınan eşya kişiseldir: ekibin deposuna gitmez (Düzenle > Sat ile satılır).
  const kisisel = nesneId.startsWith("esya:");
  return (
    <div ref={konumRef} className="of-nm" style={{ visibility: "hidden" }}>
      <button
        type="button"
        className={`of-nm-dugme${acik ? " on" : ""}`}
        onClick={() => setAcik((a) => !a)}
        aria-expanded={acik}
        aria-label={`${ad}: seçenekler`}
        title={`${ad}: seçenekler`}
      >
        ⋯
      </button>
      {acik && (
        <div className="of-nm-menu" role="menu" aria-label={ad}>
          <div className="of-nm-bas">
            <b>{ad}</b>
            <button type="button" className="of-btn ikon" onClick={onKapat} aria-label="Seçimi bırak">
              ×
            </button>
          </div>
          <div className="of-nm-donus" role="group" aria-label="Döndür">
            <button type="button" className="of-btn" onClick={() => onDondur(-45)} title="45° sola (Q)">
              <span aria-hidden="true">↺</span> 45°
            </button>
            <button type="button" className="of-btn" onClick={() => onDondur(45)} title="45° sağa (E)">
              <span aria-hidden="true">↻</span> 45°
            </button>
            <button type="button" className="of-btn" onClick={() => onDondur(90)} title="90° sağa (R)">
              <span aria-hidden="true">↻</span> 90°
            </button>
          </div>
          {tasinabilir && (
            <button type="button" role="menuitem" onClick={() => onTasi(ortakta ? "oda" : "ortak")}>
              {ortakta ? "Odasına geri getir" : "Ortak alana taşı"}
            </button>
          )}
          {odalar && !modul && !baskaOdanin && bolgeId && bolgeId !== "ortak" && (
            <button type="button" role="menuitem" onClick={() => onTasi("ortak")}>
              Ortak alana geri getir
            </button>
          )}
          {odalar && !modul && !baskaOdanin && (
            <button type="button" role="menuitem" onClick={() => setOdaSec((a) => !a)} aria-expanded={odaSec}>
              Odaya taşı {odaSec ? "▾" : "▸"}
            </button>
          )}
          {odalar && !modul && odaSec && (
            <div className="of-nm-odalar" role="group" aria-label="Taşınacak oda">
              {odalar
                .filter((o) => o.id !== bolgeId)
                .map((o) => (
                  <button key={o.id} type="button" onClick={() => onTasi(o.id)}>
                    {o.ad}
                  </button>
                ))}
            </div>
          )}
          {varsayilandanFarkli && !baskaOdanin && (
            <button type="button" role="menuitem" onClick={onVarsayilan}>
              İlk yerine döndür
            </button>
          )}
          {modul && (
            <button type="button" role="menuitem" onClick={onModulAc}>
              {kasa ? "Kasayı aç" : proje ? "Projeyi aç" : kupa ? "İşi aç" : "Modülü aç"}
            </button>
          )}
          {kisisel && <small className="of-nm-not">Senin eşyan: yeri yalnızca sende kaydedilir.</small>}
          {baskaOdanin && <small className="of-nm-not">Odanın eşyası: ortak alana alınca şirketin eşyası olur.</small>}
          {!kisisel && !baskaOdanin && (
          <button
            type="button"
            role="menuitem"
            onClick={onDepo}
            disabled={masa}
            title={masa ? "Masada oturan biri olabilir; masalar depoya gönderilemez, taşınabilir" : "Odadan kaldırır; çubuktaki Depo'dan geri konur (Delete)"}
          >
            Depoya gönder
          </button>
          )}
          {modul && !kasa && !proje && !kupa && modulKapatabilir && !kapatOnay && (
            <button type="button" role="menuitem" className="tehlike" onClick={() => setKapatOnay(true)}>
              Modülü kapat…
            </button>
          )}
          {modul && kapatOnay && (
            <div className="of-nm-onay">
              <small>Modül şirkette kapanır; kayıtları silinmez, yeniden açılabilir.</small>
              <div>
                <button type="button" className="of-btn" onClick={() => setKapatOnay(false)}>
                  Vazgeç
                </button>
                <button type="button" className="of-btn tehlike" onClick={onModulKapat}>
                  Kapat
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
