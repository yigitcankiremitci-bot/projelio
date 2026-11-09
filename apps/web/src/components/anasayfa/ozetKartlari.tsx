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
  Product,
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
import { departmanAdi } from "../../lib/departmanAdi";
import { useT } from "../../lib/i18n";
import { bicimDili } from "../../lib/i18n/depo";
import { modulDepartmani } from "../../lib/modulYeri";
import { useRefreshOnUndo } from "../../lib/undo";
import { visibleOrgTabs } from "../OrgTabs";
import {
  IconActivity,
  IconBuilding,
  IconFile,
  IconFolder,
  IconLayers,
  IconListCheck,
  IconMessageCircle,
  IconSparkle,
  IconStar,
  IconUser,
} from "../icons";

/** Panoda çizilebilecek bir kart. Liste kullanıcının yetkisine göre kurulur. */
export interface PanoKartTanimi {
  id: string;
  ad: string;
  grup: "temel" | "modul";
  Icon: typeof IconFolder;
  /** Rafa alınıp geri eklenince başlayacağı boyut. */
  boyut: PanoBoyut;
  /** Karta basınca açılan tam görünüm. */
  hedef: string;
  /** Eğitim turunun işaret ettiği çapa (bkz. lib/tour/tours.ts). */
  turCapasi?: string;
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

interface Satir {
  ad: string;
  sag?: string;
}

/** Kaç satır sığar: küçük kartta yalnızca sayı durur, panoyu sakin tutan da bu. */
const SATIR_SAYISI: Record<PanoBoyut, number> = { kucuk: 0, orta: 3, genis: 5 };

function OzetGovde({
  durum,
  boyut,
  sayi,
  etiket,
  satirlar = [],
  uyari,
}: {
  durum: Durum;
  boyut: PanoBoyut;
  sayi?: string | number;
  etiket?: string;
  satirlar?: Satir[];
  uyari?: string;
}) {
  const c = useThemeColors();
  const t = useT();
  if (durum === "hata") return <span style={{ fontSize: 13, color: c.textSecondary }}>{t("Özet yüklenemedi")}</span>;
  const gorunen = satirlar.slice(0, SATIR_SAYISI[boyut]);
  return (
    <div style={{ display: "flex", gap: 18, alignItems: "flex-end", minWidth: 0 }}>
      <div style={{ flexShrink: 0, maxWidth: "100%" }}>
        <div style={{ fontSize: 26, lineHeight: 1.15, fontWeight: 500, color: c.textPrimary, whiteSpace: "nowrap" }}>
          {durum === "yukleniyor" ? "–" : sayi}
        </div>
        {(etiket || uyari) && (
          <div style={{ fontSize: 13, marginTop: 3, color: uyari ? c.danger : c.textSecondary, whiteSpace: "nowrap" }}>{uyari ?? etiket}</div>
        )}
      </div>
      {gorunen.length > 0 && (
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          {gorunen.map((s, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13 }}>
              <span style={{ color: c.textPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.ad}</span>
              {s.sag && <span style={{ color: c.textSecondary, whiteSpace: "nowrap", flexShrink: 0 }}>{s.sag}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Biçimleme ───────────────────────────────────────────────────────────────

function para(tutar: number, birim = "TRY"): string {
  const sayi = Math.round(tutar).toLocaleString(bicimDili());
  return birim === "TRY" ? `${sayi} ₺` : `${sayi} ${birim}`;
}

function gun(tarih?: string): string | undefined {
  if (!tarih) return undefined;
  const d = new Date(tarih);
  return Number.isNaN(d.getTime()) ? undefined : d.toLocaleDateString(bicimDili(), { day: "numeric", month: "short" });
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

function LioOzeti({ boyut }: { boyut: PanoBoyut }) {
  const t = useT();
  const { veri, durum } = useOzet(() => aiChat.getCredits(), []);
  return <OzetGovde durum={durum} boyut={boyut} sayi={veri ? Math.floor(veri.balance).toLocaleString(bicimDili()) : "–"} etiket={t("birim kaldı")} />;
}

function OfisOzeti({ sirket }: { sirket: boolean }) {
  const c = useThemeColors();
  const t = useT();
  return <span style={{ fontSize: 14, color: c.textSecondary }}>{sirket ? t("Ekibinle 3D ofiste buluş") : t("Stüdyona gir, işlerini gez")}</span>;
}

function ModulOzeti({ modul, boyut }: { modul: ModuleUsageStat; boyut: PanoBoyut }) {
  const t = useT();
  const son = gun(modul.lastActivityAt);
  return (
    <OzetGovde
      durum="hazir"
      boyut={boyut}
      sayi={modul.recordCount}
      etiket={t("kayıt")}
      satirlar={son ? [{ ad: t("Son hareket"), sag: son }] : []}
    />
  );
}

function ModullerOzeti({ moduller, yukleniyor, boyut }: { moduller: ModuleUsageStat[]; yukleniyor: boolean; boyut: PanoBoyut }) {
  const t = useT();
  const sirali = [...moduller].sort((a, b) => b.recordCount - a.recordCount);
  return (
    <OzetGovde
      durum={yukleniyor ? "yukleniyor" : "hazir"}
      boyut={boyut}
      sayi={moduller.length}
      etiket={t("açık modül")}
      satirlar={sirali.map((m) => ({ ad: m.moduleName, sag: String(m.recordCount) }))}
    />
  );
}

// ─── Şirket kartları ─────────────────────────────────────────────────────────

function DepartmanlarOzeti({ departmanlar, boyut }: { departmanlar: Department[] | null; boyut: PanoBoyut }) {
  const t = useT();
  return (
    <OzetGovde
      durum={departmanlar ? "hazir" : "yukleniyor"}
      boyut={boyut}
      sayi={departmanlar?.length}
      etiket={t("departman")}
      satirlar={(departmanlar ?? []).map((d) => ({ ad: departmanAdi(d.name, t) }))}
    />
  );
}

function EkipOzeti({ organizationId, boyut }: { organizationId: string; boyut: PanoBoyut }) {
  const t = useT();
  const { veri, durum } = useOzet<SirketEkibi>(() => iseAlimApi.ekip(organizationId), [organizationId]);
  const bekleyen = veri?.bekleyenDavetler.length ?? 0;
  return (
    <OzetGovde
      durum={durum}
      boyut={boyut}
      sayi={veri?.uyeler.length}
      etiket={bekleyen > 0 ? t("kişi · {adet} davet bekliyor", { adet: bekleyen }) : t("kişi")}
      satirlar={(veri?.uyeler ?? []).map((u) => ({ ad: u.fullName, sag: u.title }))}
    />
  );
}

function UrunlerOzeti({ organizationId, boyut }: { organizationId: string; boyut: PanoBoyut }) {
  const t = useT();
  const { veri, durum } = useOzet(() => api.get<Product[]>(`/organizations/${organizationId}/products`), [organizationId]);
  return <OzetGovde durum={durum} boyut={boyut} sayi={veri?.length} etiket={t("ürün/hizmet")} satirlar={(veri ?? []).map((u) => ({ ad: u.name }))} />;
}

function GorevlerOzeti({ organizationId, boyut }: { organizationId: string; boyut: PanoBoyut }) {
  const t = useT();
  const { veri, durum } = useOzet(() => api.get<Task[]>(`/organizations/${organizationId}/tasks`), [organizationId]);
  const simdi = new Date();
  const acik = (veri ?? []).filter((g) => g.status !== "completed");
  const geciken = acik.filter((g) => gecikmisMi(g.deadline, simdi)).length;
  const yakin = [...acik].filter((g) => g.deadline).sort((a, b) => a.deadline.localeCompare(b.deadline));
  return (
    <OzetGovde
      durum={durum}
      boyut={boyut}
      sayi={acik.length}
      etiket={t("açık görev")}
      uyari={geciken > 0 ? t("{adet} görev gecikti", { adet: geciken }) : undefined}
      satirlar={yakin.map((g) => ({ ad: g.title, sag: gun(g.deadline) }))}
    />
  );
}

function SirketKasaOzeti({ organizationId, boyut }: { organizationId: string; boyut: PanoBoyut }) {
  const t = useT();
  const { veri, durum } = useOzet(() => api.get<ButceSayfasi>(`/budget/scope/organization/${organizationId}`), [organizationId]);
  // Kur dönüşümü YOK (bkz. CLAUDE.md "Bütçe"): tek bir toplam uydurulmaz, ana
  // sayı ₺ bakiyesi, diğer para birimleri kendi satırında durur.
  const tablolar = veri?.tTablolari ?? [];
  const ana = tablolar.find((x) => x.currency === "TRY") ?? tablolar[0];
  const digerleri = tablolar.filter((x) => x !== ana);
  return (
    <OzetGovde
      durum={durum}
      boyut={boyut}
      sayi={para(ana?.bakiye ?? 0, ana?.currency)}
      etiket={t("bakiye")}
      satirlar={
        ana
          ? [
              { ad: t("Gelir"), sag: para(ana.gelirToplam, ana.currency) },
              { ad: t("Gider"), sag: para(ana.giderToplam, ana.currency) },
              ...digerleri.map((x) => ({ ad: x.currency, sag: para(x.bakiye, x.currency) })),
            ]
          : []
      }
    />
  );
}

function SirketDosyalarOzeti({ organizationId, boyut }: { organizationId: string; boyut: PanoBoyut }) {
  const t = useT();
  const { veri, durum } = useOzet(() => filesApi.listByOrganization(organizationId), [organizationId]);
  return <DosyaGovdesi dosyalar={veri} durum={durum} boyut={boyut} etiket={t("dosya")} />;
}

function DosyaGovdesi({ dosyalar, durum, boyut, etiket, fazlasiVar }: { dosyalar?: ProjectFile[]; durum: Durum; boyut: PanoBoyut; etiket: string; fazlasiVar?: boolean }) {
  const sirali = [...(dosyalar ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <OzetGovde
      durum={durum}
      boyut={boyut}
      sayi={dosyalar ? `${dosyalar.length}${fazlasiVar ? "+" : ""}` : undefined}
      etiket={etiket}
      satirlar={sirali.map((f) => ({ ad: f.name, sag: gun(f.createdAt) }))}
    />
  );
}

function AkisOzeti({ organizationId, boyut }: { organizationId: string; boyut: PanoBoyut }) {
  const t = useT();
  const { veri, durum } = useOzet(() => api.get<ProjectPost[]>(`/organizations/${organizationId}/posts`), [organizationId]);
  return (
    <OzetGovde
      durum={durum}
      boyut={boyut}
      sayi={veri?.length}
      etiket={t("paylaşım")}
      satirlar={(veri ?? []).map((p) => ({ ad: p.body || p.authorName, sag: gun(p.createdAt) }))}
    />
  );
}

// ─── Serbest çalışan kartları ────────────────────────────────────────────────

function IslerOzeti({ isler, kullaniciId, boyut }: { isler: Job[]; kullaniciId: string | null; boyut: PanoBoyut }) {
  const t = useT();
  const katildigim = kullaniciId ? isler.filter((j) => j.ownerId !== kullaniciId).length : 0;
  return (
    <OzetGovde
      durum="hazir"
      boyut={boyut}
      sayi={isler.length}
      etiket={katildigim > 0 ? t("iş · {adet} katıldığın", { adet: katildigim }) : t("iş")}
      satirlar={isler.map((j) => ({ ad: j.title, sag: j.projectCount != null ? t("{adet} proje", { adet: j.projectCount }) : undefined }))}
    />
  );
}

function KisiselKasaOzeti({ boyut }: { boyut: PanoBoyut }) {
  const t = useT();
  const { veri, durum } = useOzet(() => api.get<BudgetOverview>("/budget/overview"), []);
  return (
    <OzetGovde
      durum={durum}
      boyut={boyut}
      sayi={para(veri?.netEarned ?? 0)}
      etiket={t("eldeki net")}
      satirlar={
        veri
          ? [
              { ad: t("Tahsil edilen"), sag: para(veri.totalReceived) },
              { ad: t("Gider"), sag: para(veri.totalExpense) },
              { ad: t("Beklenen"), sag: para(veri.totalExpected) },
            ]
          : []
      }
    />
  );
}

/**
 * Bir kart için onlarca iş tek tek sorgulanmasın diye tavan: anasayfa her
 * açılışta yükleniyor, tam liste ise Dosyalar görünümünün işi.
 */
const DOSYA_OZETI_IS_TAVANI = 12;

function KisiselDosyalarOzeti({ isler, boyut }: { isler: Job[]; boyut: PanoBoyut }) {
  const t = useT();
  const taranan = isler.slice(0, DOSYA_OZETI_IS_TAVANI);
  const { veri, durum } = useOzet(
    () =>
      Promise.all(taranan.map((j) => filesApi.listByJob(j.id, { scope: "all" }).catch(() => [] as ProjectFile[]))).then((l) => l.flat()),
    [taranan.map((j) => j.id).join(",")]
  );
  return <DosyaGovdesi dosyalar={veri} durum={durum} boyut={boyut} etiket={t("dosya")} fazlasiVar={isler.length > DOSYA_OZETI_IS_TAVANI} />;
}

// ─── Katalog ─────────────────────────────────────────────────────────────────

function modulKimligi(key: string): string {
  return `modul:${key}`;
}

/** Sadelik varsayılanın kendisi: modül kartları rafta bekler, isteyen ekler. */
export const SIRKET_VARSAYILAN_PANO: PanoKart[] = [
  { id: "gorevler", boyut: "orta" },
  { id: "kasa", boyut: "orta" },
  { id: "departmanlar", boyut: "kucuk" },
  { id: "ekip", boyut: "kucuk" },
  { id: "urunler", boyut: "kucuk" },
  { id: "moduller", boyut: "kucuk" },
  { id: "dosyalar", boyut: "kucuk" },
  { id: "akis", boyut: "kucuk" },
  { id: "ofis", boyut: "kucuk" },
  { id: "lio", boyut: "kucuk" },
];

export const SERBEST_VARSAYILAN_PANO: PanoKart[] = [
  { id: "isler", boyut: "orta" },
  { id: "kasa", boyut: "orta" },
  { id: "dosyalar", boyut: "kucuk" },
  { id: "moduller", boyut: "kucuk" },
  { id: "ofis", boyut: "kucuk" },
  { id: "lio", boyut: "kucuk" },
];

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
    ekle(acik.has("tasks"), { id: "gorevler", ad: t("Görevler"), grup: "temel", Icon: IconListCheck, boyut: "orta", hedef: `${kok}?tab=tasks`, ciz: (b) => <GorevlerOzeti organizationId={organizationId} boyut={b} /> });
    ekle(acik.has("budget"), { id: "kasa", ad: t("Kasa"), grup: "temel", Icon: IconActivity, boyut: "orta", hedef: `${kok}?tab=budget`, ciz: (b) => <SirketKasaOzeti organizationId={organizationId} boyut={b} /> });
    ekle(true, { id: "departmanlar", ad: t("Departmanlar"), grup: "temel", Icon: IconBuilding, boyut: "kucuk", hedef: `${kok}?tab=departments`, ciz: (b) => <DepartmanlarOzeti departmanlar={departmanlarHazir ? departmanlar : null} boyut={b} /> });
    ekle(access?.canViewCommercial !== false, { id: "ekip", ad: t("Ekip"), grup: "temel", Icon: IconUser, boyut: "kucuk", hedef: `${kok}?tab=team`, ciz: (b) => <EkipOzeti organizationId={organizationId} boyut={b} /> });
    ekle(acik.has("products"), { id: "urunler", ad: t("Ürün/Hizmet"), grup: "temel", Icon: IconStar, boyut: "kucuk", hedef: `${kok}?tab=products`, ciz: (b) => <UrunlerOzeti organizationId={organizationId} boyut={b} /> });
    ekle(true, { id: "moduller", ad: t("Modüller"), grup: "temel", Icon: IconSparkle, boyut: "kucuk", hedef: `${kok}?tab=modules`, ciz: (b) => <ModullerOzeti moduller={moduller ?? []} yukleniyor={moduller === null} boyut={b} /> });
    ekle(acik.has("files"), { id: "dosyalar", ad: t("Dosyalar"), grup: "temel", Icon: IconFile, boyut: "kucuk", hedef: `${kok}?tab=files`, ciz: (b) => <SirketDosyalarOzeti organizationId={organizationId} boyut={b} /> });
    ekle(acik.has("flow"), { id: "akis", ad: t("Sosyal"), grup: "temel", Icon: IconMessageCircle, boyut: "kucuk", hedef: `${kok}?tab=flow`, ciz: (b) => <AkisOzeti organizationId={organizationId} boyut={b} /> });
    ekle(true, { id: "ofis", ad: t("3D ofis"), grup: "temel", Icon: IconLayers, boyut: "kucuk", hedef: `/yeni?ofis=${encodeURIComponent(organizationId)}`, ciz: () => <OfisOzeti sirket /> });
    ekle(prefs.showLio, { id: "lio", ad: t("Lio Bakiyesi"), grup: "temel", Icon: IconSparkle, boyut: "kucuk", hedef: "/settings/lio-units", ciz: (b) => <LioOzeti boyut={b} /> });
    for (const m of moduller ?? []) {
      const giris = modulKatalogu.find((e) => e.key === m.moduleKey);
      const departmanId = giris ? modulDepartmani(giris, departmanlar) : undefined;
      liste.push({
        id: modulKimligi(m.moduleKey),
        ad: m.moduleName,
        grup: "modul",
        Icon: IconSparkle,
        boyut: "kucuk",
        // Modül bir departmana aittir: o kapsamda açılmazsa buraya girilen
        // kayıtlar departman sayfasında görünmez (bkz. lib/modulYeri.ts).
        hedef: departmanId ? `/departments/${departmanId}/modules/${m.moduleKey}` : `${kok}/modules/${m.moduleKey}`,
        ciz: (b) => <ModulOzeti modul={m} boyut={b} />,
      });
    }
    return liste;
  }, [organizationId, access, hiddenTabs, departmanlar, departmanlarHazir, modulKatalogu, moduller, prefs.showLio, t]);
}

export function useSerbestKatalogu({ isler, kullaniciId }: { isler: Job[]; kullaniciId: string | null }): PanoKartTanimi[] {
  const t = useT();
  const prefs = useAppPrefs();
  const moduller = useModulIstatistikleri("/me/module-stats");
  return useMemo(() => {
    const liste: PanoKartTanimi[] = [
      { id: "isler", ad: t("İşler"), grup: "temel", Icon: IconFolder, boyut: "orta", hedef: "/?tab=jobs", turCapasi: "dashboard-tab-jobs", ciz: (b) => <IslerOzeti isler={isler} kullaniciId={kullaniciId} boyut={b} /> },
      { id: "kasa", ad: t("Kasa"), grup: "temel", Icon: IconActivity, boyut: "orta", hedef: "/?tab=budget", turCapasi: "dashboard-tab-budget", ciz: (b) => <KisiselKasaOzeti boyut={b} /> },
      { id: "dosyalar", ad: t("Dosyalar"), grup: "temel", Icon: IconFile, boyut: "kucuk", hedef: "/?tab=files", turCapasi: "dashboard-tab-files", ciz: (b) => <KisiselDosyalarOzeti isler={isler} boyut={b} /> },
      { id: "moduller", ad: t("Modüller"), grup: "temel", Icon: IconSparkle, boyut: "kucuk", hedef: "/?tab=modules", turCapasi: "dashboard-tab-modules", ciz: (b) => <ModullerOzeti moduller={moduller ?? []} yukleniyor={moduller === null} boyut={b} /> },
      { id: "ofis", ad: t("3D stüdyo"), grup: "temel", Icon: IconLayers, boyut: "kucuk", hedef: "/yeni?ofis=studyo", ciz: () => <OfisOzeti sirket={false} /> },
    ];
    if (prefs.showLio) {
      liste.push({ id: "lio", ad: t("Lio Bakiyesi"), grup: "temel", Icon: IconSparkle, boyut: "kucuk", hedef: "/settings/lio-units", ciz: (b) => <LioOzeti boyut={b} /> });
    }
    for (const m of moduller ?? []) {
      liste.push({
        id: modulKimligi(m.moduleKey),
        ad: m.moduleName,
        grup: "modul",
        Icon: IconSparkle,
        boyut: "kucuk",
        hedef: m.jobId ? `/jobs/${m.jobId}/modules/${m.moduleKey}` : "/?tab=modules",
        ciz: (b) => <ModulOzeti modul={m} boyut={b} />,
      });
    }
    return liste;
  }, [isler, kullaniciId, moduller, prefs.showLio, t]);
}
