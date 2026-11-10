import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type {
  BudgetOverview,
  BudgetTransaction,
  ButceSayfasi,
  Department,
  Job,
  ModuleCatalogEntry,
  ModuleRecord,
  ModuleStatsResponse,
  ModuleUsageStat,
  OrganizationAccess,
  PanoBoyut,
  PanoKart,
  PersonalBoardItem,
  Product,
  Project,
  ProjectFile,
  ProjectPost,
  SirketEkibi,
  Task,
} from "@projelio/shared";
import { BAGLANTI_MODUL_KEY, MUSTERI_MODUL_KEY } from "@projelio/shared";
import { api } from "../../api/client";
import { aiChat } from "../../api/aiChat";
import { filesApi } from "../../api/files";
import { iseAlimApi } from "../../api/iseAlim";
import { useThemeColors } from "../../theme/useThemeColors";
import { useAppPrefs } from "../../lib/appPrefs";
import { askLioDraft } from "../../lib/askLio";
import { coverBackground } from "../../lib/covers";
import { getDepartmentCoverUrl } from "../../lib/departmentCovers";
import { isMailModule } from "../../lib/mailbox";
import { useT } from "../../lib/i18n";
import { bicimDili } from "../../lib/i18n/depo";
import { modulDepartmani } from "../../lib/modulYeri";
import { useRefreshOnUndo } from "../../lib/undo";
import { visibleOrgTabs } from "../OrgTabs";
import JobCard from "../JobCard";
import ModuleEmblem from "../ModuleEmblem";
import AutoGrowTextarea from "../AutoGrowTextarea";
import FilePreviewModal from "../FilePreviewModal";
import CreateProjectModal from "../CreateProjectModal";
import { onSidebarChanged } from "../../lib/sidebarEvents";
import { YapilacakListeSekmeleri, listedekiler, useYapilacakListeleri } from "../YapilacakListeleri";
import type { AnasayfaPano } from "../../lib/useAnasayfaPano";
import {
  IconActivity,
  IconBriefcase,
  IconBuilding,
  IconChevronLeft,
  IconChevronRight,
  IconDoor,
  IconFile,
  IconFolder,
  IconInfo,
  IconLayers,
  IconListCheck,
  IconCoins,
  IconMap,
  IconMessageCircle,
  IconNews,
  IconTrend,
  IconPlus,
  IconSparkle,
  IconSend,
  IconStar,
  IconUser,
  IconWallet,
  IconX,
} from "../icons";
import { Cubuklar, DosyaSimgesi, Halka, KapakIzgara, KapakSeridi, KartRozeti, Kareler, KisiYigini, Sayi, SekmeCipleri, Seritler, SonListe, YanYana, enYeniOnce, kisaTarih, ozetRengi } from "./gorselOzet";
import EpostaKarti from "./EpostaKarti";
import { BaglantiModulKarti, MusteriModulKarti } from "./ModulSekmeKartlari";
import type { SonOge } from "./gorselOzet";
import { aracTanimlari } from "./panoAraclari";

/** Panoda çizilebilecek bir kart. Liste kullanıcının yetkisine göre kurulur. */
export interface PanoKartTanimi {
  id: string;
  ad: string;
  grup: "temel" | "modul" | "arac" | "proje";
  Icon: typeof IconFolder;
  /** Rafa alınıp geri eklenince başlayacağı boyut. */
  boyut: PanoBoyut;
  /** Karta basınca açılan tam görünüm. Etkileşimli araçta kullanılmaz. */
  hedef: string;
  /** Eğitim turunun işaret ettiği çapa (bkz. lib/tour/tours.ts). */
  turCapasi?: string;
  /** Kendi düğmeleri olan araç: bağlantıya sarılmaz, iç içe tıklanabilir öğe olmasın. */
  etkilesimli?: boolean;
  /** Çizim kartın tamamını kaplar (görsel kartlar): simge satırı çizilmez. */
  tamKaplama?: boolean;
  /** Sağ üstte kartı açmadan yapılan tek iş. */
  /** Kartın sağ üstündeki tek dokunuşluk iş: + (yeni kayıt) ya da Lio (taslak yazar). */
  hizliEylem?: { ad: string; calistir: () => void; ikon?: "arti" | "lio" };
  /** Kapak görseli olan kart seçicide simge yerine kapağıyla görünür. */
  kapakArka?: string;
  /** Kendi tasarımı tek boyutta anlamlı olan kart: boyut düğmesi çıkmaz, kayıtlı boyut yok sayılır. */
  sabitBoyut?: PanoBoyut;
  /** Izgarada kapladığı satır (varsayılan 1); boyuta göre değişebilir. */
  satir?: number | ((boyut: PanoBoyut) => number);
  ciz: (boyut: PanoBoyut) => ReactNode;
}

/** Kutucuklu kartlarda boyuta göre kaç öğe sığar. */
function kutuAdedi(boyut: PanoBoyut, kucuk: number, orta: number, genis: number): number {
  return boyut === "kucuk" ? kucuk : boyut === "orta" ? orta : genis;
}

const MusteriHaritaOzeti = lazy(() => import("./MusteriHaritaOzeti"));

type Durum = "yukleniyor" | "hazir" | "hata";

function useOzet<T>(yukle: () => Promise<T>, deps: unknown[]): { veri?: T; durum: Durum; yenile: () => void } {
  const [sonuc, setSonuc] = useState<{ veri?: T; durum: Durum }>({ durum: "yukleniyor" });
  const [tazele, setTazele] = useState(0);
  // Geri al/yinele sunucudaki veriyi değiştirir; kart eski sayıda kalmasın.
  useRefreshOnUndo(() => setTazele((n) => n + 1));
  useEffect(() => {
    let iptal = false;
    yukle()
      .then((veri) => {
        if (!iptal) setSonuc({ veri, durum: "hazir" });
      })
      .catch(() => {
        if (!iptal) setSonuc({ durum: "hata" });
      });
    return () => {
      iptal = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tazele]);
  return { ...sonuc, yenile: () => setTazele((n) => n + 1) };
}

/**
 * Kart üstü sekmenin seçimi; bu cihazda kart başına hatırlanır (kullanıcı
 * isteği, 2026-11-09: "tüm kutucukların üstünde liste değişimi olsun").
 */
function useSekme<K extends string>(anahtar: string, gecerli: readonly K[], varsayilan: K): [K, (k: K) => void] {
  const tam = `projelio_pano_sekme_${anahtar}`;
  const [sekme, setSekmeHam] = useState<K>(() => {
    try {
      const kayit = localStorage.getItem(tam) as K | null;
      return kayit && gecerli.includes(kayit) ? kayit : varsayilan;
    } catch {
      return varsayilan;
    }
  });
  const setSekme = (k: K) => {
    setSekmeHam(k);
    try {
      localStorage.setItem(tam, k);
    } catch {
      // Hatırlanmazsa kart varsayılan sekmeyle açılır.
    }
  };
  return [sekme, setSekme];
}

/** Yükleniyorken sayı yerine çizgi, hata olunca tek simge: kart yine yerinde durur. */
function SayiYaDa({ durum, children, boyut }: { durum: Durum; children: ReactNode; boyut?: number }) {
  const c = useThemeColors();
  const t = useT();
  if (durum === "hata") {
    return (
      <span title={t("Özet yüklenemedi")} aria-label={t("Özet yüklenemedi")}>
        <IconInfo size={18} color={c.textSecondary} />
      </span>
    );
  }
  return <Sayi boyut={boyut}>{durum === "yukleniyor" ? "–" : children}</Sayi>;
}

// ─── Biçimleme ───────────────────────────────────────────────────────────────

function para(tutar: number, birim = "TRY"): string {
  const sayi = Math.round(tutar).toLocaleString(bicimDili());
  return birim === "TRY" ? `${sayi} ₺` : `${sayi} ${birim}`;
}

/** Görev bitişi geçmiş mi — gün sonu sayılır, bugün biten görev henüz gecikmedi. */
function gecikmisMi(deadline: string | undefined, simdi: Date): boolean {
  if (!deadline) return false;
  const son = new Date(deadline);
  if (Number.isNaN(son.getTime())) return false;
  son.setHours(23, 59, 59, 999);
  return son < simdi;
}

// ─── Her iki panoda ortak kartlar ────────────────────────────────────────────

function LioOzeti() {
  const { veri, durum } = useOzet(() => Promise.all([aiChat.getCredits(), aiChat.listConversations().catch(() => [])]), []);
  const sohbetler = [...(veri?.[1] ?? [])].filter((k) => k.title).sort((x, y) => y.updatedAt.localeCompare(x.updatedAt));
  return (
    <>
      <YanYana
        sol={<SayiYaDa durum={durum}>{veri ? Math.floor(veri[0].balance).toLocaleString(bicimDili()) : "–"}</SayiYaDa>}
        sag={<img src="/lio-open.png" alt="" draggable={false} style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover" }} />}
      />
      <SonListe ogeler={sohbetler.map((k) => ({ id: k.id, ad: k.title, sag: kisaTarih(k.updatedAt) }))} />
    </>
  );
}

/** Ofisin kuşbakışı görüntüsü; karta basınca sahnenin kendisi açılır. */
function OfisOzeti({ ad }: { ad: string }) {
  const c = useThemeColors();
  return (
    <div style={{ position: "relative", flex: 1, minHeight: 130, background: c.background, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ position: "absolute", top: 14, left: 14, zIndex: 1, display: "flex", alignItems: "center", gap: 7, fontSize: 14, fontWeight: 500, color: c.textPrimary }}>
        <IconLayers size={17} color={c.accentDark} />
        {ad}
      </span>
      {/* Elle çizim değil, sahnenin kendisinden alınmış görüntü (arka planı saydam). */}
      <img src="/ofis/onizleme.webp" alt="" draggable={false} style={{ position: "absolute", top: 34, left: 8, right: 8, bottom: 6, width: "calc(100% - 16px)", height: "calc(100% - 40px)", objectFit: "contain" }} />
      <span style={{ position: "absolute", right: 10, bottom: 10, width: 32, height: 32, borderRadius: "50%", background: c.surface, border: `1px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <IconDoor size={16} color={c.accentDark} />
      </span>
    </div>
  );
}

/** Modüllerin alanları kendine özgü: önce ad benzeri alan, yoksa ilk düz yazı. */
function kayitAdi(veri: Record<string, unknown>): string | undefined {
  for (const alan of ["ad", "adi", "name", "title", "baslik", "unvan"]) {
    const deger = veri[alan];
    if (typeof deger === "string" && deger.trim()) return deger;
  }
  const yazi = Object.values(veri).find((d) => typeof d === "string" && d.trim() && !/^\d{4}-\d{2}-\d{2}/.test(d) && !/^[0-9a-f-]{36}$/i.test(d));
  return yazi as string | undefined;
}

function ModulOzeti({ modul, kok, hedef }: { modul: ModuleUsageStat; kok?: string; hedef: string }) {
  const renk = ozetRengi(modul.moduleKey);
  const { veri } = useOzet(
    () => (kok ? api.get<ModuleRecord[]>(`${kok}/module-records?moduleKey=${encodeURIComponent(modul.moduleKey)}`) : Promise.resolve([])),
    [kok, modul.moduleKey]
  );
  const ogeler = enYeniOnce(veri ?? []).flatMap((k): SonOge[] => {
    const ad = kayitAdi(k.data);
    return ad ? [{ id: k.id, ad, sag: kisaTarih(k.createdAt), renk, hedef }] : [];
  });
  return (
    <>
      <YanYana
        sol={<Sayi>{modul.recordCount.toLocaleString(bicimDili())}</Sayi>}
        sag={<Kareler renkler={Array.from({ length: Math.min(modul.recordCount, 6) }, () => renk)} />}
      />
      <SonListe ogeler={ogeler} />
    </>
  );
}

function ModullerOzeti({ moduller, yukleniyor, hedefi, boyut }: { moduller: ModuleUsageStat[]; yukleniyor: boolean; hedefi: (m: ModuleUsageStat) => string; boyut: PanoBoyut }) {
  const c = useThemeColors();
  const t = useT();
  const atanan = moduller.filter((m) => m.assignedToMe);
  const [sekmeHam, setSekme] = useSekme<"son" | "bana" | "kayit">("moduller", ["son", "bana", "kayit"], "son");
  const sekme = sekmeHam === "bana" && !atanan.length ? "son" : sekmeHam;
  // Son kullanılan · Bana atanan · En çok kayıt.
  const son = [...(sekme === "bana" ? atanan : moduller)].sort((a, b) => (sekme === "kayit" ? b.recordCount - a.recordCount : (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? "")));
  return (
    <>
      <SekmeCipleri
        etiket={t("Modül görünümü")}
        secili={sekme}
        onSec={setSekme}
        sekmeler={[{ id: "son", ad: t("Son kullanılan") }, ...(atanan.length ? [{ id: "bana" as const, ad: t("Bana atanan"), sayi: atanan.length }] : []), { id: "kayit", ad: t("En çok kayıt") }]}
      />
      <SayiYaDa durum={yukleniyor ? "yukleniyor" : "hazir"}>{sekme === "bana" ? atanan.length : moduller.length}</SayiYaDa>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(50px, 1fr))", gap: 6, marginTop: 9 }}>
        {son.slice(0, kutuAdedi(boyut, 6, 12, 20)).map((m) => (
          <Link key={m.moduleKey} to={hedefi(m)} draggable={false} title={`${m.moduleName}: ${m.recordCount}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minWidth: 0, textDecoration: "none" }}>
            {/* Modülün kendi çizimi (Modüller sekmesiyle aynı): harfli karede S/E/P'ler birbirine karışıyordu. */}
            <ModuleEmblem moduleKey={m.moduleKey} size={36} radius="10px" />
            <span style={{ width: "100%", fontSize: 11, textAlign: "center", color: c.textSecondary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.moduleName}</span>
          </Link>
        ))}
      </div>
    </>
  );
}

