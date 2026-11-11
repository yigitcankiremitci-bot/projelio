import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  ODEME_YONTEMI_ETIKET,
  ODEME_YONTEMLERI,
  kalanTutar,
  siparisDurumu,
  siparisAyi,
  tahsilatRaporu,
  tahsilEdilen,
  type MusteriSiparisi,
  type OdemeYontemi,
  type TahsilatRaporSatiri,
} from "@projelio/shared";
import { siparisApi } from "../../api/party";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";
import { fmtPara } from "../butce/butceBicim";
import { IconUpload, IconWallet } from "../icons";
import { listeCercevesi } from "../../lib/listeStili";
import { FiltreBasligi, FiltreBolumu, SecimListesi, filtrePaneliStili } from "./FiltrePaneli";
import { useIsWide } from "../../lib/useIsDesktop";
import Modal from "../Modal";
import SiparisFormu from "./SiparisFormu";
import SiparisKarti, { SiparisAyrintisi } from "./SiparisKarti";
import SatisKanallari from "./SatisKanallari";
import SiparisExcelModal from "./SiparisExcelModal";
import { PARTY_SURUKLE } from "../BaglantiListeleri";
import { ayEtiketi, bugunYerel } from "./siparisOrtak";
import { gunFarki } from "./SiparisKarti";
import { IconChevronDown } from "../icons";
import { onayla } from "../../lib/onay";

type DurumSuzgeci = "acik" | "yaklasan" | "gecikti" | "tahsil_edildi" | "hepsi";
/** Fatura süzgeci: "yok" = faturası kesilmemiş (iptal hariç), "var" = faturalı. */
type FaturaSuzgeci = "" | "yok" | "var";
/** Ay süzgecinde "tüm aylar" seçeneğinin değeri (state'te boş dize). */
const TUM_AYLAR = "__tum";
/** Vadesi bu kadar gün içinde olan açık sipariş "yaklaşan" sayılır. */
const YAKLASAN_GUN = 7;

/** Uzun listede (bir yılın siparişleri) tek seferde çizilen kart sayısı. */
const SAYFA = 100;
type Siralama = "yeni" | "eski" | "tutar" | "vade" | "ad";
const SIRALAMALAR: Siralama[] = ["yeni", "eski", "tutar", "vade", "ad"];
// dil:anahtar-baslangic — etiketler; çeviri kullanım yerinde (t())
const SIRALAMA_ETIKET: Record<Siralama, string> = {
  yeni: "Sipariş tarihi (yeni)",
  eski: "Sipariş tarihi (eski)",
  tutar: "Tutar (büyükten)",
  vade: "Vade tarihi (yakın)",
  ad: "Alıcı (A–Z)",
};
// dil:anahtar-bitis
/** Seçilen sıralama tarayıcıda hatırlanır (müşteri listesindeki gibi). */
const SIRALAMA_ANAHTARI = "projelio_tahsilat_siralama";

function siralamaOku(): Siralama {
  try {
    const v = localStorage.getItem(SIRALAMA_ANAHTARI) as Siralama | null;
    return v && SIRALAMALAR.includes(v) ? v : "yeni";
  } catch {
    return "yeni";
  }
}

/** Kim: müşteri kartı ya da (müşterisiz siparişte) alıcı. Arama ve A–Z sırası buradan. */
function kimAdi(s: MusteriSiparisi): string {
  return s.partyName ?? s.alici?.ad ?? "";
}

/** Kanal süzgecinde "kanalı yok" seçeneği. */
const KANALSIZ = "\u0000";

/**
 * Tahsilat takibi — Müşteriler ekranının ikinci görünümü.
 *
 * Çalışan için: bu ay vadesi gelen, kendisine atanmış müşterilerin
 * siparişleri; "tahsil et" tek tık. Yönetici için ek olarak çalışan × ay
 * raporu ve sorumlu süzgeci. Kimin neyi göreceğine SUNUCU karar veriyor
 * (bkz. backend party/siparis-erisim.ts); burada yalnızca gösterim var.
 *
 * Ay, SİPARİŞ ayıdır (kullanıcı isteği, 2026-10-20 — önceden vade ayıydı):
 * kargo dökümüyle karşılaştırılan şey siparişin ayı. Rapor da aynı eksenle
 * (tahsilatRaporu "siparis") — ikisi farklı ay tanımı kullansaydı liste ile
 * rapor aynı ay için farklı rakam gösterirdi. Gecikme yine vadeden hesaplanır.
 *
 * Satış kanalı (migration 168): süzgeç + yönetici için kanal kırılımı.
 * Muhasebe pazaryerinin ödemesini görünce o kanalın siparişlerini seçip
 * toplu "tahsil edildi" der; her biri kasaya ayrı gelir satırı yazar.
 */
