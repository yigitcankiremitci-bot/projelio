import { useEffect, useMemo, useRef, useState } from "react";
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
import { IconUpload } from "../icons";
import { listeCercevesi, listeSatiri, ozetKutusu } from "../../lib/listeStili";
import { useIsWide } from "../../lib/useIsDesktop";
import Modal from "../Modal";
import SiparisFormu from "./SiparisFormu";
import SiparisKarti from "./SiparisKarti";
import SatisKanallari from "./SatisKanallari";
import SiparisExcelModal from "./SiparisExcelModal";
import { ayEtiketi, bugunYerel } from "./siparisOrtak";

type DurumSuzgeci = "acik" | "gecikti" | "tahsil_edildi" | "hepsi";

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
}: {
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

  const tumu = siparisler ?? [];

  const aylar = useMemo(() => {
    const set = new Set<string>([buAy]);
    for (const s of tumu) set.add(siparisAyi(s, "siparis"));
    return Array.from(set).sort().reverse();
  }, [siparisler]);

  const kanalAdlari = useMemo(() => {
    const set = new Set<string>();
    for (const s of tumu) set.add(s.kanalAdi ?? KANALSIZ);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "tr"));
  }, [siparisler]);

  const sorumlular = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of tumu) m.set(s.sorumluId ?? "", s.sorumluAdi ?? t("Sorumlu yok"));
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1], "tr"));
  }, [siparisler]);

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
    [siparisler, ay, sorumlu, kanal]
  );

  // Arama: alıcı / müşteri, kanal, sipariş no, ürün. Özeti ve raporu
  // DEĞİŞTİRMEZ — "Gamze'yi bul" demek ayın toplamını küçültmemeli.
  // Varsayılan sıra sipariş tarihi, yeniden eskiye (kullanıcı isteği,
  // 2026-10-20): kargo dökümüyle karşılaştırılan şey siparişin günü.
  const liste = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr");
    const l = kapsamda.filter((s) => {
      const d = siparisDurumu(s, bugun);
      if (durum === "acik" && d === "tahsil_edildi") return false;
      if (durum !== "hepsi" && durum !== "acik" && d !== durum) return false;
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
  }, [kapsamda, durum, arama, siralama]);

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
  }, [ay, durum, sorumlu, kanal, arama, siralama]);

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
    [siparisler, ay, sorumlu]
  );

  const degisti = (s: MusteriSiparisi) => setSiparisler((l) => (l ?? []).map((x) => (x.id === s.id ? s : x)));

  const acikListede = liste.filter((s) => kalanTutar(s) > 0);
  const seciliToplam = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of tumu) if (secili.has(s.id)) m.set(s.paraBirimi, (m.get(s.paraBirimi) ?? 0) + kalanTutar(s));
    return Array.from(m.entries());
  }, [secili, siparisler]);

  const topluTahsilEt = async () => {
    if (!toplu || secili.size === 0) return;
    const metin = seciliToplam.map(([p, v]) => fmtPara(v, p)).join(" + ");
    if (!window.confirm(t("{n} sipariş tahsil edildi olarak işaretlensin mi? Kasaya {tutar} gelir yazılır.", { n: secili.size, tutar: metin }))) return;
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

  if (!siparisler) return <p style={{ fontSize: 13, color: c.textSecondary, margin: 0 }}>{t("Yükleniyor…")}</p>;

  const secim: React.CSSProperties = { fontSize: 13, padding: "5px 6px" };
  const baglanti: React.CSSProperties = { fontSize: 12, color: c.primary, background: "transparent", border: "none", cursor: "pointer", padding: 0 };
  const thK: React.CSSProperties = { textAlign: "right", fontWeight: 500, color: c.textSecondary, padding: "4px 6px", whiteSpace: "nowrap" };
  const tdK: React.CSSProperties = { textAlign: "right", padding: "4px 6px", whiteSpace: "nowrap", color: c.textPrimary };

  const suzgecVar = !!arama.trim() || durum !== "hepsi" || ay !== buAy || !!kanal || !!sorumlu;
  // Özet kutuları: geniş ekranda sağ sütunda alt alta (müşteri ve bağlantı
  // listesindeki gibi), dar ekranda listenin üstünde yan yana.
  const ozetKutulari = (dikey: boolean) =>
    ozet.map(([para, o]) => (
      <div key={para} style={{ display: "flex", flexDirection: dikey ? "column" : "row", flexWrap: dikey ? "nowrap" : "wrap", gap: 8 }}>
        <Kutu etiket={t("Beklenen")} deger={fmtPara(o.beklenen, para)} />
        <Kutu etiket={t("Tahsil edilen")} deger={fmtPara(o.tahsil, para)} renk={c.success} />
        <Kutu etiket={t("Kalan")} deger={fmtPara(o.kalan, para)} />
        {o.geciken > 0 && <Kutu etiket={t("Geciken")} deger={fmtPara(o.geciken, para)} renk={c.danger} />}
      </div>
    ));
  const yanSutun = genisEkran && ozet.length > 0;
  const sadeDugme: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    borderRadius: 6,
    border: `1px solid ${c.border}`,
    background: "transparent",
    color: c.textSecondary,
    fontSize: 12,
    cursor: "pointer",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
        <span style={{ fontSize: 12, color: c.textSecondary }}>{t("Yalnızca sana atanmış müşterilerin siparişleri görünüyor.")}</span>
      )}

      {!yanSutun && ozetKutulari(false)}

      {/* Süzgeçler + liste solda, özet kutuları sağda — Müşteriler ve
          Bağlantılar listesinin düzeni (kullanıcı isteği, 2026-10-20). */}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minWidth: 0 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        <input
          value={arama}
          onChange={(e) => setArama(e.target.value)}
          placeholder={t("Ara…")}
          aria-label={t("Siparişlerde ara")}
          style={{ flex: "1 1 140px", minWidth: 120, fontSize: 13, padding: "5px 8px" }}
        />
        <select value={ay} onChange={(e) => setAy(e.target.value)} style={secim} aria-label={t("Sipariş ayı")}>
          <option value="">{t("Tüm aylar")}</option>
          {aylar.map((a) => (
            <option key={a} value={a}>
              {ayEtiketi(a)}
            </option>
          ))}
        </select>
        <select value={durum} onChange={(e) => setDurum(e.target.value as DurumSuzgeci)} style={secim} aria-label={t("Durum")}>
          <option value="acik">{t("Açık olanlar")}</option>
          <option value="gecikti">{t("Gecikenler")}</option>
          <option value="tahsil_edildi">{t("Tahsil edilenler")}</option>
          <option value="hepsi">{t("Hepsi")}</option>
        </select>
        {kanalAdlari.length > 1 && (
          <select value={kanal} onChange={(e) => setKanal(e.target.value)} style={secim} aria-label={t("Satış kanalı")}>
            <option value="">{t("Tüm kanallar")}</option>
            {kanalAdlari.map((k) => (
              <option key={k} value={k}>
                {k === KANALSIZ ? t("Kanalı belirtilmemiş") : k}
              </option>
            ))}
          </select>
        )}
        {yonetici && sorumlular.length > 1 && (
          <select value={sorumlu} onChange={(e) => setSorumlu(e.target.value)} style={secim} aria-label={t("Sorumlu")}>
            <option value="">{t("Tüm çalışanlar")}</option>
            {sorumlular.map(([id, ad]) => (
              <option key={id || "yok"} value={id}>
                {ad}
              </option>
            ))}
          </select>
        )}
        <select value={siralama} onChange={(e) => setSiralama(e.target.value as Siralama)} style={secim} aria-label={t("Sıralama")}>
          {SIRALAMALAR.map((x) => (
            <option key={x} value={x}>
              {t(SIRALAMA_ETIKET[x])}
            </option>
          ))}
        </select>
        {suzgecVar && (
          <button
            onClick={() => {
              setArama("");
              setDurum("hepsi");
              setAy(buAy);
              setKanal("");
              setSorumlu("");
            }}
            style={baglanti}
          >
            {t("Temizle")}
          </button>
        )}
        {/* Yeni sipariş sayfanın "+" düğmesinden; "+" olmayan yerde (modal içi) yedek düğme. */}
        {!fabVar && (
          <button onClick={() => setPanel("yeni")} style={{ ...baglanti, marginLeft: "auto", fontSize: 13 }}>
            {t("+ Sipariş ekle")}
          </button>
        )}
      </div>

      {baskaAyGeciken > 0 && (
        <button
          onClick={() => {
            setAy("");
            setDurum("gecikti");
          }}
          style={{
            alignSelf: "flex-start",
            fontSize: 12,
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

      {hata && <p style={{ color: c.danger, fontSize: 12, margin: 0 }}>{hata}</p>}

      {acikListede.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", fontSize: 12 }}>
          <button
            onClick={() =>
              setSecili((x) => (x.size === acikListede.length ? new Set() : new Set(acikListede.map((s) => s.id))))
            }
            style={baglanti}
          >
            {secili.size === acikListede.length
              ? t("Seçimi kaldır")
              : t("Listedeki {n} açık siparişi seç", { n: acikListede.length })}
          </button>
          {secili.size > 0 && (
            <>
              <span style={{ color: c.textSecondary }}>
                {t("{n} seçili", { n: secili.size })} · {seciliToplam.map(([p, v]) => fmtPara(v, p)).join(" + ")}
              </span>
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
                    style={{ fontSize: 12, padding: "5px 10px", borderRadius: 8, border: "none", background: c.primary, color: c.onPrimary, cursor: "pointer" }}
                  >
                    {isleniyor ? t("İşleniyor…") : t("Tahsil edildi işaretle")}
                  </button>
                  <button onClick={() => setToplu(null)} style={{ ...baglanti, color: c.textSecondary }}>
                    {t("Vazgeç")}
                  </button>
                </>
              ) : (
                <button onClick={() => setToplu({ tarih: bugun, yontem: "" })} style={baglanti}>
                  {t("Tahsil edildi olarak işaretle…")}
                </button>
              )}
            </>
          )}
        </div>
      )}
      {topluSonuc && <p style={{ fontSize: 12, color: c.textSecondary, margin: 0 }}>{topluSonuc}</p>}

      {liste.length === 0 ? (
        <p style={{ fontSize: 13, color: c.textSecondary, margin: 0 }}>
          {tumu.length === 0
            ? t("Henüz sipariş yok. Yeni sipariş sayfadaki \"+\" düğmesiyle ya da müşteri kartının Siparişler sekmesinden eklenir.")
            : arama.trim()
              ? t("Aramanla eşleşen sipariş yok.")
              : t("Bu süzgeçle eşleşen sipariş yok.")}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {(arama.trim() || suzgecVar) && (
            <span style={{ fontSize: 12, color: c.textSecondary }}>{t("{n} sipariş", { n: liste.length })}</span>
          )}
          {/* Satırlar tek çerçevede, sıra sıra renkli (lib/listeStili.ts) —
              müşteri ve bağlantı listesiyle aynı çizgi. */}
          <div style={listeCercevesi(c)}>
            {liste.slice(0, gosterilen).map((s, i) => (
              <div key={s.id} style={listeSatiri(c, i)}>
                <SiparisKarti
                  siparis={s}
                  // Liste zaten sunucunun izin verdiği siparişler: yönetici hepsine,
                  // çalışan yalnızca kendi müşterilerine yazar.
                  yazabilir
                  musteriAdiGoster
                  sorumluGoster={yonetici}
                  cerceveli
                  onDegisti={degisti}
                  onSilindi={(id) => setSiparisler((l) => (l ?? []).filter((x) => x.id !== id))}
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

      {/* Toplu işler en altta ve sade (Bağlantılar'daki "Excel ile toplu
          ekle" gibi): her gün kullanılan düğmeler değil. */}
      {yonetici && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 4 }}>
          {organizationId && (
            <button onClick={() => setExcel(true)} style={sadeDugme}>
              <IconUpload size={13} /> {t("Excel'den sipariş aktar")}
            </button>
          )}
          <button onClick={() => setPanel(panel === "kanallar" ? null : "kanallar")} style={sadeDugme}>
            {t("Satış kanalları")}
          </button>
          <span style={{ flex: "1 1 200px", fontSize: 11, color: c.textSecondary }}>
            {t("Kargo ya da sipariş dökümünü yükleyin; önizlemede ürünleri, kanalları ve müşteri eşleşmelerini kontrol edip aktarın.")}
          </span>
        </div>
      )}

      {yonetici && kanalRaporu.length > 1 && (
        <section style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
          <h6 style={{ fontSize: 13, fontWeight: 500, color: c.textPrimary, margin: 0 }}>{t("Kanal bazında")}</h6>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
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
        </section>
      )}

      {yonetici && rapor.length > 0 && <Rapor rapor={rapor} onIndir={raporuIndir} />}
      </div>
      {yanSutun && (
        <aside style={{ width: 160, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {ozetKutulari(true)}
        </aside>
      )}
      </div>
    </div>
  );
}

function Kutu({ etiket, deger, renk }: { etiket: string; deger: string; renk?: string }) {
  const c = useThemeColors();
  return (
    <div style={ozetKutusu(c)}>
      <span style={{ fontSize: 11, color: c.textSecondary }}>{etiket}</span>
      <span style={{ fontSize: 15, fontWeight: 500, color: renk ?? c.textPrimary }}>{deger}</span>
    </div>
  );
}

/** Yönetici raporu: çalışan × vade ayı × para birimi. */
function Rapor({ rapor, onIndir }: { rapor: TahsilatRaporSatiri[]; onIndir: () => void }) {
  const c = useThemeColors();
  const t = useT();
  const th: React.CSSProperties = { textAlign: "right", fontWeight: 500, color: c.textSecondary, padding: "4px 6px", whiteSpace: "nowrap" };
  const td: React.CSSProperties = { textAlign: "right", padding: "4px 6px", whiteSpace: "nowrap", color: c.textPrimary };
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <h6 style={{ fontSize: 13, fontWeight: 500, color: c.textPrimary, margin: 0 }}>{t("Çalışan bazında tahsilat raporu")}</h6>
        <button
          onClick={onIndir}
          style={{ fontSize: 12, color: c.primary, background: "transparent", border: "none", cursor: "pointer" }}
        >
          {t("CSV indir")}
        </button>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
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
