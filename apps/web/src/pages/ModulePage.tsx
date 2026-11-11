import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import type { Department, Job, ModuleAccess, ModuleCatalogEntry, Organization } from "@projelio/shared";
import { api } from "../api/client";
import { useBackTarget } from "../lib/backTarget";
import { gezinti } from "../lib/gezintiGecmisi";
import { useLiveRoom } from "../lib/liveRoom";
import { useThemeColors } from "../theme/useThemeColors";
import ModuleSurface from "../components/ModuleSurface";
import ModuleTeamPanel from "../components/ModuleTeamPanel";
import { CoverBackLink } from "../components/EntityCover";
import AskLioButton from "../components/AskLioButton";
import { useT } from "../lib/i18n";
import { useIsDesktop } from "../lib/useIsDesktop";
import { ModulGeriContext } from "../lib/modulGeri";
import { safeTop, TOP_CHROME, Z } from "../lib/layout";

/**
 * Bir modülün kendi sayfası.
 *
 * Modüller daha önce departman sayfasında akordeon olarak açılıyordu: çalışma
 * alanı departman listesinin arasına sıkışıyor, adresi olmadığı için de
 * paylaşılamıyor ve yenilenince kayboluyordu. Sayfa yüzeyli her modül artık
 * kendi adresinde açılır (bkz. lib/moduleSurfaces.ts); modal yüzeyli olanlar
 * departman sayfasında yerinde açılmaya devam eder.
 */