function GorevGovdesi({ durum, toplam, biten, geciken, ogeler, sayi }: { durum: Durum; toplam: number; biten: number; geciken: number; ogeler: SonOge[]; /** Sekmeli kartta büyük rakam seçili sekmenin adedi; yoksa açık görev. */ sayi?: number }) {
  const c = useThemeColors();
  const t = useT();
  return (
    <>
      <YanYana sol={<SayiYaDa durum={durum}>{sayi ?? toplam - biten}</SayiYaDa>} sag={<Halka oran={toplam ? biten / toplam : 0} renk={c.success} boyut={36} />} />
      {geciken > 0 && (
        <KartRozeti renk={c.danger} baslik={t("{adet} görev gecikti", { adet: geciken })}>
          <IconInfo size={14} color={c.danger} /> {geciken}
        </KartRozeti>
      )}
      <SonListe ogeler={ogeler} />
    </>
  );
}

/** Kasa kartlarının ortak alt listesi. */
function useHareketOgeleri(hareketler: BudgetTransaction[], hedef: string, tur?: "income" | "expense"): SonOge[] {
  const c = useThemeColors();
  const t = useT();
  return enYeniOnce(tur ? hareketler.filter((h) => h.type === tur) : hareketler).map((h) => ({
    id: h.id,
    ad: h.description || (h.type === "income" ? t("Gelir") : t("Gider")),
    sag: para(h.amount, h.currency),
    renk: h.type === "income" ? c.success : c.danger,
    hedef,
  }));
}

// ─── Dış veri: haber, döviz, borsa (sunucu modules/piyasa) ────────────────────

interface Haber {
  baslik: string;
  baglanti: string;
  kaynak: string;
  tarih: string;
}

/** Bugünse saat, değilse gün: haber kartında "ne kadar taze" sorusu. */
function haberZamani(iso: string): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toDateString() === new Date().toDateString() ? d.toLocaleTimeString(bicimDili(), { hour: "2-digit", minute: "2-digit" }) : kisaTarih(iso);
}

