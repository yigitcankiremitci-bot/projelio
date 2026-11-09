import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type {
  BudgetOverview,
  ButceSayfasi,
  Department,
  Job,
  ModuleCatalogEntry,
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
import { api } from "../../api/client";
import { aiChat } from "../../api/aiChat";
import { filesApi } from "../../api/files";
import { iseAlimApi } from "../../api/iseAlim";
import { useThemeColors } from "../../theme/useThemeColors";
import { useAppPrefs } from "../../lib/appPrefs";
import { askLioDraft } from "../../lib/askLio";
import { coverBackground } from "../../lib/covers";
import { useT } from "../../lib/i18n";
import { bicimDili } from "../../lib/i18n/depo";
import { modulDepartmani } from "../../lib/modulYeri";
import { useRefreshOnUndo } from "../../lib/undo";
import { visibleOrgTabs } from "../OrgTabs";
import {
  IconActivity,
  IconBriefcase,
  IconBuilding,
  IconDoor,
  IconFile,
  IconFolder,
  IconInfo,
  IconLayers,
  IconListCheck,
  IconMessageCircle,
  IconPlus,
  IconSparkle,
  IconStar,
  IconUser,
  IconWallet,
} from "../icons";
import { Cubuklar, Halka, KartRozeti, Kareler, KisiYigini, Sayi, Seritler, YanYana, ozetRengi } from "./gorselOzet";
import { aracTanimlari } from "./panoAraclari";

/** Panoda çizilebilecek bir kart. Liste kullanıcının yetkisine göre kurulur. */
export interface PanoKartTanimi {
  id: string;
  ad: string;
  grup: "temel" | "modul" | "arac" | "is" | "proje";
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
  /** Simge tek başına anlatamıyorsa ad da yazılır: yirmi modülün yirmi simgesi yok. */
  adGoster?: boolean;
  /** Sağ üstte kartı açmadan yapılan tek iş. */
  hizliEylem?: { ad: string; calistir: () => void };
  ciz: (boyut: PanoBoyut) => ReactNode;
}

type Durum = "yukleniyor" | "hazir" | "hata";

function useOzet<T>(yukle: () => Promise<T>, deps: unknown[]): { veri?: T; durum: Durum } {
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
  return sonuc;
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
  const { veri, durum } = useOzet(() => aiChat.getCredits(), []);
  return (
    <YanYana
      sol={<SayiYaDa durum={durum}>{veri ? Math.floor(veri.balance).toLocaleString(bicimDili()) : "–"}</SayiYaDa>}
      sag={<img src="/lio-open.png" alt="" draggable={false} style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover" }} />}
    />
  );
}

/** Ofisin kuşbakışı çizimi; renkler temadan, karanlıkta da oda seçilsin. */
function OfisOzeti() {
  const c = useThemeColors();
  return (
    <div style={{ position: "relative", flex: 1, minHeight: 130, background: c.background, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg viewBox="0 0 160 120" width="100%" height="100%" style={{ position: "absolute", inset: 0 }} aria-hidden="true">
        <path d="M80 16 148 54 80 92 12 54z" fill={c.border} />
        <path d="M12 54v14l68 38V92z" fill={ozetRengi("ofis-sol")} opacity={0.75} />
        <path d="M148 54v14l-68 38V92z" fill={c.accent} opacity={0.8} />
        <path d="M64 56 84 45l20 11-20 11z" fill={c.accent} />
        <path d="M64 56v7l20 11v-7z" fill={c.accentDark} />
        <path d="M84 67v7l20-11v-7z" fill={c.accentDark} opacity={0.7} />
        <circle cx="52" cy="42" r="6" fill={ozetRengi("a")} />
        <rect x="47" y="48" width="10" height="14" rx="4" fill={ozetRengi("a")} opacity={0.75} />
        <circle cx="116" cy="38" r="6" fill={ozetRengi("bb")} />
        <rect x="111" y="44" width="10" height="14" rx="4" fill={ozetRengi("bb")} opacity={0.75} />
      </svg>
      <span style={{ position: "absolute", right: 10, bottom: 10, width: 32, height: 32, borderRadius: "50%", background: c.surface, border: `1px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <IconDoor size={16} color={c.accentDark} />
      </span>
    </div>
  );
}

function ModulOzeti({ modul }: { modul: ModuleUsageStat }) {
  const renk = ozetRengi(modul.moduleKey);
  return (
    <YanYana
      sol={<Sayi>{modul.recordCount.toLocaleString(bicimDili())}</Sayi>}
      sag={<Kareler renkler={Array.from({ length: Math.min(modul.recordCount, 12) }, () => renk)} />}
    />
  );
}

function ModullerOzeti({ moduller, yukleniyor }: { moduller: ModuleUsageStat[]; yukleniyor: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <SayiYaDa durum={yukleniyor ? "yukleniyor" : "hazir"}>{moduller.length}</SayiYaDa>
      <Seritler parcalar={moduller.map((m) => ({ deger: Math.max(1, m.recordCount), renk: ozetRengi(m.moduleKey), ad: m.moduleName }))} />
    </div>
  );
}

function GorevHalkasi({ durum, toplam, biten, geciken }: { durum: Durum; toplam: number; biten: number; geciken: number }) {
  const c = useThemeColors();
  const t = useT();
  if (durum === "hata") return <SayiYaDa durum={durum}>{null}</SayiYaDa>;
  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <Halka oran={toplam ? biten / toplam : 0} renk={c.success}>
        {durum === "yukleniyor" ? "–" : `${biten}/${toplam}`}
      </Halka>
      {geciken > 0 && (
        <KartRozeti renk={c.danger} baslik={t("{adet} görev gecikti", { adet: geciken })}>
          <IconInfo size={14} color={c.danger} /> {geciken}
        </KartRozeti>
      )}
    </div>
  );
}

// ─── Şirket kartları ─────────────────────────────────────────────────────────

function DepartmanlarOzeti({ departmanlar }: { departmanlar: Department[] | null }) {
  return (
    <YanYana
      sol={<SayiYaDa durum={departmanlar ? "hazir" : "yukleniyor"}>{departmanlar?.length}</SayiYaDa>}
      sag={<Kareler renkler={(departmanlar ?? []).map((d) => ozetRengi(d.id))} />}
    />
  );
}

function EkipOzeti({ organizationId }: { organizationId: string }) {
  const c = useThemeColors();
  const t = useT();
  const { veri, durum } = useOzet<SirketEkibi>(() => iseAlimApi.ekip(organizationId), [organizationId]);
  const bekleyen = veri?.bekleyenDavetler.length ?? 0;
  return (
    <>
      <YanYana
        sol={<SayiYaDa durum={durum}>{veri?.uyeler.length}</SayiYaDa>}
        sag={<KisiYigini kisiler={(veri?.uyeler ?? []).map((u) => ({ ad: u.fullName, foto: u.avatarUrl }))} />}
      />
      {bekleyen > 0 && (
        <KartRozeti renk={c.accentDark} baslik={t("{adet} davet bekliyor", { adet: bekleyen })}>
          <IconPlus size={13} color={c.accentDark} /> {bekleyen}
        </KartRozeti>
      )}
    </>
  );
}

function UrunlerOzeti({ organizationId }: { organizationId: string }) {
  const c = useThemeColors();
  const { veri, durum } = useOzet(() => api.get<Product[]>(`/organizations/${organizationId}/products`), [organizationId]);
  return (
    <YanYana
      sol={<SayiYaDa durum={durum}>{veri?.length}</SayiYaDa>}
      sag={
        <div style={{ display: "flex", gap: 4 }}>
          {(veri ?? []).slice(0, 3).map((u) => (
            <span key={u.id} title={u.name} style={{ width: 34, height: 34, borderRadius: 8, overflow: "hidden", flexShrink: 0, background: u.coverImageUrl ? c.background : ozetRengi(u.id) }}>
              {u.coverImageUrl && <img src={u.coverImageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
            </span>
          ))}
        </div>
      }
    />
  );
}

function GorevlerOzeti({ organizationId }: { organizationId: string }) {
  const { veri, durum } = useOzet(() => api.get<Task[]>(`/organizations/${organizationId}/tasks`), [organizationId]);
  const simdi = new Date();
  const liste = veri ?? [];
  const acik = liste.filter((g) => g.status !== "completed");
  return <GorevHalkasi durum={durum} toplam={liste.length} biten={liste.length - acik.length} geciken={acik.filter((g) => gecikmisMi(g.deadline, simdi)).length} />;
}

function SirketKasaOzeti({ organizationId, boyut }: { organizationId: string; boyut: PanoBoyut }) {
  const c = useThemeColors();
  const { veri, durum } = useOzet(() => api.get<ButceSayfasi>(`/budget/scope/organization/${organizationId}`), [organizationId]);
  // Kur dönüşümü YOK (bkz. CLAUDE.md "Bütçe"): tek bir toplam uydurulmaz, ana
  // sayı ₺ bakiyesi; çubuklar da yalnızca aynı birimin dönemlerinden çizilir.
  const tablolar = veri?.tTablolari ?? [];
  const ana = tablolar.find((x) => x.currency === "TRY") ?? tablolar[0];
  const donemler = (veri?.donemler ?? []).filter((d) => d.currency === ana?.currency).slice(boyut === "kucuk" ? -4 : -8);
  return (
    <YanYana
      sol={<SayiYaDa durum={durum} boyut={boyut === "kucuk" ? 21 : 26}>{para(ana?.bakiye ?? 0, ana?.currency)}</SayiYaDa>}
      sag={donemler.length > 1 ? <Cubuklar degerler={donemler.map((d) => d.net)} renk={c.accent} /> : ana ? <div style={{ width: 90 }}><Seritler parcalar={[{ deger: ana.gelirToplam, renk: c.success }, { deger: ana.giderToplam, renk: c.danger }]} /></div> : undefined}
    />
  );
}

function SirketDosyalarOzeti({ organizationId }: { organizationId: string }) {
  const { veri, durum } = useOzet(() => filesApi.listByOrganization(organizationId), [organizationId]);
  return <DosyaGovdesi dosyalar={veri} durum={durum} />;
}

/** Dosya türü adından okunur: kartın işi kaba bir dağılım, kesin sınıflama değil. */
function dosyaTuru(ad: string): "gorsel" | "belge" | "tablo" | "diger" {
  const uzanti = ad.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "heic"].includes(uzanti)) return "gorsel";
  if (["pdf", "doc", "docx", "txt", "ppt", "pptx"].includes(uzanti)) return "belge";
  if (["xls", "xlsx", "csv"].includes(uzanti)) return "tablo";
  return "diger";
}

function DosyaGovdesi({ dosyalar, durum, fazlasiVar }: { dosyalar?: ProjectFile[]; durum: Durum; fazlasiVar?: boolean }) {
  const c = useThemeColors();
  const sayac = { gorsel: 0, belge: 0, tablo: 0, diger: 0 };
  for (const f of dosyalar ?? []) sayac[dosyaTuru(f.name)]++;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <SayiYaDa durum={durum}>{dosyalar ? `${dosyalar.length}${fazlasiVar ? "+" : ""}` : undefined}</SayiYaDa>
      <Seritler
        parcalar={[
          { deger: sayac.belge, renk: ozetRengi("belge") },
          { deger: sayac.gorsel, renk: c.accent },
          { deger: sayac.tablo, renk: c.success },
          { deger: sayac.diger, renk: c.textSecondary },
        ]}
      />
    </div>
  );
}

function AkisOzeti({ organizationId }: { organizationId: string }) {
  const { veri, durum } = useOzet(() => api.get<ProjectPost[]>(`/organizations/${organizationId}/posts`), [organizationId]);
  const yazarlar = [...new Set((veri ?? []).map((p) => p.authorName).filter(Boolean))];
  return <YanYana sol={<SayiYaDa durum={durum}>{veri?.length}</SayiYaDa>} sag={<KisiYigini kisiler={yazarlar.map((ad) => ({ ad }))} en={3} />} />;
}

// ─── Serbest çalışan kartları ────────────────────────────────────────────────

function IslerOzeti({ isler, boyut }: { isler: Job[]; boyut: PanoBoyut }) {
  const c = useThemeColors();
  const adet = boyut === "kucuk" ? 2 : boyut === "orta" ? 4 : 8;
  return (
    <YanYana
      sol={<Sayi>{isler.length}</Sayi>}
      sag={
        <div style={{ display: "flex", gap: 5 }}>
          {isler.slice(0, adet).map((j) => (
            <span key={j.id} title={j.title} style={{ width: 40, height: 40, borderRadius: 9, flexShrink: 0, border: `1px solid ${c.border}`, background: coverBackground(j.coverImageUrl, j.id), backgroundSize: "cover" }} />
          ))}
        </div>
      }
    />
  );
}

function KisiselKasaOzeti({ boyut }: { boyut: PanoBoyut }) {
  const c = useThemeColors();
  const t = useT();
  const { veri, durum } = useOzet(() => api.get<BudgetOverview>("/budget/overview"), []);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <SayiYaDa durum={durum} boyut={boyut === "kucuk" ? 21 : 26}>{para(veri?.netEarned ?? 0)}</SayiYaDa>
      <Seritler
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
      />
    </div>
  );
}

function KisiselGorevlerOzeti() {
  const { veri, durum } = useOzet(() => api.get<PersonalBoardItem[]>("/todos/board?source=all"), []);
  const simdi = new Date();
  const liste = veri ?? [];
  const acik = liste.filter((g) => g.status !== "completed");
  return <GorevHalkasi durum={durum} toplam={liste.length} biten={liste.length - acik.length} geciken={acik.filter((g) => gecikmisMi(g.effectiveDueDate, simdi)).length} />;
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
  return <DosyaGovdesi dosyalar={veri} durum={durum} fazlasiVar={isler.length > DOSYA_OZETI_IS_TAVANI} />;
}

/** Tek bir işin ya da projenin kapaklı kartı. */
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

/** Sadelik varsayılanın kendisi: modül ve araç kartları rafta bekler, isteyen ekler. */
export const SIRKET_VARSAYILAN_PANO: PanoKart[] = [
  { id: "kasa", boyut: "orta" },
  { id: "gorevler", boyut: "kucuk" },
  { id: "pomodoro", boyut: "kucuk" },
  { id: "ofis", boyut: "kucuk" },
  { id: "ekip", boyut: "kucuk" },
  { id: "departmanlar", boyut: "kucuk" },
  { id: "moduller", boyut: "kucuk" },
  { id: "urunler", boyut: "kucuk" },
  { id: "dosyalar", boyut: "kucuk" },
  { id: "akis", boyut: "kucuk" },
];

export const SERBEST_VARSAYILAN_PANO: PanoKart[] = [
  { id: "kasa", boyut: "orta" },
  { id: "gorevler", boyut: "kucuk" },
  { id: "pomodoro", boyut: "kucuk" },
  { id: "isler", boyut: "orta" },
  { id: "ofis", boyut: "kucuk" },
  { id: "moduller", boyut: "kucuk" },
  { id: "dosyalar", boyut: "kucuk" },
];

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
}: {
  organizationId: string;
  access?: OrganizationAccess;
  hiddenTabs?: string[];
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
    const acik = new Set(visibleOrgTabs(access, hiddenTabs).map((s) => s.key));
    const liste: PanoKartTanimi[] = [];
    const ekle = (kosul: boolean, tanim: PanoKartTanimi) => {
      if (kosul) liste.push(tanim);
    };
    ekle(acik.has("budget"), { id: "kasa", ad: t("Kasa"), grup: "temel", Icon: IconWallet, boyut: "orta", hedef: `${kok}?tab=budget`, ciz: (b) => <SirketKasaOzeti organizationId={organizationId} boyut={b} /> });
    ekle(acik.has("tasks"), { id: "gorevler", ad: t("Görevler"), grup: "temel", Icon: IconListCheck, boyut: "kucuk", hedef: `${kok}?tab=tasks`, ciz: () => <GorevlerOzeti organizationId={organizationId} /> });
    ekle(true, { id: "departmanlar", ad: t("Departmanlar"), grup: "temel", Icon: IconBuilding, boyut: "kucuk", hedef: `${kok}?tab=departments`, ciz: () => <DepartmanlarOzeti departmanlar={departmanlarHazir ? departmanlar : null} /> });
    ekle(access?.canViewCommercial !== false, { id: "ekip", ad: t("Ekip"), grup: "temel", Icon: IconUser, boyut: "kucuk", hedef: `${kok}?tab=team`, ciz: () => <EkipOzeti organizationId={organizationId} /> });
    ekle(acik.has("products"), { id: "urunler", ad: t("Ürün/Hizmet"), grup: "temel", Icon: IconStar, boyut: "kucuk", hedef: `${kok}?tab=products`, ciz: () => <UrunlerOzeti organizationId={organizationId} /> });
    ekle(true, { id: "moduller", ad: t("Modüller"), grup: "temel", Icon: IconSparkle, boyut: "kucuk", hedef: `${kok}?tab=modules`, ciz: () => <ModullerOzeti moduller={moduller ?? []} yukleniyor={moduller === null} /> });
    ekle(acik.has("files"), { id: "dosyalar", ad: t("Dosyalar"), grup: "temel", Icon: IconFile, boyut: "kucuk", hedef: `${kok}?tab=files`, ciz: () => <SirketDosyalarOzeti organizationId={organizationId} /> });
    ekle(acik.has("flow"), { id: "akis", ad: t("Sosyal"), grup: "temel", Icon: IconMessageCircle, boyut: "kucuk", hedef: `${kok}?tab=flow`, ciz: () => <AkisOzeti organizationId={organizationId} /> });
    ekle(true, { id: "ofis", ad: t("3D ofis"), grup: "temel", Icon: IconLayers, boyut: "kucuk", tamKaplama: true, hedef: `/yeni?ofis=${encodeURIComponent(organizationId)}`, ciz: () => <OfisOzeti /> });
    ekle(prefs.showLio, { id: "lio", ad: t("Lio Bakiyesi"), grup: "temel", Icon: IconSparkle, boyut: "kucuk", hedef: "/settings/lio-units", ciz: () => <LioOzeti /> });
    liste.push(...aracTanimlari(t, organizationId));
    for (const m of moduller ?? []) {
      const giris = modulKatalogu.find((e) => e.key === m.moduleKey);
      const departmanId = giris ? modulDepartmani(giris, departmanlar) : undefined;
      liste.push({
        id: modulKimligi(m.moduleKey),
        ad: m.moduleName,
        grup: "modul",
        Icon: IconSparkle,
        boyut: "kucuk",
        adGoster: true,
        hizliEylem: modulHizliEylemi(t, m),
        // Modül bir departmana aittir: o kapsamda açılmazsa buraya girilen
        // kayıtlar departman sayfasında görünmez (bkz. lib/modulYeri.ts).
        hedef: departmanId ? `/departments/${departmanId}/modules/${m.moduleKey}` : `${kok}/modules/${m.moduleKey}`,
        ciz: () => <ModulOzeti modul={m} />,
      });
    }
    return liste;
  }, [organizationId, access, hiddenTabs, departmanlar, departmanlarHazir, modulKatalogu, moduller, prefs.showLio, t]);
}

export function useSerbestKatalogu({ isler, projeler }: { isler: Job[]; projeler: Project[] }): PanoKartTanimi[] {
  const t = useT();
  const prefs = useAppPrefs();
  const moduller = useModulIstatistikleri("/me/module-stats");
  return useMemo(() => {
    const liste: PanoKartTanimi[] = [
      { id: "kasa", ad: t("Kasa"), grup: "temel", Icon: IconWallet, boyut: "orta", hedef: "/?tab=budget", turCapasi: "dashboard-tab-budget", ciz: (b) => <KisiselKasaOzeti boyut={b} /> },
      { id: "gorevler", ad: t("Görevler"), grup: "temel", Icon: IconListCheck, boyut: "kucuk", hedef: "/tasks", ciz: () => <KisiselGorevlerOzeti /> },
      { id: "isler", ad: t("İşler"), grup: "temel", Icon: IconBriefcase, boyut: "orta", hedef: "/?tab=jobs", turCapasi: "dashboard-tab-jobs", ciz: (b) => <IslerOzeti isler={isler} boyut={b} /> },
      { id: "dosyalar", ad: t("Dosyalar"), grup: "temel", Icon: IconFile, boyut: "kucuk", hedef: "/?tab=files", turCapasi: "dashboard-tab-files", ciz: () => <KisiselDosyalarOzeti isler={isler} /> },
      { id: "moduller", ad: t("Modüller"), grup: "temel", Icon: IconSparkle, boyut: "kucuk", hedef: "/?tab=modules", turCapasi: "dashboard-tab-modules", ciz: () => <ModullerOzeti moduller={moduller ?? []} yukleniyor={moduller === null} /> },
      { id: "ofis", ad: t("3D stüdyo"), grup: "temel", Icon: IconLayers, boyut: "kucuk", tamKaplama: true, hedef: "/yeni?ofis=studyo", ciz: () => <OfisOzeti /> },
    ];
    if (prefs.showLio) {
      liste.push({ id: "lio", ad: t("Lio Bakiyesi"), grup: "temel", Icon: IconSparkle, boyut: "kucuk", hedef: "/settings/lio-units", ciz: () => <LioOzeti /> });
    }
    liste.push(...aracTanimlari(t, "me"));
    for (const j of isler.slice(0, RAF_TAVANI)) {
      liste.push({
        id: `is:${j.id}`,
        ad: j.title,
        grup: "is",
        Icon: IconBriefcase,
        boyut: "kucuk",
        tamKaplama: true,
        hedef: `/jobs/${j.id}`,
        ciz: () => <KapakliKart ad={j.title} kapak={j.coverImageUrl} tohum={j.id} />,
      });
    }
    for (const p of projeler.slice(0, RAF_TAVANI)) {
      liste.push({
        id: `proje:${p.id}`,
        ad: p.title,
        grup: "proje",
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
        Icon: IconSparkle,
        boyut: "kucuk",
        adGoster: true,
        hizliEylem: modulHizliEylemi(t, m),
        hedef: m.jobId ? `/jobs/${m.jobId}/modules/${m.moduleKey}` : "/?tab=modules",
        ciz: () => <ModulOzeti modul={m} />,
      });
    }
    return liste;
  }, [isler, projeler, moduller, prefs.showLio, t]);
}