export default function TahsilatTakibi({
  kapsamYolu,
  departmentId,
  sorumluSecenekleri = [],
  musteriSecenekleri = [],
  yeniSiparisIstegi = 0,
  fabVar = false,
  partySuzgeci,
  surukle = false,
  filtreSolda: filtreSoldaIstegi = false,
  acilacakSiparis,
}: {
  /** Bildirimden gelindi: bu sipariş yüklenince ayrıntısı açılır (bkz. CustomersPanel ?siparis=). */
  acilacakSiparis?: { id: string; n: number } | null;
  /**
   * Filtreler listenin solunda sabit bir sütunda (Müşteriler sekmesiyle aynı
   * düzen); değilse "Süz" penceresinde. Panelin genişliğine göre üst bileşen verir.
   */
  filtreSolda?: boolean;
  /**
   * Seçili müşteri listesinin (migration 170) kartları: verilirse yalnızca
   * onların siparişleri — rapor ve özet de o listeye göre. Müşterisiz
   * (kanal alıcısı) siparişler bir listeye ait olmadığı için düşer.
   */
  partySuzgeci?: Set<string>;
  /** Satır liste sekmesine sürüklenebilir (siparişin müşterisi taşınır). */
  surukle?: boolean;
  kapsamYolu: string;
  departmentId?: string;
  /** Yeni siparişin müşteri seçicisi (müşteri defteri; çalışana kendi müşterileri). */
  musteriSecenekleri?: { id: string; ad: string }[];
  /**
   * Sayfanın "+" düğmesi bu sekmede yeni sipariş açar: her basışta sayaç
   * artar (CustomersPanel). Sayaç olmasının nedeni: aynı değerle iki basış
   * da formu açabilsin.
   */
  yeniSiparisIstegi?: number;
  /** Sayfada "+" yoksa (modal içi vb.) form için yedek düğme gösterilir. */
  fabVar?: boolean;
  /** Kanal sorumlusu seçicisi (müşteri kartının sorumlu listesiyle aynı). */
  sorumluSecenekleri?: { id: string; ad: string }[];
}) {
  const c = useThemeColors();
  const t = useT();
  const bugun = bugunYerel();
  const buAy = bugun.slice(0, 7);

  const [siparisler, setSiparisler] = useState<MusteriSiparisi[] | null>(null);
  const [yonetici, setYonetici] = useState(false);
  const [hata, setHata] = useState("");
  const [ay, setAy] = useState(buAy);
  // Varsayılan "Hepsi" (kullanıcı isteği, 2026-10-20): "Açık olanlar" ile
  // açılınca, siparişleri tahsil edilmiş bir şirkette sekme boş görünüyordu.
  const [durum, setDurum] = useState<DurumSuzgeci>("hepsi");
  const [sorumlu, setSorumlu] = useState("");
  const [kanal, setKanal] = useState("");
  const [fatura, setFatura] = useState<FaturaSuzgeci>("");
  const [raporAcik, setRaporAcik] = useState(false);
  const [raporTuru, setRaporTuru] = useState<"calisan" | "kanal">("calisan");
  const [arama, setArama] = useState("");
  const [siralama, setSiralamaDurumu] = useState<Siralama>(siralamaOku);
  const setSiralama = (v: Siralama) => {
    setSiralamaDurumu(v);
    try {
      localStorage.setItem(SIRALAMA_ANAHTARI, v);
    } catch {
      // Tarayıcı depolaması kapalıysa sıralama yalnızca bu oturumda kalır.
    }
  };
  const genisEkran = useIsWide();
  const [gosterilen, setGosterilen] = useState(SAYFA);
  const [secili, setSecili] = useState<Set<string>>(new Set());
  const [toplu, setToplu] = useState<{ tarih: string; yontem: OdemeYontemi | "" } | null>(null);
  const [topluSonuc, setTopluSonuc] = useState("");
  const [isleniyor, setIsleniyor] = useState(false);
  const [panel, setPanel] = useState<"yeni" | "kanallar" | null>(null);
  const [excel, setExcel] = useState(false);
  const [yenile, setYenile] = useState(0);
  const [suzAcik, setSuzAcik] = useState(false);
  // Ayrıntısı açık sipariş: geniş alanda sağdaki panelde, darda pencerede
  // (Müşteriler'in kart paneliyle aynı düzen — kullanıcı isteği, 2026-11-11).
  // `n` her açılışta artar: aynı siparişte "Tahsil et"e yeniden basmak formu
  // yeniden açabilsin (ayrıntı bu anahtarla baştan kurulur).
  const [acikSiparis, setAcikSiparis] = useState<{ id: string; mod: "tahsil" | null; n: number } | null>(null);
  // Bileşenin kendi genişliği: sağ panel ancak sığıyorsa açılır. Kök ilk
  // çizimde yükleniyor yazısı olduğu için ref değil durum (callback ref).
  const [kokEl, setKokEl] = useState<HTMLDivElement | null>(null);
  const [genislik, setGenislik] = useState(0);
  useEffect(() => {
    if (!kokEl || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setGenislik(Math.round(e.contentRect.width)));
    ro.observe(kokEl);
    return () => ro.disconnect();
  }, [kokEl]);
  const organizationId = /^\/organizations\/([^/]+)/.exec(kapsamYolu)?.[1];
  useEffect(() => {
    if (yeniSiparisIstegi > 0) setPanel("yeni");
  }, [yeniSiparisIstegi]);

  // Liste yalnızca KAPSAM değişince boşaltılır. Tazelemede (kanal düzenlendi,
  // toplu tahsilat, içe aktarma) boşaltılsaydı ekran "Yükleniyor"a düşer, açık
  // kanal paneli sökülür ve kullanıcı bir kutudan ötekine geçerken sayfa
  // yenilenmiş gibi olurdu — yazdığı değerin yarısı kaydedilip kalırdı.
  const yuklenenKapsam = useRef("");
  useEffect(() => {
    let iptal = false;
    const kapsam = `${kapsamYolu}|${departmentId ?? ""}`;
    if (yuklenenKapsam.current !== kapsam) setSiparisler(null);
    yuklenenKapsam.current = kapsam;
    siparisApi
      .kapsamdakiler(kapsamYolu, departmentId)
      .then((r) => {
        if (iptal) return;
        setSiparisler(r.siparisler);
        setYonetici(r.yonetici);
      })
      .catch((err) => {
        if (iptal) return;
        setSiparisler([]);
        setHata(err instanceof Error ? err.message : t("Yüklenemedi"));
      });
    return () => {
      iptal = true;
    };
  }, [kapsamYolu, departmentId, yenile]);

  const tumu = useMemo(
    () => (partySuzgeci ? (siparisler ?? []).filter((s) => !!s.partyId && partySuzgeci.has(s.partyId)) : siparisler ?? []),
    [siparisler, partySuzgeci]
  );

  const aylar = useMemo(() => {
    const set = new Set<string>([buAy]);
    for (const s of tumu) set.add(siparisAyi(s, "siparis"));
    return Array.from(set).sort().reverse();
  }, [tumu]);

  const kanalAdlari = useMemo(() => {
    const set = new Set<string>();
    for (const s of tumu) set.add(s.kanalAdi ?? KANALSIZ);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "tr"));
  }, [tumu]);

  const sorumlular = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of tumu) m.set(s.sorumluId ?? "", s.sorumluAdi ?? t("Sorumlu yok"));
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1], "tr"));
  }, [tumu]);

  // Ay + sorumlu süzgeci: rapor ve özet bunun üzerinden, durum süzgecinden
  // BAĞIMSIZ — "yalnızca açıkları göster" demek raporun tahsil edilen
  // sütununu sıfırlamamalı.
  const kapsamda = useMemo(
    () =>
      tumu.filter(
        (s) =>
          (!ay || siparisAyi(s, "siparis") === ay) &&
          (!sorumlu || (s.sorumluId ?? "") === sorumlu) &&
          (!kanal || (s.kanalAdi ?? KANALSIZ) === kanal)
      ),
    [tumu, ay, sorumlu, kanal]
  );

  // Arama: alıcı / müşteri, kanal, sipariş no, ürün. Özeti ve raporu
  // DEĞİŞTİRMEZ — "Gamze'yi bul" demek ayın toplamını küçültmemeli.
  // Varsayılan sıra sipariş tarihi, yeniden eskiye (kullanıcı isteği,
  // 2026-10-20): kargo dökümüyle karşılaştırılan şey siparişin günü.
  const liste = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr");
    const l = kapsamda.filter((s) => {
      if (!durumUyar(s, durum, bugun)) return false;
      if (fatura === "yok" && (s.fatura || s.asama === "iptal")) return false;
      if (fatura === "var" && !s.fatura) return false;
      if (!q) return true;
      return [kimAdi(s), s.kanalAdi, s.siparisNo, s.aciklama, ...s.kalemler.map((k) => k.productName ?? k.aciklama)]
        .filter(Boolean)
        .some((x) => String(x).toLocaleLowerCase("tr").includes(q));
    });
    const yeniden = (a: MusteriSiparisi, b: MusteriSiparisi) =>
      b.siparisTarihi.localeCompare(a.siparisTarihi) || b.createdAt.localeCompare(a.createdAt);
    return l.sort((a, b) => {
      switch (siralama) {
        case "eski":
          return -yeniden(a, b);
        case "tutar":
          return Number(b.tutar) - Number(a.tutar) || yeniden(a, b);
        case "vade":
          return a.vadeTarihi.localeCompare(b.vadeTarihi) || yeniden(a, b);
        case "ad":
          return kimAdi(a).localeCompare(kimAdi(b), "tr") || yeniden(a, b);
        default:
          return yeniden(a, b);
      }
    });
  }, [kapsamda, durum, fatura, arama, siralama]);

  // Süzgeç seçeneklerinin yanındaki sayılar: ay/sorumlu/kanal kapsamında.
  const durumSayilari = useMemo(() => {
    const m: Record<DurumSuzgeci, number> = { acik: 0, yaklasan: 0, gecikti: 0, tahsil_edildi: 0, hepsi: 0 };
    for (const s of kapsamda) for (const d of ["acik", "yaklasan", "gecikti", "tahsil_edildi"] as const) if (durumUyar(s, d, bugun)) m[d]++;
    return m;
  }, [kapsamda]);
  // Faturası kesilmemiş siparişler (iptal hariç), para birimi başına tutar.
  const faturasiz = useMemo(() => {
    const l = kapsamda.filter((s) => !s.fatura && s.asama !== "iptal");
    const m = new Map<string, number>();
    for (const s of l) m.set(s.paraBirimi, (m.get(s.paraBirimi) ?? 0) + Number(s.tutar));
    return { sayi: l.length, faturali: kapsamda.filter((s) => !!s.fatura).length, tutar: Array.from(m.entries()) };
  }, [kapsamda]);

  const rapor = useMemo(() => tahsilatRaporu(kapsamda, bugun, "siparis"), [kapsamda]);

  // Kanal kırılımı (yönetici): kanal × para birimi. Kur dönüşümü yok.
  const kanalRaporu = useMemo(() => {
    const m = new Map<string, { kanal: string; para: string; sayi: number; beklenen: number; tahsil: number; kalan: number }>();
    for (const s of kapsamda) {
      const ad = s.kanalAdi ?? KANALSIZ;
      const anahtar = `${ad}|${s.paraBirimi}`;
      const k = m.get(anahtar) ?? { kanal: ad, para: s.paraBirimi, sayi: 0, beklenen: 0, tahsil: 0, kalan: 0 };
      k.sayi += 1;
      k.beklenen += Number(s.tutar);
      k.tahsil += tahsilEdilen(s);
      k.kalan += kalanTutar(s);
      m.set(anahtar, k);
    }
    return Array.from(m.values()).sort((a, b) => b.beklenen - a.beklenen);
  }, [kapsamda]);

  // Süzgeç değişince sayfa başa döner, görünmeyen seçim bırakılır: listede
  // görünmeyen bir siparişi "tahsil edildi" yapmak sürpriz olurdu.
  useEffect(() => {
    setGosterilen(SAYFA);
    setSecili(new Set());
  }, [ay, durum, fatura, sorumlu, kanal, arama, siralama]);

  // Özet şeridi: para birimi başına (kur dönüşümü yok).
  const ozet = useMemo(() => {
    const m = new Map<string, { beklenen: number; tahsil: number; kalan: number; geciken: number }>();
    for (const r of rapor) {
      const k = m.get(r.paraBirimi) ?? { beklenen: 0, tahsil: 0, kalan: 0, geciken: 0 };
      k.beklenen += r.beklenen;
      k.tahsil += r.tahsilEdilen;
      k.kalan += r.kalan;
      k.geciken += r.geciken;
      m.set(r.paraBirimi, k);
    }
    return Array.from(m.entries());
  }, [rapor]);

  // Seçili ayın DIŞINDA kalmış gecikmiş alacak: ay süzgeci onu gizliyor ama
  // takip edilmesi gereken asıl şey o.
  const baskaAyGeciken = useMemo(
    () =>
      ay
        ? tumu.filter(
            (s) =>
              siparisAyi(s, "siparis") !== ay &&
              (!sorumlu || (s.sorumluId ?? "") === sorumlu) &&
              siparisDurumu(s, bugun) === "gecikti"
          ).length
        : 0,
    [tumu, ay, sorumlu]
  );

  const degisti = (s: MusteriSiparisi) => setSiparisler((l) => (l ?? []).map((x) => (x.id === s.id ? s : x)));
  const silindi = (id: string) => {
    setSiparisler((l) => (l ?? []).filter((x) => x.id !== id));
    setAcikSiparis((a) => (a?.id === id ? null : a));
  };
  const siparisiAc = (id: string, mod?: "tahsil") => setAcikSiparis((a) => ({ id, mod: mod ?? null, n: (a?.n ?? 0) + 1 }));
  // Süzgeçlerden bağımsız: bildirimden açılan sipariş bu ayın ya da seçili
  // listenin dışında olsa da ayrıntısı görünsün.
  const acikKayit = acikSiparis ? (siparisler ?? []).find((s) => s.id === acikSiparis.id) : undefined;

  // Bildirimden istenen sipariş: liste yüklenince açılır. Listede yoksa (sayfa
  // sipariş gelmeden önce yüklenmişti) bir kez tazelenir.
  const istenenSiparis = useRef<string | null>(null);
  const tazelendi = useRef(false);
  useEffect(() => {
    if (!acilacakSiparis) return;
    istenenSiparis.current = acilacakSiparis.id;
    tazelendi.current = false;
  }, [acilacakSiparis]);
  useEffect(() => {
    const id = istenenSiparis.current;
    if (!id || !siparisler) return;
    if (siparisler.some((s) => s.id === id)) {
      istenenSiparis.current = null;
      siparisiAc(id);
    } else if (!tazelendi.current) {
      tazelendi.current = true;
      setYenile((x) => x + 1);
    } else {
      istenenSiparis.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siparisler, acilacakSiparis]);
  // Sağ panel: liste + 380 px'lik ayrıntı yan yana sığıyorsa. Liste boşken
  // yanında boş kutu anlamsız (Müşteriler'deki ikiBolme ile aynı kural).
  const yanPanel = genislik >= 760 && liste.length > 0;
  // Sol filtre sütunu + liste + ayrıntı paneli üçü birden ancak geniş alanda
  // sığar; daha darda filtreler "Süz" penceresine döner, liste ezilmesin
  // (1159 px'te satır başlıkları kelime kelime bölünüyordu).
  const filtreSolda = filtreSoldaIstegi && (genislik === 0 || genislik >= 1240);

  // İptal edilen sipariş tahsil edilemez: toplu seçime girmesin.
  const acikListede = liste.filter((s) => kalanTutar(s) > 0 && s.asama !== "iptal");
  const seciliToplam = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of tumu) if (secili.has(s.id)) m.set(s.paraBirimi, (m.get(s.paraBirimi) ?? 0) + kalanTutar(s));
    return Array.from(m.entries());
  }, [secili, tumu]);

  const topluTahsilEt = async () => {
    if (!toplu || secili.size === 0) return;
    const metin = seciliToplam.map(([p, v]) => fmtPara(v, p)).join(" + ");
    if (!(await onayla(t("{n} sipariş tahsil edildi olarak işaretlensin mi? Kasaya {tutar} gelir yazılır.", { n: secili.size, tutar: metin })))) return;
    setIsleniyor(true);
    setTopluSonuc("");
    try {
      const r = await siparisApi.topluTahsilEt(Array.from(secili), {
        tarih: toplu.tarih,
        odemeYontemi: toplu.yontem || undefined,
      });
      setTopluSonuc(
        r.atlanan.length > 0
          ? t("{n} sipariş işlendi, {m} sipariş işlenemedi: {neden}", {
              n: r.islenen,
              m: r.atlanan.length,
              neden: Array.from(new Set(r.atlanan.map((a) => a.neden))).join("; "),
            })
          : t("{n} sipariş tahsil edildi olarak işaretlendi.", { n: r.islenen })
      );
      setSecili(new Set());
      setToplu(null);
      setYenile((x) => x + 1);
    } catch (err) {
      setTopluSonuc(err instanceof Error ? err.message : t("İşlem başarısız"));
    } finally {
      setIsleniyor(false);
    }
  };

  const raporuIndir = () => {
    const baslik = [t("Çalışan"), t("Sipariş ayı"), t("Para birimi"), t("Sipariş"), t("Beklenen"), t("Tahsil edilen"), t("Kalan"), t("Geciken")];
    const satirlar = rapor.map((r) => [
      r.sorumluAdi ?? t("Sorumlu yok"),
      r.ay,
      r.paraBirimi,
      r.siparisSayisi,
      r.beklenen,
      r.tahsilEdilen,
      r.kalan,
      r.geciken,
    ]);
    const hucre = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
    // Excel'in Türkçe karakterleri doğru açması için BOM; ayraç ";" çünkü
    // Türkçe Excel virgülü ondalık ayırıcı sayıyor.
    const csv = "\uFEFF" + [baslik, ...satirlar].map((r) => r.map(hucre).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${t("tahsilat-raporu")}-${ay || t("tum-aylar")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (!siparisler) return <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>{t("Yükleniyor…")}</p>;

  const secim: React.CSSProperties = { fontSize: 14, padding: "5px 6px" };
  const baglanti: React.CSSProperties = { fontSize: 13, color: c.primary, background: "transparent", border: "none", cursor: "pointer", padding: 0 };
  const thK: React.CSSProperties = { textAlign: "right", fontWeight: 500, color: c.textSecondary, padding: "8px 8px", whiteSpace: "nowrap" };
  const tdK: React.CSSProperties = { textAlign: "right", padding: "8px 8px", whiteSpace: "nowrap", color: c.textPrimary };

  const suzgecVar = !!arama.trim() || durum !== "hepsi" || ay !== buAy || !!kanal || !!sorumlu || !!fatura;
  // Özet şeridi: dört ölçü + faturasız. Her ölçü aynı zamanda bir süzgeç
  // düğmesi — "Geciken ₺3.000" görünce ilk iş o siparişleri açmak
  // (kullanıcı isteği, 2026-11-11: tahsilatta önemli olan ödeme takibi ve
  // faturalama). Eskiden rakamlar yalnızca okunuyordu.
  const olcuSec = (d: DurumSuzgeci, f: FaturaSuzgeci = "") => {
    const ayni = durum === d && fatura === f;
    setDurum(ayni ? "hepsi" : d);
    setFatura(ayni ? "" : f);
  };
  // Geniş ekranda özet sol sütunda, filtrelerin üstünde, alt alta: listenin
  // üstünde ayrı bir şerit olarak listeyi ~80 px aşağı itiyordu (kullanıcı
  // isteği, 2026-11-11: "listeler olabildiğince yukarıdan başlasın").
  const dikey = filtreSolda;
  const ozetSeridi = (
    <div
      // Dar alanda ölçüler tek satırda, yana kayar: ızgara olarak üç satıra
      // bölünüp telefonda listeyi bir ekran aşağı itiyordu.
      style={{
        display: "grid",
        gridTemplateColumns: dikey ? "1fr" : undefined,
        gridAutoFlow: dikey ? undefined : "column",
        gridAutoColumns: dikey ? undefined : "minmax(128px, 1fr)",
        overflowX: dikey ? undefined : "auto",
        borderRadius: 12,
        background: c.surface,
        border: `1px solid ${c.border}`,
        overflowY: "hidden",
        padding: dikey ? "6px 0" : 0,
      }}
    >
      {ozet.length === 0 && <Olcu dikey={dikey} etiket={t("Beklenen")} deger={fmtPara(0, "TRY")} />}
      {ozet.map(([para, o]) => (
        <Fragment key={para}>
          <Olcu dikey={dikey} etiket={t("Beklenen")} deger={fmtPara(o.beklenen, para)} aktif={durum === "hepsi" && !fatura} onClick={() => olcuSec("hepsi")} />
          <Olcu dikey={dikey}
            etiket={t("Tahsil edilen")}
            deger={fmtPara(o.tahsil, para)}
            renk={c.success}
            aktif={durum === "tahsil_edildi"}
            onClick={() => olcuSec("tahsil_edildi")}
          />
          <Olcu dikey={dikey} etiket={t("Açık alacak")} deger={fmtPara(o.kalan, para)} aktif={durum === "acik"} onClick={() => olcuSec("acik")} />
          <Olcu dikey={dikey}
            etiket={t("Geciken")}
            deger={fmtPara(o.geciken, para)}
            renk={o.geciken > 0 ? c.danger : undefined}
            aktif={durum === "gecikti"}
            onClick={() => olcuSec("gecikti")}
          />
        </Fragment>
      ))}
      <Olcu dikey={dikey}
        etiket={t("Faturasız")}
        deger={t("{n} sipariş", { n: faturasiz.sayi })}
        alt={faturasiz.tutar.map(([p, v]) => fmtPara(v, p)).join(" + ") || undefined}
        renk={faturasiz.sayi > 0 ? c.warning : undefined}
        aktif={fatura === "yok" && durum === "hepsi"}
        onClick={() => olcuSec("hepsi", "yok")}
      />
    </div>
  );
  const etkinFiltre = (durum !== "hepsi" ? 1 : 0) + (ay !== buAy ? 1 : 0) + (kanal ? 1 : 0) + (sorumlu ? 1 : 0) + (fatura ? 1 : 0);
  const filtreleriTemizle = () => {
    setDurum("hepsi");
    setFatura("");
    setAy(buAy);
    setKanal("");
    setSorumlu("");
  };
  const filtreIcerigi = (pencerede: boolean) => (
    <>
      <FiltreBasligi etkin={etkinFiltre} onTemizle={filtreleriTemizle} />
      <FiltreBolumu baslik={t("Durum")}>
        <SecimListesi
          secenekler={[
            { deger: "acik", etiket: t("Açık olanlar"), sayi: durumSayilari.acik },
            { deger: "yaklasan", etiket: t("Vadesi 7 gün içinde"), sayi: durumSayilari.yaklasan },
            { deger: "gecikti", etiket: t("Gecikenler"), renk: c.danger, sayi: durumSayilari.gecikti },
            { deger: "tahsil_edildi", etiket: t("Tahsil edilenler"), sayi: durumSayilari.tahsil_edildi },
          ]}
          secili={durum === "hepsi" ? [] : [durum]}
          onDegis={(v) => setDurum((v[0] ?? "hepsi") as DurumSuzgeci)}
        />
      </FiltreBolumu>
      <FiltreBolumu baslik={t("Fatura")}>
        <SecimListesi
          secenekler={[
            { deger: "yok", etiket: t("Faturası kesilmemiş"), renk: c.warning, sayi: faturasiz.sayi },
            { deger: "var", etiket: t("Faturalı"), sayi: faturasiz.faturali },
          ]}
          secili={fatura ? [fatura] : []}
          onDegis={(v) => setFatura((v[0] ?? "") as FaturaSuzgeci)}
        />
      </FiltreBolumu>
      <FiltreBolumu baslik={t("Sipariş ayı")}>
        {/* "Tüm aylar" açık seçenek: önceden yalnızca seçili ayı yeniden
            tıklayınca (gizli bir hareketle) bütün aylar görünüyordu. */}
        <SecimListesi
          secenekler={[
            { deger: TUM_AYLAR, etiket: t("Tüm aylar"), sayi: tumu.length },
            ...aylar.map((a) => ({ deger: a, etiket: ayEtiketi(a), sayi: tumu.filter((s) => siparisAyi(s, "siparis") === a).length })),
          ]}
          secili={[ay || TUM_AYLAR]}
          onDegis={(v) => setAy(!v[0] || v[0] === TUM_AYLAR ? "" : v[0])}
          ilkGoster={5}
        />
      </FiltreBolumu>
      {kanalAdlari.length > 1 && (
        <FiltreBolumu baslik={t("Satış kanalı")}>
          <SecimListesi
            secenekler={kanalAdlari.map((k) => ({ deger: k, etiket: k === KANALSIZ ? t("Kanalı belirtilmemiş") : k }))}
            secili={kanal ? [kanal] : []}
            onDegis={(v) => setKanal(v[0] ?? "")}
          />
        </FiltreBolumu>
      )}
      {yonetici && sorumlular.length > 1 && (
        <FiltreBolumu baslik={t("Sorumlu")}>
          <SecimListesi
            secenekler={sorumlular.map(([id, ad]) => ({ deger: id, etiket: ad }))}
            secili={sorumlu ? [sorumlu] : []}
            onDegis={(v) => setSorumlu(v[0] ?? "")}
          />
        </FiltreBolumu>
      )}
      {pencerede && <FiltreBolumu baslik={t("Sırala")}>{siralamaSecici}</FiltreBolumu>}
    </>
  );
  const siralamaSecici = (
    <select value={siralama} onChange={(e) => setSiralama(e.target.value as Siralama)} style={{ ...secim, padding: "6px 8px" }} aria-label={t("Sıralama")}>
      {SIRALAMALAR.map((x) => (
        <option key={x} value={x}>
          {t(SIRALAMA_ETIKET[x])}
        </option>
      ))}
    </select>
  );
  const aracDugmesi: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "9px 12px",
    borderRadius: 8,
    border: `1px solid ${c.border}`,
    background: c.surface,
    color: c.textPrimary,
    fontSize: 14,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
  // Excel ve kanal düğmeleri: geniş ekranda araç çubuğunda; dar ekranda
  // "Süz" penceresinin altında — telefonda kendi satırlarını kaplıyorlardı.
  const araclar = yonetici ? (
    <>
      {yonetici && organizationId && (
        <button onClick={() => setExcel(true)} style={aracDugmesi} title={t("Kargo ya da sipariş dökümünü yükleyin; önizlemede ürünleri, kanalları ve müşteri eşleşmelerini kontrol edip aktarın.")}>
          <IconUpload size={14} /> {t("Excel'den aktar")}
        </button>
      )}
      {yonetici && (
        <button onClick={() => setPanel(panel === "kanallar" ? null : "kanallar")} style={aracDugmesi}>
          {t("Satış kanalları")}
        </button>
      )}
    </>
  ) : null;

  const ayrinti = acikKayit && acikSiparis && (
    <SiparisAyrintisi
      key={`${acikKayit.id}:${acikSiparis.n}`}
      siparis={acikKayit}
      yazabilir
      baslikli
      musteriAdiGoster
      ilkMod={acikSiparis.mod}
      onDegisti={degisti}
      onSilindi={silindi}
      onKapat={yanPanel ? () => setAcikSiparis(null) : undefined}
    />
  );

  return (
    <div ref={setKokEl} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {!yanPanel && ayrinti && (
        <Modal title={t("Sipariş")} onClose={() => setAcikSiparis(null)} maxWidth={600} mobileFullScreen>
          {ayrinti}
        </Modal>
      )}
      {panel === "yeni" && (
        <Modal title={t("Sipariş ekle")} onClose={() => setPanel(null)} maxWidth={640} mobileFullScreen>
          <SiparisFormu
            kapsamYolu={kapsamYolu}
            organizationId={organizationId}
            musteriSecenekleri={musteriSecenekleri}
            onKaydedildi={(s) => {
              setPanel(null);
              setSiparisler((l) => [s, ...(l ?? [])]);
            }}
            onVazgec={() => setPanel(null)}
          />
        </Modal>
      )}
      {panel === "kanallar" && <SatisKanallari kapsamYolu={kapsamYolu} sorumluSecenekleri={sorumluSecenekleri} onDegisti={() => setYenile((x) => x + 1)} />}
      {excel && organizationId && (
        <SiparisExcelModal
          organizationId={organizationId}
          onKapat={() => setExcel(false)}
          onAktarildi={() => setYenile((x) => x + 1)}
        />
      )}

      {!yonetici && (
        <span style={{ fontSize: 13, color: c.textSecondary }}>{t("Yalnızca sana atanmış müşterilerin siparişleri görünüyor.")}</span>
      )}

      {/* Filtreler solda, özet şeridi + liste sağda — Müşteriler sekmesiyle
          aynı düzen (kullanıcı isteği, 2026-11-11). */}
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
      {filtreSolda && (
        // Yapışkan: sayfa kayarken yalnızca liste kayar (Müşteriler'le aynı);
        // ekrandan uzunsa sütun kendi içinde kayar.
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            width: 236,
            flexShrink: 0,
            position: "sticky",
            top: 72,
            maxHeight: "calc(100vh - 88px)",
            overflowY: "auto",
            scrollbarWidth: "thin",
          }}
        >
          {ozetSeridi}
          <aside style={filtrePaneliStili(c)}>{filtreIcerigi(false)}</aside>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, ...(yanPanel ? { flex: "1 1 0", minWidth: 340 } : { flex: 1, minWidth: 0 }) }}>
      {!dikey && ozetSeridi}
      {/* Sığmayan düğmeler alt satıra geçer: telefonda arama kutusu
          düğmelerin arasında eziliyor, sayfa yana kayıyordu. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", position: "relative" }}>
        <input
          value={arama}
          onChange={(e) => setArama(e.target.value)}
          placeholder={t("Sipariş ya da müşteri ara…")}
          aria-label={t("Siparişlerde ara")}
          style={{ flex: "1 1 220px", minWidth: 0, fontSize: 15, padding: "9px 12px", borderRadius: 8 }}
        />
        {filtreSolda ? (
          siralamaSecici
        ) : (
          <button
            onClick={() => setSuzAcik((a) => !a)}
            aria-expanded={suzAcik}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "9px 12px",
              borderRadius: 8,
              border: `1px solid ${etkinFiltre > 0 ? c.primary : c.border}`,
              background: c.surface,
              color: etkinFiltre > 0 ? c.primary : c.textPrimary,
              fontSize: 14,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {etkinFiltre > 0 ? t("Süz ({n})", { n: etkinFiltre }) : t("Süz")}
          </button>
        )}
        {suzAcik && !filtreSolda && (
          <>
            <div onClick={() => setSuzAcik(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
            <div
              style={{
                ...filtrePaneliStili(c),
                position: "absolute",
                top: "calc(100% + 6px)",
                right: 0,
                zIndex: 41,
                width: 300,
                maxWidth: "calc(100vw - 32px)",
                maxHeight: "70vh",
                overflowY: "auto",
                boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
              }}
            >
              {filtreIcerigi(true)}
              {araclar && <div style={{ display: "flex", flexWrap: "wrap", gap: 8, paddingTop: 12, borderTop: `1px solid ${c.border}` }}>{araclar}</div>}
            </div>
          </>
        )}
        {/* Toplu araçlar araç çubuğunda, küçük: her gün kullanılmıyorlar ama
            listenin altında rapor tablolarının arasında kayboluyorlardı. */}
        {filtreSolda && araclar}
        {/* Yeni sipariş sayfanın "+" düğmesinden; "+" olmayan yerde (modal içi) yedek düğme. */}
        {!fabVar && (
          <button onClick={() => setPanel("yeni")} style={{ ...baglanti, fontSize: 14, whiteSpace: "nowrap" }}>
            {t("+ Sipariş ekle")}
          </button>
        )}
      </div>
      {suzgecVar && (
        <button
          onClick={() => {
            setArama("");
            filtreleriTemizle();
          }}
          style={{ ...baglanti, alignSelf: "flex-start" }}
        >
          {t("Aramayı ve filtreleri temizle")}
        </button>
      )}

      {baskaAyGeciken > 0 && (
        <button
          onClick={() => {
            setAy("");
            setDurum("gecikti");
          }}
          style={{
            alignSelf: "flex-start",
            fontSize: 13,
            padding: "5px 10px",
            borderRadius: 8,
            border: `1px solid ${c.danger}55`,
            background: "transparent",
            color: c.danger,
            cursor: "pointer",
          }}
        >
          {t("Başka aylarda {n} gecikmiş sipariş var — göster", { n: baskaAyGeciken })}
        </button>
      )}

      {hata && <p style={{ color: c.danger, fontSize: 13, margin: 0 }}>{hata}</p>}

      {/* Toplu tahsilat çubuğu yalnızca seçim varken: işlem tek satırda,
          birincil düğmeyle (muhasebe pazaryerinin ödemesini görünce o
          kanalın siparişlerini seçip tek seferde işler). */}
      {secili.size > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            alignItems: "center",
            padding: "10px 14px",
            borderRadius: 10,
            background: `color-mix(in srgb, ${c.primary} 12%, ${c.surface})`,
            border: `1px solid color-mix(in srgb, ${c.primary} 35%, transparent)`,
            fontSize: 14,
          }}
        >
          <span style={{ color: c.textPrimary, fontWeight: 600 }}>
            {t("{n} seçili", { n: secili.size })} · {seciliToplam.map(([p, v]) => fmtPara(v, p)).join(" + ")}
          </span>
          <span style={{ flex: 1 }} />
          {toplu ? (
            <>
              <input
                type="date"
                value={toplu.tarih}
                onChange={(e) => setToplu({ ...toplu, tarih: e.target.value })}
                aria-label={t("Tahsilat tarihi")}
                style={secim}
              />
              <select
                value={toplu.yontem}
                onChange={(e) => setToplu({ ...toplu, yontem: e.target.value as OdemeYontemi | "" })}
                aria-label={t("Ödeme yöntemi")}
                style={secim}
              >
                <option value="">{t("Siparişteki yöntem")}</option>
                {ODEME_YONTEMLERI.map((y) => (
                  <option key={y} value={y}>
                    {t(ODEME_YONTEMI_ETIKET[y])}
                  </option>
                ))}
              </select>
              <button
                onClick={topluTahsilEt}
                disabled={isleniyor}
                style={{ fontSize: 14, padding: "7px 14px", borderRadius: 8, border: "none", background: c.primary, color: c.onPrimary, cursor: "pointer" }}
              >
                {isleniyor ? t("İşleniyor…") : t("Tahsil edildi işaretle")}
              </button>
              <button onClick={() => setToplu(null)} style={{ ...baglanti, fontSize: 14, color: c.textSecondary }}>
                {t("Vazgeç")}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setToplu({ tarih: bugun, yontem: "" })}
                style={{ fontSize: 14, padding: "7px 14px", borderRadius: 8, border: "none", background: c.primary, color: c.onPrimary, cursor: "pointer" }}
              >
                {t("Tahsil edildi olarak işaretle…")}
              </button>
              <button onClick={() => setSecili(new Set())} style={{ ...baglanti, fontSize: 14, color: c.textSecondary }}>
                {t("Seçimi kaldır")}
              </button>
            </>
          )}
        </div>
      )}
      {topluSonuc && <p style={{ fontSize: 13, color: c.textSecondary, margin: 0 }}>{topluSonuc}</p>}

      {liste.length === 0 ? (
        <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>
          {tumu.length === 0
            ? t("Henüz sipariş yok. Yeni sipariş sayfadaki \"+\" düğmesiyle ya da müşteri kartının Siparişler sekmesinden eklenir.")
            : arama.trim()
              ? t("Aramanla eşleşen sipariş yok.")
              : t("Bu süzgeçle eşleşen sipariş yok.")}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {/* Satırlar tek çerçevede (lib/listeStili.ts); başlık satırında
              tümünü seç + sipariş sayısı + sütun adı — eskiden "Listedeki 4
              açık siparişi seç" bağlantısı listenin üstünde yüzüyordu. */}
          <div style={listeCercevesi(c)}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 12px",
                background: c.surface,
                borderBottom: `1px solid ${c.border}`,
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: 0.3,
                textTransform: "uppercase",
                color: c.textSecondary,
              }}
            >
              <input
                type="checkbox"
                checked={acikListede.length > 0 && secili.size === acikListede.length}
                ref={(el) => {
                  if (el) el.indeterminate = secili.size > 0 && secili.size < acikListede.length;
                }}
                disabled={acikListede.length === 0}
                onChange={() => setSecili((x) => (x.size === acikListede.length ? new Set() : new Set(acikListede.map((s) => s.id))))}
                aria-label={t("Açık siparişlerin hepsini seç")}
                title={t("Listedeki {n} açık siparişi seç", { n: acikListede.length })}
                style={{ width: 16, height: 16, margin: 0 }}
              />
              <span style={{ flex: 1 }}>{t("{n} sipariş", { n: liste.length })}</span>
              <span>{t("Tutar · vade")}</span>
            </div>
            {liste.slice(0, gosterilen).map((s, i) => (
              <div
                key={s.id}
                // Sıra sıra değişen zemin yok: Müşteriler listesiyle aynı düz yüzey.
                style={{ background: c.surface, borderTop: i === 0 ? "none" : `1px solid ${c.border}`, ...(secili.has(s.id) ? { background: `color-mix(in srgb, ${c.primary} 8%, ${c.surface})` } : {}) }}
                // Siparişin müşterisi liste sekmesine taşınır (bkz. CustomersPanel listeyeBirak).
                draggable={surukle && !!s.partyId}
                onDragStart={(e) => {
                  if (!s.partyId) return;
                  e.dataTransfer.setData(PARTY_SURUKLE, s.partyId);
                  e.dataTransfer.effectAllowed = "move";
                }}
              >
                <SiparisKarti
                  siparis={s}
                  // Liste zaten sunucunun izin verdiği siparişler: yönetici hepsine,
                  // çalışan yalnızca kendi müşterilerine yazar.
                  yazabilir
                  musteriAdiGoster
                  sorumluGoster={yonetici}
                  cerceveli
                  onDegisti={degisti}
                  onSilindi={silindi}
                  onAc={(mod) => siparisiAc(s.id, mod)}
                  // Sağ panelde "Tahsil et" en üstte duruyor; satırdaki kısayol
                  // yalnızca listeye yer açmak için gizli.
                  hizliTahsilYok={yanPanel}
                  acikta={acikSiparis?.id === s.id && (yanPanel || !!acikKayit)}
                  secili={secili.has(s.id)}
                  onSec={(v) =>
                    setSecili((x) => {
                      const y = new Set(x);
                      if (v) y.add(s.id);
                      else y.delete(s.id);
                      return y;
                    })
                  }
                />
              </div>
            ))}
          </div>
          {liste.length > gosterilen && (
            <button onClick={() => setGosterilen((n) => n + SAYFA)} style={{ ...baglanti, alignSelf: "center" }}>
              {t("Daha fazla göster ({n} kaldı)", { n: liste.length - gosterilen })}
            </button>
          )}
        </div>
      )}

      {/* Raporlar tek kartta ve kapalı başlar: yönetici için gerekli ama her
          gün bakılan şey değil; açıkken liste ile iki tablo alt alta göz
          yoruyordu. */}
      {yonetici && rapor.length > 0 && (
        <section style={{ borderRadius: 12, border: `1px solid ${c.border}`, background: c.surface, marginTop: 4 }}>
          <button
            onClick={() => setRaporAcik((a) => !a)}
            aria-expanded={raporAcik}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              padding: "12px 16px",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: c.textPrimary,
              fontSize: 15,
              fontWeight: 600,
              textAlign: "left",
            }}
          >
            <span style={{ flex: 1 }}>{t("Raporlar")}</span>
            <span style={{ fontSize: 13, fontWeight: 400, color: c.textSecondary }}>
              {ay ? ayEtiketi(ay) : t("Tüm aylar")}
            </span>
            <span style={{ display: "flex", transform: raporAcik ? "rotate(180deg)" : undefined, transition: "transform .15s" }}>
              <IconChevronDown size={16} color={c.textSecondary} />
            </span>
          </button>
          {raporAcik && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "0 16px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {(
                  [
                    ["calisan", t("Çalışan bazında")],
                    ...(kanalRaporu.length > 1 ? [["kanal", t("Kanal bazında")]] : []),
                  ] as [typeof raporTuru, string][]
                ).map(([k, ad]) => (
                  <button
                    key={k}
                    onClick={() => setRaporTuru(k)}
                    aria-pressed={raporTuru === k}
                    style={{
                      fontSize: 13,
                      padding: "5px 12px",
                      borderRadius: 999,
                      border: `1px solid ${raporTuru === k ? c.primary : c.border}`,
                      background: raporTuru === k ? `color-mix(in srgb, ${c.primary} 15%, ${c.surface})` : "transparent",
                      color: c.textPrimary,
                      cursor: "pointer",
                    }}
                  >
                    {ad}
                  </button>
                ))}
                <span style={{ flex: 1 }} />
                {raporTuru === "calisan" && (
                  <button onClick={raporuIndir} style={{ ...baglanti, fontSize: 14 }}>
                    {t("CSV indir")}
                  </button>
                )}
              </div>
              {raporTuru === "kanal" && kanalRaporu.length > 1 ? (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${c.border}` }}>
                        <th style={{ ...thK, textAlign: "left" }}>{t("Kanal")}</th>
                        <th style={thK}>{t("Sipariş")}</th>
                        <th style={thK}>{t("Beklenen")}</th>
                        <th style={thK}>{t("Tahsil edilen")}</th>
                        <th style={thK}>{t("Kalan")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {kanalRaporu.map((k) => (
                        <tr key={`${k.kanal}|${k.para}`} style={{ borderBottom: `1px solid ${c.border}` }}>
                          <td style={{ ...tdK, textAlign: "left" }}>{k.kanal === KANALSIZ ? t("Kanalı belirtilmemiş") : k.kanal}</td>
                          <td style={tdK}>{k.sayi}</td>
                          <td style={tdK}>{fmtPara(k.beklenen, k.para)}</td>
                          <td style={{ ...tdK, color: c.success }}>{fmtPara(k.tahsil, k.para)}</td>
                          <td style={tdK}>{fmtPara(k.kalan, k.para)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Rapor rapor={rapor} />
              )}
            </div>
          )}
        </section>
      )}
      </div>

      {/* ---- Sağ panel: seçili siparişin ayrıntısı (Müşteriler'in kart paneli gibi) ---- */}
      {yanPanel && (
        <section
          aria-label={t("Sipariş ayrıntısı")}
          style={{
            // Müşteri kartından biraz dar: siparişte sekme yok, liste geniş kalsın.
            flex: "0 1 540px",
            minWidth: 380,
            boxSizing: "border-box",
            // Liste kayarken ayrıntı yerinde kalsın; uzunsa kendi içinde kayar.
            position: "sticky",
            top: 72,
            maxHeight: "calc(100vh - 88px)",
            overflowY: "auto",
            scrollbarWidth: "thin",
            padding: "22px 26px",
            borderRadius: 12,
            background: c.surface,
            border: `1px solid ${c.border}`,
          }}
        >
          {ayrinti || (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 280, textAlign: "center" }}>
              <IconWallet size={28} color={c.textSecondary} />
              <span style={{ fontSize: 15, fontWeight: 600, color: c.textPrimary }}>{t("Bir sipariş seç")}</span>
              <span style={{ fontSize: 14, color: c.textSecondary, maxWidth: 320 }}>
                {t("Listeden bir siparişe tıkla; tahsilatları, faturası ve ürünleri burada açılır.")}
              </span>
            </div>
          )}
        </section>
      )}
      </div>
    </div>
  );
}

/**
 * Özet şeridinin bir ölçüsü: etiket + büyük rakam. Basılınca listeyi o
 * ölçüye süzer (bkz. olcuSec); seçiliyken altı renkli çizgiyle işaretli.
 */
function Olcu({
  etiket,
  deger,
  alt,
  renk,
  aktif,
  onClick,
  dikey,
}: {
  /** Sol sütunda: etiket solda, rakam sağda, tek satır. */
  dikey?: boolean;
  etiket: string;
  deger: string;
  alt?: string;
  renk?: string;
  aktif?: boolean;
  onClick?: () => void;
}) {
  const c = useThemeColors();
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      aria-pressed={onClick ? !!aktif : undefined}
      style={{
        display: "flex",
        flexDirection: dikey ? "row" : "column",
        alignItems: dikey ? "baseline" : "flex-start",
        justifyContent: dikey ? "space-between" : undefined,
        flexWrap: dikey ? "wrap" : undefined,
        gap: dikey ? "0 8px" : 2,
        padding: dikey ? "7px 14px" : "10px 14px",
        background: aktif ? `color-mix(in srgb, ${c.primary} 10%, ${c.surface})` : "transparent",
        border: "none",
        ...(dikey
          ? { borderLeft: `3px solid ${aktif ? c.primary : "transparent"}` }
          : { borderBottom: `2px solid ${aktif ? c.primary : "transparent"}` }),
        cursor: onClick ? "pointer" : "default",
        textAlign: "left",
        minWidth: 0,
      }}
    >
      <span style={{ fontSize: 13, color: c.textSecondary }}>{etiket}</span>
      <span style={{ fontSize: dikey ? 15 : 17, fontWeight: 600, color: renk ?? c.textPrimary, fontVariantNumeric: "tabular-nums" }}>{deger}</span>
      {alt && <span style={{ fontSize: 12, color: c.textSecondary, width: dikey ? "100%" : undefined, textAlign: dikey ? "right" : undefined }}>{alt}</span>}
    </button>
  );
}

/** Durum süzgeci: liste, sayılar ve özet aynı kuraldan geçsin. */
function durumUyar(s: MusteriSiparisi, durum: DurumSuzgeci, bugun: string): boolean {
  const d = siparisDurumu(s, bugun);
  switch (durum) {
    case "hepsi":
      return true;
    case "acik":
      return d !== "tahsil_edildi" && d !== "iptal";
    case "yaklasan":
      return (d === "bekliyor" || d === "kismi") && gunFarki(bugun, s.vadeTarihi) <= YAKLASAN_GUN;
    default:
      return d === durum;
  }
}

function Rapor({ rapor }: { rapor: TahsilatRaporSatiri[] }) {
  const c = useThemeColors();
  const t = useT();
  const th: React.CSSProperties = { textAlign: "right", fontWeight: 500, color: c.textSecondary, padding: "8px 8px", whiteSpace: "nowrap" };
  const td: React.CSSProperties = { textAlign: "right", padding: "8px 8px", whiteSpace: "nowrap", color: c.textPrimary };
  return (
    <section>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${c.border}` }}>
              <th style={{ ...th, textAlign: "left" }}>{t("Çalışan")}</th>
              <th style={{ ...th, textAlign: "left" }}>{t("Sipariş ayı")}</th>
              <th style={th}>{t("Sipariş")}</th>
              <th style={th}>{t("Beklenen")}</th>
              <th style={th}>{t("Tahsil edilen")}</th>
              <th style={th}>{t("Kalan")}</th>
              <th style={th}>{t("Geciken")}</th>
            </tr>
          </thead>
          <tbody>
            {rapor.map((r) => (
              <tr key={`${r.sorumluId}|${r.ay}|${r.paraBirimi}`} style={{ borderBottom: `1px solid ${c.border}` }}>
                <td style={{ ...td, textAlign: "left" }}>{r.sorumluAdi ?? t("Sorumlu yok")}</td>
                <td style={{ ...td, textAlign: "left" }}>{ayEtiketi(r.ay)}</td>
                <td style={td}>{r.siparisSayisi}</td>
                <td style={td}>{fmtPara(r.beklenen, r.paraBirimi)}</td>
                <td style={{ ...td, color: c.success }}>{fmtPara(r.tahsilEdilen, r.paraBirimi)}</td>
                <td style={td}>{fmtPara(r.kalan, r.paraBirimi)}</td>
                <td style={{ ...td, color: r.geciken > 0 ? c.danger : c.textSecondary }}>{fmtPara(r.geciken, r.paraBirimi)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