/** Gündem / Ekonomi süzgeci kartın üstünde; seçim bu cihazda hatırlanır. */
function HaberKarti({ boyut }: { boyut: PanoBoyut }) {
  const c = useThemeColors();
  const t = useT();
  const [tur, setTur] = useState<"gundem" | "ekonomi">(() => {
    try {
      return localStorage.getItem("projelio_pano_haber_turu") === "ekonomi" ? "ekonomi" : "gundem";
    } catch {
      return "gundem";
    }
  });
  const { veri, durum } = useOzet(() => api.get<Haber[]>(`/piyasa/haberler?tur=${tur}`), [tur]);
  const sec = (yeni: "gundem" | "ekonomi") => {
    setTur(yeni);
    try {
      localStorage.setItem("projelio_pano_haber_turu", yeni);
    } catch {
      // Hatırlanmazsa bir sonraki açılış Gündem'le başlar.
    }
  };
  const cip = (secik: boolean) =>
    ({ flexShrink: 0, padding: "3px 10px", borderRadius: 999, border: `1px solid ${secik ? c.accent : c.border}`, background: secik ? c.accent : "transparent", color: secik ? c.surface : c.textSecondary, fontSize: 12 }) as const;
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div className="no-drag pano-cipler" role="group" aria-label={t("Haber türü")}>
        <button type="button" aria-pressed={tur === "gundem"} onClick={() => sec("gundem")} style={cip(tur === "gundem")}>
          {t("Gündem")}
        </button>
        <button type="button" aria-pressed={tur === "ekonomi"} onClick={() => sec("ekonomi")} style={cip(tur === "ekonomi")}>
          {t("Ekonomi")}
        </button>
      </div>
      {durum === "hata" || (durum === "hazir" && !veri?.length) ? (
        <span style={{ fontSize: 13, color: c.textSecondary }}>{t("Haberler şu an yüklenemedi.")}</span>
      ) : (
        <div className="no-drag" style={{ flex: 1, minHeight: 0, maxHeight: boyut === "kucuk" ? 250 : 270, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
          {(veri ?? []).map((h) => (
            <a key={h.baglanti} href={h.baglanti} target="_blank" rel="noreferrer" draggable={false} className="pano-satir" style={{ display: "flex", flexDirection: "column", gap: 2, padding: "6px 4px", borderBottom: `1px solid ${c.border}`, textDecoration: "none", minWidth: 0 }}>
              <span className="pano-iki-satir" style={{ fontSize: 13, color: c.textPrimary }}>{h.baslik}</span>
              <span style={{ fontSize: 11, color: c.textSecondary }}>
                {h.kaynak}
                {haberZamani(h.tarih) ? ` · ${haberZamani(h.tarih)}` : ""}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function sayiBicimi(deger: number, basamak: number): string {
  return deger.toLocaleString(bicimDili(), { minimumFractionDigits: basamak, maximumFractionDigits: basamak });
}

/** Kartın altındaki küçük kaynak satırı: verinin nereden ve ne zamandan olduğu açık olsun. */
function KaynakNotu({ children }: { children: ReactNode }) {
  const c = useThemeColors();
  return <span style={{ marginTop: "auto", paddingTop: 8, fontSize: 11, color: c.textSecondary }}>{children}</span>;
}

function DovizKarti() {
  const c = useThemeColors();
  const t = useT();
  const { veri, durum } = useOzet(() => api.get<{ tarih: string; kurlar: { kod: string; alis: number; satis: number }[] } | null>("/piyasa/doviz"), []);
  if (durum === "hata" || (durum === "hazir" && !veri)) return <span style={{ fontSize: 13, color: c.textSecondary }}>{t("Kurlar şu an yüklenemedi.")}</span>;
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
      {(veri?.kurlar ?? []).map((k) => (
        <div key={k.kod} title={`${t("Alış")}: ${sayiBicimi(k.alis, 4)} · ${t("Satış")}: ${sayiBicimi(k.satis, 4)}`} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <span style={{ width: 40, fontWeight: 600, color: c.textPrimary }}>{k.kod}</span>
          <span style={{ flex: 1, textAlign: "right", color: c.textPrimary, fontVariantNumeric: "tabular-nums" }}>{sayiBicimi(k.satis, 2)} ₺</span>
        </div>
      ))}
      {durum === "yukleniyor" && <Sayi>–</Sayi>}
      {veri && <KaynakNotu>{t("TCMB · {tarih}", { tarih: veri.tarih })}</KaynakNotu>}
    </div>
  );
}

function BorsaKarti() {
  const c = useThemeColors();
  const t = useT();
  const { veri, durum } = useOzet(() => api.get<{ sembol: string; ad: string; fiyat: number; degisim: number; paraBirimi: string }[]>("/piyasa/borsa"), []);
  if (durum === "hata" || (durum === "hazir" && !veri?.length)) return <span style={{ fontSize: 13, color: c.textSecondary }}>{t("Borsa verisi şu an yüklenemedi.")}</span>;
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
      {(veri ?? []).map((g) => {
        const renk = g.degisim > 0 ? c.success : g.degisim < 0 ? c.danger : c.textSecondary;
        return (
          <div key={g.sembol} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, minWidth: 0 }}>
            <span style={{ flex: 1, minWidth: 0, color: c.textPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.ad}</span>
            <span style={{ color: c.textPrimary, fontVariantNumeric: "tabular-nums" }}>{sayiBicimi(g.fiyat, g.fiyat >= 1000 ? 0 : 2)}</span>
            <span style={{ width: 56, textAlign: "right", color: renk, fontVariantNumeric: "tabular-nums" }}>
              {g.degisim > 0 ? "+" : ""}
              {sayiBicimi(g.degisim, 2)}%
            </span>
          </div>
        );
      })}
      {durum === "yukleniyor" && <Sayi>–</Sayi>}
      {/* Resmî kaynak değil ve gecikmeli: kullanıcı bunu bilerek baksın. */}
      {veri && <KaynakNotu>{t("Yahoo Finance · yaklaşık 15 dk gecikmeli")}</KaynakNotu>}
    </div>
  );
}

/** Haber/Döviz/Borsa: hem şirket hem serbest panoda aynı tanım. */
function piyasaKartlari(t: ReturnType<typeof useT>): PanoKartTanimi[] {
  return [
    { id: "haber", ad: t("Haberler"), grup: "arac", Icon: IconNews, boyut: "orta", satir: 2, etkilesimli: true, hedef: "", ciz: (b) => <HaberKarti boyut={b} /> },
    { id: "doviz", ad: t("Döviz"), grup: "arac", Icon: IconCoins, boyut: "kucuk", sabitBoyut: "kucuk", etkilesimli: true, hedef: "", ciz: () => <DovizKarti /> },
    { id: "borsa", ad: t("Borsa"), grup: "arac", Icon: IconTrend, boyut: "kucuk", sabitBoyut: "kucuk", etkilesimli: true, hedef: "", ciz: () => <BorsaKarti /> },
  ];
}

// ─── Şirket kartları ─────────────────────────────────────────────────────────

function DepartmanlarOzeti({ departmanlar, boyut, tumu }: { departmanlar: Department[] | null; boyut: PanoBoyut; tumu: string }) {
  const c = useThemeColors();
  const t = useT();
  return (
    <>
      {departmanlar && (
        <KartRozeti renk={c.textSecondary} baslik={t("{adet} departman", { adet: departmanlar.length })}>
          {departmanlar.length}
        </KartRozeti>
      )}
      {/* Departman kapakları fotoğraf: 76px'lik kutuda seçilmiyordu, kart da boş boşluğa büyüyordu.
          Kutular iri, adet de bir-iki satırı dolduracak kadar. */}
      <KapakIzgara tumu={tumu} enDar={124} adet={kutuAdedi(boyut, 2, 6, 12)} ogeler={(departmanlar ?? []).map((d) => ({ id: d.id, ad: d.name, arka: coverBackground(getDepartmentCoverUrl(d), d.id), hedef: `/departments/${d.id}` }))} />
    </>
  );
}

function EkipOzeti({ organizationId, boyut }: { organizationId: string; boyut: PanoBoyut }) {
  const c = useThemeColors();
  const t = useT();
  const { veri, durum } = useOzet<SirketEkibi>(() => iseAlimApi.ekip(organizationId), [organizationId]);
  const bekleyen = veri?.bekleyenDavetler.length ?? 0;
  const hedef = `/organizations/${organizationId}?tab=team`;
  const [sekmeHam, setSekme] = useSekme<"uyeler" | "davetler">(`ekip_${organizationId}`, ["uyeler", "davetler"], "uyeler");
  // Bekleyen davet kalmadıysa sekme de kalmaz.
  const sekme = bekleyen ? sekmeHam : "uyeler";
  const kisiler = sekme === "davetler" ? (veri?.bekleyenDavetler ?? []).map((d) => ({ userId: d.id, fullName: d.fullName, title: d.pozisyon, avatarUrl: undefined as string | undefined })) : veri?.uyeler ?? [];
  return (
    <>
      <SayiYaDa durum={durum}>{veri?.uyeler.length}</SayiYaDa>
      {bekleyen > 0 && (
        <SekmeCipleri etiket={t("Ekip görünümü")} secili={sekme} onSec={setSekme} sekmeler={[{ id: "uyeler", ad: t("Üyeler"), sayi: veri?.uyeler.length }, { id: "davetler", ad: t("Davetler"), sayi: bekleyen }]} />
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(50px, 1fr))", gap: 6, marginTop: 9 }}>
        {kisiler.slice(0, kutuAdedi(boyut, 6, 12, 20)).map((u) => (
          <Link key={u.userId} to={hedef} draggable={false} title={u.title ? `${u.fullName} · ${u.title}` : u.fullName} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minWidth: 0, textDecoration: "none" }}>
            <span style={{ width: 36, height: 36, borderRadius: "50%", overflow: "hidden", background: ozetRengi(u.fullName), color: c.surface, fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {u.avatarUrl ? <img src={u.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : u.fullName.trim().charAt(0).toLocaleUpperCase()}
            </span>
            <span style={{ width: "100%", fontSize: 11, textAlign: "center", color: c.textSecondary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.fullName.trim().split(/\s+/)[0]}</span>
          </Link>
        ))}
      </div>
    </>
  );
}

function UrunlerOzeti({ organizationId, boyut }: { organizationId: string; boyut: PanoBoyut }) {
  const c = useThemeColors();
  const t = useT();
  const { veri } = useOzet(() => api.get<Product[]>(`/organizations/${organizationId}/products`), [organizationId]);
  const hedef = `/organizations/${organizationId}?tab=products`;
  // Kategoriler sekme olur (en kalabalık 8'i); kategorisi olmayan katalogda sekme çıkmaz.
  const kategoriler = [...new Map((veri ?? []).filter((u) => u.category?.trim()).map((u) => [u.category!.trim(), 0])).keys()]
    .map((k) => ({ k, n: (veri ?? []).filter((u) => u.category?.trim() === k).length }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 8);
  const [sekmeHam, setSekme] = useSekme<string>(`urun_${organizationId}`, ["", ...kategoriler.map((x) => x.k)], "");
  const sekme = kategoriler.some((x) => x.k === sekmeHam) ? sekmeHam : "";
  const gorunen = sekme ? (veri ?? []).filter((u) => u.category?.trim() === sekme) : veri ?? [];
  return (
    <>
      {veri && (
        <KartRozeti renk={c.textSecondary} baslik={t("{adet} ürün", { adet: veri.length })}>
          {veri.length}
        </KartRozeti>
      )}
      {kategoriler.length > 1 && (
        <SekmeCipleri etiket={t("Kategori")} secili={sekme} onSec={setSekme} sekmeler={[{ id: "", ad: t("Tümü") }, ...kategoriler.map((x) => ({ id: x.k, ad: x.k, sayi: x.n }))]} />
      )}
      <KapakIzgara tumu={hedef} adet={kutuAdedi(boyut, 4, 8, 16)} ogeler={enYeniOnce(gorunen).map((u) => ({ id: u.id, ad: u.name, arka: coverBackground(u.coverImageUrl, u.id), hedef }))} />
    </>
  );
}

function GorevlerOzeti({ organizationId }: { organizationId: string }) {
  const c = useThemeColors();
  const t = useT();
  const { veri, durum } = useOzet(() => api.get<Task[]>(`/organizations/${organizationId}/tasks`), [organizationId]);
  const [sekme, setSekme] = useSekme<"acik" | "geciken" | "biten">(`gorev_${organizationId}`, ["acik", "geciken", "biten"], "acik");
  const simdi = new Date();
  const liste = veri ?? [];
  const acik = liste.filter((g) => g.status !== "completed");
  const geciken = acik.filter((g) => gecikmisMi(g.deadline, simdi));
  const listedeki = sekme === "geciken" ? geciken : sekme === "biten" ? liste.filter((g) => g.status === "completed") : acik;
  const ogeler = enYeniOnce(listedeki).map((g) => ({ id: g.id, ad: g.title, sag: kisaTarih(g.deadline), renk: gecikmisMi(g.deadline, simdi) ? c.danger : c.accent, hedef: g.projectId ? `/projects/${g.projectId}` : `/organizations/${organizationId}?tab=tasks` }));
  return (
    <>
      <SekmeCipleri
        etiket={t("Görev görünümü")}
        secili={sekme}
        onSec={setSekme}
        sekmeler={[
          { id: "acik", ad: t("Açık"), sayi: veri ? acik.length : undefined },
          { id: "geciken", ad: t("Geciken"), sayi: veri ? geciken.length : undefined },
          { id: "biten", ad: t("Tamamlanan") },
        ]}
      />
      <GorevGovdesi durum={durum} toplam={liste.length} biten={liste.length - acik.length} geciken={geciken.length} ogeler={ogeler} sayi={listedeki.length} />
    </>
  );
}

type KasaSekmesi = "tumu" | "gelir" | "gider";
const KASA_SEKMELERI: readonly KasaSekmesi[] = ["tumu", "gelir", "gider"];

function KasaSekmeleri({ sekme, onSec }: { sekme: KasaSekmesi; onSec: (k: KasaSekmesi) => void }) {
  const t = useT();
  return <SekmeCipleri etiket={t("Kasa görünümü")} secili={sekme} onSec={onSec} sekmeler={[{ id: "tumu", ad: t("Tümü") }, { id: "gelir", ad: t("Gelir") }, { id: "gider", ad: t("Gider") }]} />;
}

function SirketKasaOzeti({ organizationId, boyut }: { organizationId: string; boyut: PanoBoyut }) {
  const c = useThemeColors();
  const [sekme, setSekme] = useSekme<KasaSekmesi>(`kasa_${organizationId}`, KASA_SEKMELERI, "tumu");
  const { veri, durum } = useOzet(() => api.get<ButceSayfasi>(`/budget/scope/organization/${organizationId}`), [organizationId]);
  // Kur dönüşümü YOK (bkz. CLAUDE.md "Bütçe"): tek bir toplam uydurulmaz, ana
  // sayı ₺ bakiyesi; çubuklar da yalnızca aynı birimin dönemlerinden çizilir.
  const tablolar = veri?.tTablolari ?? [];
  const ana = tablolar.find((x) => x.currency === "TRY") ?? tablolar[0];
  const donemler = (veri?.donemler ?? []).filter((d) => d.currency === ana?.currency).slice(boyut === "kucuk" ? -4 : -8);
  const hareketler = useHareketOgeleri(veri?.hareketler ?? [], `/organizations/${organizationId}?tab=budget`, sekme === "gelir" ? "income" : sekme === "gider" ? "expense" : undefined);
  // Gelir/Gider sekmesinde ana sayı o tarafın toplamı, çubuklar da ayın geliri ya da gideri.
  const sayi = sekme === "gelir" ? ana?.gelirToplam : sekme === "gider" ? ana?.giderToplam : ana?.bakiye;
  const cubuk = donemler.map((d) => (sekme === "gelir" ? d.income : sekme === "gider" ? d.expense : d.net));
  const cubukRengi = sekme === "gelir" ? c.success : sekme === "gider" ? c.danger : c.accent;
  return (
    <>
      <KasaSekmeleri sekme={sekme} onSec={setSekme} />
      <YanYana
        sol={<SayiYaDa durum={durum} boyut={boyut === "kucuk" ? 21 : 26}>{para(sayi ?? 0, ana?.currency)}</SayiYaDa>}
        sag={donemler.length > 1 ? <Cubuklar degerler={cubuk} renk={cubukRengi} yukseklik={36} /> : ana && sekme === "tumu" ? <div style={{ width: 90 }}><Seritler parcalar={[{ deger: ana.gelirToplam, renk: c.success }, { deger: ana.giderToplam, renk: c.danger }]} /></div> : undefined}
      />
      <SonListe ogeler={hareketler} />
    </>
  );
}

/**
 * Şirket dosyaları iki yerde yaşıyor: şirketin kendi düz klasörü ve işlerin
 * altındaki proje klasörleri. Sekme ikisini ayırır; proje dosyaları yalnızca
 * sekme açılınca toplanır (iş başına bir istek, tavanlı).
 */
function SirketDosyalarOzeti({ organizationId }: { organizationId: string }) {
  const t = useT();
  const [sekme, setSekme] = useSekme<"sirket" | "projeler">(`dosya_${organizationId}`, ["sirket", "projeler"], "sirket");
  const sirket = useOzet(() => filesApi.listByOrganization(organizationId), [organizationId]);
  const projeler = useOzet(
    () =>
      sekme !== "projeler"
        ? Promise.resolve(undefined)
        : api
            .get<Job[]>(`/organizations/${organizationId}/jobs`)
            .then((isler) => Promise.all(isler.slice(0, DOSYA_OZETI_IS_TAVANI).map((j) => filesApi.listByJob(j.id, { scope: "all" }).catch(() => [] as ProjectFile[]))))
            .then((l) => l.flat().filter((f) => f.projectId)),
    [organizationId, sekme === "projeler"]
  );
  const etkin = sekme === "sirket" ? sirket : projeler;
  return (
    <>
      <SekmeCipleri etiket={t("Dosya türü")} secili={sekme} onSec={setSekme} sekmeler={[{ id: "sirket", ad: t("Şirket") }, { id: "projeler", ad: t("Proje dosyaları") }]} />
      <DosyaGovdesi dosyalar={etkin.veri} durum={etkin.durum} />
    </>
  );
}

/** Dosya türü adından okunur: kartın işi kaba bir dağılım, kesin sınıflama değil. */
function dosyaTuru(ad: string): "gorsel" | "belge" | "tablo" | "diger" {
  const uzanti = ad.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "heic"].includes(uzanti)) return "gorsel";
  if (["pdf", "doc", "docx", "txt", "ppt", "pptx"].includes(uzanti)) return "belge";
  if (["xls", "xlsx", "csv"].includes(uzanti)) return "tablo";
  return "diger";
}

function DosyaKutusu({ dosya, renk, onAc }: { dosya: ProjectFile; renk: string; onAc: (f: ProjectFile) => void }) {
  const c = useThemeColors();
  const [onizleme, setOnizleme] = useState<string | null>(null);
  // Kart artık tüm dosyaları kaydırarak gösteriyor: küçük resim yalnızca kutu
  // görünür olunca istenir, yüzlerce dosyada yüzlerce istek açılmasın.
  const kutuRef = useRef<HTMLButtonElement>(null);
  const [gorundu, setGorundu] = useState(false);
  useEffect(() => {
    const el = kutuRef.current;
    if (!el || gorundu || !dosya.hasThumbnail) return;
    if (typeof IntersectionObserver === "undefined") return setGorundu(true);
    const gozcu = new IntersectionObserver((girdiler) => {
      if (girdiler.some((g) => g.isIntersecting)) {
        setGorundu(true);
        gozcu.disconnect();
      }
    });
    gozcu.observe(el);
    return () => gozcu.disconnect();
  }, [gorundu, dosya.hasThumbnail]);
  useEffect(() => {
    if (!dosya.hasThumbnail || !gorundu) return;
    let iptal = false;
    filesApi
      .thumbnailUrl(dosya.id)
      .then((u) => {
        if (!iptal) setOnizleme(u);
      })
      .catch(() => {});
    return () => {
      iptal = true;
    };
  }, [dosya.id, dosya.hasThumbnail, gorundu]);
  // Drive bağlantısına gitmez, önizleme penceresini açar (kullanıcı isteği, 2026-11-09).
  return (
    <button
      ref={kutuRef}
      type="button"
      title={dosya.name}
      onClick={() => onAc(dosya)}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 0, padding: 0, border: "none", background: "transparent", cursor: "pointer", font: "inherit" }}
    >
      <span style={{ height: 42, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {onizleme ? <img src={onizleme} alt="" style={{ width: 42, height: 42, borderRadius: 7, objectFit: "cover" }} /> : <DosyaSimgesi uzanti={dosya.name.includes(".") ? (dosya.name.split(".").pop() ?? "") : ""} renk={renk} />}
      </span>
      <span className="pano-ekle-ad" style={{ width: "100%", fontSize: 11, color: c.textPrimary, wordBreak: "break-all" }}>{dosya.name}</span>
    </button>
  );
}

/**
 * Kart TÜM dosyaları gösterir ama boyu büyümez: ızgara iki sıralık bir
 * yükseklikte kalır, gerisi kartın içinde kaydırılır (kullanıcı isteği,
 * 2026-11-09 — önceden boyuta göre ilk 6/12/20 dosya görünüyordu).
 */
/** İki sıra dosya kutusu (42px simge + iki satır ad + boşluk). */
const DOSYA_IZGARA_BOYU = 150;

function DosyaGovdesi({ dosyalar, durum, fazlasiVar }: { dosyalar?: ProjectFile[]; durum: Durum; fazlasiVar?: boolean }) {
  const c = useThemeColors();
  const [acik, setAcik] = useState<ProjectFile | null>(null);
  const turRengi = { belge: ozetRengi("belge"), gorsel: c.accent, tablo: c.success, diger: c.textSecondary };
  return (
    <>
      <SayiYaDa durum={durum}>{dosyalar ? `${dosyalar.length}${fazlasiVar ? "+" : ""}` : undefined}</SayiYaDa>
      <div className="no-drag pano-kaydir" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(56px, 1fr))", alignContent: "start", gap: 8, marginTop: 9, maxHeight: DOSYA_IZGARA_BOYU, overflowY: "auto", overscrollBehavior: "contain" }}>
        {enYeniOnce(dosyalar ?? []).map((f) => (
          <DosyaKutusu key={f.id} dosya={f} renk={turRengi[dosyaTuru(f.name)]} onAc={setAcik} />
        ))}
      </div>
      {acik && <FilePreviewModal file={acik} onClose={() => setAcik(null)} />}
    </>
  );
}

function AkisOzeti({ organizationId }: { organizationId: string }) {
  const c = useThemeColors();
  const { veri, durum } = useOzet(() => api.get<ProjectPost[]>(`/organizations/${organizationId}/posts`), [organizationId]);
  const yazarlar = [...new Set((veri ?? []).map((p) => p.authorName).filter(Boolean))];
  const son = enYeniOnce(veri ?? []).find((p) => p.body);
  return (
    <>
      <YanYana sol={<SayiYaDa durum={durum}>{veri?.length}</SayiYaDa>} sag={<KisiYigini kisiler={yazarlar.map((ad) => ({ ad }))} en={3} />} />
      {son && (
        <Link to={`/organizations/${organizationId}?tab=flow`} draggable={false} style={{ marginTop: 9, padding: "7px 9px", borderRadius: 10, background: c.background, textDecoration: "none", display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
          <span style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, color: c.textSecondary }}>
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{son.authorName}</span>
            <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 3 }}>
              <IconMessageCircle size={12} color="currentColor" /> {son.commentCount}
            </span>
          </span>
          <span className="pano-iki-satir" style={{ fontSize: 13, color: c.textPrimary }}>{son.body}</span>
        </Link>
      )}
    </>
  );
}

// ─── Serbest çalışan kartları ────────────────────────────────────────────────

/**
 * Projeler: küçük kapaklı simgeler; yıldızlı olanlar önde. Üstteki iş çipleri
 * şeridi o işin projelerine daraltır; yalnızca projesi olan işler çip olur,
 * tek iş varsa çip satırı hiç çıkmaz (süzecek bir şey yok).
 */
function ProjelerGovdesi({ projeler, isler, yildizlar }: { projeler: Project[] | null; isler?: Pick<Job, "id" | "title">[]; yildizlar?: Set<string> }) {
  const c = useThemeColors();
  const t = useT();
  const [isId, setIsId] = useState<string | null>(null);
  // Yeni proje: kartın + düğmesi bir olay yayar (tanım kart gövdesinin durumunu
  // göremiyor). Seçili iş varsa ona açılır; yoksa önce hangi işe diye sorulur.
  const [yeniIs, setYeniIs] = useState<string | "sec" | null>(null);
  const projeliIsler = (isler ?? []).filter((j) => (projeler ?? []).some((p) => p.jobId === j.id));
  const secili = projeliIsler.some((j) => j.id === isId) ? isId : null;
  const seciliRef = useRef(secili);
  seciliRef.current = secili;
  const islerRef = useRef(isler);
  islerRef.current = isler;
  useEffect(() => {
    const ac = () => {
      const tum = islerRef.current ?? [];
      setYeniIs(seciliRef.current ?? (tum.length === 1 ? tum[0].id : tum.length ? "sec" : null));
    };
    window.addEventListener(YENI_PROJE_OLAYI, ac);
    return () => window.removeEventListener(YENI_PROJE_OLAYI, ac);
  }, []);
  const sirali = [...(projeler ?? [])]
    .filter((p) => !secili || p.jobId === secili)
    .sort((a, b) => Number(yildizlar?.has(b.id) ?? false) - Number(yildizlar?.has(a.id) ?? false));
  const cip = (secik: boolean) =>
    ({ flexShrink: 0, padding: "3px 10px", borderRadius: 999, border: `1px solid ${secik ? c.accent : c.border}`, background: secik ? c.accent : "transparent", color: secik ? c.surface : c.textSecondary, fontSize: 12, whiteSpace: "nowrap", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }) as const;
  return (
    <>
      {projeler && (
        <KartRozeti renk={c.textSecondary} baslik={t("{adet} proje", { adet: projeler.length })}>
          {projeler.length}
        </KartRozeti>
      )}
      {yeniIs === "sec" ? (
        <div className="no-drag pano-cipler" role="group" aria-label={t("Proje hangi işe açılsın?")}>
          <span style={{ flexShrink: 0, fontSize: 12, color: c.textSecondary, alignSelf: "center" }}>{t("Hangi işe?")}</span>
          {(isler ?? []).map((j) => (
            <button key={j.id} type="button" title={j.title} onClick={() => setYeniIs(j.id)} style={cip(false)}>
              {j.title}
            </button>
          ))}
          <button type="button" aria-label={t("Vazgeç")} title={t("Vazgeç")} onClick={() => setYeniIs(null)} style={{ ...cip(false), display: "flex", alignItems: "center" }}>
            <IconX size={11} color="currentColor" />
          </button>
        </div>
      ) : projeliIsler.length > 1 && (
        <div className="no-drag pano-cipler" role="group" aria-label={t("İşe göre süz")}>
          <button type="button" aria-pressed={!secili} onClick={() => setIsId(null)} style={cip(!secili)}>
            {t("Tümü")}
          </button>
          {projeliIsler.map((j) => (
            <button key={j.id} type="button" aria-pressed={secili === j.id} title={j.title} onClick={() => setIsId(j.id)} style={cip(secili === j.id)}>
              {j.title}
            </button>
          ))}
        </div>
      )}
      <KapakSeridi ogeler={sirali.map((p) => ({ id: p.id, ad: p.title, arka: coverBackground(p.coverImageUrl, p.id), hedef: `/projects/${p.id}` }))} />
      {/* Liste sayfa yenilenmeden tazelenir: modal notifySidebarChanged yayar, kaynaklar onu dinliyor. */}
      {yeniIs && yeniIs !== "sec" && <CreateProjectModal jobId={yeniIs} onClose={() => setYeniIs(null)} onCreated={() => {}} />}
    </>
  );
}

const YENI_PROJE_OLAYI = "projelio:pano-yeni-proje";

function projeHizliEylemi(t: ReturnType<typeof useT>): PanoKartTanimi["hizliEylem"] {
  return { ad: t("Yeni proje"), calistir: () => window.dispatchEvent(new Event(YENI_PROJE_OLAYI)) };
}

/** Her iş ayrı istek: kalabalık şirkette anasayfa onlarca çağrıyla açılmasın. */
const SIRKET_PROJE_IS_TAVANI = 30;

/** Şirketin projeleri: işleri üzerinden, kişinin görebildikleriyle sınırlı. */
function SirketProjeleriOzeti({ organizationId }: { organizationId: string }) {
  const { veri, yenile } = useOzet(
    // İş iş soruluyor: "/projects" yalnızca kişinin sahibi ya da üyesi olduklarını
    // döner, şirket sahibi ekibinin açtığı projeleri orada göremezdi.
    () =>
      api.get<Job[]>(`/organizations/${organizationId}/jobs`).then((isler) => {
        const taranan = isler.slice(0, SIRKET_PROJE_IS_TAVANI);
        return Promise.all(taranan.map((j) => api.get<Project[]>(`/jobs/${j.id}/projects`).catch(() => [] as Project[]))).then((listeler) => ({ isler: taranan, projeler: listeler.flat() }));
      }),
    [organizationId]
  );
  // Karttan proje açılınca (CreateProjectModal yayar) liste tazelenir.
  const yenileRef = useRef(yenile);
  yenileRef.current = yenile;
  useEffect(() => onSidebarChanged(() => yenileRef.current()), []);
  return <ProjelerGovdesi projeler={veri?.projeler ?? null} isler={veri?.isler} />;
}

/**
 * Panoda tek kart, ama içi eski iş/proje kartı: kayıtlar bu kartın içinde tek
 * tek çevrilir, yıldızlı olan kart açıldığında önde gelir.
 */
function DesteKarti<T extends { id: string }>({
  ad,
  Icon,
  tumu,
  ogeler,
  yildizlar,
  yildizla,
  ciz,
}: {
  ad: string;
  Icon: typeof IconFolder;
  tumu: string;
  ogeler: T[];
  yildizlar: Set<string>;
  yildizla: (id: string) => void;
  ciz: (oge: T) => ReactNode;
}) {
  const c = useThemeColors();
  const t = useT();
  const [seciliId, setSeciliId] = useState<string | null>(null);
  const sirali = [...ogeler].sort((a, b) => Number(yildizlar.has(b.id)) - Number(yildizlar.has(a.id)));
  const sira = Math.max(0, sirali.findIndex((o) => o.id === seciliId));
  const oge = sirali[sira];
  const cevir = (yon: number) => setSeciliId(sirali[(sira + yon + sirali.length) % sirali.length].id);
  const hapStili = { background: c.surface, border: `1px solid ${c.border}`, borderRadius: 999, color: c.textPrimary, fontSize: 13 } as const;
  const okStili = { width: 26, height: 26, padding: 0, border: "none", background: "transparent", color: c.textSecondary, display: "flex", alignItems: "center", justifyContent: "center" } as const;
  const yildizli = oge ? yildizlar.has(oge.id) : false;
  const yildizAdi = yildizli ? t("Yıldızı kaldır") : t("Yıldızla");
  return (
    <div className="pano-isler">
      {oge ? (
        ciz(oge)
      ) : (
        <Link to={tumu} draggable={false} className="entity-card" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: c.textSecondary, fontSize: 14 }}>
          {t("Henüz kayıt yok")}
        </Link>
      )}
      <Link to={tumu} draggable={false} style={{ ...hapStili, position: "absolute", top: 10, left: 10, padding: "4px 10px", display: "flex", alignItems: "center", gap: 6, fontWeight: 500, textDecoration: "none" }}>
        <Icon size={14} color={c.accentDark} />
        {ad} <span style={{ color: c.textSecondary, fontWeight: 400 }}>{ogeler.length}</span>
      </Link>
      {oge && (
        <button type="button" onClick={() => yildizla(oge.id)} aria-pressed={yildizli} aria-label={yildizAdi} title={yildizAdi} style={{ ...hapStili, position: "absolute", top: 66, left: 10, width: 28, height: 28, padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <IconStar size={15} color={yildizli ? c.accent : c.textSecondary} filled={yildizli} />
        </button>
      )}
      {sirali.length > 1 && (
        <div className="no-drag" style={{ ...hapStili, position: "absolute", top: 66, right: 10, display: "flex", alignItems: "center", fontSize: 12 }}>
          <button type="button" onClick={() => cevir(-1)} aria-label={t("Önceki")} title={t("Önceki")} style={okStili}>
            <IconChevronLeft size={14} color="currentColor" />
          </button>
          <span style={{ whiteSpace: "nowrap" }}>{sira + 1}/{sirali.length}</span>
          <button type="button" onClick={() => cevir(1)} aria-label={t("Sonraki")} title={t("Sonraki")} style={okStili}>
            <IconChevronRight size={14} color="currentColor" />
          </button>
        </div>
      )}
    </div>
  );
}

function KisiselKasaOzeti({ boyut }: { boyut: PanoBoyut }) {
  const c = useThemeColors();
  const t = useT();
  const { veri: paket, durum } = useOzet(
    () => Promise.all([api.get<BudgetOverview>("/budget/overview"), api.get<BudgetTransaction[]>("/budget/transactions").catch(() => [] as BudgetTransaction[])]),
    []
  );
  const veri = paket?.[0];
  const [sekme, setSekme] = useSekme<KasaSekmesi>("kasa_me", KASA_SEKMELERI, "tumu");
  const hareketler = useHareketOgeleri(paket?.[1] ?? [], "/?tab=budget", sekme === "gelir" ? "income" : sekme === "gider" ? "expense" : undefined);
  const sayi = sekme === "gelir" ? veri?.totalReceived : sekme === "gider" ? veri?.totalExpense : veri?.netEarned;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      <KasaSekmeleri sekme={sekme} onSec={setSekme} />
      <SayiYaDa durum={durum} boyut={boyut === "kucuk" ? 21 : 26}>{para(sayi ?? 0)}</SayiYaDa>
      {sekme === "tumu" && <Seritler
        yukseklik={11}
        parcalar={
          veri
            ? [
                { deger: veri.totalReceived, renk: c.success, ad: `${t("Tahsil edilen")}: ${para(veri.totalReceived)}` },
                { deger: veri.totalExpected, renk: c.accent, ad: `${t("Beklenen")}: ${para(veri.totalExpected)}` },
                { deger: veri.totalExpense, renk: c.danger, ad: `${t("Gider")}: ${para(veri.totalExpense)}` },
              ]
            : []
        }
      />}
      <SonListe ogeler={hareketler} />
    </div>
  );
}

/**
 * Kartın içindeki tek görev — kanbandaki kartın küçük kopyası (kullanıcı isteği,
 * 2026-11-09: "anasayfa ve kanban bütünlük içinde olsun"): aynı yüzey, aynı
 * sol renk şeridi (durum rengi), aynı yuvarlak tik. Adına basınca yerine gider.
 */
function GorevSatiri({ gorev, alt, onTamamla }: { gorev: PersonalBoardItem; alt?: boolean; onTamamla: () => void }) {
  const c = useThemeColors();
  const t = useT();
  const simdi = new Date();
  const hedef = gorev.projectId ? `/projects/${gorev.projectId}` : `/tasks?focus=${gorev.itemId}`;
  const serit = gorev.status === "in_progress" ? c.primary : c.textSecondary;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, marginLeft: alt ? 16 : 0, padding: alt ? "5px 9px" : "8px 10px", borderRadius: 8, border: `1px solid ${c.border}`, borderLeft: `3px solid ${serit}`, background: c.surface }}>
      <button type="button" onClick={onTamamla} aria-label={t("Tamamlandı olarak işaretle")} title={t("Tamamlandı olarak işaretle")} style={{ width: alt ? 15 : 18, height: alt ? 15 : 18, padding: 0, borderRadius: "50%", border: `1.5px solid ${c.border}`, background: "transparent", flexShrink: 0 }} />
      <Link to={hedef} draggable={false} style={{ flex: 1, minWidth: 0, fontSize: alt ? 13 : 14, color: c.textPrimary, textDecoration: "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {gorev.title}
      </Link>
      {gorev.effectiveDueDate && (
        <span style={{ flexShrink: 0, fontSize: 12, color: gecikmisMi(gorev.effectiveDueDate, simdi) ? c.danger : c.textSecondary }}>{kisaTarih(gorev.effectiveDueDate)}</span>
      )}
    </div>
  );
}

/**
 * Kişinin yapılacakları: kanbanın "Yapılacak" ve "Devam eden" kartları, liste
 * sekmeleri (kanbanla aynı listeler), yerinde tik ve kanbandaki gibi
 * "+ Görev ekle". Açık listeden eklenen kart o listeye girer.
 */
function YapilacaklarKarti() {
  const c = useThemeColors();
  const t = useT();
  const { veri, durum } = useOzet(() => api.get<PersonalBoardItem[]>("/todos/board?source=all"), []);
  const listeler = useYapilacakListeleri();
  const [liste, setListe] = useState<PersonalBoardItem[]>([]);
  const [seciliListe, setSeciliListeHam] = useState<string>(() => {
    try {
      return localStorage.getItem("projelio_pano_yapilacak_listesi") ?? "";
    } catch {
      return "";
    }
  });
  const setSeciliListe = (id: string) => {
    setSeciliListeHam(id);
    try {
      localStorage.setItem("projelio_pano_yapilacak_listesi", id);
    } catch {
      // Hatırlanmazsa kart Tümü'yle açılır.
    }
  };
  const [ekleniyor, setEkleniyor] = useState(false);
  const [yeni, setYeni] = useState("");
  useEffect(() => {
    if (veri) setListe(veri);
  }, [veri]);
  // Silinmiş bir liste hatırlandıysa Tümü'ne dön.
  const etkinListe = listeler.listeler.some((l) => l.id === seciliListe) ? seciliListe : "";

  const gorunen = listedekiler(liste, etkinListe);
  const acik = gorunen.filter((g) => g.status !== "completed" && !g.isHidden).sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || a.sortOrder - b.sortOrder);
  const acikKimlikler = new Set(acik.map((g) => g.itemId));
  const koklar = acik.filter((g) => !g.parentTaskId || !acikKimlikler.has(g.parentTaskId));
  const altlari = (id: string) => acik.filter((g) => g.parentTaskId === id);
  const biten = gorunen.length - gorunen.filter((g) => g.status !== "completed").length;

  const tazele = () => api.get<PersonalBoardItem[]>("/todos/board?source=all").then(setListe).catch(() => {});
  const tamamla = (g: PersonalBoardItem) => {
    setListe((l) => l.map((x) => (x.itemId === g.itemId ? { ...x, status: "completed" } : x)));
    api.patch("/todos/status", { source: g.source, itemId: g.itemId, status: "completed" }).catch(tazele);
  };
  const ekle = async () => {
    const title = yeni.trim();
    setYeni("");
    if (!title) {
      setEkleniyor(false);
      return;
    }
    try {
      await api.post("/todos", { title, status: "todo", listeId: etkinListe || undefined });
      await tazele();
    } catch {
      // Eklenemediyse yazılan kaybolmasın.
      setYeni(title);
    }
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 8 }}>
      <YapilacakListeSekmeleri
        kucuk
        listeler={listeler.listeler}
        secili={etkinListe}
        onSec={setSeciliListe}
        onOlustur={listeler.olustur}
        onAdlandir={listeler.adlandir}
        onSil={(id) => void listeler.sil(id).then(tazele)}
      />
      <YanYana sol={<SayiYaDa durum={durum}>{acik.length}</SayiYaDa>} sag={<Halka oran={gorunen.length ? biten / gorunen.length : 0} renk={c.success} boyut={36} />} />
      <div className="no-drag" style={{ flex: 1, minHeight: 60, maxHeight: 210, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
        {koklar.map((g) => (
          <div key={g.itemId} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <GorevSatiri gorev={g} onTamamla={() => tamamla(g)} />
            {altlari(g.itemId).map((a) => (
              <GorevSatiri key={a.itemId} gorev={a} alt onTamamla={() => tamamla(a)} />
            ))}
          </div>
        ))}
      </div>
      {/* Kanbandaki "+ Görev ekle"nin aynısı: düğme yazma kutusuna döner, Enter ekler, Esc vazgeçer. */}
      <div className="no-drag">
        {ekleniyor ? (
          <AutoGrowTextarea
            autoFocus
            value={yeni}
            onChange={setYeni}
            onSubmit={() => void ekle()}
            onCancel={() => {
              setEkleniyor(false);
              setYeni("");
            }}
            onBlur={() => void ekle()}
            placeholder={t("Görev başlığı yaz, Enter'a bas")}
            maxLength={200}
            minHeight={34}
            fontSize={14}
          />
        ) : (
          <button type="button" onClick={() => setEkleniyor(true)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 6, padding: "7px 8px", borderRadius: 8, border: "none", background: "transparent", color: c.textSecondary, fontSize: 14 }}>
            <IconPlus size={14} color={c.textSecondary} />
            {t("Görev ekle")}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Bir kart için onlarca iş tek tek sorgulanmasın diye tavan: anasayfa her
 * açılışta yükleniyor, tam liste ise Dosyalar görünümünün işi.
 */
const DOSYA_OZETI_IS_TAVANI = 12;

function KisiselDosyalarOzeti({ isler }: { isler: Job[] }) {
  const taranan = isler.slice(0, DOSYA_OZETI_IS_TAVANI);
  const { veri, durum } = useOzet(
    () =>
      Promise.all(taranan.map((j) => filesApi.listByJob(j.id, { scope: "all" }).catch(() => [] as ProjectFile[]))).then((l) => l.flat()),
    [taranan.map((j) => j.id).join(",")]
  );
  const t = useT();
  const [sekme, setSekme] = useSekme<"tumu" | "projeler" | "isler">("dosya_me", ["tumu", "projeler", "isler"], "tumu");
  // Proje klasöründeki dosya projectId taşır; taşımayan işin kendi klasöründedir.
  const gorunen = veri?.filter((f) => (sekme === "projeler" ? f.projectId : sekme === "isler" ? !f.projectId : true));
  return (
    <>
      <SekmeCipleri
        etiket={t("Dosya türü")}
        secili={sekme}
        onSec={setSekme}
        sekmeler={[
          { id: "tumu", ad: t("Tümü") },
          { id: "projeler", ad: t("Proje dosyaları"), sayi: veri?.filter((f) => f.projectId).length },
          { id: "isler", ad: t("İş dosyaları"), sayi: veri?.filter((f) => !f.projectId).length },
        ]}
      />
      <DosyaGovdesi dosyalar={gorunen} durum={durum} fazlasiVar={isler.length > DOSYA_OZETI_IS_TAVANI} />
    </>
  );
}

/** Tek bir projenin kapaklı kartı. */
function KapakliKart({ ad, kapak, tohum, alt }: { ad: string; kapak?: string; tohum: string; alt?: ReactNode }) {
  const c = useThemeColors();
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 130 }}>
      <div style={{ flex: 1, minHeight: 66, background: coverBackground(kapak, tohum), backgroundSize: "cover", backgroundPosition: "center" }} />
      <div style={{ padding: "9px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, minWidth: 0 }}>
        <span style={{ fontSize: 14, color: c.textPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ad}</span>
        {alt}
      </div>
    </div>
  );
}

function ProjeDurumNoktasi({ durum }: { durum: Project["status"] }) {
  const c = useThemeColors();
  const renk = durum === "completed" ? c.success : durum === "active" ? c.accent : c.textSecondary;
  return <span style={{ width: 9, height: 9, borderRadius: "50%", background: renk, flexShrink: 0 }} />;
}

// ─── Katalog ─────────────────────────────────────────────────────────────────

function modulKimligi(key: string): string {
  return `modul:${key}`;
}

/** Sekmeli modül: kartın üstünde modülün sekmeleri çıkar (bkz. ModulSekmeKartlari). */
function sekmeliModulMu(key: string): boolean {
  return key === MUSTERI_MODUL_KEY || key === BAGLANTI_MODUL_KEY;
}

function sekmeliModulKarti(key: string, kok: string, hedef: string) {
  return key === MUSTERI_MODUL_KEY ? <MusteriModulKarti kok={kok} hedef={hedef} /> : <BaglantiModulKarti kok={kok} hedef={hedef} />;
}

/** Sadelik varsayılanın kendisi: modül ve araç kartları rafta bekler, isteyen ekler. */
export const SIRKET_VARSAYILAN_PANO: PanoKart[] = [
  { id: "kasa", boyut: "orta" },
  { id: "yapilacaklar", boyut: "kucuk" },
  { id: "takvim", boyut: "kucuk" },
  { id: "projeler", boyut: "orta" },
  { id: "musteri-haritasi", boyut: "orta" },
  { id: "modul:pd_email", boyut: "orta" },
  { id: "pomodoro", boyut: "kucuk" },
  { id: "ofis", boyut: "kucuk" },
  { id: "haber", boyut: "orta" },
  { id: "doviz", boyut: "kucuk" },
  { id: "borsa", boyut: "kucuk" },
  { id: "gorevler", boyut: "kucuk" },
  { id: "ekip", boyut: "kucuk" },
  { id: "departmanlar", boyut: "orta" },
  // Tam satır: önündeki satırlar dolu bitsin ki geniş kartın üstünde boş hücre kalmasın.
  { id: "not", boyut: "genis" },
  { id: "moduller", boyut: "kucuk" },
  { id: "urunler", boyut: "kucuk" },
  { id: "dosyalar", boyut: "kucuk" },
  { id: "akis", boyut: "kucuk" },
];

export const SERBEST_VARSAYILAN_PANO: PanoKart[] = [
  { id: "kasa", boyut: "orta" },
  { id: "gorevler", boyut: "kucuk" },
  { id: "takvim", boyut: "kucuk" },
  { id: "isler", boyut: "kucuk" },
  { id: "projeler", boyut: "orta" },
  { id: "modul:pd_email", boyut: "orta" },
  { id: "pomodoro", boyut: "kucuk" },
  { id: "ofis", boyut: "kucuk" },
  { id: "moduller", boyut: "kucuk" },
  { id: "dosyalar", boyut: "kucuk" },
  { id: "not", boyut: "genis" },
];

const YAPILACAKLAR = (ad: string, id: string): PanoKartTanimi => ({ id, ad, grup: "temel", Icon: IconListCheck, boyut: "kucuk", satir: 2, etkilesimli: true, hedef: "/tasks", ciz: () => <YapilacaklarKarti /> });

/**
 * Ofis görüntüsü kendi en-boy oranında: kart yalnızca yana genişleyince görsel
 * küçük kalıp iki yanı boşalıyordu. Orta iki, geniş üç satır boyunda.
 */
const ofisSatiri = (b: PanoBoyut) => (b === "kucuk" ? 1 : b === "orta" ? 2 : 3);

/** Kart rafı bir işin bütün projeleriyle dolup taşmasın. */
const RAF_TAVANI = 20;

function useModulIstatistikleri(yol: string) {
  const [moduller, setModuller] = useState<ModuleUsageStat[] | null>(null);
  useEffect(() => {
    let iptal = false;
    api
      .get<ModuleStatsResponse>(yol)
      .then((s) => {
        if (!iptal) setModuller(s.modules);
      })
      .catch(() => {
        if (!iptal) setModuller([]);
      });
    return () => {
      iptal = true;
    };
  }, [yol]);
  return moduller;
}

function kasaHizliEylemi(t: ReturnType<typeof useT>): PanoKartTanimi["hizliEylem"] {
  // Modül kartlarıyla aynı yol: taslak Lio'ya yazılır, göndermek kişide.
  return { ad: t("Yeni kayıt"), calistir: () => askLioDraft(t("Kasaya yeni kayıt eklemek istiyorum: ")) };
}

function modulHizliEylemi(t: ReturnType<typeof useT>, modul: ModuleUsageStat): PanoKartTanimi["hizliEylem"] {
  return {
    ad: t("Yeni kayıt"),
    // Taslak olarak yazılır: Lio her modülün kaydını açabiliyor, göndermek kişide.
    calistir: () => askLioDraft(t("{modul} modülüne yeni kayıt eklemek istiyorum: ", { modul: modul.moduleName })),
  };
}

export function useSirketKatalogu({
  organizationId,
  access,
  hiddenTabs,
  departmanlar,
  departmanlarHazir,
  modulKatalogu,
  projeAlaniAcik,
}: {
  organizationId: string;
  access?: OrganizationAccess;
  hiddenTabs?: string[];
  /** Şirket proje alanı açık mı (Organization.projeAlani, migration 191). */
  projeAlaniAcik?: boolean;
  departmanlar: Department[];
  departmanlarHazir: boolean;
  modulKatalogu: ModuleCatalogEntry[];
}): PanoKartTanimi[] {
  const t = useT();
  const prefs = useAppPrefs();
  const moduller = useModulIstatistikleri(`/organizations/${organizationId}/module-stats`);
  return useMemo(() => {
    const kok = `/organizations/${organizationId}`;
    // Görünürlük sekmelerle AYNI kuraldan geçer: yetkisi olmayana kart da çıkmaz.
    const acik = new Set(visibleOrgTabs(access, hiddenTabs, projeAlaniAcik).map((s) => s.key));
    const liste: PanoKartTanimi[] = [];
    const ekle = (kosul: boolean, tanim: PanoKartTanimi) => {
      if (kosul) liste.push(tanim);
    };
    // Modül bir departmana aittir: o kapsamda açılmazsa buraya girilen
    // kayıtlar departman sayfasında görünmez (bkz. lib/modulYeri.ts).
    const modulHedefi = (moduleKey: string) => {
      const giris = modulKatalogu.find((e) => e.key === moduleKey);
      const departmanId = giris ? modulDepartmani(giris, departmanlar) : undefined;
      return departmanId ? `/departments/${departmanId}/modules/${moduleKey}` : `${kok}/modules/${moduleKey}`;
    };
    const musteriModulu = (moduller ?? []).some((m) => m.moduleKey === MUSTERI_MODUL_KEY);
    const baglantiModulu = (moduller ?? []).some((m) => m.moduleKey === BAGLANTI_MODUL_KEY);
    ekle(acik.has("budget"), { id: "kasa", ad: t("Kasa"), grup: "temel", Icon: IconWallet, boyut: "orta", hizliEylem: kasaHizliEylemi(t), hedef: `${kok}?tab=budget`, ciz: (b) => <SirketKasaOzeti organizationId={organizationId} boyut={b} /> });
    ekle(acik.has("tasks"), { id: "gorevler", ad: t("Görevler"), grup: "temel", Icon: IconListCheck, boyut: "kucuk", hedef: `${kok}?tab=tasks`, ciz: () => <GorevlerOzeti organizationId={organizationId} /> });
    ekle(true, { id: "departmanlar", ad: t("Departmanlar"), grup: "temel", Icon: IconBuilding, boyut: "kucuk", hedef: `${kok}?tab=departments`, ciz: (b) => <DepartmanlarOzeti departmanlar={departmanlarHazir ? departmanlar : null} boyut={b} tumu={`${kok}?tab=departments`} /> });
    ekle(access?.canViewCommercial !== false, { id: "ekip", ad: t("Ekip"), grup: "temel", Icon: IconUser, boyut: "kucuk", hedef: `${kok}?tab=team`, ciz: (b) => <EkipOzeti organizationId={organizationId} boyut={b} /> });
    ekle(acik.has("products"), { id: "urunler", ad: t("Ürün/Hizmet"), grup: "temel", Icon: IconStar, boyut: "kucuk", hedef: `${kok}?tab=products`, ciz: (b) => <UrunlerOzeti organizationId={organizationId} boyut={b} /> });
    ekle(true, { id: "moduller", ad: t("Modüller"), grup: "temel", Icon: IconSparkle, boyut: "kucuk", hedef: `${kok}?tab=modules`, ciz: (b) => <ModullerOzeti moduller={moduller ?? []} yukleniyor={moduller === null} hedefi={(m) => modulHedefi(m.moduleKey)} boyut={b} /> });
    ekle(musteriModulu || baglantiModulu, {
      id: "musteri-haritasi",
      ad: musteriModulu && baglantiModulu ? t("Harita") : musteriModulu ? t("Müşteriler") : t("Bağlantı ve İlişkiler"),
      grup: "temel",
      Icon: IconMap,
      boyut: "orta",
      satir: 2,
      // Karttaki boş yere değil, haritaya ve katman düğmelerine tıklanıyor.
      etkilesimli: true,
      hedef: modulHedefi(musteriModulu ? MUSTERI_MODUL_KEY : BAGLANTI_MODUL_KEY),
      ciz: () => (
        <Suspense fallback={null}>
          <MusteriHaritaOzeti organizationId={organizationId} musteriHedefi={musteriModulu ? modulHedefi(MUSTERI_MODUL_KEY) : undefined} baglantiHedefi={baglantiModulu ? modulHedefi(BAGLANTI_MODUL_KEY) : undefined} />
        </Suspense>
      ),
    });
    ekle(true, YAPILACAKLAR(t("Yapılacaklar"), "yapilacaklar"));
    ekle(true, { id: "projeler", ad: t("Projeler"), grup: "temel", Icon: IconActivity, boyut: "orta", sabitBoyut: "orta", hizliEylem: projeHizliEylemi(t), hedef: acik.has("projects") ? `${kok}?tab=projects` : `${kok}`, ciz: () => <SirketProjeleriOzeti organizationId={organizationId} /> });
    ekle(acik.has("files"), { id: "dosyalar", ad: t("Dosyalar"), grup: "temel", Icon: IconFile, boyut: "kucuk", hedef: `${kok}?tab=files`, ciz: () => <SirketDosyalarOzeti organizationId={organizationId} /> });
    ekle(acik.has("flow"), { id: "akis", ad: t("Sosyal"), grup: "temel", Icon: IconMessageCircle, boyut: "kucuk", hedef: `${kok}?tab=flow`, ciz: () => <AkisOzeti organizationId={organizationId} /> });
    ekle(true, { id: "ofis", ad: t("3D ofis"), grup: "temel", Icon: IconLayers, boyut: "kucuk", satir: ofisSatiri, tamKaplama: true, hedef: `/yeni?ofis=${encodeURIComponent(organizationId)}`, ciz: () => <OfisOzeti ad={t("3D ofis")} /> });
    ekle(prefs.showLio, { id: "lio", ad: t("Lio Bakiyesi"), grup: "temel", Icon: IconSparkle, boyut: "kucuk", hedef: "/settings/lio-units", ciz: () => <LioOzeti /> });
    liste.push(...aracTanimlari(t, organizationId), ...piyasaKartlari(t));
    for (const m of moduller ?? []) {
      liste.push({
        id: modulKimligi(m.moduleKey),
        ad: m.moduleName,
        grup: "modul",
        Icon: isMailModule(m.moduleKey) ? IconSend : IconSparkle,
        boyut: isMailModule(m.moduleKey) || sekmeliModulMu(m.moduleKey) ? "orta" : "kucuk",
        satir: isMailModule(m.moduleKey) || sekmeliModulMu(m.moduleKey) ? 2 : undefined,
        // Sekme çiplerine basılıyor: kart bağlantıya sarılmasın.
        etkilesimli: sekmeliModulMu(m.moduleKey) || undefined,
        // E-posta kartının kendi "Yeni e-posta" düğmesi var.
        hizliEylem: isMailModule(m.moduleKey) ? undefined : modulHizliEylemi(t, m),
        hedef: modulHedefi(m.moduleKey),
        ciz: (b) =>
          isMailModule(m.moduleKey) ? (
            <EpostaKarti organizationId={organizationId} hedef={modulHedefi(m.moduleKey)} adet={b === "kucuk" ? 3 : 5} />
          ) : sekmeliModulMu(m.moduleKey) ? (
            sekmeliModulKarti(m.moduleKey, kok, modulHedefi(m.moduleKey))
          ) : (
            <ModulOzeti modul={m} kok={kok} hedef={modulHedefi(m.moduleKey)} />
          ),
      });
    }
    return liste;
  }, [organizationId, access, hiddenTabs, projeAlaniAcik, departmanlar, departmanlarHazir, modulKatalogu, moduller, prefs.showLio, t]);
}

export function useSerbestKatalogu({ isler, projeler, pano }: { isler: Job[]; projeler: Project[]; pano: AnasayfaPano }): PanoKartTanimi[] {
  const t = useT();
  const prefs = useAppPrefs();
  const moduller = useModulIstatistikleri("/me/module-stats");
  const yildizAnahtari = pano.yildizlar.join(",");
  return useMemo(() => {
    const yildizlar = new Set(pano.yildizlar);
    const modulHedefi = (m: ModuleUsageStat) => (m.jobId ? `/jobs/${m.jobId}/modules/${m.moduleKey}` : "/?tab=modules");
    const liste: PanoKartTanimi[] = [
      { id: "kasa", ad: t("Kasa"), grup: "temel", Icon: IconWallet, boyut: "orta", hizliEylem: kasaHizliEylemi(t), hedef: "/?tab=budget", turCapasi: "dashboard-tab-budget", ciz: (b) => <KisiselKasaOzeti boyut={b} /> },
      YAPILACAKLAR(t("Yapılacaklar"), "gorevler"),
      { id: "isler", ad: t("İşler"), grup: "temel", Icon: IconBriefcase, boyut: "kucuk", sabitBoyut: "kucuk", satir: 2, tamKaplama: true, etkilesimli: true, hedef: "/?tab=jobs", turCapasi: "dashboard-tab-jobs", ciz: () => <DesteKarti ad={t("İşler")} Icon={IconBriefcase} tumu="/?tab=jobs" ogeler={isler} yildizlar={yildizlar} yildizla={pano.yildizla} ciz={(j) => <JobCard key={j.id} job={j} projectCount={j.projectCount ?? projeler.filter((p) => p.jobId === j.id).length} />} /> },
      { id: "projeler", ad: t("Projeler"), grup: "temel", Icon: IconActivity, boyut: "orta", sabitBoyut: "orta", hizliEylem: projeHizliEylemi(t), hedef: "/?tab=jobs", ciz: () => <ProjelerGovdesi projeler={projeler} isler={isler} yildizlar={yildizlar} /> },
      { id: "dosyalar", ad: t("Dosyalar"), grup: "temel", Icon: IconFile, boyut: "kucuk", hedef: "/?tab=files", turCapasi: "dashboard-tab-files", ciz: () => <KisiselDosyalarOzeti isler={isler} /> },
      { id: "moduller", ad: t("Modüller"), grup: "temel", Icon: IconSparkle, boyut: "kucuk", hedef: "/?tab=modules", turCapasi: "dashboard-tab-modules", ciz: (b) => <ModullerOzeti moduller={moduller ?? []} yukleniyor={moduller === null} hedefi={modulHedefi} boyut={b} /> },
      { id: "ofis", ad: t("3D stüdyo"), grup: "temel", Icon: IconLayers, boyut: "kucuk", satir: ofisSatiri, tamKaplama: true, hedef: "/yeni?ofis=studyo", ciz: () => <OfisOzeti ad={t("3D stüdyo")} /> },
    ];
    if (prefs.showLio) {
      liste.push({ id: "lio", ad: t("Lio Bakiyesi"), grup: "temel", Icon: IconSparkle, boyut: "kucuk", hedef: "/settings/lio-units", ciz: () => <LioOzeti /> });
    }
    liste.push(...aracTanimlari(t, "me"), ...piyasaKartlari(t));
    for (const p of projeler.slice(0, RAF_TAVANI)) {
      liste.push({
        id: `proje:${p.id}`,
        ad: p.title,
        grup: "proje",
        kapakArka: coverBackground(p.coverImageUrl, p.id),
        Icon: IconActivity,
        boyut: "kucuk",
        tamKaplama: true,
        hedef: `/projects/${p.id}`,
        ciz: () => <KapakliKart ad={p.title} kapak={p.coverImageUrl} tohum={p.id} alt={<ProjeDurumNoktasi durum={p.status} />} />,
      });
    }
    for (const m of moduller ?? []) {
      liste.push({
        id: modulKimligi(m.moduleKey),
        ad: m.moduleName,
        grup: "modul",
        Icon: isMailModule(m.moduleKey) ? IconSend : IconSparkle,
        boyut: isMailModule(m.moduleKey) || (m.jobId && sekmeliModulMu(m.moduleKey)) ? "orta" : "kucuk",
        satir: isMailModule(m.moduleKey) || (m.jobId && sekmeliModulMu(m.moduleKey)) ? 2 : undefined,
        etkilesimli: (m.jobId && sekmeliModulMu(m.moduleKey)) || undefined,
        // E-posta kartının kendi "Yeni e-posta" düğmesi var.
        hizliEylem: isMailModule(m.moduleKey) ? undefined : modulHizliEylemi(t, m),
        hedef: modulHedefi(m),
        ciz: (b) =>
          isMailModule(m.moduleKey) ? (
            <EpostaKarti hedef={modulHedefi(m)} adet={b === "kucuk" ? 3 : 5} />
          ) : m.jobId && sekmeliModulMu(m.moduleKey) ? (
            sekmeliModulKarti(m.moduleKey, `/jobs/${m.jobId}`, modulHedefi(m))
          ) : (
            <ModulOzeti modul={m} kok={m.jobId ? `/jobs/${m.jobId}` : undefined} hedef={modulHedefi(m)} />
          ),
      });
    }
    return liste;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isler, projeler, moduller, prefs.showLio, t, yildizAnahtari]);
}