export default function ModulePage() {
  // Sayfa üç bağlamda açılır: şirkette departman altında, şirkette yöneticide
  // (ilgili departman açılmamışken, bkz. lib/modulYeri.ts) ve serbest
  // çalışanda iş altında. Modülün kendisi hepsinde aynı; değişen yalnızca
  // sahiplik ve "geri" bağlantısı.
  const { departmentId, organizationId: orgParam, jobId, moduleKey } = useParams();
  const c = useThemeColors();
  const masaustu = useIsDesktop();
  const t = useT();

  // Modül sayfası kendi odası: aynı departmanın iki farklı modülünde çalışan iki
  // kişi birbirinin sayfasında sayılmasın (yetki kontrolü kök kapsam üzerinden,
  // bkz. backend realtime.gateway.ts).
  useLiveRoom(
    moduleKey && departmentId
      ? `department:${departmentId}/module/${moduleKey}`
      : moduleKey && jobId
      ? `job:${jobId}/module/${moduleKey}`
      : moduleKey && orgParam
      ? `organization:${orgParam}/module/${moduleKey}`
      : null
  );
  const [department, setDepartment] = useState<Department | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [entry, setEntry] = useState<ModuleCatalogEntry | null>(null);
  const [access, setAccess] = useState<ModuleAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!moduleKey || (!departmentId && !jobId && !orgParam)) return;
    setLoading(true);
    setNotFound(false);

    const catalogPromise = api
      .get<ModuleCatalogEntry[]>(jobId ? "/module-catalog?freelancer=true" : "/module-catalog")
      .catch(() => [] as ModuleCatalogEntry[]);

    const ownerPromise = jobId
      ? api.get<Job>(`/jobs/${jobId}`).then((j) => {
          setJob(j);
          // Serbest çalışanda ayrı bir onay makamı yok: işin sahibi tam yetkili.
          setAccess(null);
        })
      : orgParam
      ? // Yöneticideki modül: departman bağlamı yok. Yetki departmansız
        // çözülür — sahip tam yetkili, diğerleri modüle atanmışsa ya da ilgili
        // departman sonradan açılıp üyesiyse görür.
        Promise.all([
          api.get<Organization>(`/organizations/${orgParam}`).then(setOrganization),
          api
            .get<ModuleAccess>(`/organizations/${orgParam}/module-access?moduleKey=${encodeURIComponent(moduleKey)}`)
            .catch(() => null)
            .then(setAccess),
        ])
      : api.get<Department>(`/departments/${departmentId}`).then(async (dept) => {
          setDepartment(dept);
          const moduleAccess = await api
            .get<ModuleAccess>(
              `/organizations/${dept.organizationId}/module-access?moduleKey=${encodeURIComponent(
                moduleKey
              )}&departmentId=${departmentId}`
            )
            .catch(() => null);
          setAccess(moduleAccess);
        });

    Promise.all([ownerPromise, catalogPromise])
      .then(([, catalog]) => setEntry(catalog.find((e) => e.key === moduleKey) ?? null))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [departmentId, orgParam, jobId, moduleKey]);

  const title = entry?.name ?? t("Modül");
  const parent = jobId
    ? // İşin Modüller sekmesi kalktı: modüller Projeler sekmesinin altında.
      { to: `/jobs/${jobId}`, label: job?.title ?? t("İş") }
    : orgParam
    ? { to: `/organizations/${orgParam}`, label: organization?.name ?? t("Şirket") }
    : { to: `/departments/${departmentId}?tab=modules`, label: department?.name ?? t("Departman") };

  // Geri, GELİNEN yere döner (bkz. lib/backTarget): modüle anasayfadan ya da
  // Modüller sekmesinden girildiyse oraya. Eskiden hep departmanın Modüller
  // sekmesine gidiyordu — kullanıcı hiç görmediği bir sayfaya düşüyordu.
  // Önceki sayfa bilinmiyorsa (doğrudan bağlantı) sabit ebeveyn sürüyor.
  const back = useBackTarget(parent);
  const { key } = useLocation();
  // Geri hapını modül kendi sekmelerinin altına aldıysa burada çizilmez (bkz. lib/modulGeri).
  const [geriUstlenen, setGeriUstlenen] = useState(0);
  const geriBaglami = useMemo(
    () => ({
      hap: <CoverBackLink to={back.to} label={back.label} geriGit={back.geriGit} floating />,
      ustlen: () => {
        setGeriUstlenen((n) => n + 1);
        return () => setGeriUstlenen((n) => n - 1);
      },
    }),
    [back.to, back.label, back.geriGit]
  );
  // Modülün adı geçmişe yazılır: buradan açılan sayfanın geri bağlantısı
  // "← Faturalar" diyebilsin.
  useEffect(() => {
    if (entry?.name) gezinti.adiKaydet(key, entry.name);
  }, [key, entry?.name]);

  if (loading) {
    return <p style={{ padding: 28, fontSize: 14, color: c.textSecondary }}>{t("Yükleniyor…")}</p>;
  }

  if (notFound || !moduleKey || (!department && !job && !organization)) {
    return <p style={{ padding: 28, fontSize: 14, color: c.textSecondary }}>{t("Modül bulunamadı.")}</p>;
  }

  return (
    // Üst boşluk kısa: kabuk zaten sabit üst şerit kadar (HEADER_HEIGHT) yer
    // bırakıyor ve modüllerde kapak yok. 28 px + tek başına satır kaplayan Lio
    // simgesi + başlığın ÜSTÜNDEKİ geri hapı birlikte çalışma alanını ~150 px
    // aşağı itiyordu (kullanıcı geri bildirimi, 2026-10-10).
    <ModulGeriContext.Provider value={geriBaglami}>
    <div style={{ padding: masaustu ? "4px 28px 28px" : "4px 16px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Başlık üst şeritte: logo ile yardım düğmesinin arasında, ortada
          (kullanıcı isteği, 2026-11-11). Önceden şeridin altında kendi
          satırını kaplıyor, modülün listesini aşağı itiyordu. Sabit (fixed)
          değil yapışkan (sticky): yan menü açıkken de İÇERİK sütununun
          ortasında dursun. Negatif üst boşluk onu şeridin içine çeker; maske
          (Z.headerMask) altında kalmasın diye üst süslerle aynı katmanda.
          Kenardaki düğmelerin üstüne binmesin diye genişliği sınırlı. */}
      <div
        style={{
          position: "sticky",
          top: safeTop(TOP_CHROME.top),
          zIndex: Z.topChrome,
          height: TOP_CHROME.size,
          marginTop: TOP_CHROME.top - (HEADER_UST + 4),
          // Sonraki satır şeridin hemen altından başlasın (12 px aralıkla).
          marginBottom: HEADER_UST - TOP_CHROME.top - TOP_CHROME.size - 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          pointerEvents: "none",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: masaustu ? 22 : 19,
            fontWeight: 600,
            color: c.textPrimary,
            maxWidth: masaustu ? "calc(100% - 260px)" : "calc(100% - 200px)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </h1>
        {/* Lio simgesi başlığın yanında; ModuleSurface'e kendi satırını
            çizmemesi söyleniyor (lioBaslikta), yoksa sayfada iki tane olurdu. */}
        <span style={{ pointerEvents: "auto", display: "inline-flex" }}>
          <AskLioButton subject={{ kind: "modul", title }} size={22} />
        </span>
        {/* Katalog açıklaması BİLEREK gösterilmiyor.
            O cümle "bu modülü açarsam ne göreceğim" sorusunu yanıtlamak için
            yazıldı; yeri modül kartı ve "Modül ekle" seçim ekranı. Sayfanın
            içindeyken cevabı zaten ekranda — burada yalnızca yer kaplıyor ve
            modül geliştikçe eskiyor (E-posta modülü kampanya defteriyken
            yazılan cümle, gelen kutusu eklendikten sonra yanlış kaldı).
            Açıklama metni module_catalog.description'da duruyor. */}
      </div>

      {/* Uygulamanın her yerindeki geri hapı (bkz. EntityCover CoverBackLink).
          Sekmeli modüller onu kendi sekmelerinin altına alır (lib/modulGeri). */}
      {geriUstlenen === 0 && <div style={{ alignSelf: "flex-start" }}>{geriBaglami.hap}</div>}

      <ModuleSurface
        moduleKey={moduleKey}
        moduleName={title}
        organizationId={department?.organizationId ?? organization?.id}
        departmentId={departmentId}
        departmentKey={department?.catalogKey}
        jobId={jobId}
        access={access}
        lioBaslikta
      />

      {/* Ekip modülün altında: önce iş, sonra kim çalışıyor. Departman
          sayfasındaki akordeonda ekip panelinin üstte olması çalışma alanını
          aşağı itiyordu. */}
      <div style={{ borderTop: `1px solid ${c.border}`, paddingTop: 16 }}>
        <ModuleTeamPanel
          organizationId={department?.organizationId ?? organization?.id}
          departmentId={departmentId}
          jobId={jobId}
          moduleKey={moduleKey}
          access={access ?? undefined}
        />
      </div>
    </div>
    </ModulGeriContext.Provider>
  );
}

/** Üst şeridin yüksekliği (App.tsx HEADER_HEIGHT ile aynı): içerik bunun altından başlar. */
const HEADER_UST = 76;
